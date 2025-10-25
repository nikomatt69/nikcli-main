import { beforeAll, afterAll, vi } from 'vitest';

// Setup environment variables for testing
beforeAll(() => {
  process.env.CDP_API_KEY = 'test-api-key';
  process.env.CDP_API_SECRET = 'test-api-secret';
  process.env.POLYMARKET_HOST = 'https://test.polymarket.com';
  process.env.POLYMARKET_GAMMA_API = 'https://test-gamma.polymarket.com';
  process.env.POLYMARKET_DATA_API = 'https://test-data.polymarket.com';
});

// Cleanup after all tests
afterAll(() => {
  vi.clearAllMocks();
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: console.warn, // Keep warnings
  error: console.error, // Keep errors
};
