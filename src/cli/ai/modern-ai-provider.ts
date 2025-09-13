import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGateway } from '@ai-sdk/gateway'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { createVercel } from '@ai-sdk/vercel'
import { type CoreMessage, type CoreTool, generateText, streamText, tool } from 'ai'
import { z } from 'zod'
import { simpleConfigManager } from '../core/config-manager'
import { PromptManager } from '../prompts/prompt-manager'

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'vercel' | 'gateway' | 'openrouter'
  model: string
  temperature?: number
  maxTokens?: number
}

export class ModernAIProvider {
  private currentModel: string
  private workingDirectory: string = process.cwd()
  private promptManager: PromptManager

  constructor() {
    this.currentModel = simpleConfigManager.get('currentModel')
    this.promptManager = PromptManager.getInstance(process.cwd())
  }

  // Load tool-specific prompts for enhanced execution
  private async getToolPrompt(toolName: string, parameters: any = {}): Promise<string> {
    try {
      return await this.promptManager.loadPromptForContext({
        toolName,
        parameters: {
          workingDirectory: this.workingDirectory,
          ...parameters,
        },
      })
    } catch (_error) {
      // Return fallback prompt if file prompt fails
      return `Execute ${toolName} with the provided parameters. Follow best practices and provide clear, helpful output.`
    }
  }


  // Core file operations tools - Claude Code style
  private getFileOperationsTools(): Record<string, CoreTool> {
    return {
      read_file: tool({
        description: 'Read the contents of a file',
        parameters: z.object({
          path: z.string().describe('The file path to read'),
        }),
        execute: async ({ path }) => {
          try {
            // Load tool-specific prompt for context

            const fullPath = resolve(this.workingDirectory, path)
            if (!existsSync(fullPath)) {
              return { error: `File not found: ${path}` }
            }
            const content = readFileSync(fullPath, 'utf-8')
            const stats = statSync(fullPath)
            return {
              content,
              size: stats.size,
              modified: stats.mtime,
              path: relative(this.workingDirectory, fullPath),
            }
          } catch (error: any) {
            return { error: `Failed to read file: ${error.message}` }
          }
        },
      }),

      write_file: tool({
        description: 'Write content to a file',
        parameters: z.object({
          path: z.string().describe('The file path to write to'),
          content: z.string().describe('The content to write'),
        }),
        execute: async ({ path, content }) => {
          try {
            // Load tool-specific prompt for context

            const fullPath = resolve(this.workingDirectory, path)
            const dir = dirname(fullPath)

            // Create directory if it doesn't exist
            const { mkdirSync } = await import('node:fs')
            mkdirSync(dir, { recursive: true })

            writeFileSync(fullPath, content, 'utf-8')
            const stats = statSync(fullPath)

            // File operation completed

            return {
              path: relative(this.workingDirectory, fullPath),
              size: stats.size,
              created: true,
            }
          } catch (error: any) {
            return { error: `Failed to write file: ${error.message}` }
          }
        },
      }),

      list_directory: tool({
        description: 'List files and directories in a path',
        parameters: z.object({
          path: z.string().describe('The directory path to list').optional(),
          pattern: z.string().describe('Optional glob pattern to filter files').optional(),
        }),
        execute: async ({ path = '.', pattern }) => {
          try {
            const fullPath = resolve(this.workingDirectory, path)
            if (!existsSync(fullPath)) {
              return { error: `Directory not found: ${path}` }
            }

            const items = readdirSync(fullPath, { withFileTypes: true })
            const files = []
            const directories = []

            for (const item of items) {
              if (pattern && !item.name.includes(pattern)) continue

              const itemPath = join(fullPath, item.name)
              const stats = statSync(itemPath)
              const itemInfo = {
                name: item.name,
                path: relative(this.workingDirectory, itemPath),
                size: stats.size,
                modified: stats.mtime,
              }

              if (item.isDirectory()) {
                directories.push(itemInfo)
              } else {
                files.push(itemInfo)
              }
            }

            return {
              path: relative(this.workingDirectory, fullPath),
              files,
              directories,
              total: files.length + directories.length,
            }
          } catch (error: any) {
            return { error: `Failed to list directory: ${error.message}` }
          }
        },
      }),

      execute_command: tool({
        description: 'Execute a shell command',
        parameters: z.object({
          command: z.string().describe('The command to execute'),
          args: z.array(z.string()).describe('Command arguments').optional(),
        }),
        execute: async ({ command, args = [] }) => {
          try {
            const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command

            // Executing command

            const output = execSync(fullCommand, {
              cwd: this.workingDirectory,
              encoding: 'utf-8',
              maxBuffer: 1024 * 1024 * 10, // 10MB buffer
            })

            return {
              command: fullCommand,
              output: output.trim(),
              success: true,
            }
          } catch (error: any) {
            // Command failed
            return {
              command: `${command} ${args.join(' ')}`,
              error: error.message,
              success: false,
            }
          }
        },
      }),

      analyze_workspace: tool({
        description: 'Analyze the current workspace/project structure',
        parameters: z.object({
          depth: z.number().describe('Directory depth to analyze').optional(),
        }),
        execute: async ({ depth = 2 }) => {
          try {
            const analysis = await this.analyzeWorkspaceStructure(this.workingDirectory, depth)
            return analysis
          } catch (error: any) {
            return { error: `Failed to analyze workspace: ${error.message}` }
          }
        },
      }),

      coinbase_blockchain: tool({
        description: 'Execute blockchain operations using Coinbase AgentKit - supports wallet info, transfers, balances, and DeFi operations',
        parameters: z.object({
          action: z.string().describe('The blockchain action to perform: init, chat, wallet-info, transfer, balance, status, reset'),
          params: z.any().optional().describe('Parameters for the blockchain action (e.g., {to: "0x...", amount: "0.1"} for transfers)'),
        }),
        execute: async ({ action, params = {} }) => {
          try {
            const { secureTools } = await import('../tools/secure-tools-registry')
            const result = await secureTools.executeCoinbaseAgentKit(action, params)
            
            if (result.success) {
              return {
                success: true,
                action,
                data: result.data,
                message: `Blockchain operation '${action}' completed successfully`,
              }
            } else {
              return {
                success: false,
                action,
                error: result.error,
                message: `Blockchain operation '${action}' failed`,
              }
            }
          } catch (error: any) {
            return {
              success: false,
              action,
              error: error.message,
              message: `Failed to execute blockchain operation: ${error.message}`,
            }
          }
        },
      }),
    }
  }

  private async analyzeWorkspaceStructure(rootPath: string, maxDepth: number): Promise<any> {
    const packageJsonPath = join(rootPath, 'package.json')
    let packageInfo = null

    if (existsSync(packageJsonPath)) {
      try {
        packageInfo = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
      } catch (_e) {
        // Invalid package.json
      }
    }

    const structure = this.buildDirectoryTree(rootPath, maxDepth)
    const framework = this.detectFramework(packageInfo)
    const technologies = this.detectTechnologies(packageInfo, structure)

    return {
      rootPath: relative(process.cwd(), rootPath),
      packageInfo: packageInfo
        ? {
            name: packageInfo.name,
            version: packageInfo.version,
            description: packageInfo.description,
          }
        : null,
      framework,
      technologies,
      structure,
      files: this.countFiles(structure),
    }
  }

  private buildDirectoryTree(dirPath: string, maxDepth: number, currentDepth = 0): any {
    if (currentDepth >= maxDepth || !existsSync(dirPath)) {
      return null
    }

    const items = readdirSync(dirPath, { withFileTypes: true })
    const result: any = {
      directories: [],
      files: [],
    }

    const skipDirs = ['node_modules', '.git', '.next', 'dist', 'build']

    for (const item of items) {
      if (skipDirs.includes(item.name)) continue

      const itemPath = join(dirPath, item.name)

      if (item.isDirectory()) {
        const subTree = this.buildDirectoryTree(itemPath, maxDepth, currentDepth + 1)
        if (subTree) {
          result.directories.push({
            name: item.name,
            path: relative(this.workingDirectory, itemPath),
            ...subTree,
          })
        }
      } else {
        result.files.push({
          name: item.name,
          path: relative(this.workingDirectory, itemPath),
          extension: item.name.split('.').pop() || '',
        })
      }
    }

    return result
  }

  private detectFramework(packageInfo: any): string {
    if (!packageInfo?.dependencies) return 'Unknown'

    const deps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }

    if (deps.next) return 'Next.js'
    if (deps.nuxt) return 'Nuxt.js'
    if (deps['@angular/core']) return 'Angular'
    if (deps.vue) return 'Vue.js'
    if (deps.react) return 'React'
    if (deps.express) return 'Express'
    if (deps.fastify) return 'Fastify'

    return 'JavaScript/Node.js'
  }

  private detectTechnologies(packageInfo: any, structure: any): string[] {
    const technologies: Set<string> = new Set()

    if (packageInfo?.dependencies) {
      const allDeps = { ...packageInfo.dependencies, ...packageInfo.devDependencies }

      Object.keys(allDeps).forEach((dep) => {
        if (dep.includes('typescript') || dep.includes('@types/')) technologies.add('TypeScript')
        if (dep.includes('tailwind')) technologies.add('Tailwind CSS')
        if (dep.includes('prisma')) technologies.add('Prisma')
        if (dep.includes('next')) technologies.add('Next.js')
        if (dep.includes('react')) technologies.add('React')
        if (dep.includes('vue')) technologies.add('Vue.js')
        if (dep.includes('express')) technologies.add('Express')
        if (dep.includes('jest')) technologies.add('Jest')
        if (dep.includes('vitest')) technologies.add('Vitest')
      })
    }

    // Detect from file extensions
    this.extractFileExtensions(structure).forEach((ext) => {
      switch (ext) {
        case 'ts':
        case 'tsx':
          technologies.add('TypeScript')
          break
        case 'py':
          technologies.add('Python')
          break
        case 'go':
          technologies.add('Go')
          break
        case 'rs':
          technologies.add('Rust')
          break
        case 'java':
          technologies.add('Java')
          break
      }
    })

    return Array.from(technologies)
  }

  private extractFileExtensions(structure: any): string[] {
    const extensions: Set<string> = new Set()

    if (structure?.files) {
      structure.files.forEach((file: any) => {
        if (file.extension) extensions.add(file.extension)
      })
    }

    if (structure?.directories) {
      structure.directories.forEach((dir: any) => {
        this.extractFileExtensions(dir).forEach((ext) => extensions.add(ext))
      })
    }

    return Array.from(extensions)
  }

  private countFiles(structure: any): number {
    let count = 0

    if (structure?.files) count += structure.files.length
    if (structure?.directories) {
      structure.directories.forEach((dir: any) => {
        count += this.countFiles(dir)
      })
    }

    return count
  }

  private getModel(modelName?: string) {
    const model = modelName || this.currentModel
    const config = simpleConfigManager?.getCurrentModel() as any

    if (!config) {
      throw new Error(`Model ${model} not found in configuration`)
    }

    const apiKey = simpleConfigManager.getApiKey(model)
    if (!apiKey) {
      throw new Error(`No API key found for model ${model}`)
    }

    switch (config.provider) {
      case 'openai':
        // OpenAI provider is already response-API compatible via model options; no chainable helper here.
        const openaiProvider = createOpenAI({ apiKey })
        return openaiProvider(config.model)
      case 'anthropic':
        const anthropicProvider = createAnthropic({ apiKey })
        return anthropicProvider(config.model)
      case 'google':
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        return googleProvider(config.model)
      case 'vercel':
        const vercelProvider = createVercel({ apiKey })
        return vercelProvider(config.model)
      case 'gateway':
        const gatewayProvider = createGateway({ apiKey })
        return gatewayProvider(config.model)
      case 'openrouter':
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.ai', // Optional: for attribution
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider(config.model) // Assumes model like 'openai/gpt-4o'
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }

  // Claude Code style streaming with tool support
  async *streamChatWithTools(messages: CoreMessage[]): AsyncGenerator<
    {
      type: 'text' | 'tool_call' | 'tool_result' | 'finish'
      content?: string
      toolCall?: any
      toolResult?: any
      finishReason?: string
    },
    void,
    unknown
  > {
    const model = this.getModel() as any
    const tools = this.getFileOperationsTools()

    try {
      const result = await streamText({
        model,
        messages,
        tools,
        maxTokens: 8000,
        temperature: 1,
      })

      for await (const delta of result.textStream) {
        yield {
          type: 'text',
          content: delta,
        }
      }

      const finishResult = await result.finishReason
      yield {
        type: 'finish',
        finishReason: finishResult,
      }
    } catch (error: any) {
      throw new Error(`Stream generation failed: ${error.message}`)
    }
  }

  // Generate complete response with tools
  async generateWithTools(messages: CoreMessage[]): Promise<{
    text: string
    toolCalls: any[]
    toolResults: any[]
  }> {
    const model = this.getModel() as any
    const tools = this.getFileOperationsTools()

    try {
      const result = await generateText({
        model,
        messages,
        tools,
        maxToolRoundtrips: 25,
        maxTokens: 8000,
        temperature: 0.7,
      })

      return {
        text: result.text,
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
      }
    } catch (error: any) {
      throw new Error(`Generation failed: ${error.message}`)
    }
  }

  // Set working directory for file operations
  setWorkingDirectory(directory: string): void {
    this.workingDirectory = resolve(directory)
  }

  // Get current working directory
  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  // Set current model
  setModel(modelName: string): void {
    this.currentModel = modelName
  }


  // Get current model info
  getCurrentModelInfo() {
    const config = simpleConfigManager.get('models')
    return {
      name: this.currentModel,
      config: config || { provider: 'unknown', model: 'unknown' },
    }
  }

  // Validate API key for current model
  validateApiKey(): boolean {
    try {
      const apiKey = simpleConfigManager.getApiKey(this.currentModel)
      return !!apiKey
    } catch {
      return false
    }
  }
}

export const modernAIProvider = new ModernAIProvider()
