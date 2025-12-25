/**
 * SmartMatcher - Intelligent pattern matching with fuzzy search and context awareness
 *
 * This module provides robust pattern matching for code editing operations,
 * handling whitespace variations, fuzzy matching with Levenshtein distance,
 * and context-based disambiguation.
 */

export interface MatchOptions {
  fuzzyThreshold?: number // 0.0-1.0, default 0.85
  ignoreWhitespace?: boolean // default false
  ignoreIndentation?: boolean // default false
  requireUnique?: boolean // default true
  contextLines?: number // for disambiguation, default 2
}

export interface MatchResult {
  found: boolean
  lineNumber?: number
  actualContent?: string // the ACTUAL content found
  confidence: number // 0.0-1.0
  alternatives?: AlternativeMatch[]
  error?: MatchError
}

export interface AlternativeMatch {
  lineNumber: number
  content: string
  similarity: number
  context?: LineContext
}

export interface MatchError {
  type: 'AMBIGUOUS_MATCH' | 'NO_MATCH' | 'WHITESPACE_MISMATCH'
  message: string
}

export interface LineContext {
  before: string[]
  after: string[]
}

/**
 * SmartMatcher class provides intelligent pattern matching with fuzzy search capabilities
 */
export class SmartMatcher {
  private matchCache: Map<string, MatchResult> = new Map()
  private similarityCache: Map<string, number> = new Map()
  private readonly maxCacheSize = 1000

  /**
   * Find best match for a search pattern in content
   */
  public findBestMatch(content: string, searchPattern: string, options: MatchOptions = {}): MatchResult {
    const cacheKey = this.getCacheKey(content, searchPattern, options)

    if (this.matchCache.has(cacheKey)) {
      return this.matchCache.get(cacheKey)!
    }

    const result = this.computeMatch(content, searchPattern, options)
    this.cacheResult(cacheKey, result)

    return result
  }

  /**
   * Compute the actual match (not cached)
   */
  private computeMatch(content: string, searchPattern: string, options: MatchOptions): MatchResult {
    const fuzzyThreshold = options.fuzzyThreshold ?? 0.85
    const ignoreWhitespace = options.ignoreWhitespace ?? false
    const ignoreIndentation = options.ignoreIndentation ?? false
    const requireUnique = options.requireUnique ?? true
    const contextLines = options.contextLines ?? 2

    const lines = content.split('\n')
    const normalizedPattern = this.normalizeForComparison(searchPattern, {
      ignoreWhitespace,
      ignoreIndentation,
    })

    const matches: Array<{ lineNumber: number; line: string; confidence: number }> = []

    // Search for matches in each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const normalizedLine = this.normalizeForComparison(line, {
        ignoreWhitespace,
        ignoreIndentation,
      })

      // Try exact match first
      if (normalizedLine.includes(normalizedPattern)) {
        matches.push({
          lineNumber: i,
          line,
          confidence: 1.0,
        })
      } else if (fuzzyThreshold < 1.0) {
        // Try fuzzy match
        const similarity = this.calculateSimilarity(normalizedPattern, normalizedLine)
        if (similarity >= fuzzyThreshold) {
          matches.push({
            lineNumber: i,
            line,
            confidence: similarity,
          })
        }
      }
    }

    // No matches found
    if (matches.length === 0) {
      const suggestions = this.findSimilarLines(content, searchPattern, {
        maxResults: 3,
        threshold: 0.6,
      })

      return {
        found: false,
        confidence: 0,
        alternatives: suggestions.map((s) => ({
          lineNumber: s.lineNumber,
          content: s.content,
          similarity: s.similarity,
        })),
      }
    }

    // Multiple matches found - check uniqueness requirement
    if (matches.length > 1 && requireUnique) {
      return {
        found: false,
        confidence: 0,
        error: {
          type: 'AMBIGUOUS_MATCH',
          message: `Pattern found ${matches.length} times. Use replaceAll or provide more context.`,
        },
        alternatives: matches.map((m) => ({
          lineNumber: m.lineNumber + 1,
          content: m.line,
          similarity: m.confidence,
          context: this.extractContext(lines, m.lineNumber, contextLines),
        })),
      }
    }

    // Found match - select the best one
    const bestMatch = matches.reduce((best, current) => (current.confidence > best.confidence ? current : best))

    return {
      found: true,
      lineNumber: bestMatch.lineNumber,
      actualContent: bestMatch.line,
      confidence: bestMatch.confidence,
      alternatives: undefined,
    }
  }

  /**
   * Normalize text for comparison (handles whitespace and indentation)
   */
  public normalizeForComparison(
    text: string,
    options: { ignoreWhitespace?: boolean; ignoreIndentation?: boolean } = {}
  ): string {
    let normalized = text

    // Normalize line endings
    normalized = normalized.replace(/\r\n/g, '\n')

    if (options.ignoreWhitespace) {
      // Replace multiple spaces with single space
      normalized = normalized.replace(/[ \t]+/g, ' ')
    }

    if (options.ignoreIndentation) {
      // Remove leading whitespace
      normalized = normalized.replace(/^\s+/, '')
    }

    // Trim trailing whitespace
    if (options.ignoreWhitespace || options.ignoreIndentation) {
      normalized = normalized.trim()
    }

    return normalized
  }

  /**
   * Calculate Levenshtein distance similarity between two strings
   * Returns 0.0 to 1.0 where 1.0 is identical
   */
  public calculateSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) {
      return str1 === str2 ? 1.0 : 0.0
    }

    const cacheKey = `${str1}::${str2}`

    if (this.similarityCache.has(cacheKey)) {
      return this.similarityCache.get(cacheKey)!
    }

    const distance = this.levenshteinDistance(str1, str2)
    const maxLength = Math.max(str1.length, str2.length)
    const similarity = maxLength === 0 ? 1.0 : 1.0 - distance / maxLength

    this.similarityCache.set(cacheKey, similarity)

    if (this.similarityCache.size > this.maxCacheSize) {
      const firstKey = this.similarityCache.keys().next().value
      if (firstKey !== undefined) {
        this.similarityCache.delete(firstKey)
      }
    }

    return similarity
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    if (!str1 || !str2) return Math.max(str1?.length ?? 0, str2?.length ?? 0)

    const m = str1.length
    const n = str2.length
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0))

    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // deletion
          dp[i][j - 1] + 1, // insertion
          dp[i - 1][j - 1] + cost // substitution
        )
      }
    }

    return dp[m][n]
  }

  /**
   * Extract context (before/after lines) around a line
   */
  public extractContext(lines: string[], lineIndex: number, contextSize: number): LineContext {
    const before: string[] = []
    const after: string[] = []

    for (let i = Math.max(0, lineIndex - contextSize); i < lineIndex; i++) {
      before.push(lines[i])
    }

    for (let i = lineIndex + 1; i < Math.min(lines.length, lineIndex + contextSize + 1); i++) {
      after.push(lines[i])
    }

    return { before, after }
  }

  /**
   * Find similar lines (for suggestions when pattern not found)
   */
  public findSimilarLines(
    content: string,
    pattern: string,
    options: { maxResults?: number; threshold?: number } = {}
  ): Array<{ lineNumber: number; content: string; similarity: number }> {
    const maxResults = options.maxResults ?? 3
    const threshold = options.threshold ?? 0.6

    const lines = content.split('\n')
    const results: Array<{ lineNumber: number; content: string; similarity: number }> = []

    // Normalize pattern for comparison
    const normalizedPattern = this.normalizeForComparison(pattern, {
      ignoreWhitespace: true,
      ignoreIndentation: true,
    })

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const normalizedLine = this.normalizeForComparison(line, {
        ignoreWhitespace: true,
        ignoreIndentation: true,
      })

      const similarity = this.calculateSimilarity(normalizedPattern, normalizedLine)

      if (similarity >= threshold) {
        results.push({
          lineNumber: i + 1,
          content: line.trim(),
          similarity,
        })
      }
    }

    // Sort by similarity (descending) and return top maxResults
    const sorted = results.sort((a, b) => b.similarity - a.similarity)
    return maxResults ? sorted.slice(0, maxResults) : sorted
  }

  /**
   * Validate that a match is unique (no other identical patterns)
   */
  public validateUniqueness(
    content: string,
    pattern: string,
    foundLineNumber: number
  ): { isUnique: boolean; occurrences: number; otherLines: number[] } {
    const lines = content.split('\n')
    let occurrences = 0
    const otherLines: number[] = []

    const normalizedPattern = this.normalizeForComparison(pattern, {
      ignoreWhitespace: true,
      ignoreIndentation: true,
    })

    for (let i = 0; i < lines.length; i++) {
      const normalizedLine = this.normalizeForComparison(lines[i], {
        ignoreWhitespace: true,
        ignoreIndentation: true,
      })

      if (normalizedLine.includes(normalizedPattern)) {
        occurrences++
        if (i !== foundLineNumber) {
          otherLines.push(i + 1)
        }
      }
    }

    return {
      isUnique: occurrences === 1,
      occurrences,
      otherLines,
    }
  }

  /**
   * Generate cache key for match results
   */
  private getCacheKey(content: string, pattern: string, options: MatchOptions): string {
    return `${content.length}:${pattern.slice(0, 50)}:${JSON.stringify(options)}`
  }

  /**
   * Cache a match result with LRU eviction
   */
  private cacheResult(key: string, result: MatchResult): void {
    this.matchCache.set(key, result)

    if (this.matchCache.size > this.maxCacheSize) {
      const firstKey = this.matchCache.keys().next().value
      if (firstKey !== undefined) {
        this.matchCache.delete(firstKey)
      }
    }
  }

  /**
   * Clear all caches
   */
  public clearCache(): void {
    this.matchCache.clear()
    this.similarityCache.clear()
  }
}
