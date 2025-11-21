import chalk from 'chalk'
import { advancedAIProvider } from '../ai/advanced-ai-provider'

/**
 * ParallelExecutor - Handles parallel execution of agents and tasks
 * Extracted from lines 4824-5101 in nik-cli.ts
 */
export class ParallelExecutor {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async executeParallelPlanMode(plan: any, agents: any[], collaborationContext: any): Promise<void> {
    try {
      const allAggregatedResults: string[] = []

      // Notify plan start
      void this.nikCLI.sendPlanStartedNotification(plan, agents)

      // Execute each todo in the plan with all agents in parallel
      for (let i = 0; i < plan.todos.length; i++) {
        const todo = plan.todos[i]

        // Log at top like plan mode
        console.log(chalk.blue.bold(`\n📝 Todo ${i + 1}/${plan.todos.length}: ${todo.title}`))
        if (todo.description) {
          console.log(chalk.dim(`   ${todo.description}`))
        }
        console.log('') // spacing

        this.nikCLI.addLiveUpdate({
          type: 'info',
          content: `\n📝 Todo ${i + 1}/${plan.todos.length}: ${todo.title}`,
          source: 'parallel-plan',
        })

        // Mark todo as in-progress
        this.nikCLI.updatePlanHudTodoStatus(todo.id, 'in_progress')

        // Notify task started
        void this.nikCLI.sendTaskStartedNotification(plan, todo, agents)

        // Execute this todo with all agents in parallel
        await this.runTodoInParallel(todo, agents, collaborationContext)

        // Aggregate results from all agents for this todo
        const aggregatedResult = await this.aggregateTodoResults(todo, agents, collaborationContext)

        // Store aggregated result
        allAggregatedResults.push(aggregatedResult)

        // Mark todo as completed
        this.nikCLI.updatePlanHudTodoStatus(todo.id, 'completed')

        this.nikCLI.addLiveUpdate({
          type: 'status',
          content: `✅ Todo completed: ${todo.title}`,
          source: 'parallel-plan',
        })

        // Send task completion notification (silent)
        void this.nikCLI.sendTaskCompletionNotification(plan, todo, agents, true)

        // Render prompt after each todo (like plan mode)
        setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 50)
      }

      // Generate final collaborative output
      const finalOutput = this.aggregatePlanResults(plan, allAggregatedResults)
      await this.nikCLI.renderFinalOutput(finalOutput)

      this.nikCLI.addLiveUpdate({
        type: 'status',
        content: '🎉 Parallel plan execution completed successfully!',
        source: 'parallel-plan',
      })

      // Clear toolchain display
      this.nikCLI.clearParallelToolchainDisplay()

      // Final prompt render after everything is done (like plan mode)
      setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 150)

      // Notify plan completion (success)
      void this.nikCLI.sendPlanCompletionNotification(plan, true)
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({
        type: 'error',
        content: `❌ Parallel plan execution failed: ${error.message}`,
        source: 'parallel-plan',
      })

      // Clear toolchain display on error too
      this.nikCLI.clearParallelToolchainDisplay()

      // Render prompt after error (like plan mode)
      setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 100)

      // Notify plan completion (failed)
      try {
        void this.nikCLI.sendPlanCompletionNotification(plan, false)
      } catch {
        // Ignore notification errors
      }

      throw error
    }
  }

  async runTodoInParallel(todo: any, agents: any[], collaborationContext: any): Promise<void> {
    const todoText = todo.description || todo.title

    // Execute with all agents concurrently
    const agentPromises = agents.map(async (agent) => {
      const agentName = agent.blueprint?.name || agent.blueprintId
      const tools = this.nikCLI.createSpecializedToolchain(agent.blueprint)

      try {
        // Set up agent helpers for collaboration
        this.setupAgentCollaborationHelpers(agent, collaborationContext)

        // Execute using plan-mode streaming
        const taskExecutor = new (await import('./task-executor')).TaskExecutor(this.nikCLI)
        await taskExecutor.executeAgentWithPlanModeStreaming(agent, todoText, agentName, tools)

        // Store agent's output
        const agentOutput = collaborationContext.sharedData.get(`${agent.id}:current-output`) || ''
        collaborationContext.sharedData.set(`${agent.id}:todo:${todo.id}:output`, {
          raw: agentOutput,
          agentName,
          blueprintId: agent.blueprintId,
          timestamp: new Date().toISOString(),
        })

        return { success: true, agentName }
      } catch (error: any) {
        this.nikCLI.addLiveUpdate({
          type: 'error',
          content: `❌ ${agentName} failed on todo: ${error.message}`,
          source: agentName,
        })
        return { success: false, agentName, error: error.message }
      }
    })

    await Promise.all(agentPromises)
  }

  setupAgentCollaborationHelpers(agent: any, collaborationContext: any): void {
    agent.logToCollaboration = (message: string) => {
      const logs = collaborationContext.logs.get(agent.blueprintId) || []
      const logEntry = `[${new Date().toISOString()}] ${message}`
      logs.push(logEntry)
      collaborationContext.logs.set(agent.blueprintId, logs)
    }

    agent.shareData = (key: string, value: any) => {
      collaborationContext.sharedData.set(`${agent.blueprintId}:${key}`, value)
      agent.logToCollaboration(`Shared data: ${key}`)
    }

    agent.getData = (key: string) => {
      return collaborationContext.sharedData.get(key)
    }

    agent.getOtherAgents = () => {
      return collaborationContext.agents.filter((a: string) => a !== agent.blueprintId)
    }
  }

  async aggregateTodoResults(todo: any, agents: any[], collaborationContext: any): Promise<string> {
    const agentOutputs = agents.map((agent) => {
      const output = collaborationContext.sharedData.get(`${agent.id}:todo:${todo.id}:output`)
      return {
        agentName: output?.agentName || agent.blueprint?.name || agent.blueprintId,
        specialization: agent.blueprint?.specialization || 'general',
        output: output?.raw || '',
      }
    })

    // Pre-merge: deduplicate common sections
    const preMerged = this.preMergeAgentOutputs(agentOutputs)

    // Use LLM aggregator for final synthesis
    const aggregatorPrompt = `You are the collaborative aggregator. Two agents with different specializations executed the SAME task and produced outputs.

**Task:** ${todo.title}
${todo.description ? `\n**Description:** ${todo.description}` : ''}

**Agent Outputs:**

${agentOutputs
        .map(
          (ao) => `### ${ao.agentName} (${ao.specialization})
${ao.output || '(No output)'}
`
        )
        .join('\n\n')}

**Your Job:**
Synthesize these outputs into ONE coherent result with the following sections:
- **Summary:** High-level overview of what was accomplished
- **Key Findings:** Important discoveries or insights from both agents
- **Implementation Steps:** Concrete steps taken or recommended
- **Code Changes:** Files modified and changes made (deduplicated)
- **Risks/Considerations:** Potential issues identified
- **Next Actions:** Recommended follow-up tasks

Prefer consensus where agents agree. If conflicts exist, explain them and choose the stronger rationale based on the agent's specialization. Be concise but comprehensive.`

    try {
      const messages = [{ role: 'user' as const, content: aggregatorPrompt }]
      let aggregatedText = ''

      for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
        if (ev.type === 'text_delta' && ev.content) {
          aggregatedText += ev.content
        } else if (ev.type === 'complete') {
          break
        }
      }

      // Display aggregated result as a live update
      this.nikCLI.addLiveUpdate({
        type: 'status',
        content: `\n**Aggregated Result for "${todo.title}":**\n\n${aggregatedText}`,
        source: 'aggregator',
      })

      return aggregatedText
    } catch (error: any) {
      // Fallback to simple concatenation if LLM fails
      this.nikCLI.addLiveUpdate({
        type: 'warning',
        content: `⚠️ Aggregator LLM failed, using fallback merge: ${error.message}`,
        source: 'aggregator',
      })
      return preMerged
    }
  }

  preMergeAgentOutputs(
    agentOutputs: Array<{ agentName: string; specialization: string; output: string }>
  ): string {
    const sections: string[] = []

    sections.push(`### Combined Analysis from ${agentOutputs.length} Agents\n`)

    agentOutputs.forEach((ao) => {
      sections.push(`#### ${ao.agentName} (${ao.specialization})`)
      sections.push(ao.output)
      sections.push('')
    })

    return sections.join('\n')
  }

  aggregatePlanResults(plan: any, todoResults: string[]): string {
    const sections: string[] = []

    sections.push(`# ${plan.title || 'Parallel Execution Results'}`)
    sections.push('')
    sections.push(`**Executed by:** ${this.nikCLI.currentCollaborationContext?.agents.length || 0} parallel agents`)
    sections.push(`**Todos completed:** ${todoResults.length}`)
    sections.push('')
    sections.push('---')
    sections.push('')

    todoResults.forEach((result, index) => {
      const todo = plan.todos[index]
      sections.push(`## Todo ${index + 1}: ${todo.title}`)
      sections.push('')
      sections.push(result)
      sections.push('')
      sections.push('---')
      sections.push('')
    })

    return sections.join('\n')
  }
}
