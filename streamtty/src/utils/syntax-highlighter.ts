/**
 * ANSI-based syntax highlighting for terminal output
 * Uses standard ANSI color codes for highlighting paths, keywords, and other elements
 */

import { colors } from './formatting'

/**
 * ANSI color codes for syntax highlighting
 */
export const syntaxColors = {
  path: '\x1b[36m',           // Cyan for file paths
  lineNumber: '\x1b[33m',     // Yellow for line numbers
  keyword: '\x1b[35m',        // Magenta for keywords
  string: '\x1b[32m',         // Green for strings
  number: '\x1b[93m',         // Bright yellow for numbers
  comment: '\x1b[90m',        // Dark gray for comments
  title: '\x1b[96m',          // Bright cyan for titles
  error: '\x1b[91m',          // Bright red for errors
  success: '\x1b[92m',        // Bright green for success
  warning: '\x1b[93m',        // Bright yellow for warnings
  codeBlock: '\x1b[36m',      // Cyan for code block delimiters
  package: '\x1b[36m',        // Cyan for package names
  reset: '\x1b[0m',           // Reset to default
}

/**
 * Common programming keywords to highlight
 */
const KEYWORDS = [
  'async', 'await', 'function', 'const', 'let', 'var', 'class', 'interface',
  'type', 'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while',
  'try', 'catch', 'throw', 'new', 'this', 'super', 'extends', 'implements',
  'public', 'private', 'protected', 'static', 'readonly', 'enum', 'namespace',
]

/**
 * Shell/bash commands to highlight
 */
const SHELL_COMMANDS = [
  'git', 'npm', 'yarn', 'pnpm', 'docker', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv',
  'cat', 'grep', 'find', 'sed', 'awk', 'chmod', 'chown', 'sudo', 'apt', 'brew',
  'curl', 'wget', 'tar', 'zip', 'unzip', 'ssh', 'scp', 'rsync', 'ps', 'kill',
]

/**
 * Highlight file paths in text
 * Matches: /path/to/file.ts, ./relative/path.js, ~/home/path
 * NOTE: Disabled to avoid ANSI code injection issues
 */
export function highlightPaths(text: string): string {
  // Path highlighting disabled to prevent ANSI code leakage
  return text
}

/**
 * Highlight file references with line numbers
 * Matches: file.ts:123, /path/to/file.js:45:10
 * NOTE: Disabled to avoid ANSI code injection issues
 */
export function highlightFileRefs(text: string): string {
  // File reference highlighting disabled to prevent ANSI code leakage
  return text
}

/**
 * Highlight programming keywords
 */
export function highlightKeywords(text: string): string {
  let highlighted = text

  for (const keyword of KEYWORDS) {
    // Match whole words only (with word boundaries)
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g')
    highlighted = highlighted.replace(regex, `${syntaxColors.keyword}$1${syntaxColors.reset}`)
  }

  return highlighted
}

/**
 * Highlight markdown-style titles
 * Matches: # Title, ## Subtitle, etc.
 */
export function highlightTitles(text: string): string {
  // Match markdown headers
  const titleRegex = /^(#{1,6})\s+(.+)$/gm
  return text.replace(titleRegex, (match, hashes, title) => {
    return `${syntaxColors.title}${hashes} ${title}${syntaxColors.reset}`
  })
}

/**
 * Highlight string literals in quotes
 */
export function highlightStrings(text: string): string {
  // Match single and double quoted strings
  const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g
  return text.replace(stringRegex, (match) => {
    return `${syntaxColors.string}${match}${syntaxColors.reset}`
  })
}

/**
 * Highlight numbers
 */
export function highlightNumbers(text: string): string {
  // Match numbers (integers and floats)
  const numberRegex = /\b(\d+\.?\d*)\b/g
  return text.replace(numberRegex, `${syntaxColors.number}$1${syntaxColors.reset}`)
}

/**
 * Highlight code comments
 * Matches single-line and multi-line comments, bash comments
 */
export function highlightComments(text: string): string {
  let highlighted = text

  // Bash comments (# comment)
  highlighted = highlighted.replace(
    /(#.*)$/gm,
    (match) => {
      // Avoid highlighting markdown headers
      if (/^#{1,6}\s/.test(match)) return match
      return `${syntaxColors.comment}${match}${syntaxColors.reset}`
    }
  )

  // Single-line comments
  highlighted = highlighted.replace(
    /(\/\/.*)$/gm,
    `${syntaxColors.comment}$1${syntaxColors.reset}`
  )

  // Multi-line comments
  highlighted = highlighted.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    `${syntaxColors.comment}$1${syntaxColors.reset}`
  )

  return highlighted
}

/**
 * Highlight shell/bash commands
 */
export function highlightShellCommands(text: string): string {
  let highlighted = text

  for (const cmd of SHELL_COMMANDS) {
    const regex = new RegExp(`\\b(${cmd})\\b`, 'g')
    highlighted = highlighted.replace(regex, `${syntaxColors.keyword}$1${syntaxColors.reset}`)
  }

  return highlighted
}

/**
 * Highlight package names like @scope/package or package-name
 */
export function highlightPackages(text: string): string {
  // Match npm package names: @scope/package or package-name
  const packageRegex = /(@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+|\b[\w-]+@[\d.]+)/g
  return text.replace(packageRegex, (match) => {
    return `${syntaxColors.package}${match}${syntaxColors.reset}`
  })
}

/**
 * Highlight markdown code blocks with syntax highlighting
 */
export function highlightCodeBlocks(text: string): string {
  // Match ```lang\ncode\n``` blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g

  return text.replace(codeBlockRegex, (match, lang, code) => {
    // Highlight the opening fence
    let result = `${syntaxColors.codeBlock}\`\`\`${lang || ''}${syntaxColors.reset}\n`

    // Apply language-specific highlighting
    const highlightedCode = highlightCodeBlockContent(code, lang)
    result += highlightedCode

    // Highlight the closing fence
    result += `${syntaxColors.codeBlock}\`\`\`${syntaxColors.reset}`

    return result
  })
}

/**
 * Highlight code block content based on language
 */
function highlightCodeBlockContent(code: string, lang?: string): string {
  let highlighted = code

  // Bash/shell highlighting
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
    highlighted = highlightShellCommands(highlighted)
    highlighted = highlightComments(highlighted)
    highlighted = highlightStrings(highlighted)
    return highlighted
  }

  // JavaScript/TypeScript highlighting
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    highlighted = highlightComments(highlighted)
    highlighted = highlightStrings(highlighted)
    highlighted = highlightKeywords(highlighted)
    highlighted = highlightNumbers(highlighted)
    return highlighted
  }

  // Generic highlighting for other languages
  highlighted = highlightComments(highlighted)
  highlighted = highlightStrings(highlighted)
  highlighted = highlightKeywords(highlighted)
  highlighted = highlightNumbers(highlighted)

  return highlighted
}

/**
 * Apply comprehensive syntax highlighting to text
 * Applies all highlighting rules in the correct order
 */
export function applySyntaxHighlight(text: string): string {
  if (!text) return text

  let highlighted = text

  // Order matters: highlight specific patterns first, then broader patterns

  // 0. Code blocks (must be first to avoid interfering with content inside)
  highlighted = highlightCodeBlocks(highlighted)

  // 1. File references (must be before paths to handle file.ts:123)
  highlighted = highlightFileRefs(highlighted)

  // 2. Paths
  highlighted = highlightPaths(highlighted)

  // 3. Packages (npm packages)
  highlighted = highlightPackages(highlighted)

  // 4. Titles
  highlighted = highlightTitles(highlighted)

  // 5. Comments (before keywords to avoid highlighting keywords in comments)
  highlighted = highlightComments(highlighted)

  // 6. Strings
  highlighted = highlightStrings(highlighted)

  // 7. Shell commands
  highlighted = highlightShellCommands(highlighted)

  // 8. Keywords
  highlighted = highlightKeywords(highlighted)

  // 9. Numbers
  highlighted = highlightNumbers(highlighted)

  return highlighted
}

/**
 * Apply syntax highlighting only to specific elements (more conservative)
 */
export function applyLightSyntaxHighlight(text: string): string {
  if (!text) return text

  let highlighted = text

  // Only highlight paths and file references
  highlighted = highlightFileRefs(highlighted)
  highlighted = highlightPaths(highlighted)

  return highlighted
}

/**
 * Strip all ANSI color codes from text
 * Handles multiple ANSI escape sequence formats
 */
export function stripAnsiColors(text: string): string {
  // More comprehensive ANSI removal:
  // \x1b\[[0-9;]*m - standard ANSI sequences
  // \x1b\[[\d;]*[A-Za-z] - all ANSI control sequences
  // \x1b[A-Z] - single char ANSI codes
  return text
    .replace(/\x1b\[[0-9;]*m/g, '')           // Standard color codes
    .replace(/\x1b\[[\d;]*[A-Za-z]/g, '')     // All ANSI CSI sequences
    .replace(/\x1b[A-Z]/g, '')                // Single char sequences
    .replace(/\x1b\([AB0-9]/g, '')            // Character set sequences
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '') // Other control chars
}

/**
 * Colorize entire text block with a specific color
 */
export function colorizeBlock(text: string, color: string): string {
  return `${color}${text}${syntaxColors.reset}`
}
