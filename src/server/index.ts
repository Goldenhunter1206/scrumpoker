import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  Participant,
  Vote,
  JiraIssue,
} from '@shared/types/index.js';
import { SessionStore } from './utils/sessionStore.js';
import { generateRoomCode, getSessionData } from './utils/sessionHelpers.js';
import { setupSocketHandlers } from './socketHandlers.js';
import { rateLimitConfig } from './middleware/validation.js';
import {
  createSessionToken,
  validateSessionToken,
  invalidateRoomTokens,
} from './utils/sessionTokens.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

try {
  dotenv.config();
} catch {
  console.log('dotenv not available, using environment variables directly');
}

const app = express();
const server = createServer(app);
const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = parseInt(process.env.PORT || '3000');
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '50');
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || String(24 * 60 * 60 * 1000));

// Enhanced session data structure for internal use
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
  participants: Map<string, Participant & { socketId?: string; disconnectedAt?: Date }>;
  votes: Map<string, Vote>;
  votingRevealed: boolean;
  totalVotes: number;
  countdownActive: boolean;
  countdownTimer: NodeJS.Timeout | null;
  createdAt: Date;
  lastActivity: Date;
  history: any[];
  aggregate: any;
  chatMessages: any[];
  typingUsers: Map<string, NodeJS.Timeout>;
  // Performance optimization: maintain socket-to-participant lookup
  socketToParticipant: Map<string, string>;
  participantToSocket: Map<string, string>;
}

// Rate limiting
const generalRateLimit = rateLimit(rateLimitConfig.general);

// Middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  })
);

// Apply general rate limiting to all routes
app.use(generalRateLimit);

app.use(express.json({ limit: '10mb' }));

// Trust proxy for production deployments
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Security headers for all environments
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: https:",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', cspDirectives);

  // Additional security headers for production
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  next();
});

// Serve built client files in production
if (NODE_ENV === 'production') {
  const clientPath = join(__dirname, '../public');
  app.use(express.static(clientPath));

  app.get('/', (req, res) => {
    res.sendFile(join(clientPath, 'index.html'));
  });
}

// Session storage – works both with and without Redis.
// We create a single `SessionStore` instance and then alias it to `memoryStore`
// so that all legacy `memoryStore.*` calls continue to function.
// The alias satisfies the Map interface while still giving us Redis persistence
// whenever a client is configured.
const sessions = new SessionStore();
// Cast to Map so TypeScript accepts it in existing code paths
const memoryStore = sessions as unknown as Map<string, InternalSessionData>;

// Redis setup
if (process.env.REDIS_URL) {
  const redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on('error', err => console.error('Redis client error', err));

  redisClient
    .connect()
    .then(async () => {
      console.log('🔌 Connected to Redis');
      sessions.setRedisClient(redisClient);
      await sessions.loadFromRedis();
    })
    .catch(err => {
      console.error('Failed to connect to Redis, continuing with in-memory sessions:', err);
    });
} else {
  console.log('💾 REDIS_URL not set – using in-memory session store');
}

// Socket.IO connection handling
io.on('connection', socket => {
  console.log(`User connected: ${socket.id}`);

  socket.on('create-session', ({ sessionName, facilitatorName }) => {
    try {
      // Basic validation
      if (
        !sessionName ||
        !facilitatorName ||
        sessionName.length > 100 ||
        facilitatorName.length > 50 ||
        typeof sessionName !== 'string' ||
        typeof facilitatorName !== 'string'
      ) {
        socket.emit('error', { message: 'Invalid session data' });
        return;
      }

      // Check session limit
      if (memoryStore.size >= MAX_SESSIONS) {
        socket.emit('error', { message: 'Server capacity reached. Please try again later.' });
        return;
      }

      const roomCode = generateRoomCode();

      // Sanitize inputs
      const sanitizedSessionName = sessionName.trim().substring(0, 100);
      const sanitizedFacilitatorName = facilitatorName.trim().substring(0, 50);

      const session: InternalSessionData = {
        id: roomCode,
        sessionName: sanitizedSessionName,
        facilitator: {
          name: sanitizedFacilitatorName,
          socketId: socket.id,
        },
        currentTicket: '',
        currentJiraIssue: null,
        jiraConfig: null,
        participants: new Map(),
        votes: new Map(),
        votingRevealed: false,
        totalVotes: 0,
        countdownActive: false,
        countdownTimer: null,
        createdAt: new Date(),
        lastActivity: new Date(),
        history: [],
        aggregate: null,
        chatMessages: [],
        typingUsers: new Map(),
        // Initialize socket mappings
        socketToParticipant: new Map(),
        participantToSocket: new Map(),
      };

      // Add facilitator as first participant
      session.participants.set(sanitizedFacilitatorName, {
        name: sanitizedFacilitatorName,
        socketId: socket.id,
        isFacilitator: true,
        isViewer: false,
        joinedAt: new Date(),
        hasVoted: false,
      });

      // Initialize socket mappings for facilitator
      session.socketToParticipant.set(socket.id, sanitizedFacilitatorName);
      session.participantToSocket.set(sanitizedFacilitatorName, socket.id);

      memoryStore.set(roomCode, session);
      socket.join(roomCode);

      // Generate session token for the facilitator
      const sessionToken = createSessionToken(sanitizedFacilitatorName, roomCode);

      socket.emit('session-created', {
        success: true,
        roomCode,
        sessionData: getSessionData(session),
        sessionToken,
      });

      console.log(`Session created: ${roomCode} by ${sanitizedFacilitatorName}`);
    } catch (error) {
      console.error('Failed to create session', error);
      socket.emit('error', { message: 'Failed to create session' });
    }
  });

  socket.on('join-session', ({ roomCode, participantName, asViewer = false, sessionToken }) => {
    try {
      // Basic validation
      if (
        !roomCode ||
        !participantName ||
        typeof roomCode !== 'string' ||
        typeof participantName !== 'string' ||
        roomCode.length !== 6 ||
        participantName.length > 50
      ) {
        socket.emit('join-failed', { message: 'Invalid request data' });
        return;
      }

      const upperCode = roomCode.toUpperCase();
      const sanitizedParticipantName = participantName.trim().substring(0, 50);
      const session = memoryStore.get(upperCode);

      if (!session) {
        socket.emit('join-failed', { message: 'Session not found' });
        return;
      }

      const existing = session.participants.get(sanitizedParticipantName);
      if (existing) {
        const stillConnected = existing.socketId && io.sockets.sockets.get(existing.socketId);
        if (stillConnected) {
          socket.emit('join-failed', { message: 'Name already taken in this session' });
          return;
        }

        // Handle reconnection with session token validation
        if (sessionToken) {
          const tokenValidation = validateSessionToken(
            sessionToken,
            upperCode,
            sanitizedParticipantName
          );
          if (!tokenValidation) {
            socket.emit('join-failed', { message: 'Invalid or expired session token' });
            return;
          }
        } else {
          // No token provided for reconnection - this could be session fixation attempt
          socket.emit('join-failed', { message: 'Session token required for reconnection' });
          return;
        }

        // Valid reconnection
        existing.socketId = socket.id;
        existing.isViewer = asViewer;
        delete existing.disconnectedAt;

        // Update socket mappings for reconnection
        session.socketToParticipant.set(socket.id, sanitizedParticipantName);
        session.participantToSocket.set(sanitizedParticipantName, socket.id);

        socket.join(upperCode);
        session.lastActivity = new Date();

        io.to(upperCode).emit('participant-joined', {
          participantName: sanitizedParticipantName,
          sessionData: getSessionData(session),
        });

        socket.emit('join-success', {
          roomCode: upperCode,
          sessionData: getSessionData(session),
          yourVote: session.votes.get(sanitizedParticipantName) || null,
          sessionToken, // Return existing token
        });

        console.log(`${sanitizedParticipantName} reconnected to session ${upperCode}`);
        return;
      }

      // New participant path - generate new session token
      const newSessionToken = createSessionToken(sanitizedParticipantName, upperCode);

      session.participants.set(sanitizedParticipantName, {
        name: sanitizedParticipantName,
        socketId: socket.id,
        isFacilitator: false,
        isViewer: asViewer,
        joinedAt: new Date(),
        hasVoted: false,
      });

      // Add socket mappings for new participant
      session.socketToParticipant.set(socket.id, sanitizedParticipantName);
      session.participantToSocket.set(sanitizedParticipantName, socket.id);

      session.lastActivity = new Date();
      socket.join(upperCode);

      io.to(upperCode).emit('participant-joined', {
        participantName: sanitizedParticipantName,
        sessionData: getSessionData(session),
      });

      socket.emit('join-success', {
        roomCode: upperCode,
        sessionData: getSessionData(session),
        yourVote: session.votes.get(sanitizedParticipantName) || null,
        sessionToken: newSessionToken,
      });

      console.log(`${sanitizedParticipantName} joined session ${upperCode}`);
    } catch (error) {
      console.error('Failed to join session', error);
      socket.emit('error', { message: 'Failed to join session' });
    }
  });

  // Setup all other socket handlers
  setupSocketHandlers(socket, io, memoryStore);

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);

    // Optimize disconnect handling with socket mapping
    memoryStore.forEach((session, roomCode) => {
      const participantName = session.socketToParticipant.get(socket.id);
      if (participantName) {
        const participant = session.participants.get(participantName);
        if (participant) {
          participant.socketId = undefined;
          participant.disconnectedAt = new Date();

          // Remove from socket mapping but keep participant mapping for reconnection
          session.socketToParticipant.delete(socket.id);
          // Keep participantToSocket mapping to track disconnected state

          io.to(roomCode).emit('participant-left', {
            participantName: participant.name,
            sessionData: getSessionData(session),
          });

          console.log(`${participant.name} temporarily left session ${roomCode}`);

          // Note: Don't invalidate tokens on disconnect - allow reconnection
          // Tokens will be validated on reconnection attempt
        }
      }
    });
  });
});

// API endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    sessions: sessions.size,
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: '1.0.0',
  });
});

app.get('/api/stats', (req, res) => {
  const stats = {
    totalSessions: sessions.size,
    activeSessions: Array.from(sessions.values()).filter(
      s => Date.now() - (s as any).lastActivity < 60000
    ).length,
    environment: NODE_ENV,
    uptime: process.uptime(),
  };
  res.json(stats);
});

app.get('/api/session/:roomCode', (req, res) => {
  const session = memoryStore.get(req.params.roomCode.toUpperCase());

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(getSessionData(session));
});

// Clean up old sessions
setInterval(
  () => {
    const now = new Date();
    let cleaned = 0;

    memoryStore.forEach((session, roomCode) => {
      if (now.getTime() - session.lastActivity.getTime() > SESSION_TIMEOUT) {
        if (session.countdownTimer) {
          clearInterval(session.countdownTimer);
        }
        // Invalidate all session tokens for this room
        invalidateRoomTokens(roomCode);
        memoryStore.delete(roomCode);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} inactive sessions`);
    }

    if (NODE_ENV === 'production' && sessions.size > 0) {
      console.log(`📊 Active sessions: ${sessions.size}/${MAX_SESSIONS}`);
    }
  },
  60 * 60 * 1000
);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');

  io.emit('server-shutdown', {
    message: 'Server is shutting down for maintenance. Please reconnect in a few minutes.',
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

export default app;
