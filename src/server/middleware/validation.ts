/* eslint-disable no-useless-escape */
import Joi from 'joi';
import { Request, Response, NextFunction } from 'express';
import { RedisStore } from 'rate-limit-redis';
import { createClient } from 'redis';

// Common validation schemas
const schemas = {
  // User names - alphanumeric, spaces, basic punctuation, length limit
  userName: Joi.string()
    .min(1)
    .max(50)
    .pattern(/^[a-zA-Z0-9\s\-_\.@]{1,50}$/)
    .trim()
    .required()
    .messages({
      'string.pattern.base':
        'Name can only contain letters, numbers, spaces, and basic punctuation',
      'string.max': 'Name must be 50 characters or less',
      'string.min': 'Name is required',
    }),

  // Session names - more permissive but still safe
  sessionName: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[a-zA-Z0-9\s\-_\.\,\!\?]{1,100}$/)
    .trim()
    .required()
    .messages({
      'string.pattern.base': 'Session name contains invalid characters',
      'string.max': 'Session name must be 100 characters or less',
      'string.min': 'Session name is required',
    }),

  // Room codes - exactly 6 alphanumeric characters
  roomCode: Joi.string()
    .length(6)
    .pattern(/^[A-Z0-9]{6}$/)
    .required()
    .messages({
      'string.length': 'Room code must be exactly 6 characters',
      'string.pattern.base': 'Room code can only contain uppercase letters and numbers',
    }),

  // Chat messages - limited length, no script tags
  chatMessage: Joi.string()
    .min(1)
    .max(500)
    .pattern(/^(?!.*<script).*$/i)
    .trim()
    .required()
    .messages({
      'string.max': 'Message must be 500 characters or less',
      'string.min': 'Message cannot be empty',
      'string.pattern.base': 'Message contains forbidden content',
    }),

  // Tickets/descriptions - longer but still limited
  ticketDescription: Joi.string().min(1).max(2000).trim().required().messages({
    'string.max': 'Ticket description must be 2000 characters or less',
    'string.min': 'Ticket description is required',
  }),

  // Jira domain - valid domain format
  jiraDomain: Joi.string()
    .min(1)
    .max(255)
    .pattern(/^[a-zA-Z0-9\-\.]{1,255}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid domain format',
      'string.max': 'Domain name too long',
    }),

  // Email format for Jira
  email: Joi.string().email().max(255).required().messages({
    'string.email': 'Invalid email format',
    'string.max': 'Email address too long',
  }),

  // Jira token - base64-like pattern, length limit
  jiraToken: Joi.string()
    .min(1)
    .max(1000)
    .pattern(/^[a-zA-Z0-9\+\/=\-_\.]{1,1000}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid token format',
      'string.max': 'Token too long',
    }),

  // Project key - Jira format
  projectKey: Joi.string()
    .min(1)
    .max(50)
    .pattern(/^[A-Z0-9_]{1,50}$/)
    .optional()
    .messages({
      'string.pattern.base':
        'Project key can only contain uppercase letters, numbers, and underscores',
      'string.max': 'Project key too long',
    }),

  // Board ID - numeric string
  boardId: Joi.string().pattern(/^\d+$/).required().messages({
    'string.pattern.base': 'Board ID must be numeric',
  }),

  // Vote values - specific allowed values
  vote: Joi.alternatives()
    .try(
      Joi.number().valid(0, 0.5, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89),
      Joi.string().valid('?', '☕')
    )
    .required()
    .messages({
      'alternatives.match': 'Invalid vote value',
    }),

  // Countdown duration - reasonable limits
  countdownDuration: Joi.number().integer().min(10).max(300).required().messages({
    'number.min': 'Countdown must be at least 10 seconds',
    'number.max': 'Countdown cannot exceed 5 minutes',
  }),

  // Final estimate - numeric with reasonable bounds
  finalEstimate: Joi.number().min(0).max(999).required().messages({
    'number.min': 'Estimate cannot be negative',
    'number.max': 'Estimate too large',
  }),

  // Moderation actions - specific allowed values
  moderationAction: Joi.string()
    .valid('make-viewer', 'make-participant', 'make-facilitator', 'remove')
    .required()
    .messages({
      'any.only': 'Invalid moderation action',
    }),

  // Boolean values
  boolean: Joi.boolean().required(),
};

// Socket event validation schemas
export const socketValidation = {
  'create-session': Joi.object({
    sessionName: schemas.sessionName,
    facilitatorName: schemas.userName,
  }),

  'join-session': Joi.object({
    roomCode: schemas.roomCode,
    participantName: schemas.userName,
    asViewer: schemas.boolean.optional(),
    sessionToken: Joi.string().hex().length(64).optional(), // 32 bytes = 64 hex chars
  }),

  'configure-jira': Joi.object({
    roomCode: schemas.roomCode,
    domain: schemas.jiraDomain,
    email: schemas.email,
    token: schemas.jiraToken,
    projectKey: schemas.projectKey,
  }),

  'get-jira-issues': Joi.object({
    roomCode: schemas.roomCode,
    boardId: schemas.boardId,
  }),

  'set-jira-issue': Joi.object({
    roomCode: schemas.roomCode,
    issue: Joi.object({
      key: Joi.string().max(50).required(),
      summary: Joi.string().max(500).required(),
      description: Joi.string().max(5000).allow(''),
      issueType: Joi.string().max(100).required(),
      priority: Joi.string().max(100).required(),
      status: Joi.string().max(100).required(),
      assignee: Joi.string().max(100).required(),
      currentStoryPoints: Joi.number().allow(null),
    }).required(),
  }),

  'finalize-estimation': Joi.object({
    roomCode: schemas.roomCode,
    finalEstimate: schemas.finalEstimate,
  }),

  'set-ticket': Joi.object({
    roomCode: schemas.roomCode,
    ticket: schemas.ticketDescription,
  }),

  'submit-vote': Joi.object({
    roomCode: schemas.roomCode,
    vote: schemas.vote,
  }),

  'moderate-participant': Joi.object({
    roomCode: schemas.roomCode,
    targetName: schemas.userName,
    action: schemas.moderationAction,
  }),

  'set-facilitator-viewer': Joi.object({
    roomCode: schemas.roomCode,
    isViewer: schemas.boolean,
  }),

  'reveal-votes': Joi.object({
    roomCode: schemas.roomCode,
  }),

  'reset-voting': Joi.object({
    roomCode: schemas.roomCode,
  }),

  'start-countdown': Joi.object({
    roomCode: schemas.roomCode,
    duration: schemas.countdownDuration,
  }),

  'end-session': Joi.object({
    roomCode: schemas.roomCode,
  }),

  'send-chat-message': Joi.object({
    roomCode: schemas.roomCode,
    message: schemas.chatMessage,
  }),

  'typing-indicator': Joi.object({
    roomCode: schemas.roomCode,
    userName: schemas.userName,
    isTyping: schemas.boolean,
  }),
};

// Middleware factory for socket event validation
export function validateSocketEvent<T = any>(eventName: keyof typeof socketValidation) {
  return (data: any): T => {
    const schema = socketValidation[eventName];
    if (!schema) {
      throw new Error(`No validation schema for event: ${eventName}`);
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      throw new Error(`Validation failed: ${errorMessage}`);
    }

    return value as T;
  };
}

// Express middleware for HTTP endpoints
export function validateBody(schema: Joi.Schema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      return res.status(400).json({
        error: 'Validation failed',
        details: errorMessage,
      });
    }

    req.body = value;
    next();
  };
}

// Additional security validation
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

// Rate limiting configurations
export const rateLimitConfig = {
  // General API rate limit
  general: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes default
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // 100 requests default
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: undefined as any,
  },

  // Stricter limit for session creation
  sessionCreation: {
    windowMs: parseInt(process.env.RATE_LIMIT_SESSION_WINDOW || '60000'), // 1 minute default
    max: parseInt(process.env.RATE_LIMIT_SESSION_MAX || '5'), // 5 session creations default
    message: 'Too many session creation attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    store: undefined as any,
  },

  // Chat message rate limiting
  chatMessages: {
    windowMs: parseInt(process.env.RATE_LIMIT_CHAT_WINDOW || '60000'), // 1 minute default
    max: parseInt(process.env.RATE_LIMIT_CHAT_MAX || '30'), // 30 messages default
    message: 'Too many chat messages, please slow down.',
    standardHeaders: true,
    legacyHeaders: false,
    store: undefined as any,
  },
};

// Redis store for rate limiting (if configured)
let redisStore: RedisStore | undefined;

if (process.env.REDIS_URL) {
  try {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
    });

    redisClient.on('error', err => {
      console.warn('Redis rate limiting disabled due to connection error:', err.message);
      redisStore = undefined;
    });

    // Connect to Redis before creating the store
    redisClient.connect().then(() => {
      redisStore = new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: 'rl:',
      });
      
      // Apply Redis store to rate limit configs after connection
      if (redisStore) {
        rateLimitConfig.general.store = redisStore;
        rateLimitConfig.sessionCreation.store = redisStore;
        rateLimitConfig.chatMessages.store = redisStore;
      }
    }).catch(err => {
      console.warn('Failed to connect to Redis, rate limiting will use memory store:', err.message);
      redisStore = undefined;
    });
  } catch (error) {
    console.warn('Failed to initialize Redis store for rate limiting:', error);
    redisStore = undefined;
  }
}

// Socket.IO rate limiting for specific events
export const createSocketEventRateLimiter = (config: {
  windowMs: number;
  max: number;
  message: string;
}) => {
  const store = new Map<string, { count: number; resetTime: number }>();

  return (socket: any, handler: Function) => {
    return (...args: any[]) => {
      const clientIp = socket.handshake.address || socket.conn.remoteAddress;
      const now = Date.now();
      const key = `${clientIp}:${socket.id}`;

      // Clean up expired entries
      if (store.has(key)) {
        const entry = store.get(key)!;
        if (now >= entry.resetTime) {
          store.delete(key);
        }
      }

      // Get or create entry
      let entry = store.get(key);
      if (!entry) {
        entry = { count: 0, resetTime: now + config.windowMs };
        store.set(key, entry);
      }

      // Check rate limit
      if (entry.count >= config.max) {
        socket.emit('error', { message: config.message });
        return;
      }

      // Increment counter and call handler
      entry.count++;
      handler(...args);
    };
  };
};

// Socket.IO rate limiters for specific events
export const socketEventRateLimiters = {
  sessionCreation: createSocketEventRateLimiter(rateLimitConfig.sessionCreation),
  chatMessages: createSocketEventRateLimiter(rateLimitConfig.chatMessages),
};
