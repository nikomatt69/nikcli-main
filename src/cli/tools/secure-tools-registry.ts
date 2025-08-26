import chalk from 'chalk';
import {
  ReadFileTool,
  WriteFileTool,
  ListDirectoryTool,
  ReplaceInFileTool,
  sanitizePath
} from './secure-file-tools';
export type { BatchSession } from './secure-command-tool';
import { FindFilesTool } from './find-files-tool';
import { BatchSession, CommandResult, SecureCommandTool } from '.';

/**
 * Tool execution context with security metadata
 */
export interface ToolContext {
  workingDirectory: string;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  securityLevel: 'safe' | 'confirmed' | 'dangerous';
}

/**
 * Tool execution result with security tracking
 */
export interface ToolResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  context: ToolContext;
  executionTime: number;
  securityChecks: {
    pathValidated: boolean;
    userConfirmed: boolean;
    commandAnalyzed?: boolean;
  };
}

/**
 * Secure tools registry that provides sandboxed, confirmed operations
 * Replaces the unsafe ToolsManager with security-first approach
 */
export class SecureToolsRegistry {
  private workingDirectory: string;
  private readFileTool: ReadFileTool;
  private writeFileTool: WriteFileTool;
  private listDirectoryTool: ListDirectoryTool;
  private replaceInFileTool: ReplaceInFileTool;
  private secureCommandTool: SecureCommandTool;
  private findFilesTool: FindFilesTool;
  private executionHistory: ToolResult[] = [];

  constructor(workingDir?: string) {
    this.workingDirectory = workingDir || process.cwd();

    // Initialize secure tools
    this.readFileTool = new ReadFileTool(this.workingDirectory);
    this.writeFileTool = new WriteFileTool(this.workingDirectory);
    this.listDirectoryTool = new ListDirectoryTool(this.workingDirectory);
    this.replaceInFileTool = new ReplaceInFileTool(this.workingDirectory);
    this.secureCommandTool = new SecureCommandTool(this.workingDirectory);
    this.findFilesTool = new FindFilesTool(this.workingDirectory);

    console.log(chalk.green('🔒 Secure Tools Registry initialized'));
    console.log(chalk.gray(`📁 Working directory: ${this.workingDirectory}`));
  }

  /**
   * Create a tool execution context
   */
  private createContext(securityLevel: 'safe' | 'confirmed' | 'dangerous' = 'safe'): ToolContext {
    return {
      workingDirectory: this.workingDirectory,
      timestamp: new Date(),
      securityLevel,
    };
  }

  /**
   * Execute a tool with security tracking
   */
  private async executeWithTracking<T>(
    toolName: string,
    operation: () => Promise<T>,
    context: ToolContext,
    securityChecks: ToolResult['securityChecks']
  ): Promise<ToolResult<T>> {
    const startTime = Date.now();

    try {
      console.log(chalk.blue(`🔧 Executing tool: ${toolName}`));

      const data = await operation();
      const executionTime = Date.now() - startTime;

      const result: ToolResult<T> = {
        success: true,
        data,
        context,
        executionTime,
        securityChecks,
      };

      this.executionHistory.push(result);
      console.log(chalk.green(`✅ Tool completed: ${toolName} (${executionTime}ms)`));

      return result;

    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      const result: ToolResult<T> = {
        success: false,
        error: error.message,
        context,
        executionTime,
        securityChecks,
      };

      this.executionHistory.push(result);
      console.log(chalk.red(`❌ Tool failed: ${toolName} - ${error.message}`));

      throw error;
    }
  }

  /**
   * Secure file reading with path validation
   */
  async readFile(filePath: string): Promise<ToolResult<{
    path: string;
    content: string;
    size: number;
    modified: Date;
    extension: string;
  }>> {
    const context = this.createContext('safe');

    return this.executeWithTracking(
      'ReadFile',
      () => this.readFileTool.execute(filePath),
      context,
      { pathValidated: true, userConfirmed: false }
    );
  }

  /**
   * Secure file writing with user confirmation
   */
  async writeFile(
    filePath: string,
    content: string,
    options: {
      skipConfirmation?: boolean;
      createDirectories?: boolean;
    } = {}
  ): Promise<ToolResult<void>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed');

    return this.executeWithTracking(
      'WriteFile',
      () => this.writeFileTool.execute(filePath, content, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation
      }
    );
  }

  /**
   * Secure directory listing with path validation
   */
  async listDirectory(
    directoryPath: string = '.',
    options: {
      recursive?: boolean;
      includeHidden?: boolean;
      pattern?: RegExp;
    } = {}
  ): Promise<ToolResult<{
    files: string[];
    directories: string[];
    total: number;
  }>> {
    const context = this.createContext('safe');

    return this.executeWithTracking(
      'ListDirectory',
      () => this.listDirectoryTool.execute(directoryPath, options),
      context,
      { pathValidated: true, userConfirmed: false }
    );
  }

  /**
   * Secure file content replacement with user confirmation
   */
  async replaceInFile(
    filePath: string,
    replacements: Array<{
      find: string | RegExp;
      replace: string;
      global?: boolean;
    }>,
    options: {
      skipConfirmation?: boolean;
      createBackup?: boolean;
    } = {}
  ): Promise<ToolResult<{
    replacements: number;
    backup?: string;
  }>> {
    const context = this.createContext(options.skipConfirmation ? 'safe' : 'confirmed');

    return this.executeWithTracking(
      'ReplaceInFile',
      () => this.replaceInFileTool.execute(filePath, replacements, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation
      }
    );
  }

  /**
   * Secure file finding with path validation
   */
  async findFiles(pattern: string, options: { cwd?: string } = {}): Promise<ToolResult<string[]>> {
    const context = this.createContext('safe');

    return this.executeWithTracking(
      'FindFiles',
      async () => {
        const result = await this.findFilesTool.execute(pattern, options);
        return result.data as string[];
      },
      context,
      { pathValidated: true, userConfirmed: false }
    );
  }

  /**
   * Secure command execution with allow-listing and confirmation
   */
  async executeCommand(
    command: string,
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
      skipConfirmation?: boolean;
      allowDangerous?: boolean;
    } = {}
  ): Promise<ToolResult<CommandResult>> {
    const context = this.createContext(
      options.allowDangerous ? 'dangerous' :
        options.skipConfirmation ? 'safe' : 'confirmed'
    );

    return this.executeWithTracking(
      'ExecuteCommand',
      () => this.secureCommandTool.execute(command, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true
      }
    );
  }

  /**
   * Execute multiple commands in sequence with confirmation
   */
  async executeCommandSequence(
    commands: string[],
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
      skipConfirmation?: boolean;
      allowDangerous?: boolean;
    } = {}
  ): Promise<ToolResult<CommandResult[]>> {
    const context = this.createContext(
      options.allowDangerous ? 'dangerous' :
        options.skipConfirmation ? 'safe' : 'confirmed'
    );

    return this.executeWithTracking(
      'ExecuteCommandSequence',
      () => this.secureCommandTool.executeSequence(commands, options),
      context,
      {
        pathValidated: true,
        userConfirmed: !options.skipConfirmation,
        commandAnalyzed: true
      }
    );
  }

  /**
   * Create a batch session for one-time approval of multiple commands
   */
  async createBatchSession(
    commands: string[],
    options: {
      sessionDuration?: number;
      allowDangerous?: boolean;
      onProgress?: (command: string, index: number, total: number) => void;
      onComplete?: (results: CommandResult[]) => void;
      onError?: (error: Error, command: string, index: number) => void;
    } = {}
  ): Promise<ToolResult<BatchSession>> {
    const context = this.createContext(
      options.allowDangerous ? 'dangerous' : 'confirmed'
    );

    return this.executeWithTracking(
      'CreateBatchSession',
      () => this.secureCommandTool.createBatchSession(commands, options),
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true
      }
    );
  }

  /**
   * Execute a batch session asynchronously
   */
  async executeBatchAsync(
    sessionId: string,
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    } = {}
  ): Promise<ToolResult<void>> {
    const context = this.createContext('confirmed');

    return this.executeWithTracking(
      'ExecuteBatchAsync',
      () => this.secureCommandTool.executeBatchAsync(sessionId, options),
      context,
      {
        pathValidated: true,
        userConfirmed: true,
        commandAnalyzed: true
      }
    );
  }

  /**
   * Get batch session status
   */
  getBatchSession(sessionId: string): BatchSession | undefined {
    return this.secureCommandTool.getBatchSession(sessionId);
  }

  /**
   * List all batch sessions
   */
  listBatchSessions(): BatchSession[] {
    return this.secureCommandTool.listBatchSessions();
  }

  /**
   * Clean up expired batch sessions
   */
  cleanupExpiredSessions(): number {
    return this.secureCommandTool.cleanupExpiredSessions();
  }

  /**
   * Validate a file path without executing any operation
   */
  validatePath(filePath: string): { valid: boolean; safePath?: string; error?: string } {
    try {
      const safePath = sanitizePath(filePath, this.workingDirectory);
      return { valid: true, safePath };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check if a command would be safe to execute
   */
  checkCommand(command: string): {
    safe: boolean;
    analysis: {
      safe: boolean;
      dangerous: boolean;
      risks: string[];
      suggestions: string[];
    };
  } {
    return this.secureCommandTool.checkCommand(command);
  }

  /**
   * Get execution history with optional filtering
   */
  getExecutionHistory(options: {
    limit?: number;
    toolName?: string;
    securityLevel?: 'safe' | 'confirmed' | 'dangerous';
    successOnly?: boolean;
  } = {}): ToolResult[] {
    let history = this.executionHistory.slice().reverse();

    if (options.securityLevel) {
      history = history.filter(result => result.context.securityLevel === options.securityLevel);
    }

    if (options.successOnly) {
      history = history.filter(result => result.success);
    }

    if (options.limit) {
      history = history.slice(0, options.limit);
    }

    return history;
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalOperations: number;
    safeOperations: number;
    confirmedOperations: number;
    dangerousOperations: number;
    failedOperations: number;
    pathValidationRate: number;
    userConfirmationRate: number;
  } {
    const total = this.executionHistory.length;
    const safe = this.executionHistory.filter(r => r.context.securityLevel === 'safe').length;
    const confirmed = this.executionHistory.filter(r => r.context.securityLevel === 'confirmed').length;
    const dangerous = this.executionHistory.filter(r => r.context.securityLevel === 'dangerous').length;
    const failed = this.executionHistory.filter(r => !r.success).length;
    const pathValidated = this.executionHistory.filter(r => r.securityChecks.pathValidated).length;
    const userConfirmed = this.executionHistory.filter(r => r.securityChecks.userConfirmed).length;

    return {
      totalOperations: total,
      safeOperations: safe,
      confirmedOperations: confirmed,
      dangerousOperations: dangerous,
      failedOperations: failed,
      pathValidationRate: total > 0 ? pathValidated / total : 0,
      userConfirmationRate: total > 0 ? userConfirmed / total : 0,
    };
  }

  /**
   * Print security summary
   */
  printSecuritySummary(): void {
    const stats = this.getSecurityStats();

    console.log(chalk.blue.bold('\n🔒 Security Summary'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`Total Operations: ${stats.totalOperations}`));
    console.log(chalk.green(`Safe Operations: ${stats.safeOperations}`));
    console.log(chalk.yellow(`Confirmed Operations: ${stats.confirmedOperations}`));
    console.log(chalk.red(`Dangerous Operations: ${stats.dangerousOperations}`));
    console.log(chalk.red(`Failed Operations: ${stats.failedOperations}`));
    console.log(chalk.blue(`Path Validation Rate: ${(stats.pathValidationRate * 100).toFixed(1)}%`));
    console.log(chalk.blue(`User Confirmation Rate: ${(stats.userConfirmationRate * 100).toFixed(1)}%`));
  }
}

// Export singleton instance
export const secureTools = new SecureToolsRegistry();
