# NikCLI Benchmark Suite

Comprehensive performance testing suite for NikCLI with modern benchmarking tools and SWE-Bench compatible tests.

## 📊 Available Benchmarks

### 1. Core Benchmarks (`index.ts`)
General performance benchmarks for core operations:
- Array operations (map, filter, reduce, forEach)
- String processing (concatenation, split, replace)
- File operations simulation (JSON parse/stringify)
- Data structure operations (Array, Set, Map, Object)

```bash
pnpm run bench
```

### 2. CLI Benchmarks (`cli-benchmark.ts`)
CLI-specific performance tests:
- Command parsing performance
- Command execution speed
- Response formatting
- Terminal output rendering

```bash
pnpm run bench:cli
```

### 3. Agent Benchmarks (`agent-benchmark.ts`)
Agent system performance tests:
- Agent creation and initialization
- Task execution performance
- Agent lifecycle management
- Concurrent agent operations

```bash
pnpm run bench:agents
```

### 4. Tool Benchmarks (`tool-benchmark.ts`)
Tool system performance tests:
- Tool registration and lookup
- Tool execution speed
- Concurrent tool operations
- Tool registry management

```bash
pnpm run bench:tools
```

### 5. SWE-Bench Compatible Tests (`swe-bench-compatible.ts`)
Real-world software engineering task benchmarks based on SWE-bench methodology:

#### Categories:
- **Bug Fixes**: Finding and fixing bugs (TypeError, race conditions, memory leaks)
- **Features**: Implementing new functionality (validators, caching, plugins)
- **Refactoring**: Code quality improvements (extract utilities, modernize code)
- **Testing**: Writing comprehensive tests (unit, integration)

#### Difficulty Levels:
- **Easy**: Basic tasks (5-10 minutes)
- **Medium**: Moderate complexity (15-30 minutes)
- **Hard**: Complex problems (30+ minutes)

```bash
pnpm run bench # Includes SWE-bench tests
```

## 🚀 Running All Benchmarks

Run all benchmark suites:
```bash
pnpm run bench:all
```

## 📈 Interpreting Results

### Performance Metrics
- **ops/sec**: Operations per second (higher is better)
- **avg time**: Average execution time in milliseconds (lower is better)
- **margin**: Margin of error percentage

### SWE-Bench Scoring
- **Score**: 0-100 points per task
- **Grade**: A (90+), B (80-89), C (70-79), D (60-69), F (<60)

### Performance Targets

#### Core Operations
- Array operations: > 100K ops/sec
- String operations: > 500K ops/sec
- JSON operations: > 50K ops/sec

#### CLI Operations
- Command parsing: > 1M ops/sec
- Command execution: < 10ms per command
- Response formatting: > 10K ops/sec

#### Agent Operations
- Agent creation: < 50ms
- Task execution: < 100ms
- Concurrent (10 agents): < 200ms

#### Tool Operations
- Tool registration: > 100K ops/sec
- Tool execution: < 20ms
- Concurrent tools: < 50ms for 5 tools

## 🔧 Benchmark Configuration

Benchmarks use the following libraries:
- **tinybench**: Modern JavaScript benchmarking
- **mitata**: High-precision benchmarking
- **benchmark**: Traditional benchmarking suite

### Configuration Options

Edit benchmark files to adjust:
- `time`: Duration of each benchmark (default: 1000-2000ms)
- `iterations`: Number of iterations (default: 5-10)
- Sample sizes and test data

## 📝 Adding New Benchmarks

1. Create a new file in `/benchmarks/`
2. Import required dependencies:
```typescript
import { Bench } from 'tinybench'
import chalk from 'chalk'
```

3. Create benchmark suite:
```typescript
async function runMyBenchmarks() {
  const bench = new Bench({ time: 1000, iterations: 10 })
  
  bench
    .add('Test 1', () => {
      // Your test code
    })
    .add('Test 2', () => {
      // Your test code
    })
  
  await bench.run()
  
  // Format and print results
}
```

4. Add script to `package.json`:
```json
{
  "scripts": {
    "bench:my-test": "ts-node benchmarks/my-benchmark.ts"
  }
}
```

## 🎯 Best Practices

1. **Warm-up**: Run benchmarks multiple times for accurate results
2. **Isolation**: Close other applications during benchmarking
3. **Consistency**: Run on same hardware for comparison
4. **Sample Size**: Use adequate iterations for statistical significance
5. **Real Data**: Use realistic test data sizes

## 📊 Continuous Benchmarking

For CI/CD integration:

```bash
# Run benchmarks and save results
pnpm run bench:all > benchmark-results.txt

# Compare with baseline
# (Add your comparison logic)
```

## 🔍 Troubleshooting

### Benchmarks Running Slowly
- Reduce `time` and `iterations` in Bench config
- Close resource-intensive applications
- Check system resource usage

### Inconsistent Results
- Increase iteration count
- Run multiple times and average
- Ensure system is idle during tests

### Memory Issues
- Reduce sample data sizes
- Add cleanup between iterations
- Monitor memory usage

## 📚 Resources

- [Tinybench Documentation](https://github.com/tinylibs/tinybench)
- [SWE-bench Paper](https://www.swebench.com/)
- [Benchmarking Best Practices](https://benchmarksgame-team.pages.debian.net/)

## 🤝 Contributing

When adding benchmarks:
1. Follow existing patterns
2. Add documentation
3. Include expected performance ranges
4. Test on multiple systems
5. Update this README

## 📄 License

MIT License - See LICENSE file for details
