import chalk from 'chalk'
import boxen from 'boxen'
import fs from 'node:fs/promises'
import { chatManager } from '../chat/chat-manager'
import { authProvider } from '../providers/supabase/auth-provider'
import { configManager } from '../core/config-manager'
import { advancedAIProvider } from '../ai/advanced-ai-provider'

/**
 * SessionManagement - Handles session management commands
 * Extracted from lines 7128-7330 + 15815-16443 in nik-cli.ts
 */
export class SessionManagement {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleSessionManagement(command: string, args: string[]): Promise<void> {
    try {
      switch (command) {
        case 'new': {
          // Check session quota before creating new session
          const sessionQuota = authProvider.checkQuota('sessions')
          if (!sessionQuota.allowed) {
            this.nikCLI.printPanel(
              boxen(
                chalk.red(`❌ Session limit reached\n\n`) +
                  chalk.gray(
                    `Current: ${chalk.cyan(sessionQuota.used.toString())}/${chalk.cyan(sessionQuota.limit.toString())}\n`
                  ) +
                  chalk.gray('Upgrade to Pro to increase limits'),
                {
                  title: 'Session Quota Exceeded',
                  padding: 1,
                  margin: 1,
                  borderStyle: 'round',
                  borderColor: 'red',
                }
              )
            )
            break
          }

          const title = args.join(' ') || undefined
          const session = chatManager.createNewSession(title)

          // Record session usage in database
          try {
            await authProvider.recordUsage('sessions', 1)
          } catch (error: any) {
            console.debug('[new] Failed to record session usage:', error.message)
          }

          this.nikCLI.printPanel(
            boxen(`${session.title} (${session.id.slice(0, 8)})`, {
              title: '🆕 New Session',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }
        case 'sessions': {
          const sessions = chatManager.listSessions()
          const current = chatManager.getCurrentSession()
          const lines: string[] = []
          if (sessions.length === 0) {
            lines.push('No sessions found')
          } else {
            sessions.forEach((session) => {
              const isCurrent = session.id === current?.id
              const prefix = isCurrent ? '→ ' : '  '
              const messageCount = session.messages.filter((m) => m.role !== 'system').length
              lines.push(`${prefix}${session.title} (${session.id.slice(0, 8)})`)
              lines.push(`   ${messageCount} messages | ${session.updatedAt.toLocaleString()}`)
            })
          }
          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: 'Chat Sessions',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }
        case 'export': {
          const sessionId = args[0]
          const markdown = chatManager.exportSession(sessionId)
          const filename = `chat-export-${Date.now()}.md`
          await fs.writeFile(filename, markdown)
          this.nikCLI.printPanel(
            boxen(`Session exported to ${filename}`, {
              title: '📤 Export',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }
        case 'stats': {
          const stats = chatManager.getSessionStats()
          const modelInfo = advancedAIProvider.getCurrentModelInfo()
          const content = [
            `Model: ${modelInfo.name}`,
            `Total Sessions: ${stats.totalSessions}`,
            `Total Messages: ${stats.totalMessages}`,
            `Current Session Messages: ${stats.currentSessionMessages}`,
          ].join('\n')
          this.nikCLI.printPanel(
            boxen(content, {
              title: 'Usage Statistics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            })
          )
          break
        }
        case 'history': {
          if (args.length === 0) {
            const enabled = configManager.get('chatHistory')
            console.log(chalk.green(`Chat history: ${enabled ? 'enabled' : 'disabled'}`))
            break
          }
          const setting = args[0].toLowerCase()
          if (setting !== 'on' && setting !== 'off') {
            this.nikCLI.printPanel(
              boxen('Usage: /history <on|off>', {
                title: 'History Command',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red',
              })
            )
            break
          }
          configManager.set('chatHistory', setting === 'on')
          console.log(chalk.green(`✓ Chat history ${setting === 'on' ? 'enabled' : 'disabled'}`))
          break
        }
        case 'debug': {
          console.log(chalk.blue.bold('\n🔍 Debug Information:'))
          console.log(chalk.gray('═'.repeat(40)))
          const currentModel = configManager.getCurrentModel()
          console.log(chalk.green(`Current Model: ${currentModel}`))
          const models = configManager.get('models')
          const currentModelConfig = models[currentModel]
          if (currentModelConfig) {
            console.log(chalk.green(`Provider: ${currentModelConfig.provider}`))
            console.log(chalk.green(`Model: ${currentModelConfig.model}`))
          }
          // Test API key
          const apiKey = configManager.getApiKey(currentModel)
          if (apiKey) {
            console.log(
              chalk.green(`✓ API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)} (${apiKey.length} chars)`)
            )
          } else {
            console.log(chalk.red(`❌ API Key: Not configured`))
          }
          break
        }
        case 'temp': {
          if (args.length === 0) {
            console.log(chalk.green(`Current temperature: ${configManager.get('temperature')}`))
            break
          }
          const temp = parseFloat(args[0])
          if (Number.isNaN(temp) || temp < 0 || temp > 2) {
            console.log(chalk.red('Temperature must be between 0.0 and 2.0'))
            break
          }
          configManager.set('temperature', temp)
          console.log(chalk.green(`✓ Temperature set to ${temp}`))
          break
        }
        case 'system': {
          if (args.length === 0) {
            const session = chatManager.getCurrentSession()
            console.log(chalk.green('Current system prompt:'))
            console.log(chalk.gray(session?.systemPrompt || 'None'))
            break
          }
          const prompt = args.join(' ')
          const session = chatManager.getCurrentSession()
          if (session) {
            session.systemPrompt = prompt
            // Update the system message
            const systemMsgIndex = session.messages.findIndex((m) => m.role === 'system')
            if (systemMsgIndex >= 0) {
              session.messages[systemMsgIndex].content = prompt
            } else {
              session.messages.unshift({
                role: 'system',
                content: prompt,
                timestamp: new Date(),
              })
            }
            console.log(chalk.green('✓ System prompt updated'))
          }
          break
        }
      }
    } catch (error: any) {
      this.nikCLI.addLiveUpdate({ type: 'error', content: `Session management failed: ${error.message}`, source: 'session' })
      console.log(chalk.red(`❌ Error: ${error.message}`))
    } finally {
      await this.nikCLI.performCommandCleanup()
    }
  }

  async handleResumeCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      if (args.length === 0) {
        // Show list of available sessions
        const sessions = await workSessionManager.listSessions()

        if (sessions.length === 0) {
          this.nikCLI.printPanel(
            boxen('No saved sessions found.\n\nUse /save-session to create a new session.', {
              title: '💼 Work Sessions',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            })
          )
          return
        }

        const lines: string[] = []
        lines.push(`Found ${sessions.length} saved session(s)\n`)
        sessions.slice(0, 10).forEach((s, idx) => {
          const date = new Date(s.lastAccessedAt).toLocaleString()
          lines.push(`${idx + 1}. ${s.name}`)
          lines.push(`   ID: ${s.id}`)
          lines.push(`   Last accessed: ${date}`)
          lines.push(`   Edits: ${s.totalEdits} | Messages: ${s.totalMessages} | Files: ${s.filesModified}`)
          if (idx < sessions.length - 1) lines.push('')
        })
        lines.push('\nUse /resume <session-id> to resume a session')

        this.nikCLI.printPanel(
          boxen(lines.join('\n'), {
            title: '💼 Available Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan',
          }),
          'general'
        )
        return
      }

      const sessionId = args[0]
      const session = await workSessionManager.resumeSession(sessionId)

      // Restore messages to chat manager
      if (session.messages.length > 0) {
        // Create new chat session without system prompt to avoid duplicate system message
        const newChatSession = chatManager.createNewSession(session.name, undefined)

        // Directly populate messages array to avoid side effects
        // This prevents duplicate messages and avoids triggering history trim
        if (newChatSession) {
          newChatSession.messages = session.messages.map((msg) => {
            let timestamp: Date
            try {
              timestamp = new Date()
              // Validate date is not Invalid Date
              if (isNaN(timestamp.getTime())) {
                timestamp = new Date()
              }
            } catch (error) {
              timestamp = new Date()
            }

            return {
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content || '',
              timestamp,
            }
          })

          try {
            newChatSession.updatedAt = new Date(session.updatedAt)
            // Validate date
            if (isNaN(newChatSession.updatedAt.getTime())) {
              newChatSession.updatedAt = new Date()
            }
          } catch (error) {
            newChatSession.updatedAt = new Date()
          }
        }

        console.log(chalk.blue(`✓ Restored ${session.messages.length} messages to chat session "${session.name}"`))
      }

      this.nikCLI.printPanel(
        boxen(
          `Session resumed: ${session.name}\n\nMessages: ${session.metadata.totalMessages}\nEdits: ${session.metadata.totalEdits}\nFiles modified: ${session.stats.filesModified}`,
          {
            title: '✓ Session Resumed',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          }
        )
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to resume session: ${error.message}`, {
          title: '❌ Resume Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleWorkSessionsList(): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const sessions = await workSessionManager.listSessions()

      if (sessions.length === 0) {
        this.nikCLI.printPanel(
          boxen('No saved sessions found.\n\nUse /save-session <name> to create a new session.', {
            title: '💼 Work Sessions',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const lines: string[] = []
      lines.push(`Total sessions: ${sessions.length}\n`)
      sessions.forEach((s, idx) => {
        const created = new Date(s.createdAt).toLocaleString()
        const accessed = new Date(s.lastAccessedAt).toLocaleString()
        const tags = (s.tags?.length ?? 0) > 0 ? ` [${s.tags!.join(', ')}]` : ''

        lines.push(`${idx + 1}. ${s.name}${tags}`)
        lines.push(`   ID: ${s.id}`)
        lines.push(`   Created: ${created}`)
        lines.push(`   Last accessed: ${accessed}`)
        lines.push(`   Stats: ${s.totalEdits} edits, ${s.totalMessages} messages, ${s.filesModified} files`)
        if (idx < sessions.length - 1) lines.push('')
      })

      this.nikCLI.printPanel(
        boxen(lines.join('\n'), {
          title: '💼 All Work Sessions',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to list sessions: ${error.message}`, {
          title: '❌ List Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleSaveSessionCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')

      // Get current chat session messages
      const chatSession = chatManager.getCurrentSession()
      const chatMessages = (chatSession?.messages || []).filter(
        (msg) => msg.role && msg.content && (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system')
      )

      const currentWorkSession = workSessionManager.getCurrentSession()

      if (!currentWorkSession) {
        // Create new work session with validated name
        const rawName = args.join(' ').trim() || chatSession?.title || ''
        const name = rawName || `Session ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`

        // Validate name length
        const validatedName = name.length > 100 ? name.substring(0, 100) + '...' : name

        const session = await workSessionManager.createSession(validatedName)

        // Add chat messages to work session with validation
        if (chatMessages.length > 0) {
          chatMessages.forEach((msg) => {
            try {
              workSessionManager.addMessage({
                role: msg.role as 'user' | 'assistant',
                content: msg.content || '',
                timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
                metadata: {},
              })
            } catch (error) {
              console.log(chalk.gray(`⚠️ Skipped invalid message`))
            }
          })
        }

        await workSessionManager.saveCurrentSession()

        this.nikCLI.printPanel(
          boxen(`New session created: ${session.name}\nID: ${session.id}\nMessages: ${session.metadata.totalMessages}`, {
            title: '✓ Session Created',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
      } else {
        // Update existing session name if provided
        if (args.length > 0) {
          const rawNewName = args.join(' ').trim()
          const validatedNewName = rawNewName.length > 100 ? rawNewName.substring(0, 100) + '...' : rawNewName
          workSessionManager.updateCurrentSession({ name: validatedNewName })
        }

        // Sync current chat messages to work session (only new ones)
        const existingMessageCount = currentWorkSession.messages.length
        if (chatMessages.length > existingMessageCount) {
          // Add new messages that aren't already in work session with validation
          const newMessages = chatMessages.slice(existingMessageCount)
          newMessages.forEach((msg) => {
            try {
              workSessionManager.addMessage({
                role: msg.role as 'user' | 'assistant',
                content: msg.content || '',
                timestamp: msg.timestamp instanceof Date ? msg.timestamp.toISOString() : new Date().toISOString(),
                metadata: {},
              })
            } catch (error) {
              console.log(chalk.gray(`⚠️ Skipped invalid message`))
            }
          })
        }

        await workSessionManager.saveCurrentSession()

        this.nikCLI.printPanel(
          boxen(
            `Session saved: ${currentWorkSession.name}\nID: ${currentWorkSession.id}\nEdits: ${currentWorkSession.metadata.totalEdits} | Messages: ${currentWorkSession.metadata.totalMessages}`,
            {
              title: ' Session Saved',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to save session: ${error.message}`, {
          title: '❌ Save Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleDeleteSessionCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.nikCLI.printPanel(
          boxen('Usage: /delete-session <session-id>\n\nUse /work-sessions to see all sessions.', {
            title: '💼 Delete Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const { workSessionManager } = await import('../persistence/work-session-manager')
      const sessionId = args[0]
      const success = await workSessionManager.deleteSession(sessionId)

      if (success) {
        this.nikCLI.printPanel(
          boxen(`Session deleted: ${sessionId}`, {
            title: '✓ Session Deleted',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
          })
        )
      } else {
        this.nikCLI.printPanel(
          boxen(`Session not found: ${sessionId}`, {
            title: '⚠️ Not Found',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to delete session: ${error.message}`, {
          title: '❌ Delete Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleExportSessionCommand(args: string[]): Promise<void> {
    try {
      if (args.length < 2) {
        this.nikCLI.printPanel(
          boxen('Usage: /export-session <session-id> <export-path>\n\nExample: /export-session abc123 ./backup/session.json', {
            title: '📦 Export Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          })
        )
        return
      }

      const { workSessionManager } = await import('../persistence/work-session-manager')
      const sessionId = args[0]
      const exportPath = args[1]

      await workSessionManager.exportSession(sessionId, exportPath)

      this.nikCLI.printPanel(
        boxen(`Session exported successfully\n\nFrom: ${sessionId}\nTo: ${exportPath}`, {
          title: '✓ Session Exported',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        }),
        'general'
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to export session: ${error.message}`, {
          title: '❌ Export Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleUndoCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.nikCLI.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session before using undo.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const count = args.length > 0 ? parseInt(args[0], 10) : 1
      if (isNaN(count) || count < 1) {
        this.nikCLI.printPanel(
          boxen('Invalid count. Usage: /undo [count]\n\nExample: /undo 3', {
            title: '⚠️ Invalid Input',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const undoneOps = await workSessionManager.undo(count)

      if (undoneOps.length === 0) {
        this.nikCLI.printPanel(
          boxen('No operations to undo.', {
            title: '↶ Undo',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const lines: string[] = []
      lines.push(`Undone ${undoneOps.length} operation(s)\n`)
      undoneOps.forEach((op) => {
        const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
        lines.push(`${opIcon} ${op.operation.toUpperCase()} - ${op.filePath}`)
      })

      this.nikCLI.printPanel(
        boxen(lines.join('\n'), {
          title: '↶ Undo Complete',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Undo failed: ${error.message}`, {
          title: '❌ Undo Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleRedoCommand(args: string[]): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.nikCLI.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session before using redo.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const count = args.length > 0 ? parseInt(args[0], 10) : 1
      if (isNaN(count) || count < 1) {
        this.nikCLI.printPanel(
          boxen('Invalid count. Usage: /redo [count]\n\nExample: /redo 2', {
            title: '⚠️ Invalid Input',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const redoneOps = await workSessionManager.redo(count)

      if (redoneOps.length === 0) {
        this.nikCLI.printPanel(
          boxen('No operations to redo.', {
            title: '↷ Redo',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const lines: string[] = []
      lines.push(`Redone ${redoneOps.length} operation(s)\n`)
      redoneOps.forEach((op) => {
        const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
        lines.push(`${opIcon} ${op.operation.toUpperCase()} - ${op.filePath}`)
      })

      this.nikCLI.printPanel(
        boxen(lines.join('\n'), {
          title: '↷ Redo Complete',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'green',
        })
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Redo failed: ${error.message}`, {
          title: '❌ Redo Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }

  async handleEditHistoryCommand(): Promise<void> {
    try {
      const { workSessionManager } = await import('../persistence/work-session-manager')
      const currentSession = workSessionManager.getCurrentSession()

      if (!currentSession) {
        this.nikCLI.printPanel(
          boxen('No active work session.\n\nUse /save-session to create a session.', {
            title: '⚠️ No Active Session',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
          }),
          'general'
        )
        return
      }

      const { editHistoryManager } = await import('../persistence/edit-history-manager')
      const summary = editHistoryManager.getHistorySummary()
      const stats = editHistoryManager.getStatistics()

      const lines: string[] = []
      lines.push('Stack Status:')
      lines.push(`  Undo available: ${summary.undoCount} operations`)
      lines.push(`  Redo available: ${summary.redoCount} operations`)
      lines.push('')
      lines.push('Statistics:')
      lines.push(`  Total operations: ${stats.totalOperations}`)
      lines.push(`  Edit operations: ${stats.editOperations}`)
      lines.push(`  Create operations: ${stats.createOperations}`)
      lines.push(`  Delete operations: ${stats.deleteOperations}`)
      lines.push(`  Unique files: ${stats.uniqueFiles}`)

      if (summary.recentOperations.length > 0) {
        lines.push('')
        lines.push('Recent Edits:')
        summary.recentOperations.slice(0, 5).forEach((op) => {
          const opIcon = op.operation === 'create' ? '🆕' : op.operation === 'delete' ? '🗑️' : '✏️'
          const timestamp = new Date(op.timestamp).toLocaleTimeString()
          lines.push(`  ${opIcon} ${timestamp} - ${op.operation.toUpperCase()}`)
          lines.push(`     ${op.filePath}`)
        })
      }

      this.nikCLI.printPanel(
        boxen(lines.join('\n'), {
          title: '📝 Edit History',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        })
      )
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Failed to get edit history: ${error.message}`, {
          title: '❌ History Error',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'red',
        }),
        'general'
      )
    }
  }
}
