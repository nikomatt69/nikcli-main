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

  // Bracketed Paste Mode markers
  private static readonly PASTE_START = '\x1b[200~'
  private static readonly PASTE_END = '\x1b[201~'
  private static readonly MAX_MARKER_LENGTH = 7 // Length of \x1b[200~ or \x1b[201~
  private static readonly PASTE_TIMEOUT_MS = 5000 // 5 seconds timeout

  // State for bracketed paste detection
  private isPasteMode: boolean = false
  private rawPasteBuffer: string = ''
  private partialMarkerBuffer: string = '' // Buffer for split markers across chunks
  private pasteStartTime: number = 0

  constructor(config?: Partial<PasteDetectionConfig>) {
    this.config = {
      minLengthThreshold: 500,
      minLineThreshold: 10,
      rapidInputThreshold: 500,
      maxDisplayLines: 1,
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
    const _timeDiff = currentTime - this.lastInputTime
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
    const displayText = this.createDisplayText('', pasteId)

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
   * Create Claude Code-style display text (SOLO indicatore collassato, nessuna preview)
   */
  private createDisplayText(_text: string, pasteId: number): string {
    const lineCount = this.countLines(_text)

    // Solo indicatore collassato come Claude Code
    if (lineCount > 1) {
      return chalk.magentaBright(`[Pasted text #${pasteId}]`)
    } else {
      return chalk.magentaBright(`[Pasted text #${pasteId}]`)
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
  getStats(): {
    totalPastes: number
    storedContent: number
    oldestTimestamp?: Date
  } {
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

  /**
   * Process raw stdin data to detect bracketed paste markers
   * Handles edge cases: split markers, timeouts, escape sequences in content
   */
  processRawData(data: string): {
    isPasteComplete: boolean
    pastedContent: string | null
    passthrough: string | null
  } {
    // Prepend any partial marker from previous chunk
    let input = this.partialMarkerBuffer + data
    this.partialMarkerBuffer = ''

    // Check for paste timeout
    if (this.isPasteMode && this.pasteStartTime > 0) {
      if (Date.now() - this.pasteStartTime > PasteHandler.PASTE_TIMEOUT_MS) {
        // Paste timeout - treat buffer as complete content
        const content = this.rawPasteBuffer + input
        this.cancelPaste()
        return {
          isPasteComplete: true,
          pastedContent: content,
          passthrough: null,
        }
      }
    }

    // Check if input ends with partial escape sequence that could be a marker
    // Pattern matches: \x1b, \x1b[, \x1b[2, \x1b[20, \x1b[200, \x1b[201
    const partialMatch = input.match(/\x1b(?:\[(?:2(?:0(?:[01])?)?)?)?$/)
    if (partialMatch) {
      this.partialMarkerBuffer = partialMatch[0]
      input = input.slice(0, -partialMatch[0].length)
      // If input is empty after removing partial, wait for next chunk
      if (!input) {
        return {
          isPasteComplete: false,
          pastedContent: null,
          passthrough: null,
        }
      }
    }

    // Look for markers
    const startIdx = input.indexOf(PasteHandler.PASTE_START)
    const endIdx = input.indexOf(PasteHandler.PASTE_END)

    // CASE 1: Not in paste mode, no start marker found
    if (!this.isPasteMode && startIdx === -1) {
      return {
        isPasteComplete: false,
        pastedContent: null,
        passthrough: input,
      }
    }

    // CASE 2: Not in paste mode, found start marker
    if (!this.isPasteMode && startIdx !== -1) {
      const beforePaste = input.substring(0, startIdx)
      const afterStart = input.substring(startIdx + PasteHandler.PASTE_START.length)

      // Check if end marker is also in this chunk (complete paste in one chunk)
      const endInAfter = afterStart.indexOf(PasteHandler.PASTE_END)

      if (endInAfter !== -1) {
        // Complete paste in single chunk
        const pasteContent = afterStart.substring(0, endInAfter)
        const afterEnd = afterStart.substring(endInAfter + PasteHandler.PASTE_END.length)

        // Sanitize content before returning
        const sanitized = this.sanitizeContent(pasteContent)

        return {
          isPasteComplete: true,
          pastedContent: sanitized,
          passthrough: (beforePaste || '') + (afterEnd || '') || null,
        }
      }

      // Start marker found but no end - begin accumulation
      this.isPasteMode = true
      this.pasteStartTime = Date.now()
      this.rawPasteBuffer = afterStart

      return {
        isPasteComplete: false,
        pastedContent: null,
        passthrough: beforePaste || null,
      }
    }

    // CASE 3: In paste mode, look for end marker
    if (this.isPasteMode) {
      if (endIdx !== -1) {
        // Found end marker - complete paste
        this.rawPasteBuffer += input.substring(0, endIdx)
        const afterEnd = input.substring(endIdx + PasteHandler.PASTE_END.length)

        const content = this.rawPasteBuffer
        this.isPasteMode = false
        this.rawPasteBuffer = ''
        this.pasteStartTime = 0

        // Sanitize content before returning
        const sanitized = this.sanitizeContent(content)

        return {
          isPasteComplete: true,
          pastedContent: sanitized,
          passthrough: afterEnd || null,
        }
      }

      // No end marker - continue accumulation
      this.rawPasteBuffer += input
      return { isPasteComplete: false, pastedContent: null, passthrough: null }
    }

    // Default: pass through
    return { isPasteComplete: false, pastedContent: null, passthrough: input }
  }

  /**
   * Sanitize pasted content by removing ANSI escape sequences
   * Preserves actual text content while removing terminal formatting
   */
  private sanitizeContent(content: string): string {
    return (
      content
        // Remove standard ANSI escape codes (colors, formatting)
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        // Remove OSC sequences (Operating System Command)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // Remove DCS, PM, APC sequences
        .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
        // Remove single-character escape sequences
        .replace(/\x1b[NOc]/g, '')
        // Remove any remaining bare escape characters (safety net)
        .replace(/\x1b(?!\[)/g, '')
    )
  }

  /**
   * Check if currently in paste mode (accumulating bracketed paste content)
   */
  isPasting(): boolean {
    return this.isPasteMode
  }

  /**
   * Cancel ongoing paste operation and clear all buffers
   */
  cancelPaste(): void {
    this.isPasteMode = false
    this.rawPasteBuffer = ''
    this.partialMarkerBuffer = ''
    this.pasteStartTime = 0
  }

  /**
   * Get current paste buffer size (for debugging/monitoring)
   */
  getPasteBufferSize(): number {
    return this.rawPasteBuffer.length
  }
}
