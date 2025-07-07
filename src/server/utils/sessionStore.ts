import { SessionData } from '../../shared/types/index.js';

export class SessionStore {
  private memory: Map<string, SessionData>;
  private redis: any | null;
  private ttl: number;
  private autoSaveIntervalId: NodeJS.Timeout | null;

  constructor(
    memoryStore = new Map<string, SessionData>(),
    redisClient: any = null,
    ttlSeconds = 24 * 60 * 60
  ) {
    this.memory = memoryStore;
    this.redis = redisClient;
    this.ttl = ttlSeconds;
    this.autoSaveIntervalId = null;

    if (this.redis) {
      this.startAutoPersist();
    }
  }

  async saveToRedis(key: string, session: SessionData): Promise<void> {
    if (!this.redis) return;
    try {
      // Exclude timer objects and other non-serializable data from persistence
      const { 
        countdownTimer, 
        discussionTimer, 
        typingUsers, 
        socketToParticipant, 
        participantToSocket,
        ...sessionWithoutTimers 
      } = session as any;
      
      const serialisable = {
        ...sessionWithoutTimers,
        // Convert Map structures to arrays for JSON storage
        participants: Array.from((session as any).participants?.entries?.() || []),
        votes: Array.from((session as any).votes?.entries?.() || []),
      };
      await this.redis.set(`session:${key}`, JSON.stringify(serialisable), {
        EX: this.ttl,
      });
    } catch (err) {
      console.error('Failed to persist session to Redis:', err);
    }
  }

  async loadFromRedis(): Promise<void> {
    if (!this.redis) return;
    try {
      const keys = await this.redis.keys('session:*');
      for (const fullKey of keys) {
        const raw = await this.redis.get(fullKey);
        if (!raw) continue;
        const obj = JSON.parse(raw);

        // Re-hydrate Maps and proper data structures
        const sessionData: any = {
          ...obj,
          // Rebuild Map structures
          participants: new Map(obj.participants || []),
          votes: new Map(obj.votes || []),
          history: obj.history || [],
          aggregate: obj.aggregate || null,
          currentJiraIssue: obj.currentJiraIssue || null,
          jiraConfig: obj.jiraConfig || null,
          // Ensure new Map-based properties exist to prevent undefined access
          socketToParticipant: new Map(),
          participantToSocket: new Map(),
          typingUsers: new Map(),
          // Initialize timer fields (they will be recreated when needed)
          countdownTimer: null,
          discussionTimer: null,
          discussionStartTime: obj.discussionStartTime ? new Date(obj.discussionStartTime) : null,
        };

        this.memory.set(obj.id || fullKey.split(':')[1], sessionData);
      }
      if (keys.length) {
        console.log(`🔐 Restored ${keys.length} session(s) from Redis`);
      }
    } catch (err) {
      console.error('Failed to load sessions from Redis:', err);
    }
  }

  set(key: string, value: SessionData): Map<string, SessionData> {
    const res = this.memory.set(key, value);
    this.saveToRedis(key, value);
    return res;
  }

  get(key: string): SessionData | undefined {
    return this.memory.get(key);
  }

  has(key: string): boolean {
    return this.memory.has(key);
  }

  delete(key: string): boolean {
    const res = this.memory.delete(key);
    if (this.redis) {
      this.redis
        .del(`session:${key}`)
        .catch((err: any) => console.error('Redis delete error', err));
    }
    return res;
  }

  forEach(cb: (value: SessionData, key: string, map: Map<string, SessionData>) => void): void {
    return this.memory.forEach(cb);
  }

  values(): IterableIterator<SessionData> {
    return this.memory.values();
  }

  get size(): number {
    return this.memory.size;
  }

  setRedisClient(client: any): void {
    this.redis = client;

    this.startAutoPersist();
  }

  startAutoPersist(intervalMs = 5000): void {
    if (!this.redis) return;
    if (this.autoSaveIntervalId) clearInterval(this.autoSaveIntervalId);

    this.autoSaveIntervalId = setInterval(() => {
      this.memory.forEach((session, key) => {
        this.saveToRedis(key, session);
      });
    }, intervalMs);
  }

  stopAutoPersist(): void {
    if (this.autoSaveIntervalId) {
      clearInterval(this.autoSaveIntervalId);
      this.autoSaveIntervalId = null;
    }
  }
}
