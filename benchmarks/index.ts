/**
 * Main Benchmark Suite for NikCLI
 * Comprehensive performance testing with multiple benchmark libraries
 */

import { Bench } from 'tinybench'
import chalk from 'chalk'

interface BenchmarkResult {
  name: string
  opsPerSec: number
  avgTime: number
  margin: number
}

/**
 * Run all benchmarks
 */
async function runAllBenchmarks() {
  console.log(chalk.bold.cyan('\n🚀 NikCLI Benchmark Suite\n'))
  console.log(chalk.gray('═'.repeat(60)))

  const suites = [
    { name: 'Core Operations', fn: runCoreOperationsBench },
    { name: 'String Processing', fn: runStringProcessingBench },
    { name: 'File Operations', fn: runFileOperationsBench },
    { name: 'Data Structures', fn: runDataStructuresBench },
  ]

  const allResults: BenchmarkResult[] = []

  for (const suite of suites) {
    console.log(chalk.bold.yellow(`\n📊 ${suite.name}`))
    const results = await suite.fn()
    allResults.push(...results)
  }

  console.log(chalk.gray('\n' + '═'.repeat(60)))
  console.log(chalk.bold.green('\n✅ All benchmarks completed!\n'))

  // Print summary
  printSummary(allResults)
}

/**
 * Core operations benchmarks
 */
async function runCoreOperationsBench(): Promise<BenchmarkResult[]> {
  const bench = new Bench({ time: 1000, iterations: 10 })

  const data = Array.from({ length: 1000 }, (_, i) => ({ id: i, value: Math.random() }))

  bench
    .add('Array.map', () => {
      data.map((item) => ({ ...item, processed: true }))
    })
    .add('Array.filter', () => {
      data.filter((item) => item.value > 0.5)
    })
    .add('Array.reduce', () => {
      data.reduce((sum, item) => sum + item.value, 0)
    })
    .add('Array.forEach', () => {
      const results: any[] = []
      data.forEach((item) => results.push({ ...item, processed: true }))
    })
    .add('for loop', () => {
      const results: any[] = []
      for (let i = 0; i < data.length; i++) {
        results.push({ ...data[i], processed: true })
      }
    })

  await bench.run()

  return formatResults(bench)
}

/**
 * String processing benchmarks
 */
async function runStringProcessingBench(): Promise<BenchmarkResult[]> {
  const bench = new Bench({ time: 1000, iterations: 10 })

  const testString = 'Hello World '.repeat(100)
  const words = testString.split(' ')

  bench
    .add('String concatenation (+)', () => {
      let result = ''
      for (let i = 0; i < 100; i++) {
        result += 'test'
      }
    })
    .add('String.concat()', () => {
      let result = ''
      for (let i = 0; i < 100; i++) {
        result = result.concat('test')
      }
    })
    .add('Array.join()', () => {
      const parts = []
      for (let i = 0; i < 100; i++) {
        parts.push('test')
      }
      parts.join('')
    })
    .add('Template literals', () => {
      let result = ''
      for (let i = 0; i < 100; i++) {
        result = `${result}test`
      }
    })
    .add('String.split()', () => {
      testString.split(' ')
    })
    .add('String.replace()', () => {
      testString.replace(/World/g, 'Universe')
    })

  await bench.run()

  return formatResults(bench)
}

/**
 * File operation simulation benchmarks
 */
async function runFileOperationsBench(): Promise<BenchmarkResult[]> {
  const bench = new Bench({ time: 1000, iterations: 10 })

  const mockFileContent = JSON.stringify(
    {
      name: 'test',
      version: '1.0.0',
      dependencies: Array.from({ length: 50 }, (_, i) => ({
        name: `package-${i}`,
        version: '1.0.0',
      })),
    },
    null,
    2
  )

  bench
    .add('JSON.parse', () => {
      JSON.parse(mockFileContent)
    })
    .add('JSON.stringify', () => {
      JSON.stringify(JSON.parse(mockFileContent))
    })
    .add('JSON.stringify (formatted)', () => {
      JSON.stringify(JSON.parse(mockFileContent), null, 2)
    })
    .add('RegExp test', () => {
      /\btest\b/g.test(mockFileContent)
    })
    .add('String includes', () => {
      mockFileContent.includes('dependencies')
    })

  await bench.run()

  return formatResults(bench)
}

/**
 * Data structures benchmarks
 */
async function runDataStructuresBench(): Promise<BenchmarkResult[]> {
  const bench = new Bench({ time: 1000, iterations: 10 })

  const arrayData = Array.from({ length: 1000 }, (_, i) => i)
  const setData = new Set(arrayData)
  const mapData = new Map(arrayData.map((v) => [v, v * 2]))
  const objData = Object.fromEntries(arrayData.map((v) => [v, v * 2]))

  bench
    .add('Array.includes', () => {
      arrayData.includes(500)
    })
    .add('Set.has', () => {
      setData.has(500)
    })
    .add('Map.get', () => {
      mapData.get(500)
    })
    .add('Object property access', () => {
      objData[500]
    })
    .add('Array.push', () => {
      const arr: number[] = []
      for (let i = 0; i < 100; i++) {
        arr.push(i)
      }
    })
    .add('Set.add', () => {
      const set = new Set<number>()
      for (let i = 0; i < 100; i++) {
        set.add(i)
      }
    })

  await bench.run()

  return formatResults(bench)
}

/**
 * Format benchmark results
 */
function formatResults(bench: Bench): BenchmarkResult[] {
  const results: BenchmarkResult[] = []

  for (const task of bench.tasks) {
    if (task.result) {
      const opsPerSec = task.result.hz || 0
      const avgTime = task.result.mean * 1000 || 0 // Convert to ms
      const margin = task.result.rme || 0

      results.push({
        name: task.name,
        opsPerSec,
        avgTime,
        margin,
      })

      console.log(
        chalk.blue(`  ${task.name.padEnd(30)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.gray(` ±${margin.toFixed(2)}%`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms avg)`)
      )
    }
  }

  return results
}

/**
 * Print benchmark summary
 */
function printSummary(results: BenchmarkResult[]) {
  console.log(chalk.bold.cyan('\n📈 Performance Summary'))
  console.log(chalk.gray('─'.repeat(60)))

  // Find fastest and slowest
  const sorted = [...results].sort((a, b) => b.opsPerSec - a.opsPerSec)

  console.log(chalk.green(`\n🏆 Fastest: ${sorted[0].name}`))
  console.log(
    chalk.gray(
      `   ${formatNumber(sorted[0].opsPerSec)} ops/sec (${sorted[0].avgTime.toFixed(3)}ms)`
    )
  )

  console.log(chalk.yellow(`\n🐌 Slowest: ${sorted[sorted.length - 1].name}`))
  console.log(
    chalk.gray(
      `   ${formatNumber(sorted[sorted.length - 1].opsPerSec)} ops/sec (${sorted[sorted.length - 1].avgTime.toFixed(3)}ms)`
    )
  )

  const avgOps = results.reduce((sum, r) => sum + r.opsPerSec, 0) / results.length
  console.log(chalk.blue(`\n📊 Average Performance: ${formatNumber(avgOps)} ops/sec`))
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

// Run benchmarks
runAllBenchmarks().catch(console.error)
