/**
 * CLI-specific benchmarks for NikCLI
 * Tests command parsing, execution, and response times
 */

import { Bench } from 'tinybench'
import chalk from 'chalk'

interface CommandBenchResult {
  command: string
  avgTime: number
  minTime: number
  maxTime: number
  opsPerSec: number
}

/**
 * Simulate command parsing
 */
function parseCommand(input: string) {
  const parts = input.trim().split(/\s+/)
  const command = parts[0]
  const args = parts.slice(1)

  return {
    command,
    args,
    flags: args.filter((arg) => arg.startsWith('-')),
    params: args.filter((arg) => !arg.startsWith('-')),
  }
}

/**
 * Simulate command execution
 */
async function executeCommand(parsed: any) {
  // Simulate async operation
  await new Promise((resolve) => setTimeout(resolve, Math.random() * 5))

  return {
    success: true,
    output: `Executed: ${parsed.command}`,
    time: Date.now(),
  }
}

/**
 * Run CLI benchmarks
 */
async function runCLIBenchmarks() {
  console.log(chalk.bold.cyan('\n🔧 NikCLI Command Benchmarks\n'))
  console.log(chalk.gray('═'.repeat(60)))

  await benchmarkCommandParsing()
  await benchmarkCommandExecution()
  await benchmarkResponseFormatting()

  console.log(chalk.bold.green('\n✅ CLI benchmarks completed!\n'))
}

/**
 * Benchmark command parsing
 */
async function benchmarkCommandParsing() {
  console.log(chalk.bold.yellow('\n📝 Command Parsing'))

  const bench = new Bench({ time: 1000, iterations: 10 })

  const commands = [
    'help',
    'agent create --name test',
    'tool execute read-file --path /tmp/test.txt',
    'chat send "Hello, how are you?" --stream',
    'config set apiKey sk-ant-1234567890',
    'workflow run test-workflow --verbose --debug',
  ]

  commands.forEach((cmd) => {
    bench.add(`Parse: ${cmd}`, () => {
      parseCommand(cmd)
    })
  })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(50)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Benchmark command execution
 */
async function benchmarkCommandExecution() {
  console.log(chalk.bold.yellow('\n⚡ Command Execution'))

  const bench = new Bench({ time: 2000, iterations: 5 })

  bench
    .add('Simple command', async () => {
      const parsed = parseCommand('help')
      await executeCommand(parsed)
    })
    .add('Command with args', async () => {
      const parsed = parseCommand('agent create --name test')
      await executeCommand(parsed)
    })
    .add('Complex command', async () => {
      const parsed = parseCommand('tool execute read-file --path /tmp/test.txt --encoding utf-8')
      await executeCommand(parsed)
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
 * Benchmark response formatting
 */
async function benchmarkResponseFormatting() {
  console.log(chalk.bold.yellow('\n📄 Response Formatting'))

  const bench = new Bench({ time: 1000, iterations: 10 })

  const simpleData = { message: 'Hello' }
  const complexData = {
    agent: {
      id: 'agent-123',
      name: 'Test Agent',
      status: 'active',
      tasks: Array.from({ length: 10 }, (_, i) => ({
        id: `task-${i}`,
        status: 'completed',
        result: `Result ${i}`,
      })),
    },
  }

  bench
    .add('Format simple JSON', () => {
      JSON.stringify(simpleData)
    })
    .add('Format simple JSON (pretty)', () => {
      JSON.stringify(simpleData, null, 2)
    })
    .add('Format complex JSON', () => {
      JSON.stringify(complexData)
    })
    .add('Format complex JSON (pretty)', () => {
      JSON.stringify(complexData, null, 2)
    })
    .add('Format with chalk', () => {
      chalk.green(JSON.stringify(simpleData))
    })
    .add('Format table-like output', () => {
      const headers = ['ID', 'Name', 'Status']
      const rows = Array.from({ length: 10 }, (_, i) => [`${i}`, `Item ${i}`, 'active'])

      const output = [
        headers.join(' | '),
        headers.map(() => '---').join(' | '),
        ...rows.map((row) => row.join(' | ')),
      ].join('\n')

      return output
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

// Run CLI benchmarks
runCLIBenchmarks().catch(console.error)
