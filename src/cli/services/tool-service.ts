import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ExecutionPolicyManager, ToolApprovalRequest } from '../policies/execution-policy';
import { ApprovalSystem, ApprovalRequest, ApprovalResponse } from '../ui/approval-system';
import { simpleConfigManager } from '../core/config-manager';
import { ContentValidators } from '../tools/write-file-tool';

export interface ToolExecution {
  id: string;
  toolName: string;
  args: any;
  startTime: Date;
  endTime?: Date;
  status: 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface ToolCapability {
  name: string;
  description: string;
  category: 'file' | 'command' | 'analysis' | 'git' | 'package';
  handler: (args: any) => Promise<any>;
}

export class ToolService {
  private tools: Map<string, ToolCapability> = new Map();
  private executions: Map<string, ToolExecution> = new Map();
  private workingDirectory: string = process.cwd();
  private policyManager: ExecutionPolicyManager;
  private approvalSystem: ApprovalSystem;

  constructor() {
    this.policyManager = new ExecutionPolicyManager(simpleConfigManager);
    this.approvalSystem = new ApprovalSystem({
      autoApprove: {
        lowRisk: false,
        mediumRisk: false,
        fileOperations: false,
        packageInstalls: false,
      },
      requireConfirmation: {
        destructiveOperations: true,
        networkRequests: true,
        systemCommands: true,
      },
      timeout: 30000, // 30 seconds timeout
    });
    this.registerDefaultTools();
  }

  setWorkingDirectory(dir: string): void {
    this.workingDirectory = dir;
  }

  private registerDefaultTools(): void {
    // File operations
    this.registerTool({
      name: 'read_file',
      description: 'Read file contents',
      category: 'file',
      handler: this.readFile.bind(this)
    });

    this.registerTool({
      name: 'write_file', 
      description: 'Write content to file',
      category: 'file',
      handler: this.writeFile.bind(this)
    });

    this.registerTool({
      name: 'list_files',
      description: 'List files in directory',
      category: 'file',
      handler: this.listFiles.bind(this)
    });

    this.registerTool({
      name: 'find_files',
      description: 'Find files matching pattern',
      category: 'file',
      handler: this.findFiles.bind(this)
    });

    // Command execution
    this.registerTool({
      name: 'execute_command',
      description: 'Execute shell command',
      category: 'command',
      handler: this.executeCommand.bind(this)
    });

    // Git operations
    this.registerTool({
      name: 'git_status',
      description: 'Get git repository status',
      category: 'git',
      handler: this.gitStatus.bind(this)
    });

    this.registerTool({
      name: 'git_diff',
      description: 'Get git diff',
      category: 'git', 
      handler: this.gitDiff.bind(this)
    });

    // Package management
    this.registerTool({
      name: 'npm_install',
      description: 'Install npm package',
      category: 'package',
      handler: this.npmInstall.bind(this)
    });

    // Project analysis
    this.registerTool({
      name: 'analyze_project',
      description: 'Analyze project structure',
      category: 'analysis',
      handler: this.analyzeProject.bind(this)
    });
  }

  registerTool(tool: ToolCapability): void {
    this.tools.set(tool.name, tool);
    console.log(chalk.dim(`🔧 Registered tool: ${tool.name}`));
  }

  /**
   * Execute tool with security checks and approval process
   */
  async executeToolSafely(toolName: string, operation: string, args: any): Promise<any> {
    try {
      // Check if approval is needed
      const approvalRequest = await this.policyManager.shouldApproveToolOperation(toolName, operation, args);
      
      if (approvalRequest) {
        // Request user approval
        const approval = await this.requestToolApproval(approvalRequest);
        
        if (!approval.approved) {
          await this.policyManager.logPolicyDecision(
            `tool:${toolName}`, 
            'denied', 
            { operation, args, userComments: approval.userComments }
          );
          throw new Error(`Operation cancelled by user: ${toolName} - ${operation}`);
        }

        // Log approval decision
        await this.policyManager.logPolicyDecision(
          `tool:${toolName}`, 
          'requires_approval', 
          { operation, args, approved: true, userComments: approval.userComments }
        );

        // Add to session approvals if requested
        if (approval.userComments?.includes('approve-session')) {
          this.policyManager.addSessionApproval(toolName, operation);
        }
      } else {
        // Log auto-approval
        await this.policyManager.logPolicyDecision(
          `tool:${toolName}`, 
          'allowed', 
          { operation, args, reason: 'auto-approved by policy' }
        );
      }

      // Execute the tool
      return await this.executeTool(toolName, args);

    } catch (error: any) {
      // Log execution error
      await this.policyManager.logPolicyDecision(
        `tool:${toolName}`, 
        'denied', 
        { operation, args, error: error.message }
      );
      throw error;
    }
  }

  /**
   * Request approval for tool operation
   */
  private async requestToolApproval(toolRequest: ToolApprovalRequest): Promise<ApprovalResponse> {
    const approvalRequest: ApprovalRequest = {
      id: `tool-${Date.now()}`,
      title: `Tool Operation: ${toolRequest.toolName}`,
      description: `Operation: ${toolRequest.operation}\n\nRisk Level: ${toolRequest.riskAssessment.level}\n\nReasons:\n${toolRequest.riskAssessment.reasons.map(r => `• ${r}`).join('\n')}`,
      riskLevel: toolRequest.riskAssessment.level === 'low' ? 'low' :
                 toolRequest.riskAssessment.level === 'medium' ? 'medium' : 'high',
      actions: [{
        type: this.getActionType(toolRequest.toolName),
        description: `Execute ${toolRequest.toolName} with operation: ${toolRequest.operation}`,
        details: toolRequest.args,
        riskLevel: toolRequest.riskAssessment.level === 'low' ? 'low' :
                   toolRequest.riskAssessment.level === 'medium' ? 'medium' : 'high'
      }],
      context: {
        workingDirectory: this.workingDirectory,
        affectedFiles: toolRequest.riskAssessment.affectedFiles,
        estimatedDuration: 5000, // 5 seconds default
      },
      timeout: simpleConfigManager.getAll().sessionSettings.approvalTimeoutMs
    };

    return await this.approvalSystem.requestApproval(approvalRequest);
  }

  /**
   * Map tool name to approval action type
   */
  private getActionType(toolName: string): 'file_create' | 'file_modify' | 'file_delete' | 'command_execute' | 'package_install' | 'network_request' {
    if (toolName.includes('write') || toolName.includes('create')) return 'file_create';
    if (toolName.includes('edit') || toolName.includes('modify')) return 'file_modify';
    if (toolName.includes('delete') || toolName.includes('remove')) return 'file_delete';
    if (toolName.includes('install') || toolName.includes('package')) return 'package_install';
    if (toolName.includes('network') || toolName.includes('fetch')) return 'network_request';
    return 'command_execute';
  }

  async executeTool(toolName: string, args: any): Promise<any> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found`);
    }

    const execution: ToolExecution = {
      id: Date.now().toString(),
      toolName,
      args,
      startTime: new Date(),
      status: 'running'
    };

    this.executions.set(execution.id, execution);

    try {
      console.log(chalk.blue(`🔧 Executing ${toolName}...`));
      
      const result = await tool.handler(args);
      
      execution.endTime = new Date();
      execution.status = 'completed';
      execution.result = result;

      const duration = execution.endTime.getTime() - execution.startTime.getTime();
      console.log(chalk.green(`✅ ${toolName} completed (${duration}ms)`));

      return result;
    } catch (error: any) {
      execution.endTime = new Date();
      execution.status = 'failed';
      execution.error = error.message;

      console.log(chalk.red(`❌ ${toolName} failed: ${error.message}`));
      throw error;
    }
  }

  /**
   * Get available tools (original method for compatibility)
   */
  getAvailableTools(): ToolCapability[] {
    return Array.from(this.tools.values());
  }

  getExecutionHistory(): ToolExecution[] {
    return Array.from(this.executions.values());
  }

  // Tool implementations
  private async readFile(args: {filePath: string}): Promise<{content: string; size: number}> {
    const fullPath = path.resolve(this.workingDirectory, args.filePath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${args.filePath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    return {
      content,
      size: content.length
    };
  }

  private async writeFile(args: {filePath: string; content: string}): Promise<{written: boolean; size: number}> {
    const fullPath = path.resolve(this.workingDirectory, args.filePath);
    const dir = path.dirname(fullPath);
    
    // Validate content using Claude Code best practices
    const pathValidation = await ContentValidators.noAbsolutePaths(args.content, args.filePath);
    if (!pathValidation.isValid) {
      throw new Error(`Content validation failed: ${pathValidation.errors.join(', ')}`);
    }
    
    const versionValidation = await ContentValidators.noLatestVersions(args.content, args.filePath);
    if (versionValidation.warnings && versionValidation.warnings.length > 0) {
      console.log(`⚠️  ${versionValidation.warnings.join(', ')}`);
    }
    
    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, args.content, 'utf8');
    
    // Show relative path in logs
    const relativePath = args.filePath.startsWith(this.workingDirectory) 
      ? args.filePath.replace(this.workingDirectory, '').replace(/^\//, '')
      : args.filePath;
    
    console.log(chalk.green(`✅ File written: ${relativePath} (${args.content.length} bytes)`));
    
    return {
      written: true,
      size: args.content.length
    };
  }

  private async listFiles(args: {path?: string}): Promise<{files: Array<{name: string; type: 'file' | 'directory'; size?: number}>}> {
    const targetPath = path.resolve(this.workingDirectory, args.path || '.');
    
    if (!fs.existsSync(targetPath)) {
      throw new Error(`Directory not found: ${args.path || '.'}`);
    }

    const items = fs.readdirSync(targetPath, { withFileTypes: true });
    const files = items.map(item => {
      const result: any = {
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file'
      };

      if (item.isFile()) {
        try {
          const stats = fs.statSync(path.join(targetPath, item.name));
          result.size = stats.size;
        } catch {
          // Ignore stat errors
        }
      }

      return result;
    });

    return { files };
  }

  private async findFiles(args: {pattern: string; path?: string}): Promise<{matches: string[]}> {
    const searchPath = path.resolve(this.workingDirectory, args.path || '.');
    const matches: string[] = [];

    const searchRecursive = (dir: string) => {
      try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const item of items) {
          const fullPath = path.join(dir, item.name);
          const relativePath = path.relative(this.workingDirectory, fullPath);
          
          if (item.isDirectory()) {
            searchRecursive(fullPath);
          } else if (item.name.includes(args.pattern) || relativePath.includes(args.pattern)) {
            matches.push(relativePath);
          }
        }
      } catch {
        // Ignore directory access errors
      }
    };

    searchRecursive(searchPath);
    return { matches };
  }

  private async executeCommand(args: {command: string; timeout?: number}): Promise<{stdout: string; stderr: string; exitCode: number}> {
    try {
      const result = execSync(args.command, {
        cwd: this.workingDirectory,
        encoding: 'utf8',
        timeout: args.timeout || 30000
      });

      return {
        stdout: result.toString(),
        stderr: '',
        exitCode: 0
      };
    } catch (error: any) {
      return {
        stdout: error.stdout?.toString() || '',
        stderr: error.stderr?.toString() || error.message,
        exitCode: error.status || 1
      };
    }
  }

  private async gitStatus(args: {}): Promise<{status: string; files: Array<{path: string; status: string}>}> {
    try {
      const result = execSync('git status --porcelain', {
        cwd: this.workingDirectory,
        encoding: 'utf8'
      });

      const files = result.trim().split('\\n').filter(line => line).map(line => {
        const status = line.slice(0, 2);
        const path = line.slice(3);
        return { path, status };
      });

      return {
        status: files.length > 0 ? 'dirty' : 'clean',
        files
      };
    } catch (error) {
      throw new Error('Not a git repository or git not available');
    }
  }

  private async gitDiff(args: {staged?: boolean}): Promise<{diff: string}> {
    try {
      const command = args.staged ? 'git diff --cached' : 'git diff';
      const result = execSync(command, {
        cwd: this.workingDirectory,
        encoding: 'utf8'
      });

      return { diff: result };
    } catch (error) {
      throw new Error('Failed to get git diff');
    }
  }

  private async npmInstall(args: {package?: string; dev?: boolean}): Promise<{installed: string[]; error?: string}> {
    try {
      let command = 'npm install';
      
      if (args.package) {
        command += ` ${args.package}`;
        if (args.dev) {
          command += ' --save-dev';
        }
      }

      const result = execSync(command, {
        cwd: this.workingDirectory,
        encoding: 'utf8'
      });

      return {
        installed: args.package ? [args.package] : ['dependencies'],
      };
    } catch (error: any) {
      return {
        installed: [],
        error: error.message
      };
    }
  }

  private async analyzeProject(args: {}): Promise<{
    name: string;
    type: string;
    languages: string[];
    fileCount: number;
    structure: any;
  }> {
    try {
      // Read package.json if available
      let projectName = path.basename(this.workingDirectory);
      let projectType = 'unknown';
      
      try {
        const packageJsonPath = path.join(this.workingDirectory, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
          projectName = packageJson.name || projectName;
          projectType = 'node';
        }
      } catch {
        // Ignore package.json errors
      }

      // Detect languages
      const languages = new Set<string>();
      let fileCount = 0;

      const analyzeDir = (dir: string, depth = 0) => {
        if (depth > 3) return; // Limit recursion depth
        
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          
          for (const item of items) {
            if (item.name.startsWith('.')) continue;
            
            const fullPath = path.join(dir, item.name);
            
            if (item.isDirectory()) {
              analyzeDir(fullPath, depth + 1);
            } else {
              fileCount++;
              const ext = path.extname(item.name);
              
              // Map extensions to languages
              const langMap: Record<string, string> = {
                '.js': 'JavaScript',
                '.ts': 'TypeScript',
                '.tsx': 'TypeScript',
                '.jsx': 'JavaScript',
                '.py': 'Python',
                '.rs': 'Rust',
                '.go': 'Go',
                '.java': 'Java',
                '.cpp': 'C++',
                '.c': 'C'
              };
              
              if (langMap[ext]) {
                languages.add(langMap[ext]);
              }
            }
          }
        } catch {
          // Ignore directory access errors
        }
      };

      analyzeDir(this.workingDirectory);

      return {
        name: projectName,
        type: projectType,
        languages: Array.from(languages),
        fileCount,
        structure: {} // Could be expanded
      };
    } catch (error: any) {
      throw new Error(`Failed to analyze project: ${error.message}`);
    }
  }

  /**
   * Enable developer mode for current session
   */
  enableDevMode(timeoutMs?: number): void {
    this.policyManager.enableDevMode(timeoutMs);
    console.log(chalk.yellow('🛠️ Developer mode enabled - reduced security restrictions'));
  }

  /**
   * Check if developer mode is active
   */
  isDevModeActive(): boolean {
    return this.policyManager.isDevModeActive();
  }

  /**
   * Get current security mode status
   */
  getSecurityStatus(): {
    mode: string;
    devModeActive: boolean;
    sessionApprovals: number;
    toolPolicies: { name: string; risk: string; requiresApproval: boolean }[];
  } {
    const config = simpleConfigManager.getAll();
    const toolsWithSecurity = this.getAvailableToolsWithSecurity();

    return {
      mode: config.securityMode,
      devModeActive: this.isDevModeActive(),
      sessionApprovals: this.policyManager['sessionApprovals'].size,
      toolPolicies: toolsWithSecurity.map(tool => ({
        name: tool.name,
        risk: tool.riskLevel || 'unknown',
        requiresApproval: tool.requiresApproval || false
      }))
    };
  }

  /**
   * Clear all session approvals
   */
  clearSessionApprovals(): void {
    this.policyManager.clearSessionApprovals();
    console.log(chalk.blue('🔄 Session approvals cleared'));
  }

  /**
   * Add a tool to session approvals
   */
  addSessionApproval(toolName: string, operation: string): void {
    this.policyManager.addSessionApproval(toolName, operation);
    console.log(chalk.green(`✅ Added session approval for ${toolName}:${operation}`));
  }

  /**
   * Get available tools with their security status
   */
  getAvailableToolsWithSecurity(): Array<{
    name: string;
    description: string;
    category: string;
    riskLevel?: string;
    requiresApproval?: boolean;
    allowedInSafeMode?: boolean;
  }> {
    return Array.from(this.tools.values()).map(tool => {
      const policy = this.policyManager.getToolPolicy(tool.name);
      return {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        riskLevel: policy?.riskLevel,
        requiresApproval: policy?.requiresApproval,
        allowedInSafeMode: policy?.allowedInSafeMode
      };
    });
  }
}

export const toolService = new ToolService();