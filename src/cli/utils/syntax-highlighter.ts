import chalk from 'chalk'
import hljs from 'highlight.js'
import { marked } from 'marked'
import TerminalRenderer from 'marked-terminal'

/**
 * Configure syntax highlighting for terminal output
 */
export function configureSyntaxHighlighting(): void {
  // Configure highlighted renderer for terminal
  const highlightedRenderer = new TerminalRenderer({
    code: (code: string, language?: string) => {
      if (language && hljs.getLanguage(language)) {
        try {
          const highlighted = hljs.highlight(code, { language }).value
          // Convert HTML tags to ANSI colors for terminal
          return highlighted
            .replace(/<span class="hljs-keyword">/g, chalk.magenta(''))
            .replace(/<span class="hljs-string">/g, chalk.green(''))
            .replace(/<span class="hljs-comment">/g, chalk.gray(''))
            .replace(/<span class="hljs-number">/g, chalk.cyan(''))
            .replace(/<span class="hljs-function">/g, chalk.blue(''))
            .replace(/<span class="hljs-variable">/g, chalk.yellow(''))
            .replace(/<span class="hljs-type">/g, chalk.blue(''))
            .replace(/<span class="hljs-title">/g, chalk.bold(''))
            .replace(/<span class="hljs-attr">/g, chalk.cyan(''))
            .replace(/<span class="hljs-built_in">/g, chalk.magenta(''))
            .replace(/<span class="hljs-class">/g, chalk.blue.bold(''))
            .replace(/<span class="hljs-name">/g, chalk.blue.bold(''))
            .replace(/<span class="hljs-params">/g, chalk.white(''))
            .replace(/<span class="hljs-literal">/g, chalk.cyan(''))
            .replace(/<span class="hljs-selector-tag">/g, chalk.red(''))
            .replace(/<span class="hljs-selector-class">/g, chalk.yellow(''))
            .replace(/<span class="hljs-selector-id">/g, chalk.blue(''))
            .replace(/<span class="hljs-property">/g, chalk.cyan(''))
            .replace(/<span class="hljs-tag">/g, chalk.red(''))
            .replace(/<span class="hljs-regexp">/g, chalk.red(''))
            .replace(/<\/span>/g, chalk.reset(''))
            .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
        } catch (_err) {
          // Fall back to plain code if highlighting fails
          return code
        }
      }
      return code
    },
  }) as any

  // Configure marked for terminal rendering with syntax highlighting
  marked.setOptions({
    renderer: highlightedRenderer,
  })
}

/**
 * Highlight code snippet directly (useful for inline highlighting)
 */
export function highlightCode(code: string, language?: string): string {
  if (language && hljs.getLanguage(language)) {
    try {
      const highlighted = hljs.highlight(code, { language }).value
      return highlighted
        .replace(/<span class="hljs-keyword">/g, chalk.magenta(''))
        .replace(/<span class="hljs-string">/g, chalk.green(''))
        .replace(/<span class="hljs-comment">/g, chalk.gray(''))
        .replace(/<span class="hljs-number">/g, chalk.cyan(''))
        .replace(/<span class="hljs-function">/g, chalk.blue(''))
        .replace(/<span class="hljs-variable">/g, chalk.yellow(''))
        .replace(/<span class="hljs-type">/g, chalk.blue(''))
        .replace(/<span class="hljs-title">/g, chalk.bold(''))
        .replace(/<span class="hljs-attr">/g, chalk.cyan(''))
        .replace(/<span class="hljs-built_in">/g, chalk.magenta(''))
        .replace(/<span class="hljs-class">/g, chalk.blue.bold(''))
        .replace(/<span class="hljs-name">/g, chalk.blue.bold(''))
        .replace(/<span class="hljs-params">/g, chalk.white(''))
        .replace(/<span class="hljs-literal">/g, chalk.cyan(''))
        .replace(/<span class="hljs-selector-tag">/g, chalk.red(''))
        .replace(/<span class="hljs-selector-class">/g, chalk.yellow(''))
        .replace(/<span class="hljs-selector-id">/g, chalk.blue(''))
        .replace(/<span class="hljs-property">/g, chalk.cyan(''))
        .replace(/<span class="hljs-tag">/g, chalk.red(''))
        .replace(/<span class="hljs-regexp">/g, chalk.red(''))
        .replace(/<\/span>/g, chalk.reset(''))
        .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
    } catch (_err) {
      return code
    }
  }
  // Try auto-detection
  try {
    const highlighted = hljs.highlightAuto(code).value
    return highlighted
      .replace(/<span class="hljs-keyword">/g, chalk.magenta(''))
      .replace(/<span class="hljs-string">/g, chalk.green(''))
      .replace(/<span class="hljs-comment">/g, chalk.gray(''))
      .replace(/<span class="hljs-number">/g, chalk.cyan(''))
      .replace(/<span class="hljs-function">/g, chalk.blue(''))
      .replace(/<span class="hljs-variable">/g, chalk.yellow(''))
      .replace(/<span class="hljs-type">/g, chalk.blue(''))
      .replace(/<span class="hljs-title">/g, chalk.bold(''))
      .replace(/<span class="hljs-attr">/g, chalk.cyan(''))
      .replace(/<span class="hljs-built_in">/g, chalk.magenta(''))
      .replace(/<span class="hljs-class">/g, chalk.blue.bold(''))
      .replace(/<span class="hljs-name">/g, chalk.blue.bold(''))
      .replace(/<span class="hljs-params">/g, chalk.white(''))
      .replace(/<span class="hljs-literal">/g, chalk.cyan(''))
      .replace(/<span class="hljs-selector-tag">/g, chalk.red(''))
      .replace(/<span class="hljs-selector-class">/g, chalk.yellow(''))
      .replace(/<span class="hljs-selector-id">/g, chalk.blue(''))
      .replace(/<span class="hljs-property">/g, chalk.cyan(''))
      .replace(/<span class="hljs-tag">/g, chalk.red(''))
      .replace(/<span class="hljs-regexp">/g, chalk.red(''))
      .replace(/<\/span>/g, chalk.reset(''))
      .replace(/<[^>]*>/g, '')
  } catch (_err) {
    return code
  }
}
