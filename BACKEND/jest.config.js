module.exports = {
  roots: ['<rootDir>/planbuddy_v9'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  globalSetup: '<rootDir>/planbuddy_v9/__tests__/setup.js',
  testMatch: ['**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.vscode/',
    '/.codex/',
    '/dist/',
    '/build/',
    '/helloplanbuddy-cmd-PlanBuddy-Backend-Productivity_R6/'
  ],
  testEnvironment: 'node'
};
