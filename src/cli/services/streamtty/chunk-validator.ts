/**
 * Chunk Validator - Type-safe validation and sanitization
 * Ensures all chunks are safe, complete, and properly formatted
 * Prevents injection attacks and malformed data
 */

import type { StreamChunk } from './circular-buffer'

export type ChunkType = 'ai' | 'tool' | 'thinking' | 'system' | 'error' | 'user' | 'vm' | 'agent'

export interface ValidationError {
  field: string
  message: string
  severity: 'critical' | 'warning'
}

export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  sanitized: string
  estimatedLines: number
}

const MAX_CHUNK_SIZE = 1024 * 1024 // 1MB
const VALID_CHUNK_TYPES = new Set(['ai', 'tool', 'thinking', 'system', 'error', 'user', 'vm', 'agent'])

// Get the underlying RegExp objects from arkregex patterns for runtime use
const DANGEROUS_ANSI = /\x1b\[([0-9]{1,3}(;[0-9]{1,3})*)?[mGKHflSTABCDE]/g
const ANSI_CODE = /\x1b\[[0-9;]*m/g

export class ChunkValidator {
  static validate(chunk: StreamChunk): ValidationResult {
    const errors: ValidationError[] = []
    let sanitized = chunk.content

    if (!chunk.id || typeof chunk.id !== 'string') {
      errors.push({
        field: 'id',
        message: 'Chunk ID is missing or invalid',
        severity: 'critical',
      })
    }

    if (!VALID_CHUNK_TYPES.has(chunk.type)) {
      errors.push({
        field: 'type',
        message: `Invalid chunk type: ${chunk.type}`,
        severity: 'critical',
      })
    }

    if (!chunk.content || typeof chunk.content !== 'string') {
      errors.push({
        field: 'content',
        message: 'Chunk content is missing or invalid',
        severity: 'critical',
      })
    }

    if (chunk.content.length > MAX_CHUNK_SIZE) {
      errors.push({
        field: 'content',
        message: `Chunk exceeds maximum size of ${MAX_CHUNK_SIZE} bytes`,
        severity: 'critical',
      })
      sanitized = chunk.content.slice(0, MAX_CHUNK_SIZE)
    }

    if (typeof chunk.timestamp !== 'number' || chunk.timestamp < 0) {
      errors.push({
        field: 'timestamp',
        message: 'Timestamp is missing or invalid',
        severity: 'warning',
      })
    }

    if (typeof chunk.priority !== 'number' || chunk.priority < 0 || chunk.priority > 10) {
      errors.push({
        field: 'priority',
        message: 'Priority must be between 0 and 10',
        severity: 'warning',
      })
    }

    if (typeof chunk.retryCount !== 'number' || chunk.retryCount < 0) {
      errors.push({
        field: 'retryCount',
        message: 'Retry count is invalid',
        severity: 'warning',
      })
    }

    sanitized = ChunkValidator.sanitizeContent(sanitized, chunk.type)

    const estimatedLines = ChunkValidator.estimateLines(sanitized)

    const isValid = errors.every((e) => e.severity !== 'critical')

    return {
      isValid,
      errors,
      sanitized,
      estimatedLines,
    }
  }

  static sanitizeContent(content: string, type: ChunkType): string {
    if (!content || typeof content !== 'string') {
      return ''
    }

    let sanitized = content

    if (type !== 'tool') {
      sanitized = sanitized.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    }

    sanitized = sanitized.replace(DANGEROUS_ANSI, '')

    if (sanitized.length > MAX_CHUNK_SIZE) {
      sanitized = sanitized.slice(0, MAX_CHUNK_SIZE)
    }

    return sanitized
  }

  static checkCompleteness(chunk: StreamChunk): {
    isComplete: boolean
    confidence: number
  } {
    const content = chunk.content.trim()

    if (content.length === 0) {
      return { isComplete: false, confidence: 0 }
    }

    const codeBlockMatches = (content.match(/```/g) || []).length
    const hasOpenCodeBlock = codeBlockMatches % 2 !== 0

    if (hasOpenCodeBlock) {
      return { isComplete: false, confidence: 0.3 }
    }

    const bracketBalance = {
      open: (content.match(/\{/g) || []).length,
      close: (content.match(/\}/g) || []).length,
    }

    if (bracketBalance.open !== bracketBalance.close) {
      return { isComplete: false, confidence: 0.5 }
    }

    const endsWithPunctuation = /[.!?;:\n]$/.test(content)
    if (!endsWithPunctuation && content.length > 100) {
      return { isComplete: false, confidence: 0.7 }
    }

    return { isComplete: true, confidence: 1 }
  }

  static estimateLines(content: string, terminalWidth: number = 120): number {
    if (!content || typeof content !== 'string') {
      return 0
    }

    const lines = content.split('\n')
    let totalLines = 0

    for (const line of lines) {
      const strippedLine = line.replace(ANSI_CODE, '')
      const lineLength = strippedLine.length

      if (lineLength === 0) {
        totalLines += 1
      } else {
        totalLines += Math.ceil(lineLength / terminalWidth)
      }
    }

    return Math.max(1, totalLines)
  }

  static isValidChunkType(type: unknown): type is ChunkType {
    return typeof type === 'string' && VALID_CHUNK_TYPES.has(type as ChunkType)
  }

  static getErrorMessage(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return 'Validation passed'
    }

    const criticalErrors = errors.filter((e) => e.severity === 'critical')
    if (criticalErrors.length > 0) {
      return `Critical: ${criticalErrors.map((e) => e.message).join('; ')}`
    }

    const warnings = errors.filter((e) => e.severity === 'warning')
    if (warnings.length > 0) {
      return `Warnings: ${warnings.map((e) => e.message).join('; ')}`
    }

    return 'Validation issues found'
  }
}
