# NikCLI Test Suite

Comprehensive testing suite for NikCLI with unit, integration, and end-to-end tests using modern testing tools.

## 🧪 Test Structure

```
tests/
├── unit/              # Unit tests for individual components
│   ├── core/         # Core system tests
│   ├── services/     # Service tests
│   ├── tools/        # Tool tests
│   └── ui/           # UI component tests
├── integration/      # Integration tests for component interactions
├── e2e/              # End-to-end workflow tests
├── helpers/          # Test utilities and helpers
│   ├── test-utils.ts           # General test utilities
│   ├── mock-factory.ts         # Mock object creation
│   ├── async-test-utils.ts     # Async testing helpers
│   └── assertion-helpers.ts    # Custom assertions
└── setup.ts          # Global test setup
```

## 🚀 Running Tests

### Run All Tests
```bash
pnpm test
```

### Run Specific Test Suites
```bash
# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# E2E tests only
pnpm test:e2e
```

### Watch Mode
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

### UI Mode
```bash
pnpm test:ui
```

## 📊 Test Categories

### Unit Tests (`tests/unit/`)

Test individual components in isolation:

- **Core System Tests**
  - Config Manager
  - Agent Factory
  - Token Manager
  - Cache Service
  
- **Service Tests**
  - Agent Service
  - Tool Service
  - Memory Service
  - Planning Service

- **Tool Tests**
  - File operations
  - Search functionality
  - Code analysis

- **UI Tests**
  - Approval system
  - Status displays
  - Interactive prompts

### Integration Tests (`tests/integration/`)

Test component interactions:

- Agent-Tool integration
- Service coordination
- Data flow between components
- Configuration management
- Error handling across boundaries

### E2E Tests (`tests/e2e/`)

Test complete workflows:

- Project analysis
- Code generation
- Refactoring operations
- Testing workflows
- Documentation generation
- Error recovery

## 🛠️ Test Utilities

### Mock Factory (`helpers/mock-factory.ts`)

Create mock objects for testing:

```typescript
import { createMockAgent, createMockTool, createMockConfigManager } from '@tests/helpers/mock-factory'

const agent = createMockAgent('test-agent')
const tool = createMockTool('test-tool')
const config = createMockConfigManager()
```

### Async Test Utils (`helpers/async-test-utils.ts`)

Utilities for testing async operations:

```typescript
import { waitFor, retry, withTimeout, delay } from '@tests/helpers/async-test-utils'

// Wait for condition
await waitFor(() => agent.isReady(), { timeout: 5000 })

// Retry failed operations
const result = await retry(() => api.call(), { maxAttempts: 3 })

// Add timeout
const data = await withTimeout(fetchData(), 5000)
```

### Assertion Helpers (`helpers/assertion-helpers.ts`)

Custom assertions for better test readability:

```typescript
import { 
  assertInRange, 
  assertShape, 
  assertThrowsAsync,
  assertCompletesWithin 
} from '@tests/helpers/assertion-helpers'

// Assert value in range
assertInRange(performance, 100, 200)

// Assert object shape
assertShape(config, { apiKey: 'string', timeout: 'number' })

// Assert async throws
await assertThrowsAsync(() => service.failingMethod(), 'Expected error')

// Assert performance
await assertCompletesWithin(() => fastOperation(), 100)
```

## 📝 Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup before each test
  })

  afterEach(() => {
    // Cleanup after each test
  })

  describe('Feature Group', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test'
      
      // Act
      const result = component.process(input)
      
      // Assert
      expect(result).toBe('expected')
    })

    it('should handle edge cases', async () => {
      // Test async operations
      const result = await component.asyncOperation()
      expect(result).toBeDefined()
    })
  })
})
```

### Testing Async Code

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction()
  expect(result).toBe('success')
})

it('should handle promises', () => {
  return promiseFunction().then(result => {
    expect(result).toBe('success')
  })
})

it('should handle rejections', async () => {
  await expect(failingFunction()).rejects.toThrow('Error message')
})
```

### Mocking

```typescript
import { vi } from 'vitest'

// Mock a function
const mockFn = vi.fn(() => 'mocked')

// Mock a module
vi.mock('./module', () => ({
  function: vi.fn(() => 'mocked')
}))

// Mock timers
vi.useFakeTimers()
vi.advanceTimersByTime(1000)
vi.useRealTimers()
```

### Testing Error Conditions

```typescript
it('should handle errors gracefully', async () => {
  // Test error throwing
  expect(() => dangerousFunction()).toThrow('Expected error')
  
  // Test async errors
  await expect(asyncDangerousFunction()).rejects.toThrow('Expected error')
  
  // Test error recovery
  const result = await functionWithRecovery()
  expect(result.error).toBeDefined()
})
```

## 🎯 Best Practices

### 1. Test Organization
- Group related tests with `describe` blocks
- Use clear, descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

### 2. Test Independence
- Tests should not depend on each other
- Clean up after each test
- Use `beforeEach` and `afterEach` for setup/teardown

### 3. Mocking
- Mock external dependencies
- Use real implementations when possible
- Keep mocks simple and maintainable

### 4. Assertions
- One logical assertion per test
- Use specific matchers for clarity
- Provide meaningful error messages

### 5. Async Testing
- Always await async operations
- Use proper error handling
- Set appropriate timeouts

### 6. Coverage
- Aim for high coverage but focus on critical paths
- Don't test implementation details
- Test behavior, not internals

## 📈 Coverage Goals

Current coverage thresholds:
- Branches: 65%
- Functions: 65%
- Lines: 70%
- Statements: 70%

To view coverage:
```bash
pnpm test:coverage
```

Coverage report will be generated in `coverage/` directory.

## 🐛 Debugging Tests

### Run Single Test File
```bash
pnpm test tests/unit/core/config-manager.test.ts
```

### Run Specific Test
```bash
pnpm test -t "should initialize with default configuration"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/vitest run
```

### Verbose Output
```bash
pnpm test --reporter=verbose
```

## 🔧 Configuration

Test configuration is in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
    },
  },
})
```

## 📚 Additional Resources

### Testing Documentation
- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)

### Related Scripts
```json
{
  "test": "vitest",
  "test:run": "vitest run",
  "test:watch": "vitest --watch",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "vitest run tests/e2e"
}
```

## 🤝 Contributing

When adding tests:
1. Follow the existing structure
2. Add appropriate documentation
3. Ensure tests pass locally
4. Maintain or improve coverage
5. Update this README if adding new patterns

## 🔍 Troubleshooting

### Tests Timing Out
- Increase timeout in test or config
- Check for unresolved promises
- Verify async operations complete

### Flaky Tests
- Ensure proper cleanup
- Check for race conditions
- Use `waitFor` for async conditions

### Mock Issues
- Verify mock is properly imported
- Check mock implementation
- Clear mocks between tests with `vi.clearAllMocks()`

## 📄 License

MIT License - See LICENSE file for details
