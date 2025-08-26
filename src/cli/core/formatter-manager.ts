/**
 * Dynamic Formatter Manager
 * Automatically formats code based on language and project standards
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, extname, dirname } from 'path';
import { advancedUI } from '../ui/advanced-cli-ui';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface FormatterConfig {
  enabled: boolean;
  formatOnSave: boolean;
  respectEditorConfig: boolean;
  customFormatters?: Record<string, FormatterDefinition>;
}

export interface FormatterDefinition {
  name: string;
  extensions: string[];
  command: string;
  args: string[];
  configFiles: string[];
  installCommand?: string;
  fallbackFormatter?: (content: string) => string;
}

export interface FormatResult {
  success: boolean;
  formatted: boolean;
  content: string;
  originalContent: string;
  formatter?: string;
  error?: string;
  warnings?: string[];
}

export class FormatterManager {
  private static instance: FormatterManager;
  private config: FormatterConfig;
  private workingDirectory: string;
  private formatters: Map<string, FormatterDefinition> = new Map();

  constructor(workingDirectory: string, config: Partial<FormatterConfig> = {}) {
    this.workingDirectory = workingDirectory;
    this.config = {
      enabled: true,
      formatOnSave: true,
      respectEditorConfig: true,
      ...config
    };
    
    this.initializeFormatters();
  }

  static getInstance(workingDirectory: string, config?: Partial<FormatterConfig>): FormatterManager {
    if (!FormatterManager.instance) {
      FormatterManager.instance = new FormatterManager(workingDirectory, config);
    }
    return FormatterManager.instance;
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
      fallbackFormatter: this.formatTypeScript
    });

    // JSON - Prettier
    this.formatters.set('json', {
      name: 'Prettier',
      extensions: ['.json'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatJSON
    });

    // CSS/SCSS - Prettier
    this.formatters.set('css', {
      name: 'Prettier',
      extensions: ['.css', '.scss', '.sass', '.less'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatCSS
    });

    // Python - Black
    this.formatters.set('python', {
      name: 'Black',
      extensions: ['.py'],
      command: 'black',
      args: [],
      configFiles: ['pyproject.toml', '.black'],
      installCommand: 'pip install black',
      fallbackFormatter: this.formatPython
    });

    // Rust - rustfmt
    this.formatters.set('rust', {
      name: 'rustfmt',
      extensions: ['.rs'],
      command: 'rustfmt',
      args: [],
      configFiles: ['rustfmt.toml', '.rustfmt.toml'],
      installCommand: 'rustup component add rustfmt',
      fallbackFormatter: this.formatRust
    });

    // Go - gofmt
    this.formatters.set('go', {
      name: 'gofmt',
      extensions: ['.go'],
      command: 'gofmt',
      args: ['-w'],
      configFiles: [],
      installCommand: 'go install golang.org/x/tools/cmd/goimports@latest',
      fallbackFormatter: this.formatGo
    });

    // HTML - Prettier
    this.formatters.set('html', {
      name: 'Prettier',
      extensions: ['.html', '.htm'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatHTML
    });

    // Markdown - Prettier
    this.formatters.set('markdown', {
      name: 'Prettier',
      extensions: ['.md', '.markdown'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatMarkdown
    });

    // YAML - Prettier
    this.formatters.set('yaml', {
      name: 'Prettier',
      extensions: ['.yml', '.yaml'],
      command: 'npx',
      args: ['prettier', '--write'],
      configFiles: ['.prettierrc'],
      installCommand: 'npm install --save-dev prettier',
      fallbackFormatter: this.formatYAML
    });

    // Add custom formatters from config
    if (this.config.customFormatters) {
      for (const [key, formatter] of Object.entries(this.config.customFormatters)) {
        this.formatters.set(key, formatter);
      }
    }
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
        originalContent: content
      };
    }

    const ext = extname(filePath).toLowerCase();
    const formatter = this.getFormatterForExtension(ext);

    if (!formatter) {
      return {
        success: true,
        formatted: false,
        content,
        originalContent: content,
        warnings: [`No formatter available for ${ext} files`]
      };
    }

    advancedUI.logInfo(`🎨 Formatting ${filePath} with ${formatter.name}...`);

    try {
      // Try external formatter first
      const externalResult = await this.tryExternalFormatter(content, filePath, formatter);
      if (externalResult.success) {
        return externalResult;
      }

      // Fallback to built-in formatter
      if (formatter.fallbackFormatter) {
        advancedUI.logInfo(`🔄 Using fallback formatter for ${ext}...`);
        const formattedContent = formatter.fallbackFormatter(content);
        
        return {
          success: true,
          formatted: formattedContent !== content,
          content: formattedContent,
          originalContent: content,
          formatter: `${formatter.name} (fallback)`,
          warnings: externalResult.error ? [`External formatter failed: ${externalResult.error}`] : undefined
        };
      }

      return {
        success: false,
        formatted: false,
        content,
        originalContent: content,
        error: `No formatter available for ${ext}`,
        formatter: formatter.name
      };

    } catch (error: any) {
      return {
        success: false,
        formatted: false,
        content,
        originalContent: content,
        error: error.message,
        formatter: formatter.name
      };
    }
  }

  /**
   * Try to use external formatter command
   */
  private async tryExternalFormatter(content: string, filePath: string, formatter: FormatterDefinition): Promise<FormatResult> {
    try {
      // Check if formatter is available
      try {
        await execAsync(`which ${formatter.command}`);
      } catch {
        // Try to install if install command provided
        if (formatter.installCommand) {
          advancedUI.logInfo(`📦 Installing ${formatter.name}...`);
          await execAsync(formatter.installCommand, { cwd: this.workingDirectory });
        } else {
          return {
            success: false,
            formatted: false,
            content,
            originalContent: content,
            error: `${formatter.command} not found and no install command provided`
          };
        }
      }

      // Write content to temp file
      const tempFile = join(this.workingDirectory, `.temp_format_${Date.now()}${extname(filePath)}`);
      writeFileSync(tempFile, content, 'utf-8');

      try {
        // Execute formatter
        const args = [...formatter.args, tempFile];
        const command = `${formatter.command} ${args.join(' ')}`;
        
        await execAsync(command, { cwd: this.workingDirectory });

        // Read formatted content
        const formattedContent = readFileSync(tempFile, 'utf-8');

        return {
          success: true,
          formatted: formattedContent !== content,
          content: formattedContent,
          originalContent: content,
          formatter: formatter.name
        };

      } finally {
        // Clean up temp file
        try {
          const fs = await import('fs/promises');
          await fs.unlink(tempFile);
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
        error: error.message
      };
    }
  }

  /**
   * Get formatter for file extension
   */
  private getFormatterForExtension(ext: string): FormatterDefinition | null {
    for (const formatter of this.formatters.values()) {
      if (formatter.extensions.includes(ext)) {
        return formatter;
      }
    }
    return null;
  }

  /**
   * Detect project formatting configuration
   */
  detectProjectConfig(filePath: string): Record<string, any> {
    const dir = dirname(filePath);
    const configs: Record<string, any> = {};

    // Check for Prettier config
    const prettierConfigs = ['.prettierrc', '.prettierrc.js', '.prettierrc.json', 'prettier.config.js'];
    for (const config of prettierConfigs) {
      const configPath = join(dir, config);
      if (existsSync(configPath)) {
        try {
          if (config.endsWith('.json') || config === '.prettierrc') {
            configs.prettier = JSON.parse(readFileSync(configPath, 'utf-8'));
          }
        } catch {
          // Ignore parsing errors
        }
        break;
      }
    }

    // Check for EditorConfig
    const editorConfigPath = join(dir, '.editorconfig');
    if (existsSync(editorConfigPath)) {
      configs.editorconfig = readFileSync(editorConfigPath, 'utf-8');
    }

    // Check for ESLint config
    const eslintConfigs = ['.eslintrc.js', '.eslintrc.json', '.eslintrc.yml'];
    for (const config of eslintConfigs) {
      const configPath = join(dir, config);
      if (existsSync(configPath)) {
        configs.eslint = configPath;
        break;
      }
    }

    return configs;
  }

  // Fallback formatters (built-in)

  private formatTypeScript = (content: string): string => {
    // Basic TypeScript formatting
    return content
      .replace(/;\s*\n\s*\n+/g, ';\n\n') // Normalize line spacing after semicolons
      .replace(/{\s*\n\s*\n+/g, '{\n') // Remove extra lines after opening braces
      .replace(/\n\s*\n+}/g, '\n}') // Remove extra lines before closing braces
      .replace(/,\s*\n\s*\n+/g, ',\n') // Normalize line spacing after commas
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines to max 2
  };

  private formatJSON = (content: string): string => {
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return content; // Return original if parsing fails
    }
  };

  private formatCSS = (content: string): string => {
    return content
      .replace(/{\s*\n\s*\n+/g, '{\n  ') // Format opening braces
      .replace(/;\s*\n\s*\n+/g, ';\n  ') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/,\s*\n\s*\n+/g, ',\n') // Format commas
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines
  };

  private formatPython = (content: string): string => {
    return content
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive empty lines
      .replace(/:\s*\n\s*\n+/g, ':\n') // Format colons
      .replace(/,\s*\n\s*\n+/g, ',\n'); // Format commas
  };

  private formatRust = (content: string): string => {
    return content
      .replace(/{\s*\n\s*\n+/g, '{\n    ') // Format opening braces with 4-space indent
      .replace(/;\s*\n\s*\n+/g, ';\n') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines
  };

  private formatGo = (content: string): string => {
    return content
      .replace(/{\s*\n\s*\n+/g, '{\n\t') // Format opening braces with tabs
      .replace(/;\s*\n\s*\n+/g, ';\n') // Format semicolons
      .replace(/\n\s*\n+}/g, '\n}') // Format closing braces
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines
  };

  private formatHTML = (content: string): string => {
    return content
      .replace(/>\s*\n\s*\n+</g, '>\n<') // Remove extra lines between tags
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines
  };

  private formatMarkdown = (content: string): string => {
    return content
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{4,}/g, '\n\n\n') // Limit consecutive empty lines to max 3
      .replace(/^(#{1,6})\s+/gm, '$1 ') // Ensure space after headers
      .replace(/\*\s+/g, '* ') // Normalize list formatting
      .replace(/-\s+/g, '- '); // Normalize list formatting
  };

  private formatYAML = (content: string): string => {
    return content
      .replace(/:\s*\n\s*\n+/g, ':\n') // Format colons
      .replace(/\s+$/gm, '') // Remove trailing whitespace
      .replace(/\n{3,}/g, '\n\n'); // Limit consecutive empty lines
  };

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<FormatterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): FormatterConfig {
    return { ...this.config };
  }

  /**
   * Get available formatters
   */
  getAvailableFormatters(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Register custom formatter
   */
  registerFormatter(name: string, formatter: FormatterDefinition): void {
    this.formatters.set(name, formatter);
  }
}

// Export singleton instance factory
export const createFormatterManager = (workingDirectory: string, config?: Partial<FormatterConfig>) => {
  return FormatterManager.getInstance(workingDirectory, config);
};