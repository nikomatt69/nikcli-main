import chalk from 'chalk'
import { chatManager } from '../chat/chat-manager'
import { advancedAIProvider } from '../ai/advanced-ai-provider'
import { advancedUI } from '../ui/advanced-cli-ui'
import { toolRouter } from '../core/tool-router'
import { agentLearningSystem } from '../core/agent-learning-system'
import { planningService } from '../services/planning-service'
import { wrapBlue } from '../utils/text-wrapper'

/**
 * DefaultMode - Handles default mode execution
 * Extracted from lines 5970+ in nik-cli.ts
 */
export class DefaultMode {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleDefaultMode(input: string): Promise<void> {
    // Initialize as Unified Aggregator for all event sources
    this.nikCLI.subscribeToAllEventSources()

    // DISABLED: Auto-todo generation in default chat mode
    // Now only triggers when user explicitly mentions "todo"
    try {
      const wantsTodos = /\btodo(s)?\b/i.test(input)
      if (wantsTodos) {
        console.log(chalk.cyan('📋 Detected explicit todo request — generating todos...'))
        await this.autoGenerateTodosAndOrchestrate(input)
        return // Background execution will proceed; keep chat responsive
      }
    } catch {
      /* fallback to normal chat if assessment fails */
    }

    // Handle execute command for last generated plan
    if (input.toLowerCase().trim() === 'execute' && this.nikCLI.lastGeneratedPlan) {
      advancedUI.logFunctionCall('executing')
      advancedUI.logFunctionUpdate('info', 'Executing', '●')
      try {
        await this.nikCLI.planningManager.executePlan(this.nikCLI.lastGeneratedPlan.id)
        console.log(chalk.green('✓ Plan execution completed!'))
        this.nikCLI.lastGeneratedPlan = undefined // Clear the stored plan

        // Restore prompt after plan execution (debounced)
        setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 50)
        return
      } catch (error: any) {
        console.log(chalk.red(`Plan execution failed: ${error?.message || error}`))

        // Restore prompt after error (debounced)
        setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 50)
        return
      }
    }

    // Check if input mentions specific agent
    const agentMatch = input.match(/@(\w+)/)

    if (agentMatch) {
      const agentName = agentMatch[1]
      const task = input.replace(agentMatch[0], '').trim()
      await this.nikCLI.executeAgent(agentName, task, {})
    } else {
      // DEFAULT CHAT MODE: Simple chat (auto-todos handled above)
      let interactiveStarted = false
      try {
        // Direct chat response without complexity assessment or auto-todos
        const toolRecommendations = toolRouter.analyzeMessage({ role: 'user', content: input })
        if (toolRecommendations.length > 0) {
          const topRecommendation = toolRecommendations[0]
          console.log(
            chalk.blue(
              ` Detected ${topRecommendation.tool} intent (${Math.round(topRecommendation.confidence * 100)}% confidence)`
            )
          )

          // Record success intent pattern to learning system
          try {
            agentLearningSystem.recordDecision(
              {
                task: 'default-chat-input',
                availableTools: toolRouter.getAllTools().map((t) => t.tool),
                userContext: input.slice(0, 80),
                previousAttempts: [],
                urgency: 'medium',
              },
              topRecommendation.tool,
              topRecommendation.suggestedParams || {},
              'success',
              0
            )
          } catch {
            // Ignore learning system errors
          }

          // Auto-execute high-confidence tool recommendations in VM if available
          if (topRecommendation.confidence > 0.7 && this.nikCLI.activeVMContainer) {
            console.log(chalk.cyan(`🐳 Executing in VM container: ${this.nikCLI.activeVMContainer.slice(0, 12)}`))
            try {
              await this.nikCLI.executeToolInVM(topRecommendation.tool, topRecommendation.suggestedParams || {}, input)
              console.log(chalk.green(`✓ Tool execution completed in VM`))
              return // Tool executed in VM, return to continue chat flow
            } catch (error: any) {
              console.log(chalk.yellow(`⚠️ VM execution failed, falling back to local: ${error.message}`))

              // Log error but don't throw - allow fallback to AI chat
              console.log(chalk.dim(`   Original tool: ${topRecommendation.tool}`))
              console.log(chalk.dim(`   Confidence: ${Math.round(topRecommendation.confidence * 100)}%`))
            }
          }
        }

        // Activate structured UI for better visualization
        advancedUI.startInteractiveMode()
        interactiveStarted = true

        // Record user message in session
        chatManager.addMessage(input, 'user')

        // Build model-ready messages from session history (respects history setting)
        let messages = chatManager.getContextMessages().map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        }))

        // Handle VM mode execution for generic commands
        if (this.nikCLI.currentMode === 'vm' && this.nikCLI.activeVMContainer) {
          console.log(chalk.cyan(`🐳 Executing in VM container: ${this.nikCLI.activeVMContainer.slice(0, 12)}`))
          try {
            await this.nikCLI.executeCommandInVM(input)
            console.log(chalk.green(`✓ Command executed successfully in VM`))
            return // Command executed in VM, return to continue chat flow
          } catch (error: any) {
            console.log(chalk.yellow(`⚠️ VM execution failed, falling back to AI chat: ${error.message}`))

            // Log detailed error for debugging
            console.log(chalk.dim(`   Command: ${input}`))
            console.log(chalk.dim(`   Container: ${this.nikCLI.activeVMContainer.slice(0, 12)}`))

            // Provide recovery suggestions
            if (error.message.includes('timeout')) {
              console.log(chalk.dim('   💡 Suggestion: Try a simpler command or check container resources'))
            } else if (error.message.includes('No such file')) {
              console.log(chalk.dim('   💡 Suggestion: Check file paths and working directory in VM'))
            } else {
              console.log(chalk.dim('   💡 Suggestion: Use /vm status to check container health'))
            }
          }
        }

        // Auto-compact if approaching token limit with more aggressive thresholds
        const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
        const estimatedTokens = Math.round(totalChars / 4)

        if (estimatedTokens > 100000) {
          // More aggressive - compact at 100k instead of 150k
          console.log(chalk.yellow(`⚠️ Token usage: ${estimatedTokens.toLocaleString()}, auto-compacting...`))
          await this.nikCLI.compactSession()

          // Rebuild messages after compaction
          messages = chatManager.getContextMessages().map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          }))

          // Re-check token count after compaction
          const newTotalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0)
          const newEstimatedTokens = Math.round(newTotalChars / 4)
          console.log(chalk.green(`✓ Compacted to ${newEstimatedTokens.toLocaleString()} tokens`))
        } else if (estimatedTokens > 50000) {
          console.log(wrapBlue(`📊 Token usage: ${estimatedTokens.toLocaleString()}`))
        }

        // Stream assistant response with enhanced streaming
        process.stdout.write(`${chalk.cyan('\nAssistant: ')}`)
        let assistantText = ''
        let hasToolCalls = false

        // Track if we should format output at the end
        let shouldFormatOutput = false
        let streamedLines = 1 // Start with 1 for "Assistant: " header
        const terminalWidth = process.stdout.columns || 80

        // Stream directly through streamttyService
        const { streamttyService } = await import('../services/streamtty-service')

        for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
          if (ev.type === 'text_delta' && ev.content) {
            assistantText += ev.content
            await streamttyService.streamChunk(ev.content, 'ai')

            // Track lines for clearing - remove ANSI codes for accurate visual width
            const visualContent = ev.content.replace(/\x1b\[[0-9;]*m/g, '')
            const newlines = (visualContent.match(/\n/g) || []).length
            const charsWithoutNewlines = visualContent.replace(/\n/g, '').length
            const wrappedLines = Math.ceil(charsWithoutNewlines / terminalWidth)
            streamedLines += newlines + wrappedLines

            // Text content streamed via adapter
          } else if (ev.type === 'complete') {
            // Mark that we should format output after stream ends
            if (assistantText.length > 200) {
              shouldFormatOutput = true
            }
            // Continue with regular complete handling
          } else if (ev.type === 'tool_call') {
            hasToolCalls = true

            // Format tool call as markdown
            const toolCall = this.nikCLI.formatToolCall(ev.toolName || '', ev.toolArgs)
            const toolMarkdown = `\n**${toolCall.name}** \`${toolCall.params}\`\n`
            await streamttyService.streamChunk(toolMarkdown, 'tool')
            streamedLines += 2 // Account for newline + tool message line

            // Log to structured UI with detailed tool information
            const toolDetails = this.nikCLI.formatToolDetails(ev.toolName || '', ev.toolArgs)
            advancedUI.logInfo('tool call', toolDetails)
          } else if (ev.type === 'tool_result') {
            // Tool results are handled by structured UI
            if (ev.toolResult) {
              advancedUI.logFunctionUpdate('success', 'Tool completed', '✓')
            }
          } else if (ev.type === 'error') {
            console.log(chalk.red(`❌ Stream error: ${ev.error}`))
            throw new Error(ev.error)
          }
        }

        // Content already streamed through streamttyService
        if (shouldFormatOutput) {
          // Just add spacing
          console.log('')
        } else {
          // No formatting needed - add spacing after stream
          console.log('\n')
        }

        // Record assistant response in session
        chatManager.addMessage(assistantText, 'assistant')

        // Update token usage after streaming completes (sync with session)
        this.nikCLI.syncTokensFromSession()
      } catch (error: any) {
        console.log(chalk.red(`❌ Error: ${error.message}`))
        this.nikCLI.addLiveUpdate({ type: 'error', content: `Error: ${error.message}`, source: 'default-mode' })
      } finally {
        if (interactiveStarted) {
          try {
            advancedUI.stopInteractiveMode()
          } catch {
            // Ignore cleanup errors
          }
        }
        // Render prompt after output
        setTimeout(() => this.nikCLI.renderPromptAfterOutput(), 50)
      }
    }
  }

  async autoGenerateTodosAndOrchestrate(input: string): Promise<void> {
    try {
      console.log(chalk.blue('📋 Creating execution todos...'))

      // Use agent todo manager directly for chat default (NOT enhanced planning)
      const { agentTodoManager } = await import('../core/agent-todo-manager')

      // Create universal agent ID for this task
      const universalAgentId = `universal-agent-${Date.now()}`

      // Generate todos using agent todo manager (max 6 for chat default)
      const todos = await agentTodoManager.planTodos(universalAgentId, input)

      // Limit to max 6 todos for chat default
      const limitedTodos = todos.slice(0, 6)

      // Display todos to user

      // Start executing todos with background agents
      console.log(chalk.green('🚀 Starting background execution...'))
      console.log(
        chalk.gray(
          `I've broken down your request into ${limitedTodos.length} actionable steps and started working on them in the background.`
        )
      )
      console.log(chalk.gray('You can continue chatting while I work.'))

      // Execute todos in background (non-blocking)
      this.executeInBackground(limitedTodos, universalAgentId)
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to generate todos: ${error.message}`))
      // Fallback to direct response
      console.log(chalk.yellow('⚡︎ Falling back to direct chat response...'))

      // Continue with normal chat flow
      const relevantContext = await this.nikCLI.getRelevantProjectContext(input)
      const _enhancedInput = relevantContext ? `${input}\n\nContext: ${relevantContext}` : input

      // Build model-ready messages
      chatManager.addMessage(input, 'user')
      const messages = chatManager.getContextMessages().map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }))

      // Simple AI response
      process.stdout.write(`${chalk.cyan('\nAssistant: ')}`)
      let _assistantText = ''
      let _shouldFormatOutput = false
      let _streamedLines = 0
      const _terminalWidth = process.stdout.columns || 80

      for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
        if (ev.type === 'text_delta' && ev.content) {
          _assistantText += ev.content
          // Stream through streamttyService for markdown rendering
          const { streamttyService } = await import('../services/streamtty-service')
          await streamttyService.streamChunk(ev.content, 'ai')

          // Track lines for clearing
          const linesInChunk = Math.ceil(ev.content.length / _terminalWidth) + (ev.content.match(/\n/g) || []).length
          _streamedLines += linesInChunk
        } else if (ev.type === 'complete') {
          // Mark that we should format output
          if (_assistantText.length > 200) {
            _shouldFormatOutput = true
          }
        }
      }

      // Already rendered through streamttyService during streaming
      // No need for additional formatting or clearing
      if (_shouldFormatOutput) {
        // Just add a newline for spacing
        console.log('')
      }

      // Update token usage after streaming completes (sync with session)
      this.nikCLI.syncTokensFromSession()
    }
  }

  executeInBackground(_todos: any[], agentId: string): void {
    // Non-blocking execution
    setTimeout(async () => {
      try {
        const { agentTodoManager } = await import('../core/agent-todo-manager')

        // Todos are already generated by agentTodoManager.planTodos()
        // Just execute them directly
        await agentTodoManager.executeTodos(agentId)

        console.log(chalk.green('\n✅ Background execution completed!'))
        console.log(chalk.gray('All background tasks have been completed successfully.'))
      } catch (error: any) {
        console.log(chalk.red(`\n❌ Background execution failed: ${error.message}`))
        console.log(chalk.gray(`Some background tasks encountered issues: ${error.message}`))
      }
    }, 100) // Small delay to avoid blocking the chat
  }
}
