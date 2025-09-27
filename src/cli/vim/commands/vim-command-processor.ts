import { EventEmitter } from 'node:events'
import { CliUI } from '../../utils/cli-ui'
import { type CommandResult, type VimCommand, VimMode, type VimState } from '../types/vim-types'
import type { VimModeConfig } from '../vim-mode-manager'

export class VimCommandProcessor extends EventEmitter {
  private state: VimState
  private config: VimModeConfig
  private commands: Map<string, VimCommand> = new Map()
  private commandBuffer: string = ''

  constructor(state: VimState, config: VimModeConfig) {
    super()
    this.state = state
    this.config = config
    this.initializeDefaultCommands()
  }

  async initialize(): Promise<void> {
    this.setupCommandMode()
  }

  async execute(command: string): Promise<CommandResult> {
    const trimmed = command.trim()
    if (!trimmed) {
      return { success: false, error: 'Empty command' }
    }

    const parts = trimmed.split(/\s+/)
    const commandName = parts[0]
    const args = parts.slice(1)

    const vimCommand = this.findCommand(commandName)
    if (vimCommand) {
      try {
        const result = await vimCommand.execute(args)
        if (result.success) {
          this.state.history.push(trimmed)
          this.state.lastCommand = trimmed
        }
        return result
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }

    return { success: false, error: `Unknown command: ${commandName}` }
  }

  async insertAIResponse(response: string): Promise<void> {
    const lines = response.split('\n')
    const insertLine = this.state.cursor.line + 1

    this.state.buffer.splice(insertLine, 0, ...lines)
    this.emit('bufferChange', this.state.buffer)
  }

  private initializeDefaultCommands(): void {
    const commands: VimCommand[] = [
      {
        name: 'q',
        aliases: ['quit'],
        description: 'Quit vim mode',
        execute: async () => {
          this.emit('quit')
          return { success: true, message: 'Quitting vim mode' }
        },
      },
      {
        name: 'w',
        aliases: ['write'],
        description: 'Write buffer (save)',
        execute: async () => {
          this.emit('save')
          return { success: true, message: 'Buffer saved' }
        },
      },
      {
        name: 'wq',
        aliases: ['writeq'],
        description: 'Write and quit',
        execute: async () => {
          this.emit('save')
          this.emit('quit')
          return { success: true, message: 'Buffer saved and quitting' }
        },
      },
      {
        name: 'e',
        aliases: ['edit'],
        description: 'Edit file',
        execute: async (args: string[]) => {
          if (args.length === 0) {
            return { success: false, error: 'No filename specified' }
          }
          this.emit('editFile', args[0])
          return { success: true, message: `Editing ${args[0]}` }
        },
      },
      {
        name: 'sp',
        aliases: ['split'],
        description: 'Split window horizontally',
        execute: async () => {
          this.emit('split', 'horizontal')
          return { success: true, message: 'Window split horizontally' }
        },
      },
      {
        name: 'vs',
        aliases: ['vsplit'],
        description: 'Split window vertically',
        execute: async () => {
          this.emit('split', 'vertical')
          return { success: true, message: 'Window split vertically' }
        },
      },
      {
        name: 'set',
        description: 'Set options',
        execute: async (args: string[]) => {
          if (args.length === 0) {
            return this.showCurrentSettings()
          }
          return this.setSetting(args[0], args.slice(1))
        },
      },
      {
        name: 'help',
        aliases: ['h'],
        description: 'Show help',
        execute: async (args: string[]) => {
          return this.showHelp(args[0])
        },
      },
      {
        name: 'ai',
        description: 'AI commands',
        execute: async (args: string[]) => {
          if (!this.config.aiIntegration) {
            return { success: false, error: 'AI integration disabled' }
          }
          return this.handleAICommand(args)
        },
      },
      {
        name: 'generate',
        aliases: ['gen'],
        description: 'Generate code with AI',
        execute: async (args: string[]) => {
          if (!this.config.aiIntegration) {
            return { success: false, error: 'AI integration disabled' }
          }
          const prompt = args.join(' ')
          this.emit('aiRequest', `generate: ${prompt}`)
          return { success: true, message: 'AI generation requested' }
        },
      },
      {
        name: 'explain',
        description: 'Explain code with AI',
        execute: async (args: string[]) => {
          if (!this.config.aiIntegration) {
            return { success: false, error: 'AI integration disabled' }
          }
          const context = this.getSelectedText() || this.getCurrentLine()
          this.emit('aiRequest', `explain: ${context}`)
          return { success: true, message: 'AI explanation requested' }
        },
      },
      {
        name: 'refactor',
        aliases: ['ref'],
        description: 'Refactor code with AI',
        execute: async (args: string[]) => {
          if (!this.config.aiIntegration) {
            return { success: false, error: 'AI integration disabled' }
          }
          const context = this.getSelectedText() || this.getCurrentLine()
          const instruction = args.join(' ')
          this.emit('aiRequest', `refactor: ${context} -> ${instruction}`)
          return { success: true, message: 'AI refactoring requested' }
        },
      },
      {
        name: 'comment',
        description: 'Add comments with AI',
        execute: async () => {
          if (!this.config.aiIntegration) {
            return { success: false, error: 'AI integration disabled' }
          }
          const context = this.getSelectedText() || this.getCurrentLine()
          this.emit('aiRequest', `comment: ${context}`)
          return { success: true, message: 'AI commenting requested' }
        },
      },
      {
        name: 'search',
        aliases: ['/'],
        description: 'Search in buffer',
        execute: async (args: string[]) => {
          const pattern = args.join(' ')
          if (!pattern) {
            return { success: false, error: 'No search pattern provided' }
          }
          return this.search(pattern)
        },
      },
      {
        name: 'replace',
        aliases: ['s'],
        description: 'Search and replace',
        execute: async (args: string[]) => {
          if (args.length < 2) {
            return { success: false, error: 'Usage: :s/pattern/replacement/' }
          }
          return this.searchAndReplace(args[0], args[1], args[2] === 'g')
        },
      },
    ]

    commands.forEach((command) => {
      this.commands.set(command.name, command)
      command.aliases?.forEach((alias) => {
        this.commands.set(alias, command)
      })
    })
  }

  private findCommand(name: string): VimCommand | null {
    return this.commands.get(name) || null
  }

  private async showCurrentSettings(): Promise<CommandResult> {
    const settings = [
      `AI Integration: ${this.config.aiIntegration ? 'enabled' : 'disabled'}`,
      `Theme: ${this.config.theme}`,
      `Status Line: ${this.config.statusLine ? 'enabled' : 'disabled'}`,
      `Line Numbers: ${this.config.lineNumbers ? 'enabled' : 'disabled'}`,
    ]

    return {
      success: true,
      message: `Current settings:\n${settings.join('\n')}`,
    }
  }

  private async setSetting(setting: string, args: string[]): Promise<CommandResult> {
    const [option, value] = setting.split('=')

    switch (option) {
      case 'ai':
        this.config.aiIntegration = value === 'true' || value === '1'
        return { success: true, message: `AI integration ${this.config.aiIntegration ? 'enabled' : 'disabled'}` }

      case 'theme':
        if (['default', 'minimal', 'enhanced'].includes(value)) {
          this.config.theme = value as any
          return { success: true, message: `Theme set to ${value}` }
        }
        return { success: false, error: 'Invalid theme. Options: default, minimal, enhanced' }

      case 'statusline':
        this.config.statusLine = value === 'true' || value === '1'
        return { success: true, message: `Status line ${this.config.statusLine ? 'enabled' : 'disabled'}` }

      case 'number':
        this.config.lineNumbers = value === 'true' || value === '1'
        return { success: true, message: `Line numbers ${this.config.lineNumbers ? 'enabled' : 'disabled'}` }

      default:
        return { success: false, error: `Unknown setting: ${option}` }
    }
  }

  private async showHelp(topic?: string): Promise<CommandResult> {
    if (!topic) {
      const commandList = Array.from(this.commands.values())
        .filter((cmd, index, array) => array.findIndex((c) => c.name === cmd.name) === index)
        .map((cmd) => `  :${cmd.name} - ${cmd.description}`)
        .join('\n')

      return {
        success: true,
        message: `Available commands:\n${commandList}\n\nFor specific help: :help <command>`,
      }
    }

    const command = this.findCommand(topic)
    if (command) {
      let help = `Command: ${command.name}\nDescription: ${command.description}`
      if (command.aliases && command.aliases.length > 0) {
        help += `\nAliases: ${command.aliases.join(', ')}`
      }
      return { success: true, message: help }
    }

    return { success: false, error: `No help available for: ${topic}` }
  }

  private async handleAICommand(args: string[]): Promise<CommandResult> {
    if (args.length === 0) {
      return {
        success: true,
        message: 'AI commands: generate, explain, refactor, comment',
      }
    }

    const subcommand = args[0]
    const prompt = args.slice(1).join(' ')

    switch (subcommand) {
      case 'generate':
      case 'gen':
        this.emit('aiRequest', `generate: ${prompt}`)
        break
      case 'explain':
        const context = this.getSelectedText() || this.getCurrentLine()
        this.emit('aiRequest', `explain: ${context}`)
        break
      case 'refactor':
      case 'ref':
        const refactorContext = this.getSelectedText() || this.getCurrentLine()
        this.emit('aiRequest', `refactor: ${refactorContext} -> ${prompt}`)
        break
      case 'comment':
        const commentContext = this.getSelectedText() || this.getCurrentLine()
        this.emit('aiRequest', `comment: ${commentContext}`)
        break
      default:
        return { success: false, error: `Unknown AI command: ${subcommand}` }
    }

    return { success: true, message: `AI ${subcommand} requested` }
  }

  private search(pattern: string): CommandResult {
    const regex = new RegExp(pattern, 'gi')
    const matches: Array<{ line: number; column: number; text: string }> = []

    this.state.buffer.forEach((line, lineIndex) => {
      let match
      while ((match = regex.exec(line)) !== null) {
        matches.push({
          line: lineIndex,
          column: match.index,
          text: match[0],
        })
      }
    })

    if (matches.length === 0) {
      return { success: false, error: `Pattern not found: ${pattern}` }
    }

    this.emit('searchResults', matches)
    return { success: true, message: `Found ${matches.length} matches` }
  }

  private searchAndReplace(pattern: string, replacement: string, global: boolean = false): CommandResult {
    const regex = new RegExp(pattern, global ? 'g' : '')
    let replacements = 0

    if (global) {
      this.state.buffer.forEach((line, index) => {
        const newLine = line.replace(regex, replacement)
        if (newLine !== line) {
          this.state.buffer[index] = newLine
          replacements += (line.match(regex) || []).length
        }
      })
    } else {
      const currentLine = this.state.cursor.line
      const line = this.state.buffer[currentLine]
      const newLine = line.replace(regex, replacement)
      if (newLine !== line) {
        this.state.buffer[currentLine] = newLine
        replacements = 1
      }
    }

    if (replacements > 0) {
      this.emit('bufferChange', this.state.buffer)
      return { success: true, message: `${replacements} replacement${replacements > 1 ? 's' : ''} made` }
    }

    return { success: false, error: 'No matches found' }
  }

  private getCurrentLine(): string {
    return this.state.buffer[this.state.cursor.line] || ''
  }

  private getSelectedText(): string | null {
    if (this.state.mode !== VimMode.VISUAL && this.state.mode !== VimMode.VISUAL_LINE) {
      return null
    }
    return ''
  }

  private setupCommandMode(): void {
    this.on('commandInput', (char: string) => {
      this.commandBuffer += char
    })

    this.on('commandBackspace', () => {
      this.commandBuffer = this.commandBuffer.slice(0, -1)
    })

    this.on('commandSubmit', () => {
      if (this.commandBuffer.trim()) {
        this.execute(this.commandBuffer).then((result) => {
          if (result.success && result.message) {
            CliUI.logInfo(result.message)
          } else if (!result.success && result.error) {
            CliUI.logError(result.error)
          }
        })
      }
      this.commandBuffer = ''
    })
  }

  getCommandBuffer(): string {
    return this.commandBuffer
  }

  clearCommandBuffer(): void {
    this.commandBuffer = ''
  }

  updateConfig(config: VimModeConfig): void {
    this.config = config
  }
}
