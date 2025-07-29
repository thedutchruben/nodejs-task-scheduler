// Test setup file
import 'reflect-metadata';

// Suppress console logs during tests unless debugging
if (!process.env.DEBUG_TESTS) {
  global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// Global test timeout
jest.setTimeout(10000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  // Ignore unhandled rejections during tests
});

// Clean up any lingering timers after each test
afterEach(() => {
  jest.clearAllTimers();
});