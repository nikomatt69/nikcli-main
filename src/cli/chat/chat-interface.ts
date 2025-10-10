import boxen from 'boxen'
import chalk from 'chalk'
import marked from 'marked'
import TerminalRenderer from 'marked-terminal'
import * as readline from 'readline'
import { modelProvider } from '../ai/model-provider'
import { streamttyService } from '../services/streamtty-service'
import { chatManager } from './chat-manager'
import { SlashCommandHandler } from './nik-cli-commands'

// Configure marked for terminal rendering
const renderer = new TerminalRenderer() as any
marked.setOptions({
  renderer,
})

export class ChatInterface {
  private rl: readline.Interface
  private slashCommands: SlashCommandHandler
  private isStreaming = false
  private cliInstance: any
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      historySize: 100,
    })

    this.slashCommands = new SlashCommandHandler()
    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    // Handle Ctrl+C gracefully
    this.rl.on('SIGINT', () => {
      if (this.isStreaming) {
        console.log(chalk.yellow('\n⏸️  Streaming stopped'))
        this.isStreaming = false
        this.prompt()
      } else {
        console.log(chalk.yellow('\n👋 Goodbye!'))
        process.exit(0)
      }
    })

    // Handle line input
    this.rl.on('line', async (input) => {
      const trimmed = input.trim()

      if (!trimmed) {
        this.prompt()
        return
      }

      await this.handleInput(trimmed)
      this.prompt()
    })

    // Handle close
    this.rl.on('close', () => {
      console.log(chalk.yellow('\n👋 Goodbye!'))
      process.exit(0)
    })
  }

  private getPrompt(): string {
    const modelInfo = modelProvider.getCurrentModelInfo()
    const sessionId = chatManager.getCurrentSession()?.id.slice(0, 8) || 'new'

    return `┌─[${chalk.green(modelInfo.name)}:${chalk.cyan(sessionId)}]\n└─❯ `
  }

  private updatePrompt(): void {
    this.rl.setPrompt(this.getPrompt())
  }

  async start(): Promise<void> {
    this.showWelcome()

    // Validate API key
    if (!modelProvider.validateApiKey()) {
      console.log(chalk.red('\n❌ Cannot start chat without valid API key'))
      console.log(chalk.gray('Use /help for setup instructions\n'))
    }

    // Create initial session
    chatManager.createNewSession()
    this.updatePrompt()
    this.prompt()
  }

  private showWelcome(): void {
    const title = chalk.cyanBright('🔌 AI Coder CLI')
    const modelInfo = modelProvider.getCurrentModelInfo()

    const welcomeText = `
${title}
${chalk.gray('─'.repeat(40))}

Current Model: ${chalk.green(modelInfo.name)} (${chalk.gray(modelInfo.config.provider)})
Commands: ${chalk.cyan('/help')} for help, ${chalk.cyan('/quit')} to exit
Features: Multi-model support, code generation, chat history

${chalk.gray('Type your message or use slash commands...')}
    `

    this.cliInstance.printPanel(
      boxen(welcomeText, {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
      })
    )
  }

  private async handleInput(input: string): Promise<void> {
    // Handle slash commands
    if (input.startsWith('/')) {
      const result = await this.slashCommands.handle(input)
      if (result.shouldUpdatePrompt) {
        this.updatePrompt()
      }
      if (result.shouldExit) {
        this.rl.close()
      }
      return
    }

    // Regular chat message
    await this.handleChatMessage(input)
  }

  private async handleChatMessage(input: string): Promise<void> {
    // Add user message to chat
    chatManager.addMessage(input, 'user')

    try {
      console.log(chalk.blue('\n🔌 '))

      this.isStreaming = true
      // Stream the response through streamttyService
      const messages = chatManager.getContextMessages()
      const generator = modelProvider.streamResponse({ messages })

      let responseText = ''
      for await (const chunk of generator) {
        if (!this.isStreaming) break
        responseText += chunk
        await streamttyService.streamChunk(chunk, 'ai')
      }

      this.isStreaming = false
      console.log('\n') // New line after streaming

      // Add assistant message to chat
      chatManager.addMessage(responseText, 'assistant')
    } catch (error: any) {
      this.isStreaming = false
      console.log(chalk.red(`\n❌ Error: ${error.message}`))

      if (error.message.includes('API key')) {
        console.log(chalk.gray('Use /set-key command to configure API keys'))
      }
    }
  }

  private prompt(): void {
    if (!this.isStreaming) {
      this.rl.prompt()
    }
  }

  stop(): void {
    this.rl.close()
  }
}

export const chatInterface = new ChatInterface()
