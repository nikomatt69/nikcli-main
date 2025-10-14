import chalk from 'chalk'
import { secureTools } from './secure-tools-registry'
import { ToolsManager } from './tools-manager'
import { advancedUI } from '../ui/advanced-cli-ui'

/**
 * Migration script to safely transition from unsafe ToolsManager to SecureToolsRegistry
 * This provides backward compatibility while encouraging secure practices
 */
export class ToolsMigration {
  private legacyToolsManager: ToolsManager
  private migrationWarnings: string[] = []

  constructor(workingDir?: string) {
    this.legacyToolsManager = new ToolsManager(workingDir)
  }

  /**
   * Show migration warning for unsafe operations
   */
  private showMigrationWarning(operation: string, secureAlternative: string): void {
    const warning = `⚠️  DEPRECATED: ${operation} - Use ${secureAlternative} instead`

    if (!this.migrationWarnings.includes(warning)) {
      advancedUI.logFunctionUpdate('info', chalk.yellow(warning))
      advancedUI.logFunctionUpdate('info', chalk.gray('   This operation lacks security controls and will be removed in future versions.'))
      this.migrationWarnings.push(warning)
    }
  }

  /**
   * Secure wrapper for file reading
   */
  async readFile(filePath: string) {
    advancedUI.logFunctionUpdate('info', chalk.blue('⚡︎ Migrating to secure file reading...'))
    return await secureTools.readFile(filePath)
  }

  /**
   * Secure wrapper for file writing with deprecation warning
   */
  async writeFile(filePath: string, content: string, skipConfirmation: boolean = false) {
    if (skipConfirmation) {
      this.showMigrationWarning('writeFile without confirmation', 'secureTools.writeFile() with user confirmation')
    }

    advancedUI.logFunctionUpdate('info', chalk.blue('⚡︎ Migrating to secure file writing...'))
    return await secureTools.writeFile(filePath, content, { skipConfirmation })
  }

  /**
   * Secure wrapper for directory listing
   */
  async listFiles(directory: string = '.', pattern?: RegExp) {
    advancedUI.logFunctionUpdate('info', chalk.blue('⚡︎ Migrating to secure directory listing...'))
    const result = await secureTools.listDirectory(directory, { pattern })

    // Convert to legacy format for backward compatibility
    return [...result.data!.files, ...result.data!.directories]
  }

  /**
   * BLOCKED: Unsafe command execution
   */
  async runCommand(command: string, args: string[] = [], _options: any = {}) {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct command execution is not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() instead for safe command execution'))
    advancedUI.logFunctionUpdate('info', chalk.gray(`Attempted command: ${command} ${args.join(' ')}`))

    throw new Error(
      'Direct command execution blocked for security. Use secureTools.executeCommand() with proper confirmation.'
    )
  }

  /**
   * BLOCKED: Unsafe command streaming
   */
  async runCommandStream(_command: string, _options: any = {}) {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct command streaming is not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() instead for safe command execution'))

    throw new Error(
      'Direct command streaming blocked for security. Use secureTools.executeCommand() with proper confirmation.'
    )
  }

  /**
   * BLOCKED: Package installation without confirmation
   */
  async installPackage(packageName: string, _options: any = {}) {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Automatic package installation is not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() with npm/yarn commands and user confirmation'))
    advancedUI.logFunctionUpdate('info', chalk.gray(`Attempted package: ${packageName}`))

    throw new Error(
      'Automatic package installation blocked for security. Use secureTools.executeCommand() with proper confirmation.'
    )
  }

  /**
   * Safe wrapper for search operations
   */
  async searchInFiles(query: string | RegExp, directory: string = '.', filePattern?: RegExp) {
    advancedUI.logFunctionUpdate('info', chalk.blue('⚡︎ Using legacy search (consider implementing secure search)...'))
    this.showMigrationWarning('searchInFiles', 'secureTools with grep command execution')

    return await this.legacyToolsManager.searchInFiles(query, directory, filePattern)
  }

  /**
   * Safe wrapper for project analysis
   */
  async analyzeProject() {
    advancedUI.logFunctionUpdate('info', chalk.blue('⚡︎ Using legacy project analysis...'))
    this.showMigrationWarning('analyzeProject', 'secureTools.listDirectory() with analysis logic')

    return await this.legacyToolsManager.analyzeProject()
  }

  /**
   * BLOCKED: Build operations without confirmation
   */
  async build(framework?: string): Promise<{ success: boolean; output: string; errors?: any[] }> {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct build operations are not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() with build commands and user confirmation'))
    advancedUI.logFunctionUpdate('info', chalk.gray(`Attempted framework: ${framework || 'auto-detect'}`))

    return {
      success: false,
      output:
        'Direct build operations blocked for security. Use secureTools.executeCommand() with proper confirmation.',
      errors: [
        {
          type: 'security',
          severity: 'error',
          message: 'Direct build operations are not allowed for security reasons',
        },
      ],
    }
  }

  /**
   * BLOCKED: Test execution without confirmation
   */
  async runTests(testPattern?: string): Promise<{ success: boolean; output: string; errors?: any[] }> {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct test execution is not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() with test commands and user confirmation'))
    advancedUI.logFunctionUpdate('info', chalk.gray(`Attempted pattern: ${testPattern || 'all tests'}`))

    return {
      success: false,
      output: 'Direct test execution blocked for security. Use secureTools.executeCommand() with proper confirmation.',
      errors: [
        {
          type: 'security',
          severity: 'error',
          message: 'Direct test execution is not allowed for security reasons',
        },
      ],
    }
  }

  /**
   * BLOCKED: Lint operations without confirmation
   */
  async lint(filePath?: string): Promise<{ success: boolean; output: string; errors?: any[] }> {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct lint operations are not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() with lint commands and user confirmation'))
    advancedUI.logFunctionUpdate('info', chalk.gray(`Attempted file: ${filePath || 'all files'}`))

    return {
      success: false,
      output: 'Direct lint operations blocked for security. Use secureTools.executeCommand() with proper confirmation.',
      errors: [
        {
          type: 'security',
          severity: 'error',
          message: 'Direct lint operations are not allowed for security reasons',
        },
      ],
    }
  }

  /**
   * BLOCKED: Type checking without confirmation
   */
  async typeCheck(): Promise<{ success: boolean; output: string; errors?: any[] }> {
    advancedUI.logFunctionUpdate('info', chalk.red('🚫 BLOCKED: Direct type checking is not allowed'))
    advancedUI.logFunctionUpdate('info', chalk.yellow('Use secureTools.executeCommand() with TypeScript commands and user confirmation'))

    return {
      success: false,
      output: 'Direct type checking blocked for security. Use secureTools.executeCommand() with proper confirmation.',
      errors: [
        {
          type: 'security',
          severity: 'error',
          message: 'Direct type checking is not allowed for security reasons',
        },
      ],
    }
  }

  /**
   * Show migration summary
   */
  showMigrationSummary(): void {
    advancedUI.logFunctionUpdate('info', chalk.blue.bold('\n⚡︎ Migration Summary'))
    advancedUI.logFunctionUpdate('info', chalk.gray('─'.repeat(50)))

    if (this.migrationWarnings.length === 0) {
      advancedUI.logFunctionUpdate('info', chalk.green('✓ No deprecated operations used'))
    } else {
      advancedUI.logFunctionUpdate('info', chalk.yellow(`⚠️  ${this.migrationWarnings.length} deprecated operations detected:`))
      this.migrationWarnings.forEach((warning) => {
        advancedUI.logFunctionUpdate('info', chalk.gray(`  • ${warning.replace('⚠️  DEPRECATED: ', '')}`))
      })
    }

    advancedUI.logFunctionUpdate('info', chalk.blue('\n💡 Migration Recommendations:'))
    advancedUI.logFunctionUpdate('info', chalk.gray('  • Replace ToolsManager with SecureToolsRegistry'))
    advancedUI.logFunctionUpdate('info', chalk.gray('  • Use secureTools.* methods for all operations'))
    advancedUI.logFunctionUpdate('info', chalk.gray('  • Enable user confirmation for write operations'))
    advancedUI.logFunctionUpdate('info', chalk.gray('  • Use command allow-listing for shell operations'))
  }

  /**
   * Get secure tools instance
   */
  getSecureTools() {
    return secureTools
  }
}

/**
 * Factory function to create a migration-aware tools instance
 * This provides a transition path from ToolsManager to SecureToolsRegistry
 */
export function createSecureToolsManager(workingDir?: string): ToolsMigration {
  advancedUI.logFunctionUpdate('info', chalk.blue('🔒 Creating secure tools manager...'))
  advancedUI.logFunctionUpdate('info', chalk.yellow('⚠️  Legacy ToolsManager operations will show deprecation warnings'))

  return new ToolsMigration(workingDir)
}

/**
 * Direct access to secure tools (recommended)
 */
export { secureTools } from './secure-tools-registry'

/**
 * Legacy export for backward compatibility (deprecated)
 * @deprecated Use secureTools or createSecureToolsManager() instead
 */
export const toolsManager = createSecureToolsManager()
