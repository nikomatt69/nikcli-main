import chalk from 'chalk'

export interface PasteDetectionConfig {
  minLengthThreshold: number
  minLineThreshold: number
  rapidInputThreshold: number
  maxDisplayLines: number
}

export interface PastedContent {
  id: number
  originalText: string
  displayText: string
  lineCount: number
  timestamp: Date
}

export class PasteHandler {
  private static instance: PasteHandler
  private pasteCounter: number = 0
  private pastedContentMap: Map<number, PastedContent> = new Map()
  private lastInputTime: number = 0
  private config: PasteDetectionConfig

  constructor(config?: Partial<PasteDetectionConfig>) {
    this.config = {
      minLengthThreshold: 500,
      minLineThreshold: 10,
      rapidInputThreshold: 100,
      maxDisplayLines: 3,
      ...config,
    }
  }

  static getInstance(config?: Partial<PasteDetectionConfig>): PasteHandler {
    if (!PasteHandler.instance) {
      PasteHandler.instance = new PasteHandler(config)
    }
    return PasteHandler.instance
  }

  /**
   * Detect if input appears to be pasted content
   */
  detectPasteOperation(input: string): boolean {
    const currentTime = Date.now()
    const timeDiff = currentTime - this.lastInputTime
    this.lastInputTime = currentTime

    const lineCount = this.countLines(input)
    const length = input.length

    // Performance optimization: For very large content, do quick check first
    if (length > 50000) {
      return true // Very large content is definitely a paste
    }

    // Check for paste indicators:
    // 1. Very long input
    // 2. Many lines
    // 3. Rapid input (though this is harder to detect in readline)
    // 4. Contains typical paste patterns (code blocks, formatted text, etc.)

    // More conservative detection - require either:
    // 1. Large content (length OR many lines)
    // 2. Structured patterns AND minimum complexity (length > 100 OR multiple lines)
    // 3. Command sequences (multiple commands)

    const isLargeContent = length >= this.config.minLengthThreshold || lineCount >= this.config.minLineThreshold
    const hasPatterns = this.hasCodeBlockPattern(input) || this.hasStructuredTextPattern(input)
    const hasCommandSequence = this.hasCommandSequencePattern(input)
    const hasMinimumComplexity = length > 100 || lineCount > 1

    const isPotentialPaste = isLargeContent || (hasPatterns && hasMinimumComplexity) || hasCommandSequence

    return isPotentialPaste
  }

  /**
   * Process potentially pasted text and return display version
   */
  processPastedText(input: string): {
    shouldTruncate: boolean
    displayText: string
    originalText: string
    pasteId?: number
  } {
    if (!this.detectPasteOperation(input)) {
      return {
        shouldTruncate: false,
        displayText: input,
        originalText: input,
      }
    }

    const pasteId = this.storePastedContent(input)
    const displayText = this.createDisplayText(input, pasteId)

    return {
      shouldTruncate: true,
      displayText,
      originalText: input,
      pasteId,
    }
  }

  /**
   * Store pasted content and return unique ID
   */
  private storePastedContent(text: string): number {
    this.pasteCounter++
    const lineCount = this.countLines(text)

    const content: PastedContent = {
      id: this.pasteCounter,
      originalText: text,
      displayText: this.createDisplayText(text, this.pasteCounter),
      lineCount,
      timestamp: new Date(),
    }

    this.pastedContentMap.set(this.pasteCounter, content)

    // Cleanup old entries (keep last 10)
    if (this.pastedContentMap.size > 10) {
      const oldestKey = Math.min(...this.pastedContentMap.keys())
      this.pastedContentMap.delete(oldestKey)
    }

    return this.pasteCounter
  }

  /**
   * Create Claude Code-style display text
   */
  private createDisplayText(text: string, pasteId: number): string {
    const lineCount = this.countLines(text)
    const lines = text.split('\n')

    // Show first few lines for context
    const previewLines = lines.slice(0, this.config.maxDisplayLines)
    let preview = previewLines.join('\n')

    // Truncate very long lines in preview
    const maxLineLength = 100
    preview = preview
      .split('\n')
      .map((line) => (line.length > maxLineLength ? line.substring(0, maxLineLength) + '...' : line))
      .join('\n')

    if (lineCount > this.config.maxDisplayLines) {
      const additionalLines = lineCount - this.config.maxDisplayLines
      const truncationIndicator = chalk.gray(`[Pasted text #${pasteId} +${additionalLines} lines]`)
      return `${preview}\n${truncationIndicator}`
    } else {
      // For shorter content, still show the indicator but with different format
      const indicator = chalk.gray(`[Pasted text #${pasteId}]`)
      return `${preview}\n${indicator}`
    }
  }

  /**
   * Retrieve original content by paste ID
   */
  getOriginalContent(pasteId: number): string | null {
    const content = this.pastedContentMap.get(pasteId)
    return content ? content.originalText : null
  }

  /**
   * Get display text by paste ID
   */
  getDisplayContent(pasteId: number): string | null {
    const content = this.pastedContentMap.get(pasteId)
    return content ? content.displayText : null
  }

  /**
   * Extract paste ID from display text
   */
  extractPasteId(displayText: string): number | null {
    const match = displayText.match(/\[Pasted text #(\d+)/)
    return match ? parseInt(match[1], 10) : null
  }

  /**
   * Check if text contains code block patterns
   */
  private hasCodeBlockPattern(text: string): boolean {
    const codePatterns = [
      /```[\s\S]*```/, // Markdown code blocks
      /^\s*{[\s\S]*}$/m, // JSON objects
      /^\s*function\s+\w+/m, // Function definitions
      /^\s*class\s+\w+/m, // Class definitions
      /^\s*import\s+/m, // Import statements
      /^\s*const\s+\w+\s*=/m, // Const declarations
      /^\s*<\w+[\s\S]*>/m, // HTML/XML tags
      /^\s*\.[\w-]+\s*{/m, // CSS selectors (.class, #id)
      /^\s*[\w-]+\s*:\s*[\w-]+/m, // CSS properties
      /^\s*SELECT\s+/im, // SQL SELECT statements
      /^\s*INSERT\s+INTO\s+/im, // SQL INSERT statements
      /^\s*UPDATE\s+/im, // SQL UPDATE statements
      /^\s*DELETE\s+FROM\s+/im, // SQL DELETE statements
      /^\s*CREATE\s+TABLE\s+/im, // SQL CREATE statements
      /^\s*#!/, // Shebang lines (bash, python, etc.)
      /^\s*\w+:\s*$/m, // YAML-like keys (config files)
      /^\s*\w+\s*=\s*/m, // Assignment patterns (config files)
    ]

    return codePatterns.some((pattern) => pattern.test(text))
  }

  /**
   * Check if text has structured patterns typical of pasted content
   */
  private hasStructuredTextPattern(text: string): boolean {
    const structuredPatterns = [
      /^\d+\.\s+/m, // Numbered lists
      /^-\s+/m, // Bullet points
      /^\*\s+/m, // Asterisk bullets
      /^#{1,6}\s+/m, // Markdown headers
      /^\|\s*.*\s*\|/m, // Table rows
      /^---+$/m, // Horizontal rules
    ]

    return structuredPatterns.some((pattern) => pattern.test(text))
  }

  /**
   * Check if text contains command sequence patterns
   */
  private hasCommandSequencePattern(text: string): boolean {
    const lines = text.split('\n').filter((line) => line.trim())

    if (lines.length < 3) return false // Need at least 3 commands

    const commandPatterns = [
      /^\s*npm\s+/, // npm commands
      /^\s*yarn\s+/, // yarn commands
      /^\s*git\s+/, // git commands
      /^\s*cd\s+/, // cd commands
      /^\s*mkdir\s+/, // mkdir commands
      /^\s*cp\s+/, // cp commands
      /^\s*mv\s+/, // mv commands
      /^\s*rm\s+/, // rm commands
      /^\s*ls\s*/, // ls commands
      /^\s*cat\s+/, // cat commands
      /^\s*echo\s+/, // echo commands
      /^\s*curl\s+/, // curl commands
      /^\s*wget\s+/, // wget commands
      /^\s*node\s+/, // node commands
      /^\s*python\s+/, // python commands
      /^\s*pip\s+/, // pip commands
      /^\s*docker\s+/, // docker commands
    ]

    // Check if at least 50% of lines look like commands
    const commandCount = lines.filter((line) => commandPatterns.some((pattern) => pattern.test(line))).length

    return commandCount >= Math.ceil(lines.length * 0.5)
  }

  /**
   * Count lines in text
   */
  private countLines(text: string): number {
    return text.split('\n').length
  }

  /**
   * Get statistics about stored paste content
   */
  getStats(): { totalPastes: number; storedContent: number; oldestTimestamp?: Date } {
    const entries = Array.from(this.pastedContentMap.values())
    return {
      totalPastes: this.pasteCounter,
      storedContent: this.pastedContentMap.size,
      oldestTimestamp:
        entries.length > 0 ? new Date(Math.min(...entries.map((e) => e.timestamp.getTime()))) : undefined,
    }
  }

  /**
   * Clear all stored paste content
   */
  clearStoredContent(): void {
    this.pastedContentMap.clear()
  }
}
