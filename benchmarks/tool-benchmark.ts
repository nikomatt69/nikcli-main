/**
 * Tool system benchmarks for NikCLI
 * Tests tool registration, execution, and performance
 */

import { Bench } from 'tinybench'
import chalk from 'chalk'

interface Tool {
  name: string
  description: string
  schema: any
  execute: (params: any) => Promise<any>
}

/**
 * Create mock tools for benchmarking
 */
function createReadFileTool(): Tool {
  return {
    name: 'read-file',
    description: 'Read file contents',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
    },
    execute: async (params: any) => {
      // Simulate file reading
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5))
      return {
        success: true,
        data: `Content of ${params.path}`,
      }
    },
  }
}

function createWriteFileTool(): Tool {
  return {
    name: 'write-file',
    description: 'Write file contents',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        content: { type: 'string' },
      },
    },
    execute: async (params: any) => {
      // Simulate file writing
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 8))
      return {
        success: true,
        data: `Written ${params.content.length} bytes to ${params.path}`,
      }
    },
  }
}

function createSearchTool(): Tool {
  return {
    name: 'search',
    description: 'Search for patterns',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string' },
        path: { type: 'string' },
      },
    },
    execute: async (params: any) => {
      // Simulate search operation
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 15))
      return {
        success: true,
        data: {
          matches: Array.from({ length: 10 }, (_, i) => ({
            file: `file-${i}.ts`,
            line: i + 1,
            content: `Match for ${params.pattern}`,
          })),
        },
      }
    },
  }
}

/**
 * Tool registry for managing tools
 */
class ToolRegistry {
  private tools = new Map<string, Tool>()

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values())
  }

  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Tool not found: ${name}`)
    }
    return await tool.execute(params)
  }

  unregisterTool(name: string): void {
    this.tools.delete(name)
  }

  clear(): void {
    this.tools.clear()
  }
}

/**
 * Run tool benchmarks
 */
async function runToolBenchmarks() {
  console.log(chalk.bold.cyan('\n🔨 NikCLI Tool Benchmarks\n'))
  console.log(chalk.gray('═'.repeat(60)))

  await benchmarkToolRegistration()
  await benchmarkToolExecution()
  await benchmarkToolLookup()
  await benchmarkConcurrentTools()

  console.log(chalk.bold.green('\n✅ Tool benchmarks completed!\n'))
}

/**
 * Benchmark tool registration
 */
async function benchmarkToolRegistration() {
  console.log(chalk.bold.yellow('\n📝 Tool Registration'))

  const bench = new Bench({ time: 1000, iterations: 10 })

  bench
    .add('Register single tool', () => {
      const registry = new ToolRegistry()
      registry.registerTool(createReadFileTool())
    })
    .add('Register 10 tools', () => {
      const registry = new ToolRegistry()
      for (let i = 0; i < 10; i++) {
        registry.registerTool({
          name: `tool-${i}`,
          description: `Tool ${i}`,
          schema: {},
          execute: async () => ({ success: true }),
        })
      }
    })
    .add('Register and unregister tool', () => {
      const registry = new ToolRegistry()
      const tool = createReadFileTool()
      registry.registerTool(tool)
      registry.unregisterTool(tool.name)
    })
    .add('Clear all tools', () => {
      const registry = new ToolRegistry()
      for (let i = 0; i < 20; i++) {
        registry.registerTool({
          name: `tool-${i}`,
          description: `Tool ${i}`,
          schema: {},
          execute: async () => ({ success: true }),
        })
      }
      registry.clear()
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(30)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Benchmark tool execution
 */
async function benchmarkToolExecution() {
  console.log(chalk.bold.yellow('\n⚡ Tool Execution'))

  const bench = new Bench({ time: 2000, iterations: 5 })
  const registry = new ToolRegistry()

  // Register tools
  registry.registerTool(createReadFileTool())
  registry.registerTool(createWriteFileTool())
  registry.registerTool(createSearchTool())

  bench
    .add('Execute read-file', async () => {
      await registry.executeTool('read-file', { path: '/tmp/test.txt' })
    })
    .add('Execute write-file', async () => {
      await registry.executeTool('write-file', {
        path: '/tmp/test.txt',
        content: 'Hello World',
      })
    })
    .add('Execute search', async () => {
      await registry.executeTool('search', {
        pattern: 'test',
        path: '/workspace',
      })
    })
    .add('Execute 5 read operations', async () => {
      for (let i = 0; i < 5; i++) {
        await registry.executeTool('read-file', { path: `/tmp/file-${i}.txt` })
      }
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(35)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Benchmark tool lookup operations
 */
async function benchmarkToolLookup() {
  console.log(chalk.bold.yellow('\n🔍 Tool Lookup'))

  const bench = new Bench({ time: 1000, iterations: 10 })
  const registry = new ToolRegistry()

  // Register many tools
  for (let i = 0; i < 100; i++) {
    registry.registerTool({
      name: `tool-${i}`,
      description: `Tool ${i}`,
      schema: {},
      execute: async () => ({ success: true }),
    })
  }

  bench
    .add('Get tool by name', () => {
      registry.getTool('tool-50')
    })
    .add('List all tools', () => {
      registry.listTools()
    })
    .add('Check tool existence', () => {
      registry.getTool('tool-99') !== undefined
    })
    .add('Lookup 10 tools', () => {
      for (let i = 0; i < 10; i++) {
        registry.getTool(`tool-${i}`)
      }
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(30)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Benchmark concurrent tool execution
 */
async function benchmarkConcurrentTools() {
  console.log(chalk.bold.yellow('\n🔀 Concurrent Tool Execution'))

  const bench = new Bench({ time: 2000, iterations: 3 })
  const registry = new ToolRegistry()

  registry.registerTool(createReadFileTool())
  registry.registerTool(createWriteFileTool())
  registry.registerTool(createSearchTool())

  bench
    .add('3 tools in parallel', async () => {
      await Promise.all([
        registry.executeTool('read-file', { path: '/tmp/1.txt' }),
        registry.executeTool('write-file', { path: '/tmp/2.txt', content: 'test' }),
        registry.executeTool('search', { pattern: 'test', path: '/workspace' }),
      ])
    })
    .add('5 read tools in parallel', async () => {
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          registry.executeTool('read-file', { path: `/tmp/file-${i}.txt` })
        )
      )
    })
    .add('10 mixed tools in parallel', async () => {
      const operations = [
        ...Array.from({ length: 5 }, (_, i) =>
          registry.executeTool('read-file', { path: `/tmp/read-${i}.txt` })
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          registry.executeTool('write-file', {
            path: `/tmp/write-${i}.txt`,
            content: `Content ${i}`,
          })
        ),
      ]
      await Promise.all(operations)
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(35)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Format large numbers
 */
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(2)}M`
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(2)}K`
  }
  return num.toFixed(2)
}

// Run tool benchmarks
runToolBenchmarks().catch(console.error)
