import { EventEmitter } from 'node:events'
import type { CoreMessage } from 'ai'
import chalk from 'chalk'
import { z } from 'zod'

// ⚡︎ Import Cognitive Types
import type { OrchestrationPlan, TaskCognition } from '../automation/agents/universal-agent'

// 🔧 Import Unified Tool Registry
import { ToolRegistry } from '../tools/tool-registry'

// 🔧 Enhanced Tool Routing Schemas
const ToolSecurityLevel = z.enum(['safe', 'moderate', 'risky', 'dangerous'])
const ToolCategory = z.enum(['file', 'command', 'search', 'analysis', 'git', 'package', 'ide', 'ai', 'blockchain'])

const AdvancedToolRecommendation = z.object({
  tool: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  securityLevel: ToolSecurityLevel,
  category: ToolCategory,
  suggestedParams: z.record(z.any()).optional(),
  alternativeTools: z.array(z.string()).optional(),
  executionOrder: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
  estimatedDuration: z.number().optional(),
  requiresApproval: z.boolean().default(false),
  workspaceRestricted: z.boolean().default(true),
})

const RoutingContext = z.object({
  userIntent: z.string(),
  projectType: z.string().optional(),
  currentWorkspace: z.string(),
  availableTools: z.array(z.string()),
  securityMode: z.enum(['strict', 'normal', 'permissive']).default('strict'),
  cognition: z.any().optional(), // TaskCognition
  orchestrationPlan: z.any().optional(), // OrchestrationPlan
})

type AdvancedToolRecommendation = z.infer<typeof AdvancedToolRecommendation>
type RoutingContext = z.infer<typeof RoutingContext>

export interface ToolKeyword {
  tool: string
  keywords: string[]
  priority: number
  description: string
  examples: string[]
}

export interface ToolRecommendation {
  tool: string
  confidence: number
  reason: string
  suggestedParams?: any
}

export class ToolRouter extends EventEmitter {
  private toolRegistry: ToolRegistry

  constructor(workingDirectory: string = process.cwd()) {
    super()
    // 🔧 Initialize unified tool registry
    this.toolRegistry = new ToolRegistry(workingDirectory)
  }

  private toolKeywords: ToolKeyword[] = [
    // Web Search Tools
    {
      tool: 'web_search',
      keywords: [
        'search',
        'find',
        'information',
        'documentation',
        'stackoverflow',
        'github',
        'medium',
        'blog',
        'tutorial',
        'guide',
        'how to',
        'best practice',
        'update',
        'news',
        'version',
      ],
      priority: 6, // REDUCED: generic 'search' conflicts with grep/multi_read
      description: 'Search for updated web information',
      examples: ['search React 18 features', 'find TypeScript tutorial', 'information about Next.js 15'],
    },

    // IDE Context Tools
    {
      tool: 'ide_context',
      keywords: [
        'environment',
        'editor',
        'ide',
        'workspace',
        'project',
        'structure',
        'dependencies',
        'package.json',
        'git',
        'branch',
        'commit',
        'status',
        'open files',
        'recent',
      ],
      priority: 5, // REDUCED: too many generic keywords cause false positives
      description: 'IDE and workspace context analysis',
      examples: ['analyze development environment', 'project status', 'installed dependencies'],
    },

    // Semantic Search Tools
    {
      tool: 'semantic_search',
      keywords: [
        'similar',
        'same',
        'pattern',
        'model',
        'example',
        'like this',
        'same type',
        'similar function',
        'similar component',
        'implementation',
      ],
      priority: 8, // KEPT: very specific use case (semantic matching)
      description: 'Semantic search in codebase',
      examples: ['find files similar to this', 'search similar implementations', 'similar patterns in code'],
    },

    // Code Analysis Tools
    {
      tool: 'code_analysis',
      keywords: [
        'analyze',
        'quality',
        'issues',
        'bug',
        'errors',
        'improve',
        'optimize',
        'refactor',
        'refactoring',
        'clean',
        'security',
        'performance',
        'complexity',
      ],
      priority: 7, // REDUCED: 'analyze' is too generic, let grep/multi_read take precedence
      description: 'Code quality analysis and optimization',
      examples: ['analyze code quality', 'find security issues', 'optimize performance'],
    },

    // Dependency Analysis Tools
    {
      tool: 'dependency_analysis',
      keywords: [
        'dependencies',
        'package',
        'npm',
        'yarn',
        'node_modules',
        'vulnerabilities',
        'security',
        'update',
        'outdated',
        'version',
        'lock',
        'package-lock',
        'yarn.lock',
      ],
      priority: 6, // REDUCED: more specific context needed to avoid false positives
      description: 'Dependencies and security analysis',
      examples: ['analyze dependencies', 'find vulnerabilities', 'update outdated packages'],
    },

    // Git Workflow Tools
    {
      tool: 'git_workflow',
      keywords: [
        'git',
        'commit',
        'branch',
        'merge',
        'pull',
        'push',
        'repository',
        'repo',
        'workflow',
        'history',
        'log',
        'status',
        'changes',
        'diff',
        'conflict',
        'rebase',
        'cherry-pick',
      ],
      priority: 6,
      description: 'Git workflow analysis',
      examples: ['analyze Git workflow', 'repository status', 'commit history'],
    },

    // Config Patch (JSON/YAML)
    {
      tool: 'config_patch',
      keywords: [
        'config',
        'configuration',
        'settings',
        'env',
        'yaml',
        'yml',
        'json',
        'patch',
        'update key',
        'set value',
        'add script',
        'dependencies',
        'scripts',
      ],
      priority: 7,
      description: 'Apply structured patch to JSON/YAML configuration files',
      examples: ['add script to package.json', 'set env in config.yaml', 'patch settings.json'],
    },

    // File Operations
    {
      tool: 'read_file',
      keywords: ['read', 'show', 'view', 'content', 'file', 'code', 'script', 'configuration', 'config'],
      priority: 5,
      description: 'File reading',
      examples: ['read package.json', 'show file content', 'view configuration'],
    },

    // Multi-read (batch) - HIGH PRIORITY FOR BATCH OPERATIONS
    {
      tool: 'multi_read',
      keywords: ['multi read', 'batch read', 'analyze files', 'collect contents', 'inspect many files', 'read several', 'read multiple', 'analyze all', 'check all files'],
      priority: 7, // BALANCED: high for batch ops but not higher than grep for precision
      description: 'Read multiple files with search and context - preferred for batch operations',
      examples: ['read multiple files', 'batch analyze src/**/*.ts', 'check all config files'],
    },

    {
      tool: 'write_file',
      keywords: ['write', 'create', 'generate', 'save', 'new', 'file', 'code', 'component', 'function'],
      priority: 5,
      description: 'File writing',
      examples: ['create new component', 'generate function', 'write configuration file'],
    },

    // Edit/Replace/Multi-Edit
    {
      tool: 'edit_file',
      keywords: ['edit', 'modify', 'change', 'update', 'apply patch', 'diff'],
      priority: 6,
      description: 'Edit file with diff and backup',
      examples: ['edit src/app.ts', 'update code block', 'apply change to function'],
    },
    {
      tool: 'replace_in_file',
      keywords: ['replace', 'regex', 'pattern', 'in-file', 'substitute'],
      priority: 6,
      description: 'Replace content in files with validation and backup',
      examples: ['replace API_URL in .env', 'regex replace across file'],
    },
    {
      tool: 'multi_edit',
      keywords: ['multi', 'batch', 'atomic', 'transaction', 'multiple files', 'batch edit', 'edit several', 'change multiple', 'update all', 'modify multiple'],
      priority: 6, // MODERATE: batch edits important but less common than single edits
      description: 'Apply multiple edits atomically - preferred for batch modifications',
      examples: ['batch replace across files', 'atomic patch multiple files', 'update multiple components'],
    },

    {
      tool: 'explore_directory',
      keywords: ['explore', 'list', 'structure', 'directory', 'folder', 'path', 'find', 'search', 'file', 'files'],
      priority: 4,
      description: 'Directory exploration',
      examples: ['explore project structure', 'list files in folder', 'find TypeScript files'],
    },

    // Find files (glob)
    {
      tool: 'find_files',
      keywords: ['glob', 'pattern', 'find files', '*.ts', '*.json', 'globby'],
      priority: 5,
      description: 'Find files matching glob patterns',
      examples: ['find *.ts in src', 'glob **/*.spec.ts'],
    },

    // Grep/Search - HIGHEST PRIORITY FOR PRECISE TEXT SEARCH
    {
      tool: 'grep',
      keywords: ['grep', 'search', 'find text', 'search in files', 'search code', 'find pattern', 'search content', 'look for', 'find string', 'search term', 'search for'],
      priority: 9, // HIGHEST: grep is most precise for finding specific text/patterns
      description: 'Search text patterns in files - preferred for content search',
      examples: ['search for "function"', 'grep "export" in src/', 'find all TODO comments'],
    },

    // Command Execution
    {
      tool: 'run_command',
      keywords: [
        'execute',
        'run',
        'command',
        'script',
        'build',
        'test',
        'install',
        'start',
        'dev',
        'development',
        'production',
        'deploy',
        'deployment',
      ],
      priority: 3,
      description: 'Command execution',
      examples: ['run tests', 'start development server', 'build project'],
    },

    // Blockchain/Web3 (Coinbase AgentKit)
    {
      tool: 'blockchain_web3',
      keywords: [
        'blockchain',
        'web3',
        'wallet',
        'coinbase',
        'agentkit',
        'onchain',
        'transfer',
        'send',
        'tx',
        'transaction',
        'balance',
        'erc20',
        'defi',
        'smart contract',
        'address',
        'eth',
        'base',
        'sepolia',
      ],
      priority: 7,
      description: 'Blockchain/Web3 operations via Coinbase AgentKit',
      examples: ['check my wallet balance', 'transfer 0.1 ETH to 0x...', 'use coinbase agentkit to send usdc'],
    },

    // Web Browsing and Content Analysis (Browserbase)
    {
      tool: 'browse_web',
      keywords: [
        'browse',
        'web',
        'website',
        'url',
        'scrape',
        'extract',
        'analyze content',
        'web page',
        'browserbase',
        'navigate',
        'visit',
        'load page',
        'content analysis',
        'web analysis',
        'extract text',
        'summarize webpage',
      ],
      priority: 6, // REDUCED: external tool, use only when explicitly requested
      description: 'Web browsing automation and AI-powered content analysis',
      examples: ['browse https://example.com', 'analyze web content', 'extract text from website', 'summarize webpage'],
    },

    // Figma Design Integration
    {
      tool: 'figma_design',
      keywords: [
        'figma',
        'design',
        'ui',
        'ux',
        'interface',
        'mockup',
        'prototype',
        'export',
        'generate code',
        'design system',
        'component',
        'tokens',
        'design tokens',
        'colors',
        'typography',
        'spacing',
        'styles',
        'export png',
        'export svg',
        'code generation',
        'figma to code',
        'react component',
        'component to figma',
        'create figma from component',
        'generate design from code',
        'component preview',
        'design from react',
        'visual representation',
        'mockup from component',
        'shadcn',
        'chakra',
        'mantine',
        'css',
        'scss',
        'design file',
        'figma file',
        'visual design',
        'assets',
        'export assets',
        'v0',
        'vercel v0',
      ],
      priority: 5, // REDUCED: design-specific tool, use only when explicitly requested
      description: 'Figma design file operations, export, and AI-powered code generation',
      examples: [
        'export figma design as PNG',
        'generate React code from figma',
        'extract design tokens from figma',
        'open figma file in desktop app',
        'create component from figma design',
        'create figma design from React component',
        'generate design preview from component file',
        'get figma file information',
      ],
    },
  ]

  // Analyze user message and recommend tools
  analyzeMessage(message: CoreMessage): ToolRecommendation[] {
    const content = typeof message.content === 'string' ? message.content : String(message.content)

    const lowerContent = content.toLowerCase()
    const recommendations: ToolRecommendation[] = []

    // Check each tool for keyword matches
    for (const toolKeyword of this.toolKeywords) {
      const matches = toolKeyword.keywords.filter((keyword) => lowerContent.includes(keyword.toLowerCase()))

      if (matches.length > 0) {
        const confidence = this.calculateConfidence(matches, toolKeyword, lowerContent)

        if (confidence > 0.3) {
          // Minimum confidence threshold
          recommendations.push({
            tool: toolKeyword.tool,
            confidence,
            reason: `Matched keywords: ${matches.join(', ')}`,
            suggestedParams: this.suggestParameters(toolKeyword.tool, content),
          })
        }
      }
    }

    // Sort by priority first, then confidence - ENHANCED SORTING
    return recommendations
      .sort((a, b) => {
        const toolA = this.toolKeywords.find((t) => t.tool === a.tool)
        const toolB = this.toolKeywords.find((t) => t.tool === b.tool)
        const priorityA = toolA?.priority || 0
        const priorityB = toolB?.priority || 0

        // Prioritize high-priority tools (8+) even with lower confidence
        if (priorityA >= 8 && priorityB < 8) return -1
        if (priorityB >= 8 && priorityA < 8) return 1

        // For high-priority tools, prefer by priority first
        if (priorityA >= 8 && priorityB >= 8) {
          if (priorityA !== priorityB) return priorityB - priorityA
          return b.confidence - a.confidence
        }

        // For normal tools, balance confidence and priority
        const scoreA = a.confidence * 0.7 + (priorityA / 10) * 0.3
        const scoreB = b.confidence * 0.7 + (priorityB / 10) * 0.3

        return scoreB - scoreA
      })
      .slice(0, 5) // Increased from 3 to 5 recommendations
  }

  /** Resolve router alias to actual ToolRegistry name */
  private resolveToolAlias(name: string): string {
    const map: Record<string, string> = {
      // Friendly -> Registered tool names
      Read: 'read-file-tool',
      Write: 'write-file-tool',
      LS: 'list-tool',
      Grep: 'grep-tool',
      Glob: 'find-files-tool',
      Bash: 'bash-tool',
      blockchain_web3: 'coinbase-agentkit-tool',
      git_workflow: 'git-tools',
      config_patch: 'json-patch-tool',
      run_command: 'run-command-tool',
      read_file: 'read-file-tool',
      multi_read: 'multi-read-tool',
      write_file: 'write-file-tool',
      explore_directory: 'list-tool',
      find_files: 'find-files-tool',
      edit_file: 'edit-tool',
      replace_in_file: 'replace-in-file-tool',
      Edit: 'edit-tool',
      Replace: 'replace-in-file-tool',
      MultiEdit: 'multi-edit-tool',
      multi_edit: 'multi-edit-tool',
      analyze_image: 'vision-analysis-tool',
      generate_image: 'image-generation-tool',
      browse_web: 'browserbase-tool',
      web_browse: 'browserbase-tool',
      browserbase: 'browserbase-tool',
    }
    return map[name] || name
  }

  // Calculate confidence score for tool recommendation
  private calculateConfidence(matches: string[], toolKeyword: ToolKeyword, content: string): number {
    let confidence = 0

    // Base confidence from number of matches
    confidence += matches.length * 0.2

    // Bonus for exact matches
    for (const match of matches) {
      if (content.toLowerCase().includes(match.toLowerCase())) {
        confidence += 0.1
      }
    }

    // Context bonus for related words
    const contextWords = this.getContextWords(toolKeyword.tool)
    const contextMatches = contextWords.filter((word) => content.toLowerCase().includes(word))
    confidence += contextMatches.length * 0.05

    // Length bonus for more specific requests
    if (content.length > 50) {
      confidence += 0.1
    }

    return Math.min(1.0, confidence)
  }

  // Get context words for each tool
  private getContextWords(tool: string): string[] {
    const contextMap: Record<string, string[]> = {
      web_search: ['web', 'online', 'internet', 'browser', 'url', 'link'],
      ide_context: ['editor', 'vscode', 'intellij', 'workspace', 'project'],
      semantic_search: ['similar', 'pattern', 'example', 'implementation'],
      code_analysis: ['quality', 'review', 'improve', 'optimize'],
      dependency_analysis: ['package', 'npm', 'security', 'update'],
      git_workflow: ['repository', 'commit', 'branch', 'merge'],
      read_file: ['file', 'content', 'show', 'display'],
      write_file: ['create', 'generate', 'new', 'save'],
      explore_directory: ['folder', 'directory', 'structure', 'list'],
      run_command: ['execute', 'run', 'script', 'terminal'],
      blockchain_web3: [
        'wallet',
        'address',
        'balance',
        'transfer',
        'send',
        'erc20',
        'usdc',
        'weth',
        'base',
        'sepolia',
        'coinbase',
      ],
      browse_web: [
        'website',
        'webpage',
        'url',
        'link',
        'content',
        'text',
        'analyze',
        'extract',
        'summarize',
        'scrape',
        'navigate',
        'browse',
      ],
    }

    return contextMap[tool] || []
  }

  // Suggest parameters based on tool and content
  private suggestParameters(tool: string, content: string): any {
    const suggestions: Record<string, any> = {}

    switch (tool) {
      case 'web_search': {
        // Extract search query
        const searchMatch = content.match(/(?:search|find)\s+(.+?)(?:\s|$)/i)
        if (searchMatch) {
          suggestions.query = searchMatch[1]
        }

        // Detect search type
        if (content.includes('stackoverflow') || content.includes('error')) {
          suggestions.searchType = 'stackoverflow'
        } else if (content.includes('documentation') || content.includes('docs')) {
          suggestions.searchType = 'documentation'
        } else if (content.includes('github') || content.includes('code')) {
          suggestions.searchType = 'technical'
        }
        break
      }

      case 'code_analysis': {
        // Extract file path
        const fileMatch = content.match(/(?:analyze)\s+(.+?)(?:\s|$)/i)
        if (fileMatch) {
          suggestions.filePath = fileMatch[1]
        }

        // Detect analysis type
        if (content.includes('security')) {
          suggestions.analysisType = 'security'
        } else if (content.includes('performance')) {
          suggestions.analysisType = 'performance'
        } else if (content.includes('pattern') || content.includes('model')) {
          suggestions.analysisType = 'patterns'
        }
        break
      }

      case 'semantic_search': {
        // Extract search query
        const semanticMatch = content.match(/(?:find)\s+(.+?)(?:\s|$)/i)
        if (semanticMatch) {
          suggestions.query = semanticMatch[1]
        }
        break
      }

      case 'blockchain_web3': {
        // Try to infer operation
        const lower = content.toLowerCase()
        if (/(init|initialize)/.test(lower)) {
          suggestions.action = 'init'
        } else if (/balance|how much (eth|usdc)|wallet\s+balance/.test(lower)) {
          suggestions.action = 'balance'
        } else if (/wallet|address|network|status/.test(lower)) {
          suggestions.action = 'status'
        } else if (/send|transfer|pay|tip/.test(lower)) {
          suggestions.action = 'transfer'

          // Extract amount and token
          const amountMatch = content.match(/(\d+[.,]?\d*)\s*(eth|usdc|weth|wei)?/i)
          if (amountMatch) {
            suggestions.params = suggestions.params || {}
            suggestions.params.amount = amountMatch[1]
            if (amountMatch[2]) suggestions.params.token = amountMatch[2].toUpperCase()
          }

          // Extract recipient address
          const addrMatch = content.match(/(0x[a-fA-F0-9]{40})/)
          if (addrMatch) {
            suggestions.params = suggestions.params || {}
            suggestions.params.to = addrMatch[1]
          }
        } else {
          // Fallback to chat passthrough
          suggestions.action = 'chat'
          suggestions.params = { message: content }
        }
        break
      }

      case 'browse_web': {
        // Extract URL from content
        const urlMatch = content.match(/(https?:\/\/[^\s]+)/i)
        if (urlMatch) {
          suggestions.url = urlMatch[1]
        }

        // Detect analysis type
        const lower = content.toLowerCase()
        if (/summary|summarize/.test(lower)) {
          suggestions.analysisType = 'summary'
        } else if (/detail|detailed|comprehensive/.test(lower)) {
          suggestions.analysisType = 'detailed'
        } else if (/technical/.test(lower)) {
          suggestions.analysisType = 'technical'
        }

        // Detect AI provider preference
        if (/claude/.test(lower)) {
          suggestions.provider = 'claude'
        } else if (/openai|gpt/.test(lower)) {
          suggestions.provider = 'openai'
        } else if (/google|gemini/.test(lower)) {
          suggestions.provider = 'google'
        }

        suggestions.action = 'browseAndAnalyze'
        break
      }
    }

    return suggestions
  }

  // Get tool description for AI
  getToolDescription(tool: string): string {
    const toolKeyword = this.toolKeywords.find((t) => t.tool === tool)
    return toolKeyword?.description || 'Generic tool'
  }

  // Get all available tools with descriptions
  getAllTools(): ToolKeyword[] {
    return this.toolKeywords
  }

  // Log tool recommendations for debugging
  logRecommendations(message: string, recommendations: ToolRecommendation[]): void {
    if (!process.env.NIKCLI_CLEAN_CHAT && !process.env.NIKCLI_MINIMAL_STREAM) {
      console.log(chalk.blue(`Processing message: "${message.substring(0, 50)}..."\n`))
    }

    if (recommendations.length === 0) {
      return
    }

    recommendations.forEach((rec, index) => {
      if (!process.env.NIKCLI_CLEAN_CHAT && !process.env.NIKCLI_MINIMAL_STREAM) {
        const confidenceColor = rec.confidence > 0.7 ? chalk.green : rec.confidence > 0.4 ? chalk.yellow : chalk.red

        if (rec.suggestedParams && Object.keys(rec.suggestedParams).length > 0) {

        }
      }
    })
  }

  // ====================== ⚡︎ ADVANCED COGNITIVE ROUTING ALGORITHM ======================

  /**
   * 🎯 Advanced Tool Routing with Cognitive Intelligence
   * Multi-dimensional tool selection with security, context, and orchestration awareness
   */
  async routeWithCognition(context: RoutingContext): Promise<AdvancedToolRecommendation[]> {
    if (!process.env.NIKCLI_CLEAN_CHAT && !process.env.NIKCLI_MINIMAL_STREAM) {
      console.log(chalk.blue(`🎯 Advanced routing for: ${context.userIntent.slice(0, 50)}...`))
    }

    try {
      // Step 1: 🔍 Analyze Intent and Extract Tool Requirements
      const intentAnalysis = this.analyzeIntentAdvanced(context.userIntent)

      // Step 2: ⚡︎ Apply Cognitive Understanding (if available)
      const cognitiveEnhancement = context.cognition
        ? this.applyCognitiveEnhancement(intentAnalysis, context.cognition)
        : intentAnalysis

      // Step 3: 🔧 Integrate with Unified Tool Registry
      const availableTools = this.toolRegistry.listTools()
      const validatedTool = this.validateToolsFromRegistry(availableTools, context)

      // Step 4: 🎯 Multi-Dimensional Tool Scoring with Registry Integration
      const toolCandidates = await this.scoreToolsMultiDimensional(cognitiveEnhancement, {
        ...context,
        availableTools: validatedTool,
      })

      // Step 4: 🛡️ Security and Safety Filtering
      const secureTools = this.applySecurityFiltering(toolCandidates, context.securityMode)

      // Step 5: 📋 Orchestration-Aware Sequencing
      const sequencedTools = context.orchestrationPlan
        ? this.optimizeToolSequence(secureTools, context.orchestrationPlan)
        : this.defaultToolSequencing(secureTools)

      // Step 6: ✓ Validation and Final Selection
      const validatedTools = this.validateAndFinalize(sequencedTools, context)

      console.log(chalk.green(`✓ Selected ${validatedTools.length} optimal tools`))

      return validatedTools
    } catch (error: any) {
      console.log(chalk.red(`❌ Advanced routing failed: ${error.message}`))

      // Fallback to basic routing
      const basicRecommendations = this.analyzeMessage({ role: 'user', content: context.userIntent })
      return this.convertToAdvancedRecommendations(basicRecommendations)
    }
  }

  /**
   * 🔍 Advanced Intent Analysis with NLP and Pattern Recognition
   */
  private analyzeIntentAdvanced(userIntent: string): {
    primaryAction: string
    targetObjects: string[]
    modifiers: string[]
    urgency: 'low' | 'normal' | 'high' | 'critical'
    complexity: number
    requiredCapabilities: string[]
  } {
    const lowerIntent = userIntent.toLowerCase()

    // Extract primary action using advanced pattern matching
    const actionPatterns = {
      read: /\b(read|show|display|view|see|check|examine|analyze)\b/,
      write: /\b(write|create|generate|make|build|add|insert)\b/,
      search: /\b(search|find|locate|discover|explore|look)\b/,
      modify: /\b(modify|edit|change|update|alter|fix|repair)\b/,
      execute: /\b(run|execute|start|launch|deploy|install|build)\b/,
      analyze: /\b(analyze|investigate|review|audit|assess|evaluate)\b/,
    }

    let primaryAction = 'analyze' // default
    let actionConfidence = 0

    for (const [action, pattern] of Object.entries(actionPatterns)) {
      if (pattern.test(lowerIntent)) {
        const matches = (lowerIntent.match(pattern) || []).length
        if (matches > actionConfidence) {
          primaryAction = action
          actionConfidence = matches
        }
      }
    }

    // Extract target objects
    const objectPatterns = [
      /\b([a-zA-Z0-9_-]+\.(js|ts|tsx|jsx|json|md|css|html|py|java))\b/g,
      /\b(package\.json|tsconfig\.json|\.env|dockerfile)\b/gi,
      /\b(component|function|class|interface|type|hook)\s+([a-zA-Z0-9_]+)/gi,
      /\b(api|endpoint|route|controller|service)\s+([a-zA-Z0-9_/]+)/gi,
    ]

    const targetObjects: string[] = []
    for (const pattern of objectPatterns) {
      const matches = [...userIntent.matchAll(pattern)]
      targetObjects.push(...matches.map((m) => m[1] || m[0]))
    }

    // Extract modifiers (urgency, quality, scope indicators)
    const urgencyKeywords = {
      critical: ['urgent', 'asap', 'immediately', 'critical', 'emergency'],
      high: ['quickly', 'fast', 'soon', 'priority', 'important'],
      low: ['when possible', 'eventually', 'later', 'if time'],
    }

    let urgency: 'low' | 'normal' | 'high' | 'critical' = 'normal'
    for (const [level, keywords] of Object.entries(urgencyKeywords)) {
      if (keywords.some((keyword) => lowerIntent.includes(keyword))) {
        urgency = level as any
        break
      }
    }

    // Calculate complexity based on multiple factors
    let complexity = 3 // base complexity
    if (targetObjects.length > 3) complexity += 2
    if (lowerIntent.includes('all') || lowerIntent.includes('entire')) complexity += 2
    if (lowerIntent.includes('refactor') || lowerIntent.includes('restructure')) complexity += 3
    if (lowerIntent.includes('deploy') || lowerIntent.includes('production')) complexity += 2

    // Infer required capabilities
    const capabilityMap = {
      react: ['component', 'jsx', 'tsx', 'hook', 'state'],
      backend: ['api', 'server', 'database', 'endpoint', 'service'],
      testing: ['test', 'spec', 'mock', 'coverage', 'assertion'],
      devops: ['deploy', 'docker', 'ci', 'cd', 'pipeline', 'build'],
      git: ['commit', 'branch', 'merge', 'pull', 'push', 'repository'],
      security: ['security', 'vulnerability', 'audit', 'permission', 'auth'],
    }

    const requiredCapabilities: string[] = []
    for (const [capability, keywords] of Object.entries(capabilityMap)) {
      if (keywords.some((keyword) => lowerIntent.includes(keyword))) {
        requiredCapabilities.push(capability)
      }
    }

    return {
      primaryAction,
      targetObjects: [...new Set(targetObjects)],
      modifiers: [],
      urgency,
      complexity: Math.min(complexity, 10),
      requiredCapabilities,
    }
  }

  /**
   * ⚡︎ Apply Cognitive Enhancement from Task Cognition
   */
  private applyCognitiveEnhancement(intentAnalysis: any, cognition: TaskCognition): any {
    // Enhance with cognitive understanding
    const enhanced = { ...intentAnalysis }

    // Override urgency from cognition if more specific
    if (cognition.intent.urgency !== 'normal') {
      enhanced.urgency = cognition.intent.urgency
    }

    // Add cognitive complexity
    enhanced.complexity = Math.max(enhanced.complexity, cognition.estimatedComplexity)

    // Merge capabilities
    enhanced.requiredCapabilities = [...new Set([...enhanced.requiredCapabilities, ...cognition.requiredCapabilities])]

    // Add cognitive context
    enhanced.cognitiveContexts = cognition.contexts
    enhanced.riskLevel = cognition.riskLevel

    return enhanced
  }

  /**
   * 📊 Multi-Dimensional Tool Scoring Algorithm
   */
  private async scoreToolsMultiDimensional(
    intentAnalysis: any,
    context: RoutingContext
  ): Promise<Array<AdvancedToolRecommendation & { rawScore: number }>> {
    const toolCandidates: Array<AdvancedToolRecommendation & { rawScore: number }> = []

    // Define comprehensive tool mapping with metadata
    const toolDatabase = this.getAdvancedToolDatabase()

    for (const toolInfo of toolDatabase) {
      const score = this.calculateToolScore(toolInfo, intentAnalysis, context)

      if (score.totalScore > 0.2) {
        // Minimum threshold
        const recommendation: AdvancedToolRecommendation & { rawScore: number } = {
          tool: toolInfo.name,
          confidence: score.totalScore,
          reason: score.primaryReason,
          securityLevel: toolInfo.securityLevel,
          category: toolInfo.category,
          suggestedParams: score.suggestedParams,
          alternativeTools: toolInfo.alternatives,
          estimatedDuration: toolInfo.estimatedDuration,
          requiresApproval: toolInfo.requiresApproval,
          workspaceRestricted: toolInfo.workspaceRestricted,
          rawScore: score.totalScore,
        }

        toolCandidates.push(recommendation)
      }
    }

    // Sort by score
    return toolCandidates.sort((a, b) => b.rawScore - a.rawScore)
  }

  /**
   * 🔧 Advanced Tool Database with Comprehensive Metadata
   */
  private getAdvancedToolDatabase() {
    return [
      {
        name: 'Read',
        category: 'file' as const,
        securityLevel: 'safe' as const,
        keywords: ['read', 'show', 'view', 'display', 'content', 'file'],
        capabilities: ['file-read', 'content-analysis'],
        estimatedDuration: 5,
        requiresApproval: false,
        workspaceRestricted: true,
        alternatives: ['LS', 'Grep'],
      },
      {
        name: 'git_workflow',
        category: 'git' as const,
        securityLevel: 'moderate' as const,
        keywords: ['git', 'commit', 'status', 'diff', 'patch', 'apply', 'repository', 'branch'],
        capabilities: ['git-status', 'git-diff', 'git-commit', 'git-apply'],
        estimatedDuration: 15,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: [],
      },
      {
        name: 'config_patch',
        category: 'file' as const,
        securityLevel: 'moderate' as const,
        keywords: ['config', 'yaml', 'yml', 'json', 'patch', 'settings', 'scripts', 'dependencies', 'env'],
        capabilities: ['config-update', 'json-patch', 'yaml-patch'],
        estimatedDuration: 10,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: ['Write', 'Edit'],
      },
      {
        name: 'Write',
        category: 'file' as const,
        securityLevel: 'moderate' as const,
        keywords: ['write', 'create', 'generate', 'save', 'new'],
        capabilities: ['file-write', 'code-generation'],
        estimatedDuration: 15,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: ['Edit', 'MultiEdit'],
      },
      {
        name: 'Edit',
        category: 'file' as const,
        securityLevel: 'moderate' as const,
        keywords: ['edit', 'modify', 'change', 'update', 'diff'],
        capabilities: ['edit', 'diff', 'backup'],
        estimatedDuration: 12,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: ['Replace', 'MultiEdit'],
      },
      {
        name: 'Replace',
        category: 'file' as const,
        securityLevel: 'moderate' as const,
        keywords: ['replace', 'regex', 'pattern', 'substitute'],
        capabilities: ['replace', 'backup'],
        estimatedDuration: 10,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: ['Edit'],
      },
      {
        name: 'MultiEdit',
        category: 'file' as const,
        securityLevel: 'risky' as const,
        keywords: ['multi', 'batch', 'atomic', 'transaction'],
        capabilities: ['batch-edit', 'atomic'],
        estimatedDuration: 20,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: ['Edit', 'Replace'],
      },
      {
        name: 'Bash',
        category: 'command' as const,
        securityLevel: 'risky' as const,
        keywords: ['run', 'execute', 'command', 'bash', 'shell'],
        capabilities: ['command-execution', 'system-access'],
        estimatedDuration: 30,
        requiresApproval: true,
        workspaceRestricted: true,
        alternatives: [],
      },
      {
        name: 'Grep',
        category: 'search' as const,
        securityLevel: 'safe' as const,
        keywords: ['search', 'find', 'grep', 'pattern', 'text'],
        capabilities: ['text-search', 'pattern-matching'],
        estimatedDuration: 10,
        requiresApproval: false,
        workspaceRestricted: true,
        alternatives: ['Glob'],
      },
      {
        name: 'Glob',
        category: 'search' as const,
        securityLevel: 'safe' as const,
        keywords: ['glob', 'pattern', 'find files', '*.ts', '*.json', '**/*.tsx'],
        capabilities: ['file-search', 'glob'],
        estimatedDuration: 8,
        requiresApproval: false,
        workspaceRestricted: true,
        alternatives: ['Grep'],
      },
      {
        name: 'LS',
        category: 'file' as const,
        securityLevel: 'safe' as const,
        keywords: ['list', 'directory', 'folder', 'structure', 'files'],
        capabilities: ['directory-listing', 'file-exploration'],
        estimatedDuration: 5,
        requiresApproval: false,
        workspaceRestricted: true,
        alternatives: ['Glob'],
      },
      {
        name: 'WebFetch',
        category: 'search' as const,
        securityLevel: 'moderate' as const,
        keywords: ['web', 'internet', 'documentation', 'search', 'fetch'],
        capabilities: ['web-access', 'information-retrieval'],
        estimatedDuration: 20,
        requiresApproval: false,
        workspaceRestricted: false,
        alternatives: ['WebSearch'],
      },
      {
        name: 'blockchain_web3',
        category: 'blockchain' as const,
        securityLevel: 'risky' as const,
        keywords: [
          'blockchain',
          'web3',
          'wallet',
          'transfer',
          'send',
          'balance',
          'coinbase',
          'agentkit',
          'erc20',
          'defi',
          'eth',
          'base',
          'sepolia',
        ],
        capabilities: ['onchain-ops', 'wallet-management', 'erc20-transfer'],
        estimatedDuration: 20,
        requiresApproval: true,
        workspaceRestricted: false,
        alternatives: [],
      },
      {
        name: 'browse_web',
        category: 'ai' as const,
        securityLevel: 'moderate' as const,
        keywords: [
          'browse',
          'web',
          'website',
          'url',
          'scrape',
          'extract',
          'analyze',
          'content',
          'page',
          'browserbase',
          'navigate',
          'visit',
        ],
        capabilities: ['web-browsing', 'content-extraction', 'ai-analysis', 'web-automation'],
        estimatedDuration: 15,
        requiresApproval: true,
        workspaceRestricted: false,
        alternatives: ['WebFetch'],
      },
    ]
  }

  /**
   * 📈 Calculate Comprehensive Tool Score
   */
  private calculateToolScore(
    toolInfo: any,
    intentAnalysis: any,
    context: RoutingContext
  ): {
    totalScore: number
    primaryReason: string
    suggestedParams?: any
  } {
    let totalScore = 0
    let primaryReason = ''
    const reasons: string[] = []

    // 1. KEYWORD MATCHING (30%)
    const keywordScore = this.scoreKeywordMatch(toolInfo.keywords, intentAnalysis.primaryAction)
    totalScore += keywordScore * 0.3
    if (keywordScore > 0.7) {
      reasons.push(`Strong keyword match (${Math.round(keywordScore * 100)}%)`)
    }

    // 2. CAPABILITY ALIGNMENT (25%)
    const capabilityScore = this.scoreCapabilityAlignment(toolInfo.capabilities, intentAnalysis.requiredCapabilities)
    totalScore += capabilityScore * 0.25
    if (capabilityScore > 0.6) {
      reasons.push(`Capability alignment (${Math.round(capabilityScore * 100)}%)`)
    }

    // 3. SECURITY APPROPRIATENESS (20%)
    const securityScore = this.scoreSecurityLevel(
      toolInfo.securityLevel,
      context.securityMode,
      intentAnalysis.riskLevel
    )
    totalScore += securityScore * 0.2
    if (securityScore < 0.5) {
      reasons.push(`Security concerns (${toolInfo.securityLevel})`)
    }

    // 4. CONTEXT RELEVANCE (15%)
    const contextScore = this.scoreContextRelevance(toolInfo, intentAnalysis, context)
    totalScore += contextScore * 0.15

    // 5. URGENCY/PERFORMANCE MATCH (10%)
    const performanceScore = this.scorePerformanceMatch(toolInfo.estimatedDuration, intentAnalysis.urgency)
    totalScore += performanceScore * 0.1

    primaryReason = reasons.length > 0 ? reasons.join(', ') : `General ${toolInfo.category} tool`

    // Generate suggested parameters based on analysis
    const suggestedParams = this.generateSuggestedParams(toolInfo, intentAnalysis)

    return {
      totalScore: Math.min(totalScore, 1.0),
      primaryReason,
      suggestedParams,
    }
  }

  /**
   * 🛡️ Security and Safety Filtering
   */
  private applySecurityFiltering(
    tools: Array<AdvancedToolRecommendation & { rawScore: number }>,
    securityMode: 'strict' | 'normal' | 'permissive'
  ): Array<AdvancedToolRecommendation & { rawScore: number }> {
    const securityThresholds = {
      strict: { dangerous: 0, risky: 0.9, moderate: 0.7, safe: 0.3 },
      normal: { dangerous: 0, risky: 0.8, moderate: 0.5, safe: 0.2 },
      permissive: { dangerous: 0.9, risky: 0.6, moderate: 0.3, safe: 0.1 },
    }

    const thresholds = securityThresholds[securityMode]

    return tools.filter((tool) => {
      const threshold = thresholds[tool.securityLevel]
      const passes = tool.rawScore >= threshold

      if (!passes) {
        console.log(chalk.yellow(`⚠️ Security filter blocked: ${tool.tool} (${tool.securityLevel})`))
      }

      return passes
    })
  }

  /**
   * 📋 Orchestration-Aware Tool Sequencing
   */
  private optimizeToolSequence(
    tools: Array<AdvancedToolRecommendation & { rawScore: number }>,
    orchestrationPlan: OrchestrationPlan
  ): Array<AdvancedToolRecommendation & { rawScore: number }> {
    // Analyze orchestration plan to determine optimal tool sequence
    const currentPhase = orchestrationPlan.phases[0] // Assume first phase is current
    const phaseTools = currentPhase?.tools || []

    // Boost tools that are part of the orchestration plan
    tools.forEach((tool, index) => {
      if (phaseTools.includes(tool.tool)) {
        tool.rawScore += 0.2 // Orchestration boost
        tool.executionOrder = index
        tool.reason += ` (orchestration priority)`
      }
    })

    // Sort by orchestration priority, then by score
    return tools.sort((a, b) => {
      if (a.executionOrder !== undefined && b.executionOrder !== undefined) {
        return a.executionOrder - b.executionOrder
      }
      if (a.executionOrder !== undefined) return -1
      if (b.executionOrder !== undefined) return 1
      return b.rawScore - a.rawScore
    })
  }

  /**
   * 📋 Default Tool Sequencing (without orchestration plan)
   */
  private defaultToolSequencing(
    tools: Array<AdvancedToolRecommendation & { rawScore: number }>
  ): Array<AdvancedToolRecommendation & { rawScore: number }> {
    // Default sequence: read -> search -> analyze -> write -> execute
    const sequencePriority = {
      file: { read: 1, list: 2 },
      search: { search: 3, analyze: 4 },
      analysis: { analyze: 5 },
      blockchain: { blockchain: 4 },
      ai: { generate: 6 },
      command: { execute: 7 },
      git: { git: 8 },
      package: { package: 9 },
      ide: { ide: 10 },
    }

    tools.forEach((tool, index) => {
      const categoryPriority = sequencePriority[tool.category] || {}
      const toolKey = tool.tool.toLowerCase() as keyof typeof categoryPriority
      tool.executionOrder = categoryPriority[toolKey] || 100 + index
    })

    return tools.sort((a, b) => (a.executionOrder || 100) - (b.executionOrder || 100))
  }

  /**
   * ✓ Validation and Final Selection
   */
  private validateAndFinalize(
    tools: Array<AdvancedToolRecommendation & { rawScore: number }>,
    _context: RoutingContext
  ): AdvancedToolRecommendation[] {
    const validated: AdvancedToolRecommendation[] = []
    const maxTools = 5 // Limit recommendations

    for (let i = 0; i < Math.min(tools.length, maxTools); i++) {
      const tool = tools[i]

      try {
        // Validate with Zod schema
        const validatedTool = AdvancedToolRecommendation.parse({
          tool: tool.tool,
          confidence: tool.confidence,
          reason: tool.reason,
          securityLevel: tool.securityLevel,
          category: tool.category,
          suggestedParams: tool.suggestedParams,
          alternativeTools: tool.alternativeTools,
          executionOrder: tool.executionOrder,
          estimatedDuration: tool.estimatedDuration,
          requiresApproval: tool.requiresApproval,
          workspaceRestricted: tool.workspaceRestricted,
        })

        validated.push(validatedTool)
      } catch (_error) {
        console.log(chalk.yellow(`⚠️ Tool validation failed: ${tool.tool}`))
      }
    }

    return validated
  }

  // ====================== 🔧 SCORING HELPER METHODS ======================

  private scoreKeywordMatch(toolKeywords: string[], primaryAction: string): number {
    if (!toolKeywords || toolKeywords.length === 0) return 0

    for (const keyword of toolKeywords) {
      if (
        keyword.toLowerCase().includes(primaryAction.toLowerCase()) ||
        primaryAction.toLowerCase().includes(keyword.toLowerCase())
      ) {
        return 1.0
      }
    }
    return 0.0
  }

  private scoreCapabilityAlignment(toolCapabilities: string[], requiredCapabilities: string[]): number {
    if (!requiredCapabilities || requiredCapabilities.length === 0) return 0.5
    if (!toolCapabilities || toolCapabilities.length === 0) return 0.3

    let matches = 0
    for (const required of requiredCapabilities) {
      if (toolCapabilities.some((cap) => cap.includes(required) || required.includes(cap))) {
        matches++
      }
    }

    return matches / requiredCapabilities.length
  }

  private scoreSecurityLevel(toolSecurity: string, contextSecurity: string, riskLevel?: string): number {
    const securityScores = {
      strict: { safe: 1.0, moderate: 0.7, risky: 0.3, dangerous: 0.0 },
      normal: { safe: 1.0, moderate: 0.9, risky: 0.6, dangerous: 0.2 },
      permissive: { safe: 1.0, moderate: 1.0, risky: 0.8, dangerous: 0.5 },
    }

    const scores = securityScores[contextSecurity as keyof typeof securityScores] || securityScores.strict
    let score = scores[toolSecurity as keyof typeof scores] || 0

    // Adjust for risk level
    if (riskLevel === 'high' && toolSecurity === 'risky') {
      score *= 0.5 // Reduce risky tools for high-risk tasks
    }

    return score
  }

  private scoreContextRelevance(toolInfo: any, intentAnalysis: any, context: RoutingContext): number {
    let score = 0.5 // Base score

    // Project type relevance
    if (context.projectType) {
      const projectKeywords = context.projectType.toLowerCase()
      if (toolInfo.keywords.some((kw: string) => projectKeywords.includes(kw))) {
        score += 0.3
      }
    }

    // Target object relevance
    if (intentAnalysis.targetObjects?.length > 0) {
      const hasFileTargets = intentAnalysis.targetObjects.some((obj: string) => obj.includes('.'))
      if (hasFileTargets && toolInfo.category === 'file') {
        score += 0.2
      }
    }

    return Math.min(score, 1.0)
  }

  private scorePerformanceMatch(estimatedDuration: number, urgency: string): number {
    const urgencyThresholds = {
      critical: 10, // seconds
      high: 30,
      normal: 60,
      low: 120,
    }

    const threshold = urgencyThresholds[urgency as keyof typeof urgencyThresholds] || 60

    if (estimatedDuration <= threshold) {
      return 1.0
    } else if (estimatedDuration <= threshold * 2) {
      return 0.7
    } else {
      return 0.4
    }
  }

  private generateSuggestedParams(toolInfo: any, intentAnalysis: any): any {
    const params: any = {}

    // Generate tool-specific parameters based on intent analysis
    switch (toolInfo.name) {
      case 'Read':
        if (intentAnalysis.targetObjects?.length > 0) {
          params.file_path = intentAnalysis.targetObjects[0]
        }
        break
      case 'Grep':
        if (intentAnalysis.targetObjects?.length > 0) {
          params.pattern = intentAnalysis.targetObjects[0]
        }
        break
      case 'Bash':
        // Only suggest safe, common commands
        if (intentAnalysis.primaryAction === 'execute') {
          params.command = 'npm --version' // Safe fallback
        }
        break
      case 'browse_web':
        if (intentAnalysis.targetObjects?.length > 0) {
          // Look for URL-like objects
          const urlObject = intentAnalysis.targetObjects.find(
            (obj: string) => obj.startsWith('http://') || obj.startsWith('https://')
          )
          if (urlObject) {
            params.url = urlObject
            params.action = 'browseAndAnalyze'
          }
        }
        break
    }

    return Object.keys(params).length > 0 ? params : undefined
  }

  /**
   * ⚡︎ Convert basic recommendations to advanced format
   */
  private convertToAdvancedRecommendations(basic: ToolRecommendation[]): AdvancedToolRecommendation[] {
    return basic.map((rec) => ({
      tool: rec.tool,
      confidence: rec.confidence,
      reason: rec.reason,
      securityLevel: 'safe' as const,
      category: 'analysis' as const,
      suggestedParams: rec.suggestedParams,
      workspaceRestricted: true,
      requiresApproval: false,
    }))
  }

  // ====================== 🔧 UNIFIED TOOL REGISTRY INTEGRATION ======================

  /**
   * Validate tools from unified registry
   */
  private validateToolsFromRegistry(toolNames: string[], _context: RoutingContext): string[] {
    const validatedTools: string[] = []

    for (const toolName of toolNames) {
      const resolved = this.resolveToolAlias(toolName)
      const validation = this.toolRegistry.validateTool(resolved, ['read', 'write', 'execute'])

      if (validation.isValid) {
        validatedTools.push(resolved)
      } else {
        console.log(chalk.yellow(`⚠️ Tool ${resolved} validation failed:`, validation.errors))
      }
    }

    return validatedTools
  }

  /**
   * Get tools by capability from unified registry
   */
  getToolsByCapability(capability: string): string[] {
    return this.toolRegistry.searchToolsByTags([capability])
  }

  /**
   * Get tool metadata from unified registry
   */
  getToolMetadata(toolName: string) {
    return this.toolRegistry.getToolMetadata(toolName)
  }

  /**
   * Get tools by risk level from unified registry
   */
  getToolsByRiskLevel(riskLevel: 'low' | 'medium' | 'high'): string[] {
    return this.toolRegistry.listToolsByRiskLevel(riskLevel)
  }

  /**
   * Display unified tool registry stats
   */
  displayToolRegistryStats(): void {
    this.toolRegistry.displayRegistry()
  }

  /**
   * Get all tools from unified registry with categories
   */
  getAllToolsWithCategories(): { [category: string]: string[] } {
    const stats = this.toolRegistry.getToolStats()
    const tools: { [category: string]: string[] } = {}

    stats.categories.forEach((category) => {
      tools[category] = this.toolRegistry.listToolsByCategory(category)
    })

    return tools
  }

  /**
   * Get tool execution recommendations based on complexity
   */
  getOptimizedToolRecommendations(cognition: TaskCognition): AdvancedToolRecommendation[] {
    const recommendations: AdvancedToolRecommendation[] = []

    // ENHANCED complexity-based tool selection strategy
    if (cognition.estimatedComplexity <= 2) {
      // Very simple tasks - prefer efficient single tools
      const efficientTools = ['read_file', 'write_file', 'edit_file']
      efficientTools.slice(0, 2).forEach((tool) => {
        recommendations.push({
          tool,
          confidence: 0.85,
          reason: 'Simple task - efficient single tool recommended',
          securityLevel: 'safe',
          category: 'file',
          requiresApproval: false,
          workspaceRestricted: true,
        })
      })
    } else if (cognition.estimatedComplexity <= 5) {
      // Medium complexity - prefer batch/multi tools for efficiency
      const batchTools = ['multi_read', 'multi_edit', 'grep', 'find_files']
      batchTools.slice(0, 3).forEach((tool) => {
        recommendations.push({
          tool,
          confidence: 0.9,
          reason: 'Medium complexity - batch tool recommended for efficiency',
          securityLevel: 'safe',
          category: 'file',
          requiresApproval: false,
          workspaceRestricted: true,
        })
      })
    } else {
      // Complex tasks - use advanced capabilities AND batch tools
      const advancedTools = ['multi_read', 'multi_edit', 'grep', 'semantic_search', 'analyze_project']
      advancedTools.slice(0, 4).forEach((tool) => {
        recommendations.push({
          tool,
          confidence: 0.95,
          reason: 'Complex task - advanced batch tool recommended',
          securityLevel: 'moderate',
          category: 'analysis',
          requiresApproval: false,
          workspaceRestricted: true,
        })
      })

      // Also include required capabilities
      cognition.requiredCapabilities.forEach((capability) => {
        const tools = this.getToolsByCapability(capability)
        tools.slice(0, 2).forEach((tool) => {
          const metadata = this.getToolMetadata(tool)
          recommendations.push({
            tool,
            confidence: 0.9,
            reason: `Complex task requiring ${capability}`,
            securityLevel: metadata?.riskLevel === 'high' ? 'risky' : 'moderate',
            category: 'analysis',
            requiresApproval: metadata?.riskLevel === 'high',
            workspaceRestricted: true,
          })
        })
      })
    }

    return recommendations
  }

  // ====================== 📊 ANALYTICS AND MONITORING ======================

  /**
   * Get routing statistics and performance metrics
   */
  getRoutingStats(): {
    totalRoutes: number
    averageConfidence: number
    topTools: string[]
    securityDistribution: Record<string, number>
  } {
    // This would track actual routing data in a real implementation
    return {
      totalRoutes: 0,
      averageConfidence: 0.85,
      topTools: ['Read', 'Write', 'Grep', 'LS', 'Bash'],
      securityDistribution: { safe: 60, moderate: 25, risky: 15, dangerous: 0 },
    }
  }
}

// Export singleton instance
export const toolRouter = new ToolRouter()

// Export factory function for custom working directory
export const createToolRouter = (workingDirectory: string) => new ToolRouter(workingDirectory)
