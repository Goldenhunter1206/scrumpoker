// Global setup for all tests
export default async function globalSetup() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.PORT = '3001';
  process.env.SESSION_TIMEOUT = '3600000';
  process.env.MAX_SESSIONS = '10';

  console.log('Global test setup complete');
}
