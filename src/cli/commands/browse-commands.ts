import boxen from 'boxen'
import chalk from 'chalk'
import { Command } from 'commander'
import { browseGPTService } from '../services/browsegpt-service'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * BrowseGPT CLI Commands
 *
 * Provides CLI interface for AI-powered web browsing using Browserbase
 */

export function createBrowseCommands(): Command {
  const browse = new Command('browse').description('AI-powered web browsing with Browserbase').alias('web')

  // Create session command
  browse
    .command('session')
    .description('Create a new browsing session')
    .option('-i, --id <sessionId>', 'Custom session ID')
    .action(async (options) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-session', 'Creating browsing session').id
        advancedUI.startSpinner(spinnerId, 'Creating browsing session...')

        const sessionId = await browseGPTService.createSession(options.id)

        advancedUI.stopSpinner(spinnerId, true, 'Session created')

        console.log(
          boxen(
            chalk.green('✓ Browsing Session Created') +
              '\n\n' +
              chalk.white(`Session ID: ${chalk.cyan(sessionId)}\n`) +
              chalk.gray('Use this session ID for all browse commands'),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Failed to create session:'), error.message)
        process.exit(1)
      }
    })

  // Search command
  browse
    .command('search <query>')
    .description('Search the web using Google')
    .requiredOption('-s, --session <sessionId>', 'Session ID')
    .option('--show-results', 'Show detailed search results')
    .action(async (query, options) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-search', 'Searching web').id
        advancedUI.startSpinner(spinnerId, `Searching for: ${query}`)

        const results = await browseGPTService.googleSearch(options.session, query)

        advancedUI.stopSpinner(spinnerId, true, 'Search complete')

        console.log(
          boxen(
            chalk.blue('🔍 Search Results') +
              '\n\n' +
              chalk.white(`Query: ${chalk.cyan(query)}\n`) +
              chalk.white(`Found: ${chalk.green(results.results.length)} results`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        )

        if (options.showResults && results.results.length > 0) {
          console.log('\n' + chalk.bold('Top Results:'))
          results.results.slice(0, 5).forEach((result, index) => {
            console.log(`\n${chalk.cyan(`${index + 1}.`)} ${chalk.white(result.title)}`)
            console.log(`   ${chalk.gray(result.url)}`)
            if (result.snippet) {
              console.log(`   ${chalk.dim(result.snippet.slice(0, 100))}...`)
            }
          })
        }
      } catch (error: any) {
        console.error(chalk.red('✖ Search failed:'), error.message)
        process.exit(1)
      }
    })

  // Visit page command
  browse
    .command('visit <url>')
    .description('Visit a webpage and extract content')
    .requiredOption('-s, --session <sessionId>', 'Session ID')
    .option('-p, --prompt <prompt>', 'AI prompt for content summarization')
    .option('--show-content', 'Show extracted text content')
    .action(async (url, options) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-visit', 'Visiting page').id
        advancedUI.startSpinner(spinnerId, `Visiting: ${url}`)

        const content = await browseGPTService.getPageContent(options.session, url, options.prompt)

        advancedUI.stopSpinner(spinnerId, true, 'Page loaded')

        console.log(
          boxen(
            chalk.green('📄 Page Content Extracted') +
              '\n\n' +
              chalk.white(`Title: ${chalk.cyan(content.title)}\n`) +
              chalk.white(`URL: ${chalk.gray(content.url)}\n`) +
              chalk.white(`Text Length: ${chalk.yellow(content.text.length)} characters`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )

        if (content.summary) {
          console.log('\n' + chalk.bold('AI Summary:'))
          console.log(chalk.white(content.summary))
        }

        if (options.showContent && content.text) {
          console.log('\n' + chalk.bold('Extracted Content:'))
          console.log(chalk.dim(content.text.slice(0, 500) + '...'))
        }
      } catch (error: any) {
        console.error(chalk.red('✖ Failed to visit page:'), error.message)
        process.exit(1)
      }
    })

  // Chat command
  browse
    .command('chat <message>')
    .description('Chat with AI about web content')
    .requiredOption('-s, --session <sessionId>', 'Session ID')
    .action(async (message, options) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-chat', 'AI chat').id
        advancedUI.startSpinner(spinnerId, 'Getting AI response...')

        const response = await browseGPTService.chatWithWeb(options.session, message)

        advancedUI.stopSpinner(spinnerId, true, 'Response received')

        console.log(
          boxen(chalk.blue('🤖 AI Response') + '\n\n' + chalk.white(response), {
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue',
          })
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Chat failed:'), error.message)
        process.exit(1)
      }
    })

  // List sessions command
  browse
    .command('sessions')
    .description('List all browsing sessions')
    .action(async () => {
      try {
        const sessions = browseGPTService.listSessions()

        if (sessions.length === 0) {
          console.log(chalk.yellow('No active browsing sessions'))
          return
        }

        console.log(
          boxen(
            chalk.blue('🌐 Active Browsing Sessions') +
              '\n\n' +
              sessions
                .map(
                  (session) =>
                    `${chalk.cyan(session.id)}\n` +
                    `  Browser: ${chalk.gray(session.browserId.slice(0, 12))}...\n` +
                    `  Created: ${chalk.yellow(session.created.toLocaleString())}\n` +
                    `  Activity: ${chalk.yellow(session.lastActivity.toLocaleString())}\n` +
                    `  History: ${chalk.green(session.historyCount)} items\n` +
                    `  Status: ${session.active ? chalk.green('Active') : chalk.red('Inactive')}`
                )
                .join('\n\n'),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Failed to list sessions:'), error.message)
        process.exit(1)
      }
    })

  // Session info command
  browse
    .command('info <sessionId>')
    .description('Get information about a specific session')
    .action(async (sessionId) => {
      try {
        const info = browseGPTService.getSessionInfo(sessionId)

        if (!info) {
          console.log(chalk.red(`Session ${sessionId} not found`))
          return
        }

        console.log(
          boxen(
            chalk.blue(`📊 Session Info: ${sessionId}`) +
              '\n\n' +
              chalk.white(`Browser ID: ${chalk.gray(info.browserId)}\n`) +
              chalk.white(`Created: ${chalk.yellow(info.created.toLocaleString())}\n`) +
              chalk.white(`Last Activity: ${chalk.yellow(info.lastActivity.toLocaleString())}\n`) +
              chalk.white(`History Items: ${chalk.green(info.historyCount)}\n`) +
              chalk.white(`Status: ${info.active ? chalk.green('Active') : chalk.red('Inactive')}`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Failed to get session info:'), error.message)
        process.exit(1)
      }
    })

  // Close session command
  browse
    .command('close <sessionId>')
    .description('Close a browsing session')
    .action(async (sessionId) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-close', 'Closing session').id
        advancedUI.startSpinner(spinnerId, `Closing session: ${sessionId}`)

        await browseGPTService.closeSession(sessionId)

        advancedUI.stopSpinner(spinnerId, true, 'Session closed')

        console.log(
          boxen(
            chalk.green(`✓ Session Closed`) + '\n\n' + chalk.white(`Session ${chalk.cyan(sessionId)} has been closed`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Failed to close session:'), error.message)
        process.exit(1)
      }
    })

  // Cleanup command
  browse
    .command('cleanup')
    .description('Clean up inactive sessions')
    .action(async () => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-cleanup', 'Cleaning up').id
        advancedUI.startSpinner(spinnerId, 'Cleaning up inactive sessions...')

        const cleaned = await browseGPTService.cleanupSessions()

        advancedUI.stopSpinner(spinnerId, true, 'Cleanup complete')

        console.log(
          boxen(
            chalk.green(`🧹 Cleanup Complete`) +
              '\n\n' +
              chalk.white(`Cleaned up ${chalk.yellow(cleaned)} inactive sessions`),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'green',
            }
          )
        )
      } catch (error: any) {
        console.error(chalk.red('✖ Cleanup failed:'), error.message)
        process.exit(1)
      }
    })

  // Quick command for search + visit + chat
  browse
    .command('quick <query>')
    .description('Quick search, visit first result, and chat about it')
    .option('-p, --prompt <prompt>', 'AI prompt for the content', 'Summarize this page')
    .action(async (query, options) => {
      try {
        const spinnerId = advancedUI.createIndicator('browse-quick', 'Quick browse').id
        advancedUI.startSpinner(spinnerId, 'Creating session and performing quick browse...')

        // Create session
        const sessionId = await browseGPTService.createSession()

        // Search
        const searchResults = await browseGPTService.googleSearch(sessionId, query)

        if (searchResults.results.length === 0) {
          advancedUI.stopSpinner(spinnerId, false, 'No results found')
          console.log(chalk.yellow('No search results found'))
          return
        }

        // Visit first result
        const firstResult = searchResults.results[0]
        const content = await browseGPTService.getPageContent(sessionId, firstResult.url, options.prompt)

        // Chat about it
        const chatResponse = await browseGPTService.chatWithWeb(
          sessionId,
          `Based on the content from "${content.title}", ${options.prompt}`
        )

        advancedUI.stopSpinner(spinnerId, true, 'Quick browse complete')

        console.log(
          boxen(
            chalk.blue('⚡ Quick Browse Results') +
              '\n\n' +
              chalk.white(`Query: ${chalk.cyan(query)}\n`) +
              chalk.white(`Visited: ${chalk.yellow(content.title)}\n`) +
              chalk.white(`URL: ${chalk.gray(firstResult.url)}\n\n`) +
              chalk.bold('AI Analysis:\n') +
              chalk.white(chatResponse),
            {
              padding: 1,
              margin: 1,
              borderStyle: 'round',
              borderColor: 'blue',
            }
          )
        )

        // Close session
        await browseGPTService.closeSession(sessionId)
      } catch (error: any) {
        console.error(chalk.red('✖ Quick browse failed:'), error.message)
        process.exit(1)
      }
    })

  return browse
}
