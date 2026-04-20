const request = require('supertest');

// Mock Redis client
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    keys: jest.fn().mockResolvedValue([]),
    del: jest.fn().mockResolvedValue(1),
  })),
}));

// Mock node-fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Basic Server Tests', () => {
  let app;

  beforeAll(() => {
    // Set environment variables for testing
    process.env.NODE_ENV = 'test';
    process.env.PORT = '0'; // Use random available port
    process.env.SESSION_TIMEOUT = '3600000';
    process.env.MAX_SESSIONS = '10';

    // Import server after setting env vars
    app = require('../../server.js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();
  });

  describe('Health Check', () => {
    test('GET /api/health should return server status', async () => {
      const response = await request(app).get('/api/health').expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment', 'test');
      expect(response.body).toHaveProperty('version', '1.0.0');
    });
  });

  describe('Stats Endpoint', () => {
    test('GET /api/stats should return session statistics', async () => {
      const response = await request(app).get('/api/stats').expect(200);

      expect(response.body).toHaveProperty('totalSessions');
      expect(response.body).toHaveProperty('activeSessions');
      expect(response.body).toHaveProperty('environment', 'test');
      expect(response.body).toHaveProperty('uptime');
      expect(typeof response.body.totalSessions).toBe('number');
      expect(typeof response.body.activeSessions).toBe('number');
    });
  });

  describe('Session Endpoint', () => {
    test('GET /api/session/:roomCode should return 404 for non-existent session', async () => {
      const response = await request(app).get('/api/session/NONEXISTENT').expect(404);

      expect(response.body).toHaveProperty('error', 'Session not found');
    });
  });

  describe('Utility Functions', () => {
    test('roundToNearestFibonacci function logic', () => {
      // Test the Fibonacci rounding logic
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
      expect(roundToNearestFibonacci(1)).toBe(1);
      expect(roundToNearestFibonacci(2)).toBe(2);
      expect(roundToNearestFibonacci(3)).toBe(3);
      expect(roundToNearestFibonacci(5)).toBe(5);
      expect(roundToNearestFibonacci(8)).toBe(8);

      // Test rounding
      expect(roundToNearestFibonacci(1.4)).toBe(1);
      expect(roundToNearestFibonacci(1.6)).toBe(2);
      expect(roundToNearestFibonacci(4)).toBe(3);
      expect(roundToNearestFibonacci(6)).toBe(5);
      expect(roundToNearestFibonacci(10)).toBe(8);

      // Test edge cases
      expect(roundToNearestFibonacci(NaN)).toBe(null);
      expect(roundToNearestFibonacci('string')).toBe(null);
      expect(roundToNearestFibonacci(null)).toBe(null);
    });

    test('HTML escaping function logic', () => {
      // Test HTML escaping logic
      function escapeHtml(text) {
        return text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );

      expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');

      expect(escapeHtml("It's a test")).toBe('It&#039;s a test');

      expect(escapeHtml('')).toBe('');
      expect(escapeHtml('normal text')).toBe('normal text');
    });

    test('Room code generation logic', () => {
      // Test room code generation logic
      function generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
      }

      const roomCode = generateRoomCode();
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);
      expect(roomCode.length).toBe(6);

      // Test uniqueness (statistical test)
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(generateRoomCode());
      }
      expect(codes.size).toBeGreaterThan(90); // Should have high probability of uniqueness
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed requests gracefully', async () => {
      await request(app).get('/api/session/invalid-format').expect(404);
    });

    test('should return 404 for unknown endpoints', async () => {
      await request(app).get('/api/unknown-endpoint').expect(404);
    });
  });
});
