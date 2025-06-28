import { SessionData } from '@shared/types/index.js';

export class SessionStore {
  private memory: Map<string, SessionData>;
  private redis: any | null;
  private ttl: number;

  constructor(memoryStore = new Map<string, SessionData>(), redisClient: any = null, ttlSeconds = 24 * 60 * 60) {
    this.memory = memoryStore;
    this.redis = redisClient;
    this.ttl = ttlSeconds;
  }

  async saveToRedis(key: string, session: SessionData): Promise<void> {
    if (!this.redis) return;
    try {
      const serialisable = {
        ...session,
        participants: Array.from(session.participants.entries()),
        votes: session.participants.map(p => [p.name, p.vote]).filter(([, vote]) => vote !== undefined)
      };
      await this.redis.set(`session:${key}`, JSON.stringify(serialisable), {
        EX: this.ttl
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
        const sessionData: SessionData = {
          ...obj,
          participants: obj.participants || [],
          history: obj.history || [],
          aggregate: obj.aggregate || null,
          currentJiraIssue: obj.currentJiraIssue || null,
          jiraConfig: obj.jiraConfig || null
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
      this.redis.del(`session:${key}`).catch((err: any) => console.error('Redis delete error', err));
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
  }
}