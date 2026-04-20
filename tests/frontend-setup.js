// Frontend test setup
require('@testing-library/jest-dom');

// Mock crypto for tests
global.crypto = {
  randomUUID: jest.fn(() => 'test-uuid-1234'),
  getRandomValues: jest.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  })
};

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

global.localStorage = localStorageMock;

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

global.sessionStorage = sessionStorageMock;

// Mock CryptoJS for client-side encryption tests
global.CryptoJS = {
  AES: {
    encrypt: jest.fn((text, key) => ({
      toString: () => `encrypted-${text}-with-${key}`
    })),
    decrypt: jest.fn((encrypted, key) => ({
      toString: () => {
        const match = encrypted.match(/encrypted-(.*)-with-/);
        return match ? match[1] : 'decrypted-text';
      }
    }))
  },
  enc: {
    Utf8: 'utf8'
  }
};

// Mock window.location if needed (JSDOM already provides basic location object)
if (typeof window !== 'undefined' && !window.location.reload) {
  window.location.reload = jest.fn();
  window.location.assign = jest.fn();
}

// Mock fetch
global.fetch = jest.fn();

// Mock socket.io client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
    id: 'mock-socket-id'
  };
  
  return jest.fn(() => mockSocket);
});

// Mock console methods to reduce noise in tests
const originalError = console.error;
beforeEach(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterEach(() => {
  console.error = originalError;
  jest.clearAllMocks();
  localStorageMock.clear();
  sessionStorageMock.clear();
});