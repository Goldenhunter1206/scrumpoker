import { Socket, Server as SocketIOServer } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  Vote,
  VotingResults,
  JiraIssue,
  ChatMessage,
} from '@shared/types/index.js';
import {
  getJiraBoards,
  getJiraBoardIssues,
  updateJiraIssueStoryPoints,
  roundToNearestFibonacci,
  getJiraIssueDetails,
} from './utils/jiraApi.js';
import { getSessionData, recordHistory } from './utils/sessionHelpers.js';
import {
  validateSocketEvent,
  sanitizeString,
  socketEventRateLimiters,
} from './middleware/validation.js';
import { invalidateParticipantTokens, invalidateRoomTokens } from './utils/sessionTokens.js';

// Internal session interface (matches the one in index.ts)
interface InternalSessionData {
  id: string;
  sessionName: string;
  facilitator: {
    name: string;
    socketId: string;
  };
  currentTicket: string;
  currentJiraIssue: JiraIssue | null;
  jiraConfig: any;
  participants: Map<string, any>;
  votes: Map<string, Vote>;
  votingRevealed: boolean;
  totalVotes: number;
  countdownActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  discussionStartTime: Date | null;
  discussionTimer: NodeJS.Timeout | null;
  createdAt: Date;
  lastActivity: Date;
  history: any[];
  aggregate: any;
  chatMessages: ChatMessage[];
  typingUsers: Map<string, NodeJS.Timeout>;
  // Performance optimization: maintain socket-to-participant lookup
  socketToParticipant: Map<string, string>;
  participantToSocket: Map<string, string>;
}

// Create validation wrapper that has access to socket
function createValidationWrapper(socket: Socket<ClientToServerEvents, ServerToClientEvents>) {
  return function withValidation<T>(eventName: string, handler: (data: T) => void | Promise<void>) {
    return async (data: any) => {
      try {
        const validator = validateSocketEvent<T>(eventName as any);
        const validatedData = validator(data);
        await handler(validatedData);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Validation error';
        console.warn(`Validation failed for ${eventName}:`, errorMessage);
        // Don't expose validation details to client for security
        socket.emit('error', { message: 'Invalid request data' });
      }
    };
  };
}

// Helper function to get participant by socket ID efficiently
function getParticipantBySocketId(session: InternalSessionData, socketId: string): any | null {
  const participantName = session.socketToParticipant.get(socketId);
  return participantName ? session.participants.get(participantName) : null;
}

// Start discussion timer to broadcast duration every second
function startDiscussionTimer(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  // Clear any existing discussion timer
  if (session.discussionTimer) {
    clearInterval(session.discussionTimer);
  }

  session.discussionStartTime = new Date();

  // Start broadcasting discussion duration every second
  session.discussionTimer = setInterval(() => {
    if (!session.discussionStartTime) {
      // Discussion ended, clear timer
      clearInterval(session.discussionTimer!);
      session.discussionTimer = null;
      return;
    }

    const discussionDuration = Math.floor(
      (new Date().getTime() - session.discussionStartTime.getTime()) / 1000
    );

    io.to(roomCode).emit('discussion-timer-tick', {
      discussionDuration: discussionDuration,
    });
  }, 1000);
}

// Stop discussion timer
function stopDiscussionTimer(
  session: InternalSessionData,
  roomCode: string,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>
) {
  if (session.discussionTimer) {
    clearInterval(session.discussionTimer);
    session.discussionTimer = null;

    // Send final duration update
    if (session.discussionStartTime) {
      const finalDuration = Math.floor(
        (new Date().getTime() - session.discussionStartTime.getTime()) / 1000
      );
      io.to(roomCode).emit('discussion-timer-tick', {
        discussionDuration: finalDuration,
      });
    }
  }
  // Don't reset discussionStartTime here - keep it until next ticket is set
}

export function setupSocketHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>,
  memoryStore: Map<string, InternalSessionData>
) {
  const withValidation = createValidationWrapper(socket);

  // Configure Jira integration
  socket.on(
    'configure-jira',
    withValidation(
      'configure-jira',
      async ({ roomCode, domain, email, token, projectKey }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session) return;

        const facilitator = getParticipantBySocketId(session, socket.id);

        if (!facilitator?.isFacilitator) {
          socket.emit('error', { message: 'Only facilitator can configure Jira' });
          return;
        }

        // Sanitize inputs
        const sanitizedDomain = sanitizeString(domain);
        const sanitizedEmail = sanitizeString(email);

        const config = { domain: sanitizedDomain, email: sanitizedEmail, token, hasToken: true };
        const boardsResult = await getJiraBoards(config, projectKey || undefined);

        if (!boardsResult.success) {
          socket.emit('jira-config-failed', {
            message: 'Failed to connect to Jira. Please check your credentials.',
          });
          return;
        }

        session.jiraConfig = {
          ...config,
          projectKey: projectKey ? sanitizeString(projectKey) : undefined,
        };
        session.lastActivity = new Date();

        socket.emit('jira-config-success', {
          boards: boardsResult.data?.values || [],
          sessionData: getSessionData(session),
        });

        console.log(`Jira configured for session ${roomCode}`);
      }
    )
  );

  // Get Jira issues from board
  socket.on('get-jira-issues', async ({ roomCode, boardId }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);

      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can fetch Jira issues' });
        return;
      }

      session.jiraConfig.boardId = boardId;
      const issuesResult = await getJiraBoardIssues(session.jiraConfig, boardId);

      if (!issuesResult.success) {
        console.error('Failed to fetch Jira issues', issuesResult.error);
        socket.emit('jira-issues-failed', {
          message: `Failed to fetch issues: ${issuesResult.error}`,
        });
        return;
      }

      socket.emit('jira-issues-loaded', { issues: issuesResult.data?.issues || [] });
      console.log(
        `Loaded ${issuesResult.data?.issues?.length || 0} issues from Jira board ${boardId}`
      );
    } catch (error) {
      console.error('Failed to fetch Jira issues', error);
      socket.emit('error', { message: 'Failed to fetch Jira issues' });
    }
  });

  // Get detailed Jira issue information for split-screen view
  socket.on('get-jira-issue-details', async data => {
    console.log('🔥 SERVER: get-jira-issue-details event received!', data);

    const { roomCode, issueKey } = data || {};
    console.log(`Received get-jira-issue-details request for ${issueKey} in room ${roomCode}`);

    try {
      const session = memoryStore.get(roomCode);
      if (!session) {
        console.log('Session not found:', roomCode);
        socket.emit('jira-issue-details-failed', { message: 'Session not found' });
        return;
      }

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant) {
        console.log('Participant not found for socket:', socket.id);
        socket.emit('jira-issue-details-failed', { message: 'Participant not found' });
        return;
      }

      if (!session.jiraConfig) {
        console.log('Jira not configured for session:', roomCode);
        socket.emit('jira-issue-details-failed', {
          message: 'Jira not configured for this session',
        });
        return;
      }

      const config = {
        ...session.jiraConfig,
        email: session.jiraConfig.email,
        token: session.jiraConfig.token,
      };

      console.log('Making Jira API call for issue:', issueKey);
      const result = await getJiraIssueDetails(config, issueKey);
      console.log('Jira API result:', result.success ? 'Success' : 'Failed', result.error);

      if (result.success) {
        console.log('Sending jira-issue-details-loaded event');
        socket.emit('jira-issue-details-loaded', {
          issueDetails: result.data,
        });
      } else {
        console.log('Sending jira-issue-details-failed event:', result.error);
        socket.emit('jira-issue-details-failed', {
          message: result.error || 'Failed to fetch issue details',
        });
      }
    } catch (error) {
      console.error('Failed to fetch Jira issue details', error);
      socket.emit('jira-issue-details-failed', { message: 'Server error occurred' });
    }
  });

  // Set Jira issue for voting
  socket.on('set-jira-issue', ({ roomCode, issue }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const facilitator = getParticipantBySocketId(session, socket.id);

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

      // Start discussion timer for the new issue
      startDiscussionTimer(session, roomCode, io);

      io.to(roomCode).emit('jira-issue-set', {
        issue,
        sessionData: getSessionData(session),
      });

      console.log(`Jira issue ${issue.key} set for voting in session ${roomCode}`);
    } catch (error) {
      console.error('Failed to set Jira issue', error);
      socket.emit('error', { message: 'Failed to set Jira issue' });
    }
  });

  // Finalize estimation and write back to Jira
  socket.on('finalize-estimation', async ({ roomCode, finalEstimate }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session || !session.currentJiraIssue || !session.jiraConfig) return;

      const facilitator = getParticipantBySocketId(session, socket.id);

      if (!facilitator?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can finalize estimations' });
        return;
      }

      const roundedEstimate = roundToNearestFibonacci(finalEstimate);
      if (roundedEstimate === null) {
        socket.emit('jira-update-failed', { message: 'Invalid estimate value' });
        return;
      }

      const updateResult = await updateJiraIssueStoryPoints(
        session.jiraConfig,
        session.currentJiraIssue.key,
        roundedEstimate
      );

      if (!updateResult.success) {
        socket.emit('jira-update-failed', {
          message: `Failed to update Jira: ${updateResult.error}`,
        });
        return;
      }

      session.currentJiraIssue.currentStoryPoints = roundedEstimate;
      session.lastActivity = new Date();

      const updatedIssueKey = session.currentJiraIssue.key;

      // Store completed estimation in session history
      recordHistory(session, {
        issueKey: updatedIssueKey,
        summary: session.currentJiraIssue.summary,
        storyPoints: roundedEstimate,
        originalEstimate: finalEstimate,
      });

      // Clear current ticket and voting after successful Jira update
      session.currentTicket = '';
      session.currentJiraIssue = null;
      session.votes.clear();
      session.votingRevealed = false;

      io.to(roomCode).emit('jira-updated', {
        issueKey: updatedIssueKey,
        storyPoints: roundedEstimate,
        originalEstimate: finalEstimate,
        sessionData: getSessionData(session),
      });

      console.log(`Updated Jira issue ${updatedIssueKey} with ${roundedEstimate} story points`);
    } catch (error) {
      console.error('Failed to update Jira issue', error);
      socket.emit('error', { message: 'Failed to update Jira issue' });
    }
  });

  // Set current ticket (manual entry)
  socket.on('set-ticket', ({ roomCode, ticket }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can set tickets' });
        return;
      }

      session.currentTicket = ticket;
      session.currentJiraIssue = null;
      session.votes.clear();
      session.votingRevealed = false;
      session.lastActivity = new Date();

      if (session.countdownTimer) {
        clearInterval(session.countdownTimer);
        session.countdownTimer = null;
        session.countdownActive = false;
      }

      // Start discussion timer for the new ticket
      startDiscussionTimer(session, roomCode, io);

      io.to(roomCode).emit('ticket-set', {
        ticket,
        sessionData: getSessionData(session),
      });

      console.log(`Ticket set in session ${roomCode}: ${ticket.substring(0, 50)}...`);
    } catch (error) {
      console.error('Failed to set ticket', error);
      socket.emit('error', { message: 'Failed to set ticket' });
    }
  });

  // Submit vote
  socket.on('submit-vote', ({ roomCode, vote }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

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
      participant.hasVoted = true;
      session.lastActivity = new Date();

      io.to(roomCode).emit('vote-submitted', {
        participantName: participant.name,
        sessionData: getSessionData(session),
      });

      console.log(`Vote submitted by ${participant.name} in session ${roomCode}`);

      // Check if all eligible voters have voted
      if (session.countdownActive) {
        const eligibleVoters = Array.from(session.participants.values()).filter(
          p => !p.isViewer && p.socketId
        );

        if (session.votes.size >= eligibleVoters.length && eligibleVoters.length > 0) {
          if (session.countdownTimer) {
            clearInterval(session.countdownTimer);
            session.countdownTimer = null;
          }
          session.countdownActive = false;
          session.votingRevealed = true;
          session.lastActivity = new Date();

          // Stop discussion timer when votes are automatically revealed
          stopDiscussionTimer(session, roomCode, io);

          const results = calculateVotingResults(session.votes);

          if (session.currentJiraIssue) {
            recordHistory(session, {
              issueKey: session.currentJiraIssue.key,
              summary: session.currentJiraIssue.summary,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          } else if (session.currentTicket) {
            recordHistory(session, {
              ticket: session.currentTicket,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          }

          io.to(roomCode).emit('countdown-finished', {
            sessionData: getSessionData(session),
          });

          io.to(roomCode).emit('votes-revealed', {
            sessionData: getSessionData(session),
            results,
          });

          console.log(`Countdown finished early and votes auto-revealed in session ${roomCode}`);
        }
      }
    } catch (error) {
      console.error('Failed to submit vote', error);
      socket.emit('error', { message: 'Failed to submit vote' });
    }
  });

  // Reveal votes
  socket.on('reveal-votes', ({ roomCode }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reveal votes' });
        return;
      }

      session.votingRevealed = true;
      session.lastActivity = new Date();

      // Stop discussion timer when votes are revealed
      stopDiscussionTimer(session, roomCode, io);

      const results = calculateVotingResults(session.votes);

      // Record history
      if (session.currentJiraIssue) {
        recordHistory(session, {
          issueKey: session.currentJiraIssue.key,
          summary: session.currentJiraIssue.summary,
          votes: Object.fromEntries(session.votes),
          stats: {
            consensus: results.consensus,
            average: results.average,
            min: results.min,
            max: results.max,
          },
        });
      } else if (session.currentTicket) {
        recordHistory(session, {
          ticket: session.currentTicket,
          votes: Object.fromEntries(session.votes),
          stats: {
            consensus: results.consensus,
            average: results.average,
            min: results.min,
            max: results.max,
          },
        });
      }

      io.to(roomCode).emit('votes-revealed', {
        sessionData: getSessionData(session),
        results,
      });

      console.log(`Votes revealed in session ${roomCode}`);
    } catch (error) {
      console.error('Failed to reveal votes', error);
      socket.emit('error', { message: 'Failed to reveal votes' });
    }
  });

  // Reset voting
  socket.on('reset-voting', ({ roomCode }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can reset voting' });
        return;
      }

      session.votes.clear();
      session.votingRevealed = false;
      session.lastActivity = new Date();

      // Reset hasVoted for all participants
      session.participants.forEach(p => (p.hasVoted = false));

      if (session.countdownTimer) {
        clearInterval(session.countdownTimer);
        session.countdownTimer = null;
        session.countdownActive = false;
      }

      io.to(roomCode).emit('voting-reset', {
        sessionData: getSessionData(session),
      });

      console.log(`Voting reset in session ${roomCode}`);
    } catch (error) {
      console.error('Failed to reset voting', error);
      socket.emit('error', { message: 'Failed to reset voting' });
    }
  });

  // Facilitator toggles their own viewer / participant role
  socket.on('set-facilitator-viewer', ({ roomCode, isViewer }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      // Find the facilitator by socket id
      const facilitatorEntry = getParticipantBySocketId(session, socket.id);
      if (facilitatorEntry && !facilitatorEntry.isFacilitator) {
        socket.emit('error', { message: 'Only the facilitator can change their viewer status' });
        return;
      }

      if (!facilitatorEntry) {
        socket.emit('error', { message: 'Only the facilitator can change their viewer status' });
        return;
      }

      // Update role
      facilitatorEntry.isViewer = isViewer;
      session.lastActivity = new Date();

      // Broadcast role change to everyone in the room
      io.to(roomCode).emit('participant-role-changed', {
        participantName: facilitatorEntry.name,
        newRole: isViewer ? 'viewer' : 'participant',
        sessionData: getSessionData(session),
      });

      console.log(
        `Facilitator ${facilitatorEntry.name} is now a ${isViewer ? 'viewer' : 'participant'} in session ${roomCode}`
      );
    } catch (error) {
      console.error('Failed to change viewer status', error);
      socket.emit('error', { message: 'Failed to change viewer status' });
    }
  });

  // NEW: Facilitator moderates a participant (make viewer/participant or remove)
  socket.on('moderate-participant', ({ roomCode, targetName, action }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      // Ensure that the requesting socket is the facilitator
      const facilitatorEntry = getParticipantBySocketId(session, socket.id);

      if (!facilitatorEntry?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can moderate participants' });
        return;
      }

      const target = session.participants.get(targetName);
      if (!target) {
        socket.emit('error', { message: 'Participant not found' });
        return;
      }

      switch (action) {
        case 'make-viewer':
          target.isViewer = true;
          // Remove any existing vote so counts stay correct
          session.votes.delete(targetName);
          io.to(roomCode).emit('participant-role-changed', {
            participantName: targetName,
            newRole: 'viewer',
            sessionData: getSessionData(session),
          });
          break;

        case 'make-participant':
          target.isViewer = false;
          io.to(roomCode).emit('participant-role-changed', {
            participantName: targetName,
            newRole: 'participant',
            sessionData: getSessionData(session),
          });
          break;

        case 'make-facilitator':
          // Prevent self-promotion
          if (targetName === facilitatorEntry.name) {
            socket.emit('error', { message: 'You are already the facilitator' });
            return;
          }

          // Transfer facilitator role
          facilitatorEntry.isFacilitator = false;
          target.isFacilitator = true;
          target.isViewer = false; // New facilitator should be able to vote by default

          // Update session facilitator info
          session.facilitator.name = targetName;
          session.facilitator.socketId = target.socketId || '';

          io.to(roomCode).emit('facilitator-changed', {
            oldFacilitatorName: facilitatorEntry.name,
            newFacilitatorName: targetName,
            sessionData: getSessionData(session),
          });
          break;

        case 'remove':
          session.participants.delete(targetName);
          session.votes.delete(targetName);

          // Invalidate all session tokens for this participant
          invalidateParticipantTokens(targetName, roomCode);

          io.to(roomCode).emit('participant-removed', {
            participantName: targetName,
            sessionData: getSessionData(session),
          });

          // Inform the removed participant if still connected and kick them from the room
          if (target.socketId) {
            const targetSocket = io.sockets.sockets.get(target.socketId);
            if (targetSocket) {
              targetSocket.emit('removed-from-session', {
                message: 'You have been removed from the session by the facilitator',
              });
              targetSocket.leave(roomCode);
            }
          }
          break;

        default:
          socket.emit('error', { message: 'Unknown moderation action' });
          return;
      }

      session.lastActivity = new Date();
    } catch (error) {
      console.error('Failed to moderate participant', error);
      socket.emit('error', { message: 'Failed to moderate participant' });
    }
  });

  // Start countdown
  socket.on('start-countdown', ({ roomCode, duration }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

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

      if (session.countdownTimer) {
        clearInterval(session.countdownTimer);
      }

      session.countdownActive = true;
      session.lastActivity = new Date();
      let secondsLeft = duration;

      io.to(roomCode).emit('countdown-started', { duration });

      session.countdownTimer = setInterval(() => {
        secondsLeft--;

        if (secondsLeft > 0) {
          io.to(roomCode).emit('countdown-tick', {
            secondsLeft,
            totalDuration: duration,
          });
        } else {
          clearInterval(session.countdownTimer!);
          session.countdownTimer = null;
          session.countdownActive = false;
          session.votingRevealed = true;
          session.lastActivity = new Date();

          // Stop discussion timer when countdown expires and votes are automatically revealed
          stopDiscussionTimer(session, roomCode, io);

          const results = calculateVotingResults(session.votes);

          // Record history
          if (session.currentJiraIssue) {
            recordHistory(session, {
              issueKey: session.currentJiraIssue.key,
              summary: session.currentJiraIssue.summary,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          } else if (session.currentTicket) {
            recordHistory(session, {
              ticket: session.currentTicket,
              votes: Object.fromEntries(session.votes),
              stats: {
                consensus: results.consensus,
                average: results.average,
                min: results.min,
                max: results.max,
              },
            });
          }

          io.to(roomCode).emit('countdown-finished', {
            sessionData: getSessionData(session),
          });

          io.to(roomCode).emit('votes-revealed', {
            sessionData: getSessionData(session),
            results,
          });

          console.log(`Countdown finished and votes auto-revealed in session ${roomCode}`);
        }
      }, 1000);

      console.log(`Countdown started in session ${roomCode} for ${duration} seconds`);
    } catch (error) {
      console.error('Failed to start countdown', error);
      socket.emit('error', { message: 'Failed to start countdown' });
    }
  });

  // End session
  socket.on('end-session', ({ roomCode }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);

      if (!participant?.isFacilitator) {
        socket.emit('error', { message: 'Only facilitator can end session' });
        return;
      }

      if (session.countdownTimer) {
        clearInterval(session.countdownTimer);
      }

      // Stop discussion timer when session ends
      stopDiscussionTimer(session, roomCode, io);

      io.to(roomCode).emit('session-ended', {
        message: 'Session has been ended by the facilitator',
      });

      const room = io.sockets.adapter.rooms.get(roomCode);
      if (room) {
        room.forEach(socketId => {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (clientSocket) {
            clientSocket.leave(roomCode);
          }
        });
      }

      // Invalidate all session tokens for this room
      invalidateRoomTokens(roomCode);

      memoryStore.delete(roomCode);
      console.log(`Session ${roomCode} ended by facilitator`);
    } catch (error) {
      console.error('Failed to end session', error);
      socket.emit('error', { message: 'Failed to end session' });
    }
  });

  // Chat message
  socket.on(
    'send-chat-message',
    socketEventRateLimiters.chatMessages(
      socket,
      withValidation('send-chat-message', ({ roomCode, message }: any) => {
        const session = memoryStore.get(roomCode);
        if (!session) return;

        const participant = getParticipantBySocketId(session, socket.id);

        if (!participant) return;

        // Sanitize message content
        const sanitizedMessage = sanitizeString(message);

        const chatMessage: ChatMessage = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          author: participant.name,
          content: sanitizedMessage,
          timestamp: new Date(),
          type: 'message',
        };

        session.chatMessages.push(chatMessage);
        session.lastActivity = new Date();

        // Limit chat history to prevent memory issues
        if (session.chatMessages.length > 100) {
          session.chatMessages = session.chatMessages.slice(-100);
        }

        // Broadcast to all participants in the session
        io.to(roomCode).emit('chatMessage', chatMessage);
      })
    )
  );

  // Typing indicator
  socket.on('typing-indicator', ({ roomCode, userName, isTyping }) => {
    try {
      const session = memoryStore.get(roomCode);
      if (!session) return;

      const participant = getParticipantBySocketId(session, socket.id);
      if (!participant || participant.name !== userName) return;

      // Clear existing timeout for this user
      const existingTimeout = session.typingUsers.get(userName);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        session.typingUsers.delete(userName);
      }

      if (isTyping) {
        // Set user as typing with auto-clear timeout
        const timeout = setTimeout(() => {
          session.typingUsers.delete(userName);
          const typingUsersList = Array.from(session.typingUsers.keys());
          io.to(roomCode).emit('typingUpdate', typingUsersList);
        }, 5000); // Auto-clear after 5 seconds

        session.typingUsers.set(userName, timeout);
      }

      // Broadcast current typing users
      const typingUsersList = Array.from(session.typingUsers.keys());
      io.to(roomCode).emit('typingUpdate', typingUsersList);
    } catch (error) {
      console.error('Failed to update typing indicator', error);
      socket.emit('error', { message: 'Failed to update typing indicator' });
    }
  });
}

function calculateVotingResults(votes: Map<string, Vote>): VotingResults {
  const numericVotes = Array.from(votes.values()).filter(
    vote => typeof vote === 'number'
  ) as number[];

  const results: VotingResults = {
    average:
      numericVotes.length > 0
        ? numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length
        : 0,
    voteCounts: {},
    totalVotes: votes.size,
    min: numericVotes.length > 0 ? Math.min(...numericVotes) : null,
    max: numericVotes.length > 0 ? Math.max(...numericVotes) : null,
    consensus: '?' as Vote,
  };

  // Count vote distribution
  votes.forEach(vote => {
    results.voteCounts[String(vote)] = (results.voteCounts[String(vote)] || 0) + 1;
  });

  // Find consensus (most common vote, or "-" if tied)
  const maxCount = Math.max(...Object.values(results.voteCounts));
  const mostCommonVotes = Object.keys(results.voteCounts).filter(
    vote => results.voteCounts[vote] === maxCount
  );

  if (mostCommonVotes.length === 1) {
    const consensusKey = mostCommonVotes[0];
    results.consensus = isNaN(Number(consensusKey)) ? (consensusKey as Vote) : Number(consensusKey);
  } else {
    results.consensus = '-' as Vote;
  }

  return results;
}
