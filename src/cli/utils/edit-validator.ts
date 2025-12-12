/**
 * EditValidator - Pre-edit validation and error recovery
 *
 * This module validates edit operations before they modify files,
 * detecting issues like ambiguous patterns, syntax errors, and
 * providing intelligent suggestions for correction.
 */

import { SmartMatcher } from './smart-matcher'

export interface ValidationError {
  type: 'NO_MATCH' | 'AMBIGUOUS_MATCH' | 'INVALID_PATTERN' | 'WHITESPACE_MISMATCH'
  message: string
  details?: Record<string, unknown>
}

export interface ValidationWarning {
  type: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  suggestions: string[]
}

export interface EditOptions {
  replaceAll?: boolean
  ignoreWhitespace?: boolean
  ignoreIndentation?: boolean
  fuzzyMatch?: boolean
  fuzzyThreshold?: number
}

export interface AmbiguityCheck {
  isAmbiguous: boolean
  occurrences: number
  lines: number[]
}

/**
 * EditValidator class provides pre-edit validation
 */
export class EditValidator {
  private matcher: SmartMatcher = new SmartMatcher()

  /**
   * Validate an edit operation before it modifies a file
   */
  public validateEdit(
    content: string,
    oldString: string,
    newString: string,
    options: EditOptions = {}
  ): ValidationResult {
    const errors: ValidationError[] = []
    const warnings: ValidationWarning[] = []
    const suggestions: string[] = []

    // Check for empty pattern
    if (oldString.trim().length === 0) {
      errors.push({
        type: 'INVALID_PATTERN',
        message: 'Search pattern cannot be empty',
      })
      return { valid: false, errors, warnings, suggestions }
    }

    // Check if pattern exists in content
    const matchResult = this.matcher.findBestMatch(content, oldString, {
      fuzzyThreshold: options.fuzzyThreshold ?? 0.85,
      ignoreWhitespace: options.ignoreWhitespace ?? false,
      ignoreIndentation: options.ignoreIndentation ?? false,
    })

    if (!matchResult.found) {
      errors.push({
        type: 'NO_MATCH',
        message: `Pattern not found in file: "${oldString}"`,
        details: {
          pattern: oldString,
          suggestions: matchResult.alternatives?.slice(0, 3) || [],
        },
      })

      // Provide helpful suggestions
      if (
        matchResult.alternatives &&
        matchResult.alternatives.length > 0 &&
        !options.fuzzyMatch
      ) {
        suggestions.push('Enable fuzzyMatch: true to find similar patterns')
        suggestions.push(
          `Similar lines found at lines ${matchResult.alternatives.map(a => a.lineNumber).join(', ')}`
        )
      } else if (
        matchResult.alternatives &&
        matchResult.alternatives.length > 0 &&
        options.fuzzyMatch
      ) {
        suggestions.push(`Did you mean one of these similar lines:`)
        for (const alt of matchResult.alternatives.slice(0, 3)) {
          suggestions.push(
            `  Line ${alt.lineNumber}: "${alt.content.trim()}" (${Math.round(alt.similarity * 100)}% similar)`
          )
        }
      }

      return { valid: false, errors, warnings, suggestions }
    }

    // Check for ambiguous matches
    const ambiguity = this.checkAmbiguity(content, oldString, options)
    if (ambiguity.isAmbiguous && !options.replaceAll) {
      errors.push({
        type: 'AMBIGUOUS_MATCH',
        message: `Pattern found ${ambiguity.occurrences} times without replaceAll flag`,
        details: {
          occurrences: ambiguity.occurrences,
          lines: ambiguity.lines,
        },
      })

      suggestions.push(`Use replaceAll: true to replace all occurrences`)
      suggestions.push(
        `Or provide more context to disambiguate which occurrence to replace`
      )
      suggestions.push(`Occurrences found at lines: ${ambiguity.lines.join(', ')}`)

      return { valid: false, errors, warnings, suggestions }
    }

    // Check for potential whitespace issues
    const lines = content.split('\n')
    const lines_with_pattern = lines.filter(line => line.includes(oldString))

    if (lines_with_pattern.length === 0 && matchResult.found) {
      warnings.push({
        type: 'WHITESPACE_MISMATCH',
        message: 'Pattern found after whitespace normalization but not in raw content',
      })

      suggestions.push('Pattern matched using fuzzy/normalized matching')
      suggestions.push('Consider using ignoreWhitespace: true explicitly')
    }

    // Check if replacement would preserve basic syntax
    if (this.isSyntaxSensitiveFile(content)) {
      const syntaxCheck = this.validateSyntaxPreservation(content, oldString, newString)
      if (!syntaxCheck.valid) {
        warnings.push({
          type: 'SYNTAX_WARNING',
          message: `Potential syntax issue: ${syntaxCheck.message}`,
        })
        suggestions.push(...syntaxCheck.suggestions)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    }
  }

  /**
   * Check if pattern appears multiple times (ambiguity)
   */
  public checkAmbiguity(
    content: string,
    pattern: string,
    options: EditOptions = {}
  ): AmbiguityCheck {
    const lines = content.split('\n')
    let occurrences = 0
    const lines_found: number[] = []

    const normalizedPattern = this.matcher.normalizeForComparison(pattern, {
      ignoreWhitespace: options.ignoreWhitespace ?? false,
      ignoreIndentation: options.ignoreIndentation ?? false,
    })

    for (let i = 0; i < lines.length; i++) {
      const normalizedLine = this.matcher.normalizeForComparison(lines[i], {
        ignoreWhitespace: options.ignoreWhitespace ?? false,
        ignoreIndentation: options.ignoreIndentation ?? false,
      })

      if (normalizedLine.includes(normalizedPattern)) {
        occurrences++
        lines_found.push(i + 1)
      }
    }

    return {
      isAmbiguous: occurrences > 1,
      occurrences,
      lines: lines_found,
    }
  }

  /**
   * Suggest alternative patterns when match fails
   */
  public suggestAlternatives(content: string, failedPattern: string): string[] {
    const suggestions: string[] = []
    const lines = content.split('\n')

    // Find similar lines
    const similar = this.matcher.findSimilarLines(content, failedPattern, {
      maxResults: 3,
      threshold: 0.5,
    })

    if (similar.length > 0) {
      for (const line of similar) {
        suggestions.push(`Line ${line.lineNumber}: "${line.content}"`)
      }
    }

    // Suggest normalization options
    if (failedPattern.includes('  ') || failedPattern.includes('\t')) {
      suggestions.push('Your pattern contains multiple spaces or tabs - try with ignoreWhitespace: true')
    }

    if (failedPattern.match(/^\s+/)) {
      suggestions.push('Your pattern has leading whitespace - try with ignoreIndentation: true')
    }

    return suggestions
  }

  /**
   * Validate that syntax is preserved after replacement
   */
  public validateSyntaxPreservation(
    originalContent: string,
    oldString: string,
    newString: string,
    fileExtension?: string
  ): { valid: boolean; message: string; suggestions: string[] } {
    // If we don't know the file type, do basic checks
    if (!fileExtension) {
      fileExtension = this.detectFileType(originalContent)
    }

    const suggestions: string[] = []
    let valid = true
    let message = ''

    switch (fileExtension) {
      case 'json':
        if (!this.isValidJsonAfterReplacement(originalContent, oldString, newString)) {
          valid = false
          message = 'JSON syntax would be broken'
          suggestions.push('Ensure JSON remains valid after replacement')
        }
        break

      case 'ts':
      case 'tsx':
      case 'js':
      case 'jsx':
        if (!this.isValidJavascriptAfterReplacement(originalContent, oldString, newString)) {
          valid = false
          message = 'JavaScript/TypeScript syntax might be broken'
          suggestions.push('Check bracket matching and quote pairing')
        }
        break

      case 'yaml':
      case 'yml':
        if (!this.isValidYamlIndentation(originalContent, oldString, newString)) {
          valid = false
          message = 'YAML indentation might be broken'
          suggestions.push('Ensure consistent indentation is preserved')
        }
        break
    }

    return { valid, message, suggestions }
  }

  /**
   * Check if file appears to be syntax-sensitive
   */
  private isSyntaxSensitiveFile(content: string): boolean {
    // Check for common syntax indicators
    const syntaxPatterns = [
      /\{[\s\S]*\}/m, // braces
      /\[[\s\S]*\]/m, // brackets
      /["'`]/m, // quotes
      /function\s+\w+/m, // function declarations
      /class\s+\w+/m, // class declarations
      /import\s+/m, // import statements
    ]

    return syntaxPatterns.some(pattern => pattern.test(content))
  }

  /**
   * Detect file type from content
   */
  private detectFileType(content: string): string {
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      return 'json'
    }
    if (content.includes('import ') || content.includes('export ')) {
      if (content.includes('interface ') || content.includes('type ')) {
        return 'ts'
      }
      return 'js'
    }
    if (content.includes(': ') && !content.includes('//')) {
      return 'yaml'
    }
    return 'unknown'
  }

  /**
   * Check if JSON would be valid after replacement
   */
  private isValidJsonAfterReplacement(
    originalContent: string,
    oldString: string,
    newString: string
  ): boolean {
    try {
      const modified = originalContent.replace(oldString, newString)
      JSON.parse(modified)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check if JavaScript/TypeScript syntax would be valid
   */
  private isValidJavascriptAfterReplacement(
    originalContent: string,
    oldString: string,
    newString: string
  ): boolean {
    const modified = originalContent.replace(oldString, newString)

    // Basic syntax checks
    const openBraces = (modified.match(/\{/g) || []).length
    const closeBraces = (modified.match(/\}/g) || []).length

    const openBrackets = (modified.match(/\[/g) || []).length
    const closeBrackets = (modified.match(/\]/g) || []).length

    const openParens = (modified.match(/\(/g) || []).length
    const closeParens = (modified.match(/\)/g) || []).length

    return (
      openBraces === closeBraces &&
      openBrackets === closeBrackets &&
      openParens === closeParens
    )
  }

  /**
   * Check if YAML indentation would be preserved
   */
  private isValidYamlIndentation(
    originalContent: string,
    oldString: string,
    newString: string
  ): boolean {
    // Get indentation of the original pattern
    const originalLines = originalContent.split('\n')
    const patternLine = originalLines.find(line => line.includes(oldString))

    if (!patternLine) return true

    const originalIndent = patternLine.match(/^\s*/)?.[0].length ?? 0

    // Check if replacement would maintain indentation
    const replacementIndent = newString.match(/^\s*/)?.[0].length ?? 0

    // If indentation changes significantly, it might break YAML
    return Math.abs(originalIndent - replacementIndent) <= 2
  }
}
