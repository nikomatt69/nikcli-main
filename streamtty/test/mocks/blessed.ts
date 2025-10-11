/**
 * Blessed.js Mock for Testing
 */

export const mockScreen = {
  render: vi.fn(),
  destroy: vi.fn(),
  key: vi.fn(),
  title: 'Test Screen',
  width: 80,
  height: 24,
  smartCSR: true,
  fullUnicode: true
};

export const mockBox = {
  render: vi.fn(),
  destroy: vi.fn(),
  key: vi.fn(),
  scroll: vi.fn(),
  setScrollPerc: vi.fn(),
  focus: vi.fn(),
  children: [],
  parent: mockScreen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  tags: true
};

export const mockBlessed = {
  screen: vi.fn(() => mockScreen),
  box: vi.fn(() => mockBox),
  text: vi.fn(),
  list: vi.fn(),
  table: vi.fn(),
  form: vi.fn(),
  prompt: vi.fn(),
  question: vi.fn(),
  message: vi.fn(),
  loading: vi.fn(),
  progressbar: vi.fn(),
  log: vi.fn(),
  terminal: vi.fn(),
  image: vi.fn(),
  layout: vi.fn(),
  filemanager: vi.fn(),
  filetree: vi.fn(),
  markdown: vi.fn()
};

// Mock the blessed module
vi.mock('blessed', () => ({
  default: mockBlessed,
  screen: vi.fn(() => mockScreen),
  box: vi.fn(() => mockBox)
}));

// Helper functions for tests
export const createMockScreen = (overrides = {}) => ({
  ...mockScreen,
  ...overrides
});

export const createMockBox = (overrides = {}) => ({
  ...mockBox,
  ...overrides
});

export const resetBlessedMocks = () => {
  vi.clearAllMocks();
  mockBox.children = [];
};
