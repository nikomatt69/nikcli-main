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
import { type PromptContext, PromptManager } from '../prompts/prompt-manager'
import type { OutputStyle } from '../types/output-styles'
import { ReasoningDetector } from './reasoning-detector'

export interface ModelConfig {
  provider: 'openai' | 'anthropic' | 'google' | 'vercel' | 'gateway' | 'openrouter'
  model: string
  temperature?: number
  maxTokens?: number
  enableReasoning?: boolean
  reasoningMode?: 'auto' | 'explicit' | 'disabled'
  outputStyle?: OutputStyle
}

export interface AIProviderOptions {
  outputStyle?: OutputStyle
  context?: string
  taskType?: string
  modelOverride?: string
}

export class ModernAIProvider {
  private currentModel: string
  private workingDirectory: string = process.cwd()
  private promptManager: PromptManager

  constructor() {
    this.currentModel = simpleConfigManager.get('currentModel')
    this.promptManager = PromptManager.getInstance(process.cwd())
  }

  /**
   * Check if reasoning should be enabled for current model
   */
  private shouldEnableReasoning(): boolean {
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) return false

    // Check model's explicit reasoning setting
    if (config.enableReasoning !== undefined) {
      return config.enableReasoning
    }

    // Auto-detect based on model capabilities
    return ReasoningDetector.shouldEnableReasoning(config.provider, config.model)
  }

  /**
   * Log reasoning status if enabled
   */
  private logReasoningStatus(enabled: boolean): void {
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) return

    try {
      const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
      const msg = `[Reasoning] ${config.model}: ${summary} - ${enabled ? 'ENABLED' : 'DISABLED'}`
      console.log(require('chalk').dim(msg))
    } catch {
      // Silent fail for logging
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
        description:
          'Execute blockchain operations using Coinbase AgentKit - supports wallet info, transfers, balances, and DeFi operations',
        parameters: z.object({
          action: z
            .string()
            .describe('The blockchain action to perform: init, chat, wallet-info, transfer, balance, status, reset'),
          params: z
            .any()
            .optional()
            .describe('Parameters for the blockchain action (e.g., {to: "0x...", amount: "0.1"} for transfers)'),
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
      case 'openai': {
        // OpenAI provider is already response-API compatible via model options; no chainable helper here.
        const openaiProvider = createOpenAI({ apiKey })
        return openaiProvider(config.model)
      }
      case 'anthropic': {
        const anthropicProvider = createAnthropic({ apiKey })
        return anthropicProvider(config.model)
      }
      case 'google': {
        const googleProvider = createGoogleGenerativeAI({ apiKey })
        return googleProvider(config.model)
      }
      case 'vercel': {
        const vercelProvider = createVercel({ apiKey })
        return vercelProvider(config.model)
      }
      case 'gateway': {
        const gatewayProvider = createGateway({ apiKey })
        return gatewayProvider(config.model)
      }
      case 'openrouter': {
        const openrouterProvider = createOpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          headers: {
            'HTTP-Referer': 'https://nikcli.ai', // Optional: for attribution
            'X-Title': 'NikCLI',
          },
        })
        return openrouterProvider(config.model) // Assumes model like 'openai/gpt-4o'
      }
      default:
        throw new Error(`Unsupported provider: ${config.provider}`)
    }
  }

  // Claude Code style streaming with tool support
  async *streamChatWithTools(messages: CoreMessage[]): AsyncGenerator<
    {
      type: 'text' | 'tool_call' | 'tool_result' | 'finish' | 'reasoning'
      content?: string
      toolCall?: any
      toolResult?: any
      finishReason?: string
      reasoningSummary?: string
    },
    void,
    unknown
  > {
    const model = this.getModel() as any
    const tools = this.getFileOperationsTools()
    const reasoningEnabled = this.shouldEnableReasoning()

    // Yield reasoning summary before streaming if enabled
    if (reasoningEnabled) {
      const config = simpleConfigManager?.getCurrentModel() as any
      if (config) {
        const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
        yield {
          type: 'reasoning',
          reasoningSummary: summary,
        }
      }
    }

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
    reasoning?: any
    reasoningText?: string
  }> {
    const model = this.getModel() as any
    const tools = this.getFileOperationsTools()
    const reasoningEnabled = this.shouldEnableReasoning()

    this.logReasoningStatus(reasoningEnabled)

    try {
      const result = await generateText({
        model,
        messages,
        tools,
        maxToolRoundtrips: 25,
        maxTokens: 8000,
        temperature: 0.7,
      })

      // Extract reasoning if available
      let reasoningData = {}
      if (reasoningEnabled) {
        const config = simpleConfigManager?.getCurrentModel() as any
        if (config) {
          reasoningData = ReasoningDetector.extractReasoning(result, config.provider)
        }
      }

      return {
        text: result.text,
        toolCalls: result.toolCalls || [],
        toolResults: result.toolResults || [],
        ...reasoningData,
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

  // Get current model name (helper for other modules)
  getCurrentModel(): string {
    return this.currentModel
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

  // Get reasoning capabilities for current model
  getReasoningCapabilities() {
    const config = simpleConfigManager?.getCurrentModel() as any
    if (!config) {
      return {
        supportsReasoning: false,
        reasoningType: 'none',
        summary: 'No model configuration found',
        enabled: false,
      }
    }

    const capabilities = ReasoningDetector.detectReasoningSupport(config.provider, config.model)
    const summary = ReasoningDetector.getModelReasoningSummary(config.provider, config.model)
    const enabled = this.shouldEnableReasoning()

    return {
      supportsReasoning: capabilities.supportsReasoning,
      reasoningType: capabilities.reasoningType,
      summary,
      enabled,
    }
  }

  // Get list of all reasoning-enabled models
  getReasoningEnabledModels(): string[] {
    return ReasoningDetector.getReasoningEnabledModels()
  }

  /**
   * Enhanced streaming with output style support
   */
  async *streamChatWithStyle(
    messages: CoreMessage[],
    options: AIProviderOptions = {}
  ): AsyncGenerator<{
    type: 'text' | 'tool_call' | 'tool_result' | 'finish' | 'reasoning' | 'style_applied'
    content?: string
    toolCall?: any
    toolResult?: any
    finishReason?: string
    reasoningSummary?: string
    outputStyle?: OutputStyle
  }> {
    // Resolve output style
    const outputStyle = this.resolveOutputStyle(options)

    // Create enhanced messages with output style
    const enhancedMessages = await this.enhanceMessagesWithStyle(messages, outputStyle, options)

    yield {
      type: 'style_applied',
      outputStyle: outputStyle,
    }

    // Continue with normal streaming using enhanced messages
    yield* this.streamChatWithTools(enhancedMessages)
  }

  /**
   * Enhanced generation with output style support
   */
  async generateWithStyle(
    messages: CoreMessage[],
    options: AIProviderOptions = {}
  ): Promise<{
    text: string
    toolCalls: any[]
    toolResults: any[]
    reasoning?: any
    reasoningText?: string
    outputStyle: OutputStyle
    enhancedPrompt?: string
  }> {
    // Resolve output style
    const outputStyle = this.resolveOutputStyle(options)

    // Create enhanced messages with output style
    const enhancedMessages = await this.enhanceMessagesWithStyle(messages, outputStyle, options)

    // Generate response with enhanced messages
    const result = await this.generateWithTools(enhancedMessages)

    return {
      ...result,
      outputStyle,
      enhancedPrompt: typeof enhancedMessages[0]?.content === 'string' ? enhancedMessages[0].content : '',
    }
  }

  /**
   * Resolve output style from options, model config, and defaults
   */
  private resolveOutputStyle(options: AIProviderOptions): OutputStyle {
    // 1. Explicit options override
    if (options.outputStyle) {
      return options.outputStyle
    }

    // 2. Model-specific configuration
    const modelName = options.modelOverride || this.currentModel
    const modelStyle = simpleConfigManager.getModelOutputStyle(modelName)
    if (modelStyle) {
      return modelStyle
    }

    // 3. Context-specific configuration
    if (options.context) {
      const contextStyle = simpleConfigManager.getContextOutputStyle(options.context)
      if (contextStyle) {
        return contextStyle
      }
    }

    // 4. Global configuration
    return simpleConfigManager.getDefaultOutputStyle()
  }

  /**
   * Enhance messages with output style prompts
   */
  private async enhanceMessagesWithStyle(
    messages: CoreMessage[],
    outputStyle: OutputStyle,
    options: AIProviderOptions
  ): Promise<CoreMessage[]> {
    if (messages.length === 0) {
      return messages
    }

    try {
      // Create prompt context
      const promptContext: PromptContext = {
        outputStyle,
        taskType: options.taskType,
        parameters: {
          modelName: options.modelOverride || this.currentModel,
          context: options.context,
        },
      }

      // Load enhanced prompt with output style
      const enhancedContext = await this.promptManager.createEnhancedContext(promptContext, simpleConfigManager)

      // Clone messages and enhance the first system message or create one
      const enhancedMessages = [...messages]
      const firstMessage = enhancedMessages[0]

      if (firstMessage?.role === 'system') {
        // Enhance existing system message
        enhancedMessages[0] = {
          ...firstMessage,
          content: enhancedContext.combinedPrompt || firstMessage.content,
        }
      } else {
        // Add new system message with output style
        enhancedMessages.unshift({
          role: 'system',
          content: enhancedContext.combinedPrompt || enhancedContext.outputStylePrompt || '',
        })
      }

      return enhancedMessages
    } catch (error: any) {
      console.warn(`Failed to enhance messages with output style '${outputStyle}': ${error.message}`)
      return messages
    }
  }

  /**
   * Quick style-aware text generation for simple use cases
   */
  async generateSimpleWithStyle(
    prompt: string,
    outputStyle?: OutputStyle,
    options: Omit<AIProviderOptions, 'outputStyle'> = {}
  ): Promise<string> {
    const messages: CoreMessage[] = [{ role: 'user', content: prompt }]

    const result = await this.generateWithStyle(messages, {
      ...options,
      outputStyle,
    })

    return result.text
  }

  /**
   * Get available output styles
   */
  getAvailableOutputStyles(): OutputStyle[] {
    return this.promptManager.listAvailableOutputStyles()
  }

  /**
   * Get current output style configuration
   */
  getCurrentOutputStyleConfig() {
    return {
      defaultStyle: simpleConfigManager.getDefaultOutputStyle(),
      modelStyle: simpleConfigManager.getModelOutputStyle(this.currentModel),
      availableStyles: this.getAvailableOutputStyles(),
      globalConfig: simpleConfigManager.getOutputStyleConfig(),
    }
  }

  /**
   * Set output style for current model
   */
  setModelOutputStyle(style: OutputStyle): void {
    simpleConfigManager.setModelOutputStyle(this.currentModel, style)
  }

  /**
   * Set default output style
   */
  setDefaultOutputStyle(style: OutputStyle): void {
    simpleConfigManager.setDefaultOutputStyle(style)
  }
}

export const modernAIProvider = new ModernAIProvider()
