import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import { z } from 'zod'
import { ContextAwareRAGSystem } from '../context/context-aware-rag'
import { contextTokenManager } from '../core/context-token-manager'
import { lspManager } from '../lsp/lsp-manager'
import {
  type ReadFileOptions,
  ReadFileOptionsSchema,
  type ReadFileResult,
  ReadFileResultSchema,
} from '../schemas/tool-schemas'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { sanitizePath } from './secure-file-tools'

/**
 * Production-ready Read File Tool
 * Safely reads file contents with security checks and error handling
 */
export class ReadFileTool extends BaseTool {
  private contextSystem: ContextAwareRAGSystem
  private readonly AUTO_CHUNK_LINE_THRESHOLD = 800
  private readonly MAX_LINES_PER_CHUNK = 1200
  private readonly MIN_SAFE_TOKENS = 512
  private readonly MAX_SAFE_TOKENS = 20000
  private readonly DEFAULT_SAFE_TOKEN_BUDGET = 12000

  constructor(workingDirectory: string) {
    super('read-file-tool', workingDirectory)
    this.contextSystem = new ContextAwareRAGSystem(workingDirectory)
  }

  async execute(filePath: string, options: ReadFileOptions = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const result = await this.executeInternal(filePath, options)

      return {
        success: result.success,
        data: result,
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
        const stats = await import('node:fs/promises').then((fs) => fs.stat(sanitizedPath))
        if (stats.size > validatedOptions.maxSize) {
          throw new Error(`File too large: ${stats.size} bytes (max: ${validatedOptions.maxSize})`)
        }
      }

      // Read file with specified encoding
      const encoding = validatedOptions.encoding || 'utf8'
      const content = await readFile(sanitizedPath, encoding as BufferEncoding)

      // Check if this is an image file and perform vision analysis
      const imageAnalysis = await this.performImageAnalysis(sanitizedPath)

      // LSP + Context Analysis
      await this.performLSPContextAnalysis(sanitizedPath, content, imageAnalysis)

      // Apply content filters if specified
      let processedContent = content
      if (validatedOptions.stripComments && this.isCodeFile(filePath)) {
        processedContent = this.stripComments(processedContent, this.getFileExtension(filePath))
      }

      let chunkMetadata: Partial<ReadFileResult['metadata']> = {}
      let truncated = false

      if (typeof processedContent === 'string') {
        const chunkingResult = this.applyChunking(processedContent, validatedOptions)
        processedContent = chunkingResult.content
        chunkMetadata = chunkingResult.metadata
        truncated = chunkingResult.truncated
      }

      const chunkLineCount =
        typeof processedContent === 'string' &&
        typeof chunkMetadata.startLine === 'number' &&
        typeof chunkMetadata.endLine === 'number'
          ? Math.max(0, chunkMetadata.endLine - chunkMetadata.startLine + 1)
          : typeof processedContent === 'string'
            ? processedContent.split('\n').length
            : undefined

      const result: ReadFileResult = {
        success: true,
        filePath: sanitizedPath,
        content: processedContent,
        size: Buffer.byteLength(content, encoding as BufferEncoding),
        encoding,
        truncated,
        metadata: {
          lines: chunkLineCount,
          isEmpty: content.length === 0,
          isBinary: encoding !== 'utf8' && encoding !== 'utf-8',
          extension: this.getFileExtension(filePath),
          ...chunkMetadata,
        },
      }

      // Zod validation for result
      const validatedResult = ReadFileResultSchema.parse(result)

      if (chunkMetadata.chunked) {
        const start = chunkMetadata.startLine ?? 1
        const end = chunkMetadata.endLine ?? chunkLineCount ?? 0
        const total = chunkMetadata.totalLines ?? chunkLineCount ?? 0
        const moreSuffix = chunkMetadata.hasMore ? ` (next start line: ${chunkMetadata.nextStartLine})` : ''
        advancedUI.logInfo(`Chunked read ${filePath}: lines ${start}-${end} of ${total}${moreSuffix}`)
      }

      // Show file content in structured UI if not binary and not too large
      if (
        !validatedResult.metadata?.isBinary &&
        typeof processedContent === 'string' &&
        processedContent.length < 50000
      ) {
        advancedUI.showFileContent(sanitizedPath, processedContent)
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
   * Read file with streaming for large files
   */
  async readStream(filePath: string, chunkSize: number = 1024 * 64): Promise<AsyncIterable<string>> {
    const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
    const fs = await import('node:fs')
    const stream = fs.createReadStream(sanitizedPath, {
      encoding: 'utf8',
      highWaterMark: chunkSize,
    })

    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of stream) {
          yield chunk
        }
      },
    }
  }

  /**
   * Check if file exists and is readable
   */
  async canRead(filePath: string): Promise<boolean> {
    try {
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
      const fs = await import('node:fs/promises')
      await fs.access(sanitizedPath, fs.constants.R_OK)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get file information without reading content
   */
  async getFileInfo(filePath: string): Promise<FileInfo> {
    try {
      const sanitizedPath = sanitizePath(filePath, this.workingDirectory)
      const fs = await import('node:fs/promises')
      const stats = await fs.stat(sanitizedPath)

      return {
        path: sanitizedPath,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime,
        extension: this.getFileExtension(filePath),
        isReadable: await this.canRead(filePath),
      }
    } catch (error: any) {
      throw new Error(`Failed to get file info: ${error.message}`)
    }
  }

  private applyChunking(
    content: string,
    options: ReadFileOptions
  ): { content: string; metadata: Partial<ReadFileResult['metadata']>; truncated: boolean } {
    const lines = content.split('\n')
    const totalApproxTokens = this.estimateTokens(content)
    const tokenBudget = this.getSafeTokenBudget(options.maxTokens)

    const startLine = options.startLine && options.startLine > 0 ? options.startLine : 1
    const explicitRange = typeof options.maxLines === 'number' || typeof options.startLine === 'number'
    const autoChunkNeeded =
      !options.disableChunking &&
      (totalApproxTokens > tokenBudget || lines.length > this.AUTO_CHUNK_LINE_THRESHOLD)

    if (!explicitRange && !autoChunkNeeded) {
      return {
        content,
        metadata: {
          totalLines: lines.length,
          totalApproxTokens,
        },
        truncated: false,
      }
    }

    const lineLimit =
      options.maxLines && options.maxLines > 0
        ? Math.min(options.maxLines, this.MAX_LINES_PER_CHUNK)
        : this.estimateLinesForBudget(lines, tokenBudget)

    const chunk = this.sliceLines(lines, startLine, lineLimit, tokenBudget)
    const reason = explicitRange ? 'manual_range' : 'auto_chunk'
    const contentWithNote =
      chunk.content +
      (chunk.hasMore
        ? `\n... (truncated, continue from line ${chunk.nextStartLine ?? chunk.endLine + 1})`
        : '')

    return {
      content: contentWithNote,
      metadata: {
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        nextStartLine: chunk.nextStartLine,
        remainingLines: chunk.remainingLines,
        approxTokens: chunk.chunkTokens,
        totalApproxTokens,
        totalLines: lines.length,
        chunkReason: reason,
        chunked: true,
        truncated: chunk.hasMore,
        hasMore: chunk.hasMore,
      },
      truncated: chunk.hasMore,
    }
  }

  private sliceLines(
    lines: string[],
    startLine: number,
    maxLines: number,
    tokenBudget: number
  ): {
    content: string
    startLine: number
    endLine: number
    nextStartLine: number | null
    remainingLines: number
    chunkTokens: number
    hasMore: boolean
  } {
    const startIndex = Math.max(startLine - 1, 0)

    if (startIndex >= lines.length) {
      return {
        content: `Requested start line ${startLine} is beyond total lines (${lines.length}).`,
        startLine,
        endLine: startLine - 1,
        nextStartLine: null,
        remainingLines: 0,
        chunkTokens: 0,
        hasMore: false,
      }
    }

    let tokensUsed = 0
    const selected: string[] = []
    let i = startIndex

    for (; i < lines.length; i++) {
      const lineTokens = this.estimateTokens(lines[i] || ' ')
      const overLineLimit = selected.length >= maxLines
      const overTokenLimit = tokensUsed + lineTokens > tokenBudget

      if (overLineLimit || overTokenLimit) {
        break
      }

      selected.push(lines[i])
      tokensUsed += lineTokens
    }

    const endIndex = startIndex + selected.length
    const hasMore = endIndex < lines.length
    const nextStartLine = hasMore ? endIndex + 1 : null

    return {
      content: selected.join('\n'),
      startLine,
      endLine: endIndex,
      nextStartLine,
      remainingLines: hasMore ? lines.length - endIndex : 0,
      chunkTokens: tokensUsed,
      hasMore,
    }
  }

  private estimateLinesForBudget(lines: string[], tokenBudget: number): number {
    const sample = lines.slice(0, Math.min(lines.length, 400))
    const averageTokensPerLine =
      sample.length > 0
        ? sample.reduce((sum, line) => sum + this.estimateTokens(line || ' '), 0) / sample.length
        : 8

    const estimated = Math.floor(tokenBudget / Math.max(averageTokensPerLine, 1))
    return Math.max(50, Math.min(this.MAX_LINES_PER_CHUNK, estimated))
  }

  private getSafeTokenBudget(requestedMaxTokens?: number): number {
    if (requestedMaxTokens && requestedMaxTokens > 0) {
      return Math.min(this.MAX_SAFE_TOKENS, Math.max(this.MIN_SAFE_TOKENS, requestedMaxTokens))
    }

    const stats = contextTokenManager.getSessionStats()
    if (!stats || !stats.session) return this.DEFAULT_SAFE_TOKEN_BUDGET

    const reserveForResponse = Math.max(2000, Math.floor(stats.session.modelLimits.output * 1.5))
    const remainingAfterReserve = Math.max(stats.remainingContext - reserveForResponse, 0)
    if (remainingAfterReserve === 0) {
      return 0
    }

    const derived = Math.floor(remainingAfterReserve * 0.6)
    const fallback = Math.min(remainingAfterReserve, this.DEFAULT_SAFE_TOKEN_BUDGET)
    const rawBudget = derived > 0 ? derived : fallback
    const upperBounded = Math.min(this.MAX_SAFE_TOKENS, rawBudget)
    const lowerBound = Math.min(this.MIN_SAFE_TOKENS, remainingAfterReserve)

    return Math.max(lowerBound, upperBounded)
  }

  private estimateTokens(text: string): number {
    if (!text) return 0
    return Math.max(1, Math.ceil(text.length / 4))
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
        let previousContent
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
      if (analysis && analysis.description) {
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
      let lspContext = null
      if (this.isCodeFile(filePath)) {
        lspContext = await lspManager.analyzeFile(filePath)

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
}

export const FileInfoSchema = z.object({
  path: z.string(),
  size: z.number().int().min(0),
  isFile: z.boolean(),
  isDirectory: z.boolean(),
  created: z.date(),
  modified: z.date(),
  accessed: z.date(),
  extension: z.string(),
  isReadable: z.boolean(),
})

export type FileInfo = z.infer<typeof FileInfoSchema>
