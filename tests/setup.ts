// Global test setup
import { jest } from '@jest/globals';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.SESSION_TIMEOUT = '3600000';
process.env.MAX_SESSIONS = '10';

// Mock Redis if not available in test environment
if (!process.env.REDIS_URL) {
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
}

// Mock fetch for Jira API tests
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

// Set up console.log capturing for tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  jest.clearAllMocks();
  // Reset console methods
  console.log = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  // Restore console methods if needed
  if (process.env.SHOW_LOGS) {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  }
});
