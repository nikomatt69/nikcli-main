import { readFile } from 'node:fs/promises'
import chalk from 'chalk'
import { z } from 'zod'
import { ContextAwareRAGSystem } from '../context/context-aware-rag'
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

      if (validatedOptions.maxLines && typeof processedContent === 'string') {
        const lines = processedContent.split('\n')
        if (lines.length > validatedOptions.maxLines) {
          processedContent =
            lines.slice(0, validatedOptions.maxLines).join('\n') +
            `\n... (truncated ${lines.length - validatedOptions.maxLines} lines)`
        }
      }

      const result: ReadFileResult = {
        success: true,
        filePath: sanitizedPath,
        content: processedContent,
        size: Buffer.byteLength(content, encoding as BufferEncoding),
        encoding,
        metadata: {
          lines: typeof processedContent === 'string' ? processedContent.split('\n').length : undefined,
          isEmpty: content.length === 0,
          isBinary: encoding !== 'utf8' && encoding !== 'utf-8',
          extension: this.getFileExtension(filePath),
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
      case '.xml':
        // Remove HTML/XML comments with complete sanitization
        let previousContent
        do {
          previousContent = content
          content = content.replace(/<!--[\s\S]*?-->/g, '')
        } while (content !== previousContent)
        break
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
        console.log(chalk.yellow('⚠️ Vision provider not available for image analysis'))
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
      console.log(chalk.yellow(`⚠️ Image analysis failed: ${error.message}`))
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
            CliUI.logInfo(`LSP analysis: ${errors.length} errors in ${filePath}`)
          }

          if (warnings.length > 0) {
            CliUI.logInfo(`LSP analysis: ${warnings.length} warnings in ${filePath}`)
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
      CliUI.logWarning(`LSP/Context analysis failed for ${filePath}: ${error.message}`)
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
