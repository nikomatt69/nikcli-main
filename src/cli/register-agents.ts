import { AutonomousOrchestrator } from './automation/agents/autonomous-orchestrator'
import { CognitiveAgentBase as CognitiveAgentBaseClass } from './automation/agents/cognitive-agent-base'
import { UniversalAgent } from './automation/agents/universal-agent'
import type { AgentManager } from './core/agent-manager'
import { SecureVirtualizedAgent } from './virtualized-agents/secure-vm-agent'
import { PolymarketAgent } from './automation/agents/polymarket-agent'
export function registerAgents(agentManager: AgentManager): void {
  // Register the unified UniversalAgent for enterprise production use
  agentManager.registerAgentClass(UniversalAgent, {
    id: 'universal-agent',
    name: 'Universal Agent',
    description: 'All-in-one enterprise agent with complete coding, analysis, and autonomous capabilities',
    specialization: 'universal',
    version: '1.5.0',
    capabilities: [
      // Core capabilities
      'code-generation',
      'code-analysis',
      'code-review',
      'optimization',
      'debugging',
      'refactoring',
      'testing',

      // Frontend capabilities
      'react',
      'nextjs',
      'typescript',
      'javascript',
      'html',
      'css',
      'frontend',
      'components',
      'hooks',
      'jsx',
      'tsx',

      // Backend capabilities
      'backend',
      'nodejs',
      'api-development',
      'database',
      'server-architecture',
      'rest-api',
      'graphql',
      'microservices',

      // DevOps capabilities
      'devops',
      'ci-cd',
      'docker',
      'kubernetes',
      'deployment',
      'infrastructure',
      'monitoring',
      'security',

      // Autonomous capabilities
      'file-operations',
      'project-creation',
      'autonomous-coding',
      'system-administration',
      'full-stack-development',

      // Analysis capabilities
      'performance-analysis',
      'security-analysis',
      'quality-assessment',
      'architecture-review',
      'documentation-generation',
    ],
    category: 'enterprise',
    tags: ['universal', 'all-in-one', 'enterprise', 'autonomous', 'fullstack'],
    requiresGuidance: false,
    defaultConfig: {
      autonomyLevel: 'fully-autonomous',
      maxConcurrentTasks: 3,
      defaultTimeout: 300000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['timeout', 'network', 'temporary'],
      },
      enabledTools: ['file', 'terminal', 'git', 'npm', 'analysis'],
      guidanceFiles: [],
      logLevel: 'info',
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canDeleteFiles: true,
        allowedPaths: ['*'],
        forbiddenPaths: ['/etc', '/system'],
        canExecuteCommands: true,
        allowedCommands: ['*'],
        forbiddenCommands: ['rm -rf /', 'format', 'fdisk'],
        canAccessNetwork: true,
        allowedDomains: ['*'],
        canInstallPackages: true,
        canModifyConfig: true,
        canAccessSecrets: false,
      },
      sandboxRestrictions: [],
    },
  })
  agentManager.registerAgentClass(UniversalAgent, {
    id: 'cognitive-agent-base',
    name: 'Cognitive Agent Base',
    description:
      'Specialized cognitive agent for intelligent code generation, analysis, and autonomous development workflows',
    specialization: 'cognitive',
    version: '1.5.0',
    capabilities: [
      // Cognitive Core
      'code-generation',
      'code-analysis',
      'code-review',
      'optimization',
      'debugging',
      'refactoring',
      'testing',
      'autonomous-coding',

      // Language Stack (consolidated)
      'typescript',
      'javascript',
      'react',
      'nextjs',
      'nodejs',
      'frontend',
      'backend',
      'fullstack-development',

      // API & Services
      'api-development',
      'rest-api',
      'graphql',
      'database',
      'microservices',

      // DevOps Essentials
      'ci-cd',
      'docker',
      'deployment',
      'monitoring',

      // Intelligence & Analysis
      'performance-analysis',
      'security-analysis',
      'architecture-review',
      'quality-assessment',
      'documentation-generation',

      // Project Operations
      'file-operations',
      'project-creation',
    ],
    category: 'cognitive',
    tags: ['cognitive', 'intelligent', 'autonomous', 'production-ready'],
    requiresGuidance: false,
    defaultConfig: {
      autonomyLevel: 'fully-autonomous',
      maxConcurrentTasks: 3,
      defaultTimeout: 300000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['timeout', 'network', 'temporary'],
      },
      enabledTools: ['file', 'terminal', 'git', 'npm', 'analysis'],
      guidanceFiles: [],
      logLevel: 'info',
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canDeleteFiles: true,
        allowedPaths: ['*'],
        forbiddenPaths: ['/etc', '/system'],
        canExecuteCommands: true,
        allowedCommands: ['*'],
        forbiddenCommands: ['rm -rf /', 'format', 'fdisk'],
        canAccessNetwork: true,
        allowedDomains: ['*'],
        canInstallPackages: true,
        canModifyConfig: true,
        canAccessSecrets: false,
      },
      sandboxRestrictions: [],
    },
  })

  // Register SecureVirtualizedAgent for autonomous VM-based development
  agentManager.registerAgentClass(SecureVirtualizedAgent, {
    id: 'vm-agent',
    name: 'Secure VM Agent',
    description: 'Autonomous development agent with isolated VM environment and complete repository management',
    specialization: 'virtualized-autonomous',
    version: '1.5.0',
    capabilities: [
      // VM-specific capabilities
      'vm-management',
      'container-orchestration',
      'isolated-execution',
      'repository-cloning',
      'vscode-server',
      'autonomous-development',
      'pull-request-automation',

      // Repository analysis and management
      'repository-analysis',
      'dependency-management',
      'testing-automation',
      'documentation-generation',
      'code-quality-analysis',

      // Security capabilities
      'secure-api-communication',
      'token-budget-management',
      'audit-logging',
      'resource-isolation',
      'credential-management',

      // Development workflows
      'full-stack-development',
      'ci-cd-integration',
      'git-operations',
      'package-management',
      'environment-setup',
    ],
    category: 'enterprise-vm',
    tags: ['vm', 'isolated', 'autonomous', 'secure', 'repository'],
    requiresGuidance: false,
    defaultConfig: {
      autonomyLevel: 'fully-autonomous',
      maxConcurrentTasks: 1, // VM agents typically handle one task at a time
      defaultTimeout: 1800000, // 30 minutes for VM operations
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: 5000,
        backoffMultiplier: 2,
        retryableErrors: ['container-error', 'network', 'timeout'],
      },
      enabledTools: ['docker', 'git', 'npm', 'analysis', 'security'],
      guidanceFiles: [],
      logLevel: 'info',
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canDeleteFiles: false, // VM agents work in isolated containers
        allowedPaths: ['/workspace/*'],
        forbiddenPaths: ['/etc', '/system', '/var'],
        canExecuteCommands: true,
        allowedCommands: ['git', 'npm', 'yarn', 'docker', 'code-server'],
        forbiddenCommands: ['rm -rf', 'sudo', 'su', 'chmod 777'],
        canAccessNetwork: true,
        allowedDomains: ['github.com', 'npmjs.com', 'yarnpkg.com'],
        canInstallPackages: true,
        canModifyConfig: false, // Config handled by orchestrator
        canAccessSecrets: false, // Uses secure proxy for AI calls
      },
      sandboxRestrictions: [
        'isolated-container',
        'resource-limits',
        'network-restrictions',
        'token-budget-enforcement',
      ],
      // VM-specific configuration moved to metadata
      maxTokens: 50000,
    },
  })

  // Register PolymarketAgent for prediction market trading
  agentManager.registerAgentClass(PolymarketAgent, {
    id: 'polymarket-agent',
    name: 'Polymarket Trading Agent',
    description: 'Specialized agent for Polymarket prediction market operations with order placement, market analysis, and risk assessment',
    specialization: 'prediction-market-trading',
    version: '1.0.0',
    capabilities: [
      // Market operations
      'market-analysis',
      'order-placement',
      'order-cancellation',
      'order-management',
      'market-monitoring',

      // Risk management
      'risk-assessment',
      'risk-management',
      'position-management',
      'portfolio-rebalancing',

      // Data and analysis
      'sentiment-analysis',
      'real-time-data',
      'orderbook-analysis',
      'price-analysis',

      // Builder program
      'builder-attribution',
      'gas-optimization',
      'revenue-sharing',

      // Trading strategies
      'market-making',
      'arbitrage-detection',
      'order-optimization',
    ],
    category: 'trading',
    tags: ['polymarket', 'prediction-markets', 'trading', 'autonomous', 'defi'],
    requiresGuidance: false,
    defaultConfig: {
      autonomyLevel: 'fully-autonomous',
      maxConcurrentTasks: 5,
      defaultTimeout: 600000, // 10 minutes for market operations
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000,
        backoffMultiplier: 2,
        retryableErrors: ['rate-limit', 'network', 'temporary'],
      },
      enabledTools: ['polymarket-native', 'websocket', 'builder-signing', 'risk-calculator'],
      guidanceFiles: [],
      logLevel: 'info',
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canDeleteFiles: false,
        allowedPaths: [],
        forbiddenPaths: ['*'],
        canExecuteCommands: false,
        allowedCommands: [],
        forbiddenCommands: ['*'],
        canAccessNetwork: true,
        allowedDomains: ['clob.polymarket.com', 'gamma.polymarket.com', 'ws-subscriptions-clob.polymarket.com'],
        canInstallPackages: false,
        canModifyConfig: false,
        canAccessSecrets: true, // Needs access to private key and builder credentials
      },
      sandboxRestrictions: [
        'network-api-only',
        'no-file-system',
        'no-command-execution',
        'credential-isolation',
      ],
    },
  })
}
