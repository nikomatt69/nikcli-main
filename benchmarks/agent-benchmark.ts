/**
 * Agent system benchmarks for NikCLI
 * Tests agent creation, execution, and lifecycle performance
 */

import { Bench } from 'tinybench'
import chalk from 'chalk'

interface Agent {
  id: string
  name: string
  type: string
  execute: (task: any) => Promise<any>
  initialize: () => Promise<void>
  cleanup: () => Promise<void>
}

/**
 * Create a mock agent for benchmarking
 */
function createMockAgent(id: string, type: string): Agent {
  return {
    id,
    name: `Agent-${id}`,
    type,
    execute: async (task: any) => {
      // Simulate work
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))
      return { success: true, result: `Processed: ${task.data}` }
    },
    initialize: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
    cleanup: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
    },
  }
}

/**
 * Simulate agent manager
 */
class AgentManager {
  private agents = new Map<string, Agent>()

  async createAgent(type: string): Promise<Agent> {
    const id = `agent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const agent = createMockAgent(id, type)
    await agent.initialize()
    this.agents.set(id, agent)
    return agent
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  async removeAgent(id: string): Promise<void> {
    const agent = this.agents.get(id)
    if (agent) {
      await agent.cleanup()
      this.agents.delete(id)
    }
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values())
  }

  async executeTask(agentId: string, task: any): Promise<any> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`)
    }
    return await agent.execute(task)
  }
}

/**
 * Run agent benchmarks
 */
async function runAgentBenchmarks() {
  console.log(chalk.bold.cyan('\n🤖 NikCLI Agent Benchmarks\n'))
  console.log(chalk.gray('═'.repeat(60)))

  await benchmarkAgentCreation()
  await benchmarkAgentExecution()
  await benchmarkAgentLifecycle()
  await benchmarkConcurrentAgents()

  console.log(chalk.bold.green('\n✅ Agent benchmarks completed!\n'))
}

/**
 * Benchmark agent creation
 */
async function benchmarkAgentCreation() {
  console.log(chalk.bold.yellow('\n🏗️  Agent Creation'))

  const bench = new Bench({ time: 2000, iterations: 5 })
  const manager = new AgentManager()

  bench
    .add('Create single agent', async () => {
      const agent = await manager.createAgent('test-agent')
      await manager.removeAgent(agent.id)
    })
    .add('Create 10 agents', async () => {
      const agents = await Promise.all(
        Array.from({ length: 10 }, () => manager.createAgent('test-agent'))
      )
      await Promise.all(agents.map((agent) => manager.removeAgent(agent.id)))
    })
    .add('Create specialized agent', async () => {
      const agent = await manager.createAgent('code-analyzer')
      await manager.removeAgent(agent.id)
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
 * Benchmark agent execution
 */
async function benchmarkAgentExecution() {
  console.log(chalk.bold.yellow('\n⚡ Agent Task Execution'))

  const bench = new Bench({ time: 2000, iterations: 5 })
  const manager = new AgentManager()

  // Create agents for testing
  const simpleAgent = await manager.createAgent('simple')
  const complexAgent = await manager.createAgent('complex')

  bench
    .add('Execute simple task', async () => {
      await manager.executeTask(simpleAgent.id, { data: 'simple task' })
    })
    .add('Execute complex task', async () => {
      await manager.executeTask(complexAgent.id, {
        data: {
          operation: 'analyze',
          files: ['file1.ts', 'file2.ts', 'file3.ts'],
          options: { verbose: true, depth: 3 },
        },
      })
    })
    .add('Execute 10 sequential tasks', async () => {
      for (let i = 0; i < 10; i++) {
        await manager.executeTask(simpleAgent.id, { data: `task-${i}` })
      }
    })

  await bench.run()

  // Cleanup
  await manager.removeAgent(simpleAgent.id)
  await manager.removeAgent(complexAgent.id)

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
 * Benchmark agent lifecycle
 */
async function benchmarkAgentLifecycle() {
  console.log(chalk.bold.yellow('\n🔄 Agent Lifecycle'))

  const bench = new Bench({ time: 2000, iterations: 5 })
  const manager = new AgentManager()

  bench
    .add('Complete lifecycle (create + execute + cleanup)', async () => {
      const agent = await manager.createAgent('lifecycle-test')
      await manager.executeTask(agent.id, { data: 'test' })
      await manager.removeAgent(agent.id)
    })
    .add('Agent initialization only', async () => {
      const agent = await manager.createAgent('init-test')
      await manager.removeAgent(agent.id)
    })
    .add('Agent cleanup only', async () => {
      const agent = await manager.createAgent('cleanup-test')
      await manager.removeAgent(agent.id)
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(45)}`) +
          chalk.green(` ${formatNumber(opsPerSec)} ops/sec`) +
          chalk.yellow(` (${avgTime.toFixed(3)}ms)`)
      )
    }
  }
}

/**
 * Benchmark concurrent agent operations
 */
async function benchmarkConcurrentAgents() {
  console.log(chalk.bold.yellow('\n🔀 Concurrent Agent Operations'))

  const bench = new Bench({ time: 3000, iterations: 3 })
  const manager = new AgentManager()

  bench
    .add('5 agents executing in parallel', async () => {
      const agents = await Promise.all(
        Array.from({ length: 5 }, () => manager.createAgent('concurrent-test'))
      )

      await Promise.all(
        agents.map((agent) => manager.executeTask(agent.id, { data: 'parallel task' }))
      )

      await Promise.all(agents.map((agent) => manager.removeAgent(agent.id)))
    })
    .add('10 agents executing in parallel', async () => {
      const agents = await Promise.all(
        Array.from({ length: 10 }, () => manager.createAgent('concurrent-test'))
      )

      await Promise.all(
        agents.map((agent) => manager.executeTask(agent.id, { data: 'parallel task' }))
      )

      await Promise.all(agents.map((agent) => manager.removeAgent(agent.id)))
    })
    .add('20 agents executing in parallel', async () => {
      const agents = await Promise.all(
        Array.from({ length: 20 }, () => manager.createAgent('concurrent-test'))
      )

      await Promise.all(
        agents.map((agent) => manager.executeTask(agent.id, { data: 'parallel task' }))
      )

      await Promise.all(agents.map((agent) => manager.removeAgent(agent.id)))
    })

  await bench.run()

  for (const task of bench.tasks) {
    if (task.result) {
      const avgTime = task.result.mean * 1000
      const opsPerSec = task.result.hz

      console.log(
        chalk.blue(`  ${task.name.padEnd(40)}`) +
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

// Run agent benchmarks
runAgentBenchmarks().catch(console.error)
