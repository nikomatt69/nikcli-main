# Testing Quick Start Guide for NikCLI

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Run Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode (for development)
pnpm test:watch
```

### 3. View Results

```bash
# Open coverage report
open coverage/index.html

# View test UI
pnpm test:ui
```

## 📊 Quick Commands Reference

```bash
# Testing
pnpm test              # Run all tests
pnpm test:run          # Run once (no watch)
pnpm test:unit         # Unit tests only
pnpm test:integration  # Integration tests only
pnpm test:e2e          # E2E tests only
pnpm test:coverage     # With coverage report
pnpm test:ui           # Interactive UI

# Benchmarking
pnpm bench             # Core benchmarks
pnpm bench:cli         # CLI benchmarks
pnpm bench:agents      # Agent benchmarks
pnpm bench:tools       # Tool benchmarks
pnpm bench:all         # All benchmarks

# Development
pnpm test:watch        # Watch mode for tests
```

## 🧪 Your First Test

Create a new test file: `tests/unit/my-feature.test.ts`

```typescript
import { describe, it, expect } from 'vitest'

describe('MyFeature', () => {
  it('should work correctly', () => {
    const result = 2 + 2
    expect(result).toBe(4)
  })

  it('should handle async operations', async () => {
    const result = await Promise.resolve('success')
    expect(result).toBe('success')
  })
})
```

Run it:
```bash
pnpm test tests/unit/my-feature.test.ts
```

## 🎯 Common Testing Patterns

### Using Mocks

```typescript
import { createMockAgent } from '@tests/helpers/mock-factory'

const agent = createMockAgent('test-agent')
agent.execute.mockResolvedValue({ success: true })

const result = await agent.execute()
expect(result.success).toBe(true)
```

### Testing Async Code

```typescript
import { waitFor, retry } from '@tests/helpers/async-test-utils'

// Wait for condition
await waitFor(() => agent.isReady(), { timeout: 5000 })

// Retry on failure
const result = await retry(() => unstableOperation(), { maxAttempts: 3 })
```

### Custom Assertions

```typescript
import { assertInRange, assertShape } from '@tests/helpers/assertion-helpers'

// Assert value in range
assertInRange(performance, 0, 100)

// Assert object structure
assertShape(config, { apiKey: 'string', timeout: 'number' })
```

## 📈 Check Test Coverage

```bash
# Generate coverage report
pnpm test:coverage

# View in browser
open coverage/index.html
```

Current coverage targets:
- Lines: 70%
- Statements: 70%
- Functions: 65%
- Branches: 65%

## 🏃 Running Benchmarks

```bash
# Quick benchmark
pnpm bench

# All benchmarks with detailed output
pnpm bench:all

# Specific benchmark
pnpm bench:cli
```

Expected output:
```
🚀 NikCLI Benchmark Suite

📊 Core Operations
  Array.map                      123.45K ops/sec ±1.23% (45.32ms avg)
  Array.filter                   156.78K ops/sec ±0.89% (36.21ms avg)
  ...

✅ All benchmarks completed!
```

## 🐛 Debugging Tests

### Debug Single Test

```bash
# Run specific test file
pnpm test tests/unit/my-test.test.ts

# Run specific test by name
pnpm test -t "should handle errors"
```

### Enable Verbose Output

```bash
pnpm test --reporter=verbose
```

### Debug in VS Code

Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Tests",
  "runtimeExecutable": "pnpm",
  "runtimeArgs": ["test"],
  "console": "integratedTerminal"
}
```

## 📚 File Structure

```
tests/
├── unit/              # Unit tests (test individual components)
├── integration/       # Integration tests (test component interactions)
├── e2e/              # End-to-end tests (test complete workflows)
└── helpers/          # Test utilities

benchmarks/
├── index.ts          # Core benchmarks
├── cli-benchmark.ts  # CLI benchmarks
├── agent-benchmark.ts # Agent benchmarks
└── tool-benchmark.ts  # Tool benchmarks
```

## ✅ Pre-Commit Checklist

Before committing:

1. ✅ Run tests: `pnpm test:run`
2. ✅ Check coverage: `pnpm test:coverage`
3. ✅ Run benchmarks: `pnpm bench`
4. ✅ Verify all tests pass
5. ✅ Coverage meets thresholds

## 🎓 Learn More

- **Full Test Documentation**: See `tests/README.md`
- **Benchmark Guide**: See `benchmarks/README.md`
- **Complete Overview**: See `TEST_SUITE_SUMMARY.md`
- **Vitest Docs**: https://vitest.dev/

## 💡 Tips

1. **Write tests first** (TDD approach)
2. **Keep tests simple** and focused
3. **Use descriptive names** for tests
4. **Mock external dependencies**
5. **Run tests often** during development

## 🆘 Getting Help

- Check test documentation in `tests/README.md`
- Look at existing test examples
- Review helper utilities in `tests/helpers/`
- Ask team members for guidance

## 🎉 You're Ready!

Start writing tests and benchmarks for NikCLI. Happy testing! 🚀

---

**Quick Links**:
- [Test Suite Overview](./TEST_SUITE_SUMMARY.md)
- [Test Documentation](./tests/README.md)
- [Benchmark Documentation](./benchmarks/README.md)
- [Vitest Documentation](https://vitest.dev/)
