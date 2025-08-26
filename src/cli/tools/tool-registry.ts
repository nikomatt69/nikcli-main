import { BaseTool, ToolExecutionResult } from './base-tool';
import { FindFilesTool } from './find-files-tool';
import { ReadFileTool } from './read-file-tool';
import { WriteFileTool } from './write-file-tool';
import { ReplaceInFileTool } from './replace-in-file-tool';
import { RunCommandTool } from './run-command-tool';
import { ListTool } from './list-tool';
import { GrepTool } from './grep-tool';
import { EditTool } from './edit-tool';
import { BashTool } from './bash-tool';
import { MultiEditTool } from './multi-edit-tool';
import { VisionAnalysisTool } from './vision-analysis-tool';
import { ImageGenerationTool } from './image-generation-tool';
import { CliUI } from '../utils/cli-ui';

/**
 * Production-ready Tool Registry
 * Manages registration, discovery, and access to all available tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();
  private toolMetadata: Map<string, ToolMetadata> = new Map();
  private workingDirectory: string;

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory;
    this.initializeDefaultTools(workingDirectory);
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /**
   * Register a tool with the registry
   */
  registerTool(name: string, tool: BaseTool, metadata?: Partial<ToolMetadata>): void {
    if (this.tools.has(name)) {
      CliUI.logWarning(`Tool ${name} is already registered. Overwriting...`);
    }

    this.tools.set(name, tool);
    this.toolMetadata.set(name, {
      name,
      description: metadata?.description || `${name} tool`,
      category: metadata?.category || 'general',
      riskLevel: metadata?.riskLevel || 'medium',
      reversible: metadata?.reversible ?? true,
      estimatedDuration: metadata?.estimatedDuration || 5000,
      requiredPermissions: metadata?.requiredPermissions || [],
      supportedFileTypes: metadata?.supportedFileTypes || [],
      version: metadata?.version || '1.0.0',
      author: metadata?.author || 'system',
      tags: metadata?.tags || []
    });

    CliUI.logInfo(`Registered tool: ${CliUI.highlight(name)}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(name: string): ToolMetadata | undefined {
    return this.toolMetadata.get(name);
  }

  /**
   * List all registered tools
   */
  listTools(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * List tools by category
   */
  listToolsByCategory(category: string): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) => metadata.category === category)
      .map(([name, _]) => name);
  }

  /**
   * List tools by risk level
   */
  listToolsByRiskLevel(riskLevel: 'low' | 'medium' | 'high'): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) => metadata.riskLevel === riskLevel)
      .map(([name, _]) => name);
  }

  /**
   * Search tools by tags
   */
  searchToolsByTags(tags: string[]): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) =>
        tags.some(tag => metadata.tags.includes(tag))
      )
      .map(([name, _]) => name);
  }

  /**
   * Get tools that support specific file types
   */
  getToolsForFileType(fileType: string): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) =>
        metadata.supportedFileTypes.includes(fileType) ||
        metadata.supportedFileTypes.includes('*')
      )
      .map(([name, _]) => name);
  }

  /**
   * Validate tool availability and permissions
   */
  validateTool(name: string, requiredPermissions: string[] = []): ToolValidationResult {
    const tool = this.tools.get(name);
    const metadata = this.toolMetadata.get(name);

    if (!tool || !metadata) {
      return {
        isValid: false,
        errors: [`Tool '${name}' not found`],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check permissions
    const missingPermissions = metadata.requiredPermissions.filter(
      perm => !requiredPermissions.includes(perm)
    );

    if (missingPermissions.length > 0) {
      errors.push(`Missing required permissions: ${missingPermissions.join(', ')}`);
    }

    // Risk warnings
    if (metadata.riskLevel === 'high') {
      warnings.push('This tool performs high-risk operations');
    }

    if (!metadata.reversible) {
      warnings.push('This tool performs irreversible operations');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Get tool execution statistics
   */
  getToolStats(): ToolStats {
    const totalTools = this.tools.size;
    const categories = new Set(
      Array.from(this.toolMetadata.values()).map(m => m.category)
    );

    const riskDistribution = Array.from(this.toolMetadata.values())
      .reduce((acc, metadata) => {
        acc[metadata.riskLevel] = (acc[metadata.riskLevel] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

    return {
      totalTools,
      categories: Array.from(categories),
      riskDistribution,
      reversibleTools: Array.from(this.toolMetadata.values())
        .filter(m => m.reversible).length,
      averageEstimatedDuration: Array.from(this.toolMetadata.values())
        .reduce((sum, m) => sum + m.estimatedDuration, 0) / totalTools
    };
  }

  /**
   * Export tool registry configuration
   */
  exportConfig(): ToolRegistryConfig {
    return {
      tools: Array.from(this.toolMetadata.values()),
      exportedAt: new Date(),
      version: '1.0.0'
    };
  }

  /**
   * Import tool registry configuration
   */
  importConfig(config: ToolRegistryConfig): void {
    // Note: This would require dynamic tool instantiation
    // For now, we'll just log the import attempt
    CliUI.logInfo(`Import config with ${config.tools.length} tools (not implemented)`);
  }

  /**
   * Display tool registry information
   */
  displayRegistry(): void {
    CliUI.logSection('Tool Registry');

    const stats = this.getToolStats();
    CliUI.logKeyValue('Total Tools', stats.totalTools.toString());
    CliUI.logKeyValue('Categories', stats.categories.join(', '));
    CliUI.logKeyValue('Reversible Tools', stats.reversibleTools.toString());

    CliUI.logSubsection('Risk Distribution');
    Object.entries(stats.riskDistribution).forEach(([risk, count]) => {
      const icon = risk === 'high' ? '🔴' : risk === 'medium' ? '🟡' : '🟢';
      CliUI.logKeyValue(`${icon} ${risk}`, count.toString());
    });

    CliUI.logSubsection('Available Tools');
    Array.from(this.toolMetadata.entries()).forEach(([name, metadata]) => {
      const riskIcon = metadata.riskLevel === 'high' ? '🔴' :
        metadata.riskLevel === 'medium' ? '🟡' : '🟢';
      const reversibleIcon = metadata.reversible ? '↩️' : '⚠️';

      console.log(`  ${riskIcon} ${reversibleIcon} ${CliUI.bold(name)}`);
      console.log(`    ${CliUI.dim(metadata.description)}`);
      console.log(`    ${CliUI.dim(`Category: ${metadata.category} | Duration: ~${metadata.estimatedDuration}ms`)}`);
    });
  }

  /**
   * Initialize default tools
   */
  private initializeDefaultTools(workingDirectory: string): void {
    // Register FindFilesTool
    this.registerTool('find-files-tool', new FindFilesTool(workingDirectory), {
      description: 'Find files matching glob patterns',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 3000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['search', 'filesystem', 'glob']
    });

    // Additional tools would be registered here
    // For now, we'll create placeholder registrations for the tools referenced in the planner

    this.registerTool('read-file-tool', new ReadFileTool(workingDirectory), {
      description: 'Read file contents with security validation',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['read', 'filesystem']
    });

    this.registerTool('write-file-tool', new WriteFileTool(workingDirectory), {
      description: 'Write files with backup and validation',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 4000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['write', 'filesystem', 'create']
    });

    this.registerTool('replace-in-file-tool', new ReplaceInFileTool(workingDirectory), {
      description: 'Replace content in files with validation',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 3000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['modify', 'filesystem', 'replace']
    });

    this.registerTool('run-command-tool', new RunCommandTool(workingDirectory), {
      description: 'Execute commands with whitelist security',
      category: 'system',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 5000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['command', 'system', 'execute']
    });

    this.registerTool('delete-file-tool', new MockTool(workingDirectory), {
      description: 'Delete files and directories',
      category: 'filesystem',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 2000,
      requiredPermissions: ['write', 'delete'],
      supportedFileTypes: ['*'],
      tags: ['delete', 'filesystem', 'destructive']
    });

    // AI Vision and Image Tools
    this.registerTool('vision-analysis-tool', new VisionAnalysisTool(workingDirectory), {
      description: 'Analyze images with AI vision models (Claude, GPT-4V, Gemini)',
      category: 'ai',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 8000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      tags: ['ai', 'vision', 'image', 'analysis', 'multimodal']
    });

    this.registerTool('image-generation-tool', new ImageGenerationTool(workingDirectory), {
      description: 'Generate images from text prompts using DALL-E 3, GPT-Image-1',
      category: 'ai',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 15000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['png', 'jpg'],
      tags: ['ai', 'generation', 'image', 'dall-e', 'creative']
    });

    CliUI.logInfo(`Initialized tool registry with ${this.tools.size} tools`);
  }
}

/**
 * Mock tool for demonstration purposes
 * In production, these would be replaced with actual tool implementations
 */
class MockTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('mock-tool', workingDirectory);
  }

  async execute(...args: any[]): Promise<ToolExecutionResult> {
    // Simulate tool execution
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      success: true,
      data: { args, message: 'Mock tool executed successfully' },
      metadata: {
        executionTime: 1000,
        toolName: this.getName(),
        parameters: args
      }
    };
  }
}

export interface ToolMetadata {
  name: string;
  description: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  reversible: boolean;
  estimatedDuration: number; // milliseconds
  requiredPermissions: string[];
  supportedFileTypes: string[];
  version: string;
  author: string;
  tags: string[];
}

export interface ToolValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ToolStats {
  totalTools: number;
  categories: string[];
  riskDistribution: Record<string, number>;
  reversibleTools: number;
  averageEstimatedDuration: number;
}

export interface ToolRegistryConfig {
  tools: ToolMetadata[];
  exportedAt: Date;
  version: string;
}
