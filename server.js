// server.js - Node.js WebSocket backend for Scrum Poker
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const fetch = global.fetch || ((...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)));
const { createClient } = require('redis');

// Load environment variables (optional in production)
try {
    require('dotenv').config();
} catch (e) {
    // dotenv not installed, use environment variables directly
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS) || 50;
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT) || 24 * 60 * 60 * 1000; // 24 hours

// Jira custom field for Story Points (default Atlassian Cloud is customfield_10016)
const JIRA_STORYPOINT_FIELD = process.env.JIRA_STORYPOINT_FIELD || 'customfield_10016';

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Trust proxy for production deployments
if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

// Security headers for production
if (NODE_ENV === 'production') {
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        next();
    });
}

// -------------------------------
// Session storage (in-memory + optional Redis persistence)
// -------------------------------

class SessionStore {
    constructor(memoryStore = new Map(), redisClient = null, ttlSeconds = 24 * 60 * 60) {
        this.memory = memoryStore;
        this.redis = redisClient;
        this.ttl = ttlSeconds; // expire in Redis after ttlSeconds
    }

    async saveToRedis(key, session) {
        if (!this.redis) return;
        try {
            const serialisable = {
                ...session,
                participants: Array.from(session.participants.entries()),
                votes: Array.from(session.votes.entries())
            };
            await this.redis.set(`session:${key}`, JSON.stringify(serialisable), {
                EX: this.ttl
            });
        } catch (err) {
            console.error('Failed to persist session to Redis:', err);
        }
    }

    async loadFromRedis() {
        if (!this.redis) return;
        try {
            const keys = await this.redis.keys('session:*');
            for (const fullKey of keys) {
                const raw = await this.redis.get(fullKey);
                if (!raw) continue;
                const obj = JSON.parse(raw);
                // Re-hydrate Maps
                obj.participants = new Map(obj.participants);
                obj.votes = new Map(obj.votes);
                this.memory.set(obj.id || fullKey.split(':')[1], obj);
            }
            if (keys.length) {
                console.log(`🔐 Restored ${keys.length} session(s) from Redis`);
            }
        } catch (err) {
            console.error('Failed to load sessions from Redis:', err);
        }
    }

    // Map-like helpers
    set(key, value) {
        const res = this.memory.set(key, value);
        // fire-and-forget
        this.saveToRedis(key, value);
        return res;
    }

    get(key) {
        return this.memory.get(key);
    }

    has(key) {
        return this.memory.has(key);
    }

    delete(key) {
        const res = this.memory.delete(key);
        if (this.redis) {
            this.redis.del(`session:${key}`).catch(err => console.error('Redis delete error', err));
        }
        return res;
    }

    forEach(cb) {
        return this.memory.forEach(cb);
    }

    values() {
        return this.memory.values();
    }

    get size() {
        return this.memory.size;
    }
}

// Instantiate store. In development we only use in-memory, in production we also attach Redis.
const memoryStore = new Map();
const sessions = new SessionStore(memoryStore);

if (process.env.REDIS_URL) {
    const redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', (err) => console.error('Redis client error', err));

    redisClient.connect()
        .then(async () => {
            console.log('🔌 Connected to Redis');
            // Attach to session store and load existing sessions
            sessions.redis = redisClient;
            await sessions.loadFromRedis();
        })
        .catch(err => {
            console.error('Failed to connect to Redis, continuing with in-memory sessions:', err);
        });
} else {
    console.log('💾 REDIS_URL not set – using in-memory session store');
}
// -------------------------------
// End of session storage section
// -------------------------------

// Jira API helper functions
async function makeJiraRequest(config, endpoint, method = 'GET', data = null) {
    // Support both core (api/3) and agile (agile/1.0) endpoints
    // If the caller prefixes the endpoint with "agile/", we will hit the agile API; otherwise, default to the core API.
    console.log('config', config);
    const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');

    // Determine full URL
    const baseUrl = endpoint.startsWith('agile/')
        ? `https://${config.domain}/rest/${endpoint}`               // agile/1.0/...
        : `https://${config.domain}/rest/api/3/${endpoint}`;        // api/3/...

    try {
        console.log('Making Jira request to:', baseUrl);

        const fetchOptions = {
            method,
            headers: {
                'Authorization': `Basic ${auth}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Node.js Jira Client)'
            }
        };

        if (data) {
            fetchOptions.body = JSON.stringify(data);
        }

        const response = await fetch(baseUrl, fetchOptions);

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
            console.error('Jira API Error:', responseData);
            return {
                success: false,
                error: responseData?.errorMessages?.[0] || response.statusText
            };
        }

        return { success: true, data: responseData };
    } catch (error) {
        console.error('Jira API Error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

async function getJiraBoards(config, projectKey = null) {
    // Use the Agile API to list Scrum boards, optionally filtered by project key or id
    const endpointBase = 'agile/1.0/board';
    const endpoint = projectKey ? `${endpointBase}?projectKeyOrId=${encodeURIComponent(projectKey)}` : endpointBase;
    return await makeJiraRequest(config, endpoint);
}

async function getJiraBoardIssues(config, boardId) {
    // Fetch ALL backlog issues for a specific board via the Agile API (handle pagination)
    const base = `agile/1.0/board/${boardId}/backlog`;
    const fields = `key,summary,description,issuetype,priority,status,assignee,${JIRA_STORYPOINT_FIELD}`;

    let startAt = 0;
    const maxResults = 100; // Jira Agile API allows up to 100 per page
    let allIssues = [];
    let isLast = false;

    while (!isLast) {
        const endpoint = `${base}?fields=${fields}&startAt=${startAt}&maxResults=${maxResults}`;
        const pageResult = await makeJiraRequest(config, endpoint);

        if (!pageResult.success) {
            return pageResult; // bubble up the error
        }

        const data = pageResult.data;
        allIssues = allIssues.concat(data.issues || []);

        // Determine if this was the last page
        if (data.isLast || (data.startAt + data.maxResults) >= data.total) {
            isLast = true;
        } else {
            startAt += maxResults;
        }
    }

    return { success: true, data: { issues: allIssues } };
}

async function updateJiraIssueStoryPoints(config, issueKey, storyPoints) {
    const endpoint = `issue/${issueKey}`;
    const data = {
        fields: {
            [JIRA_STORYPOINT_FIELD]: storyPoints
        }
    };
    return await makeJiraRequest(config, endpoint, 'PUT', data);
}

function roundToNearestFibonacci(value) {
    const fibonacci = [0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
    if (typeof value !== 'number' || isNaN(value)) return null;
    
    let closest = fibonacci[0];
    let minDiff = Math.abs(value - closest);
    
    for (let fib of fibonacci) {
        const diff = Math.abs(value - fib);
        if (diff < minDiff) {
            minDiff = diff;
            closest = fib;
        }
    }
    
    return closest;
}

// Utility functions
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function createSession(sessionName, facilitatorName, facilitatorSocketId) {
    const roomCode = generateRoomCode();
    const session = {
        id: roomCode,
        sessionName,
        facilitator: {
            name: facilitatorName,
            socketId: facilitatorSocketId
        },
        currentTicket: '',
        currentJiraIssue: null,
        jiraConfig: null,
        participants: new Map(),
        votes: new Map(),
        votingRevealed: false,
        countdownActive: false,
        countdownTimer: null,
        createdAt: new Date(),
        lastActivity: new Date()
    };
    
    // Add facilitator as first participant
    session.participants.set(facilitatorName, {
        name: facilitatorName,
        socketId: facilitatorSocketId,
        isFacilitator: true,
        isViewer: false,
        joinedAt: new Date()
    });
    
    sessions.set(roomCode, session);
    return session;
}

function getSessionData(session) {
    return {
        id: session.id,
        sessionName: session.sessionName,
        facilitator: session.facilitator.name,
        currentTicket: session.currentTicket,
        currentJiraIssue: session.currentJiraIssue,
        jiraConfig: session.jiraConfig ? {
            domain: session.jiraConfig.domain,
            boardId: session.jiraConfig.boardId,
            hasToken: !!session.jiraConfig.token
        } : null,
        participants: Array.from(session.participants.values()).map(p => ({
            name: p.name,
            isFacilitator: p.isFacilitator,
            isViewer: p.isViewer,
            joinedAt: p.joinedAt,
            hasVoted: session.votes.has(p.name),
            vote: session.votingRevealed ? session.votes.get(p.name) : undefined
        })),
        votingRevealed: session.votingRevealed,
        totalVotes: session.votes.size
    };
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Create new session
    socket.on('create-session', ({ sessionName, facilitatorName }) => {
        try {
            const session = createSession(sessionName, facilitatorName, socket.id);
            socket.join(session.id);
            
            socket.emit('session-created', {
                success: true,
                roomCode: session.id,
                sessionData: getSessionData(session)
            });
            
            console.log(`Session created: ${session.id} by ${facilitatorName}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to create session' });
        }
    });

    // Join existing session
    socket.on('join-session', ({ roomCode, participantName, asViewer = false }) => {
        try {
            const session = sessions.get(roomCode.toUpperCase());
            
            if (!session) {
                socket.emit('join-failed', { message: 'Session not found' });
                return;
            }

            if (session.participants.has(participantName)) {
                socket.emit('join-failed', { message: 'Name already taken in this session' });
                return;
            }

            // Add participant to session
            session.participants.set(participantName, {
                name: participantName,
                socketId: socket.id,
                isFacilitator: false,
                isViewer: asViewer,
                joinedAt: new Date()
            });

            session.lastActivity = new Date();
            socket.join(roomCode.toUpperCase());

            // Notify all participants about new member
            io.to(roomCode.toUpperCase()).emit('participant-joined', {
                participantName,
                sessionData: getSessionData(session)
            });

            socket.emit('join-success', {
                roomCode: roomCode.toUpperCase(),
                sessionData: getSessionData(session)
            });

            console.log(`${participantName} joined session ${roomCode.toUpperCase()}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to join session' });
        }
    });

    // Configure Jira integration
    socket.on('configure-jira', async ({ roomCode, domain, email, token, projectKey = null }) => {
        console.log('configure-jira', roomCode, domain, email, token);
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const facilitator = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!facilitator?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can configure Jira' });
                return;
            }
            console.log('facilitator', facilitator);

            // Test the connection
            const config = { domain, email, token };
            const boardsResult = await getJiraBoards(config, projectKey);
            
            if (!boardsResult.success) {
                socket.emit('jira-config-failed', { 
                    message: `Failed to connect to Jira: ${boardsResult.error}` 
                });
                return;
            }

            session.jiraConfig = { ...config, projectKey };
            session.lastActivity = new Date();

            socket.emit('jira-config-success', {
                boards: boardsResult.data.values || [],
                sessionData: getSessionData(session)
            });

            console.log(`Jira configured for session ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to configure Jira integration' });
        }
    });

    // Get Jira issues from board
    socket.on('get-jira-issues', async ({ roomCode, boardId }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session || !session.jiraConfig) return;

            const facilitator = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!facilitator?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can fetch Jira issues' });
                return;
            }

            session.jiraConfig.boardId = boardId;
            const issuesResult = await getJiraBoardIssues(session.jiraConfig, boardId);
            
            if (!issuesResult.success) {
                socket.emit('jira-issues-failed', { 
                    message: `Failed to fetch issues: ${issuesResult.error}` 
                });
                return;
            }

            const issues = (issuesResult.data.issues || []).map(issue => ({
                key: issue.key,
                summary: issue.fields.summary,
                description: issue.fields.description || '',
                issueType: issue.fields.issuetype?.name || 'Story',
                priority: issue.fields.priority?.name || 'Medium',
                status: issue.fields.status?.name || 'To Do',
                assignee: issue.fields.assignee?.displayName || 'Unassigned',
                currentStoryPoints: issue.fields[JIRA_STORYPOINT_FIELD] || null
            }));

            socket.emit('jira-issues-loaded', { issues });

            console.log(`Loaded ${issues.length} issues from Jira board ${boardId}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to fetch Jira issues' });
        }
    });

    // Set Jira issue for voting
    socket.on('set-jira-issue', ({ roomCode, issue }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const facilitator = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!facilitator?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can set Jira issues' });
                return;
            }

            session.currentJiraIssue = issue;
            session.currentTicket = `${issue.key}: ${issue.summary}`;
            session.votes.clear();
            session.votingRevealed = false;
            session.lastActivity = new Date();

            // Clear countdown if active
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
                session.countdownTimer = null;
                session.countdownActive = false;
            }

            io.to(roomCode).emit('jira-issue-set', {
                issue,
                sessionData: getSessionData(session)
            });

            console.log(`Jira issue ${issue.key} set for voting in session ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to set Jira issue' });
        }
    });

    // Finalize estimation and write back to Jira
    socket.on('finalize-estimation', async ({ roomCode, finalEstimate }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session || !session.currentJiraIssue || !session.jiraConfig) return;

            const facilitator = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!facilitator?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can finalize estimations' });
                return;
            }

            const roundedEstimate = roundToNearestFibonacci(finalEstimate);
            
            const updateResult = await updateJiraIssueStoryPoints(
                session.jiraConfig, 
                session.currentJiraIssue.key, 
                roundedEstimate
            );

            if (!updateResult.success) {
                socket.emit('jira-update-failed', { 
                    message: `Failed to update Jira: ${updateResult.error}` 
                });
                return;
            }

            session.currentJiraIssue.currentStoryPoints = roundedEstimate;
            session.lastActivity = new Date();

            // Store issue key before clearing
            const updatedIssueKey = session.currentJiraIssue.key;

            // Clear current ticket and voting after successful Jira update
            session.currentTicket = '';
            session.currentJiraIssue = null;
            session.votes.clear();
            session.votingRevealed = false;

            io.to(roomCode).emit('jira-updated', {
                issueKey: updatedIssueKey,
                storyPoints: roundedEstimate,
                originalEstimate: finalEstimate,
                sessionData: getSessionData(session)
            });

            console.log(`Updated Jira issue ${updatedIssueKey} with ${roundedEstimate} story points`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to update Jira issue' });
        }
    });

    // Set current ticket (manual entry)
    socket.on('set-ticket', ({ roomCode, ticket }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can set tickets' });
                return;
            }

            session.currentTicket = ticket;
            session.votes.clear();
            session.votingRevealed = false;
            session.lastActivity = new Date();

            // Clear countdown if active
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
                session.countdownTimer = null;
                session.countdownActive = false;
            }

            io.to(roomCode).emit('ticket-set', {
                ticket,
                sessionData: getSessionData(session)
            });

            console.log(`Ticket set in session ${roomCode}: ${ticket.substring(0, 50)}...`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to set ticket' });
        }
    });

    // Submit vote
    socket.on('submit-vote', ({ roomCode, vote }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant) return;

            if (participant.isViewer) {
                socket.emit('error', { message: 'Viewers cannot vote' });
                return;
            }

            if (session.votingRevealed) {
                socket.emit('error', { message: 'Voting is already complete for this round' });
                return;
            }

            session.votes.set(participant.name, vote);
            session.lastActivity = new Date();

            // Notify all participants about vote submission (without revealing the vote)
            io.to(roomCode).emit('vote-submitted', {
                participantName: participant.name,
                sessionData: getSessionData(session)
            });

            console.log(`Vote submitted by ${participant.name} in session ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to submit vote' });
        }
    });

    // Moderate participant - remove or change role
    socket.on('moderate-participant', ({ roomCode, targetName, action }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const moderator = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!moderator?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can moderate participants' });
                return;
            }

            const target = session.participants.get(targetName);
            if (!target) {
                socket.emit('error', { message: 'Participant not found' });
                return;
            }

            if (target.isFacilitator) {
                socket.emit('error', { message: 'Cannot moderate the facilitator' });
                return;
            }

            if (action === 'remove') {
                // Remove participant
                session.participants.delete(targetName);
                session.votes.delete(targetName);
                
                // Disconnect the user
                const targetSocket = io.sockets.sockets.get(target.socketId);
                if (targetSocket) {
                    targetSocket.emit('removed-from-session', { 
                        message: 'You have been removed from the session by the facilitator' 
                    });
                    targetSocket.leave(roomCode);
                }

                io.to(roomCode).emit('participant-removed', {
                    participantName: targetName,
                    sessionData: getSessionData(session)
                });

                console.log(`${targetName} removed from session ${roomCode} by facilitator`);
            } else if (action === 'make-viewer') {
                // Make participant a viewer
                target.isViewer = true;
                session.votes.delete(targetName); // Remove any existing vote
                
                io.to(roomCode).emit('participant-role-changed', {
                    participantName: targetName,
                    newRole: 'viewer',
                    sessionData: getSessionData(session)
                });

                console.log(`${targetName} made viewer in session ${roomCode}`);
            } else if (action === 'make-participant') {
                // Make viewer a participant
                target.isViewer = false;
                
                io.to(roomCode).emit('participant-role-changed', {
                    participantName: targetName,
                    newRole: 'participant',
                    sessionData: getSessionData(session)
                });

                console.log(`${targetName} made participant in session ${roomCode}`);
            }

            session.lastActivity = new Date();
        } catch (error) {
            socket.emit('error', { message: 'Failed to moderate participant' });
        }
    });

    // Facilitator toggles observer/participant status for themselves
    socket.on('set-facilitator-viewer', ({ roomCode, isViewer }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            // Identify facilitator
            const facilitator = session.participants.get(session.facilitator.name);
            if (!facilitator || facilitator.socketId !== socket.id) {
                socket.emit('error', { message: 'Only the facilitator can change their observer status' });
                return;
            }

            facilitator.isViewer = !!isViewer;
            // Remove any existing vote if switching to viewer
            if (facilitator.isViewer) {
                session.votes.delete(facilitator.name);
            }
            session.lastActivity = new Date();

            io.to(roomCode).emit('participant-role-changed', {
                participantName: facilitator.name,
                newRole: facilitator.isViewer ? 'viewer' : 'participant',
                sessionData: getSessionData(session)
            });

            console.log(`Facilitator ${facilitator.name} in session ${roomCode} is now a ${facilitator.isViewer ? 'viewer' : 'participant'}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to update facilitator observer status' });
        }
    });

    // Reveal votes
    socket.on('reveal-votes', ({ roomCode }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can reveal votes' });
                return;
            }

            session.votingRevealed = true;
            session.lastActivity = new Date();

            // Calculate results
            const numericVotes = Array.from(session.votes.values())
                .filter(vote => typeof vote === 'number');
            
            const results = {
                average: numericVotes.length > 0 ? 
                    numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length : 0,
                voteCounts: {},
                totalVotes: session.votes.size
            };

            // Count vote distribution
            session.votes.forEach(vote => {
                results.voteCounts[vote] = (results.voteCounts[vote] || 0) + 1;
            });

            // Find consensus (most common vote)
            results.consensus = Object.keys(results.voteCounts).reduce((a, b) => 
                results.voteCounts[a] > results.voteCounts[b] ? a : b, null
            );

            io.to(roomCode).emit('votes-revealed', {
                sessionData: getSessionData(session),
                results
            });

            console.log(`Votes revealed in session ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to reveal votes' });
        }
    });

    // Reset voting
    socket.on('reset-voting', ({ roomCode }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can reset voting' });
                return;
            }

            session.votes.clear();
            session.votingRevealed = false;
            session.lastActivity = new Date();

            // Clear countdown if active
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
                session.countdownTimer = null;
                session.countdownActive = false;
            }

            io.to(roomCode).emit('voting-reset', {
                sessionData: getSessionData(session)
            });

            console.log(`Voting reset in session ${roomCode}`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to reset voting' });
        }
    });

    // Start countdown
    socket.on('start-countdown', ({ roomCode, duration }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can start countdown' });
                return;
            }

            if (session.votingRevealed) {
                socket.emit('error', { message: 'Voting is already complete' });
                return;
            }

            if (session.countdownActive) {
                socket.emit('error', { message: 'Countdown is already active' });
                return;
            }

            // Clear any existing timer
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
            }

            session.countdownActive = true;
            session.lastActivity = new Date();
            let secondsLeft = duration;

            // Notify all participants that countdown started
            io.to(roomCode).emit('countdown-started', {
                duration: duration
            });

            // Start the countdown timer
            session.countdownTimer = setInterval(() => {
                secondsLeft--;
                
                if (secondsLeft > 0) {
                    // Send tick update
                    io.to(roomCode).emit('countdown-tick', {
                        secondsLeft: secondsLeft,
                        totalDuration: duration
                    });
                } else {
                    // Countdown finished - auto reveal votes
                    clearInterval(session.countdownTimer);
                    session.countdownTimer = null;
                    session.countdownActive = false;
                    session.votingRevealed = true;
                    session.lastActivity = new Date();

                    // Calculate results
                    const numericVotes = Array.from(session.votes.values())
                        .filter(vote => typeof vote === 'number');
                    
                    const results = {
                        average: numericVotes.length > 0 ? 
                            numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length : 0,
                        voteCounts: {},
                        totalVotes: session.votes.size
                    };

                    // Count vote distribution
                    session.votes.forEach(vote => {
                        results.voteCounts[vote] = (results.voteCounts[vote] || 0) + 1;
                    });

                    // Find consensus
                    results.consensus = Object.keys(results.voteCounts).reduce((a, b) => 
                        results.voteCounts[a] > results.voteCounts[b] ? a : b, null
                    );

                    // Notify countdown finished and reveal votes
                    io.to(roomCode).emit('countdown-finished', {
                        sessionData: getSessionData(session)
                    });

                    io.to(roomCode).emit('votes-revealed', {
                        sessionData: getSessionData(session),
                        results
                    });

                    console.log(`Countdown finished and votes auto-revealed in session ${roomCode}`);
                }
            }, 1000);

            console.log(`Countdown started in session ${roomCode} for ${duration} seconds`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to start countdown' });
        }
    });

    // End session
    socket.on('end-session', ({ roomCode }) => {
        try {
            const session = sessions.get(roomCode);
            if (!session) return;

            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (!participant?.isFacilitator) {
                socket.emit('error', { message: 'Only facilitator can end session' });
                return;
            }

            // Clear countdown timer if active
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
            }

            io.to(roomCode).emit('session-ended', {
                message: 'Session has been ended by the facilitator'
            });

            // Remove all sockets from room
            const room = io.sockets.adapter.rooms.get(roomCode);
            if (room) {
                room.forEach(socketId => {
                    const clientSocket = io.sockets.sockets.get(socketId);
                    if (clientSocket) {
                        clientSocket.leave(roomCode);
                    }
                });
            }

            sessions.delete(roomCode);
            console.log(`Session ${roomCode} ended by facilitator`);
        } catch (error) {
            socket.emit('error', { message: 'Failed to end session' });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        
        // Find and remove participant from any session
        sessions.forEach((session, roomCode) => {
            const participant = Array.from(session.participants.values())
                .find(p => p.socketId === socket.id);
            
            if (participant) {
                session.participants.delete(participant.name);
                session.votes.delete(participant.name);
                
                // If facilitator disconnects, end the session
                if (participant.isFacilitator) {
                    // Clear countdown timer if active
                    if (session.countdownTimer) {
                        clearInterval(session.countdownTimer);
                    }
                    
                    io.to(roomCode).emit('session-ended', {
                        message: 'Session ended - facilitator disconnected'
                    });
                    sessions.delete(roomCode);
                } else {
                    // Notify remaining participants
                    io.to(roomCode).emit('participant-left', {
                        participantName: participant.name,
                        sessionData: getSessionData(session)
                    });
                }
                
                console.log(`${participant.name} left session ${roomCode}`);
            }
        });
    });
});

// API endpoints for session management
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        sessions: sessions.size,
        uptime: process.uptime(),
        environment: NODE_ENV,
        version: '1.0.0'
    });
});

app.get('/api/stats', (req, res) => {
    const stats = {
        totalSessions: sessions.size,
        activeSessions: Array.from(sessions.values()).filter(s => 
            Date.now() - s.lastActivity < 60000 // Active in last minute
        ).length,
        environment: NODE_ENV,
        uptime: process.uptime()
    };
    res.json(stats);
});

app.get('/api/session/:roomCode', (req, res) => {
    const session = sessions.get(req.params.roomCode.toUpperCase());
    if (!session) {
        return res.status(404).json({ error: 'Session not found' });
    }
    res.json(getSessionData(session));
});

// Serve the frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Clean up old sessions (run every hour)
setInterval(() => {
    const now = new Date();
    let cleaned = 0;
    
    sessions.forEach((session, roomCode) => {
        if (now - session.lastActivity > SESSION_TIMEOUT) {
            // Clear countdown timer if active
            if (session.countdownTimer) {
                clearInterval(session.countdownTimer);
            }
            sessions.delete(roomCode);
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} inactive sessions`);
    }
    
    // Log session stats in production
    if (NODE_ENV === 'production' && sessions.size > 0) {
        console.log(`📊 Active sessions: ${sessions.size}/${MAX_SESSIONS}`);
    }
}, 60 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully');
    
    // Notify all connected clients
    io.emit('server-shutdown', { 
        message: 'Server is shutting down for maintenance. Please reconnect in a few minutes.' 
    });
    
    server.close(() => {
        console.log('✅ Process terminated');
        process.exit(0);
    });
});

server.listen(PORT, () => {
    console.log(`🃏 Scrum Poker Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    console.log(`📱 Frontend: http://localhost:${PORT}`);
    console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
    console.log(`📊 Stats: http://localhost:${PORT}/api/stats`);
    
    if (NODE_ENV === 'production') {
        console.log(`🚀 Production deployment ready!`);
        console.log(`📊 Max sessions: ${MAX_SESSIONS}`);
        console.log(`⏰ Session timeout: ${SESSION_TIMEOUT / 1000 / 60} minutes`);
    }
});

module.exports = app;
