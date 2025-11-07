import chalk from 'chalk'
import {
  applySyntaxHighlight,
  colorizeBlock,
  syntaxColors,
  StreamEvent,
  StreamProtocol,
  type EnhancedFeaturesConfig,
  type MermaidTTYConfig,
  type MathRenderConfig,
  type SecurityConfig
} from '@nicomatt69/streamtty'
import { terminalOutputManager, TerminalOutputManager } from '../ui/terminal-output-manager'

export type ChunkType = 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'

export interface StreamttyServiceOptions {
  parseIncompleteMarkdown?: boolean
  syntaxHighlight?: boolean
  autoScroll?: boolean
  maxWidth?: number
  gfm?: boolean
  useBlessedMode?: boolean
  stripEmoji?: boolean // Remove emoji from output

  // Enhanced features (visual-only, no interactive controls)
  enhancedFeatures?: EnhancedFeaturesConfig
  theme?: 'light' | 'dark' | 'auto'
  mermaidConfig?: MermaidTTYConfig
  mathConfig?: MathRenderConfig
  security?: SecurityConfig
  shikiLanguages?: string[]
  diagramBorderStyle?: 'simple' | 'rounded' | 'double'
}

export interface RenderStats {
  totalChunks: number
  totalBlocks: number
  aiChunks: number
  toolChunks: number
  errorChunks: number
  fallbackUsed: boolean
  lastRenderTime: number
  aiSdkEvents: number
  toolCallEvents: number
  toolResultEvents: number
}

/**
 * Centralized StreamttyService that manages all terminal rendering through streamtty
 * Routes all AI chunks, UI messages, and system output through streamtty for consistent formatting
 */
export class StreamttyService {
  private isInitialized = false
  private static enhancedTableRenderer: any = null
  private static mermaidRenderer: any = null
  // Debug flag for noisy table conversion logs
  private static readonly DEBUG_TABLES =
    process.env.NIKCLI_DEBUG_TABLES === '1' || process.env.STREAMTTY_DEBUG === '1'
  // Streaming table state (to handle chunked arrivals)
  private streamingBuffer = ''
  private streamingInFence = false
  private streamingAsciiBlock: string[] | null = null
  private streamingPendingHeader: string | null = null
  private streamingPendingSeparator: string | null = null
  private streamingTableLines: string[] | null = null
  // Mermaid streaming state
  private streamingMermaidActive = false
  private streamingMermaidLines: string[] | null = null
  private stats: RenderStats = {
    totalChunks: 0,
    totalBlocks: 0,
    aiChunks: 0,
    toolChunks: 0,
    errorChunks: 0,
    fallbackUsed: false,
    lastRenderTime: 0,
    aiSdkEvents: 0,
    toolCallEvents: 0,
    toolResultEvents: 0,
  }

  private updateStats(chunkType: ChunkType): void {
    this.stats.totalChunks++
    this.stats.lastRenderTime = Date.now()

    switch (chunkType) {
      case 'ai':
        this.stats.aiChunks++
        break
      case 'tool':
        this.stats.toolChunks++
        break
      case 'error':
        this.stats.errorChunks++
        break
    }
  }

  private updateAISDKStats(eventType: string): void {
    this.stats.aiSdkEvents++
    this.stats.lastRenderTime = Date.now()

    if (eventType === 'tool_call') {
      this.stats.toolCallEvents++
    } else if (eventType === 'tool_result') {
      this.stats.toolResultEvents++
    }
  }
  private streamBuffer = ''

  constructor(private options: StreamttyServiceOptions = {}) {
    // Check environment variable for emoji preference
    if (process.env.DISABLE_EMOJI === 'true' || process.env.NO_EMOJI === 'true') {
      this.options.stripEmoji = true
    }
    // Optional diagram border style via env
    const envBorder = (process.env.NIKCLI_DIAGRAM_BORDER || process.env.DIAGRAM_BORDER || '').toLowerCase()
    if (envBorder === 'rounded' || envBorder === 'double' || envBorder === 'simple') {
      this.options.diagramBorderStyle = envBorder as any
    }
    this.initialize()
  }

  // Debug helper to avoid polluting output unless explicitly enabled
  private debugTable(...args: any[]): void {
    if (StreamttyService.DEBUG_TABLES) {
      try {
        // Use stderr so it doesn't mix with content when not captured
        // Still entirely disabled by default
        console.error(...args)
      } catch {
        // no-op
      }
    }
  }

  private initialize(): void {
    try {
      // Always use inline mode with enhanced features - no blessed mode
      this.isInitialized = true
      this.stats.fallbackUsed = false // Enhanced inline mode is not fallback
    } catch (error) {
      console.warn('Failed to initialize enhanced inline mode:', error)
      this.isInitialized = true
      this.stats.fallbackUsed = true
    }
  }

  // Border helpers for framing diagrams consistently with tables
  private getDiagramBorderChars(style: 'simple' | 'rounded' | 'double') {
    switch (style) {
      case 'double':
        return { tl: '╔', tm: '╦', tr: '╗', bl: '╚', bm: '╩', br: '╝', h: '═', v: '║' }
      case 'rounded':
        return { tl: '╭', tm: '┬', tr: '╮', bl: '╰', bm: '┴', br: '╯', h: '─', v: '│' }
      case 'simple':
      default:
        return { tl: '┌', tm: '┬', tr: '┐', bl: '└', bm: '┴', br: '┘', h: '─', v: '│' }
    }
  }

  private frameDiagram(ascii: string): string {
    const style = this.options.diagramBorderStyle || 'simple'
    const chars = this.getDiagramBorderChars(style)
    const lines = ascii.replace(/\s+$/g, '').split('\n')
    const first = (lines[0] || '').trim()
    const last = (lines[lines.length - 1] || '').trim()
    const alreadyFramed = (/^[┌╔╭].*[┐╗╮]$/.test(first) && /^[└╚╰].*[┘╝╯]$/.test(last))
    if (alreadyFramed) return ascii
    const padX = 1
    const stripAnsi = (s: string) => s.replace(/\x1b\[[\d;]*m/g, '')
    const innerWidth = Math.max(...lines.map(l => stripAnsi(l).length), 1)
    const top = chars.tl + chars.h.repeat(innerWidth + 2 * padX) + chars.tr
    const bottom = chars.bl + chars.h.repeat(innerWidth + 2 * padX) + chars.br
    const framed = [top,
      ...lines.map(l => {
        const pad = Math.max(0, innerWidth - stripAnsi(l).length)
        return chars.v + ' '.repeat(padX) + l + ' '.repeat(pad) + ' '.repeat(padX) + chars.v
      }),
      bottom].join('\n')
    return framed
  }

  /**
   * Streaming-aware processing for table content. Accumulates partial lines
   * and converts complete GFM tables to ASCII without corrupting output.
   */
  private async processStreamingTables(chunk: string): Promise<string> {
    // Fast path: nothing to do
    if (!chunk) return ''

    // Helper regex/predicates consistent with block converter
    const BOX_CHARS = /[┌┐└┘─│┬┴├┤┼╭╮╰╯╔╗╚╝═║╦╩╠╣╬]/
    const isFence = (line: string) => /^```/.test(line.trim())
    const isMermaidStart = (line: string) => /^```\s*mermaid\b/i.test(line.trim())
    const isLooseMermaidStart = (line: string) => /^(graph\s+(TD|LR|BT|RL)\b|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|gantt\b|journey\b|pie\b)/i.test(line.trim())
    const isSeparator = (line: string) => /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.includes('|')
    const hasPipes = (line: string) => line.includes('|')
    const isAsciiBorderLine = (line: string) => BOX_CHARS.test(line)
    const isHeaderCandidate = (line: string) => hasPipes(line) && !isSeparator(line)
    const normalizeLine = (line: string) => {
      const t = line.trim()
      let s = t
      if (!s.startsWith('|')) s = '|' + s
      if (!s.endsWith('|')) s = s + '|'
      return s
    }

    const asciiMod = await import('@nicomatt69/streamtty/dist/renderers/table-ascii')
    const isMarkdownTable: (s: string) => boolean = (asciiMod as any).isMarkdownTable
    const renderMarkdownTableToASCII: (s: string, opts?: any) => string = (asciiMod as any).renderMarkdownTableToASCII
    // Mermaid converter (loaded on demand)
    let convertMermaidToASCII: ((code: string, cfg?: any) => Promise<string>) | null = null
    const ensureMermaid = async () => {
      if (!convertMermaidToASCII) {
        const mod = await import('@nicomatt69/streamtty/dist/utils/mermaid-ascii')
        convertMermaidToASCII = (mod as any).convertMermaidToASCII
      }
    }

    const flushAsciiNoiseIfAny = (output: string[]) => {
      if (this.streamingAsciiBlock && this.streamingAsciiBlock.length) {
        // Decide whether to drop or keep noise: keep by default
        // (noise is dropped only when we begin a GFM table immediately after)
        for (const line of this.streamingAsciiBlock) output.push(line)
        this.streamingAsciiBlock = null
      }
    }

    // Append new chunk to buffer
    this.streamingBuffer += chunk
    const lines = this.streamingBuffer.split('\n')
    // Keep last partial line in buffer; process full lines only
    this.streamingBuffer = lines.pop() || ''

    const out: string[] = []

    for (let idx = 0; idx < lines.length; idx++) {
      let line = lines[idx]
      const trimmed = line.trim()

      // Mermaid block start handling (stream-aware)
      if (!this.streamingInFence && isMermaidStart(line)) {
        // If mermaid feature disabled, treat as generic fence
        if (!this.options.enhancedFeatures || this.options.enhancedFeatures.mermaid !== false) {
          // Start capturing mermaid code
          this.streamingMermaidActive = true
          this.streamingMermaidLines = []
          // Do not emit the start fence line
          continue
        }
      }

      // Loose mermaid (no fences): start capturing if a directive appears
      if (!this.streamingInFence && !this.streamingMermaidActive && isLooseMermaidStart(line)) {
        if (!this.options.enhancedFeatures || this.options.enhancedFeatures.mermaid !== false) {
          this.streamingMermaidActive = true
          this.streamingMermaidLines = [line]
          // Keep capturing until blank line/fence/ASCII border
          continue
        }
      }

      // Generic fence handling
      if (isFence(line)) {
        // Flush noise if any before toggling state
        flushAsciiNoiseIfAny(out)
        // Mermaid block end?
        if (this.streamingMermaidActive) {
          try {
            await ensureMermaid()
            const code = (this.streamingMermaidLines || []).join('\n')
            const ascii = await (convertMermaidToASCII as any)(code, {
              paddingX: 3,
              paddingY: 1,
              borderPadding: 1,
            })
            out.push('')
            out.push(this.frameDiagram(ascii.trimEnd()))
            out.push('')
            this.debugTable('[DEBUG] Streaming mermaid converted')
          } catch (err) {
            // Fallback to raw code block
            out.push('```mermaid')
            for (const l of (this.streamingMermaidLines || [])) out.push(l)
            out.push('```')
            this.debugTable('[DEBUG] Streaming mermaid conversion error:', String(err))
          }
          this.streamingMermaidActive = false
          this.streamingMermaidLines = null
          // Do not emit this fence line (it was the closing fence)
          continue
        }
        // Not a mermaid fence – toggle generic fence state and pass through
        this.streamingInFence = !this.streamingInFence
        out.push(line)
        continue
      }

      if (this.streamingInFence) {
        // Inside code fence, pass through
        out.push(line)
        continue
      }

      // Accumulate mermaid lines when active
      if (this.streamingMermaidActive) {
        const lt = trimmed
        if (lt === '' || isFence(line) || isAsciiBorderLine(lt)) {
          // Terminate loose mermaid block and convert
          try {
            await ensureMermaid()
            const code = (this.streamingMermaidLines || []).join('\n')
            const ascii = await (convertMermaidToASCII as any)(code, {
              paddingX: 3,
              paddingY: 1,
              borderPadding: 1,
            })
            out.push('')
            out.push(this.frameDiagram(ascii.trimEnd()))
            out.push('')
            this.debugTable('[DEBUG] Streaming loose mermaid converted')
          } catch (err) {
            for (const l of (this.streamingMermaidLines || [])) out.push(l)
          }
          this.streamingMermaidActive = false
          this.streamingMermaidLines = null
          // Now process current line normally (do not continue)
        } else {
          (this.streamingMermaidLines as string[]).push(line)
          continue
        }
      }

      // Accumulating an ASCII border block (potential noise or real table)
      if (isAsciiBorderLine(trimmed) && !this.streamingTableLines) {
        if (!this.streamingAsciiBlock) this.streamingAsciiBlock = []
        this.streamingAsciiBlock.push(line)
        continue
      }

      // If we held ASCII noise and now hit a GFM header or separator, drop noise
      if (this.streamingAsciiBlock && this.streamingAsciiBlock.length) {
        if (isHeaderCandidate(trimmed) || isSeparator(trimmed)) {
          this.debugTable('[DEBUG] Dropping streaming ASCII noise before GFM at line', String(idx))
          this.streamingAsciiBlock = null
        } else {
          // Otherwise flush and continue
          flushAsciiNoiseIfAny(out)
        }
      }

      // If we are collecting a table rows already
      if (this.streamingTableLines) {
        if (trimmed === '' || isAsciiBorderLine(trimmed) || (!hasPipes(line) && !isSeparator(line))) {
          // End of table -> convert and emit
          const candidate = this.streamingTableLines.join('\n')
          if (isMarkdownTable(candidate)) {
            try {
              const rendered = renderMarkdownTableToASCII(this.sanitizeTableEmojis(candidate), {
                maxWidth: this.options.maxWidth || 80,
                borderStyle: 'simple',
              })
              out.push(rendered.trimEnd())
              out.push('')
              this.debugTable('[DEBUG] Streaming table converted')
            } catch (err) {
              this.debugTable('[DEBUG] Streaming table conversion error:', String(err))
              out.push(candidate)
            }
          } else {
            // Not a valid table – flush raw
            out.push(candidate)
          }
          this.streamingTableLines = null
          // Process this current line again in normal path
        } else {
          // Continue table collection
          this.streamingTableLines.push(normalizeLine(line))
          continue
        }
      }

      // Pending header waiting for separator
      if (this.streamingPendingHeader) {
        if (isSeparator(line)) {
          // Start table collection
          this.streamingTableLines = [normalizeLine(this.streamingPendingHeader), normalizeLine(line)]
          this.streamingPendingHeader = null
          continue
        } else {
          // Not a table; flush header and handle current line normally
          out.push(this.streamingPendingHeader)
          this.streamingPendingHeader = null
          // fallthrough to process current line
        }
      }

      // Separator-first case: stash separator if next line looks like header
      if (isSeparator(line)) {
        this.streamingPendingSeparator = normalizeLine(line)
        continue
      }

      if (isHeaderCandidate(trimmed)) {
        // Use pending separator if present; else wait for next line to confirm
        if (this.streamingPendingSeparator) {
          this.streamingTableLines = [normalizeLine(line), this.streamingPendingSeparator]
          this.streamingPendingSeparator = null
          continue
        }
        // Hold header until we see next line
        this.streamingPendingHeader = normalizeLine(line)
        continue
      }

      // Normal line; flush any pending ASCII noise
      flushAsciiNoiseIfAny(out)
      out.push(line)
    }

    // Return produced output for this chunk; leave remainder in streamingBuffer
    return out.join('\n') + (out.length ? '\n' : '')
  }

  /**
   * Flush any buffered streaming table state at logical boundaries (e.g., stream complete)
   */
  /**
   * Flush stdout with proper handling for pkg binaries
   * Ensures streaming output is visible immediately in compiled binaries
   */
  private async flushStdout(chunk: string): Promise<void> {
    return new Promise<void>((resolve) => {
      // Force immediate flush for streaming (critical for pkg binaries)
      const flushed = process.stdout.write(chunk, () => {
        // Callback ensures write is complete - resolve here
        resolve()
      })
      
      // If write returned false, the buffer is full - wait for drain
      // Note: if flushed is true, we still wait for the callback above
      if (!flushed) {
        // Buffer is full, wait for drain event
        process.stdout.once('drain', () => {
          // Drain event fired, but callback above will resolve
          // This is just to ensure we don't block if callback doesn't fire
        })
      }
    })
  }

  private async flushStreamingTables(): Promise<string> {
    const out: string[] = []

    const asciiMod = await import('@nicomatt69/streamtty/dist/renderers/table-ascii')
    const isMarkdownTable: (s: string) => boolean = (asciiMod as any).isMarkdownTable
    const renderMarkdownTableToASCII: (s: string, opts?: any) => string = (asciiMod as any).renderMarkdownTableToASCII
    const mermaidMod = await import('@nicomatt69/streamtty/dist/utils/mermaid-ascii')
    const convertMermaidToASCII: (code: string, cfg?: any) => Promise<string> = (mermaidMod as any).convertMermaidToASCII

    // Flush ASCII block if present
    if (this.streamingAsciiBlock && this.streamingAsciiBlock.length) {
      for (const l of this.streamingAsciiBlock) out.push(l)
      this.streamingAsciiBlock = null
    }

    // Flush any pending table lines (use full converter to allow salvage)
    if (this.streamingTableLines && this.streamingTableLines.length) {
      const candidate = this.streamingTableLines.join('\n')
      try {
        const rendered = await this.convertMarkdownTablesToAscii(candidate)
        out.push(rendered.trimEnd())
        out.push('')
      } catch {
        out.push(candidate)
      }
      this.streamingTableLines = null
    }

    // Flush pending mermaid block
    if (this.streamingMermaidActive && this.streamingMermaidLines) {
      const code = this.streamingMermaidLines.join('\n')
      try {
        const ascii = await convertMermaidToASCII(code, {
          paddingX: 3,
          paddingY: 1,
          borderPadding: 1,
        })
        out.push('')
        out.push(this.frameDiagram(ascii.trimEnd()))
        out.push('')
      } catch {
        out.push('```mermaid')
        out.push(code)
        out.push('```')
      }
      this.streamingMermaidActive = false
      this.streamingMermaidLines = null
    }

    // Flush pending header/separator as raw
    if (this.streamingPendingHeader) {
      out.push(this.streamingPendingHeader)
      this.streamingPendingHeader = null
    }
    if (this.streamingPendingSeparator) {
      out.push(this.streamingPendingSeparator)
      this.streamingPendingSeparator = null
    }

    // Flush any buffered partial line
    if (this.streamingBuffer) {
      out.push(this.streamingBuffer)
      this.streamingBuffer = ''
    }

    return out.length ? out.join('\n') + '\n' : ''
  }

  private static readonly EMOJI_REPLACEMENTS = new Map([
    ['✅', '✓'], ['❌', '✗'], ['⚠️', '⚡'], ['⚠', '⚡'], ['⏺', '●'],
    ['⎿', '└─'], ['🚀', '»'], ['💡', '○'], ['🔍', '◎'], ['📝', '∙'],
    ['🎯', '◉'], ['🔧', '⚙'], ['📊', '▤'], ['🌐', '◈']
  ])

  // Include common emoji planes plus 2300–23FF (hourglass, timers, control pictures)
  private static readonly EMOJI_REGEX = /[\u{2300}-\u{23FF}\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{FE00}-\u{FE0F}\u{1F1E0}-\u{1F1FF}]/gu

  private stripEmojiFromText(text: string): string {
    if (!this.options.stripEmoji) return text

    let result = text
    for (const [emoji, replacement] of StreamttyService.EMOJI_REPLACEMENTS) {
      result = result.replace(new RegExp(emoji, 'g'), replacement)
    }

    return result
      .replace(/[\u{1F4BB}\u{1F5A5}]/gu, '⌨')
      .replace(/[\u{1F527}\u{1F528}]/gu, '⚒')
      .replace(/[\u{1F4C4}\u{1F4C3}\u{1F4CB}]/gu, '≡')
      .replace(/[\u{1F4E6}]/gu, '▣')
      .replace(/[\u{1F680}]/gu, '»')
      .replace(StreamttyService.EMOJI_REGEX, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Preserve newlines; only replace emojis that can break table width
  private sanitizeTableEmojis(block: string): string {
    if (!block) return block
    let out = block
    // Remove variation selectors and zero-width joiners that change glyph width
    out = out.replace(/[\uFE0F\u200D]/g, '')
    // Ratings: stars → asterisks
    out = out.replace(/⭐/g, '*')
    // Status/indicators → width-1 symbols
    out = out.replace(/✅|✔️|✔|✓/g, '✓')
      .replace(/❌|✖️|✖|✕|✗/g, '×')
      .replace(/⚠️|⚠/g, '!')
      .replace(/🔴|🟠|🟡|🟢|🔵|🟣|⚫️|⚫/g, '●')
      .replace(/⚪️|⚪/g, '○')
      // Hourglass/timers → single-width ellipsis to avoid table drift
      .replace(/⏳|⌛|⏱️|⏱|⏲️|⏲|⏰|⌚/g, '…')
    // Fallback: map any remaining emoji codepoints to a middle dot in table cells
    out = out.replace(StreamttyService.EMOJI_REGEX, '·')
    return out
  }

  private static readonly TABLE_LINE_REGEX = /^\|.*\|$/
  private static readonly TABLE_SEPARATOR_REGEX = /^\|[\s\-:|]+\|$/

  /**
   * Check if content looks like it's starting a table (has header + separator)
   */
  private isStartingTable(content: string): boolean {
    const lines = content.split('\n').map(line => line.trim()).filter(Boolean)
    let headerFound = false

    for (const line of lines) {
      if (!StreamttyService.TABLE_LINE_REGEX.test(line)) {
        return false
      }

      if (StreamttyService.TABLE_SEPARATOR_REGEX.test(line)) {
        return headerFound
      }

      if (!headerFound) {
        headerFound = true
      }
    }

    return false
  }

  /**
   * Check if accumulated content contains a complete table
   * A table is complete when we have:
   * 1. Header row
   * 2. Separator row
   * 3. At least one data row
   * 4. A non-table line or end of content with newline
   */
  private hasCompleteTable(content: string): boolean {
    const lines = content.split('\n')
    let state = 0 // 0: looking for header, 1: looking for separator, 2: in data rows
    let dataRowCount = 0
    let lastLineWasTable = false

    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || !StreamttyService.TABLE_LINE_REGEX.test(trimmed)) {
        if (lastLineWasTable && state === 2 && dataRowCount > 0) {
          return true
        }
        lastLineWasTable = false
        continue
      }

      lastLineWasTable = true

      if (StreamttyService.TABLE_SEPARATOR_REGEX.test(trimmed)) {
        if (state === 1) {
          state = 2
        }
        continue
      }

      switch (state) {
        case 0:
          state = 1
          break
        case 2:
          dataRowCount++
          break
      }
    }

    return content.endsWith('\n\n') && state === 2 && dataRowCount > 0
  }

  /**
   * Process markdown content with tables
   */
  async processMarkdownWithTables(content: string): Promise<string> {
    if (!content || !content.includes('|')) {
      return content
    }
    // Use the same ASCII converter as streaming path
    return await this.convertMarkdownTablesToAscii(content)
  }

  /**
   * Stream a single chunk with type metadata for appropriate formatting
   */
  async streamChunk(chunk: string, type: ChunkType = 'ai'): Promise<void> {
    if (!chunk) return

    // Update stats and strip emoji if enabled
    this.updateStats(type)
    // Do not strip emojis globally; table renderer will sanitize emojis locally

    // Streaming-aware table handling first
    let prepared = chunk
    try {
      prepared = await this.processStreamingTables(chunk)
    } catch (err) {
      this.debugTable('[DEBUG] Streaming table preprocessor error:', String(err))
      prepared = chunk
    }

    // Apply enhanced features (mermaid, block-level table fallback, etc.)
    let processedChunk = await this.applyEnhancedFeaturesInline(prepared)

    // Apply syntax highlighting based on chunk type (except tools which stay raw)
    // Check if chunk already contains ANSI codes (to avoid double-processing)
    const hasAnsiCodes = /\x1b\[[\d;]*m/.test(processedChunk)
    const shouldHighlight = type !== 'tool' &&
      !this.stats.fallbackUsed &&
      !hasAnsiCodes // Don't highlight if already has ANSI codes

    if (shouldHighlight) {
      // Apply ANSI syntax highlighting for stdout mode only
      processedChunk = applySyntaxHighlight(processedChunk)

      // Apply type-specific coloring
      if (type === 'thinking') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.comment)
      } else if (type === 'error') {
        processedChunk = colorizeBlock(processedChunk, syntaxColors.error)
      }
    }

    this.streamBuffer += processedChunk

    // Always use enhanced inline mode - direct stdout with enhanced formatting
    const chunkLines = TerminalOutputManager.calculateLines(processedChunk)
    const outputId = terminalOutputManager.reserveSpace('StreamttyChunk', chunkLines)
    
    // Force immediate flush for streaming (critical for pkg binaries)
    // In pkg binaries, stdout may be buffered, so we need to handle this explicitly
    await this.flushStdout(processedChunk)
    
    terminalOutputManager.confirmOutput(outputId, 'StreamttyChunk', chunkLines, {
      persistent: false,
      expiryMs: 30000,
    })
  }

  /**
   * Apply enhanced features inline processing for tables, mermaid, etc.
   */
  private async applyEnhancedFeaturesInline(content: string): Promise<string> {
    if (!content) return content

    let processedContent = content

    // Note: table conversion for streaming chunks happens earlier in
    // processStreamingTables(). This path still supports block conversions.
    if (content.includes('|')) {
      this.debugTable('[DEBUG] Block table scan:', content.slice(0, 50) + '...')
      const converted = await this.convertMarkdownTablesToAscii(processedContent)
      if (converted !== content) {
        this.debugTable('[DEBUG] Block table conversion applied')
        processedContent = converted
      }
    }

    // Process mermaid diagrams if mermaid is enabled
    if (this.options.enhancedFeatures?.mermaid) {
      processedContent = await this.processMermaidInline(processedContent)
    }

    return processedContent
  }

  /**
   * Convert markdown tables to ASCII format for better terminal display
   */
  private async convertMarkdownTablesToAscii(content: string): Promise<string> {
    if (!content.includes('|')) return content
    this.debugTable('[DEBUG] Converting tables in content:', content.slice(0, 100))

    // Dynamically import streamtty's ASCII table renderer utilities
    const asciiMod = await import('@nicomatt69/streamtty/dist/renderers/table-ascii')
    const isMarkdownTable: (s: string) => boolean = (asciiMod as any).isMarkdownTable
    const renderMarkdownTableToASCII: (s: string, opts?: any) => string = (asciiMod as any).renderMarkdownTableToASCII

    const BOX_CHARS = /[┌┐└┘─│┬┴├┤┼╭╮╰╯╔╗╚╝═║╦╩╠╣╬]/
    const isFence = (line: string) => /^```/.test(line.trim())
    const isSeparator = (line: string) => /^\|?[\s\-:|]+\|?$/.test(line.trim()) && line.includes('|')
    const hasPipes = (line: string) => line.includes('|')
    const isAsciiBorderLine = (line: string) => BOX_CHARS.test(line)
    const isHeaderCandidate = (line: string) => hasPipes(line) && !isSeparator(line)
    const nextNonNoise = (idx: number, dir: 1 | -1) => {
      let j = idx
      while (j >= 0 && j < lines.length) {
        const t = lines[j].trim()
        if (t === '' || isAsciiBorderLine(t)) {
          j += dir
          continue
        }
        return j
      }
      return -1
    }
    const normalizeLine = (line: string) => {
      const t = line.trim()
      let s = t
      if (!s.startsWith('|')) s = '|' + s
      if (!s.endsWith('|')) s = s + '|'
      return s
    }

    const pushRendered = (rendered: string) => {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('')
      out.push(rendered.trimEnd())
      out.push('')
    }

    const lines = content.split('\n')
    const out: string[] = []
    // Salvage helper: convert pipe-only blocks without a valid GFM separator
    const salvageLoosePipeBlock = (block: string[]): string | null => {
      if (!block || block.length < 2) return null
      const rows = block.map(l => l.slice(1, -1).split('|').map(c => c.trim()))
      const colCount = Math.max(...rows.map(r => r.length))
      if (!Number.isFinite(colCount) || colCount < 2) return null
      const norm = rows.map(r => r.concat(Array(colCount - r.length).fill('')))
      const header = (colCount === 2) ? ['Key', 'Value'] : Array.from({ length: colCount }, (_v, idx) => `Col ${idx + 1}`)
      const sep = Array.from({ length: colCount }, () => '---')
      const md = ['|' + header.join('|') + '|', '|' + sep.join('|') + '|', ...norm.map(r => '|' + r.join('|') + '|')].join('\n')
      try {
        const rendered = renderMarkdownTableToASCII(this.sanitizeTableEmojis(md), {
          maxWidth: this.options.maxWidth || 80,
          borderStyle: 'simple',
        })
        return rendered
      } catch {
        return null
      }
    }
    let i = 0
    let inCodeBlock = false
    let pendingSeparator: string | null = null

    while (i < lines.length) {
      const raw = lines[i]
      const trimmed = raw.trim()

      // Track fenced code blocks; never convert inside
      if (isFence(raw)) {
        inCodeBlock = !inCodeBlock
        out.push(raw)
        i++
        continue
      }

      // Skip pre-rendered ASCII tables without touching them (only if standalone)
      if (!inCodeBlock && isAsciiBorderLine(trimmed)) {
        const start = i
        const block: string[] = []
        while (i < lines.length && isAsciiBorderLine(lines[i].trim())) {
          block.push(lines[i])
          i++
        }
        // If immediately followed by a GFM line, treat ASCII as noise and drop it
        const j = nextNonNoise(i, +1)
        if (j !== -1 && hasPipes(lines[j])) {
          this.debugTable('[DEBUG] Dropping noisy ASCII border block at', `${start}..${i - 1}`)
          // Do not emit; continue scanning from j (but i already at end of block)
          continue
        }
        // Otherwise preserve as a standalone ASCII table block
        this.debugTable('[DEBUG] Preserving ASCII table block at', `${start}..${i - 1}`)
        pushRendered(block.join('\n'))
        continue
      }

      // Handle separator-first cases: a separator line followed by a header
      if (!inCodeBlock && isSeparator(trimmed)) {
        const j = nextNonNoise(i + 1, +1)
        if (j !== -1 && isHeaderCandidate(lines[j].trim())) {
          // Stash the separator and jump to header
          pendingSeparator = normalizeLine(lines[i])
          this.debugTable('[DEBUG] Found separator-before-header at', `${i} -> ${j}`)
          i = j
          continue
        }
      }

      // Detect GFM tables (with or without leading/trailing pipes), skipping ASCII noise lines
      if (!inCodeBlock && isHeaderCandidate(trimmed)) {
        const start = i
        const block: string[] = [normalizeLine(lines[i])]
        // Find or use pending separator
        if (pendingSeparator) {
          block.push(pendingSeparator)
          pendingSeparator = null
          i += 1
        } else {
          const j = nextNonNoise(i + 1, +1)
          if (j === -1 || !isSeparator(lines[j])) {
            // Not a valid table start; emit raw and continue
            out.push(raw)
            i++
            continue
          }
          block.push(normalizeLine(lines[j]))
          i = j + 1
        }
        // Collect subsequent row lines while they look like table rows
        while (i < lines.length) {
          const ln = lines[i]
          const lt = ln.trim()
          if (lt === '' || isFence(ln) || isAsciiBorderLine(lt)) break
          if (!hasPipes(ln)) break
          block.push(normalizeLine(ln))
          i++
        }

        const candidate = block.join('\n')
        if (isMarkdownTable(candidate)) {
          this.debugTable('[DEBUG] Found markdown table at lines', `${start}..${i - 1}`)
          try {
            const rendered = renderMarkdownTableToASCII(this.sanitizeTableEmojis(candidate), {
              maxWidth: this.options.maxWidth || 80,
              borderStyle: 'simple',
            })
            pushRendered(rendered)
            this.debugTable('[DEBUG] Table converted successfully')
          } catch (err) {
            this.debugTable('[DEBUG] Table conversion error:', String(err))
            out.push(lines[start])
            // Rewind to emit the rest raw
            for (let k = start + 1; k < i; k++) out.push(lines[k])
          }
          continue
        } else {
          // Not a valid table after normalization; attempt salvage of loose pipe block
          const salvaged = salvageLoosePipeBlock(block)
          if (salvaged) {
            this.debugTable('[DEBUG] Salvaged loose pipe block at', `${start}`)
            pushRendered(salvaged)
          } else {
            this.debugTable('[DEBUG] Not a valid table after normalization at', `${start}`)
            for (let k = start; k < i; k++) out.push(lines[k])
          }
          continue
        }
      }

      // Regular line
      out.push(raw)
      i++
    }

    const converted = out.join('\n')
    this.debugTable('[DEBUG] Conversion result:', converted.slice(0, 100))
    return converted
  }


  /**
   * Process markdown tables and render them with enhanced table renderer
   */
  private async processTablesInline(content: string): Promise<string> {
    // Delegate to ASCII converter to keep one implementation and avoid missing imports
    return await this.convertMarkdownTablesToAscii(content)
  }

  /**
   * Process mermaid diagrams and render them with mermaid-ascii
   */
  private async processMermaidInline(content: string): Promise<string> {
    if (!StreamttyService.mermaidRenderer) {
      StreamttyService.mermaidRenderer = await import('@nicomatt69/streamtty/dist/utils/mermaid-ascii')
    }
    const { convertMermaidToASCII } = StreamttyService.mermaidRenderer

    // Look for mermaid code blocks
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/gi

    let processedContent = content
    const matches = Array.from(content.matchAll(mermaidRegex))

    for (const match of matches) {
      try {
        const mermaidCode = match[1].trim()
        if (mermaidCode) {
          const asciiDiagram = await convertMermaidToASCII(mermaidCode, {
            paddingX: 3,
            paddingY: 2,
            borderPadding: 1
          })
          processedContent = processedContent.replace(match[0], '\n' + this.frameDiagram(asciiDiagram) + '\n')
        }
      } catch (error) {
        console.warn('Inline mermaid processing failed:', error)
      }
    }

    // Also handle loose mermaid blocks (without fences) outside other code fences
    const lines = processedContent.split('\n')
    const isFence = (l: string) => /^```/.test(l.trim())
    const isLooseMermaidStart = (l: string) => /^(graph\s+(TD|LR|BT|RL)\b|sequenceDiagram\b|classDiagram\b|stateDiagram(?:-v2)?\b|erDiagram\b|gantt\b|journey\b|pie\b)/i.test(l.trim())

    let inFence = false
    let i = 0
    const out: string[] = []
    while (i < lines.length) {
      const raw = lines[i]
      const t = raw.trim()
      if (isFence(raw)) {
        inFence = !inFence
        out.push(raw)
        i++
        continue
      }
      if (!inFence && isLooseMermaidStart(raw)) {
        const start = i
        const block: string[] = [raw]
        i++
        while (i < lines.length) {
          const ln = lines[i]
          const lt = ln.trim()
          if (lt === '' || isFence(ln)) break
          block.push(ln)
          i++
        }
        try {
          const ascii = await convertMermaidToASCII(block.join('\n'), {
            paddingX: 3,
            paddingY: 1,
            borderPadding: 1,
          })
          out.push('')
          out.push(this.frameDiagram(ascii.trimEnd()))
          out.push('')
          this.debugTable('[DEBUG] Loose mermaid block converted at', String(start))
        } catch {
          // Fallback: emit raw
          for (const ln of block) out.push(ln)
        }
        continue
      }
      out.push(raw)
      i++
    }

    return out.join('\n')
  }

  /**
   * Render a complete block of content with formatting
   */
  async renderBlock(content: string, type: ChunkType = 'system'): Promise<void> {
    if (!content) return

    this.stats.totalBlocks++
    this.stats.lastRenderTime = Date.now()

    // Apply enhanced features inline and format for stdout
    const enhancedContent = await this.applyEnhancedFeaturesInline(content)
    const formattedContent = this.formatContentByType(enhancedContent, type)
    const lines = TerminalOutputManager.calculateLines(formattedContent)
    const outputId = terminalOutputManager.reserveSpace('StreamttyBlock', lines)
    console.log(formattedContent)
    terminalOutputManager.confirmOutput(outputId, 'StreamttyBlock', lines, {
      persistent: false,
      expiryMs: 30000,
    })
  }

  /**
   * Format content as markdown based on chunk type
   * Uses ANSI colors and syntax highlighting (no emoji)
   */
  private formatContentByType(content: string, type: ChunkType): string {
    // Check if content already has ANSI codes to avoid double-processing
    const hasAnsiCodes = /\x1b\[[\d;]*m/.test(content)

    switch (type) {
      case 'error':
        // Red for errors with unicode symbol
        const highlighted = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const errorPrefix = `${syntaxColors.error}▸ ERROR${syntaxColors.reset}\n`
        return errorPrefix + colorizeBlock(highlighted, syntaxColors.error)

      case 'thinking':
        // Dark gray for thinking/cognitive blocks with unicode symbol
        const highlightedThinking = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const thinkingPrefix = `${syntaxColors.comment}▸ ${syntaxColors.reset}`
        return thinkingPrefix + colorizeBlock(highlightedThinking, syntaxColors.comment)

      case 'tool':
        // Tool output without formatting (raw content)
        const toolPrefix = `${syntaxColors.path}▸ TOOL${syntaxColors.reset}\n`
        return toolPrefix + content

      case 'system':
        // Light gray for system messages with unicode symbol
        const highlightedSystem = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const systemPrefix = `${syntaxColors.reset}▸ ${syntaxColors.reset}`
        return systemPrefix + highlightedSystem

      case 'user':
        // Bright cyan for user messages with unicode symbol
        const highlightedUser = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const userPrefix = `${syntaxColors.title}▸ USER${syntaxColors.reset}\n`
        return userPrefix + colorizeBlock(highlightedUser, syntaxColors.title)

      case 'vm':
        // Bright blue for VM messages with unicode symbol
        const highlightedVm = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const vmPrefix = `${syntaxColors.title}▸ VM${syntaxColors.reset}\n`
        return vmPrefix + highlightedVm

      case 'agent':
        // Magenta for agent messages with unicode symbol
        const highlightedAgent = hasAnsiCodes ? content : applySyntaxHighlight(content)
        const agentPrefix = `${syntaxColors.keyword}▸ AGENT${syntaxColors.reset}\n`
        return agentPrefix + colorizeBlock(highlightedAgent, syntaxColors.keyword)

      case 'ai':
      default:
        // AI content with syntax highlighting applied
        const highlightedAi = hasAnsiCodes ? content : applySyntaxHighlight(content)
        return highlightedAi
    }
  }

  /**
   * Create a streaming generator that outputs through streamtty
   */
  async *createStreamRenderer(
    sourceStream: AsyncGenerator<string, void, unknown>,
    type: ChunkType = 'ai',
    options: {
      isCancelled?: () => boolean
    } = {}
  ): AsyncGenerator<string, void, unknown> {
    const isCancelled = options.isCancelled || (() => false)

    for await (const chunk of sourceStream) {
      if (isCancelled()) break

      await this.streamChunk(chunk, type)
      yield chunk
    }
  }

  /**
   * Clear the display
   */
  clear(): void {
    this.streamBuffer = ''
    console.clear() // Simple clear for inline mode
  }

  /**
   * Get rendering statistics
   */
  getStats(): RenderStats {
    return { ...this.stats }
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalChunks: 0,
      totalBlocks: 0,
      aiChunks: 0,
      toolChunks: 0,
      errorChunks: 0,
      fallbackUsed: this.stats.fallbackUsed,
      lastRenderTime: 0,
      aiSdkEvents: 0,
      toolCallEvents: 0,
      toolResultEvents: 0,
    }
  }

  /**
   * Get current buffer content
   */
  getBuffer(): string {
    return this.streamBuffer
  }

  /**
   * Check if enhanced inline mode is active
   */
  isEnhancedInlineModeActive(): boolean {
    return this.isInitialized && !this.stats.fallbackUsed
  }

  /**
   * Check if blessed mode is active (always false in new architecture)
   */
  isBlessedModeActive(): boolean {
    return false // Always false - we use enhanced inline mode now
  }

  /**
   * Get streamtty instance for advanced usage (always null in new architecture)
   */
  getStreamttyInstance(): null {
    return null // Always null - we use enhanced inline mode now
  }

  /**
   * Stream a structured AI SDK event
   */
  async streamAISDKEvent(event: StreamEvent): Promise<void> {
    if (!event) return

    this.updateAISDKStats(event.type)

    // Enhanced inline mode: format and output to stdout with enhanced features
    let payload = this.formatAISDKEventFallback(event)
    // On stream completion, flush any buffered table content first
    if (event.type === 'complete' || event.type === 'error') {
      try {
        const flushed = await this.flushStreamingTables()
        if (flushed) payload = flushed + payload
      } catch (err) {
        this.debugTable('[DEBUG] Flush on complete/error failed:', String(err))
      }
    }
    // If it's a text delta, pass through streaming-aware table preprocessor
    if (event.type === 'text_delta' && payload) {
      try {
        payload = await this.processStreamingTables(payload)
      } catch (err) {
        this.debugTable('[DEBUG] AISDK streaming preprocessor error:', String(err))
      }
    }
    const enhancedEvent = await this.applyEnhancedFeaturesInline(payload)
    if (enhancedEvent) {
      const lines = TerminalOutputManager.calculateLines(enhancedEvent)
      const outputId = terminalOutputManager.reserveSpace('AISDKEvent', lines)
      process.stdout.write(enhancedEvent)
      terminalOutputManager.confirmOutput(outputId, 'AISDKEvent', lines, {
        persistent: false,
        expiryMs: 30000,
      })
    }
  }

  /**
   * Format AI SDK event for fallback stdout rendering
   */
  private formatAISDKEventFallback(event: StreamEvent): string {
    switch (event.type) {
      case 'text_delta':
        return event.content || ''

      case 'tool_call':
        const toolArgs = JSON.stringify(event.toolArgs, null, 2)
        return `\n🔧 ${chalk.bold(event.toolName)}\n${chalk.gray('```json')}\n${toolArgs}\n${chalk.gray('```')}\n\n`

      case 'tool_result':
        const resultPreview = typeof event.toolResult === 'string'
          ? event.toolResult
          : JSON.stringify(event.toolResult, null, 2)
        const truncated = resultPreview.length > 200
          ? resultPreview.slice(0, 200) + '...'
          : resultPreview
        return `\n✓ ${chalk.bold('Result')}: ${truncated}\n\n`

      case 'thinking':
        return `\n${chalk.gray('> 💭')} ${chalk.italic(event.content)}\n\n`

      case 'reasoning':
        return `\n${chalk.gray('> ⚡')} ${chalk.italic(event.content)}\n\n`

      case 'status':
      case 'step':
        const statusIcon = this.getStatusIcon(event.metadata?.status)
        return `\n${statusIcon} ${chalk.bold(event.content)}\n\n`

      case 'error':
        return `\n❌ ${chalk.red.bold('Error')}: ${event.content}\n\n`

      case 'start':
        return `\n🚀 ${chalk.bold('Starting')}...\n\n`

      case 'complete':
        return `\n✅ ${chalk.bold('Complete')}\n\n`

      default:
        return ''
    }
  }

  /**
   * Get status icon for event metadata
   */
  private getStatusIcon(status?: string): string {
    const iconMap: Record<string, string> = {
      'pending': '⏳',
      'running': '🔄',
      'completed': '✅',
      'failed': '❌',
      'info': 'ℹ️',
    }
    return iconMap[status || 'info'] || 'ℹ️'
  }

  /**
   * Handle an AI SDK stream with full event processing
   */
  async *handleAIStream(
    stream: AsyncGenerator<StreamEvent>
  ): AsyncGenerator<string> {
    let accumulated = ''

    for await (const event of stream) {
      await this.streamAISDKEvent(event)

      // Accumulate text content for return value
      if (event.type === 'text_delta' && event.content) {
        accumulated += event.content
        yield event.content
      }
    }

    return accumulated
  }

  /**
   * Convert legacy chunk type to AI SDK event
   */
  async streamChunkAsAIEvent(chunk: string, type: ChunkType = 'ai'): Promise<void> {
    const event = this.chunkTypeToAISDKEvent(chunk, type)
    if (event) {
      await this.streamAISDKEvent(event)
    } else {
      // Fallback to legacy streaming
      await this.streamChunk(chunk, type)
    }
  }

  /**
   * Convert chunk type to AI SDK event
   */
  private chunkTypeToAISDKEvent(chunk: string, type: ChunkType): StreamEvent | null {
    switch (type) {
      case 'ai':
        return StreamProtocol.createTextDelta(chunk)

      case 'thinking':
        return StreamProtocol.createThinking(chunk)

      case 'error':
        return StreamProtocol.createError(chunk)

      case 'system':
        return StreamProtocol.createStatus(chunk, 'pending')

      default:
        return null
    }
  }

  /**
   * Enable specific enhanced feature
   */
  enableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      this.options.enhancedFeatures = {}
    }
    this.options.enhancedFeatures[feature] = true
    // Enhanced inline mode - features are applied dynamically
  }

  /**
   * Disable specific enhanced feature
   */
  disableEnhancedFeature(feature: keyof EnhancedFeaturesConfig): void {
    if (!this.options.enhancedFeatures) {
      return
    }
    this.options.enhancedFeatures[feature] = false
    // Enhanced inline mode - features are applied dynamically
  }

  /**
   * Set theme
   */
  setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.options.theme = theme
    // Enhanced inline mode - theme changes are applied dynamically
  }

  /**
   * Update security configuration
   */
  setSecurityConfig(security: Partial<SecurityConfig>): void {
    this.options.security = {
      ...this.options.security,
      ...security
    }
    // Enhanced inline mode - security changes are applied dynamically
  }

  /**
   * Check if enhanced features are enabled
   */
  areEnhancedFeaturesEnabled(): boolean {
    return this.isEnhancedInlineModeActive() &&
      Object.values(this.options.enhancedFeatures || {}).some(v => v === true)
  }

  /**
   * Get current enhanced features configuration
   */
  getEnhancedFeaturesConfig(): EnhancedFeaturesConfig | undefined {
    return this.options.enhancedFeatures
  }

  /**
   * Destroy and cleanup
   */
  destroy(): void {
    // Cleanup for inline mode
    this.streamBuffer = ''
    this.isInitialized = false
  }
}

// Singleton instance - simplified visual-only rendering service
export const streamttyService = new StreamttyService({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
  maxWidth: Math.min(140, Math.max(60, (process.stdout && process.stdout.columns) ? process.stdout.columns : 80)),
  gfm: true,

  useBlessedMode: false, // Enable blessed mode for enhanced features (tables, mermaid, etc.)
  // Enhanced visual features (no interactive controls)
  enhancedFeatures: {
    math: true,
    mermaid: true, // With mermaid-ascii integration
    shiki: true,
    security: true,
    interactiveControls: false, // Pure visual rendering only
    advancedTables: true, // With tty-table and asciichart integration
  },
  theme: 'dark',
  security: {
    enabled: true,
    stripDangerousAnsi: true,
    allowedLinkPrefixes: ['http://', 'https://'],
    allowedImagePrefixes: ['http://', 'https://'],
  },
  shikiLanguages: [
    'typescript', 'javascript', 'python', 'bash', 'json',
    'markdown', 'yaml', 'sql', 'html', 'css', 'go', 'rust'
  ],
})

// Re-export AI SDK types for convenience
export type { StreamEvent, StreamEventType } from '@nicomatt69/streamtty'
export { StreamProtocol } from '@nicomatt69/streamtty'
