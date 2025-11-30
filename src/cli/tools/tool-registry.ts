import { createBrowserTools } from '../browser/playwright-automation-tools'
import { advancedUI } from '../ui/advanced-cli-ui'
import { CliUI } from '../utils/cli-ui'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import { BashTool } from './bash-tool'
import { BrowserbaseTool } from './browserbase-tool'
import { CoinbaseAgentKitTool } from './coinbase-agentkit-tool'
import { DiffTool } from './diff-tool'
import { EditTool } from './edit-tool'
import { FindFilesTool } from './find-files-tool'
import { GitTools } from './git-tools'
import { GlobTool } from './glob-tool'
import { GoatTool } from './goat-tool'
import { GrepTool } from './grep-tool'
import { ImageGenerationTool } from './image-generation-tool'
import { JsonPatchTool } from './json-patch-tool'
import { ListTool } from './list-tool'
import { MultiEditTool } from './multi-edit-tool'
import { MultiReadTool } from './multi-read-tool'
import { NikDriveTool } from './nikdrive-tool'
import { RAGSearchTool } from './rag-search-tool'
import { ReadFileTool } from './read-file-tool'
import { ReplaceInFileTool } from './replace-in-file-tool'
import { RunCommandTool } from './run-command-tool'
import { TextToCADTool } from './text-to-cad-tool'
import { TextToGCodeTool } from './text-to-gcode-tool'
import { TreeTool } from './tree-tool'
import { VisionAnalysisTool } from './vision-analysis-tool'
import { WatchTool } from './watch-tool'
import { WebSearchTool } from './web-search-tool'
import { WriteFileTool } from './write-file-tool'

/**
 * Production-ready Tool Registry
 * Manages registration, discovery, and access to all available tools
 */
export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map()
  private toolMetadata: Map<string, ToolMetadata> = new Map()
  private workingDirectory: string

  constructor(workingDirectory: string) {
    this.workingDirectory = workingDirectory
    this.initializeDefaultTools(workingDirectory)
  }

  getWorkingDirectory(): string {
    return this.workingDirectory
  }

  /**
   * Register a tool with the registry
   */
  registerTool(name: string, tool: BaseTool, metadata?: Partial<ToolMetadata>): void {
    if (this.tools.has(name)) {
      advancedUI.logWarning(`Tool ${name} is already registered. Overwriting...`)
    }

    this.tools.set(name, tool)
    this.toolMetadata.set(name, {
      name,
      description: metadata?.description || `${name} tool`,
      category: metadata?.category || 'general',
      riskLevel: metadata?.riskLevel || 'medium',
      reversible: metadata?.reversible ?? true,
      estimatedDuration: metadata?.estimatedDuration || 5000,
      requiredPermissions: metadata?.requiredPermissions || [],
      supportedFileTypes: metadata?.supportedFileTypes || [],
      version: metadata?.version || '1.5.0',
      author: metadata?.author || 'system',
      tags: metadata?.tags || [],
    })

    if (!process.env.NIKCLI_SUPPRESS_TOOL_REGISTER_LOGS && !process.env.NIKCLI_QUIET_STARTUP) {
    }
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): BaseTool | undefined {
    return this.tools.get(name)
  }

  /**
   * Get tool metadata
   */
  getToolMetadata(name: string): ToolMetadata | undefined {
    return this.toolMetadata.get(name)
  }

  /**
   * List all registered tools
   */
  listTools(): string[] {
    return Array.from(this.tools.keys())
  }

  /**
   * List tools by category
   */
  listToolsByCategory(category: string): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) => metadata.category === category)
      .map(([name, _]) => name)
  }

  /**
   * List tools by risk level
   */
  listToolsByRiskLevel(riskLevel: 'low' | 'medium' | 'high'): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) => metadata.riskLevel === riskLevel)
      .map(([name, _]) => name)
  }

  /**
   * Search tools by tags
   */
  searchToolsByTags(tags: string[]): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(([_, metadata]) => tags.some((tag) => metadata.tags.includes(tag)))
      .map(([name, _]) => name)
  }

  /**
   * Get tools that support specific file types
   */
  getToolsForFileType(fileType: string): string[] {
    return Array.from(this.toolMetadata.entries())
      .filter(
        ([_, metadata]) => metadata.supportedFileTypes.includes(fileType) || metadata.supportedFileTypes.includes('*')
      )
      .map(([name, _]) => name)
  }

  /**
   * Validate tool availability and permissions
   */
  validateTool(name: string, requiredPermissions: string[] = []): ToolValidationResult {
    const tool = this.tools.get(name)
    const metadata = this.toolMetadata.get(name)

    if (!tool || !metadata) {
      return {
        isValid: false,
        errors: [`Tool '${name}' not found`],
        warnings: [],
      }
    }

    const errors: string[] = []
    const warnings: string[] = []

    // Check permissions
    const missingPermissions = metadata.requiredPermissions.filter((perm) => !requiredPermissions.includes(perm))

    if (missingPermissions.length > 0) {
      errors.push(`Missing required permissions: ${missingPermissions.join(', ')}`)
    }

    // Risk warnings
    if (metadata.riskLevel === 'high') {
      warnings.push('This tool performs high-risk operations')
    }

    if (!metadata.reversible) {
      warnings.push('This tool performs irreversible operations')
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Get tool execution statistics
   */
  getToolStats(): ToolStats {
    const totalTools = this.tools.size
    const categories = new Set(Array.from(this.toolMetadata.values()).map((m) => m.category))

    const riskDistribution = Array.from(this.toolMetadata.values()).reduce(
      (acc, metadata) => {
        acc[metadata.riskLevel] = (acc[metadata.riskLevel] || 0) + 1
        return acc
      },
      {} as Record<string, number>
    )

    return {
      totalTools,
      categories: Array.from(categories),
      riskDistribution,
      reversibleTools: Array.from(this.toolMetadata.values()).filter((m) => m.reversible).length,
      averageEstimatedDuration:
        Array.from(this.toolMetadata.values()).reduce((sum, m) => sum + m.estimatedDuration, 0) / totalTools,
    }
  }

  /**
   * Export tool registry configuration
   */
  exportConfig(): ToolRegistryConfig {
    return {
      tools: Array.from(this.toolMetadata.values()),
      exportedAt: new Date(),
      version: '1.5.0',
    }
  }

  /**
   * Import tool registry configuration
   */
  importConfig(config: ToolRegistryConfig): void {
    // Note: This would require dynamic tool instantiation
    // For now, we'll just log the import attempt
    advancedUI.logInfo(`Import config with ${config.tools.length} tools (not implemented)`)
  }

  /**
   * Display tool registry information
   */
  displayRegistry(): void {
    advancedUI.logInfo('Tool Registry')

    const stats = this.getToolStats()
    advancedUI.logInfo('Total Tools', stats.totalTools.toString())
    advancedUI.logInfo('Categories', stats.categories.join(', '))
    advancedUI.logInfo('Reversible Tools', stats.reversibleTools.toString())

    advancedUI.logInfo('Risk Distribution')
    Object.entries(stats.riskDistribution).forEach(([risk, count]) => {
      const icon = risk === 'high' ? '🔴' : risk === 'medium' ? '🟡' : '🟢'
      advancedUI.logInfo(`${icon} ${risk}`, count.toString())
    })

    advancedUI.logInfo('Available Tools')
    Array.from(this.toolMetadata.entries()).forEach(([name, metadata]) => {
      const riskIcon = metadata.riskLevel === 'high' ? '🔴' : metadata.riskLevel === 'medium' ? '🟡' : '🟢'
      const reversibleIcon = metadata.reversible ? '↩️' : '⚠︎'

      console.log(`  ${riskIcon} ${reversibleIcon} ${CliUI.bold(name)}`)
      console.log(`    ${CliUI.dim(metadata.description)}`)
      console.log(`    ${CliUI.dim(`Category: ${metadata.category} | Duration: ~${metadata.estimatedDuration}ms`)}`)
    })
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
      tags: ['search', 'filesystem', 'glob'],
    })

    // Register GlobTool (fast glob pattern matching)
    this.registerTool('glob-tool', new GlobTool(workingDirectory), {
      description: 'Fast file pattern matching with glob support, sorting, and filtering',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['glob', 'pattern', 'search', 'filesystem', 'matching'],
    })

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
      tags: ['read', 'filesystem'],
    })

    this.registerTool('write-file-tool', new WriteFileTool(workingDirectory), {
      description: 'Write files with backup and validation',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 4000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['write', 'filesystem', 'create'],
    })

    // Web search (online lookup with optional synthesis)
    this.registerTool('web-search-tool', new WebSearchTool(workingDirectory), {
      description: 'Search the web for up-to-date information or documentation',
      category: 'network',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 8000,
      requiredPermissions: ['network'],
      supportedFileTypes: ['*'],
      tags: ['web', 'search', 'online', 'docs', 'stackoverflow'],
    })

    this.registerTool('replace', new ReplaceInFileTool(workingDirectory), {
      description: 'Replace content in files with validation',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 3000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['modify', 'filesystem', 'replace'],
    })

    // Interactive edit tool with diff preview
    this.registerTool('edit', new EditTool(workingDirectory), {
      description: 'Interactive edits with diff preview and backup',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 3500,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['edit', 'diff', 'interactive'],
    })

    // Atomic multi-file edit tool
    this.registerTool('multi-edit-tool', new MultiEditTool(workingDirectory), {
      description: 'Apply multiple edits atomically with diff summaries',
      category: 'filesystem',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 5000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['*'],
      tags: ['batch', 'edit', 'atomic'],
    })

    // Multi read tool
    this.registerTool('multi-read-tool', new MultiReadTool(workingDirectory), {
      description: 'Read multiple files safely with search/context',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 4000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['read', 'batch', 'analysis'],
    })

    // RAG semantic search tool
    this.registerTool('rag-search-tool', new RAGSearchTool(workingDirectory), {
      description: 'Perform semantic search in the RAG system to find relevant code and documentation',
      category: 'search',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 5000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['rag', 'semantic', 'search', 'code', 'documentation'],
    })

    this.registerTool('run-command-tool', new RunCommandTool(workingDirectory), {
      description: 'Execute commands with whitelist security',
      category: 'system',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 5000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['command', 'system', 'execute'],
    })

    // Bash tool (interactive command exec with analysis)
    this.registerTool('bash-tool', new BashTool(workingDirectory), {
      description: 'Execute shell commands with analysis, confirmation and streaming',
      category: 'system',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 6000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['bash', 'shell', 'command', 'execute'],
    })

    // JSON Patch tool (safe structured edits)
    this.registerTool('json-patch-tool', new JsonPatchTool(workingDirectory), {
      description: 'Apply RFC6902-like JSON patches with diff/backup',
      category: 'filesystem',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 2500,
      requiredPermissions: ['write'],
      supportedFileTypes: ['json'],
      tags: ['json', 'patch', 'config'],
    })

    // Git tools (safe wrappers)
    this.registerTool('git-tools', new GitTools(workingDirectory), {
      description: 'Safe Git operations: status, diff, commit, applyPatch (no push)',
      category: 'vcs',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 3000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['git', 'vcs', 'diff', 'commit'],
    })

    this.registerTool('delete-file-tool', new MockTool(workingDirectory), {
      description: 'Delete files and directories',
      category: 'filesystem',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 2000,
      requiredPermissions: ['write', 'delete'],
      supportedFileTypes: ['*'],
      tags: ['delete', 'filesystem', 'destructive'],
    })

    // AI Vision and Image Tools
    this.registerTool('vision-analysis-tool', new VisionAnalysisTool(workingDirectory), {
      description: 'Analyze images with AI vision models (Claude, GPT-4V, Gemini)',
      category: 'ai',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 8000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      tags: ['ai', 'vision', 'image', 'analysis', 'multimodal'],
    })

    this.registerTool('image-generation-tool', new ImageGenerationTool(workingDirectory), {
      description: 'Generate images from text prompts using DALL-E 3, GPT-Image-1',
      category: 'ai',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 15000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['png', 'jpg'],
      tags: ['ai', 'generation', 'image', 'dall-e', 'creative'],
    })

    this.registerTool('coinbase-agentkit-tool', new CoinbaseAgentKitTool(workingDirectory), {
      description: 'Execute blockchain operations using official Coinbase AgentKit',
      category: 'blockchain',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 12000,
      requiredPermissions: ['network', 'execute'],
      supportedFileTypes: ['*'],
      tags: ['blockchain', 'crypto', 'coinbase', 'agentkit', 'defi', 'wallet', 'transactions'],
    })

    this.registerTool('goat-tool', new GoatTool(workingDirectory), {
      description:
        'Execute blockchain operations using GOAT SDK (Polymarket, ERC20) on Polygon and Base with comprehensive help system',
      category: 'blockchain',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 12000,
      requiredPermissions: ['network', 'execute'],
      supportedFileTypes: ['*'],
      tags: ['blockchain', 'crypto', 'goat', 'polymarket', 'erc20', 'polygon', 'base', 'defi', 'help', 'commands'],
    })

    this.registerTool('browserbase-tool', new BrowserbaseTool(workingDirectory), {
      description: 'Web browsing automation and AI-powered content analysis using Browserbase',
      category: 'ai',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 10000,
      requiredPermissions: ['network', 'read'],
      supportedFileTypes: ['*'],
      tags: ['web', 'browsing', 'ai', 'content', 'analysis', 'browserbase', 'automation'],
    })

    // List directory tool
    this.registerTool('list-tool', new ListTool(workingDirectory), {
      description: 'List files and directories with intelligent ignore patterns',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 1500,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['list', 'ls', 'filesystem', 'explore'],
    })

    // Grep tool
    this.registerTool('grep-tool', new GrepTool(workingDirectory), {
      description: 'Search text patterns across files with context and ignores',
      category: 'search',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2500,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['grep', 'search', 'pattern'],
    })

    // CAD Generation Tools
    this.registerTool('text-to-cad-tool', new TextToCADTool(workingDirectory), {
      description: 'Convert text descriptions into CAD elements and models with AI',
      category: 'ai',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 12000,
      requiredPermissions: ['write', 'network'],
      supportedFileTypes: ['stl', 'step', 'dwg', 'json'],
      tags: ['cad', 'ai', 'generation', 'text-to-cad', 'engineering', '3d'],
    })

    this.registerTool('text-to-gcode-tool', new TextToGCodeTool(workingDirectory), {
      description: 'Convert text descriptions into G-code for CNC machining and 3D printing',
      category: 'manufacturing',
      riskLevel: 'medium',
      reversible: false,
      estimatedDuration: 8000,
      requiredPermissions: ['write'],
      supportedFileTypes: ['gcode', 'nc', 'txt'],
      tags: ['gcode', 'cnc', '3d-printing', 'manufacturing', 'machining', 'laser'],
    })

    // Diff tool (file comparison)
    this.registerTool('diff-tool', new DiffTool(workingDirectory), {
      description: 'Compare files and content with multiple diff algorithms (line, word, char)',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['diff', 'compare', 'comparison', 'changes', 'unified'],
    })

    // Tree tool (directory visualization)
    this.registerTool('tree-tool', new TreeTool(workingDirectory), {
      description: 'Visualize directory structure as a tree with statistics',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 1500,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['tree', 'directory', 'structure', 'visualization', 'explore'],
    })

    // Watch tool (file system monitoring)
    this.registerTool('watch-tool', new WatchTool(workingDirectory), {
      description: 'Monitor file system changes in real-time with pattern filtering',
      category: 'filesystem',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 1000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['watch', 'monitor', 'filesystem', 'changes', 'events', 'realtime'],
    })

    // Browser Automation Tools
    const browserTools = createBrowserTools(workingDirectory)

    this.registerTool('browser_navigate', browserTools.browser_navigate, {
      description: 'Navigate to a URL and wait for page to load',
      category: 'browser',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 5000,
      requiredPermissions: ['network'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'navigate', 'web', 'automation'],
    })

    this.registerTool('browser_click', browserTools.browser_click, {
      description: 'Click on an element using CSS selector or text',
      category: 'browser',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'click', 'interact', 'automation'],
    })

    this.registerTool('browser_type', browserTools.browser_type, {
      description: 'Type text into an input field or textarea',
      category: 'browser',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 3000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'type', 'input', 'automation'],
    })

    this.registerTool('browser_screenshot', browserTools.browser_screenshot, {
      description: 'Take a screenshot of the current page or viewport',
      category: 'browser',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['png', 'jpg'],
      tags: ['browser', 'screenshot', 'capture', 'visual'],
    })

    this.registerTool('browser_extract_text', browserTools.browser_extract_text, {
      description: 'Extract text content from page or specific element',
      category: 'browser',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 2000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'text', 'extract', 'content'],
    })

    this.registerTool('browser_wait_for_element', browserTools.browser_wait_for_element, {
      description: 'Wait for an element to appear or change state',
      category: 'browser',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 30000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'wait', 'element', 'sync'],
    })

    this.registerTool('browser_scroll', browserTools.browser_scroll, {
      description: 'Scroll the page or a specific element',
      category: 'browser',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 1000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'scroll', 'navigation'],
    })

    this.registerTool('browser_execute_script', browserTools.browser_execute_script, {
      description: 'Execute custom JavaScript in the browser context',
      category: 'browser',
      riskLevel: 'high',
      reversible: false,
      estimatedDuration: 5000,
      requiredPermissions: ['execute'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'javascript', 'execute', 'script'],
    })

    this.registerTool('browser_get_page_info', browserTools.browser_get_page_info, {
      description: 'Get current page information (title, URL, navigation state)',
      category: 'browser',
      riskLevel: 'low',
      reversible: true,
      estimatedDuration: 1000,
      requiredPermissions: ['read'],
      supportedFileTypes: ['*'],
      tags: ['browser', 'info', 'page', 'metadata'],
    })

    // NikDrive Cloud Storage tool
    this.registerTool('nikdrive-tool', new NikDriveTool(workingDirectory), {
      description: 'Cloud storage operations with NikDrive (upload, download, sync, search, share)',
      category: 'cloud',
      riskLevel: 'medium',
      reversible: true,
      estimatedDuration: 8000,
      requiredPermissions: ['network', 'read', 'write'],
      supportedFileTypes: ['*'],
      tags: ['cloud', 'storage', 's3', 'sync', 'backup', 'nikdrive'],
    })

    if (!process.env.NIKCLI_QUIET_STARTUP) {
      advancedUI.logSuccess(`Initialized tool registry with ${this.tools.size} tools`)
    }
  }
}

/**
 * Mock tool for demonstration purposes
 * In production, these would be replaced with actual tool implementations
 */
class MockTool extends BaseTool {
  constructor(workingDirectory: string) {
    super('mock-tool', workingDirectory)
  }

  async execute(...args: any[]): Promise<ToolExecutionResult> {
    // Simulate tool execution
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return {
      success: true,
      data: { args, message: 'Mock tool executed successfully' },
      metadata: {
        executionTime: 1000,
        toolName: this.getName(),
        parameters: args,
      },
    }
  }
}

export interface ToolMetadata {
  name: string
  description: string
  category: string
  riskLevel: 'low' | 'medium' | 'high'
  reversible: boolean
  estimatedDuration: number // milliseconds
  requiredPermissions: string[]
  supportedFileTypes: string[]
  version: string
  author: string
  tags: string[]
}

export interface ToolValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

export interface ToolStats {
  totalTools: number
  categories: string[]
  riskDistribution: Record<string, number>
  reversibleTools: number
  averageEstimatedDuration: number
}

export interface ToolRegistryConfig {
  tools: ToolMetadata[]
  exportedAt: Date
  version: string
}
