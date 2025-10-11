/**
 * Blessed tags syntax highlighting for terminal output
 * Uses blessed tag syntax for highlighting paths, keywords, and other elements
 */

/**
 * Blessed color tags for syntax highlighting
 */
export const blessedSyntaxColors = {
  path: 'cyan-fg',
  lineNumber: 'yellow-fg',
  keyword: 'magenta-fg',
  string: 'green-fg',
  number: 'yellow-fg',
  comment: 'gray-fg',
  title: 'bright-cyan-fg',
  error: 'red-fg',
  success: 'green-fg',
  warning: 'yellow-fg',
  darkGray: 'gray-fg',
  // Extended palette
  link: 'blue-fg',
  info: 'bright-blue-fg',
  debug: 'gray-fg',
  httpMethod: 'bright-magenta-fg',
  diffAdd: 'green-fg',
  diffRemove: 'red-fg',
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
 * Highlight file paths in text using blessed tags
 * Matches: /path/to/file.ts, ./relative/path.js, ~/home/path
 */
export function highlightPathsBlessed(text: string): string {
  const pathRegex = /(?:^|\s)((?:\/|\.\/|\.\.\/|~\/)[^\s:]+)/g
  return text.replace(pathRegex, (match, path) => {
    return match.replace(path, `{${blessedSyntaxColors.path}}${path}{/${blessedSyntaxColors.path}}`)
  })
}

/**
 * Highlight file references with line numbers using blessed tags
 * Matches: file.ts:123, /path/to/file.js:45:10
 */
export function highlightFileRefsBlessed(text: string): string {
  const fileRefRegex = /((?:\/|\.\/|\.\.\/)?[^\s:]+\.\w+)(:\d+(?::\d+)?)/g
  return text.replace(fileRefRegex, (match, file, location) => {
    return `{${blessedSyntaxColors.path}}${file}{/${blessedSyntaxColors.path}}{${blessedSyntaxColors.lineNumber}}${location}{/${blessedSyntaxColors.lineNumber}}`
  })
}

/**
 * Highlight URLs and email addresses using blessed tags
 */
export function highlightLinksBlessed(text: string): string {
  let highlighted = text

  // URLs (http, https, ftp, and www.)
  const urlRegex = /(https?:\/\/[^\s)]+|ftp:\/\/[^\s)]+|www\.[^\s)]+)/g
  highlighted = highlighted.replace(urlRegex, (m) => {
    return `{${blessedSyntaxColors.link}}{underline}${m}{/underline}{/${blessedSyntaxColors.link}}`
  })

  // Email addresses
  const emailRegex = /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g
  highlighted = highlighted.replace(emailRegex, (m) => {
    return `{${blessedSyntaxColors.link}}{underline}${m}{/underline}{/${blessedSyntaxColors.link}}`
  })

  return highlighted
}

/**
 * Highlight programming keywords using blessed tags
 */
export function highlightKeywordsBlessed(text: string): string {
  let highlighted = text

  for (const keyword of KEYWORDS) {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g')
    highlighted = highlighted.replace(regex, `{${blessedSyntaxColors.keyword}}$1{/${blessedSyntaxColors.keyword}}`)
  }

  return highlighted
}

/**
 * Highlight CLI flags like --option and -o
 */
export function highlightCliFlagsBlessed(text: string): string {
  let highlighted = text
  // Long flags --flag, --flag=value
  highlighted = highlighted.replace(/\B--[A-Za-z0-9][\w-]*(?:=[^\s]+)?/g, (m) => {
    return `{${blessedSyntaxColors.lineNumber}}${m}{/${blessedSyntaxColors.lineNumber}}`
  })
  // Short flags -f or combined -abc
  highlighted = highlighted.replace(/\B-[A-Za-z]+\b/g, (m) => {
    return `{${blessedSyntaxColors.lineNumber}}${m}{/${blessedSyntaxColors.lineNumber}}`
  })
  return highlighted
}

/**
 * Highlight markdown-style titles using blessed tags
 * Matches: # Title, ## Subtitle, etc.
 */
export function highlightTitlesBlessed(text: string): string {
  const titleRegex = /^(#{1,6})\s+(.+)$/gm
  return text.replace(titleRegex, (match, hashes, title) => {
    return `{${blessedSyntaxColors.title}}${hashes} ${title}{/${blessedSyntaxColors.title}}`
  })
}

/**
 * Highlight JSON keys and literals (true/false/null)
 */
export function highlightJsonBlessed(text: string): string {
  let highlighted = text
  // JSON keys: "key": value
  highlighted = highlighted.replace(/("[A-Za-z_][\w-]*")\s*:/g, (_m, key) => {
    return `{${blessedSyntaxColors.keyword}}${key}{/${blessedSyntaxColors.keyword}}:`
  })
  // true / false / null (naive, may catch outside JSON)
  highlighted = highlighted.replace(/\b(true|false|null)\b/g, (_m, v) => {
    return `{${blessedSyntaxColors.keyword}}${v}{/${blessedSyntaxColors.keyword}}`
  })
  return highlighted
}

/**
 * Highlight string literals in quotes using blessed tags
 */
export function highlightStringsBlessed(text: string): string {
  const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1/g
  return text.replace(stringRegex, (match) => {
    return `{${blessedSyntaxColors.string}}${match}{/${blessedSyntaxColors.string}}`
  })
}

/**
 * Highlight numbers using blessed tags
 */
export function highlightNumbersBlessed(text: string): string {
  const numberRegex = /\b(\d+\.?\d*)\b/g
  return text.replace(numberRegex, `{${blessedSyntaxColors.number}}$1{/${blessedSyntaxColors.number}}`)
}

/**
 * Highlight code comments using blessed tags
 * Matches single-line and multi-line comments, bash comments
 */
export function highlightCommentsBlessed(text: string): string {
  let highlighted = text

  // Bash comments (# comment)
  highlighted = highlighted.replace(
    /(#.*)$/gm,
    (match) => {
      // Avoid highlighting markdown headers
      if (/^#{1,6}\s/.test(match)) return match
      return `{${blessedSyntaxColors.comment}}${match}{/${blessedSyntaxColors.comment}}`
    }
  )

  // Single-line comments
  highlighted = highlighted.replace(
    /(\/\/.*)$/gm,
    `{${blessedSyntaxColors.comment}}$1{/${blessedSyntaxColors.comment}}`
  )

  // Multi-line comments
  highlighted = highlighted.replace(
    /(\/\*[\s\S]*?\*\/)/g,
    `{${blessedSyntaxColors.comment}}$1{/${blessedSyntaxColors.comment}}`
  )

  return highlighted
}

/**
 * Highlight shell/bash commands using blessed tags
 */
export function highlightShellCommandsBlessed(text: string): string {
  let highlighted = text

  for (const cmd of SHELL_COMMANDS) {
    const regex = new RegExp(`\\b(${cmd})\\b`, 'g')
    highlighted = highlighted.replace(regex, `{${blessedSyntaxColors.keyword}}$1{/${blessedSyntaxColors.keyword}}`)
  }

  return highlighted
}

/**
 * Highlight common log levels and status tags
 */
export function highlightLogLevelsBlessed(text: string): string {
  let highlighted = text

  // Bracketed levels like [INFO], [ERROR], [OK]
  highlighted = highlighted.replace(/\[(INFO|DEBUG|TRACE|WARN|WARNING|ERROR|FATAL|SUCCESS|OK)\]/g, (_m, lvl: string) => {
    const level = (lvl as string).toUpperCase()
    const color =
      level === 'ERROR' || level === 'FATAL' ? blessedSyntaxColors.error :
      level === 'WARN' || level === 'WARNING' ? blessedSyntaxColors.warning :
      level === 'SUCCESS' || level === 'OK' ? blessedSyntaxColors.success :
      level === 'DEBUG' || level === 'TRACE' ? blessedSyntaxColors.debug :
      blessedSyntaxColors.info
    return `{${color}}[${level}]{/${color}}`
  })

  // Bare levels as whole words
  highlighted = highlighted.replace(/\b(INFO|DEBUG|TRACE|WARN|WARNING|ERROR|FATAL|SUCCESS|OK)\b/g, (_m, lvl: string) => {
    const level = (lvl as string).toUpperCase()
    const color =
      level === 'ERROR' || level === 'FATAL' ? blessedSyntaxColors.error :
      level === 'WARN' || level === 'WARNING' ? blessedSyntaxColors.warning :
      level === 'SUCCESS' || level === 'OK' ? blessedSyntaxColors.success :
      level === 'DEBUG' || level === 'TRACE' ? blessedSyntaxColors.debug :
      blessedSyntaxColors.info
    return `{${color}}${level}{/${color}}`
  })

  return highlighted
}

/**
 * Highlight HTTP methods and status codes
 */
export function highlightHttpBlessed(text: string): string {
  let highlighted = text

  // Methods (prefer start-of-line or before space + /)
  highlighted = highlighted.replace(/\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b(?![\w-])/g, (_m, method: string) => {
    return `{${blessedSyntaxColors.httpMethod}}{bold}${method}{/bold}{/${blessedSyntaxColors.httpMethod}}`
  })

  // HTTP/x.y 200 or 404 following HTTP marker
  highlighted = highlighted.replace(/HTTP\/((?:1\.[01]|2))\s(\d{3})/g, (_m, ver: string, code: string) => {
    const n = parseInt(code, 10)
    const color = n >= 500 ? blessedSyntaxColors.error : n >= 400 ? blessedSyntaxColors.error : n >= 300 ? blessedSyntaxColors.warning : blessedSyntaxColors.success
    return `HTTP/${ver} ${`{${color}}${code}{/${color}}`}`
  })

  // Trailing status like "200 OK" or "404 Not Found"
  highlighted = highlighted.replace(/\b(\d{3})\b\s+(OK|Created|Accepted|No\s+Content|Moved\s+Permanently|Found|See\s+Other|Not\s+Modified|Temporary\s+Redirect|Permanent\s+Redirect|Bad\s+Request|Unauthorized|Forbidden|Not\s+Found|Method\s+Not\s+Allowed|Conflict|Gone|Too\s+Many\s+Requests|Internal\s+Server\s+Error|Not\s+Implemented|Bad\s+Gateway|Service\s+Unavailable)/gi, (_m, code: string, msg: string) => {
    const n = parseInt(code, 10)
    const color = n >= 500 ? blessedSyntaxColors.error : n >= 400 ? blessedSyntaxColors.error : n >= 300 ? blessedSyntaxColors.warning : blessedSyntaxColors.success
    return `{${color}}${code} ${msg}{/${color}}`
  })

  return highlighted
}

/**
 * Highlight environment variables like $VAR and ${VAR}
 */
export function highlightEnvVarsBlessed(text: string): string {
  return text
    .replace(/\$[A-Z_][A-Z0-9_]*/g, (m) => `{${blessedSyntaxColors.path}}${m}{/${blessedSyntaxColors.path}}`)
    .replace(/\$\{[A-Z_][A-Z0-9_]*\}/g, (m) => `{${blessedSyntaxColors.path}}${m}{/${blessedSyntaxColors.path}}`)
}

/**
 * Highlight IP addresses and ports
 */
export function highlightIPsBlessed(text: string): string {
  let highlighted = text
  highlighted = highlighted.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b(?::\d+)?/g, (m) => {
    return `{${blessedSyntaxColors.path}}${m}{/${blessedSyntaxColors.path}}`
  })
  return highlighted
}

/**
 * Highlight Git commit SHAs (7-40 hex chars)
 */
export function highlightGitShasBlessed(text: string): string {
  return text.replace(/\b[a-f0-9]{7,40}\b/g, (m) => {
    return `{${blessedSyntaxColors.keyword}}${m}{/${blessedSyntaxColors.keyword}}`
  })
}

/**
 * Highlight code-frame style lines: 12 | code
 */
export function highlightCodeFramesBlessed(text: string): string {
  return text.replace(/^(\s*)(>\s*)?(\d+)\s*\|/gm, (_m, lead: string, arrow: string | undefined, ln: string) => {
    const arrowPart = arrow ? `{${blessedSyntaxColors.comment}}${arrow}{/${blessedSyntaxColors.comment}}` : ''
    const num = `{${blessedSyntaxColors.lineNumber}}${ln}{/${blessedSyntaxColors.lineNumber}}`
    const pipe = `{${blessedSyntaxColors.comment}}|{/${blessedSyntaxColors.comment}}`
    return `${lead}${arrowPart}${num} ${pipe}`
  })
}

/**
 * Highlight diff lines starting with + or -
 */
export function highlightDiffsBlessed(text: string): string {
  return text
    .replace(/^(\+.*)$/gm, (_m, line: string) => `{${blessedSyntaxColors.diffAdd}}${line}{/${blessedSyntaxColors.diffAdd}}`)
    .replace(/^(\-.*)$/gm, (_m, line: string) => `{${blessedSyntaxColors.diffRemove}}${line}{/${blessedSyntaxColors.diffRemove}}`)
}

/**
 * Highlight package names like @scope/package using blessed tags
 */
export function highlightPackagesBlessed(text: string): string {
  // Match npm package names: @scope/package or package-name
  const packageRegex = /(@[\w-]+\/[\w-]+|[\w-]+\/[\w-]+|\b[\w-]+@[\d.]+)/g
  return text.replace(packageRegex, (match) => {
    return `{${blessedSyntaxColors.path}}${match}{/${blessedSyntaxColors.path}}`
  })
}

/**
 * Highlight markdown code blocks with syntax highlighting (blessed tags)
 */
export function highlightCodeBlocksBlessed(text: string): string {
  // Match ```lang\ncode\n``` blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g

  return text.replace(codeBlockRegex, (match, lang, code) => {
    // Highlight the opening fence
    let result = `{${blessedSyntaxColors.path}}\`\`\`${lang || ''}{/${blessedSyntaxColors.path}}\n`

    // Apply language-specific highlighting
    const highlightedCode = highlightCodeBlockContentBlessed(code, lang)
    result += highlightedCode

    // Highlight the closing fence
    result += `{${blessedSyntaxColors.path}}\`\`\`{/${blessedSyntaxColors.path}}`

    return result
  })
}

/**
 * Highlight code block content based on language (blessed tags)
 */
function highlightCodeBlockContentBlessed(code: string, lang?: string): string {
  let highlighted = code

  // Bash/shell highlighting
  if (lang === 'bash' || lang === 'sh' || lang === 'shell') {
    highlighted = highlightShellCommandsBlessed(highlighted)
    highlighted = highlightCommentsBlessed(highlighted)
    highlighted = highlightStringsBlessed(highlighted)
    return highlighted
  }

  // JavaScript/TypeScript highlighting
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    highlighted = highlightCommentsBlessed(highlighted)
    highlighted = highlightStringsBlessed(highlighted)
    highlighted = highlightKeywordsBlessed(highlighted)
    highlighted = highlightNumbersBlessed(highlighted)
    return highlighted
  }

  // Generic highlighting for other languages
  highlighted = highlightCommentsBlessed(highlighted)
  highlighted = highlightStringsBlessed(highlighted)
  highlighted = highlightKeywordsBlessed(highlighted)
  highlighted = highlightNumbersBlessed(highlighted)

  return highlighted
}

/**
 * Apply comprehensive syntax highlighting using blessed tags
 * Applies all highlighting rules in the correct order
 */
export function applySyntaxHighlightBlessed(text: string): string {
  if (!text) return text

  let highlighted = text

  // Order matters: highlight specific patterns first, then broader patterns

  // 0. Code blocks (must be first to avoid interfering with content inside)
  highlighted = highlightCodeBlocksBlessed(highlighted)

  // 1. File references (must be before paths to handle file.ts:123)
  highlighted = highlightFileRefsBlessed(highlighted)

  // 1.5 URLs and emails
  highlighted = highlightLinksBlessed(highlighted)

  // 2. Paths
  highlighted = highlightPathsBlessed(highlighted)

  // 3. Packages (npm packages)
  highlighted = highlightPackagesBlessed(highlighted)

  // 4. Titles
  highlighted = highlightTitlesBlessed(highlighted)

  // 4.5 Code frames and diffs (line-oriented)
  highlighted = highlightCodeFramesBlessed(highlighted)
  highlighted = highlightDiffsBlessed(highlighted)

  // 4.8 Env vars, CLI flags, IPs, SHAs
  highlighted = highlightEnvVarsBlessed(highlighted)
  highlighted = highlightCliFlagsBlessed(highlighted)
  highlighted = highlightIPsBlessed(highlighted)
  highlighted = highlightGitShasBlessed(highlighted)

  // 5. Log levels and HTTP
  highlighted = highlightLogLevelsBlessed(highlighted)
  highlighted = highlightHttpBlessed(highlighted)

  // 5. Comments (before keywords to avoid highlighting keywords in comments)
  highlighted = highlightCommentsBlessed(highlighted)

  // 6. Strings
  highlighted = highlightStringsBlessed(highlighted)

  // 6.5 JSON keys and literals
  highlighted = highlightJsonBlessed(highlighted)

  // 7. Shell commands
  highlighted = highlightShellCommandsBlessed(highlighted)

  // 8. Keywords
  highlighted = highlightKeywordsBlessed(highlighted)

  // 9. Numbers
  highlighted = highlightNumbersBlessed(highlighted)

  return highlighted
}

/**
 * Apply light syntax highlighting using blessed tags (conservative)
 */
export function applyLightSyntaxHighlightBlessed(text: string): string {
  if (!text) return text

  let highlighted = text

  // Only highlight paths and file references
  highlighted = highlightFileRefsBlessed(highlighted)
  highlighted = highlightPathsBlessed(highlighted)
  highlighted = highlightLinksBlessed(highlighted)

  return highlighted
}

/**
 * Colorize entire text block with blessed tag
 */
export function colorizeBlockBlessed(text: string, color: string): string {
  return `{${color}}${text}{/${color}}`
}
