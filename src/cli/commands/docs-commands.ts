import chalk from 'chalk'
import boxen from 'boxen'
import ora from 'ora'
import { docLibrary } from '../core/documentation-library'
import { docsContextManager } from '../context/docs-context-manager'
import { getCloudDocsProvider } from '../core/cloud-docs-provider'

/**
 * DocsCommands - Handles documentation commands
 * Extracted from lines ~9420-9934 in nik-cli.ts
 */
export class DocsCommands {
  private nikCLI: any

  constructor(nikCLI: any) {
    this.nikCLI = nikCLI
  }

  async handleDocsCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Show help and status as a single panel, with proper prompt spacing
        const stats = docLibrary.getStats()
        const lines: string[] = []
        lines.push(`📖 Library: ${stats.totalDocs} documents`)
        lines.push(
          `⚡︎ Categories: ${stats.categories.length}${stats.categories.length ? ` (${stats.categories.join(', ')})` : ''}`
        )
        lines.push(`📝 Total Words: ${stats.totalWords.toLocaleString()}`)
        if (stats.languages?.length) lines.push(`🌍 Languages: ${stats.languages.join(', ')}`)
        lines.push('')
        lines.push('📋 Commands:')
        lines.push('/docs                      - Help and status')
        lines.push('/doc-search <query> [cat]  - Search library')
        lines.push('/doc-add <url> [cat]       - Add documentation')
        lines.push('/doc-stats [--detailed]    - Show statistics')
        lines.push('/doc-list [category]       - List documentation')
        lines.push('/doc-load <names>          - Load docs to AI context')
        lines.push('/doc-context [--detailed]  - Show AI doc context')
        lines.push('/doc-unload [names|--all]  - Unload docs')
        lines.push('/doc-suggest <query>       - Suggest docs')

        this.nikCLI.printPanel(
          boxen(lines.join('\n'), {
            title: 'Documentation System',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'magenta',
            width: this.nikCLI.getOptimalPanelWidth(),
          })
        )

        return
      }

      // Handle subcommands
      if (args.length === 0) {
        console.log(chalk.red('Missing subcommand. Use /doc help for available commands.'))
        return
      }

      const subcommand = args[0]
      const _subArgs = args.slice(1)

      switch (subcommand) {
        case 'status':
          docLibrary.showStatus()
          break
        case 'help':
          await this.handleDocsCommand([])
          break
        default:
          console.log(chalk.red(`❌ Unknown docs subcommand: ${subcommand}`))
          console.log(chalk.gray('Use "/docs" for help'))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Docs command error: ${error.message}`))
    }
    // Ensure output is flushed and visible before showing prompt
    console.log() // Extra newline for better separation
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocSearchCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.nikCLI.printPanel(
          boxen(
            [
              'Usage: /doc-search <query> [category]',
              '',
              'Example: /doc-search "react hooks"',
              'Example: /doc-search "api" backend',
            ].join('\n'),
            {
              title: 'Doc Search Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      const query = args[0]
      const category = args[1]

      console.log(chalk.blue(`🔍 Searching for: "${query}"${category ? ` in category: ${category}` : ''}`))

      const results = await docLibrary.search(query, category, 10)

      if (results.length === 0) {
        console.log(chalk.yellow('❌ No documents found'))
        console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'))
        return
      }

      console.log(chalk.green(`\n✅ Found ${results.length} results:`))
      console.log(chalk.gray('─'.repeat(60)))

      results.forEach((result, index) => {
        console.log(chalk.blue(`${index + 1}. ${result.entry.title}`))
        console.log(chalk.gray(`   Score: ${(result.score * 100).toFixed(1)}% | Category: ${result.entry.category}`))
        console.log(chalk.gray(`   URL: ${result.entry.url}`))
        console.log(chalk.gray(`   Tags: ${result.entry.tags.join(', ')}`))
        if (result.snippet) {
          console.log(chalk.white(`   Preview: ${result.snippet.substring(0, 120)}...`))
        }
        console.log()
      })
    } catch (error: any) {
      console.error(chalk.red(`❌ Search error: ${error.message}`))
    }
  }

  async handleDocAddCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        this.nikCLI.printPanel(
          boxen(
            [
              'Usage: /doc-add <url> [category] [tags...]',
              '',
              'Example: /doc-add https://reactjs.org/',
              'Example: /doc-add https://nodejs.org/ backend node,api',
            ].join('\n'),
            {
              title: 'Doc Add Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      const url = args[0]
      const category = args[1] || 'general'
      const tags = args.slice(2)

      // Simple URL validation
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.log(chalk.red('❌ Invalid URL. Must start with http:// or https://'))
        return
      }

      console.log(chalk.blue(`📖 Adding documentation from: ${url}`))
      if (category !== 'general') console.log(chalk.gray(`⚡︎ Category: ${category}`))
      if (tags.length > 0) console.log(chalk.gray(`🏷️ Tags: ${tags.join(', ')}`))

      const spinner = ora('Extracting content...').start()

      try {
        const entry = await docLibrary.addDocumentation(url, category, tags)
        spinner.succeed('Documentation added successfully!')

        await this.nikCLI.withPanelOutput(async () => {
          const content = [
            chalk.green('✓ Document Added'),
            chalk.gray('────────────────────────────────────────'),
            `${chalk.blue('📄 Title:')} ${entry.title}`,
            `${chalk.gray('🆔 ID:')} ${entry.id}`,
            `${chalk.gray('⚡︎ Category:')} ${entry.category}`,
            `${chalk.gray('🏷️ Tags:')} ${entry.tags.join(', ')}`,
            `${chalk.gray('📝 Words:')} ${entry.metadata.wordCount}`,
            `${chalk.gray('🌍 Language:')} ${entry.metadata.language}`,
          ].join('\n')

          this.nikCLI.printPanel(
            boxen(content, {
              title: '📚 Documentation',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            })
          )
        })
      } catch (error: any) {
        spinner.fail('Failed to add documentation')
        throw error
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Add documentation error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocStatsCommand(args: string[]): Promise<void> {
    try {
      const detailed = args.includes('--detailed') || args.includes('-d')

      const stats = docLibrary.getStats()

      console.log(chalk.blue.bold('\n📊 Documentation Library Statistics'))
      console.log(chalk.gray('─'.repeat(50)))

      console.log(chalk.green(`📖 Total Documents: ${stats.totalDocs}`))
      console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`))
      console.log(chalk.green(`⚡︎ Categories: ${stats.categories.length}`))
      console.log(chalk.green(`🌍 Languages: ${stats.languages.length}`))
      console.log(chalk.green(`📷 Average Access Count: ${stats.avgAccessCount.toFixed(1)}`))

      if (detailed && stats.categories.length > 0) {
        console.log(chalk.blue('\n📂 By Category:'))
        stats.categories.forEach((category: string) => {
          console.log(chalk.gray(`  • ${category}`))
        })

        console.log(chalk.blue('\n🌍 By Language:'))
        stats.languages.forEach((language: string) => {
          console.log(chalk.gray(`  • ${language}`))
        })
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Stats error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocListCommand(args: string[]): Promise<void> {
    try {
      const category = args[0]

      // Get all documents (accessing the private docs Map)
      const allDocs = Array.from((docLibrary as any).docs.values()) as any[]

      // Filter by category if specified
      const docs = category ? allDocs.filter((doc: any) => doc.category === category) : allDocs

      if (docs.length === 0) {
        const msg = category
          ? `No documents found in category: ${category}`
          : 'No documents in library\nUse /doc-add <url> to add documentation'
        this.nikCLI.printPanel(
          boxen(msg, { title: 'Documentation', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' })
        )
        return
      }

      const lines: string[] = []
      docs
        .sort((a: any, b: any) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
        .slice(0, 50)
        .forEach((doc: any, index: number) => {
          lines.push(`${index + 1}. ${doc.title}`)
          lines.push(`   ID: ${doc.id} | Category: ${doc.category}`)
          lines.push(`   URL: ${doc.url}`)
          lines.push(`   Tags: ${doc.tags.join(', ') || 'none'}`)
          lines.push(`   Words: ${doc.metadata.wordCount} | Access: ${doc.accessCount}x`)
          lines.push(`   Added: ${doc.timestamp.toLocaleDateString()}`)
        })
      const title = `📋 Documentation List${category ? ` (Category: ${category})` : ''}`
      const maxHeight = this.nikCLI.getAvailablePanelHeight()
      let content = lines.join('\n')

      if (content.split('\n').length > maxHeight) {
        const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
        content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated - use /docs list <category> to filter`
      }

      this.nikCLI.printPanel(
        boxen(content, {
          title,
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          width: Math.min(120, (process.stdout.columns || 100) - 4),
          height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
        })
      )
      return
    } catch (error: any) {
      console.error(chalk.red(`❌ List error: ${error.message}`))
    }
  }

  async handleDocTagCommand(args: string[]): Promise<void> {
    try {
      console.log(chalk.yellow('🏷️ Document tagging feature is coming soon!'))
      console.log(chalk.gray('This will allow you to:'))
      console.log(chalk.gray('• Add tags to existing documents'))
      console.log(chalk.gray('• Remove tags from documents'))
      console.log(chalk.gray('• Search documents by tags'))
      console.log(chalk.gray('• List all available tags'))

      if (args.length > 0) {
        console.log(chalk.gray(`\nYour input: ${args.join(' ')}`))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Tag error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocSyncCommand(_args: string[]): Promise<void> {
    try {
      const cloudProvider = getCloudDocsProvider()
      if (!cloudProvider?.isReady()) {
        const maxHeight = this.nikCLI.getAvailablePanelHeight()
        this.nikCLI.printPanel(
          boxen('Cloud documentation not configured\nSet SUPABASE_URL and SUPABASE_ANON_KEY or use /config to enable', {
            title: 'Docs Sync Warning',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
        return
      }

      const spinner = ora('Syncing with cloud...').start()

      try {
        const result = await cloudProvider.sync()
        spinner.succeed('Docs sync complete')
        const lines = [`Downloaded: ${result.downloaded}`, `Uploaded: ${result.uploaded}`]
        if (result.downloaded > 0) lines.push('Use /doc-search to explore new content')
        const maxHeight = this.nikCLI.getAvailablePanelHeight()
        this.nikCLI.printPanel(
          boxen(lines.join('\n'), {
            title: 'Docs Sync',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'green',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
      } catch (error: any) {
        spinner.fail('Sync failed')
        throw error
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Sync error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocLoadCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        const suggestions = await docsContextManager.suggestDocs('popular')
        const lines = [
          'Usage: /doc-load <doc-names>',
          'Example: /doc-load "react hooks" nodejs-api',
          'Example: /doc-load frontend-docs backend-docs',
        ]
        if (suggestions.length > 0) {
          lines.push('')
          lines.push('Suggestions:')
          suggestions.forEach((t) => lines.push(` • ${t}`))
        }
        const maxHeight = this.nikCLI.getAvailablePanelHeight()
        let content = lines.join('\n')

        if (content.split('\n').length > maxHeight) {
          const truncatedLines = content.split('\n').slice(0, maxHeight - 2)
          content = `${truncatedLines.join('\n')}\n\n⚠️  Content truncated`
        }

        this.nikCLI.printPanel(
          boxen(content, {
            title: 'Load Docs',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow',
            width: Math.min(120, (process.stdout.columns || 100) - 4),
            height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
          })
        )
        return
      }

      const maxHeight = this.nikCLI.getAvailablePanelHeight()
      this.nikCLI.printPanel(
        boxen(`Loading ${args.length} document(s) into AI context…`, {
          title: '⚡︎ Load Docs',
          padding: 1,
          margin: 1,
          borderStyle: 'round',
          borderColor: 'cyan',
          width: Math.min(120, (process.stdout.columns || 100) - 4),
          height: Math.min(maxHeight + 4, (process.stdout.rows || 24) - 2),
        }),
        'general'
      )

      const loadedDocs = await docsContextManager.loadDocs(args)

      if (loadedDocs.length > 0) {
        const stats = docsContextManager.getContextStats()
        console.log(chalk.green(`✓ Context updated:`))
        console.log(chalk.gray(`   • Loaded docs: ${stats.loadedCount}`))
        console.log(chalk.gray(`   • Total words: ${stats.totalWords.toLocaleString()}`))
        console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`))
        console.log(chalk.gray(`   • Categories: ${stats.categories.join(', ')}`))

        console.log(chalk.blue('\n💬 AI agents now have access to loaded documentation!'))
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Load error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocContextCommand(args: string[]): Promise<void> {
    try {
      const stats = docsContextManager.getContextStats()

      console.log(chalk.blue.bold('\n📚 AI Documentation Context Status'))
      console.log(chalk.gray('─'.repeat(50)))

      if (stats.loadedCount === 0) {
        console.log(chalk.yellow('❌ No documentation loaded in context'))
        console.log(chalk.gray('Use /doc-load <names> to load documentation'))
        console.log(chalk.gray('Use /doc-suggest <query> to find relevant docs'))
        return
      }

      console.log(chalk.green(`📖 Loaded Documents: ${stats.loadedCount}`))
      console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`))
      console.log(chalk.green(`📊 Context Usage: ${stats.utilizationPercent.toFixed(1)}%`))
      console.log(chalk.green(`⚡︎ Categories: ${stats.categories.join(', ')}`))
      console.log(chalk.green(`🏠 Local: ${stats.sources.local}, ☁️ Shared: ${stats.sources.shared}`))

      if (args.includes('--detailed') || args.includes('-d')) {
        console.log(chalk.blue('\n📋 Loaded Documents:'))
        const loadedDocs = docsContextManager.getLoadedDocs()

        loadedDocs.forEach((doc, index) => {
          const wordCount = doc.content.split(' ').length
          console.log(chalk.blue(`${index + 1}. ${doc.title}`))
          console.log(chalk.gray(`   Category: ${doc.category} | Source: ${doc.source}`))
          console.log(chalk.gray(`   Tags: ${doc.tags.join(', ')}`))
          console.log(chalk.gray(`   Words: ${wordCount.toLocaleString()} | Loaded: ${doc.loadedAt.toLocaleString()}`))
          if (doc.summary) {
            console.log(chalk.gray(`   Summary: ${doc.summary}`))
          }
          console.log()
        })
      }

      // Context summary for AI
      const summary = docsContextManager.getContextSummary()
      if (args.includes('--summary')) {
        console.log(chalk.blue('\n🤖 AI Context Summary:'))
        console.log(chalk.gray('─'.repeat(40)))
        console.log(summary)
      }
    } catch (error: any) {
      console.error(chalk.red(`❌ Context error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocUnloadCommand(args: string[]): Promise<void> {
    try {
      if (args.length === 0) {
        // Show current loaded docs and ask for confirmation to clear all
        const stats = docsContextManager.getContextStats()
        if (stats.loadedCount === 0) {
          console.log(chalk.yellow('❌ No documentation loaded in context'))
          return
        }

        console.log(chalk.yellow(`⚠️ This will remove all ${stats.loadedCount} loaded documents from AI context`))
        console.log(chalk.gray('Use /doc-unload <names> to remove specific documents'))
        console.log(chalk.gray('Use /doc-unload --all to confirm removal of all documents'))
        return
      }

      if (args.includes('--all')) {
        await docsContextManager.unloadDocs()
        console.log(chalk.green('✓ All documentation removed from AI context'))
        return
      }

      await docsContextManager.unloadDocs(args)

      const stats = docsContextManager.getContextStats()
      console.log(chalk.green('✓ Documentation context updated'))
      console.log(chalk.gray(`   • Remaining docs: ${stats.loadedCount}`))
      console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`))
    } catch (error: any) {
      console.error(chalk.red(`❌ Unload error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }

  async handleDocSuggestCommand(args: string[]): Promise<void> {
    try {
      const query = args.join(' ')
      if (!query) {
        this.nikCLI.printPanel(
          boxen(
            [
              'Usage: /doc-suggest <query>',
              '',
              'Example: /doc-suggest "react hooks"',
              'Example: /doc-suggest "api authentication"',
            ].join('\n'),
            {
              title: 'Doc Suggest Command',
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'red',
            }
          )
        )
        return
      }

      console.log(chalk.blue(`💡 Suggesting documentation for: "${query}"`))

      const suggestions = await docsContextManager.suggestDocs(query)

      if (suggestions.length === 0) {
        console.log(chalk.yellow('❌ No relevant documentation found'))
        console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'))
        return
      }

      console.log(chalk.green(`\n✅ Suggested ${suggestions.length} documents:`))
      console.log(chalk.gray('─'.repeat(60)))

      suggestions.forEach((suggestion, index) => {
        console.log(chalk.blue(`${index + 1}. ${suggestion}`))
      })

      console.log(chalk.gray('\n💡 Use /doc-load <names> to load suggested documents into AI context'))
    } catch (error: any) {
      console.error(chalk.red(`❌ Suggest error: ${error.message}`))
    }
    process.stdout.write('')
    await new Promise((resolve) => setTimeout(resolve, 150))
    this.nikCLI.renderPromptAfterOutput()
  }
}
