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

### 6. AI Model Comparison (`ai-model-benchmark.ts`) 🆕

**Compare different AI models to find the best performer for NikCLI operations!**

Uses **AI SDK + OpenRouter** to test REAL coding skills across various production-level tasks:

#### Test Categories:

- **Code Generation**: Simple functions to complex classes
- **Bug Fixing**: Identify and fix code issues
- **Code Review**: Analysis and improvement suggestions
- **Refactoring**: Callback-to-async conversions, architecture improvements
- **Explanation**: Documentation and concept explanation
- **Advanced Features**: Complex TypeScript with generics, error handling

#### Metrics Tracked:

- ⚡ **Speed**: Average response time in milliseconds
- 💰 **Cost**: Total cost based on token usage
- ⭐ **Quality**: Heuristic scoring of output quality (0-100)
- ✅ **Success Rate**: Percentage of successful completions

#### Supported Models (via OpenRouter):

**Anthropic:**
- Claude 3.5 Sonnet, Claude 3.5 Haiku

**OpenAI:**
- GPT-4o, GPT-4o Mini, o1-mini

**Google:**
- Gemini Pro 1.5, Gemini Flash 1.5

**Meta:**
- Llama 3.1 70B Instruct

**Mistral:**
- Mistral Large

**Deepseek:**
- Deepseek Coder

#### Setup:

1. Get your OpenRouter API key: https://openrouter.ai/keys

2. Set environment variable:

```bash
export OPENROUTER_API_KEY=sk-or-v1-...
```

3. Run the benchmark:

```bash
pnpm run bench:ai
```

#### Output Example:

```
🤖 NikCLI AI Model Comparison Benchmark
   Testing REAL Skills via AI SDK + OpenRouter

Testing 4 models on 6 real tasks...

📊 Benchmark Results - Real Skills Tested

Overall Performance:

  Model                         Avg Time    Cost        Avg Score   Excellent
  ──────────────────────────────────────────────────────────────────────────
  Claude 3.5 Sonnet             1245ms      $0.0156     87.3        5/6
  GPT-4o                        1567ms      $0.0234     89.2        6/6
  Gemini Pro 1.5                1123ms      $0.0089     82.1        4/6
  GPT-4o Mini                   982ms       $0.0023     78.4        3/6

🏆 Best in Category:

  ⚡ Fastest: GPT-4o Mini (982ms avg)
  💰 Cheapest: GPT-4o Mini ($0.0023 total)
  ⭐ Highest Score: GPT-4o (89.2/100)
  🎯 Most Excellent: GPT-4o (6 tasks >80)

💡 Recommendation for NikCLI: Claude 3.5 Sonnet
   Best balance: 87.3/100 score, 1245ms avg, $0.0156 total
```

#### Use Cases:

- **Performance Testing**: Find the fastest model for your workload
- **Cost Optimization**: Compare costs across different models
- **Quality Assessment**: Evaluate output quality for specific tasks
- **Model Selection**: Make data-driven decisions for production use

## 🚀 Running All Benchmarks

Run all benchmark suites (including AI model comparison):

```bash
pnpm run bench:all
```

Or run specific benchmarks:

```bash
# Core operations only
pnpm run bench

# CLI benchmarks
pnpm run bench:cli

# Agent system benchmarks
pnpm run bench:agents

# Tool system benchmarks
pnpm run bench:tools

# AI model comparison (requires API keys)
pnpm run bench:ai
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
import { Bench } from "tinybench";
import chalk from "chalk";
```

3. Create benchmark suite:

```typescript
async function runMyBenchmarks() {
  const bench = new Bench({ time: 1000, iterations: 10 });

  bench
    .add("Test 1", () => {
      // Your test code
    })
    .add("Test 2", () => {
      // Your test code
    });

  await bench.run();

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
