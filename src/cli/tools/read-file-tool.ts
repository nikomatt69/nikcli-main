import chalk from 'chalk'
import { ContextAwareRAGSystem } from '../context/context-aware-rag'
import { lspManager } from '../lsp/lsp-manager'
import { PromptManager } from '../prompts/prompt-manager'
import {
  type FileInfo,
  type ReadFileOptions,
  ReadFileOptionsSchema,
  type ReadFileResult,
  ReadFileResultSchema,
  TOKEN_CONSTANTS,
} from '../schemas/tool-schemas'
import { advancedUI } from '../ui/advanced-cli-ui'
import { bunFile, bunShell } from '../utils/bun-compat'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath } from './secure-file-tools'

const { DEFAULT_TOKEN_BUDGET, MAX_LINES_PER_CHUNK, TOKEN_CHAR_RATIO } = TOKEN_CONSTANTS

// Enhanced compression configuration
interface CompressionMetrics {
  originalSize: number
  compressedSize: number
  tokensSaved: number
  fieldsCompressed: string[]
}

interface CompressionConfig {
  maxTokens: number
  preserveFields: string[]
  priorityFields: string[]
  compressionRatio: number
}

/**
 * Production-ready Read File Tool
 * Safely reads file contents with security checks and error handling
 */
export class ReadFileTool extends BaseTool {
  private contextSystem: ContextAwareRAGSystem

  constructor(workingDirectory: string) {
    super('read-file-tool', workingDirectory)
    this.contextSystem = new ContextAwareRAGSystem(workingDirectory)
  }

  // Enhanced compression with intelligent strategies
  private truncateForPrompt(s: string, maxChars: number = 2000, contentType: string = 'text'): string {
    if (!s) return ''
    if (s.length <= maxChars) return s

    // Smart truncation based on content type
    switch (contentType) {
      case 'code': {
        // Try to truncate at line boundaries for code
        const lines = s.split('\n')
        let truncated = ''
        for (const line of lines) {
          if (truncated.length + line.length > maxChars) break
          truncated += `${line}\n`
        }
        return truncated + '…[code truncated]'
      }

      case 'json': {
        // Try to truncate at object boundaries
        try {
          const parsed = JSON.parse(s)
          const truncatedJson = JSON.stringify(parsed, null, 2)
          return truncatedJson.length > maxChars
            ? truncatedJson.slice(0, maxChars) + '…[json truncated]'
            : truncatedJson
        } catch {
          // Fallback to regular truncation
          break
        }
      }

      default: {
        // Smart text truncation at sentence boundaries
        const sentences = s.match(/[^.!?]+[.!?]+/g) || [s]
        let result = ''
        for (const sentence of sentences) {
          if (result.length + sentence.length > maxChars) break
          result += sentence
        }
        return result || s.slice(0, maxChars) + '…[truncated]'
      }
    }

    return s.slice(0, maxChars) + '…[truncated]'
  }

  // 🗜️ Enhanced compression with field prioritization
  private compressToolResult(result: any, toolName: string): { compressed: any; metrics: CompressionMetrics } {
    if (!result) return { compressed: result, metrics: this.emptyMetrics() }

    const config = this.getCompressionConfig(toolName)
    const metrics: CompressionMetrics = {
      originalSize: this.estimateTokens(result),
      compressedSize: 0,
      tokensSaved: 0,
      fieldsCompressed: [],
    }

    const compressed = this.compressValue(result, config, metrics)
    metrics.compressedSize = this.estimateTokens(compressed)
    metrics.tokensSaved = metrics.originalSize - metrics.compressedSize

    return { compressed, metrics }
  }

  private getCompressionConfig(toolName: string): CompressionConfig {
    const baseConfig = {
      maxTokens: 4000,
      preserveFields: ['success', 'error', 'filePath', 'size'],
      priorityFields: ['content', 'analysis', 'metadata'],
      compressionRatio: 0.7,
    }

    // Tool-specific configurations
    const toolConfigs: Record<string, Partial<CompressionConfig>> = {
      'read-file-tool': {
        priorityFields: ['content', 'analysis', 'lines'],
        compressionRatio: 0.8,
      },
      'bash-tool': {
        priorityFields: ['stdout', 'stderr', 'exitCode'],
        compressionRatio: 0.6,
      },
    }

    return { ...baseConfig, ...(toolConfigs[toolName] || {}) }
  }

  private compressValue(value: any, config: CompressionConfig, metrics: CompressionMetrics): any {
    if (typeof value === 'string') {
      if (value.length > 1000) {
        const maxLength = Math.floor(1000 * config.compressionRatio)
        return this.truncateForPrompt(value, maxLength, this.inferContentType(value))
      }
      return value
    }

    if (Array.isArray(value)) {
      if (value.length > 10) {
        metrics.fieldsCompressed.push('array')
        return this.smartArrayCompress(value)
      }
      return value
    }

    if (typeof value === 'object' && value !== null) {
      return this.compressObject(value, config, metrics)
    }

    return value
  }

  private compressObject(obj: any, config: CompressionConfig, metrics: CompressionMetrics): any {
    const compressed: any = {}
    const entries = Object.entries(obj)

    // Sort by priority
    entries.sort(([keyA], [keyB]) => {
      const priorityA = config.priorityFields.includes(keyA) ? 1 : 0
      const priorityB = config.priorityFields.includes(keyB) ? 1 : 0
      return priorityB - priorityA
    })

    for (const [key, value] of entries) {
      if (config.preserveFields.includes(key)) {
        compressed[key] = value
        continue
      }

      compressed[key] = this.compressValue(value, config, metrics)
      if (typeof value === 'string' && value.length > 500) {
        metrics.fieldsCompressed.push(key)
      }
    }

    return compressed
  }

  private smartArrayCompress(array: any[]): any[] {
    if (array.length <= 10) return array

    // Smart sampling: take first 3, middle 2, and last 3
    const sampleSize = 8
    const step = Math.floor(array.length / sampleSize)
    const sampled: any[] = []

    for (let i = 0; i < sampleSize && i * step < array.length; i++) {
      sampled.push(array[i * step])
    }

    return sampled.concat([`...and ${array.length - sampled.length} more items [compressed]`])
  }

  private estimateTokens(content: any): number {
    if (typeof content === 'string') {
      const contentType = this.inferContentType(content)
      const ratios = { code: 0.35, json: 0.3, markdown: 0.28, text: 0.25 }
      return Math.ceil(content.length * (ratios[contentType as keyof typeof ratios] || 0.25))
    }

    if (typeof content === 'object' && content !== null) {
      return Object.values(content).reduce((total, value) => (total as any) + this.estimateTokens(value), 0) as any
    }

    return 1
  }

  private inferContentType(content: string): string {
    if (content.includes('```') || content.includes('function') || content.includes('class')) return 'code'
    if (content.includes('{') || content.includes('[')) return 'json'
    if (content.includes('#') || content.includes('*')) return 'markdown'
    return 'text'
  }

  private emptyMetrics(): CompressionMetrics {
    return {
      originalSize: 0,
      compressedSize: 0,
      tokensSaved: 0,
      fieldsCompressed: [],
    }
  }

  async execute(filePath: string, options: ReadFileOptions = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const promptManager = PromptManager.getInstance()
      const systemPrompt = await promptManager.loadPromptForContext({
        toolName: 'read-file-tool',
        parameters: options,
      })
      advancedUI.logInfo(`Using system prompt: ${systemPrompt.substring(0, 100)}...`)
      const result = await this.executeInternal(filePath, options)

      // Apply enhanced compression to result
      const { compressed: compressedResult, metrics } = this.compressToolResult(result, this.name)

      // Log compression statistics
      if (metrics.tokensSaved > 100) {
        advancedUI.logInfo(
          `🗜️ Compressed result: saved ${metrics.tokensSaved} tokens (${((metrics.tokensSaved / metrics.originalSize) * 100).toFixed(1)}%)`
        )
      }

      return {
        success: result.success,
        data: compressedResult,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { filePath, options },
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: error.message,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { filePath, options },
        },
      }
    }
  }

  private async executeInternal(filePath: string, options: ReadFileOptions = {}): Promise<ReadFileResult> {
    try {
      // Zod validation for input parameters
      const validatedOptions = ReadFileOptionsSchema.parse(options)

      if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        throw new Error('filePath must be a non-empty string')
      }

      // Sanitize and validate file path
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory)

      // Check file size if maxSize is specified
      if (validatedOptions.maxSize) {
        const file = bunFile(sanitizedPath)
        const exists = await file.exists()
        if (!exists) {
          throw new Error(`File not found: ${sanitizedPath}`)
        }
        const size = file.size
        if (size > validatedOptions.maxSize) {
          throw new Error(`File too large: ${size} bytes (max: ${validatedOptions.maxSize})`)
        }
      }

      // Read file with specified encoding using chunking to respect token and line budgets
      const encoding = validatedOptions.encoding || 'utf8'
      const file = bunFile(sanitizedPath)
      const fileSize = file.size
      const effectiveMaxLinesPerChunk = Math.min(
        validatedOptions.maxLinesPerChunk ?? MAX_LINES_PER_CHUNK,
        MAX_LINES_PER_CHUNK,
        validatedOptions.maxLines ?? MAX_LINES_PER_CHUNK
      )
      const chunk = await this.readChunkWithBudget(sanitizedPath, encoding as BufferEncoding, {
        startLine: validatedOptions.startLine ?? 1,
        maxLinesPerChunk: effectiveMaxLinesPerChunk,
        tokenBudget: Math.min(validatedOptions.tokenBudget ?? DEFAULT_TOKEN_BUDGET, DEFAULT_TOKEN_BUDGET),
      })
      const content = chunk.content

      // Check if this is an image file and perform vision analysis
      const imageAnalysis = await this.performImageAnalysis(sanitizedPath)

      // LSP + Context Analysis
      await this.performLSPContextAnalysis(sanitizedPath, content, imageAnalysis)

      // Apply content filters if specified
      let processedContent = content
      if (validatedOptions.stripComments && this.isCodeFile(filePath)) {
        processedContent = this.stripComments(processedContent, this.getFileExtension(filePath))
      }

      if (validatedOptions.maxLines && typeof processedContent === 'string') {
        const lines = processedContent.split('\n')
        if (lines.length > validatedOptions.maxLines) {
          processedContent =
            lines.slice(0, validatedOptions.maxLines).join('\n') +
            `\n\n... [File truncated at line ${validatedOptions.maxLines}. Total: ${lines.length} lines]`
        }
      }

      // Add continuation message if file was truncated by token budget
      if (chunk.truncated && chunk.nextStartLine !== null) {
        processedContent += `\n\n💡 To read more: read_file(filePath, { startLine: ${chunk.nextStartLine}, tokenBudget: 3000, maxLinesPerChunk: 200 })`
      }

      const result: ReadFileResult = {
        success: true,
        filePath: sanitizedPath,
        content: processedContent,
        size: fileSize,
        encoding,
        metadata: {
          lines: typeof processedContent === 'string' ? processedContent.split('\n').length : undefined,
          isEmpty: content.length === 0,
          isBinary: encoding !== 'utf8' && encoding !== 'utf-8',
          extension: this.getFileExtension(filePath),
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          nextStartLine: chunk.nextStartLine,
          truncated: chunk.truncated,
          estimatedTokens: chunk.estimatedTokens,
        },
      }

      // Zod validation for result
      const validatedResult = ReadFileResultSchema.parse(result)

      // Show file content in structured UI if not binary and not too large
      if (
        !validatedResult.metadata?.isBinary &&
        typeof processedContent === 'string' &&
        processedContent.length < 50000
      ) {
        advancedUI.showFileContent(sanitizedPath, processedContent)
        if (chunk.truncated && chunk.nextStartLine) {
          advancedUI.logInfo(
            `Read truncated at lines ${chunk.startLine}-${chunk.endLine}; continue from line ${chunk.nextStartLine} to read more.`
          )
        }
      }

      return validatedResult
    } catch (error: any) {
      const errorResult: ReadFileResult = {
        success: false,
        filePath,
        content: '',
        size: 0,
        encoding: options.encoding || 'utf8',
        error: error.message,
        metadata: {
          isEmpty: true,
          isBinary: false,
          extension: this.getFileExtension(filePath),
        },
      }

      // Log error for debugging
      CliUI.logError(`Failed to read file ${filePath}: ${error.message}`)

      return errorResult
    }
  }

  /**
   * Read multiple files in parallel
   */
  async readMultiple(filePaths: string[], options: ReadFileOptions = {}): Promise<ReadFileResult[]> {
    const readPromises = filePaths.map((path) => this.execute(path, options))
    return (await Promise.all(readPromises)).map((result) => result.data)
  }

  /**
   * Read file with streaming for large files using Bun
   */
  async readStream(filePath: string, _chunkSize: number = 1024 * 64): Promise<AsyncIterable<string>> {
    const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
    const file = bunFile(sanitizedPath)

    // For large files, use Bun's streaming capability
    const stream = file.stream()
    const reader = stream.getReader()
    const decoder = new TextDecoder('utf8')

    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            yield decoder.decode(value, { stream: true })
          }
        } finally {
          reader.releaseLock()
        }
      },
    }
  }

  /**
   * Check if file exists and is readable using Bun
   */
  async canRead(filePath: string): Promise<boolean> {
    try {
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
      const file = bunFile(sanitizedPath)
      return await file.exists()
    } catch {
      return false
    }
  }

  /**
   * Get file information without reading content using Bun
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
      const file = bunFile(sanitizedPath)
      const exists = await file.exists()

      if (!exists) {
        throw new Error(`File not found: ${sanitizedPath}`)
      }

      // Use Bun shell to get file stats for more detailed information
      const statsResult = await bunShell(`stat -f "%N|%z|%B|%m|%a" "${sanitizedPath}"`, { quiet: true })

      if (statsResult.exitCode !== 0) {
        throw new Error(`Failed to get file stats: ${statsResult.stderr}`)
      }

      const [_name, size, _blockSize, modifiedTime, accessTime] = statsResult.stdout.trim().split('|')

      return {
        path: sanitizedPath,
        size: parseInt(size, 10),
        isFile: !sanitizedPath.endsWith('/'),
        isDirectory: sanitizedPath.endsWith('/'),
        created: new Date(parseInt(modifiedTime, 10) * 1000), // Approximate
        modified: new Date(parseInt(modifiedTime, 10) * 1000),
        accessed: new Date(parseInt(accessTime, 10) * 1000),
        extension: this.getFileExtension(filePath),
        isReadable: await this.canRead(filePath),
      }
    } catch (error: any) {
      throw new Error(`Failed to get file info: ${error.message}`)
    }
  }

  /**
   * Strip comments from code files
   */
  private stripComments(content: string, extension: string): string {
    switch (extension.toLowerCase()) {
      case '.js':
      case '.ts':
      case '.jsx':
      case '.tsx':
        // Remove single-line comments
        content = content.replace(/\/\/.*$/gm, '')
        // Remove multi-line comments
        content = content.replace(/\/\*[\s\S]*?\*\//g, '')
        break
      case '.py':
        // Remove Python comments
        content = content.replace(/#.*$/gm, '')
        break
      case '.css':
      case '.scss':
        // Remove CSS comments
        content = content.replace(/\/\*[\s\S]*?\*\//g, '')
        break
      case '.html':
      case '.xml': {
        // Remove HTML/XML comments with complete sanitization
        let previousContent: string
        do {
          previousContent = content
          content = content.replace(/<!--[\s\S]*?-->/g, '')
        } while (content !== previousContent)
        break
      }
    }

    // Clean up extra whitespace
    return content.replace(/\n\s*\n/g, '\n').trim()
  }

  /**
   * Check if file is a code file based on extension
   */
  private isCodeFile(filePath: string): boolean {
    const codeExtensions = [
      '.js',
      '.ts',
      '.jsx',
      '.tsx',
      '.py',
      '.java',
      '.c',
      '.cpp',
      '.h',
      '.hpp',
      '.cs',
      '.php',
      '.rb',
      '.go',
      '.rs',
      '.swift',
      '.kt',
      '.scala',
      '.clj',
      '.css',
      '.scss',
      '.sass',
      '.less',
      '.html',
      '.xml',
      '.json',
      '.yaml',
      '.yml',
    ]

    const extension = this.getFileExtension(filePath)
    return codeExtensions.includes(extension.toLowerCase())
  }

  /**
   * Check if file is an image based on extension
   */
  private isImageFile(filePath: string): boolean {
    const imageExtensions = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.bmp',
      '.tiff',
      '.tif',
      '.svg',
      '.ico',
      '.avif',
      '.heic',
      '.heif',
    ]

    const extension = this.getFileExtension(filePath)
    return imageExtensions.includes(extension.toLowerCase())
  }

  /**
   * Perform image analysis if the file is an image
   */
  private async performImageAnalysis(filePath: string): Promise<any> {
    if (!this.isImageFile(filePath)) {
      return null
    }

    try {
      // Check if vision provider is available
      if (typeof (global as any).visionProvider === 'undefined') {
        console.log(chalk.yellow('⚠︎ Vision provider not available for image analysis'))
        return { error: 'Vision provider not available' }
      }

      console.log(chalk.blue(`👁️ Analyzing image: ${filePath}`))

      const analysis = await (global as any).visionProvider.analyzeImage(filePath, {
        prompt:
          'Provide a comprehensive analysis of this image including: description, objects, text content, colors, composition, and technical details.',
        cache: true,
      })

      console.log(chalk.green('✓ Image analysis completed'))

      // Display image analysis in UI
      if (analysis?.description) {
        advancedUI.showFileContent(filePath, analysis.description)
      }

      return {
        description: analysis.description,
        objects: analysis.objects || [],
        text: analysis.text || '',
        colors: analysis.colors || [],
        composition: analysis.composition || '',
        technical_quality: analysis.technical_quality || '',
        confidence: analysis.confidence || 0,
        metadata: analysis.metadata || {},
      }
    } catch (error: any) {
      console.log(chalk.yellow(`⚠︎ Image analysis failed: ${error.message}`))
      return { error: error.message }
    }
  }

  /**
   * Get file extension
   */
  private getFileExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf('.')
    return lastDot >= 0 ? filePath.substring(lastDot) : ''
  }

  private async performLSPContextAnalysis(filePath: string, content: string, imageAnalysis: any = null): Promise<void> {
    try {
      // LSP Analysis (only for code files)
      const lspContext = null
      if (this.isCodeFile(filePath)) {
        const lspContext = await lspManager.analyzeFile(filePath)

        if (lspContext.diagnostics.length > 0) {
          const errors = lspContext.diagnostics.filter((d) => d.severity === 1)
          const warnings = lspContext.diagnostics.filter((d) => d.severity === 2)

          if (errors.length > 0) {
            advancedUI.logInfo(`LSP analysis: ${errors.length} errors in ${filePath}`)
          }

          if (warnings.length > 0) {
            advancedUI.logInfo(`LSP analysis: ${warnings.length} warnings in ${filePath}`)
          }
        }
      }

      // Context Analysis & Memory Update
      const interactionContext = imageAnalysis
        ? `Reading image file: ${filePath} - ${imageAnalysis.description || 'Image analysis performed'}`
        : `Reading file: ${filePath}`

      const interactionDescription = imageAnalysis
        ? `File read operation with image analysis`
        : `File read operation with LSP analysis`

      this.contextSystem.recordInteraction(interactionContext, interactionDescription, [
        {
          type: 'read_file',
          target: filePath,
          params: {
            contentLength: content.length,
            isImage: this.isImageFile(filePath),
            hasImageAnalysis: !!imageAnalysis,
            hasLSPAnalysis: !!lspContext,
          },
          result: 'success',
          duration: 0,
        },
      ])

      // Update workspace context
      await this.contextSystem.analyzeFile(filePath)
    } catch (error: any) {
      advancedUI.logWarning(`LSP/Context analysis failed for ${filePath}: ${error.message}`)
    }
  }

  private estimateTokensFromLength(charCount: number): number {
    return Math.ceil(charCount / TOKEN_CHAR_RATIO)
  }

  private async readChunkWithBudget(
    sanitizedPath: string,
    _encoding: BufferEncoding,
    options: {
      startLine: number
      maxLinesPerChunk: number
      tokenBudget: number
    }
  ): Promise<{
    content: string
    startLine: number
    endLine: number
    nextStartLine: number | null
    truncated: boolean
    estimatedTokens: number
  }> {
    // Use Bun's native file reading with line splitting
    const file = bunFile(sanitizedPath)
    const content = await file.text()

    const lines = content.split('\n')
    const resultLines: string[] = []
    let charCount = 0
    let truncated = false
    const maxLines = Math.max(1, Math.min(options.maxLinesPerChunk, MAX_LINES_PER_CHUNK))
    const tokenBudget = Math.max(1000, Math.min(options.tokenBudget, DEFAULT_TOKEN_BUDGET))

    // Process lines starting from the requested line
    for (let i = options.startLine - 1; i < lines.length; i++) {
      const line = lines[i]
      const currentLineNum = i + 1

      if (currentLineNum < options.startLine) {
        continue
      }

      const projectedCharCount = charCount + line.length + 1 // include newline
      const projectedTokens = this.estimateTokensFromLength(projectedCharCount)

      if (resultLines.length >= maxLines || projectedTokens > tokenBudget) {
        truncated = true
        break
      }

      resultLines.push(line)
      charCount = projectedCharCount
    }

    const resultContent = resultLines.join('\n')
    const endLine = resultLines.length > 0 ? options.startLine + resultLines.length - 1 : Math.max(options.startLine, 1)
    const nextStartLine = truncated ? endLine + 1 : null

    return {
      content: resultContent,
      startLine: options.startLine,
      endLine,
      nextStartLine,
      truncated,
      estimatedTokens: this.estimateTokensFromLength(charCount),
    }
  }
}

// Re-export FileInfo from centralized schemas for backwards compatibility
export type { FileInfo } from '../schemas/tool-schemas'
