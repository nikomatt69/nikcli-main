/**
 * Dynamic Formatter Manager
 * Automatically formats code based on language and project standards
 */

import { dirname, extname, join } from 'node:path'
import { fileExists, readText, writeText, bunExec } from '../utils/bun-compat'
import { advancedUI } from '../ui/advanced-cli-ui'

export interface FormatterConfig {
  enabled: boolean
  formatOnSave: boolean
  respectEditorConfig: boolean
  customFormatters?: Record<string, FormatterDefinition>
}

export interface FormatterDefinition {
  name: string
  extensions: string[]
  command: string
  args: string[]
  configFiles: string[]
  installCommand?: string
  fallbackFormatter?: (content: string) => string
}

export interface FormatResult {
  success: boolean
  formatted: boolean
  content: string
  originalContent: string
  formatter?: string
  error?: string
  warnings?: string[]
}

export class FormatterManager {
  private static instance: FormatterManager
  private config: FormatterConfig
  private workingDirectory: string
  private formatters: Map<string, FormatterDefinition> = new Map()

  constructor(workingDirectory: string = process.cwd(), config: Partial<FormatterConfig> = {}) {
    this.workingDirectory = workingDirectory
    this.config = {
      enabled: true,
      formatOnSave: true,
      respectEditorConfig: true,
      ...config,
    }

    this.initializeFormatters()
  }

  static getInstance(workingDirectory: string, config?: Partial<FormatterConfig>): FormatterManager {
    if (!FormatterManager.instance) {
      FormatterManager.instance = new FormatterManager(workingDirectory, config)
    }
    return FormatterManager.instance
  }

  /**
   * Initialize built-in formatters for different languages
   */
  private initializeFormatters(): void {
    // TypeScript/JavaScript - Prettier
    this.formatters.set('typescript', {
      name: 'Prettier',
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatTypeScript,
    })

    // JSON - Prettier
    this.formatters.set('json', {
      name: 'Prettier',
      extensions: ['.json'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatJSON,
    })

    // CSS/SCSS - Prettier
    this.formatters.set('css', {
      name: 'Prettier',
      extensions: ['.css', '.scss', '.sass', '.less'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatCSS,
    })

    // Python - Black
    this.formatters.set('python', {
      name: 'Black',
      extensions: ['.py'],
      command: 'black',
      args: [],
      configFiles: ['pyproject.toml', '.black'],
      installCommand: 'pip install black',
      fallbackFormatter: this.formatPython,
    })

    // Rust - rustfmt
    this.formatters.set('rust', {
      name: 'rustfmt',
      extensions: ['.rs'],
      command: 'rustfmt',
      args: [],
      configFiles: ['rustfmt.toml', '.rustfmt.toml'],
      installCommand: 'rustup component add rustfmt',
      fallbackFormatter: this.formatRust,
    })

    // Go - gofmt
    this.formatters.set('go', {
      name: 'gofmt',
      extensions: ['.go'],
      command: 'gofmt',
      args: ['-w'],
      configFiles: [],
      installCommand: 'go install golang.org/x/tools/cmd/goimports@latest',
      fallbackFormatter: this.formatGo,
    })

    // HTML - Prettier
    this.formatters.set('html', {
      name: 'Prettier',
      extensions: ['.html', '.htm'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatHTML,
    })

    // Markdown - Prettier
    this.formatters.set('markdown', {
      name: 'Prettier',
      extensions: ['.md', '.markdown'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatMarkdown,
    })

    // YAML - Prettier
    this.formatters.set('yaml', {
      name: 'Prettier',
      extensions: ['.yml', '.yaml'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatYAML,
    })

    // Add custom formatters from config
    if (this.config.customFormatters) {
      for (const [key, formatter] of Object.entries(this.config.customFormatters)) {
        this.formatters.set(key, formatter)
      }
    }
  }

  /**
   * Detect and fix indentation inconsistencies
   */
  private normalizeIndentation(content: string, filePath: string): string {
    const ext = extname(filePath).toLowerCase()

    // Different indentation rules per language
    if (['.ts', '.tsx', '.js', '.jsx', '.json'].includes(ext)) {
      // TypeScript/JavaScript: prefer 2 spaces
      return content.replace(/^\t+/gm, (match) => '  '.repeat(match.length))
    } else if (['.py'].includes(ext)) {
      // Python: prefer 4 spaces
      return content.replace(/^\t+/gm, (match) => '    '.repeat(match.length))
    } else if (['.go'].includes(ext)) {
      // Go: prefer tabs
      return content.replace(/^ {2,}/gm, (match) => '\t'.repeat(Math.floor(match.length / 2)))
    } else if (['.yml', '.yaml'].includes(ext)) {
      // YAML: prefer 2 spaces, no tabs allowed
      return content.replace(/^\t+/gm, (match) => '  '.repeat(match.length))
    }

    return content
  }

  /**
   * Clean markdown artifacts and common AI generation artifacts from content
   */
  private cleanMarkdownArtifacts(content: string): string {
    return (
      content
        // Remove markdown code blocks
        .replace(/^```[\w]*\s*\n?/i, '') // Remove any markdown code block start
        .replace(/\n```\s*$/i, '') // Remove markdown code block end
        .replace(/```\s*$/i, '') // Remove markdown code block end without newline

        // Remove AI-generated commentary and instructions
        .replace(/^\/\*\*[\s\S]*?\*\/\s*\n?/g, '') // Remove multi-line comments at start
        .replace(/^\/\/\s*Generated by.*\n?/gm, '') // Remove "Generated by" comments
        .replace(/^\/\/\s*AI-generated.*\n?/gm, '') // Remove "AI-generated" comments
        .replace(/^\/\/\s*TODO:.*\n?/gm, '') // Remove TODO comments
        .replace(/^\/\/\s*FIXME:.*\n?/gm, '') // Remove FIXME comments

        // Remove XML/HTML-like instruction tags
        .replace(/<\/?instruction[^>]*>/gi, '') // Remove instruction tags
        .replace(/<\/?comment[^>]*>/gi, '') // Remove comment tags
        .replace(/<\/?note[^>]*>/gi, '') // Remove note tags

        // Clean escaped content artifacts
        .replace(/\\"/g, '"') // Convert escaped quotes
        .replace(/\\'/g, "'") // Convert escaped single quotes
        .replace(/\\\\/g, '\\') // Convert double backslashes

        // Remove excess whitespace patterns
        .replace(/^\s*\n+/g, '') // Remove leading empty lines
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
    ) // Normalize multiple empty lines
  }

  /**
   * Format content based on file path
   */
  async formatContent(content: string, filePath: string): Promise<FormatResult> {
    if (!this.config.enabled) {
      return {
        success: true,
        formatted: false,
        content,
        originalContent: content,
      }
    }

    // Clean markdown artifacts first
    content = this.cleanMarkdownArtifacts(content)

    // Normalize indentation based on file type
    content = this.normalizeIndentation(content, filePath)

    const ext = extname(filePath).toLowerCase()
    const formatter = this.getFormatterForExtension(ext)

    if (!formatter) {
      return {
        success: true,
        formatted: false,
        content,
        originalContent: content,
        warnings: [`No formatter available for ${ext} files`],
      }
    }

    advancedUI.logInfo(`🎨 Formatting ${filePath} with ${formatter.name}...`)

    try {
      // Try external formatter first
      const externalResult = await this.tryExternalFormatter(content, filePath, formatter)
      if (externalResult.success) {
        return externalResult
      }

      // Fallback to built-in formatter
      if (formatter.fallbackFormatter) {
        advancedUI.logInfo(`⚡︎ Using fallback formatter for ${ext}...`)
        const formattedContent = formatter.fallbackFormatter(content)

        return {
          success: true,
          formatted: formattedContent !== content,
          content: formattedContent,
          originalContent: content,
          formatter: `${formatter.name} (fallback)`,
          warnings: externalResult.error ? [`External formatter failed: ${externalResult.error}`] : undefined,
        }
      }

      return {
        success: false,
        formatted: false,
        content,
        originalContent: content,
        error: `No formatter available for ${ext}`,
        formatter: formatter.name,
      }
    } catch (error: any) {
      return {
        success: false,
        formatted: false,
        content,
        originalContent: content,
        error: error.message,
        formatter: formatter.name,
      }
    }
  }

  /**
   * Try to use external formatter command
   */
  private async tryExternalFormatter(
    content: string,
    filePath: string,
    formatter: FormatterDefinition
  ): Promise<FormatResult> {
    try {
      // Check if formatter is available
      const { exitCode: whichExitCode } = await bunExec(`which ${formatter.command}`, { timeout: 3000 })
      if (whichExitCode !== 0) {
        // Try to install if install command provided
        if (formatter.installCommand) {
          advancedUI.logInfo(`📦 Installing ${formatter.name}...`)
          await bunExec(formatter.installCommand, { cwd: this.workingDirectory, timeout: 60000 })
        } else {
          return {
            success: false,
            formatted: false,
            content,
            originalContent: content,
            error: `${formatter.command} not found and no install command provided`,
          }
        }
      }

      // Write content to temp file using Bun
      const tempFile = join(this.workingDirectory, `.temp_format_${Date.now()}${extname(filePath)}`)
      await writeText(tempFile, content)

      try {
        // Execute formatter
        const args = [...formatter.args, tempFile]
        const command = `${formatter.command} ${args.join(' ')}`

        await bunExec(command, { cwd: this.workingDirectory, timeout: 30000 })

        // Read formatted content using Bun
        const formattedContent = await readText(tempFile)

        return {
          success: true,
          formatted: formattedContent !== content,
          content: formattedContent,
          originalContent: content,
          formatter: formatter.name,
        }
      } finally {
        // Clean up temp file using Bun Shell
        try {
          const { $ } = await import('../utils/bun-compat')
          await $`rm -f ${tempFile}`.quiet()
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error: any) {
      return {
        success: false,
        formatted: false,
        content,
        originalContent: content,
        error: error.message,
      }
    }
  }

  /**
   * Get formatter for file extension
   */
  private getFormatterForExtension(ext: string): FormatterDefinition | null {
    for (const formatter of this.formatters.values()) {
      if (formatter.extensions.includes(ext)) {
        return formatter
      }
    }
    return null
  }

  /**
   * Detect project formatting configuration
   */
  async detectProjectConfig(filePath: string): Promise<Record<string, any>> {
    const dir = dirname(filePath)
    const configs: Record<string, any> = {}

    // Check for Prettier config using Bun
    const prettierConfigs = ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js']
    for (const config of prettierConfigs) {
      const configPath = join(dir, config)
      if (await fileExists(configPath)) {
        try {
          if (config.endsWith('.json') || config === '.prettierrc') {
            const content = await readText(configPath)
            configs.prettier = JSON.parse(content)
          }
        } catch {
          // Ignore parsing errors
        }
        break
      }
    }

    // Check for EditorConfig using Bun
    const editorConfigPath = join(dir, '.editorconfig')
    if (await fileExists(editorConfigPath)) {
      configs.editorconfig = await readText(editorConfigPath)
    }

    // Check for ESLint config using Bun
    const eslintConfigs = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml']
    for (const config of eslintConfigs) {
      const configPath = join(dir, config)
      if (await fileExists(configPath)) {
        configs.eslint = configPath
        break
      }
    }

    return configs
  }

  // Fallback formatters (built-in)

  private formatTypeScript = (content: string): string => {
    // Enhanced TypeScript formatting with precision patterns
    return (
      content
        .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
        .replace(/\\t/g, '\t') // Convert literal \t to actual tabs

        // Remove markdown artifacts (more precise patterns)
        .replace(/^```(?:typescript|ts|javascript|js)\s*\n?/i, '')
        .replace(/\n```\s*$/i, '')
        .replace(/```\s*$/i, '')

        // Fix import/export spacing and organization
        .replace(/^(import\s+.*?;)\s*\n\s*\n+/gm, '$1\n') // Single line after imports
        .replace(/^(export\s+.*?;)\s*\n\s*\n+/gm, '$1\n') // Single line after exports
        .replace(/(import[\s\S]*?;)\n\n+(export|interface|class|function|const|let|var)/g, '$1\n\n$2') // Proper spacing between import block and code

        // Fix interface/type/class formatting
        .replace(/^(interface|type|class|enum)\s+([^{]+)\s*{\s*\n\s*\n+/gm, '$1 $2 {\n') // Remove extra lines after opening brace
        .replace(/\n\s*\n+(\s*})/g, '\n$1') // Remove extra lines before closing brace

        // Fix function formatting
        .replace(/^(async\s+)?function\s+([^(]+)\([^)]*\)\s*{\s*\n\s*\n+/gm, '$1function $2() {\n') // Function declarations
        .replace(/=>\s*{\s*\n\s*\n+/g, '=> {\n') // Arrow functions

        // Standard cleanup
        .replace(/;\s*\n\s*\n+/g, ';\n\n') // Normalize line spacing after semicolons
        .replace(/{\s*\n\s*\n+/g, '{\n') // Remove extra lines after opening braces
        .replace(/\n\s*\n+}/g, '\n}') // Remove extra lines before closing braces
        .replace(/,\s*\n\s*\n+/g, ',\n') // Normalize line spacing after commas
        .replace(/\s+$/gm, '') // Remove trailing whitespace
        .replace(/\n{3,}/g, '\n\n')
    ) // Limit consecutive empty lines to max 2
  }

  private formatJSON = (content: string): string => {
    // Clean JSON content before parsing
    const cleanContent = content
      .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t') // Convert literal \t to actual tabs
      .replace(/^```(?:json|jsonc)\s*\n?/i, '') // Remove markdown json code blocks
      .replace(/\n```\s*$/i, '') // Remove markdown code block end
      .replace(/```\s*$/i, '') // Remove markdown code block end without newline
      .replace(/\/\/.*$/gm, '') // Remove single-line comments (non-standard but common)
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
      .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
      .trim()

    try {
      const parsed = JSON.parse(cleanContent)
      return JSON.stringify(parsed, null, 2)
    } catch {
      // If parsing fails, do basic formatting
      return cleanContent
        .replace(/\s+$/gm, '') // Remove trailing whitespace
        .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
    }
  }

  private formatCSS = (content: string): string => {
    return content
      .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t') // Convert literal \t to actual tabs
      .replace(/^```css\s*\n?/i, '') // Remove markdown css code block start
      .replace(/^```scss\s*\n?/i, '') // Remove markdown scss code block start
      .replace(/\n```\s*$/i, '') // Remove markdown code block end
      .replace(/```\s*$/i, '') // Remove markdown code block end without newline
      .replace(/{\s*\n\s*\n+/g, '{\n  ') // Format opening braces
      .replace(/;\s*\n\s*\n+/g, ';\n  ') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/,\s*\n\s*\n+/g, ',\n') // Format commas
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
  }

  private formatPython = (content: string): string => {
    return content
      .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t') // Convert literal \t to actual tabs
      .replace(/^```python\s*\n?/i, '') // Remove markdown python code block start
      .replace(/^```py\s*\n?/i, '') // Remove markdown py code block start
      .replace(/\n```\s*$/i, '') // Remove markdown code block end
      .replace(/```\s*$/i, '') // Remove markdown code block end without newline
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
      .replace(/:\s*\n\s*\n+/g, ':\n') // Format colons
      .replace(/,\s*\n\s*\n+/g, ',\n') // Format commas
  }

  private formatRust = (content: string): string => {
    return content
      .replace(/{\s*\n\s*\n+/g, '{\n    ') // Format opening braces with 4-space indent
      .replace(/;\s*\n\s*\n+/g, ';\n') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
  }

  private formatGo = (content: string): string => {
    return content
      .replace(/{\s*\n\s*\n+/g, '{\n\t') // Format opening braces with tabs
      .replace(/;\s*\n\s*\n+/g, ';\n') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
  }

  private formatHTML = (content: string): string => {
    return content
      .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t') // Convert literal \t to actual tabs
      .replace(/^```html\s*\n?/i, '') // Remove markdown html code block start
      .replace(/^```htm\s*\n?/i, '') // Remove markdown htm code block start
      .replace(/\n```\s*$/i, '') // Remove markdown code block end
      .replace(/```\s*$/i, '') // Remove markdown code block end without newline
      .replace(/>\s*\n\s*\n+</g, '>\n<') // Remove extra lines between tags
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
  }

  private formatMarkdown = (content: string): string => {
    return (
      content
        .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
        .replace(/\\t/g, '\t') // Convert literal \t to actual tabs

        // Fix header formatting with proper spacing
        .replace(/^(#{1,6})\s*/gm, '$1 ') // Ensure single space after headers
        .replace(/^(#{1,6})\s+(.+)\s*\n\s*\n+/gm, '$1 $2\n\n') // Proper spacing after headers

        // Fix list formatting
        .replace(/^(\s*)[*+-]\s+/gm, '$1- ') // Normalize list bullets to dashes
        .replace(/^(\s*)\d+\.\s+/gm, '$1$&') // Keep numbered lists as is
        .replace(/^(\s*-\s+.+)\n\s*\n+(?=\s*-)/gm, '$1\n') // Single line between list items

        // Fix code block formatting
        .replace(/```(\w*)\s*\n\s*\n+/g, '```$1\n') // Remove extra lines after code block start
        .replace(/\n\s*\n+```/g, '\n```') // Remove extra lines before code block end

        // Fix emphasis and bold formatting
        .replace(/\*\*\s+(.+?)\s+\*\*/g, '**$1**') // Remove spaces inside bold
        .replace(/\*\s+(.+?)\s+\*/g, '*$1*') // Remove spaces inside italic
        .replace(/_\s+(.+?)\s+_/g, '_$1_') // Remove spaces inside underscore emphasis

        // Fix link formatting
        .replace(/\[\s+(.+?)\s+\]/g, '[$1]') // Remove spaces inside link text
        .replace(/\]\s*\(\s*(.+?)\s*\)/g, ']($1)') // Remove spaces in link URLs

        // Standard cleanup
        .replace(/\s+$/gm, '') // Remove trailing whitespace
        .replace(/\n{4,}/g, '\n\n\n') // Limit consecutive empty lines to max 3

        // Fix paragraph spacing
        .replace(/^(.+)\n\s*\n\s*\n+(?=[^#\-*`\n])/gm, '$1\n\n')
    ) // Normalize paragraph spacing
  }

  private formatYAML = (content: string): string => {
    return content
      .replace(/\\n/g, '\n') // Convert literal \n to actual newlines
      .replace(/\\t/g, '\t') // Convert literal \t to actual tabs
      .replace(/:\s*\n\s*\n+/g, ':\n') // Format colons
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<FormatterConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  /**
   * Get current configuration
   */
  getConfig(): FormatterConfig {
    return { ...this.config }
  }

  /**
   * Get available formatters
   */
  getAvailableFormatters(): string[] {
    return Array.from(this.formatters.keys())
  }

  /**
   * Register custom formatter
   */
  registerFormatter(name: string, formatter: FormatterDefinition): void {
    this.formatters.set(name, formatter)
  }
}

// Export singleton instance factory
export const createFormatterManager = (workingDirectory: string, config?: Partial<FormatterConfig>) => {
  return FormatterManager.getInstance(workingDirectory, config)
}
