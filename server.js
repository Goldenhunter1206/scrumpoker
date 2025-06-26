// server.js - Node.js WebSocket backend for Scrum Poker
const express = require(‘express’);
const http = require(‘http’);
const socketIo = require(‘socket.io’);
const path = require(‘path’);
const cors = require(‘cors’);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
cors: {
origin: “*”,
methods: [“GET”, “POST”]
}
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(‘public’));

// In-memory storage for sessions (in production, use Redis or a database)
const sessions = new Map();

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
currentTicket: ‘’,
participants: new Map(),
votes: new Map(),
votingRevealed: false,
createdAt: new Date(),
lastActivity: new Date()
};

```
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
```

}

function getSessionData(session) {
return {
id: session.id,
sessionName: session.sessionName,
facilitator: session.facilitator.name,
currentTicket: session.currentTicket,
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
io.on(‘connection’, (socket) => {
console.log(`User connected: ${socket.id}`);

```
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

// Set current ticket
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

        io.to(roomCode).emit('voting-reset', {
            sessionData: getSessionData(session)
        });

        console.log(`Voting reset in session ${roomCode}`);
    } catch (error) {
        socket.emit('error', { message: 'Failed to reset voting' });
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
```

});

// API endpoints for session management
app.get(’/api/health’, (req, res) => {
res.json({ status: ‘ok’, sessions: sessions.size });
});

app.get(’/api/session/:roomCode’, (req, res) => {
const session = sessions.get(req.params.roomCode.toUpperCase());
if (!session) {
return res.status(404).json({ error: ‘Session not found’ });
}
res.json(getSessionData(session));
});

// Serve the frontend
app.get(’/’, (req, res) => {
res.sendFile(path.join(__dirname, ‘public’, ‘index.html’));
});

// Clean up old sessions (run every hour)
setInterval(() => {
const now = new Date();
const maxAge = 24 * 60 * 60 * 1000; // 24 hours

```
sessions.forEach((session, roomCode) => {
    if (now - session.lastActivity > maxAge) {
        sessions.delete(roomCode);
        console.log(`Cleaned up inactive session: ${roomCode}`);
    }
});
```

}, 60 * 60 * 1000);

server.listen(PORT, () => {
console.log(`🃏 Scrum Poker Server running on port ${PORT}`);
console.log(`📱 Frontend: http://localhost:${PORT}`);
console.log(`🔧 Health check: http://localhost:${PORT}/api/health`);
});

module.exports = app;
