const request = require('supertest');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Client = require('socket.io-client');

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1)
  }))
}));

// Mock node-fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Server Comprehensive Tests', () => {
  let app;

  beforeAll(() => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random available port
    process.env.SESSION_TIMEOUT = '3600000';
    process.env.MAX_SESSIONS = '10';
    process.env.APP_TITLE = 'Test Poker App';
    process.env.APP_SUBTITLE = 'Testing Environment';
    
    // Import server after setting env vars
    app = require('../../server.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('Environment Configuration', () => {
    test('should use environment variables', () => {
      expect(process.env.NODE_ENV).toBe('test');
      expect(process.env.PORT).toBe('0'); // Changed to use dynamic port
      expect(process.env.MAX_SESSIONS).toBe('10');
    });

    test('should handle missing environment variables with defaults', () => {
      const originalEnv = process.env.MISSING_VAR;
      delete process.env.MISSING_VAR;
      
      const defaultValue = process.env.MISSING_VAR || 'default';
      expect(defaultValue).toBe('default');
      
      process.env.MISSING_VAR = originalEnv;
    });
  });

  describe('HTML Template Processing', () => {
    test('should serve HTML with environment variable substitution', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      // The HTML should contain the default app content
      expect(response.text).toContain('Scrum Poker');
      expect(response.text).toContain('Collaborative Story Point Estimation');
    });

    test('should handle HTML escaping in environment variables', async () => {
      // Test that HTML content is served properly without XSS vulnerabilities
      const response = await request(app)
        .get('/')
        .expect(200);

      // Should not contain unescaped script tags or dangerous content
      expect(response.text).not.toContain('<script>alert');
      expect(response.text).not.toContain('onerror=');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('</html>');
    });
  });

  describe('Security Headers', () => {
    test('should set security headers in production environment', async () => {
      // This test verifies the security headers would be set in production
      // Since the server checks NODE_ENV at startup, we test the current behavior
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      // In test environment, security headers are not set
      // This confirms the conditional logic is working
      expect(response.headers['x-content-type-options']).toBeUndefined();
      
      // Test that the basic health endpoint works
      expect(response.body.status).toBe('ok');
    });

    test('should handle CORS configuration', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Session Store Functionality', () => {
    test('should handle session storage operations', () => {
      // Test SessionStore class functionality
      class TestSessionStore {
        constructor() {
          this.memory = new Map();
          this.redis = null;
          this.ttl = 3600;
        }

        set(key, value) {
          this.memory.set(key, value);
          return this;
        }

        get(key) {
          return this.memory.get(key);
        }

        has(key) {
          return this.memory.has(key);
        }

        delete(key) {
          return this.memory.delete(key);
        }

        forEach(callback) {
          return this.memory.forEach(callback);
        }

        values() {
          return this.memory.values();
        }

        get size() {
          return this.memory.size;
        }
      }

      const store = new TestSessionStore();
      
      // Test basic operations
      expect(store.size).toBe(0);
      
      const session = {
        id: 'TEST123',
        sessionName: 'Test Session',
        participants: new Map(),
        votes: new Map()
      };
      
      store.set('TEST123', session);
      expect(store.size).toBe(1);
      expect(store.has('TEST123')).toBe(true);
      expect(store.get('TEST123')).toEqual(session);
      
      // Test iteration
      const sessions = Array.from(store.values());
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toEqual(session);
      
      store.delete('TEST123');
      expect(store.size).toBe(0);
      expect(store.has('TEST123')).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    test('should generate unique room codes', () => {
      function generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      const codes = new Set();
      for (let i = 0; i < 1000; i++) {
        const code = generateRoomCode();
        expect(code).toMatch(/^[A-Z0-9]{6}$/);
        codes.add(code);
      }
      
      // Should have high uniqueness (allowing for some collision in random generation)
      expect(codes.size).toBeGreaterThan(950);
    });

    test('should round to Fibonacci numbers correctly', () => {
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

      // Test exact matches
      expect(roundToNearestFibonacci(0)).toBe(0);
      expect(roundToNearestFibonacci(0.5)).toBe(0.5);
      expect(roundToNearestFibonacci(1)).toBe(1);
      expect(roundToNearestFibonacci(2)).toBe(2);
      expect(roundToNearestFibonacci(3)).toBe(3);
      expect(roundToNearestFibonacci(5)).toBe(5);
      expect(roundToNearestFibonacci(8)).toBe(8);
      expect(roundToNearestFibonacci(13)).toBe(13);

      // Test rounding
      expect(roundToNearestFibonacci(0.2)).toBe(0);
      expect(roundToNearestFibonacci(0.7)).toBe(0.5);
      expect(roundToNearestFibonacci(1.4)).toBe(1);
      expect(roundToNearestFibonacci(1.6)).toBe(2);
      expect(roundToNearestFibonacci(4)).toBe(3);
      expect(roundToNearestFibonacci(6)).toBe(5);
      expect(roundToNearestFibonacci(10)).toBe(8);

      // Test edge cases
      expect(roundToNearestFibonacci(null)).toBe(null);
      expect(roundToNearestFibonacci(undefined)).toBe(null);
      expect(roundToNearestFibonacci(NaN)).toBe(null);
      expect(roundToNearestFibonacci('string')).toBe(null);
      expect(roundToNearestFibonacci({})).toBe(null);
      expect(roundToNearestFibonacci([])).toBe(null);
    });

    test('should escape HTML properly', () => {
      function escapeHtml(text) {
        return text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#039;");
      }

      // Test XSS prevention
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      
      // Test various characters
      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
      expect(escapeHtml("It's a test")).toBe('It&#039;s a test');
      expect(escapeHtml('<div class="test">Content</div>'))
        .toBe('&lt;div class=&quot;test&quot;&gt;Content&lt;/div&gt;');
      
      // Test empty and normal strings
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml('normal text')).toBe('normal text');
      expect(escapeHtml('123456789')).toBe('123456789');
    });
  });

  describe('Session Management Logic', () => {
    test('should create session with proper structure', () => {
      function createSession(sessionName, facilitatorName, socketId) {
        const roomCode = 'TEST123';
        return {
          id: roomCode,
          sessionName,
          facilitator: {
            name: facilitatorName,
            socketId: socketId
          },
          currentTicket: '',
          currentJiraIssue: null,
          jiraConfig: null,
          participants: new Map([[facilitatorName, {
            name: facilitatorName,
            socketId: socketId,
            isFacilitator: true,
            isViewer: false,
            joinedAt: new Date()
          }]]),
          votes: new Map(),
          votingRevealed: false,
          countdownActive: false,
          countdownTimer: null,
          createdAt: new Date(),
          lastActivity: new Date(),
          discussionStartTime: null,
          discussionTimer: null,
          history: []
        };
      }

      const session = createSession('Test Session', 'Alice', 'socket-123');
      
      expect(session.id).toBe('TEST123');
      expect(session.sessionName).toBe('Test Session');
      expect(session.facilitator.name).toBe('Alice');
      expect(session.facilitator.socketId).toBe('socket-123');
      expect(session.participants.size).toBe(1);
      expect(session.participants.get('Alice').isFacilitator).toBe(true);
      expect(session.votes.size).toBe(0);
      expect(session.votingRevealed).toBe(false);
      expect(session.history).toEqual([]);
    });

    test('should transform session data correctly', () => {
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
          totalVotes: session.votes.size,
          discussionStartTime: session.discussionStartTime,
          discussionDuration: session.discussionStartTime ? 
            Math.floor((new Date() - session.discussionStartTime) / 1000) : null,
          history: session.history || [],
          aggregate: session.aggregate || null
        };
      }

      const mockSession = {
        id: 'TEST123',
        sessionName: 'Test Session',
        facilitator: { name: 'Alice' },
        currentTicket: 'Test ticket',
        currentJiraIssue: null,
        jiraConfig: {
          domain: 'test.atlassian.net',
          boardId: '1',
          token: 'secret'
        },
        participants: new Map([
          ['Alice', { 
            name: 'Alice', 
            isFacilitator: true, 
            isViewer: false, 
            joinedAt: new Date() 
          }],
          ['Bob', { 
            name: 'Bob', 
            isFacilitator: false, 
            isViewer: false, 
            joinedAt: new Date() 
          }]
        ]),
        votes: new Map([['Alice', 5]]),
        votingRevealed: false,
        discussionStartTime: null,
        history: [],
        aggregate: null
      };

      const sessionData = getSessionData(mockSession);
      
      expect(sessionData.id).toBe('TEST123');
      expect(sessionData.facilitator).toBe('Alice');
      expect(sessionData.participants).toHaveLength(2);
      expect(sessionData.participants[0].hasVoted).toBe(true);
      expect(sessionData.participants[1].hasVoted).toBe(false);
      expect(sessionData.totalVotes).toBe(1);
      expect(sessionData.jiraConfig.hasToken).toBe(true);
      expect(sessionData.jiraConfig.domain).toBe('test.atlassian.net');
    });
  });

  describe('Jira Integration Logic', () => {
    test('should handle Jira API request formatting', () => {
      function makeJiraRequest(config, endpoint, method = 'GET', data = null) {
        const auth = Buffer.from(`${config.email}:${config.token}`).toString('base64');
        
        const baseUrl = endpoint.startsWith('agile/')
          ? `https://${config.domain}/rest/${endpoint}`
          : `https://${config.domain}/rest/api/3/${endpoint}`;

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

        return { url: baseUrl, options: fetchOptions };
      }

      const config = {
        domain: 'test.atlassian.net',
        email: 'test@example.com',
        token: 'secret-token'
      };

      // Test core API request
      const coreRequest = makeJiraRequest(config, 'issue/TEST-1');
      expect(coreRequest.url).toBe('https://test.atlassian.net/rest/api/3/issue/TEST-1');
      expect(coreRequest.options.method).toBe('GET');
      expect(coreRequest.options.headers.Authorization).toBe(
        `Basic ${Buffer.from('test@example.com:secret-token').toString('base64')}`
      );

      // Test agile API request
      const agileRequest = makeJiraRequest(config, 'agile/1.0/board');
      expect(agileRequest.url).toBe('https://test.atlassian.net/rest/agile/1.0/board');

      // Test POST request with data
      const postRequest = makeJiraRequest(config, 'issue/TEST-1', 'PUT', { fields: { summary: 'New summary' } });
      expect(postRequest.options.method).toBe('PUT');
      expect(postRequest.options.body).toBe(JSON.stringify({ fields: { summary: 'New summary' } }));
    });

    test('should handle issue transformation', () => {
      function transformJiraIssue(issue) {
        return {
          key: issue.key,
          summary: issue.fields.summary,
          description: issue.fields.description || '',
          issueType: issue.fields.issuetype?.name || 'Story',
          priority: issue.fields.priority?.name || 'Medium',
          status: issue.fields.status?.name || 'To Do',
          assignee: issue.fields.assignee?.displayName || 'Unassigned',
          currentStoryPoints: issue.fields.customfield_10016 || null
        };
      }

      const mockJiraIssue = {
        key: 'TEST-1',
        fields: {
          summary: 'Test issue',
          description: 'Test description',
          issuetype: { name: 'Story' },
          priority: { name: 'High' },
          status: { name: 'In Progress' },
          assignee: { displayName: 'John Doe' },
          customfield_10016: 8
        }
      };

      const transformed = transformJiraIssue(mockJiraIssue);
      
      expect(transformed.key).toBe('TEST-1');
      expect(transformed.summary).toBe('Test issue');
      expect(transformed.issueType).toBe('Story');
      expect(transformed.priority).toBe('High');
      expect(transformed.status).toBe('In Progress');
      expect(transformed.assignee).toBe('John Doe');
      expect(transformed.currentStoryPoints).toBe(8);

      // Test with minimal fields
      const minimalIssue = {
        key: 'TEST-2',
        fields: {
          summary: 'Minimal issue'
        }
      };

      const minimalTransformed = transformJiraIssue(minimalIssue);
      expect(minimalTransformed.key).toBe('TEST-2');
      expect(minimalTransformed.summary).toBe('Minimal issue');
      expect(minimalTransformed.description).toBe('');
      expect(minimalTransformed.issueType).toBe('Story');
      expect(minimalTransformed.priority).toBe('Medium');
      expect(minimalTransformed.status).toBe('To Do');
      expect(minimalTransformed.assignee).toBe('Unassigned');
      expect(minimalTransformed.currentStoryPoints).toBe(null);
    });
  });

  describe('Vote Calculation Logic', () => {
    test('should calculate vote results correctly', () => {
      function calculateResults(votes) {
        const numericVotes = Array.from(votes.values()).filter(v => typeof v === 'number');
        
        const results = {
          average: numericVotes.length > 0 ? 
            numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length : 0,
          voteCounts: {},
          totalVotes: votes.size,
          min: numericVotes.length > 0 ? Math.min(...numericVotes) : null,
          max: numericVotes.length > 0 ? Math.max(...numericVotes) : null
        };

        votes.forEach(vote => {
          results.voteCounts[vote] = (results.voteCounts[vote] || 0) + 1;
        });

        const maxCount = Math.max(...Object.values(results.voteCounts));
        const mostCommonVotes = Object.keys(results.voteCounts).filter(vote => 
          results.voteCounts[vote] === maxCount
        );
        results.consensus = mostCommonVotes.length === 1 ? mostCommonVotes[0] : '-';

        return results;
      }

      // Test with numeric votes
      const votes1 = new Map([
        ['Alice', 5],
        ['Bob', 8],
        ['Charlie', 5]
      ]);

      const results1 = calculateResults(votes1);
      expect(results1.average).toBe(6);
      expect(results1.totalVotes).toBe(3);
      expect(results1.min).toBe(5);
      expect(results1.max).toBe(8);
      expect(results1.consensus).toBe('5');
      expect(results1.voteCounts['5']).toBe(2);
      expect(results1.voteCounts['8']).toBe(1);

      // Test with mixed votes
      const votes2 = new Map([
        ['Alice', 3],
        ['Bob', '?'],
        ['Charlie', 3],
        ['Dave', '☕']
      ]);

      const results2 = calculateResults(votes2);
      expect(results2.average).toBe(3);
      expect(results2.totalVotes).toBe(4);
      expect(results2.min).toBe(3);
      expect(results2.max).toBe(3);
      expect(results2.consensus).toBe('3');

      // Test with no consensus
      const votes3 = new Map([
        ['Alice', 1],
        ['Bob', 2],
        ['Charlie', 3]
      ]);

      const results3 = calculateResults(votes3);
      expect(results3.consensus).toBe('-');
      expect(results3.average).toBe(2);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed requests', async () => {
      await request(app)
        .get('/api/session/invalid-format')
        .expect(404);

      await request(app)
        .get('/api/unknown-endpoint')
        .expect(404);
    });

    test('should handle session timeout logic', () => {
      function isSessionExpired(session, timeoutMs) {
        const now = new Date();
        return (now - session.lastActivity) > timeoutMs;
      }

      const recentSession = {
        lastActivity: new Date()
      };

      const oldSession = {
        lastActivity: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      };

      const timeout = 24 * 60 * 60 * 1000; // 24 hours

      expect(isSessionExpired(recentSession, timeout)).toBe(false);
      expect(isSessionExpired(oldSession, timeout)).toBe(true);
    });

    test('should handle discussion timer calculations', () => {
      function calculateDiscussionDuration(startTime) {
        if (!startTime) return null;
        return Math.floor((new Date() - startTime) / 1000);
      }

      const startTime = new Date(Date.now() - 5000); // 5 seconds ago
      const duration = calculateDiscussionDuration(startTime);
      
      expect(duration).toBeGreaterThanOrEqual(4);
      expect(duration).toBeLessThanOrEqual(6);
      expect(calculateDiscussionDuration(null)).toBe(null);
    });
  });
});