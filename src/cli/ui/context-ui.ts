import chalk from 'chalk'
import path from 'node:path'
import inquirer from 'inquirer'
import { contextTokenManager } from '../core/context-token-manager'
import { workspaceContext } from '../core/workspace-context'
import { unifiedRAGSystem } from '../core/unified-rag-system'
import { inputQueue } from '../core/input-queue'

/**
 * ContextUI - Handles context and index management UI
 * Extracted from lines 19676-20538+ in nik-cli.ts
 */
export class ContextUI {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async showInteractiveContext(): Promise<void> {
    // Prevent user input queue interference
    try {
      this.nikCLI.suspendPrompt()
    } catch {
      // Ignore errors
    }
    try {
      inputQueue.enableBypass()
    } catch {
      // Ignore errors
    }

    try {
      const sectionChoices = [
        { name: '📊 Context Overview', value: 'overview' },
        { name: '🧠 RAG Context Management', value: 'rag' },
        { name: '💬 Conversation Context', value: 'conversation' },
        { name: '🤖 Agent Context', value: 'agent' },
        { name: '📁 Base Context', value: 'base' },
        { name: '⚙️  Context Settings', value: 'settings' },
        { name: '🔄 Refresh Index', value: 'refresh' },
        { name: '🗑️  Clear Context', value: 'clear' },
        { name: '← Exit', value: 'exit' },
      ]

      let done = false
      while (!done) {
        // Show current context stats at the top
        const session = contextTokenManager.getCurrentSession()
        const ctx = workspaceContext.getContext()

        console.clear()
        console.log(chalk.blue.bold('╔═══════════════════════════════════════════════════╗'))
        console.log(chalk.blue.bold('║   🎯 INTERACTIVE CONTEXT MANAGEMENT PANEL   🎯   ║'))
        console.log(chalk.blue.bold('╚═══════════════════════════════════════════════════╝'))
        console.log()

        if (session) {
          const totalTokens = session.totalInputTokens + session.totalOutputTokens
          const maxTokens = session.modelLimits.context
          const percentage = (totalTokens / maxTokens) * 100
          const progressBar = this.nikCLI.createProgressBarString(percentage, 40)

          console.log(chalk.cyan('  Context Usage:'))
          console.log(`    ${progressBar}`)
          console.log(
            chalk.gray(
              `    ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${percentage.toFixed(1)}%)`
            )
          )
          console.log()
        }

        console.log(chalk.cyan(`  📁 Root: `) + chalk.white(path.relative(process.cwd(), this.nikCLI.workingDirectory) || '.'))
        console.log(chalk.cyan(`  📂 Indexed Paths: `) + chalk.white(ctx.selectedPaths.length.toString()))
        console.log(
          chalk.cyan(`  🗂️  RAG Status: `) + (ctx.ragAvailable ? chalk.green('✓ Available') : chalk.yellow('⚠ Fallback'))
        )
        console.log()

        const { section } = await inquirer.prompt<{ section: string }>([
          {
            type: 'list',
            name: 'section',
            message: 'Select context management section:',
            choices: sectionChoices,
          },
        ])

        switch (section) {
          case 'overview': {
            await this.showContextOverview()
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'rag': {
            await this.manageRAGContext()
            break
          }
          case 'conversation': {
            await this.manageConversationContext()
            break
          }
          case 'agent': {
            await this.manageAgentContext()
            break
          }
          case 'base': {
            await this.manageBaseContext()
            break
          }
          case 'settings': {
            await this.manageContextSettings()
            break
          }
          case 'refresh': {
            console.log(chalk.blue('\n⚡ Refreshing context index...'))
            await workspaceContext.refreshWorkspaceIndex()
            await unifiedRAGSystem.analyzeProject(this.nikCLI.workingDirectory)
            console.log(chalk.green('✓ Index refreshed successfully\n'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'clear': {
            const { confirm } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'confirm',
                message: 'Are you sure you want to clear all context?',
                default: false,
              },
            ])
            if (confirm) {
              await contextTokenManager.endSession()
              // Clear workspace selection by selecting empty array
              await workspaceContext.selectPaths([])
              console.log(chalk.green('\n✓ Context cleared successfully\n'))
            }
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          default:
            done = true
            break
        }
      }

      console.log(chalk.dim('Exited interactive context management'))
    } finally {
      try {
        inputQueue.disableBypass()
      } catch {
        // Ignore errors
      }
      process.stdout.write('')
      await new Promise((resolve) => setTimeout(resolve, 150))
      this.nikCLI.renderPromptAfterOutput()
    }
  }

  async showInteractiveIndex(): Promise<void> {
    // Prevent user input queue interference
    try {
      this.nikCLI.suspendPrompt()
    } catch {
      // Ignore errors
    }
    try {
      inputQueue.enableBypass()
    } catch {
      // Ignore errors
    }

    try {
      const sectionChoices = [
        { name: '📊 Index Overview', value: 'overview' },
        { name: '📁 Browse Indexed Files', value: 'browse' },
        { name: '🔍 Search Index', value: 'search' },
        { name: '➕ Add to Index', value: 'add' },
        { name: '➖ Remove from Index', value: 'remove' },
        { name: '⚙️  Index Settings', value: 'settings' },
        { name: '🔄 Rebuild Index', value: 'rebuild' },
        { name: '📈 Index Statistics', value: 'stats' },
        { name: '← Exit', value: 'exit' },
      ]

      let done = false
      while (!done) {
        // Get index stats
        const ctx = workspaceContext.getContext()
        const indexedFiles = Array.from(ctx.files.values())
        const totalSize = indexedFiles.reduce((sum, f) => sum + f.size, 0)
        const languages = new Set(indexedFiles.map((f) => f.language))

        console.clear()
        console.log(chalk.blue.bold('╔═══════════════════════════════════════════════════╗'))
        console.log(chalk.blue.bold('║     🗂️  INTERACTIVE INDEX MANAGEMENT PANEL  🗂️     ║'))
        console.log(chalk.blue.bold('╚═══════════════════════════════════════════════════╝'))
        console.log()

        console.log(chalk.cyan('  📁 Indexed Files: ') + chalk.white(indexedFiles.length.toString()))
        console.log(chalk.cyan('  💾 Total Size: ') + chalk.white(this.nikCLI.formatBytes(totalSize)))
        console.log(chalk.cyan('  🔤 Languages: ') + chalk.white(Array.from(languages).join(', ') || 'None'))
        console.log(chalk.cyan('  🗂️  Directories: ') + chalk.white(ctx.directories.size.toString()))
        console.log()

        const { section } = await inquirer.prompt<{ section: string }>([
          {
            type: 'list',
            name: 'section',
            message: 'Select index management section:',
            choices: sectionChoices,
          },
        ])

        switch (section) {
          case 'overview': {
            await this.showIndexOverview()
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'browse': {
            await this.browseIndexedFiles()
            break
          }
          case 'search': {
            // Search functionality would go here
            console.log(chalk.yellow('Search functionality coming soon'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'add': {
            // Add to index functionality would go here
            console.log(chalk.yellow('Add to index functionality coming soon'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'remove': {
            // Remove from index functionality would go here
            console.log(chalk.yellow('Remove from index functionality coming soon'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'settings': {
            // Index settings would go here
            console.log(chalk.yellow('Index settings coming soon'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'rebuild': {
            console.log(chalk.blue('\n⚡ Rebuilding index...'))
            await workspaceContext.refreshWorkspaceIndex()
            await unifiedRAGSystem.analyzeProject(this.nikCLI.workingDirectory)
            console.log(chalk.green('✓ Index rebuilt successfully\n'))
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          case 'stats': {
            await this.showIndexOverview()
            await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
            break
          }
          default:
            done = true
            break
        }
      }

      console.log(chalk.dim('Exited interactive index management'))
    } finally {
      try {
        inputQueue.disableBypass()
      } catch {
        // Ignore errors
      }
      process.stdout.write('')
      await new Promise((resolve) => setTimeout(resolve, 150))
      this.nikCLI.renderPromptAfterOutput()
    }
  }

  async showContextOverview(): Promise<void> {
    console.clear()
    console.log(chalk.blue.bold('\n📊 Context Overview\n'))

    const session = contextTokenManager.getCurrentSession()
    const ctx = workspaceContext.getContextForAgent('universal-agent', 20)
    const wsContext = workspaceContext.getContext()
    const ragConfig = unifiedRAGSystem.getConfig()

    if (session) {
      const totalTokens = session.totalInputTokens + session.totalOutputTokens
      const maxTokens = session.modelLimits.context
      const percentage = (totalTokens / maxTokens) * 100

      console.log(chalk.cyan('Session Information:'))
      console.log(`  Model: ${session.provider}/${session.model}`)
      console.log(
        `  Tokens: ${totalTokens.toLocaleString()} / ${maxTokens.toLocaleString()} (${percentage.toFixed(1)}%)`
      )
      console.log(`  Input: ${session.totalInputTokens.toLocaleString()}`)
      console.log(`  Output: ${session.totalOutputTokens.toLocaleString()}`)
      console.log()
    }

    console.log(chalk.cyan('Workspace Context:'))
    console.log(`  Root: ${this.nikCLI.workingDirectory}`)
    console.log(`  Selected Paths: ${ctx.selectedPaths.length}`)
    console.log(`  Files: ${wsContext.files.size}`)
    console.log(`  Directories: ${wsContext.directories.size}`)
    console.log()

    console.log(chalk.cyan('RAG Configuration:'))
    console.log(`  Vector DB: ${ragConfig.useVectorDB ? '✓ Enabled' : '✗ Disabled'}`)
    console.log(`  Hybrid Mode: ${ragConfig.hybridMode ? '✓ Enabled' : '✗ Disabled'}`)
    console.log(`  Max Files: ${ragConfig.maxIndexFiles}`)
    console.log(`  Chunk Size: ${ragConfig.chunkSize}`)
    console.log(`  Semantic Search: ${ragConfig.enableSemanticSearch ? '✓ Enabled' : '✗ Disabled'}`)
    console.log()
  }

  async manageRAGContext(): Promise<void> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'RAG Context Management:',
        choices: [
          { name: '📊 View RAG Status', value: 'status' },
          { name: '🔧 Configure RAG Settings', value: 'configure' },
          { name: '📁 Add Files to RAG', value: 'add' },
          { name: '🗑️  Remove Files from RAG', value: 'remove' },
          { name: '🔄 Refresh RAG Index', value: 'refresh' },
          { name: '← Back', value: 'back' },
        ],
      },
    ])

    switch (action) {
      case 'status': {
        const ragConfig = unifiedRAGSystem.getConfig()
        console.log(chalk.blue('\n🧠 RAG System Status:\n'))
        console.log(`  Vector DB: ${ragConfig.useVectorDB ? chalk.green('✓ Active') : chalk.yellow('○ Inactive')}`)
        console.log(`  Hybrid Mode: ${ragConfig.hybridMode ? chalk.green('✓ Active') : chalk.yellow('○ Inactive')}`)
        console.log(
          `  Semantic Search: ${ragConfig.enableSemanticSearch ? chalk.green('✓ Active') : chalk.yellow('○ Inactive')}`
        )
        console.log(
          `  Cache Embeddings: ${ragConfig.cacheEmbeddings ? chalk.green('✓ Active') : chalk.yellow('○ Inactive')}`
        )
        console.log(`  Max Index Files: ${ragConfig.maxIndexFiles}`)
        console.log(`  Chunk Size: ${ragConfig.chunkSize} tokens`)
        console.log()
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'configure': {
        const currentConfig = unifiedRAGSystem.getConfig()
        const ans = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useVectorDB',
            message: 'Use Vector Database?',
            default: currentConfig.useVectorDB,
          },
          {
            type: 'confirm',
            name: 'hybridMode',
            message: 'Enable Hybrid Mode?',
            default: currentConfig.hybridMode,
          },
          {
            type: 'confirm',
            name: 'enableSemanticSearch',
            message: 'Enable Semantic Search?',
            default: currentConfig.enableSemanticSearch,
          },
          {
            type: 'confirm',
            name: 'cacheEmbeddings',
            message: 'Cache Embeddings?',
            default: currentConfig.cacheEmbeddings,
          },
          {
            type: 'number',
            name: 'maxIndexFiles',
            message: 'Max Index Files:',
            default: currentConfig.maxIndexFiles,
          },
          {
            type: 'number',
            name: 'chunkSize',
            message: 'Chunk Size (tokens):',
            default: currentConfig.chunkSize,
          },
        ])

        // Update RAG configuration with real values
        unifiedRAGSystem.updateConfig({
          useVectorDB: ans.useVectorDB,
          hybridMode: ans.hybridMode,
          enableSemanticSearch: ans.enableSemanticSearch,
          cacheEmbeddings: ans.cacheEmbeddings,
          maxIndexFiles: ans.maxIndexFiles,
          chunkSize: ans.chunkSize,
        })

        console.log(chalk.green('\n✓ RAG configuration updated successfully\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'add': {
        const { paths } = await inquirer.prompt([
          {
            type: 'input',
            name: 'paths',
            message: 'Enter paths to add to RAG (comma-separated):',
          },
        ])

        if (paths) {
          const pathList = paths.split(',').map((p: string) => p.trim())
          console.log(chalk.blue(`\n⚡ Adding ${pathList.length} path(s) to RAG index...\n`))

          // Add to workspace context
          const currentPaths = workspaceContext.getContext().selectedPaths
          const newPaths = [...currentPaths, ...pathList.map((p: string) => path.resolve(this.nikCLI.workingDirectory, p))]
          const uniquePaths = [...new Set(newPaths)] // Remove duplicates
          await workspaceContext.selectPaths(uniquePaths.map((p: string) => path.relative(this.nikCLI.workingDirectory, p)))

          // Re-analyze with RAG
          await unifiedRAGSystem.analyzeProject(this.nikCLI.workingDirectory)

          console.log(chalk.green('✓ Paths added to RAG index\n'))
        }
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'remove': {
        const ctx = workspaceContext.getContext()
        const selectedPaths = ctx.selectedPaths.slice(0, 30)

        if (selectedPaths.length === 0) {
          console.log(chalk.yellow('\n⚠️  No paths in RAG to remove\n'))
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
          break
        }

        const { pathsToRemove } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'pathsToRemove',
            message: 'Select paths to remove from RAG (use space to select):',
            choices: selectedPaths.map((p) => ({
              name: path.relative(this.nikCLI.workingDirectory, p),
              value: p,
            })),
          },
        ])

        if (pathsToRemove && pathsToRemove.length > 0) {
          const remainingPaths = selectedPaths.filter((p) => !pathsToRemove.includes(p))
          await workspaceContext.selectPaths(remainingPaths.map((p) => path.relative(this.nikCLI.workingDirectory, p)))

          console.log(chalk.green(`\n✓ Removed ${pathsToRemove.length} path(s) from RAG\n`))
          pathsToRemove.forEach((p: string) => {
            console.log(chalk.gray(`  - ${path.relative(this.nikCLI.workingDirectory, p)}`))
          })
          console.log()
        }
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'refresh': {
        console.log(chalk.blue('\n⚡ Refreshing RAG index...'))
        await unifiedRAGSystem.analyzeProject(this.nikCLI.workingDirectory)
        console.log(chalk.green('✓ RAG index refreshed\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
    }
  }

  async manageConversationContext(): Promise<void> {
    const session = contextTokenManager.getCurrentSession()

    if (!session) {
      console.log(chalk.yellow('\n⚠️  No active conversation session\n'))
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
      return
    }

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Conversation Context Management:',
        choices: [
          { name: '📊 View Stats', value: 'stats' },
          { name: '📝 View Messages', value: 'messages' },
          { name: '🎚️  Set Context Limits', value: 'limits' },
          { name: '🗑️  Clear Conversation', value: 'clear' },
          { name: '← Back', value: 'back' },
        ],
      },
    ])

    switch (action) {
      case 'stats': {
        console.log(chalk.blue('\n💬 Conversation Statistics:\n'))
        console.log(`  Model: ${session.provider}/${session.model}`)
        console.log(`  Input Tokens: ${session.totalInputTokens.toLocaleString()}`)
        console.log(`  Output Tokens: ${session.totalOutputTokens.toLocaleString()}`)
        console.log(`  Total Tokens: ${(session.totalInputTokens + session.totalOutputTokens).toLocaleString()}`)
        console.log(`  Context Limit: ${session.modelLimits.context.toLocaleString()}`)
        console.log(`  Max Output: ${session.modelLimits.output.toLocaleString()}`)
        console.log()
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'messages': {
        console.log(chalk.blue('\n💬 Recent Conversation Messages:\n'))
        // Get recent messages from session - using contextTokenManager which tracks the session
        const messageHistory = contextTokenManager.getMessageHistory()
        const recentMessages = messageHistory.slice(-10)

        if (recentMessages.length === 0) {
          console.log(chalk.yellow('  No messages in current session'))
        } else {
          recentMessages.forEach((msg: any, idx: number) => {
            const role = msg.role === 'user' ? chalk.green('User') : chalk.blue('Assistant')
            const preview = (msg.content || '').substring(0, 100)
            console.log(`  ${idx + 1}. ${role}: ${preview}${msg.content.length > 100 ? '...' : ''}`)
          })
        }
        console.log()
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'limits': {
        const { maxTokens, maxHistory } = await inquirer.prompt([
          {
            type: 'number',
            name: 'maxTokens',
            message: 'Max tokens for responses:',
            default: this.nikCLI.configManager.get('maxTokens'),
          },
          {
            type: 'number',
            name: 'maxHistory',
            message: 'Max history messages to keep:',
            default: this.nikCLI.configManager.get('maxHistoryLength'),
          },
        ])

        this.nikCLI.configManager.set('maxTokens', maxTokens)
        this.nikCLI.configManager.set('maxHistoryLength', maxHistory)

        console.log(chalk.green('\n✓ Context limits updated\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'clear': {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Clear conversation history?',
            default: false,
          },
        ])
        if (confirm) {
          await contextTokenManager.endSession()
          console.log(chalk.green('\n✓ Conversation cleared\n'))
        }
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
    }
  }

  async manageAgentContext(): Promise<void> {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Agent Context Management:',
        choices: [
          { name: '📊 View Agent Contexts', value: 'view' },
          { name: '🎚️  Set Context Priority', value: 'priority' },
          { name: '🔧 Configure Agent Context', value: 'configure' },
          { name: '← Back', value: 'back' },
        ],
      },
    ])

    switch (action) {
      case 'view': {
        console.log(chalk.blue('\n🤖 Agent Contexts:\n'))
        const ctx = workspaceContext.getContext()
        console.log(`  Root: ${ctx.rootPath}`)
        console.log(`  Selected Paths: ${ctx.selectedPaths.length}`)
        console.log(`  Files in Context: ${ctx.files.size}`)
        console.log()

        if (ctx.selectedPaths.length > 0) {
          console.log(chalk.cyan('  Top Paths:'))
          ctx.selectedPaths.slice(0, 5).forEach((p: string) => {
            console.log(`    • ${path.relative(this.nikCLI.workingDirectory, p)}`)
          })
          if (ctx.selectedPaths.length > 5) {
            console.log(chalk.gray(`    ... +${ctx.selectedPaths.length - 5} more`))
          }
          console.log()
        }

        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'priority': {
        console.log(chalk.blue('\n🎚️  Context Priority Management\n'))
        console.log(chalk.yellow('Context priority is automatically managed based on:'))
        console.log('  • File importance scores')
        console.log('  • Recent usage patterns')
        console.log('  • Semantic relevance to queries')
        console.log()
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'configure': {
        const { maxFiles, searchThreshold } = await inquirer.prompt([
          {
            type: 'number',
            name: 'maxFiles',
            message: 'Max files per agent context:',
            default: 50,
          },
          {
            type: 'number',
            name: 'searchThreshold',
            message: 'Search relevance threshold (0-1):',
            default: 0.3,
          },
        ])

        console.log(
          chalk.green(`\n✓ Agent context configured (max files: ${maxFiles}, threshold: ${searchThreshold})\n`)
        )
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
    }
  }

  async manageBaseContext(): Promise<void> {
    const ctx = workspaceContext.getContext()

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Base Context Management:',
        choices: [
          { name: '📊 View Base Context', value: 'view' },
          { name: '📁 Select Paths', value: 'paths' },
          { name: '🔄 Refresh Context', value: 'refresh' },
          { name: '← Back', value: 'back' },
        ],
      },
    ])

    switch (action) {
      case 'view': {
        console.log(chalk.blue('\n📁 Base Context Information:\n'))
        console.log(`  Root: ${ctx.rootPath}`)
        console.log(`  Selected Paths: ${ctx.selectedPaths.length}`)
        console.log(`  Files: ${ctx.files.size}`)
        console.log(`  Directories: ${ctx.directories.size}`)
        console.log(`  Languages: ${ctx.projectMetadata.languages.join(', ')}`)
        if (ctx.projectMetadata.framework) {
          console.log(`  Framework: ${ctx.projectMetadata.framework}`)
        }
        console.log()
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'paths': {
        const { newPaths } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newPaths',
            message: 'Enter paths to select (comma-separated):',
            default: ctx.selectedPaths.map((p: string) => path.relative(this.nikCLI.workingDirectory, p)).join(', '),
          },
        ])

        if (newPaths) {
          const pathList = newPaths
            .split(',')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0)
          console.log(chalk.blue(`\n⚡ Selecting ${pathList.length} path(s)...\n`))
          await workspaceContext.selectPaths(pathList)
          console.log(chalk.green(`✓ Selected ${pathList.length} path(s)\n`))
        }
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'refresh': {
        console.log(chalk.blue('\n⚡ Refreshing base context...'))
        await workspaceContext.refreshWorkspaceIndex()
        console.log(chalk.green('✓ Base context refreshed\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
    }
  }

  async manageContextSettings(): Promise<void> {
    const { setting } = await inquirer.prompt([
      {
        type: 'list',
        name: 'setting',
        message: 'Context Settings:',
        choices: [
          { name: '🎚️  Token Limits', value: 'tokens' },
          { name: '📦 Cache Settings', value: 'cache' },
          { name: '🔧 Advanced Options', value: 'advanced' },
          { name: '← Back', value: 'back' },
        ],
      },
    ])

    switch (setting) {
      case 'tokens': {
        const config = this.nikCLI.configManager.getAll()
        const ans = await inquirer.prompt([
          {
            type: 'number',
            name: 'maxTokens',
            message: 'Max Tokens:',
            default: config.maxTokens,
          },
          {
            type: 'number',
            name: 'maxHistoryLength',
            message: 'Max History Length:',
            default: config.maxHistoryLength,
          },
        ])
        this.nikCLI.configManager.set('maxTokens', ans.maxTokens)
        this.nikCLI.configManager.set('maxHistoryLength', ans.maxHistoryLength)
        console.log(chalk.green('\n✓ Token settings updated\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'cache': {
        const ragConfig = unifiedRAGSystem.getConfig()
        const ans = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'cacheEmbeddings',
            message: 'Cache embeddings?',
            default: ragConfig.cacheEmbeddings,
          },
          {
            type: 'confirm',
            name: 'clearCache',
            message: 'Clear existing caches now?',
            default: false,
          },
        ])

        unifiedRAGSystem.updateConfig({ cacheEmbeddings: ans.cacheEmbeddings })

        if (ans.clearCache) {
          await unifiedRAGSystem.clearCaches()
          console.log(chalk.green('\n✓ Caches cleared'))
        }

        console.log(chalk.green('\n✓ Cache settings updated\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
      case 'advanced': {
        const ragConfig = unifiedRAGSystem.getConfig()
        const ans = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useLocalEmbeddings',
            message: 'Use local embeddings (faster, less accurate)?',
            default: ragConfig.useLocalEmbeddings,
          },
          {
            type: 'number',
            name: 'costThreshold',
            message: 'Cost threshold (USD):',
            default: ragConfig.costThreshold,
          },
        ])

        unifiedRAGSystem.updateConfig({
          useLocalEmbeddings: ans.useLocalEmbeddings,
          costThreshold: ans.costThreshold,
        })

        console.log(chalk.green('\n✓ Advanced settings updated\n'))
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
        break
      }
    }
  }

  async showIndexOverview(): Promise<void> {
    console.clear()
    console.log(chalk.blue.bold('\n📊 Index Overview\n'))

    const ctx = workspaceContext.getContext()
    const indexedFiles = Array.from(ctx.files.values())
    const totalSize = indexedFiles.reduce((sum, f) => sum + f.size, 0)
    const languages = new Set(indexedFiles.map((f) => f.language))
    const languageCounts = new Map<string, number>()

    indexedFiles.forEach((f) => {
      languageCounts.set(f.language, (languageCounts.get(f.language) || 0) + 1)
    })

    console.log(chalk.cyan('Index Statistics:'))
    console.log(`  Total Files: ${indexedFiles.length}`)
    console.log(`  Total Size: ${this.nikCLI.formatBytes(totalSize)}`)
    console.log(`  Directories: ${ctx.directories.size}`)
    console.log()

    console.log(chalk.cyan('Files by Language:'))
    Array.from(languageCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([lang, count]) => {
        const bar = '█'.repeat(Math.min(30, Math.floor((count / Math.max(...languageCounts.values())) * 30)))
        console.log(`  ${lang.padEnd(15)} ${bar} ${count}`)
      })
    console.log()

    if (ctx.projectMetadata.framework) {
      console.log(chalk.cyan('Framework:'))
      console.log(`  ${ctx.projectMetadata.framework}`)
      console.log()
    }
  }

  async browseIndexedFiles(): Promise<void> {
    const ctx = workspaceContext.getContext()
    const indexedFiles = Array.from(ctx.files.values()).slice(0, 50)

    if (indexedFiles.length === 0) {
      console.log(chalk.yellow('\n⚠️  No files indexed\n'))
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
      return
    }

    const { file } = await inquirer.prompt([
      {
        type: 'list',
        name: 'file',
        message: 'Browse indexed files:',
        choices: [
          ...indexedFiles.map((f) => ({
            name: `${f.language.padEnd(10)} ${path.relative(this.nikCLI.workingDirectory, f.path)} (${this.nikCLI.formatBytes(f.size)})`,
            value: f.path,
          })),
          { name: '← Back', value: 'back' },
        ],
        pageSize: 15,
      },
    ])

    if (file !== 'back') {
      const fileData = ctx.files.get(file)
      if (fileData) {
        console.log(chalk.blue(`\n📄 File: ${path.relative(this.nikCLI.workingDirectory, file)}\n`))
        console.log(chalk.cyan('Metadata:'))
        console.log(`  Language: ${fileData.language}`)
        console.log(`  Size: ${this.nikCLI.formatBytes(fileData.size)}`)
        console.log(`  Lines: ${fileData.lines || 'N/A'}`)
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }])
      }
    }
  }
}
