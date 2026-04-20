module.exports = {
  projects: [
    {
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/server/**/*.test.js'],
      transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
      },
      collectCoverageFrom: [
        'server.js',
        'src/server/**/*.{ts,tsx,js,jsx}',
        '!src/**/*.d.ts',
        '!src/**/index.ts'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      testTimeout: 15000,
      globalSetup: '<rootDir>/tests/globalSetup.ts',
      globalTeardown: '<rootDir>/tests/globalTeardown.ts'
    },
    {
      displayName: 'frontend',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/tests/frontend/**/*.test.js'],
      transform: {
        '^.+\\.(ts|tsx)$': 'ts-jest'
      },
      collectCoverageFrom: [
        'src/client/**/*.{ts,tsx,js,jsx}',
        '!src/**/*.d.ts',
        '!src/**/index.ts',
        '!src/client/assets/**/*',
        '!src/client/styles/**/*',
        '!src/client/index.html'
      ],
      setupFilesAfterEnv: ['<rootDir>/tests/frontend-setup.js'],
      testTimeout: 10000,
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
      }
    }
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'server.js',
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/client/assets/**/*',
    '!src/client/styles/**/*',
    '!src/client/index.html',
    '!dist/**/*',
    '!**/*.test.{js,ts}',
    '!**/node_modules/**'
  ],
  modulePathIgnorePatterns: ['<rootDir>/dist/']
};