import chalk from 'chalk'
import boxen from 'boxen'
import { memoryService } from '../services/memory-service'

/**
 * MemoryPanels - Handles memory panel commands
 * Extracted from lines 15131-15357 in nik-cli.ts
 */
export class MemoryPanels {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleMemoryPanels(args: string[]): Promise<void> {
    const showHelp = () => {
      const lines = [
        '/memory stats            - Show memory statistics',
        '/memory config           - Show memory configuration',
        '/memory context          - Show current session context',
        '/memory personalization  - Show inferred user personalization',
        '/memory cleanup          - Clean low-importance, older context (safe)',
        '',
        'Related:',
        '/remember "fact"        - Store an important fact',
        '/recall "query"         - Search memories',
        '/forget <id>            - Delete a memory by ID',
      ].join('\n')

      this.nikCLI.printPanel(
        boxen(lines, {
          title: 'Memory: Help',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
        }),
        'general'
      )
    }

    if (!args || args.length === 0 || args[0].toLowerCase() === 'help') {
      showHelp()
      return
    }

    const sub = args[0].toLowerCase()
    try {
      switch (sub) {
        case 'stats': {
          const stats = memoryService.getMemoryStats()
          const lines: string[] = []
          lines.push(`${chalk.green('Total Memories:')} ${stats.totalMemories}`)
          lines.push(
            `${chalk.green('Average Importance:')} ${stats.averageImportance ? stats.averageImportance.toFixed(1) : '0.0'}/10`
          )
          if (stats.oldestMemory) {
            lines.push(`${chalk.green('Oldest:')} ${new Date(stats.oldestMemory).toLocaleString()}`)
          }
          if (stats.newestMemory) {
            lines.push(`${chalk.green('Newest:')} ${new Date(stats.newestMemory).toLocaleString()}`)
          }
          if (stats.memoriesBySource && Object.keys(stats.memoriesBySource).length > 0) {
            lines.push('')
            lines.push(chalk.cyan('By Source:'))
            Object.entries(stats.memoriesBySource).forEach(([src, count]) => lines.push(`  • ${src}: ${count}`))
          }

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: 'Memory: Statistics',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
          break
        }

        case 'config': {
          const cfg = memoryService.getConfig?.() || {}
          const lines: string[] = []
          lines.push(`${chalk.green('Enabled:')} ${cfg.enabled ? 'Yes' : 'No'}`)
          lines.push(`${chalk.green('Backend:')} ${cfg.backend || 'memory'}`)
          if (cfg.embedding_model) lines.push(`${chalk.green('Embedding Model:')} ${cfg.embedding_model}`)
          if (cfg.max_memories !== undefined) lines.push(`${chalk.green('Max Memories:')} ${cfg.max_memories}`)
          if (cfg.auto_cleanup !== undefined)
            lines.push(`${chalk.green('Auto Cleanup:')} ${cfg.auto_cleanup ? 'Yes' : 'No'}`)
          if (cfg.similarity_threshold !== undefined)
            lines.push(`${chalk.green('Similarity Threshold:')} ${cfg.similarity_threshold}`)
          if (cfg.importance_decay_days !== undefined)
            lines.push(`${chalk.green('Importance Decay (days):')} ${cfg.importance_decay_days}`)

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: 'Memory: Configuration',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'yellow',
            }),
            'general'
          )
          break
        }

        case 'context': {
          const session = memoryService.getCurrentSession?.()
          if (!session) {
            this.nikCLI.printPanel(
              boxen('No active memory session', {
                title: 'Memory: Context',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }

          const recents = await memoryService.getConversationContext(session.sessionId, 2)
          const lines: string[] = []
          lines.push(`${chalk.green('Session ID:')} ${session.sessionId}`)
          if (session.userId) lines.push(`${chalk.green('User ID:')} ${session.userId}`)
          if (session.topic) lines.push(`${chalk.green('Topic:')} ${session.topic}`)
          lines.push(`${chalk.green('Participants:')} ${session.participants.join(', ')}`)
          lines.push(`${chalk.green('Started:')} ${new Date(session.startTime).toLocaleString()}`)
          lines.push(`${chalk.green('Last Activity:')} ${new Date(session.lastActivity).toLocaleString()}`)

          if (recents.length > 0) {
            lines.push('')
            lines.push(chalk.cyan(`Recent Context (${recents.length}):`))
            recents.slice(0, 5).forEach((m: any) => {
              const text = (m.content || '').replace(/\s+/g, ' ').slice(0, 80)
              lines.push(`  • ${text}${m.content.length > 80 ? '…' : ''}`)
            })
          }

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '⚡︎ Memory: Context',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'cyan',
            })
          )
          break
        }

        case 'personalization': {
          const session = memoryService.getCurrentSession?.()
          if (!session?.userId) {
            this.nikCLI.printPanel(
              boxen('No user ID in current session', {
                title: '⚡︎ Memory: Personalization',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const p = await memoryService.getPersonalization(session.userId)
          if (!p) {
            this.nikCLI.printPanel(
              boxen('No personalization data available', {
                title: '⚡︎ Memory: Personalization',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'yellow',
              })
            )
            break
          }
          const lines: string[] = []
          lines.push(`${chalk.green('User ID:')} ${p.userId}`)
          lines.push(`${chalk.green('Communication Style:')} ${p.communication_style}`)
          lines.push(`${chalk.green('Preferred Length:')} ${p.interaction_patterns.preferred_response_length}`)
          lines.push(`${chalk.green('Detail Level:')} ${p.interaction_patterns.preferred_detail_level}`)
          if (p.expertise_areas?.length)
            lines.push(`${chalk.green('Expertise Areas:')} ${p.expertise_areas.slice(0, 5).join(', ')}`)
          if (p.frequent_topics?.length)
            lines.push(`${chalk.green('Frequent Topics:')} ${p.frequent_topics.slice(0, 5).join(', ')}`)
          if (p.interaction_patterns.common_tasks?.length)
            lines.push(`${chalk.green('Common Tasks:')} ${p.interaction_patterns.common_tasks.slice(0, 5).join(', ')}`)

          this.nikCLI.printPanel(
            boxen(lines.join('\n'), {
              title: '⚡︎ Memory: Personalization',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'magenta',
            })
          )
          break
        }

        case 'cleanup': {
          // Simple, safe cleanup: delete low-importance (<=3) older than 14 days
          const now = Date.now()
          const twoWeeks = 14 * 24 * 60 * 60 * 1000
          const deleted = await memoryService.deleteMemoriesByCriteria({
            timeRange: { start: 0, end: now - twoWeeks },
            importance: { max: 3 },
          })

          const msg =
            deleted > 0 ? `Deleted ${deleted} low-importance, older memories` : 'No eligible memories to clean'
          this.nikCLI.printPanel(
            boxen(msg, {
              title: '⚡︎ Memory: Cleanup',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: deleted > 0 ? 'green' : 'yellow',
            })
          )
          break
        }

        default:
          showHelp()
      }
    } catch (error: any) {
      this.nikCLI.printPanel(
        boxen(`Memory command failed: ${error.message}`, {
          title: '❌ Memory Error',
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
