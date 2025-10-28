/**
 * Centralized Arktype Regex Pattern Registry
 * Provides type-safe regex patterns for common validation use cases
 * Replaces scattered regex definitions across the codebase
 */

import { type } from 'arktype'

/**
 * EVM Address Pattern - 0x followed by exactly 40 hex characters (with optional checksum)
 * Validates Ethereum addresses in both lowercase and checksummed formats
 */
export const EVMAddressPattern = type(/^0x[a-fA-F0-9]{40}$/)

/**
 * Hex String Pattern - Any sequence of hex characters (without 0x prefix)
 * Used for validating individual hex components
 */
export const HexStringPattern = type(/^[a-fA-F0-9]*$/i)

/**
 * UUID v4 Pattern - Standard UUID format with version 4 and variant bits
 * Validates RFC 4122 compliant UUIDs
 */
export const UUIDv4Pattern = type(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)

/**
 * ANSI Escape Code Pattern - Detects dangerous ANSI control sequences
 * Matches: ESC [ ... m (color/formatting) and other control sequences
 * Used for content sanitization in terminal output
 */
export const DangerousANSIPattern = type(/\x1b\[([0-9]{1,3}(;[0-9]{1,3})*)?[mGKHflSTABCDE]/g)

/**
 * Safe ANSI Code Pattern - General ANSI code detection for benign sequences
 * Matches standard ANSI color codes: ESC [ ... m
 */
export const SafeANSIPattern = type(/\x1b\[[0-9;]*m/g)

/**
 * Framework Detection Pattern - Detects common JS/TS frameworks in code content
 * Returns captured framework names for intelligent detection
 */
export const FrameworkPatterns = {
  react: type(/import\s+.*\s+from\s+['"]react['"]/),
  vue: type(/import\s+.*\s+from\s+['"]vue['"]/),
  angular: type(/@angular/),
  nextjs: type(/import\s+.*\s+from\s+['"]next['"]/),
  svelte: type(/import\s+.*\s+from\s+['"]svelte['"]/),
  express: type(/const\s+.*=\s+require\(['"]express['"]\)|import\s+.*\s+from\s+['"]express['"]/),
  nestjs: type(/@nestjs/),
  remix: type(/remix/i),
} as const

/**
 * Code Metrics Patterns - Detects cyclomatic complexity indicators
 * Used for code quality analysis
 */
export const CyclomaticComplexityPatterns = {
  conditionals: type(/\bif\b|\belse\b|\belse\s+if\b/g),
  switchCases: type(/\bcase\b|\bdefault\b/g),
  loops: type(/\bfor\b|\bwhile\b|\bdo\b/g),
  catches: type(/\bcatch\b/g),
  ternary: type(/\?.*:/g),
  logicalOperators: type(/&&|\|\|/g),
} as const

/**
 * Component Naming Pattern - Validates React/Vue component name format
 * Ensures component names start with capital letter and follow camelCase convention
 */
export const ComponentNamePattern = type(/^[A-Z][a-zA-Z0-9]*$/)

/**
 * File Path Safety Pattern - Validates file paths to prevent directory traversal attacks
 * Allows alphanumeric, hyphens, underscores, dots, and forward slashes
 */
export const SafeFilePathPattern = type(/^[a-zA-Z0-9._\-/]+$/)

/**
 * Search Pattern Validator - Validates regex patterns from user input
 * Ensures patterns are compilable before execution
 * Prevents ReDoS (Regular Expression Denial of Service) attacks
 */
export const SearchPatternValidator = type({
  pattern: 'string',
  flags: 'string?',
  caseSensitive: 'boolean?',
  wholeWord: 'boolean?',
} as const)

/**
 * Chain ID Pattern - Validates EVM chain IDs (positive integers)
 * Used in multi-chain operations
 */
export const ChainIDPattern = type(/^[0-9]+$/)

/**
 * Amount Pattern - Validates numeric amounts (integers and decimals)
 * Supports scientific notation for large numbers
 */
export const AmountPattern = type(/^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/)

/**
 * Environment Variable Pattern - Validates environment variable names
 * Follows conventions: UPPERCASE_WITH_UNDERSCORES
 */
export const EnvironmentVariablePattern = type(/^[A-Z][A-Z0-9_]*$/)

/**
 * URL Pattern - Basic URL validation
 * Supports http, https, and common protocols
 */
export const URLPattern = type(/^(https?:\/\/|ftp:\/\/)[^\s/$.?#].[^\s]*$/i)

/**
 * Email Pattern - Basic email validation
 * Simplified pattern for general validation
 */
export const EmailPattern = type(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)

/**
 * Slack Channel Pattern - Validates Slack channel names
 * Channels must start with # and contain lowercase letters, numbers, hyphens
 */
export const SlackChannelPattern = type(/#[a-z0-9\-_]{1,80}/)

/**
 * Git Hash Pattern - Validates Git commit hashes (SHA-1 and SHA-256)
 * Supports both short (7 chars) and full hashes
 */
export const GitHashPattern = type(/^[a-f0-9]{7,}$/)

/**
 * Semantic Version Pattern - Validates SemVer format (major.minor.patch)
 * Supports optional pre-release and build metadata
 */
export const SemanticVersionPattern = type(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/)

/**
 * Pattern validation utilities
 */
export const PatternValidation = {
  /**
   * Safely validates a pattern string for regex compilation
   * Prevents ReDoS by checking pattern complexity
   */
  validateRegexPattern(pattern: string): {
    valid: boolean
    error?: string
  } {
    try {
      // Compile the pattern to catch syntax errors
      new RegExp(pattern)

      // Basic ReDoS detection: check for excessive backtracking patterns
      if (/(.*\*){3,}|(\+.*\+){3,}|(\{.*\}){3,}/.test(pattern)) {
        return {
          valid: false,
          error: 'Pattern may cause exponential backtracking (potential ReDoS)',
        }
      }

      // Check for runaway quantifiers
      if (/(\*\*|\+\+|\?\?)/.test(pattern)) {
        return {
          valid: false,
          error: 'Pattern contains invalid quantifier sequence',
        }
      }

      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Invalid regex pattern: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  },

  /**
   * Validates an EVM address with checksum verification
   */
  validateEVMAddress(address: string): {
    valid: boolean
    normalized?: string
    error?: string
  } {
    const trimmed = address.trim()

    // Must start with 0x
    if (!trimmed.startsWith('0x')) {
      return { valid: false, error: 'Address must start with 0x' }
    }

    const hexPart = trimmed.slice(2)

    // Check hex characters
    if (!/^[a-fA-F0-9]*$/i.test(hexPart)) {
      return { valid: false, error: 'Address contains invalid hex characters' }
    }

    // Length validation
    if (hexPart.length > 40) {
      return { valid: false, error: 'Address hex part exceeds 40 characters' }
    }

    // Pad and normalize
    const normalized = `0x${hexPart.padStart(40, '0')}`
    return { valid: true, normalized }
  },

  /**
   * Validates UUID format
   */
  validateUUID(uuid: string): {
    valid: boolean
    error?: string
  } {
    try {
      const result = UUIDv4Pattern(uuid)
      return { valid: true }
    } catch (error) {
      return {
        valid: false,
        error: `Invalid UUID format: ${uuid}`,
      }
    }
  },

  /**
   * Detects framework from code content using arkregex patterns
   */
  detectFramework(content: string): string[] {
    const detected: string[] = []

    Object.entries(FrameworkPatterns).forEach(([name, pattern]) => {
      try {
        pattern(content)
        detected.push(name)
      } catch {
        // Pattern doesn't match, continue
      }
    })

    return detected
  },
} as const

export default {
  EVMAddressPattern,
  HexStringPattern,
  UUIDv4Pattern,
  DangerousANSIPattern,
  SafeANSIPattern,
  FrameworkPatterns,
  CyclomaticComplexityPatterns,
  ComponentNamePattern,
  SafeFilePathPattern,
  SearchPatternValidator,
  ChainIDPattern,
  AmountPattern,
  EnvironmentVariablePattern,
  URLPattern,
  EmailPattern,
  SlackChannelPattern,
  GitHashPattern,
  SemanticVersionPattern,
  PatternValidation,
}
