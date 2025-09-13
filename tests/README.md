# Tests

Comprehensive test suite for NikCLI with 60%+ coverage requirements.

## Structure

```
tests/
├── unit/                    # Unit tests for individual components
│   ├── system-coherence.test.ts  # System coherence tests
│   ├── agent-manager.test.ts     # Agent management tests
│   ├── secure-tools-registry.test.ts # Security tools tests
│   └── services/            # Service-specific tests
├── integration/             # Service integration tests
├── functional/              # Feature functionality tests
├── e2e/                     # End-to-end workflow tests
└── test-utils/             # Testing utilities and mocks
```

## Test Types

- **Unit Tests** - Individual component testing with 90% statement coverage
- **Integration Tests** - Service interaction testing
- **Functional Tests** - Feature-level behavior testing
- **E2E Tests** - Complete workflow testing

## Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm run test:unit
npm run test:integration
npm run test:e2e

# Coverage analysis
npm run test:coverage
```

## Test Configuration

- **Framework**: Vitest 3.2.4
- **Environment**: Node.js
- **Timeout**: 30 seconds (extended for AI operations)
- **Coverage**: 60% minimum on all metrics

For testing guidelines, see [nikcli.mintifly.app/contributing](https://nikcli.mintlify.app/contributing/development).
