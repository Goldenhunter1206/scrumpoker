import { randomBytes, createHash } from 'crypto';

// Interface for session tokens
export interface SessionToken {
  token: string;
  participantName: string;
  roomCode: string;
  createdAt: Date;
  lastUsed: Date;
  isValid: boolean;
}

// In-memory store for session tokens (in production, use Redis)
const sessionTokens = new Map<string, SessionToken>();

// Token expiration time (24 hours)
const TOKEN_EXPIRATION = 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Create a hash of the token for secure storage
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Create and store a new session token
 */
export function createSessionToken(participantName: string, roomCode: string): string {
  const token = generateSessionToken();
  const hashedToken = hashToken(token);

  const sessionToken: SessionToken = {
    token: hashedToken,
    participantName,
    roomCode,
    createdAt: new Date(),
    lastUsed: new Date(),
    isValid: true,
  };

  sessionTokens.set(hashedToken, sessionToken);

  // Clean up expired tokens periodically
  cleanupExpiredTokens();

  return token; // Return unhashed token to client
}

/**
 * Validate a session token and return session info
 */
export function validateSessionToken(
  token: string,
  roomCode: string,
  participantName: string
): SessionToken | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const hashedToken = hashToken(token);
  const sessionToken = sessionTokens.get(hashedToken);

  if (!sessionToken) {
    return null;
  }

  // Check if token is expired
  const now = new Date();
  if (now.getTime() - sessionToken.createdAt.getTime() > TOKEN_EXPIRATION) {
    sessionTokens.delete(hashedToken);
    return null;
  }

  // Check if token is valid and matches the session
  if (
    !sessionToken.isValid ||
    sessionToken.roomCode !== roomCode ||
    sessionToken.participantName !== participantName
  ) {
    return null;
  }

  // Update last used time
  sessionToken.lastUsed = now;

  return sessionToken;
}

/**
 * Invalidate a session token
 */
export function invalidateSessionToken(token: string): void {
  if (!token) return;

  const hashedToken = hashToken(token);
  const sessionToken = sessionTokens.get(hashedToken);

  if (sessionToken) {
    sessionToken.isValid = false;
  }
}

/**
 * Invalidate all tokens for a participant
 */
export function invalidateParticipantTokens(participantName: string, roomCode: string): void {
  for (const [, sessionToken] of sessionTokens.entries()) {
    if (sessionToken.participantName === participantName && sessionToken.roomCode === roomCode) {
      sessionToken.isValid = false;
    }
  }
}

/**
 * Invalidate all tokens for a room
 */
export function invalidateRoomTokens(roomCode: string): void {
  for (const [, sessionToken] of sessionTokens.entries()) {
    if (sessionToken.roomCode === roomCode) {
      sessionToken.isValid = false;
    }
  }
}

/**
 * Clean up expired and invalid tokens
 */
export function cleanupExpiredTokens(): void {
  const now = new Date();
  const tokensToDelete: string[] = [];

  for (const [hashedToken, sessionToken] of sessionTokens.entries()) {
    const isExpired = now.getTime() - sessionToken.createdAt.getTime() > TOKEN_EXPIRATION;

    if (isExpired || !sessionToken.isValid) {
      tokensToDelete.push(hashedToken);
    }
  }

  tokensToDelete.forEach(token => sessionTokens.delete(token));

  if (tokensToDelete.length > 0) {
    console.log(`Cleaned up ${tokensToDelete.length} expired/invalid session tokens`);
  }
}

/**
 * Get token statistics for monitoring
 */
export function getTokenStats(): {
  total: number;
  active: number;
  expired: number;
} {
  const now = new Date();
  let active = 0;
  let expired = 0;

  for (const sessionToken of sessionTokens.values()) {
    const isExpired = now.getTime() - sessionToken.createdAt.getTime() > TOKEN_EXPIRATION;

    if (isExpired || !sessionToken.isValid) {
      expired++;
    } else {
      active++;
    }
  }

  return {
    total: sessionTokens.size,
    active,
    expired,
  };
}

// Schedule periodic cleanup
setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // Every hour
