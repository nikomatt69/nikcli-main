/**
 * Streaming integration layer
 * Combines all inline renderers and security for seamless streaming
 */

import { renderMathToUnicode, renderMathBlock, processMathInText } from './renderers/unicode-math'
import { renderMermaidToASCII } from './renderers/mermaid-ascii'
import { renderMarkdownTableToASCII, isMarkdownTable } from './renderers/table-ascii'
import { sanitizeChunk, validateChunk, processChunk } from './security/chunk-processor'
import { ParsedToken, RenderContext } from './types'

/**
 * Process token with all enhancements
 * This is called during rendering to apply inline rendering
 */
export function enhanceToken(token: ParsedToken, context: RenderContext): ParsedToken {
  // Math tokens: render to unicode
  if (token.type === 'math-inline') {
    return {
      ...token,
      content: renderMathToUnicode(token.content || token.raw || '', true),
    }
  }

  if (token.type === 'math-block') {
    return {
      ...token,
      content: renderMathBlock(token.content || token.raw || ''),
    }
  }

  // Mermaid tokens: render to ASCII
  if (token.type === 'mermaid') {
    return {
      ...token,
      content: renderMermaidToASCII(token.content || token.raw || ''),
    }
  }

  // Table tokens: render to ASCII
  if (token.type === 'table') {
    const tableContent = token.content || token.raw || ''
    if (isMarkdownTable(tableContent)) {
      return {
        ...token,
        content: renderMarkdownTableToASCII(tableContent),
      }
    }
  }

  // Process math in regular paragraphs
  if (token.type === 'paragraph' || token.type === 'text') {
    if ((token.content || '').includes('$')) {
      return {
        ...token,
        content: processMathInText(token.content || ''),
      }
    }
  }

  return token
}

/**
 * Process all tokens with enhancements
 */
export function enhanceTokens(
  tokens: ParsedToken[],
  context: RenderContext
): ParsedToken[] {
  return tokens.map(token => enhanceToken(token, context))
}

/**
 * Stream chunk processor with full pipeline
 * Validates → Sanitizes → Returns processed chunk
 */
export function processStreamChunk(chunk: string, enableSecurity: boolean = true): {
  valid: boolean
  chunk: string
  error?: string
} {
  if (!chunk) {
    return { valid: false, chunk: '', error: 'Empty chunk' }
  }

  if (enableSecurity) {
    const result = processChunk(chunk)
    if (!result.valid) {
      return { valid: false, chunk: '', error: result.error }
    }
    return { valid: true, chunk: result.sanitized || chunk }
  }

  // Basic validation only
  const validation = validateChunk(chunk)
  if (!validation.valid) {
    return { valid: false, chunk: '', error: validation.error }
  }

  return { valid: true, chunk }
}

/**
 * Streaming state tracker (inline in main class)
 */
export interface StreamingState {
  isStreaming: boolean
  chunkCount: number
  byteCount: number
  startTime: number
  lastChunkTime: number
  errorCount: number
  spinnerIndex: number
}

/**
 * Initialize streaming state
 */
export function initializeStreamingState(): StreamingState {
  return {
    isStreaming: false,
    chunkCount: 0,
    byteCount: 0,
    startTime: 0,
    lastChunkTime: 0,
    errorCount: 0,
    spinnerIndex: 0,
  }
}

/**
 * Get streaming status string with spinner and stats
 */
export function getStreamingStatus(state: StreamingState): string {
  if (!state.isStreaming) {
    return ''
  }

  const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const spinnerChar = spinner[state.spinnerIndex % spinner.length]

  const elapsed = Math.max(1, Date.now() - state.startTime)
  const elapsedSec = (elapsed / 1000).toFixed(1)
  const bytesPerSec = state.byteCount / (elapsed / 1000)

  const byteDisplay =
    state.byteCount > 1024 * 1024
      ? `${(state.byteCount / 1024 / 1024).toFixed(1)}MB`
      : state.byteCount > 1024
        ? `${(state.byteCount / 1024).toFixed(1)}KB`
        : `${state.byteCount}B`

  return `${spinnerChar} Streaming: ${byteDisplay} @ ${bytesPerSec.toFixed(0)}B/s (${elapsedSec}s)`
}

/**
 * Update streaming state with chunk
 */
export function updateStreamingState(state: StreamingState, chunk: string): StreamingState {
  const newState = { ...state }

  if (!newState.isStreaming) {
    newState.isStreaming = true
    newState.startTime = Date.now()
  }

  newState.chunkCount++
  newState.byteCount += Buffer.byteLength(chunk, 'utf-8')
  newState.lastChunkTime = Date.now()
  newState.spinnerIndex++

  return newState
}

/**
 * Mark streaming as complete
 */
export function completeStreaming(state: StreamingState): {
  isStreaming: boolean
  totalBytes: number
  totalChunks: number
  durationMs: number
  avgBytesPerSec: number
  message: string
} {
  const durationMs = Date.now() - state.startTime
  const durationSec = Math.max(0.1, durationMs / 1000)
  const avgBytesPerSec = state.byteCount / durationSec

  const byteDisplay =
    state.byteCount > 1024 * 1024
      ? `${(state.byteCount / 1024 / 1024).toFixed(2)}MB`
      : state.byteCount > 1024
        ? `${(state.byteCount / 1024).toFixed(2)}KB`
        : `${state.byteCount}B`

  const message = `✓ Stream complete: ${byteDisplay} in ${(durationSec).toFixed(1)}s @ ${avgBytesPerSec.toFixed(0)}B/s [${state.chunkCount} chunks]`

  return {
    isStreaming: false,
    totalBytes: state.byteCount,
    totalChunks: state.chunkCount,
    durationMs,
    avgBytesPerSec,
    message,
  }
}

/**
 * Format duration nicely
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Format bytes nicely
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)}${sizes[i]}`
}

/**
 * Format throughput
 */
export function formatThroughput(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`
}
