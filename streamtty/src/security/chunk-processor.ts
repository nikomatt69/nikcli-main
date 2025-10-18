/**
 * Inline security validation and sanitization for streaming chunks
 * Handles all 10 edge cases for robust streaming
 */

export interface ValidationResult {
  valid: boolean
  error?: string
  sanitized?: string
}

export interface SanitizationOptions {
  mode?: 'strict' | 'balanced' | 'permissive'
  maxBufferSize?: number
  stripControlChars?: boolean
  stripDangerousAnsi?: boolean
}

/**
 * Edge Case 1: Validate empty chunks
 */
export function isEmptyChunk(chunk: string): boolean {
  return !chunk || chunk.trim().length === 0
}

/**
 * Edge Case 2: Handle very large chunks (> 50KB)
 */
export function handleLargeChunk(chunk: string, maxSize: number = 50 * 1024): string {
  const byteLength = Buffer.byteLength(chunk, 'utf-8')

  if (byteLength > maxSize) {
    // Split at line boundary to preserve structure
    const lines = chunk.split('\n')
    let result = ''
    let currentSize = 0

    for (const line of lines) {
      const lineSize = Buffer.byteLength(line + '\n', 'utf-8')
      if (currentSize + lineSize > maxSize) {
        break
      }
      result += line + '\n'
      currentSize += lineSize
    }

    return result || chunk.substring(0, maxSize)
  }

  return chunk
}

/**
 * Edge Case 3: Normalize mixed line endings
 * Handles \r\n, \r, and \n
 */
export function normalizeLineEndings(chunk: string): string {
  return chunk
    .replace(/\r\n/g, '\n') // Windows to Unix
    .replace(/\r/g, '\n') // Old Mac to Unix
}

/**
 * Edge Case 4: Decode HTML entities comprehensively
 */
export function decodeHtmlEntities(chunk: string): string {
  let result = chunk

  // Named entities
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&deg;': '°',
  }

  Object.entries(entities).forEach(([entity, char]) => {
    result = result.replace(new RegExp(entity, 'g'), char)
  })

  // Decimal entities: &#123;
  result = result.replace(/&#(\d+);/g, (match, num) => {
    try {
      return String.fromCharCode(parseInt(num, 10))
    } catch {
      return match
    }
  })

  // Hex entities: &#x1A;
  result = result.replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => {
    try {
      return String.fromCharCode(parseInt(hex, 16))
    } catch {
      return match
    }
  })

  return result
}

/**
 * Edge Case 5: Unicode normalization NFC
 */
export function normalizeUnicode(chunk: string): string {
  try {
    return chunk.normalize('NFC')
  } catch {
    // If normalization fails, return as-is
    return chunk
  }
}

/**
 * Edge Case 6: Validate UTF-8 encoding
 */
export function validateUTF8(chunk: string): { valid: boolean; error?: string } {
  try {
    // Try to encode and decode - this validates UTF-8
    const encoded = Buffer.from(chunk, 'utf-8')
    const decoded = encoded.toString('utf-8')

    // Check for replacement characters (indicates invalid UTF-8)
    if (decoded.includes('�')) {
      return { valid: false, error: 'Invalid UTF-8 sequences detected' }
    }

    return { valid: true }
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'UTF-8 validation failed',
    }
  }
}

/**
 * Edge Case 7: Strip dangerous ANSI escape sequences
 * Keep safe ones for terminal colors
 */
export function stripDangerousAnsiCodes(chunk: string): string {
  // Dangerous patterns: cursor movement, clear screen, title setting
  return chunk
    // Clear screen / clear line
    .replace(/\x1b\[2J/g, '')
    .replace(/\x1b\[K/g, '')
    // Cursor movement (ESC[H, ESC[A, ESC[B, etc)
    .replace(/\x1b\[\d+[ABCDEFf]/g, '')
    // Save/restore cursor
    .replace(/\x1b\[s/g, '')
    .replace(/\x1b\[u/g, '')
    // Set title
    .replace(/\x1b\][0-2];[^\x1b]*(?:\x1b\\|BEL)/g, '')
    // Other dangerous sequences
    .replace(/\x1b\(B/g, '')
    .replace(/\x1b\)0/g, '')
    // But KEEP color codes like \x1b[31m
}

/**
 * Edge Case 8: Remove control characters (but keep safe ones)
 */
export function stripControlChars(chunk: string): string {
  // Keep common safe ones: \n, \t, \r (normalized earlier)
  return chunk
    .split('')
    .filter(char => {
      const code = char.charCodeAt(0)
      // Allow: tab (9), newline (10), carriage return (13)
      // Disallow: other control chars (0-8, 11-12, 14-31)
      if (code === 9 || code === 10 || code === 13) return true
      // Allow normal characters (32+)
      if (code >= 32) return true
      // Allow high unicode (127+)
      if (code >= 127) return true
      return false
    })
    .join('')
}

/**
 * Edge Case 9: Remove null bytes
 */
export function stripNullBytes(chunk: string): string {
  return chunk.replace(/\0/g, '')
}

/**
 * Edge Case 10: Validate bracket/brace nesting depth
 * Prevents stack overflow attacks
 */
export function validateNestingDepth(chunk: string, maxDepth: number = 100): { valid: boolean; depth: number } {
  let depth = 0
  let maxReached = 0

  for (const char of chunk) {
    if (char === '[' || char === '(' || char === '{') {
      depth++
      maxReached = Math.max(maxReached, depth)
    } else if (char === ']' || char === ')' || char === '}') {
      depth = Math.max(0, depth - 1)
    }
  }

  return {
    valid: maxReached <= maxDepth,
    depth: maxReached,
  }
}

/**
 * Comprehensive chunk validation
 */
export function validateChunk(chunk: string): ValidationResult {
  // Check 1: Empty
  if (isEmptyChunk(chunk)) {
    return { valid: false, error: 'Empty chunk' }
  }

  // Check 2: UTF-8 validity
  const utf8Check = validateUTF8(chunk)
  if (!utf8Check.valid) {
    return { valid: false, error: utf8Check.error }
  }

  // Check 3: Nesting depth
  const nestingCheck = validateNestingDepth(chunk)
  if (!nestingCheck.valid) {
    return { valid: false, error: `Nesting depth too deep: ${nestingCheck.depth}` }
  }

  return { valid: true }
}

/**
 * Comprehensive chunk sanitization (handles all edge cases)
 */
export function sanitizeChunk(
  chunk: string,
  options: SanitizationOptions = {}
): string {
  const {
    mode = 'balanced',
    maxBufferSize = 1024 * 100, // 100KB
    stripControlChars: strip = true,
    stripDangerousAnsi: stripAnsi = true,
  } = options

  let result = chunk

  // 1. Handle large chunks
  result = handleLargeChunk(result, maxBufferSize)

  // 2. Normalize line endings
  result = normalizeLineEndings(result)

  // 3. Decode HTML entities
  if (mode !== 'strict') {
    result = decodeHtmlEntities(result)
  }

  // 4. Normalize unicode
  result = normalizeUnicode(result)

  // 5. Strip dangerous ANSI codes
  if (stripAnsi) {
    result = stripDangerousAnsiCodes(result)
  }

  // 6. Strip control characters
  if (strip) {
    result = stripControlChars(result)
  }

  // 7. Remove null bytes
  result = stripNullBytes(result)

  // 8. Remove trailing/leading whitespace (but preserve indentation)
  if (mode === 'strict') {
    result = result.trim()
  }

  return result
}

/**
 * Full validation + sanitization pipeline
 */
export function processChunk(
  chunk: string,
  options: SanitizationOptions = {}
): ValidationResult {
  // Validate
  const validation = validateChunk(chunk)
  if (!validation.valid) {
    return validation
  }

  // Sanitize
  const sanitized = sanitizeChunk(chunk, options)

  return {
    valid: true,
    sanitized,
  }
}

/**
 * Detect suspicious patterns
 */
export function detectSuspiciousPatterns(chunk: string): string[] {
  const warnings: string[] = []

  // Check for potential XSS
  if (/<script|javascript:/i.test(chunk)) {
    warnings.push('Potential XSS detected')
  }

  // Check for path traversal
  if (/\.\.\//g.test(chunk)) {
    warnings.push('Path traversal detected')
  }

  // Check for SQL injection patterns
  if (/('|").*--.*/i.test(chunk)) {
    warnings.push('SQL injection pattern detected')
  }

  // Check for excessive special chars
  const specialCharCount = (chunk.match(/[!@#$%^&*()_+=\[\]{};:'"<>,.?/]/g) || []).length
  if (specialCharCount > chunk.length * 0.3) {
    warnings.push('Unusual character density')
  }

  return warnings
}
