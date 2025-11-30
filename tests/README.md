# NikCLI Test Environment

Comprehensive, isolated test environment for NikCLI with standardized configurations, benchmark datasets, and validation infrastructure.

## Overview

This test environment provides:

- **Isolated Testing**: Sandboxed test execution with resource limits
- **Standardized Benchmarks**: HumanEval, MBPP, CodeXGLUE datasets
- **Performance Metrics**: Comprehensive latency, memory, and throughput tracking
- **Competitive Analysis**: Benchmarks compatible with Claude Code, Cline, OpenCode, and Codex
- **Automated Validation**: Pre-flight checks and environment verification
- **Complete Documentation**: Generated reports and performance analysis

## Quick Start

### 1. Initialize Test Environment

```bash
# Using the setup script (recommended)
bash scripts/setup-test-environment.sh default

# Or using npm
npm run benchmark:setup
```

### 2. Verify Setup

```bash
# Run environment validation
npm run test:system

# Run environment tests
npm test tests/environment.test.ts
```

### 3. Run Benchmarks

```bash
# Quick benchmark (5 problems)
npm run benchmark:quick

# Standard benchmark
npm run benchmark:run

# Full benchmark (164 problems)
npm run benchmark:full
```

## Configuration Presets

### Default Preset

- Balanced performance and resource usage
- Standard timeouts: 30s default, 60s test timeout
- Full metrics collection
- Recommended for most use cases

```bash
bash scripts/setup-test-environment.sh default
```

### Strict Preset

- Rigorous validation and error checking
- Extended timeouts for thorough testing
- Enhanced debugging and logging
- Recommended for CI/CD pipelines

```bash
bash scripts/setup-test-environment.sh strict
```

### Quick Preset

- Minimal resource usage
- Reduced metrics collection
- Short timeouts: 15s default, 30s test timeout
- Recommended for quick iterations

```bash
bash scripts/setup-test-environment.sh quick
```

### Benchmark Preset

- Optimized for performance analysis
- Extended timeouts: 2m per test
- Full profiling and metrics
- Recommended for comprehensive benchmarking

```bash
bash scripts/setup-test-environment.sh benchmark
```

## Directory Structure

```
tests/
├── config/                          # Configuration files
│   └── test-environment.config.ts   # Environment configuration
│
├── setup/                           # Setup and initialization
│   ├── environment-validator.ts     # Environment validation
│   ├── benchmark-dataset-manager.ts # Dataset management
│   └── test-environment-setup.ts    # Setup orchestration
│
├── data/                            # Test datasets
│   ├── benchmarks/                  # Benchmark datasets
│   │   ├── humaneval/               # HumanEval (164 problems)
│   │   │   ├── metadata.json
│   │   │   ├── index.json
│   │   │   └── problems/
│   │   ├── mbpp/                    # MBPP (974 problems)
│   │   │   ├── metadata.json
│   │   │   ├── index.json
│   │   │   └── problems/
│   │   └── codexglue/               # CodeXGLUE tasks
│   │       ├── metadata.json
│   │       ├── index.json
│   │       └── problems/
│   └── custom/                      # Custom test data
│
├── helpers/                         # Test utilities
├── fixtures/                        # Test fixtures
│
├── unit/                            # Unit tests
│   ├── tools/
│   ├── ui/
│   └── ...
│
├── integration/                     # Integration tests
├── e2e/                             # End-to-end tests
├── functional/                      # Functional tests
│
├── environment.test.ts              # Environment validation
└── README.md                        # This file

test-results/
├── logs/                            # Test execution logs
├── metrics/                         # Performance metrics
├── benchmark-metrics/               # Benchmark-specific metrics
├── benchmark-logs/                  # Benchmark logs
├── environment-report.md            # Generated environment report
└── benchmark-results.json           # Benchmark results
```

## Running Tests

### All Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Specific Test File

```bash
npm test tests/unit/tools/read-file-tool.test.ts
```

### Environment Tests

```bash
npm test tests/environment.test.ts
```

### System Verification

```bash
npm run test:system
```

### Coherence Verification

```bash
npm run test:coherence
```

## Benchmark Datasets

### HumanEval

- **Status**: Initialized ✓
- **Problems**: 164 hand-written Python programming problems
- **Difficulty**: Easy to medium/hard
- **Metrics**: Pass@1, Pass@10, Pass@100
- **Source**: https://github.com/openai/human-eval

#### Sample Problem

```python
def has_close_elements(numbers: List[float], threshold: float) -> bool:
    """ Check if in list of numbers, are any two numbers closer to each other
    than given threshold.
    >>> has_close_elements([1.0, 2.0, 3.0], 0.5)
    False
    >>> has_close_elements([1.0, 2.0, 3.9, 4.0], 0.2)
    True
    """
```

### MBPP

- **Status**: Initialized ✓
- **Problems**: 974 basic programming problems
- **Difficulty**: Entry-level
- **Metrics**: Pass@1, Pass@10
- **Source**: https://huggingface.co/datasets/mbpp

#### Sample Problem

```
Write a function to return the sum of all divisors of a number
```

### CodeXGLUE

- **Status**: Initialized ✓
- **Tasks**: Multiple code understanding tasks
- **Includes**: Clone detection, defect prediction, method naming
- **Source**: https://github.com/microsoft/CodeXGLUE

## Performance Monitoring

### Metrics Collected

- **Latency**: End-to-end execution time (ms)
- **Memory**: Peak memory usage (MB)
- **Throughput**: Tokens/second generation rate
- **CPU Time**: Processor time consumed
- **Pass Rate**: Percentage of problems solved

### Metrics Location

```
test-results/
├── metrics/
│   ├── humaneval-results.json
│   ├── mbpp-results.json
│   └── codexglue-results.json
│
└── benchmark-metrics/
    ├── performance-analysis.json
    ├── comparative-analysis.json
    └── detailed-metrics.csv
```

### Analyze Results

```bash
# View latest metrics
cat test-results/metrics/humaneval-results.json | jq .

# Compare benchmarks
cat test-results/benchmark-metrics/comparative-analysis.json | jq .

# Export to CSV for analysis
cat test-results/benchmark-metrics/detailed-metrics.csv
```

## Competitive Benchmarking

### Target Agents

#### Claude Code (Anthropic)

- **Type**: LLM API
- **HumanEval Pass@1**: ~92.3%
- **Evaluation**: Published in research
- **Compatibility**: Full support

#### Cline (VSCode Extension)

- **Type**: IDE Tool
- **Backend**: Multiple LLM options
- **Benchmarks**: Backend-dependent
- **Compatibility**: Full support

#### OpenCode (Various)

- **Type**: Open-source models
- **Pass@1**: 60-80% typical
- **Variants**: Multiple implementations
- **Compatibility**: Support for standard variants

#### Codex (OpenAI - Historical)

- **Type**: LLM API (Deprecated)
- **HumanEval Pass@1**: 40.9% (2021)
- **Replaced By**: GPT-4, GPT-4 Turbo
- **Compatibility**: Legacy support

### Benchmark Comparison

```
Tool          | Pass@1  | Pass@10 | Pass@100 | Latency  | Notes
-------------|---------|---------|----------|----------|------------------
Claude Code  | ~92.3%  | ~98%    | ~99%     | <2s      | Published metrics
Codex (85B)  | 40.9%   | 64.2%   | 86.2%    | ~2-5s    | 2021 baseline
OpenCode     | 60-80%  | 75-90%  | 85-95%   | Variable | Model dependent
Cline        | Variable| Variable| Variable | Variable | Backend dependent
NikCLI       | TBD     | TBD     | TBD      | TBD      | Under evaluation
```

## Environment Validation

### Pre-Flight Checks

The environment validator performs:

- ✓ Node.js version check (>=22.0.0)
- ✓ Package manager availability
- ✓ Directory structure validation
- ✓ Dependency verification
- ✓ File permission checks
- ✓ Disk space availability (>=1GB)
- ✓ Memory availability (>=512MB)
- ✓ Network connectivity
- ✓ Security sandbox checks
- ✓ TypeScript configuration
- ✓ Test framework setup

### Run Validation

```bash
npm run test:system
```

### Review Report

```bash
cat test-results/environment-report.md
```

## Resource Limits

### Default Configuration

- **Test Timeout**: 60 seconds
- **Default Timeout**: 30 seconds
- **Max Memory**: 2GB
- **Max CPU Time**: 2 minutes
- **File Handles**: 1024

### Override Configuration

Create `.env.test`:

```
TEST_TIMEOUT=120000
BENCHMARK_TIMEOUT=60000
MAX_MEMORY=4GB
LOG_LEVEL=debug
```

## Logging

### Log Levels

- **debug**: Detailed debugging information
- **info**: General informational messages
- **warn**: Warning messages
- **error**: Error messages

### Set Log Level

```bash
LOG_LEVEL=debug npm test
```

### Log Files

```
test-results/logs/
├── test-execution.log
├── benchmark-execution.log
└── errors.log
```

## Troubleshooting

### Issue: Benchmark Datasets Not Found

**Solution**:

```bash
npm run benchmark:setup
npm test tests/environment.test.ts
```

### Issue: Permission Denied Errors

**Solution**:

```bash
chmod -R 755 tests/ test-results/
```

### Issue: Timeout Errors

**Solution**:

```bash
# Edit .env.test
TEST_TIMEOUT=120000
BENCHMARK_TIMEOUT=60000
```

### Issue: Memory Errors

**Solution**:

```bash
# Increase Node.js memory
NODE_OPTIONS=--max-old-space-size=4096 npm test
```

### Issue: Tests Won't Run

**Solution**:

```bash
# Clear cache and reinstall
rm -rf node_modules
npm install
npm run benchmark:setup
npm test
```

## Performance Optimization

### Tips for Faster Tests

1. Use quick preset: `npm run benchmark:quick`
2. Run subset of tests: `npm test -- tests/unit/`
3. Use parallel execution: `npm test -- --threads=4`
4. Disable profiling: Edit config to disable metrics

### Monitor Performance

```bash
# Real-time monitoring
npm run test:watch

# With profiling
NODE_OPTIONS="--prof" npm test

# Generate profile report
node --prof-process isolate-*.log > profile.txt
```

## CI/CD Integration

### GitHub Actions

```yaml
- name: Setup Test Environment
  run: bash scripts/setup-test-environment.sh strict

- name: Run Tests
  run: npm test

- name: Benchmark
  run: npm run benchmark:quick
```

### GitLab CI

```yaml
test:setup:
  script:
    - bash scripts/setup-test-environment.sh strict
    - npm test
  artifacts:
    paths:
      - test-results/
```

## Contributing

When adding new tests:

1. Place in appropriate directory:
   - `tests/unit/` - Unit tests
   - `tests/integration/` - Integration tests
   - `tests/e2e/` - End-to-end tests

2. Follow naming convention:
   - `*.test.ts` - Vitest tests

3. Use standard setup:

   ```typescript
   import { describe, it, expect } from "vitest";
   ```

4. Run validation:
   ```bash
   npm test
   npm run test:coherence
   ```

## Additional Resources

- [Vitest Documentation](https://vitest.dev)
- [HumanEval Benchmark](https://github.com/openai/human-eval)
- [MBPP Dataset](https://huggingface.co/datasets/mbpp)
- [CodeXGLUE](https://github.com/microsoft/CodeXGLUE)
- [NikCLI Documentation](../README.md)

## Support

For issues or questions:

1. Check the troubleshooting section above
2. Review the environment report: `test-results/environment-report.md`
3. Check logs: `test-results/logs/`
4. Open an issue with test results and logs

---

Last Updated: 2025-11-02  
Test Environment Version: 1.0  
NikCLI Version: 1.5.0
