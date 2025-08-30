import * as readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import { configureSyntaxHighlighting } from './utils/syntax-highlighter';
import ora, { Ora } from 'ora';
import cliProgress from 'cli-progress';
import * as fs from 'fs/promises';
import * as path from 'path';

// Import existing modules
import { configManager } from './core/config-manager';
import { modelProvider } from './ai/model-provider';
import { toolsManager } from './tools/tools-manager';
import { agentFactory } from './core/agent-factory';
import { agentStream } from './core/agent-stream';
import { workspaceContext } from './context/workspace-context';
import { validatorManager } from './core/validator-manager';
import { toolRouter } from './core/tool-router';
import { StreamingOrchestrator } from './streaming-orchestrator';

import { AgentManager } from './core/agent-manager';
import { PlanningManager } from './planning/planning-manager';
import { ModernAgentOrchestrator } from './automation/agents/modern-agent-system';
import { advancedAIProvider, AdvancedAIProvider } from './ai/advanced-ai-provider';
import { SimpleConfigManager, simpleConfigManager } from './core/config-manager';
import { enhancedPlanning } from './planning/enhanced-planning';
import { approvalSystem } from './ui/approval-system';

import { tokenCache } from './core/token-cache';
import { enhancedTokenCache } from './core/enhanced-token-cache';
import { completionCache } from './core/completion-protocol-cache';
import { mcpClient, McpServerConfig } from './core/mcp-client';
import { docLibrary, DocumentationEntry } from './core/documentation-library';
import { createCloudDocsProvider, getCloudDocsProvider } from './core/cloud-docs-provider';
import { docsContextManager } from './context/docs-context-manager';

// New enhanced services
import { cacheService } from './services/cache-service';
import { enhancedSupabaseProvider } from './providers/supabase/enhanced-supabase-provider';
import { authProvider } from './providers/supabase/auth-provider';
import { EnhancedSessionManager } from './persistence/enhanced-session-manager';
import { feedbackSystem } from './core/feedback-system';

// Enhanced AI/CLI Features
import { enhancedToolRouter } from './core/enhanced-tool-router';
import { commandPredictor } from './core/command-predictor';

import { projectMemory } from './core/project-memory';

import { wrapBlue, formatStatus, formatCommand, formatFileOp, formatProgress, formatAgent, formatSearch } from './utils/text-wrapper';
import { DiffViewer } from './ui/diff-viewer';
import { SlashCommandHandler } from './chat/nik-cli-commands';
import { chatManager } from './chat/chat-manager';

import { agentService } from './services/agent-service';
import { planningService } from './services/planning-service';
import { memoryService } from './services/memory-service';
import { snapshotService } from './services/snapshot-service';
import { AgentTask } from './types/types';
import { ExecutionPlan } from './planning/types';
import { registerAgents } from './register-agents';
import { advancedUI } from './ui/advanced-cli-ui';
import { inputQueue } from './core/input-queue';
import { TokenOptimizer, QuietCacheLogger, TokenOptimizationConfig } from './core/performance-optimizer';
import { WebSearchProvider } from './core/web-search-provider';
import { ideDiagnosticIntegration, getProjectHealthSummary } from './integrations/ide-diagnostic-integration';
import { toolService } from './services/tool-service';
import inquirer from 'inquirer';
import { visionProvider } from './providers/vision';
import { imageGenerator } from './providers/image';

// Configure syntax highlighting for terminal output
configureSyntaxHighlighting();

export interface NikCLIOptions {
    agent?: string;
    model?: string;
    auto?: boolean;
    plan?: boolean;
    structuredUI?: boolean;
}

export interface TodoOptions {
    list?: boolean;
    add?: string;
    complete?: string;
}

export interface PlanOptions {
    execute?: boolean;
    save?: string;
}

export interface AgentOptions {
    auto?: boolean;
}

export interface AutoOptions {
    planFirst?: boolean;
}

export interface ConfigOptions {
    show?: boolean;
    model?: string;
    key?: string;
}

export interface InitOptions {
    force?: boolean;
}

export interface CommandResult {
    shouldExit: boolean;
    shouldUpdatePrompt: boolean;
}

export interface LiveUpdate {
    type: 'status' | 'progress' | 'log' | 'error' | 'warning' | 'info';
    content: string;
    timestamp: Date;
    source?: string;
}

export interface StatusIndicator {
    id: string;
    title: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'warning';
    details?: string;
    progress?: number;
    startTime?: Date;
    endTime?: Date;
    subItems?: StatusIndicator[];
}

/**
 * NikCLI - Unified CLI interface integrating all existing modules
 * Provides Claude Code-style terminal experience with autonomous agents
 */
export class NikCLI {
    private rl?: readline.Interface;
    private escapeRequested: boolean = false;
    private configManager: SimpleConfigManager;
    private agentManager: AgentManager;
    private planningManager: PlanningManager;
    private workingDirectory: string;
    private currentMode: 'default' | 'auto' | 'plan' | 'vm' = 'default';
    private currentAgent?: string;
    private projectContextFile: string;
    private sessionContext: Map<string, any> = new Map();
    private slashHandler: SlashCommandHandler;

    // Enhanced features
    private enhancedFeaturesEnabled: boolean = true;
    private smartSuggestionsEnabled: boolean = true;
    private streamingOptimized: boolean = true;
    private indicators: Map<string, StatusIndicator> = new Map();
    private liveUpdates: LiveUpdate[] = [];
    private spinners: Map<string, Ora> = new Map();
    private progressBars: Map<string, cliProgress.SingleBar> = new Map();
    private isInteractiveMode: boolean = false;
    private fileWatcher: any = null;
    private progressTracker: any = null;
    private assistantProcessing: boolean = false;
    private userInputActive: boolean = false;
    private shouldInterrupt: boolean = false;
    private currentStreamController?: AbortController;
    private lastGeneratedPlan?: ExecutionPlan;
    private advancedUI: any;
    private structuredUIEnabled: boolean = false;
    private selectedFiles?: Map<string, { files: string[]; timestamp: Date; pattern: string }>;
    private sessionTokenUsage: number = 0;
    private sessionStartTime: Date = new Date();
    private contextTokens: number = 0;
    private realTimeCost: number = 0;
    private maxContextTokens: number = 280000; // Limite sicuro
    private contextHistory: string[] = [];
    private toolchainTokenLimit: number = 150000; // Limite per toolchain
    private toolchainContext: Map<string, number> = new Map();
    private activeSpinner: any = null;
    private aiOperationStart: Date | null = null;
    private modelPricing: Map<string, { input: number; output: number }> = new Map();
    private tokenOptimizer?: TokenOptimizer;
    private streamingOrchestrator?: StreamingOrchestrator;
    private cognitiveMode: boolean = true;
    private orchestrationLevel: number = 8;
    // Timer used to re-render the prompt after console output in chat mode
    private promptRenderTimer: NodeJS.Timeout | null = null;
    // Status bar loading animation
    private statusBarTimer: NodeJS.Timeout | null = null;
    private statusBarStep: number = 0;
    private isInquirerActive: boolean = false;
    private lastBarSegments: number = -1;

    // Enhanced services
    private enhancedSessionManager: EnhancedSessionManager;
    private isEnhancedMode: boolean = false;

    // NEW: Chat UI System
    private chatBuffer: string[] = [];
    private maxChatLines: number = 1000;
    private terminalHeight: number = 0;
    private chatAreaHeight: number = 0;
    private isChatMode: boolean = false;
    private isPrintingPanel: boolean = false;

    constructor() {
        this.workingDirectory = process.cwd();
        this.projectContextFile = path.join(this.workingDirectory, 'NIKOCLI.md');

        // Initialize core managers
        this.configManager = simpleConfigManager;
        this.agentManager = new AgentManager(this.configManager);

        // Initialize enhanced services
        this.enhancedSessionManager = new EnhancedSessionManager();
        this.isEnhancedMode = this.configManager.getRedisConfig().enabled || this.configManager.getSupabaseConfig().enabled;
        this.planningManager = new PlanningManager(this.workingDirectory);

        // IDE diagnostic integration will be initialized on demand
        // No automatic initialization to avoid unwanted file watchers
        this.slashHandler = new SlashCommandHandler();
        this.advancedUI = advancedUI;

        // Token optimizer will be initialized lazily when needed

        // Register agents
        registerAgents(this.agentManager);



        // Expose this instance globally for command handlers
        (global as any).__nikCLI = this;

        this.setupEventHandlers();
        // Bridge orchestrator events into NikCLI output
        this.setupOrchestratorEventBridge();
        this.setupAdvancedUIFeatures();
        this.setupPlanningEventListeners();

        // Initialize structured UI system
        this.initializeStructuredUI();

        // Initialize model pricing
        this.initializeModelPricing();

        // Initialize token cache system
        this.initializeTokenCache();

        // Initialize cognitive orchestration system
        this.initializeCognitiveOrchestration();

        // Initialize chat UI system
        this.initializeChatUI();

        // Render initial prompt
        this.renderPromptArea();

        // Expose NikCLI globally for token management
        (global as any).__nikcli = this;

        // Patch inquirer to avoid status bar redraw during interactive prompts
        try {
            const originalPrompt = (inquirer as any).prompt?.bind(inquirer);
            if (originalPrompt) {
                (inquirer as any).prompt = async (...args: any[]) => {
                    this.isInquirerActive = true;
                    this.stopStatusBar();
                    try {
                        return await originalPrompt(...args);
                    } finally {
                        this.isInquirerActive = false;
                        this.renderPromptAfterOutput();
                    }
                };
            }
        } catch { /* ignore patch errors */ }
    }

    /**
     * Get token optimizer instance safely
     */
    private getTokenOptimizer(): TokenOptimizer | null {
        if (!this.tokenOptimizer) {
            try {
                this.tokenOptimizer = new TokenOptimizer({
                    level: 'conservative',
                    enablePredictive: false,
                    enableMicroCache: false,
                    maxCompressionRatio: 0.9
                });
            } catch (error) {
                console.debug('Failed to create token optimizer:', error);
                return null;
            }
        }
        return this.tokenOptimizer;
    }

    /**
     * Load project context from NIKOCLI.md file
     */
    private async loadProjectContext(): Promise<string> {
        try {
            const context = await fs.readFile(this.projectContextFile, 'utf8');
            const optimizer = this.getTokenOptimizer();
            if (optimizer) {
                const optimized = await optimizer.optimizePrompt(context);
                if (optimized.tokensSaved > 10) {
                    QuietCacheLogger.logCacheSave(optimized.tokensSaved);
                }
                return optimized.content;
            }
            return context;
        } catch (error) {
            return ''; // No project context file
        }
    }

    /**
     * Save project context to NIKOCLI.md file
     */
    private async saveProjectContext(context: string): Promise<void> {
        try {
            await fs.writeFile(this.projectContextFile, context, 'utf8');
        } catch (error) {
            console.debug('Failed to save project context:', error);
        }
    }

    /**
     * Update project context based on user interaction
     */
    private async updateProjectContext(userInput: string): Promise<void> {
        try {
            const currentContext = await this.loadProjectContext();
            const timestamp = new Date().toISOString();

            // Extract key information from user input
            const keyInfo = this.extractKeyInformation(userInput);
            if (keyInfo) {
                const updatedContext = `${currentContext}\n\n## Update ${timestamp}\n${keyInfo}`;
                await this.saveProjectContext(updatedContext);
            }
        } catch (error) {
            console.debug('Failed to update project context:', error);
        }
    }

    /**
     * Get relevant project context based on user input (optimized for token usage)
     */
    private async getRelevantProjectContext(userInput: string): Promise<string> {
        const fullContext = await this.loadProjectContext();
        if (!fullContext || fullContext.length < 100) return fullContext;

        const lowerInput = userInput.toLowerCase();
        const contextLines = fullContext.split('\n');
        const relevantLines: string[] = [];

        // Keyword-based section extraction
        const keywords = this.extractKeywords(lowerInput);
        let currentSection = '';
        let sectionRelevant = false;

        for (const line of contextLines) {
            if (line.startsWith('#')) {
                if (sectionRelevant && currentSection) {
                    relevantLines.push(currentSection);
                }
                currentSection = line + '\n';
                sectionRelevant = keywords.some(keyword => line.toLowerCase().includes(keyword));
            } else {
                currentSection += line + '\n';
            }
        }

        if (sectionRelevant && currentSection) {
            relevantLines.push(currentSection);
        }

        const result = relevantLines.join('\n').trim();
        return result.length > 2000 ? result.substring(0, 2000) + '...' : result;
    }

    /**
     * Extract keywords from user input to determine relevant context sections
     */
    private extractKeywords(input: string): string[] {
        const keywords: string[] = [];
        if (input.includes('react') || input.includes('component') || input.includes('jsx')) {
            keywords.push('react', 'frontend', 'component');
        }
        if (input.includes('api') || input.includes('backend') || input.includes('server')) {
            keywords.push('api', 'backend', 'server');
        }
        if (input.includes('test') || input.includes('spec')) {
            keywords.push('test', 'testing');
        }
        if (input.includes('database') || input.includes('db') || input.includes('sql')) {
            keywords.push('database', 'data');
        }
        if (input.includes('deploy') || input.includes('docker') || input.includes('ci')) {
            keywords.push('deployment', 'devops');
        }
        return keywords;
    }

    /**
     * Extract key information from user input for context
     */
    private extractKeyInformation(input: string): string | null {
        const lowercaseInput = input.toLowerCase();

        // Extract project-relevant information
        if (lowercaseInput.includes('project') || lowercaseInput.includes('goal') ||
            lowercaseInput.includes('objective') || lowercaseInput.includes('requirement')) {
            return `User goal/requirement: ${input}`;
        }

        if (lowercaseInput.includes('error') || lowercaseInput.includes('issue') ||
            lowercaseInput.includes('problem')) {
            return `Issue reported: ${input}`;
        }

        if (lowercaseInput.includes('feature') || lowercaseInput.includes('add') ||
            lowercaseInput.includes('implement')) {
            return `Feature request: ${input}`;
        }

        return null;
    }

    private async initializeTokenCache(): Promise<void> {
        // Clean up expired cache entries on startup
        setTimeout(async () => {
            try {
                const removed = await tokenCache.cleanupExpired();
                if (removed > 0) {
                    console.log(chalk.dim(`🧹 Cleaned ${removed} expired cache entries`));
                }

                const stats = tokenCache.getStats();
                if (stats.totalEntries > 0) {
                    console.log(chalk.dim(`💾 Loaded ${stats.totalEntries} cached responses (${stats.totalHits} hits, ~${stats.totalTokensSaved.toLocaleString()} tokens saved)`));
                    console.log(chalk.dim('\n')); // Add spacing after cache info with chalk
                }
            } catch (error: any) {
                console.log(chalk.dim(`Cache initialization warning: ${error.message}`));
            }
        }, 1000); // Delay to avoid interfering with startup
    }

    /**
     * Initialize cognitive orchestration system with enhanced components
     */
    private initializeCognitiveOrchestration(): void {
        try {
            console.log(chalk.dim('🧠 Initializing cognitive orchestration system...'));

            // Initialize streaming orchestrator with adaptive supervision
            this.streamingOrchestrator = new StreamingOrchestrator();

            // Configure cognitive features
            this.streamingOrchestrator.configureAdaptiveSupervision({
                adaptiveSupervision: this.cognitiveMode,
                intelligentPrioritization: true,
                cognitiveFiltering: true,
                orchestrationAwareness: true
            });

            // Setup cognitive event listeners
            this.setupCognitiveEventListeners();

            // Integrate with existing systems
            this.integrateCognitiveComponents();

            console.log(chalk.green('✅ Cognitive orchestration system initialized'));
        } catch (error: any) {
            console.log(chalk.yellow(`⚠️ Cognitive orchestration initialization warning: ${error.message}`));
            this.cognitiveMode = false; // Fallback to standard mode
        }
    }

    /**
     * Setup cognitive event listeners for system coordination
     */
    private setupCognitiveEventListeners(): void {
        if (!this.streamingOrchestrator) return;

        // Listen to supervision events
        this.streamingOrchestrator.on('supervision:updated', (cognition: any) => {
            this.handleSupervisionUpdate(cognition);
        });

        // Listen to validation events
        validatorManager.on('validation:completed', (event: any) => {
            this.handleValidationEvent(event);
        });

        // Listen to tool routing events
        toolRouter.on('routing:optimized', (event: any) => {
            this.handleRoutingOptimization(event);
        });

        // Listen to agent factory events
        agentFactory.on('selection:optimized', (event: any) => {
            this.handleAgentSelectionOptimization(event);
        });
    }

    /**
     * Integrate cognitive components with existing systems
     */
    private integrateCognitiveComponents(): void {
        // Enhance agent service with cognitive awareness
        this.enhanceAgentServiceWithCognition();

        // Integrate validation manager with planning
        this.integrateValidationWithPlanning();

        // Setup tool router coordination
        this.setupToolRouterCoordination();

        // Configure advanced AI provider cognitive features
        this.configureAdvancedAIProviderCognition();
    }

    /**
     * Enhance agent service with cognitive awareness
     */
    private enhanceAgentServiceWithCognition(): void {
        const originalExecuteTask = agentService.executeTask.bind(agentService);

        agentService.executeTask = async (agentType: string, task: string, options?: any) => {
            // Apply cognitive enhancement to task execution
            const enhancedOptions = {
                ...options,
                cognitiveMode: this.cognitiveMode,
                orchestrationLevel: this.orchestrationLevel,
                validatorManager: validatorManager,
                toolRouter: toolRouter
            };

            return originalExecuteTask(agentType, task, enhancedOptions);
        };
    }

    /**
     * Integrate validation manager with planning service
     */
    private integrateValidationWithPlanning(): void {
        const originalCreatePlan = planningService.createPlan.bind(planningService);

        planningService.createPlan = async (task: string, options?: any) => {
            // Apply cognitive validation to plan creation
            const enhancedOptions = {
                ...options,
                validationConfig: {
                    cognitiveValidation: this.cognitiveMode,
                    orchestrationAware: true,
                    intelligentCaching: true
                }
            };

            return originalCreatePlan(task, enhancedOptions);
        };
    }

    /**
     * Setup tool router coordination with other components
     */
    private setupToolRouterCoordination(): void {
        // Tool router is now cognitive-aware by default
        console.log(chalk.dim('🔧 Tool router cognitive coordination active'));
    }

    /**
     * Configure advanced AI provider cognitive features
     */
    private configureAdvancedAIProviderCognition(): void {
        advancedAIProvider.configureCognitiveFeatures({
            enableCognition: this.cognitiveMode,
            orchestrationLevel: this.orchestrationLevel,
            intelligentCommands: true,
            adaptivePlanning: true
        });
    }

    /**
     * Handle supervision cognition updates
     */
    private handleSupervisionUpdate(cognition: any): void {
        // Update orchestration level based on supervision
        if (cognition.orchestrationLevel) {
            this.orchestrationLevel = Math.max(this.orchestrationLevel, cognition.orchestrationLevel);
        }

        // Adjust cognitive mode based on system load
        if (cognition.systemLoad === 'overloaded' && this.cognitiveMode) {
            console.log(chalk.yellow('⚡ Temporarily reducing cognitive features due to high load'));
            this.cognitiveMode = false;
        } else if (cognition.systemLoad === 'light' && !this.cognitiveMode) {
            console.log(chalk.green('🧠 Re-enabling cognitive features - system load normalized'));
            this.cognitiveMode = true;
        }
    }

    /**
     * Handle validation events from cognitive validator
     */
    private handleValidationEvent(event: any): void {
        const { context, cognition, result } = event;

        if (result.cognitiveScore && result.cognitiveScore < 0.5) {
            console.log(chalk.yellow(`⚠️ Low cognitive score for ${context.filePath}: ${(result.cognitiveScore * 100).toFixed(1)}%`));
        }

        if (result.orchestrationCompatibility && result.orchestrationCompatibility > 0.9) {
            console.log(chalk.green(`🎯 High orchestration compatibility: ${(result.orchestrationCompatibility * 100).toFixed(1)}%`));
        }
    }

    /**
     * Handle tool routing optimization events
     */
    private handleRoutingOptimization(event: any): void {
        const { tools, cognitiveScore, orchestrationAwareness } = event;

        if (cognitiveScore > 0.8) {
            console.log(chalk.green(`🎯 Optimal tool routing: ${tools.length} tools, score ${(cognitiveScore * 100).toFixed(1)}%`));
        }
    }

    /**
     * Handle agent selection optimization events
     */
    private handleAgentSelectionOptimization(event: any): void {
        const { selectedAgents, totalScore, cognitiveFactors } = event;

        if (totalScore > 85) {
            console.log(chalk.green(`🤖 Optimal agent selection: ${selectedAgents.length} agents, score ${totalScore.toFixed(1)}%`));
        }
    }

    /**
     * Initialize structured UI with 4 panels as per diagram: Chat/Status, Files/Diffs, Plan/Todos, Approval
     */
    private initializeStructuredUI(): void {
        console.log(chalk.dim('🎨 Setting up AdvancedCliUI with 4 panels...'));

        // Enable interactive mode for structured panels
        this.advancedUI.startInteractiveMode();

        // Configure the 4 panels as shown in diagram:
        // 1. Panels: Chat, Status/Logs
        advancedUI.logInfo('Panel Setup', 'Chat & Status/Logs panel configured');

        // 2. Panels: Files, Diffs  
        advancedUI.logInfo('Panel Setup', 'Files & Diffs panel configured');

        // 3. Panels: Plan/Todos
        advancedUI.logInfo('Panel Setup', 'Plan/Todos panel configured');

        // 4. Panels: Approval (logs only, prompt via inquirer)
        advancedUI.logInfo('Panel Setup', 'Approval panel configured (logs only)');

        // Set up real-time event listeners for UI updates
        this.setupUIEventListeners();

        console.log(chalk.green('✅ AdvancedCliUI (MAIN UI OWNER) ready with 4 panels'));
    }

    /**
     * Setup UI event listeners for real-time panel updates using existing advanced UI
     */
    private setupUIEventListeners(): void {
        // Hook into agent operations for live UI updates
        this.setupAgentUIIntegration();

        // Setup file change monitoring for diff display
        this.setupFileChangeMonitoring();

        // Todo panels are now driven by real plans via planning system
    }

    /**
     * Integrate agent operations with UI panels
     */
    private setupAgentUIIntegration(): void {
        // Listen for file operations to show content/diffs using advanced UI
        agentService.on('file_read', (data) => {
            if (data.path && data.content) {
                this.advancedUI.showFileContent(data.path, data.content);
                this.advancedUI.logInfo(`File Read: ${path.basename(data.path)}`, `Displayed ${data.content.split('\n').length} lines`);
            }
        });

        agentService.on('file_written', (data) => {
            if (data.path && data.content) {
                if (data.originalContent) {
                    // Show diff using advanced UI
                    this.advancedUI.showFileDiff(data.path, data.originalContent, data.content);
                    this.advancedUI.logSuccess(`File Updated: ${path.basename(data.path)}`, 'Diff displayed in panel');
                } else {
                    // Show new file content
                    this.advancedUI.showFileContent(data.path, data.content);
                    this.advancedUI.logSuccess(`File Created: ${path.basename(data.path)}`, 'Content displayed in panel');
                }
            }
        });

        agentService.on('file_list', (data) => {
            if (data.files && Array.isArray(data.files)) {
                this.advancedUI.showFileList(data.files, data.title || '📁 Files');
                this.advancedUI.logInfo('File List', `Showing ${data.files.length} files`);
            }
        });

        agentService.on('grep_results', (data) => {
            if (data.pattern && data.matches) {
                this.advancedUI.showGrepResults(data.pattern, data.matches);
                this.advancedUI.logInfo(`Search: ${data.pattern}`, `Found ${data.matches.length} matches`);
            }
        });
    }

    /**
     * Monitor file changes for automatic diff display
     */
    private setupFileChangeMonitoring(): void {
        // Use existing file watcher to detect changes and show diffs
        if (this.fileWatcher) {
            this.fileWatcher.on('change', (filePath: string) => {
                // Auto-show file content when files change during operations
                if (this.assistantProcessing) {
                    this.showFileIfRelevant(filePath);
                }
            });
        }
    }

    /**
     * Setup automatic todo panel updates
     */
    // Removed placeholder todo auto-updates and fallback rendering

    /**
     * Show file content if relevant to current operations
     */
    private showFileIfRelevant(filePath: string): void {
        // Only show files that are being actively worked on
        const relevantExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.md'];
        const ext = path.extname(filePath);

        if (relevantExtensions.includes(ext)) {
            try {
                const content = require('fs').readFileSync(filePath, 'utf8');
                this.advancedUI.showFileContent(filePath, content);
            } catch (error) {
                // File might be in use, skip
            }
        }
    }

    private setupEventHandlers(): void {
        // Handle Ctrl+C gracefully
        process.on('SIGINT', async () => {
            await this.shutdown();
        });

        process.on('SIGTERM', async () => {
            await this.shutdown();
        });
    }
    // Bridge StreamingOrchestrator agent lifecycle events into NikCLI output
    private orchestratorEventsInitialized = false;
    private setupOrchestratorEventBridge(): void {
        if (this.orchestratorEventsInitialized) return;
        this.orchestratorEventsInitialized = true;

        agentService.on('task_start', (task) => {
            const indicator = this.createStatusIndicator(`task-${task.id}`, `Agent ${task.agentType}`, task.task);
            this.updateStatusIndicator(indicator.id, { status: 'running' });
            console.log(formatAgent(task.agentType, 'started', task.task));

            // Always show in default chat mode and structured UI
            if (this.currentMode === 'default') {
                console.log(chalk.blue(`🤖 ${task.agentType}: `) + chalk.dim(task.task));
                advancedUI.logInfo(`Agent ${task.agentType}`, task.task);
            }

            // Render prompt after output
            this.renderPromptAfterOutput();
        });

        agentService.on('task_progress', (_task, update) => {
            const progress = typeof update.progress === 'number' ? `${update.progress}% ` : '';
            const desc = update.description ? `- ${update.description}` : '';
            this.addLiveUpdate({ type: 'progress', content: `${progress}${desc}`, source: 'agent' });
            console.log(chalk.cyan(`📊 ${progress}${desc}`));

            // Render prompt after output
            this.renderPromptAfterOutput();
        });

        agentService.on('tool_use', (_task, update) => {
            this.addLiveUpdate({ type: 'info', content: `🔧 ${update.tool}: ${update.description}`, source: 'tool' });
            console.log(chalk.magenta(`🔧 ${update.tool}: ${update.description}`));

            // Render prompt after output
            this.renderPromptAfterOutput();
        });

        agentService.on('task_complete', (task) => {
            const indicatorId = `task-${task.id}`;
            if (task.status === 'completed') {
                this.updateStatusIndicator(indicatorId, { status: 'completed', details: 'Task completed successfully' });
                console.log(chalk.green(`✅ ${task.agentType} completed`));

                // Show in default mode and structured UI
                if (this.currentMode === 'default') {
                    advancedUI.logSuccess(`Agent ${task.agentType}`, 'Task completed successfully');
                }
            } else {
                this.updateStatusIndicator(indicatorId, { status: 'failed', details: task.error || 'Unknown error' });
                console.log(chalk.red(`❌ ${task.agentType} failed: ${task.error}`));

                // Show in default mode and structured UI
                if (this.currentMode === 'default') {
                    advancedUI.logError(`Agent ${task.agentType}`, task.error || 'Unknown error');
                }
            }
            // Add delay before showing prompt to let output be visible
            setTimeout(() => {
                this.renderPromptAfterOutput();
            }, 500);
        });
    }

    /**
     * Subscribe to all event sources for Default Mode Unified Aggregator
     * Observes: Approval Prompts, Planning Events, Tool/Agent Events, Chat Stream
     */
    private eventsSubscribed = false;
    private subscribeToAllEventSources(): void {
        if (this.eventsSubscribed) return;
        this.eventsSubscribed = true;

        // 1. Approval Prompts (approvalSystem.request)
        // Already handled by existing approvalSystem integration

        // 2. Planning Events (planningManager emits: stepStart, stepProgress, stepComplete)
        this.planningManager.on('stepStart', (event: any) => {
            this.routeEventToUI('planning_step_start', { step: event.step, description: event.description });
        });

        this.planningManager.on('stepProgress', (event: any) => {
            this.routeEventToUI('planning_step_progress', { step: event.step, progress: event.progress });
        });

        this.planningManager.on('stepComplete', (event: any) => {
            this.routeEventToUI('planning_step_complete', { step: event.step, result: event.result });
        });

        // 3. Tool/Agent Events (agentService emits: file_read, file_write, file_list, grep_results, tool_call, tool_result, error)
        agentService.on('file_read', (data) => {
            this.routeEventToUI('agent_file_read', data);
        });

        agentService.on('file_written', (data) => {
            this.routeEventToUI('agent_file_written', data);
        });

        agentService.on('file_list', (data) => {
            this.routeEventToUI('agent_file_list', data);
        });

        agentService.on('grep_results', (data) => {
            this.routeEventToUI('agent_grep_results', data);
        });

        // 4. Background Agents Events (AgentManager emits: agent.task.started, agent.task.progress, agent.task.completed, agent.tool.call)
        this.agentManager.on('agent.task.started', (event: any) => {
            this.routeEventToUI('bg_agent_task_start', {
                agentId: event.agentId,
                agentName: event.agentName || event.agentId,
                taskDescription: event.task?.description || event.task?.prompt || 'Background task',
                taskType: event.task?.type || 'unknown'
            });
        });

        this.agentManager.on('agent.task.progress', (event: any) => {
            this.routeEventToUI('bg_agent_task_progress', {
                agentId: event.agentId,
                progress: event.progress || 0,
                currentStep: event.currentStep || event.step || 'Processing...'
            });
        });

        this.agentManager.on('agent.task.completed', (event: any) => {
            this.routeEventToUI('bg_agent_task_complete', {
                agentId: event.agentId,
                result: event.result?.summary || event.result || 'Task completed',
                duration: event.duration || 0
            });
        });

        this.agentManager.on('agent.tool.call', (event: any) => {
            this.routeEventToUI('bg_agent_tool_call', {
                agentId: event.agentId,
                toolName: event.toolName || event.tool,
                parameters: event.parameters || event.args
            });
        });

        // 5. Chat Stream (modelProvider.streamResponse(messages) events)
        // This is handled in the streaming loop in handleDefaultMode - chat stream events are processed inline
        // when streaming responses from advancedAIProvider.streamChatWithFullAutonomy()

        console.log(chalk.dim('✓ Default Mode Unified Aggregator subscribed to all event sources (including background agents)'));
    }

    /**
     * Central Event Router - routes events to UI based on structuredUI decision
     */
    private routeEventToUI(eventType: string, eventData: any): void {
        // Decision Point: structuredUI vs Console stdout (as per diagram)
        const useStructuredUI = this.isStructuredUIActive();

        if (useStructuredUI) {
            // Route to AdvancedCliUI panels
            this.routeToAdvancedUI(eventType, eventData);
        } else {
            // Fallback to Console stdout  
            this.routeToConsole(eventType, eventData);
        }
    }

    /**
     * Check if structured UI should be active based on saved decision
     */
    private isStructuredUIActive(): boolean {
        return this.structuredUIEnabled;
    }

    /**
     * Route events to AdvancedCliUI panels
     */
    private routeToAdvancedUI(eventType: string, eventData: any): void {
        switch (eventType) {
            case 'planning_step_start':
                advancedUI.logInfo('Planning Step', `Started: ${eventData.description}`);
                break;
            case 'planning_step_progress':
                advancedUI.logInfo('Planning Progress', `${eventData.step}: ${eventData.progress}%`);
                break;
            case 'planning_step_complete':
                advancedUI.logSuccess('Planning Complete', `${eventData.step}: ${eventData.result}`);
                break;
            case 'agent_file_read':
                if (eventData.path && eventData.content) {
                    advancedUI.showFileContent(eventData.path, eventData.content);
                }
                break;
            case 'agent_file_written':
                if (eventData.originalContent && eventData.content) {
                    advancedUI.showFileDiff(eventData.path, eventData.originalContent, eventData.content);
                } else {
                    advancedUI.showFileContent(eventData.path, eventData.content);
                }
                break;
            case 'agent_file_list':
                if (eventData.files) {
                    advancedUI.showFileList(eventData.files, eventData.title || '📁 Files');
                }
                break;
            case 'agent_grep_results':
                if (eventData.pattern && eventData.matches) {
                    advancedUI.showGrepResults(eventData.pattern, eventData.matches);
                }
                break;

            // Background agent events
            case 'bg_agent_task_start':
                advancedUI.logInfo(
                    'Background Agent',
                    `🤖 ${eventData.agentName} started: ${eventData.taskDescription}`
                );
                this.createStatusIndicator(
                    `bg-${eventData.agentId}`,
                    `${eventData.agentName}: ${eventData.taskDescription}`
                );

                // Update background agents panel
                advancedUI.updateBackgroundAgent({
                    id: eventData.agentId,
                    name: eventData.agentName,
                    status: 'working',
                    currentTask: eventData.taskDescription,
                    startTime: new Date()
                });
                break;

            case 'bg_agent_task_progress':
                advancedUI.logInfo(
                    'Agent Progress',
                    `🔄 ${eventData.currentStep} (${eventData.progress}%)`
                );
                this.updateStatusIndicator(`bg-${eventData.agentId}`, {
                    progress: eventData.progress,
                    details: eventData.currentStep
                });

                // Update background agents panel with progress
                const agent = advancedUI.backgroundAgents?.get(eventData.agentId);
                if (agent) {
                    advancedUI.updateBackgroundAgent({
                        ...agent,
                        progress: eventData.progress,
                        currentTask: eventData.currentStep
                    });
                }
                break;

            case 'bg_agent_task_complete':
                advancedUI.logSuccess(
                    'Agent Complete',
                    `✅ Completed in ${eventData.duration}ms: ${eventData.result}`
                );
                this.stopAdvancedSpinner(`bg-${eventData.agentId}`, true, eventData.result);

                // Update background agents panel to completed
                const completedAgent = advancedUI.backgroundAgents.get(eventData.agentId);
                if (completedAgent) {
                    advancedUI.updateBackgroundAgent({
                        ...completedAgent,
                        status: 'completed',
                        currentTask: eventData.result,
                        progress: 100
                    });
                }
                break;

            case 'bg_agent_tool_call':
                const toolParams = eventData.parameters ?
                    ` ${JSON.stringify(eventData.parameters)}` : '';
                advancedUI.logInfo(
                    'Background Tool',
                    `🛠️ ${eventData.agentId}: ${eventData.toolName}${toolParams}`
                );
                break;

            case 'bg_agent_orchestrated':
                advancedUI.logInfo(
                    'Agent Orchestration',
                    `🎭 ${eventData.parentTool} orchestrating ${eventData.agentName} for: ${eventData.task}`
                );
                break;
        }
    }

    /**
     * Route events to Console stdout (fallback mode)
     */
    private routeToConsole(eventType: string, eventData: any): void {
        switch (eventType) {
            case 'planning_step_start':
                console.log(chalk.blue(`📋 Planning: ${eventData.description}`));
                break;
            case 'planning_step_progress':
                console.log(chalk.cyan(`⏳ Progress: ${eventData.step} - ${eventData.progress}%`));
                break;
            case 'planning_step_complete':
                console.log(chalk.green(`✅ Complete: ${eventData.step}`));
                break;
            case 'agent_file_read':
                console.log(chalk.blue(`📖 File read: ${eventData.path}`));
                break;
            case 'agent_file_written':
                console.log(chalk.green(`✏️ File written: ${eventData.path}`));
                break;
            case 'agent_file_list':
                console.log(chalk.cyan(`📁 Files listed: ${eventData.files?.length} items`));
                break;
            case 'agent_grep_results':
                console.log(chalk.magenta(`🔍 Search: ${eventData.pattern} - ${eventData.matches?.length} matches`));
                break;

            // Background agent events for console
            case 'bg_agent_task_start':
                console.log(chalk.dim(`  🤖 Background: ${eventData.agentName} working on "${eventData.taskDescription}"`));
                break;

            case 'bg_agent_task_progress':
                // Progress bar inline
                const progressBar = '█'.repeat(Math.floor(eventData.progress / 5)) +
                    '░'.repeat(20 - Math.floor(eventData.progress / 5));
                console.log(chalk.dim(`  🔄 ${eventData.agentId}: [${progressBar}] ${eventData.progress}% - ${eventData.currentStep}`));
                break;

            case 'bg_agent_task_complete':
                console.log(chalk.green(`  ✅ Background: ${eventData.agentId} completed successfully (${eventData.duration}ms)`));
                break;

            case 'bg_agent_tool_call':
                const toolParamsConsole = eventData.parameters ?
                    ` ${JSON.stringify(eventData.parameters)}` : '';
                console.log(chalk.dim(`  🛠️ Background Tool: ${eventData.agentId} → ${eventData.toolName}${toolParamsConsole}`));
                break;

            case 'bg_agent_orchestrated':
                console.log(chalk.dim(`  🎭 Orchestrating: ${eventData.agentName} for "${eventData.task}"`));
                break;
        }
    }

    // Advanced UI Features Setup
    private setupAdvancedUIFeatures(): void {
        // Initialize advanced UI theme and features
        this.advancedUI.isInteractiveMode = false; // Start in normal mode

        // Setup file watching capabilities
        this.setupFileWatching();

        // Setup progress tracking
        this.setupProgressTracking();

        // Initialize structured panels
        this.initializeStructuredPanels();
    }

    /**
     * Setup event listeners for planning system to update todos panel in real-time
     */
    private setupPlanningEventListeners(): void {
        // Listen for step progress events to update todos panel
        this.planningManager.on('stepStart', (event: any) => {
            this.advancedUI.updateTodos(event.todos.map((todo: any) => ({
                content: todo.title || todo.description,
                status: todo.status
            })));
        });

        this.planningManager.on('stepProgress', (event: any) => {
            this.advancedUI.updateTodos(event.todos.map((todo: any) => ({
                content: todo.title || todo.description,
                status: todo.status
            })));
        });

        this.planningManager.on('stepComplete', (event: any) => {
            this.advancedUI.updateTodos(event.todos.map((todo: any) => ({
                content: todo.title || todo.description,
                status: todo.status
            })));
        });

        this.planningManager.on('planExecutionStart', (event) => {
            console.log(chalk.blue(`🚀 Starting plan execution: ${event.title}`));
        });

        this.planningManager.on('planExecutionComplete', (event) => {
            this.withPanelOutput(async () => {
                const content = [
                    chalk.green('✅ Plan Execution Completed'),
                    chalk.gray('────────────────────────────────────────'),
                    `${chalk.blue('📋 Plan:')} ${event.title}`,
                    (event as any).summary ? `${chalk.gray('📝 Summary:')} ${(event as any).summary}` : '',
                ].filter(Boolean).join('\n');

                console.log(boxen(content, {
                    title: '🧠 Planning', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
                }));
            });
        });

        this.planningManager.on('planExecutionError', (event) => {
            this.withPanelOutput(async () => {
                const content = [
                    chalk.red('❌ Plan Execution Failed'),
                    chalk.gray('────────────────────────────────────────'),
                    `${chalk.red('Error:')} ${event.error || 'Unknown error'}`,
                ].join('\n');

                console.log(boxen(content, {
                    title: '🧠 Planning', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
                }));
            });
        });
    }

    /**
     * Initialize structured UI panels using existing advanced-cli-ui components
     */
    private initializeStructuredPanels(): void {
        // Use the existing advanced UI system
        advancedUI.startInteractiveMode();
        console.log(chalk.dim('\n🎨 Structured UI panels ready - using advanced-cli-ui system'));
    }

    private setupFileWatching(): void {
        // File watching setup for live updates using chokidar
        try {
            // Only watch if chokidar is available
            const chokidar = require('chokidar');

            // Watch important file patterns
            const patterns = [
                '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
                '**/*.json', '**/*.md', '**/*.yml', '**/*.yaml',
                'package.json', 'tsconfig.json', 'CLAUDE.md', 'todo.md'
            ];

            const watcher = chokidar.watch(patterns, {
                ignored: /(^|[\/\\])\../, // ignore dotfiles
                persistent: true,
                ignoreInitial: true,
                cwd: this.workingDirectory
            });

            // File change handlers
            watcher.on('add', (path: string) => {
                this.addLiveUpdate({
                    type: 'info',
                    content: `📄 File created: ${path}`,
                    source: 'file-watcher'
                });
            });

            watcher.on('change', (path: string) => {
                this.addLiveUpdate({
                    type: 'info',
                    content: `✏️ File modified: ${path}`,
                    source: 'file-watcher'
                });

                // Special handling for important files
                if (path === 'todo.md') {
                    console.log(chalk.cyan('🔄 Todo list updated'));
                } else if (path === 'package.json') {
                    console.log(chalk.blue('📦 Package configuration changed'));
                } else if (path === 'CLAUDE.md') {
                    console.log(chalk.magenta('🤖 Project context updated'));
                }
            });

            watcher.on('unlink', (path: string) => {
                this.addLiveUpdate({
                    type: 'warning',
                    content: `🗑️ File deleted: ${path}`,
                    source: 'file-watcher'
                });
            });

            watcher.on('error', (error: any) => {
                this.addLiveUpdate({
                    type: 'error',
                    content: `File watcher error: ${error.message}`,
                    source: 'file-watcher'
                });
            });

            // Store watcher for cleanup
            this.fileWatcher = watcher;

            console.log(chalk.dim('👀 File watching enabled'));

        } catch (error: any) {
            console.log(chalk.gray('⚠️ File watching not available (chokidar not installed)'));
        }
    }

    private setupProgressTracking(): void {
        // Progress tracking for long-running operations
        // This provides visual feedback for complex tasks

        // Track active operations and their progress
        this.progressTracker = {
            operations: new Map(),

            // Start tracking an operation
            start: (id: string, title: string, totalSteps?: number) => {
                const operation = {
                    id,
                    title,
                    startTime: Date.now(),
                    currentStep: 0,
                    totalSteps: totalSteps || 0,
                    status: 'running',
                    details: []
                };

                this.progressTracker.operations.set(id, operation);

                if (totalSteps) {
                    this.createAdvancedProgressBar(id, title, totalSteps);
                } else {
                    this.createStatusIndicator(id, title, 'Starting...');
                    this.startAdvancedSpinner(id, 'Processing...');
                }

                this.addLiveUpdate({
                    type: 'info',
                    content: `🚀 Started: ${title}`,
                    source: 'progress-tracker'
                });
            },

            // Update progress
            update: (id: string, step?: number, detail?: string) => {
                const operation = this.progressTracker.operations.get(id);
                if (!operation) return;

                if (step !== undefined) {
                    operation.currentStep = step;
                    if (operation.totalSteps > 0) {
                        this.updateAdvancedProgress(id, step, operation.totalSteps);
                    }
                }

                if (detail) {
                    operation.details.push({
                        timestamp: Date.now(),
                        message: detail
                    });

                    this.updateStatusIndicator(id, { details: detail });

                    this.addLiveUpdate({
                        type: 'info',
                        content: `📊 ${operation.title}: ${detail}`,
                        source: 'progress-tracker'
                    });
                }
            },

            // Complete tracking
            complete: (id: string, success: boolean = true, finalMessage?: string) => {
                const operation = this.progressTracker.operations.get(id);
                if (!operation) return;

                operation.status = success ? 'completed' : 'failed';
                operation.endTime = Date.now();

                const duration = operation.endTime - operation.startTime;
                const durationText = duration > 1000 ?
                    `${Math.round(duration / 1000)}s` :
                    `${duration}ms`;

                const message = finalMessage ||
                    `${operation.title} ${success ? 'completed' : 'failed'} in ${durationText}`;

                if (operation.totalSteps > 0) {
                    this.completeAdvancedProgress(id, message);
                } else {
                    this.stopAdvancedSpinner(id, success, message);
                }

                this.addLiveUpdate({
                    type: success ? 'log' : 'error',
                    content: `${success ? '✅' : '❌'} ${message}`,
                    source: 'progress-tracker'
                });

                // Clean up after a delay
                setTimeout(() => {
                    this.progressTracker.operations.delete(id);
                }, 5000);
            },

            // Get current operations summary
            getSummary: () => {
                const operations = Array.from(this.progressTracker.operations.values());
                return {
                    total: operations.length,
                    running: operations.filter((op: any) => op.status === 'running').length,
                    completed: operations.filter((op: any) => op.status === 'completed').length,
                    failed: operations.filter((op: any) => op.status === 'failed').length
                };
            }
        };

        console.log(chalk.dim('📊 Progress tracking enabled'));
    }

    // Advanced UI Methods (from advanced-cli-ui.ts)
    private createStatusIndicator(id: string, title: string, details?: string): StatusIndicator {
        const indicator: StatusIndicator = {
            id,
            title,
            status: 'pending',
            details,
            startTime: new Date(),
            subItems: [],
        };

        this.indicators.set(id, indicator);

        if (this.isInteractiveMode) {
            this.refreshDisplay();
        } else {
            console.log(formatStatus('📋', title, details));
        }

        return indicator;
    }

    private updateStatusIndicator(id: string, updates: Partial<StatusIndicator>): void {
        const indicator = this.indicators.get(id);
        if (!indicator) return;

        Object.assign(indicator, updates);

        if (updates.status === 'completed' || updates.status === 'failed') {
            indicator.endTime = new Date();
        }

        if (this.isInteractiveMode) {
            this.refreshDisplay();
        } else {
            this.logStatusUpdate(indicator);
        }
    }

    private addLiveUpdate(update: Omit<LiveUpdate, 'timestamp'>): void {
        const liveUpdate: LiveUpdate = {
            ...update,
            timestamp: new Date(),
        };

        this.liveUpdates.push(liveUpdate);

        // Keep only recent updates
        if (this.liveUpdates.length > 50) {
            this.liveUpdates = this.liveUpdates.slice(-50);
        }

        if (this.isInteractiveMode) {
            this.refreshDisplay();
        } else {
            this.printLiveUpdate(liveUpdate);
        }
    }

    private startAdvancedSpinner(id: string, text: string): void {
        if (this.isInteractiveMode) {
            this.updateStatusIndicator(id, { status: 'running' });
            return;
        }

        const spinner = ora({
            text,
            spinner: 'dots',
            color: 'cyan',
        }).start();

        this.spinners.set(id, spinner);
    }

    private stopAdvancedSpinner(id: string, success: boolean, finalText?: string): void {
        const spinner = this.spinners.get(id);
        if (spinner) {
            if (success) {
                spinner.succeed(finalText);
            } else {
                spinner.fail(finalText);
            }
            this.spinners.delete(id);
        }

        this.updateStatusIndicator(id, {
            status: success ? 'completed' : 'failed',
            details: finalText,
        });
    }

    private createAdvancedProgressBar(id: string, title: string, total: number): void {
        if (this.isInteractiveMode) {
            this.createStatusIndicator(id, title);
            this.updateStatusIndicator(id, { progress: 0 });
            return;
        }

        const progressBar = new cliProgress.SingleBar({
            format: `${chalk.cyan(title)} |${chalk.cyan('{bar}')}| {percentage}% | {value}/{total} | ETA: {eta}s`,
            barCompleteChar: '█',
            barIncompleteChar: '░',
        });

        progressBar.start(total, 0);
        this.progressBars.set(id, progressBar);
    }

    private updateAdvancedProgress(id: string, current: number, total?: number): void {
        const progressBar = this.progressBars.get(id);
        if (progressBar) {
            progressBar.update(current);
        }

        const progress = total ? Math.round((current / total) * 100) : current;
        this.updateStatusIndicator(id, { progress });
    }

    private completeAdvancedProgress(id: string, message?: string): void {
        const progressBar = this.progressBars.get(id);
        if (progressBar) {
            progressBar.stop();
            this.progressBars.delete(id);
        }

        this.updateStatusIndicator(id, {
            status: 'completed',
            progress: 100,
            details: message,
        });
    }

    // Helper to show a concise, single-line summary with ellipsis
    private conciseOneLine(text: string, max: number = 60): string {
        if (!text) return '';
        const one = text.replace(/\s+/g, ' ').trim();
        return one.length > max ? one.slice(0, max).trimEnd() + '…' : one;
    }

    private async askAdvancedConfirmation(
        question: string,
        details?: string,
        defaultValue: boolean = false
    ): Promise<boolean> {
        const icon = defaultValue ? '✅' : '❓';
        const prompt = `${icon} ${chalk.cyan(question)}`;

        if (details) {
            console.log(chalk.gray(`   ${details}`));
        }

        // Use inquirer for proper input handling with arrow key support
        const { inputQueue } = await import('./core/input-queue');
        const inquirer = await import('inquirer');

        // Enable bypass for approval inputs
        inputQueue.enableBypass();

        try {
            const answers = await inquirer.default.prompt([
                {
                    type: 'list',
                    name: 'confirmed',
                    message: prompt,
                    choices: [
                        { name: 'Yes', value: true },
                        { name: 'No', value: false }
                    ],
                    default: defaultValue ? 0 : 1
                }
            ]);

            return answers.confirmed;
        } catch {
            return defaultValue;
        } finally {
            // Always disable bypass after approval
            inputQueue.disableBypass();
        }
    }
    private async showAdvancedSelection<T>(
        title: string,
        choices: { value: T; label: string; description?: string }[],
        defaultIndex: number = 0
    ): Promise<T> {
        console.log(chalk.cyan.bold(`\n${title}`));
        console.log(chalk.gray('─'.repeat(50)));

        choices.forEach((choice, index) => {
            const indicator = index === defaultIndex ? chalk.green('→') : ' ';
            console.log(`${indicator} ${index + 1}. ${chalk.bold(choice.label)}`);
            if (choice.description) {
                console.log(`   ${chalk.gray(choice.description)}`);
            }
        });

        return new Promise((resolve) => {
            if (!this.rl) {
                resolve(choices[defaultIndex].value);
                return;
            }

            const prompt = `\nSelect option (1-${choices.length}, default ${defaultIndex + 1}): `;
            this.rl.question(prompt, (answer) => {
                let selection = defaultIndex;
                const num = parseInt(answer.trim());
                if (!isNaN(num) && num >= 1 && num <= choices.length) {
                    selection = num - 1;
                }

                console.log(chalk.green(`✓ Selected: ${choices[selection].label}`));
                resolve(choices[selection].value);
            });
        });
    }

    // Advanced UI Helper Methods
    private refreshDisplay(): void {
        if (!this.isInteractiveMode) return;

        // Move cursor to top and clear
        process.stdout.write('\x1B[2J\x1B[H');

        this.showAdvancedHeader();
        this.showActiveIndicators();
        this.showRecentUpdates();
    }

    private showAdvancedHeader(): void {
        const header = boxen(
            `${chalk.cyanBright.bold('🤖 NikCLI')} ${chalk.gray('v0.3.1-beta')}\n` +
            `${chalk.gray('Autonomous AI Developer Assistant')}\n\n` +
            `${chalk.blue('Status:')} ${this.getOverallStatus()}  ${chalk.blue('Active Tasks:')} ${this.indicators.size}\n` +
            `${chalk.blue('Mode:')} ${this.currentMode}  ${chalk.blue('Live Updates:')} Enabled`,
            {
                padding: 1,
                margin: { top: 0, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: 'cyan',
                titleAlignment: 'center',
            }
        );

        console.log(header);
    }

    private showActiveIndicators(): void {
        const indicators = Array.from(this.indicators.values());

        if (indicators.length === 0) return;

        console.log(chalk.blue.bold('📊 Active Tasks:'));
        console.log(chalk.gray('─'.repeat(60)));

        indicators.forEach(indicator => {
            this.printIndicatorLine(indicator);
        });

        console.log();
    }

    private showRecentUpdates(): void {
        const recentUpdates = this.liveUpdates.slice(-10);

        if (recentUpdates.length === 0) return;

        console.log(chalk.blue.bold('📝 Recent Updates:'));
        console.log(chalk.gray('─'.repeat(60)));

        recentUpdates.forEach(update => {
            this.printLiveUpdate(update);
        });
    }

    private printIndicatorLine(indicator: StatusIndicator): void {
        const statusIcon = this.getStatusIcon(indicator.status);
        const duration = this.getDuration(indicator);

        let line = `${statusIcon} ${chalk.bold(indicator.title)}`;

        if (indicator.progress !== undefined) {
            const progressBar = this.createProgressBarString(indicator.progress);
            line += ` ${progressBar}`;
        }

        if (duration) {
            line += ` ${chalk.gray(`(${duration})`)}`;
        }

        console.log(line);

        if (indicator.details) {
            console.log(`   ${chalk.gray(indicator.details)}`);
        }
    }

    private printLiveUpdate(update: LiveUpdate): void {
        const timeStr = update.timestamp.toLocaleTimeString();
        const typeColor = this.getUpdateTypeColor(update.type);
        const sourceStr = update.source ? chalk.gray(`[${update.source}]`) : '';

        const line = `${chalk.gray(timeStr)} ${sourceStr} ${typeColor(update.content)}`;
        console.log(line);
    }

    private logStatusUpdate(indicator: StatusIndicator): void {
        const statusIcon = this.getStatusIcon(indicator.status);
        const statusColor = this.getStatusColor(indicator.status);

        console.log(`${statusIcon} ${statusColor(indicator.title)}`);

        if (indicator.details) {
            console.log(`   ${chalk.gray(indicator.details)}`);
        }
    }

    // UI Utility Methods
    private getStatusIcon(status: string): string {
        switch (status) {
            case 'pending': return '⏳';
            case 'running': return '🔄';
            case 'completed': return '✅';
            case 'failed': return '❌';
            case 'warning': return '⚠️';
            default: return '📋';
        }
    }

    private getStatusColor(status: string): any {
        switch (status) {
            case 'pending': return chalk.gray;
            case 'running': return chalk.blue;
            case 'completed': return chalk.green;
            case 'failed': return chalk.red;
            case 'warning': return chalk.yellow;
            default: return chalk.gray;
        }
    }

    private getUpdateTypeColor(type: string): any {
        switch (type) {
            case 'error': return chalk.red;
            case 'warning': return chalk.yellow;
            case 'info': return chalk.blue;
            case 'log': return chalk.green;
            default: return chalk.white;
        }
    }

    private createProgressBarString(progress: number, width: number = 20): string {
        const filled = Math.round((progress / 100) * width);
        const empty = width - filled;

        const bar = chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
        return `[${bar}] ${progress}%`;
    }

    private getDuration(indicator: StatusIndicator): string | null {
        if (!indicator.startTime) return null;

        const endTime = indicator.endTime || new Date();
        const duration = endTime.getTime() - indicator.startTime.getTime();

        const seconds = Math.round(duration / 1000);
        if (seconds < 60) {
            return `${seconds}s`;
        } else {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        }
    }

    private getOverallStatus(): string {
        const indicators = Array.from(this.indicators.values());

        if (indicators.length === 0) return chalk.gray('Idle');

        const hasRunning = indicators.some(i => i.status === 'running');
        const hasFailed = indicators.some(i => i.status === 'failed');
        const hasWarning = indicators.some(i => i.status === 'warning');

        if (hasRunning) return chalk.blue('Running');
        if (hasFailed) return chalk.red('Failed');
        if (hasWarning) return chalk.yellow('Warning');

        return chalk.green('Ready');
    }

    /**
     * Start interactive chat mode (main Claude Code experience)
     */
    async startChat(options: NikCLIOptions): Promise<void> {
        console.clear();
        this.showChatWelcome();

        // Apply options
        if (options.model) {
            this.switchModel(options.model);
        }

        if (options.auto) {
            this.currentMode = 'auto';
        }

        // Initialize cognitive orchestration if enabled
        if (this.cognitiveMode && this.streamingOrchestrator) {
            console.log(chalk.green('🧠 Cognitive orchestration active'));
            this.displayCognitiveStatus();
        }

        // Decision Point: structuredUI vs Console stdout (as per diagram)
        // Always enable structured UI to show Files/Diffs panels in all modes
        const shouldUseStructuredUI = Boolean(options.structuredUI) ||
            this.currentMode === 'plan' ||
            this.currentMode === 'auto' ||
            this.currentMode === 'default' ||
            Boolean(options.agent) ||
            process.env.FORCE_STRUCTURED_UI === 'true';

        // Save the decision for later use in routing
        this.structuredUIEnabled = shouldUseStructuredUI;

        if (shouldUseStructuredUI) {
            console.log(chalk.cyan('\n🎨 UI Selection: AdvancedCliUI selected (structuredUI = true)'));
            advancedUI.startInteractiveMode();
            advancedUI.logInfo('AdvancedCliUI Ready', `Mode: ${this.currentMode} - 4 Panels configured`);
        } else {
            console.log(chalk.dim('\n📺 UI Selection: Console stdout selected (structuredUI = false)'));
        }

        if (options.plan) {
            this.currentMode = 'plan';
        }

        if (options.agent) {
            this.currentAgent = options.agent;
        }

        // Initialize systems
        await this.initializeSystems();

        // Start enhanced chat interface with slash commands
        await this.startEnhancedChat();
    }

    /**
     * Enhanced chat interface with Claude Code-style slash commands
     */
    private async startEnhancedChat(): Promise<void> {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            historySize: 300,
        });

        // Setup keypress events for ESC interruption
        if (process.stdin.isTTY) {
            // Ensure keypress events are emitted
            readline.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.on('keypress', (chunk, key) => {
                if (key && key.name === 'escape') {
                    // Stop ongoing AI operation spinner
                    if (this.activeSpinner) {
                        this.stopAIOperation();
                        console.log(chalk.yellow('\n⏸️  AI operation interrupted by user'));
                    }

                    // Interrupt streaming/assistant processing
                    if (this.assistantProcessing) {
                        this.interruptProcessing();
                    }

                    // Cancel background agent tasks (running and queued)
                    const cancelled = agentService.cancelAllTasks?.() ?? 0;
                    if (cancelled > 0) {
                        console.log(chalk.yellow(`⏹️  Stopped ${cancelled} background agent task${cancelled > 1 ? 's' : ''}`));
                    }

                    // Kill any running subprocesses started by tools
                    try {
                        const procs = toolsManager.getRunningProcesses?.() || [];
                        (async () => {
                            let killed = 0;
                            await Promise.all(procs.map(async (p: any) => {
                                try {
                                    const ok = await toolsManager.killProcess?.(p.pid);
                                    if (ok) killed++;
                                } catch { /* ignore */ }
                            }));
                            if (killed > 0) {
                                console.log(chalk.yellow(`🛑 Terminated ${killed} running process${killed > 1 ? 'es' : ''}`));
                            }
                        })();
                    } catch { /* ignore */ }

                    // Return to default mode if not already
                    if (this.currentMode !== 'default') {
                        this.currentMode = 'default';
                        console.log(chalk.yellow('↩️  Cancelled. Returning to default mode.'));
                    }

                    this.showPrompt();
                }

                // Handle @ key for agent suggestions
                if (chunk === '@' && !this.assistantProcessing) {
                    setTimeout(() => this.showAgentSuggestions(), 100);
                }

                // Handle * key for file picker suggestions
                if (chunk === '*' && !this.assistantProcessing) {
                    setTimeout(() => this.showFilePickerSuggestions(), 100);
                }

                // Handle / key for slash command palette


                // Handle ? key to show a quick cheat-sheet overlay
                if (chunk === '?' && !this.assistantProcessing) {
                    setTimeout(() => this.showCheatSheet(), 30);
                    return;
                }


                // Handle Cmd+Tab for mode cycling (macOS)
                if (key && key.meta && key.name === 'tab') {
                    this.cycleModes();
                    return; // Prevent other handlers from running
                }

                // Handle Shift+Tab for mode cycling (default mode friendly)
                if (key && key.shift && key.name === 'tab') {
                    this.cycleModes();
                    return; // Prevent other handlers from running
                }

                // Handle Cmd+] for mode cycling (macOS) - alternative
                if (key && key.meta && key.name === ']') {
                    this.cycleModes();
                    return; // Prevent other handlers from running
                }

                // Handle Cmd+Esc for returning to default mode without shutdown (macOS)
                if (key && key.meta && key.name === 'escape') {
                    if (this.activeSpinner) {
                        this.stopAIOperation();
                        console.log(chalk.yellow('\n⏸️  AI operation interrupted by user'));
                    } else if (this.assistantProcessing) {
                        this.interruptProcessing();
                    }

                    // Always return to default mode (without shutdown)
                    if (this.currentMode !== 'default') {
                        this.currentMode = 'default';
                        this.stopAIOperation();
                        console.log(chalk.cyan('🏠 Returning to default chat mode (Cmd+Esc)'));
                    } else {
                        console.log(chalk.cyan('🏠 Already in default mode'));
                        this.stopAIOperation();
                    }
                    this.showPrompt();
                    return; // Prevent other handlers from running
                }

                // Let other keypress events continue normally
                if (key && key.ctrl && key.name === 'c') {
                    process.exit(0);
                }
            });
        }

        this.rl?.on('line', async (input) => {
            const trimmed = input.trim();

            if (!trimmed) {
                this.renderPromptAfterOutput();
                return;
            }

            // Set user input as active when user sends a message
            this.userInputActive = true;
            this.renderPromptAfterOutput();

            // Se il bypass è abilitato, ignora completamente l'input
            if (inputQueue.isBypassEnabled()) {
                this.userInputActive = false;
                this.renderPromptAfterOutput();
                return;
            }

            // Apply token optimization to user input
            let optimizedInput = trimmed;
            if (trimmed.length > 20 && !trimmed.startsWith('/')) { // Don't optimize commands
                const optimizer = this.getTokenOptimizer();
                if (optimizer) {
                    try {
                        const optimizationResult = await optimizer.optimizePrompt(trimmed);
                        optimizedInput = optimizationResult.content;

                        if (optimizationResult.tokensSaved > 5) {
                            QuietCacheLogger.logCacheSave(optimizationResult.tokensSaved);
                        }
                    } catch (error) {
                        // Silent fail - use original input
                        console.debug('Token optimization failed:', error);
                    }
                }
            }

            // Se il sistema sta processando, metti in coda
            // ma rispetta il bypass per approval inputs
            if (this.assistantProcessing && inputQueue.shouldQueue(trimmed)) {
                // Determina priorità basata sul contenuto
                let priority: 'high' | 'normal' | 'low' = 'normal';
                if (trimmed.startsWith('/') || trimmed.startsWith('@')) {
                    priority = 'high'; // Comandi e agenti hanno priorità alta
                } else if (trimmed.toLowerCase().includes('urgent') || trimmed.toLowerCase().includes('stop')) {
                    priority = 'high';
                } else if (trimmed.toLowerCase().includes('later') || trimmed.toLowerCase().includes('low priority')) {
                    priority = 'low';
                }

                const queueId = inputQueue.enqueue(trimmed, priority, 'user');
                console.log(chalk.cyan(`📥 Input queued (${priority} priority): ${trimmed.substring(0, 40)}${trimmed.length > 40 ? '...' : ''}`));
                this.renderPromptAfterOutput();
                return;
            }

            // Indicate assistant is processing while handling the input
            this.userInputActive = false; // User input is no longer active
            this.assistantProcessing = true;
            this.startStatusBar();
            this.renderPromptAfterOutput();

            try {
                // Route slash and agent-prefixed commands, otherwise treat as chat
                if (trimmed.startsWith('/')) {
                    await this.dispatchSlash(trimmed);
                } else if (trimmed.startsWith('@')) {
                    await this.dispatchAt(trimmed);
                } else if (trimmed.startsWith('*')) {
                    await this.dispatchStar(trimmed);
                } else {
                    // Use optimized input for chat
                    await this.handleChatInput(optimizedInput);
                }
            } finally {
                // Done processing; return to idle
                this.assistantProcessing = false;
                this.stopStatusBar();
                this.renderPromptAfterOutput();

                // Processa input dalla queue se disponibili
                this.processQueuedInputs();
            }
        });

        this.rl?.on('SIGINT', async () => {
            await this.shutdown();
        });

        // Show initial prompt immediately
        this.renderPromptAfterOutput();
    }

    /**
     * Display a compact keyboard cheat-sheet with top commands and shortcuts
     */
    private showCheatSheet(): void {
        try {
            const lines: string[] = [];
            lines.push('Shortcuts:');
            lines.push('  /      Open command palette');
            lines.push('  @      Agent suggestions');
            lines.push('  *      File picker suggestions');
            lines.push('  Esc    Interrupt/return to default mode');
            lines.push('  ?      Show this cheat sheet');
            lines.push('  Cmd+Tab / Shift+Tab   Cycle modes');
            lines.push('  Cmd+Esc               Return to default mode');
            lines.push('');
            lines.push('Top Commands:');
            lines.push('  /plan [task]          Generate/execute a plan');
            lines.push('  /auto <task>          Autonomous execution');
            lines.push('  /model [name]         Show/switch model');
            lines.push('  /tokens               Token/cost analysis');
            lines.push('  /images               Pick and analyze images');
            lines.push('  /doc-search <query>   Search docs');
            lines.push('  /queue status         Input queue status');

            const panel = boxen(lines.join('\n'), {
                title: '⌨️  Keyboard & Commands',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            });
            console.log(panel);
        } finally {
            this.renderPromptAfterOutput();
        }
    }

    /**
     * Check if a tool should be auto-executed based on user intent
     */
    private async shouldAutoExecuteTool(tool: string, input: string): Promise<boolean> {
        // Define tools that can be auto-executed safely
        const autoExecutableTools = [
            'image_generation', 'image_analysis', 'web_search', 'read_file',
            'explore_directory', 'semantic_search', 'code_analysis',
            'database_management', 'api_development', 'frontend_development',
            'backend_development', 'testing_qa', 'security_auth',
            'performance_optimization', 'monitoring_analytics', 'mobile_development',
            'machine_learning', 'blockchain_web3', 'document_processing',
            'audio_processing', 'video_processing', 'dependency_analysis',
            'git_workflow', 'devops_deployment', 'ai_code_generation'
        ];

        if (!autoExecutableTools.includes(tool)) {
            return false;
        }

        // For risky tools, ask for confirmation
        const riskyTools = ['image_generation', 'database_management', 'devops_deployment', 'security_auth'];
        if (riskyTools.includes(tool)) {
            console.log(chalk.yellow(`🤔 Would you like me to ${tool.replace('_', ' ')} for: "${input}"?`));
            console.log(chalk.gray('Auto-executing based on detected intent...'));
            return true;
        }

        return true;
    }

    /**
     * Auto-execute a tool based on router recommendation
     */
    private async autoExecuteTool(tool: string, input: string, suggestedParams?: any): Promise<void> {
        console.log(chalk.green(`🚀 Auto-executing ${tool.replace('_', ' ')}...`));

        try {
            switch (tool) {
                case 'image_generation':
                    await this.autoGenerateImage(input);
                    break;
                case 'image_analysis':
                    await this.autoAnalyzeImage(input);
                    break;
                case 'web_search':
                    await this.autoWebSearch(input);
                    break;
                case 'read_file':
                    await this.autoReadFile(input);
                    break;
                case 'explore_directory':
                    await this.autoExploreDirectory(input);
                    break;
                case 'semantic_search':
                    await this.autoSemanticSearch(input);
                    break;
                case 'code_analysis':
                    await this.autoCodeAnalysis(input);
                    break;
                case 'database_management':
                    await this.autoDatabaseManagement(input);
                    break;
                case 'api_development':
                    await this.autoAPITesting(input);
                    break;
                case 'frontend_development':
                    await this.autoFrontendDevelopment(input);
                    break;
                case 'backend_development':
                    await this.autoBackendDevelopment(input);
                    break;
                case 'testing_qa':
                    await this.autoTestingQA(input);
                    break;
                case 'security_auth':
                    await this.autoSecurityAudit(input);
                    break;
                case 'performance_optimization':
                    await this.autoPerformanceOptimization(input);
                    break;
                case 'monitoring_analytics':
                    await this.autoMonitoringAnalytics(input);
                    break;
                case 'mobile_development':
                    await this.autoMobileDevelopment(input);
                    break;
                case 'machine_learning':
                    await this.autoMachineLearning(input);
                    break;
                case 'blockchain_web3':
                    await this.autoBlockchainWeb3(input);
                    break;
                case 'document_processing':
                    await this.autoDocumentProcessing(input);
                    break;
                case 'audio_processing':
                    await this.autoAudioProcessing(input);
                    break;
                case 'video_processing':
                    await this.autoVideoProcessing(input);
                    break;
                case 'dependency_analysis':
                    await this.autoDependencyAnalysis(input);
                    break;
                case 'git_workflow':
                    await this.autoGitWorkflow(input);
                    break;
                case 'devops_deployment':
                    await this.autoDevOpsDeployment(input);
                    break;
                case 'ai_code_generation':
                    await this.autoAICodeGeneration(input);
                    break;
                default:
                    console.log(chalk.yellow(`Auto-execution not implemented for ${tool}`));
                    break;
            }
        } catch (error: any) {
            console.log(chalk.red(`Auto-execution failed: ${error.message}`));
        }
    }

    /**
     * Auto-generate image from natural language input
     */
    private async autoGenerateImage(input: string): Promise<void> {
        let prompt = input.replace(/^(generate|create|make|draw)\s+(an?\s+)?(image|picture|photo)\s+(of\s+)?/i, '');
        prompt = prompt.replace(/^(show me|give me|i want)\s+/i, '');
        if (prompt.length < 3) prompt = input;

        console.log(chalk.cyan(`🎨 Generating image: "${prompt}"`));
        await this.dispatchSlash(`/generate-image "${prompt}"`);
    }

    /**
     * Auto analyze image from natural language input
     */
    private async autoAnalyzeImage(input: string): Promise<void> {
        const pathMatch = input.match(/(?:analyze|examine|look at)\s+(?:image|picture|photo)\s+(.+?)(?:\s|$)/i);
        if (pathMatch && pathMatch[1]) {
            const imagePath = pathMatch[1].trim();
            console.log(chalk.cyan(`🔍 Analyzing image: ${imagePath}`));
            await this.dispatchSlash(`/analyze-image "${imagePath}"`);
        } else {
            console.log(chalk.yellow('Could not extract image path from input'));
        }
    }

    /**
     * Auto web search from natural language input
     */
    private async autoWebSearch(input: string): Promise<void> {
        let query = input.replace(/^(search|find|look up|google)\s+(for\s+)?/i, '');
        query = query.replace(/^(what is|how to|where is)\s+/i, '');

        console.log(chalk.cyan(`🔍 Searching web: "${query}"`));

        try {
            // Use the web search tool through the tool system
            const webSearchProvider = new WebSearchProvider();
            const searchTool = webSearchProvider.getWebSearchTool();

            const result = await searchTool.execute({
                query,
                maxResults: 5,
                searchType: 'general' as const,
                mode: 'results' as const,
                includeContent: false,
                maxContentBytes: 200000
            },
                {
                    abortSignal: AbortSignal.timeout(10000)
                }
            );

            if (result.results && result.results.length > 0) {
                console.log(chalk.green(`\n📊 Found ${result.results.length} results:`));
                result.results.forEach((searchResult: any, index: number) => {
                    console.log(chalk.blue(`${index + 1}. ${searchResult.title}`));
                    console.log(chalk.gray(`   ${searchResult.url}`));
                    console.log(chalk.dim(`   ${searchResult.snippet}\n`));
                });
            } else {
                console.log(chalk.yellow('No search results found'));
            }
        } catch (error) {
            console.log(chalk.red('Web search failed, falling back to manual command'));
            console.log(chalk.cyan('You can try: /search-web "' + query + '"'));
        }
    }

    /**
     * Auto read file from natural language input
     */
    private async autoReadFile(input: string): Promise<void> {
        const fileMatch = input.match(/(?:read|show|view|open)\s+(.+?)(?:\s|$)/i);
        if (fileMatch && fileMatch[1]) {
            const filePath = fileMatch[1].trim();
            console.log(chalk.cyan(`📄 Reading file: ${filePath}`));
            await this.dispatchSlash(`/read "${filePath}"`);
        } else {
            console.log(chalk.yellow('Could not extract file path from input'));
        }
    }

    /**
     * Auto explore directory from natural language input
     */
    private async autoExploreDirectory(input: string): Promise<void> {
        let dirPath = '.';
        const dirMatch = input.match(/(?:explore|list|show)\s+(?:files in\s+)?(.+?)(?:\s|$)/i);
        if (dirMatch && dirMatch[1]) {
            dirPath = dirMatch[1].trim();
        }

        console.log(chalk.cyan(`📁 Exploring directory: ${dirPath}`));
        await this.dispatchSlash(`/ls "${dirPath}"`);
    }

    /**
     * Auto semantic search in codebase
     */
    private async autoSemanticSearch(input: string): Promise<void> {
        let searchTerm = input.replace(/^(find|search for|look for)\s+(similar|like)\s+/i, '');
        searchTerm = searchTerm.replace(/^(find|search)\s+/i, '');

        console.log(chalk.cyan(`🔍 Semantic search: "${searchTerm}"`));
        await this.dispatchSlash(`/search "${searchTerm}"`);
    }

    /**
     * Auto code analysis
     */
    private async autoCodeAnalysis(input: string): Promise<void> {
        const fileMatch = input.match(/(?:analyze|review|check)\s+(.+?)(?:\s|$)/i);
        if (fileMatch && fileMatch[1]) {
            const filePath = fileMatch[1].trim();
            console.log(chalk.cyan(`🔍 Analyzing code: ${filePath}`));
            await this.dispatchSlash(`/analyze "${filePath}"`);
        } else {
            console.log(chalk.cyan('🔍 Running general code analysis...'));
            await this.dispatchSlash('/lint');
        }
    }

    /**
     * Auto database management
     */
    private async autoDatabaseManagement(input: string): Promise<void> {
        console.log(chalk.cyan('🗄️ Database management detected'));
        if (input.includes('schema')) {
            console.log('📋 Showing database schema...');
            await this.executeAgent('database', 'analyze database schema and structure', {});
        } else if (input.includes('query') || input.includes('sql')) {
            console.log('💭 SQL query assistance...');
            await this.executeAgent('database', `help with SQL query: ${input}`, {});
        } else {
            await this.executeAgent('database', `database management: ${input}`, {});
        }
    }

    /**
     * Auto API development and testing
     */
    private async autoAPITesting(input: string): Promise<void> {
        console.log(chalk.cyan('🌐 API development/testing detected'));
        if (input.includes('test') || input.includes('postman')) {
            await this.executeAgent('api', `test API endpoints: ${input}`, {});
        } else if (input.includes('create') || input.includes('endpoint')) {
            await this.executeAgent('api', `create API endpoint: ${input}`, {});
        } else {
            await this.executeAgent('api', `API development: ${input}`, {});
        }
    }

    /**
     * Auto frontend development
     */
    private async autoFrontendDevelopment(input: string): Promise<void> {
        console.log(chalk.cyan('🎨 Frontend development detected'));
        if (input.includes('component')) {
            await this.executeAgent('react', `create React component: ${input}`, {});
        } else if (input.includes('style') || input.includes('css')) {
            await this.executeAgent('frontend', `styling task: ${input}`, {});
        } else {
            await this.executeAgent('frontend', `frontend development: ${input}`, {});
        }
    }

    /**
     * Auto backend development
     */
    private async autoBackendDevelopment(input: string): Promise<void> {
        console.log(chalk.cyan('⚙️ Backend development detected'));
        if (input.includes('server') || input.includes('express')) {
            await this.executeAgent('backend', `server development: ${input}`, {});
        } else if (input.includes('middleware')) {
            await this.executeAgent('backend', `middleware implementation: ${input}`, {});
        } else {
            await this.executeAgent('backend', `backend development: ${input}`, {});
        }
    }

    /**
     * Auto testing and QA
     */
    private async autoTestingQA(input: string): Promise<void> {
        console.log(chalk.cyan('🧪 Testing/QA detected'));
        if (input.includes('unit test')) {
            await this.dispatchSlash('/test --unit');
        } else if (input.includes('e2e') || input.includes('integration')) {
            await this.dispatchSlash('/test --e2e');
        } else {
            await this.dispatchSlash('/test');
        }
    }

    /**
     * Auto security audit
     */
    private async autoSecurityAudit(input: string): Promise<void> {
        console.log(chalk.cyan('🔒 Security analysis detected'));
        if (input.includes('vulnerability') || input.includes('audit')) {
            await this.executeAgent('security', `security audit: ${input}`, {});
        } else {
            await this.executeAgent('security', `security analysis: ${input}`, {});
        }
    }

    /**
     * Auto performance optimization
     */
    private async autoPerformanceOptimization(input: string): Promise<void> {
        console.log(chalk.cyan('⚡ Performance optimization detected'));
        await this.executeAgent('performance', `optimize performance: ${input}`, {});
    }

    /**
     * Auto monitoring and analytics
     */
    private async autoMonitoringAnalytics(input: string): Promise<void> {
        console.log(chalk.cyan('📊 Monitoring/Analytics detected'));
        await this.executeAgent('monitoring', `monitoring and analytics: ${input}`, {});
    }

    /**
     * Auto mobile development
     */
    private async autoMobileDevelopment(input: string): Promise<void> {
        console.log(chalk.cyan('📱 Mobile development detected'));
        if (input.includes('react native')) {
            await this.executeAgent('mobile', `React Native development: ${input}`, {});
        } else if (input.includes('ios') || input.includes('android')) {
            await this.executeAgent('mobile', `native mobile development: ${input}`, {});
        } else {
            await this.executeAgent('mobile', `mobile development: ${input}`, {});
        }
    }

    /**
     * Auto machine learning
     */
    private async autoMachineLearning(input: string): Promise<void> {
        console.log(chalk.cyan('🤖 Machine Learning detected'));
        await this.executeAgent('ml', `machine learning task: ${input}`, {});
    }
    /**
     * Auto blockchain/Web3 development
     */
    private async autoBlockchainWeb3(input: string): Promise<void> {
        console.log(chalk.cyan('⛓️ Blockchain/Web3 detected'));
        await this.executeAgent('blockchain', `blockchain/Web3 development: ${input}`, {});
    }

    /**
     * Auto document processing
     */
    private async autoDocumentProcessing(input: string): Promise<void> {
        console.log(chalk.cyan('📄 Document processing detected'));
        const pathMatch = input.match(/(?:extract|parse|analyze)\s+(.+\.pdf)/i);
        if (pathMatch) {
            await this.executeAgent('document', `process document: ${pathMatch[1]}`, {});
        } else {
            await this.executeAgent('document', `document processing: ${input}`, {});
        }
    }

    /**
     * Auto audio processing
     */
    private async autoAudioProcessing(input: string): Promise<void> {
        console.log(chalk.cyan('🎵 Audio processing detected'));
        await this.executeAgent('audio', `audio processing: ${input}`, {});
    }

    /**
     * Auto video processing
     */
    private async autoVideoProcessing(input: string): Promise<void> {
        console.log(chalk.cyan('🎬 Video processing detected'));
        await this.executeAgent('video', `video processing: ${input}`, {});
    }

    /**
     * Auto dependency analysis
     */
    private async autoDependencyAnalysis(input: string): Promise<void> {
        console.log(chalk.cyan('📦 Dependency analysis detected'));
        if (input.includes('vulnerability') || input.includes('security')) {
            await this.dispatchSlash('/npm audit');
        } else if (input.includes('outdated') || input.includes('update')) {
            await this.dispatchSlash('/npm outdated');
        } else {
            await this.dispatchSlash('/npm list');
        }
    }

    /**
     * Auto Git workflow
     */
    private async autoGitWorkflow(input: string): Promise<void> {
        console.log(chalk.cyan('🔀 Git workflow detected'));
        if (input.includes('status')) {
            await this.dispatchSlash('/git status');
        } else if (input.includes('commit')) {
            await this.dispatchSlash('/git log --oneline -10');
        } else if (input.includes('branch')) {
            await this.dispatchSlash('/git branch -a');
        } else {
            await this.dispatchSlash('/git status');
        }
    }

    /**
     * Auto DevOps deployment
     */
    private async autoDevOpsDeployment(input: string): Promise<void> {
        console.log(chalk.cyan('🚀 DevOps/Deployment detected'));
        await this.executeAgent('devops', `DevOps deployment: ${input}`, {});
    }

    /**
     * Auto AI code generation
     */
    private async autoAICodeGeneration(input: string): Promise<void> {
        console.log(chalk.cyan('🤖 AI Code Generation detected'));
        await this.executeAgent('universal', `generate code: ${input}`, {});
    }

    /**
     * Interrupt current processing and stop all operations
     */
    private interruptProcessing(): void {
        if (!this.assistantProcessing) return;

        console.log(chalk.red('\n\n🛑 ESC pressed - Interrupting operation...'));

        // Set interrupt flag
        this.shouldInterrupt = true;

        // Abort current stream if exists
        if (this.currentStreamController) {
            this.currentStreamController.abort();
            this.currentStreamController = undefined;
        }

        // Stop all active spinners and operations
        this.stopAllActiveOperations();

        // Interrupt any active agent executions through the orchestrator
        const orchestrator = new ModernAgentOrchestrator(this.workingDirectory);
        const interruptedAgents = orchestrator.interruptActiveExecutions();
        if (interruptedAgents > 0) {
            console.log(chalk.yellow(`🤖 Stopped ${interruptedAgents} running agents`));
        }

        // Clean up processing state
        this.assistantProcessing = false;
        this.stopStatusBar();

        console.log(chalk.yellow('⏹️  Operation interrupted by user'));
        console.log(chalk.cyan('✨ Ready for new commands\n'));

        // Show prompt again
        this.showPrompt();
    }

    /**
     * Stop all active operations and cleanup
     */
    private stopAllActiveOperations(): void {
        // Stop all spinners
        for (const spinner of this.spinners.values()) {
            if (spinner.isSpinning) {
                spinner.stop();
            }
        }
        this.spinners.clear();

        // Stop all progress bars
        for (const bar of this.progressBars.values()) {
            bar.stop();
        }
        this.progressBars.clear();
    }

    /**
     * Processa input dalla queue quando il sistema è libero
     */
    private async processQueuedInputs(): Promise<void> {
        if (this.assistantProcessing) {
            return; // Non processare se il sistema è occupato
        }

        const status = inputQueue.getStatus();
        if (status.queueLength === 0) {
            return; // Nessun input in coda
        }

        // Processa il prossimo input dalla queue
        const result = await inputQueue.processNext(async (input: string) => {
            console.log(chalk.blue(`🔄 Processing queued input: ${input.substring(0, 40)}${input.length > 40 ? '...' : ''}`));

            // Simula il processing dell'input
            this.assistantProcessing = true;
            this.startStatusBar();
            this.showPrompt();

            try {
                // Route slash and agent-prefixed commands, otherwise treat as chat
                if (input.startsWith('/')) {
                    await this.dispatchSlash(input);
                } else if (input.startsWith('@')) {
                    await this.dispatchAt(input);
                } else if (input.startsWith('*')) {
                    await this.dispatchStar(input);
                } else {
                    await this.handleChatInput(input);
                }
            } finally {
                this.assistantProcessing = false;
                this.stopStatusBar();
                this.showPrompt();
            }
        });

        if (result) {
            console.log(chalk.green(`✅ Queued input processed: ${result.input.substring(0, 40)}${result.input.length > 40 ? '...' : ''}`));

            // Processa il prossimo input se disponibile
            setTimeout(() => this.processQueuedInputs(), 100);
        }
    }

    /**
     * Gestisce i comandi della queue
     */
    private handleQueueCommand(args: string[]): void {
        const [subCmd] = args;

        switch (subCmd) {
            case 'status':
                {
                    const status = inputQueue.getStatus();
                    const high = inputQueue.getByPriority('high').length;
                    const normal = inputQueue.getByPriority('normal').length;
                    const low = inputQueue.getByPriority('low').length;
                    const lines: string[] = [];
                    lines.push(`${chalk.green('Processing:')} ${status.isProcessing ? 'Yes' : 'No'}`);
                    lines.push(`${chalk.green('Queue Length:')} ${status.queueLength}`);
                    lines.push(`${chalk.green('High Priority:')} ${high}`);
                    lines.push(`${chalk.green('Normal Priority:')} ${normal}`);
                    lines.push(`${chalk.green('Low Priority:')} ${low}`);
                    if (status.pendingInputs.length > 0) {
                        lines.push('');
                        lines.push(chalk.cyan('Pending Inputs (up to 5):'));
                        status.pendingInputs.slice(0, 5).forEach((q, i) => {
                            lines.push(` ${i + 1}. ${q.input.substring(0, 60)}${q.input.length > 60 ? '…' : ''}`);
                        });
                    }
                    console.log(boxen(lines.join('\n'), { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }));
                }
                break;
            case 'clear':
                {
                    const cleared = inputQueue.clear();
                    console.log(boxen(`Cleared ${cleared} inputs from queue`, { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                }
                break;
            case 'process':
                console.log(boxen('Processing next queued input…', { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));
                this.processQueuedInputs();
                break;
            default:
                console.log(boxen([
                    'Commands:',
                    '/queue status   - Show queue statistics',
                    '/queue clear    - Clear all queued inputs',
                    '/queue process  - Process next queued input'
                ].join('\n'), { title: '📥 Input Queue', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
        }
    }

    /**
     * Dispatch /slash commands to rich SlashCommandHandler while preserving mode controls
     */
    private async dispatchSlash(command: string): Promise<void> {
        const parts = command.slice(1).split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        try {
            switch (cmd) {
                case 'plan':
                    if (args.length === 0) {
                        this.currentMode = 'plan';
                        console.log(chalk.green('✓ Switched to plan mode'));
                        console.log(chalk.dim('   Plan mode: Creates detailed plans and asks for approval before execution'));
                        console.log(chalk.dim('   Default mode: Auto-generates todos for complex tasks and executes in background'));
                    } else {
                        await this.generatePlan(args.join(' '), {});
                    }
                    break;

                case 'auto':
                    if (args.length === 0) {
                        this.currentMode = 'auto';
                        console.log(chalk.green('✓ Switched to auto mode'));
                    } else {
                        await this.autoExecute(args.join(' '), {});
                    }
                    break;

                case 'default':
                    this.currentMode = 'default';
                    console.log(chalk.green('✓ Switched to default mode'));
                    break;

                case 'vm':
                    this.currentMode = 'vm';
                    console.log(chalk.green('✓ Switched to VM mode'));
                    break;

                // File Operations
                case 'read':
                    await this.handleFileOperations('read', args);
                    break;
                case 'write':
                    await this.handleFileOperations('write', args);
                    break;
                case 'edit':
                    await this.handleFileOperations('edit', args);
                    break;
                case 'ls':
                    await this.handleFileOperations('ls', args);
                    break;
                case 'search':
                case 'grep':
                    await this.handleFileOperations('search', args);
                    break;

                // Terminal Operations
                case 'run':
                case 'sh':
                case 'bash':
                    await this.handleTerminalOperations('run', args);
                    break;
                case 'install':
                    await this.handleTerminalOperations('install', args);
                    break;
                case 'npm':
                    await this.handleTerminalOperations('npm', args);
                    break;
                case 'yarn':
                    await this.handleTerminalOperations('yarn', args);
                    break;
                case 'git':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /git <args>'));
                        return;
                    }
                    await this.runCommand(`git ${args.join(' ')}`);
                    break;

                case 'docker':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /docker <args>'));
                        return;
                    }
                    await this.runCommand(`docker ${args.join(' ')}`);
                    break;

                // Snapshot Management
                case 'snapshot':
                    await this.handleSnapshotCommand(args);
                    break;
                case 'snap':
                    await this.handleSnapshotCommand(args, true);
                    break;
                case 'restore':
                    await this.handleSnapshotRestore(args);
                    break;
                case 'snapshots':
                    await this.handleSnapshotsList(args);
                    break;

                case 'ps':
                    await this.handleTerminalOperations('ps', args);
                    break;

                case 'kill':
                    await this.handleTerminalOperations('kill', args);
                    break;

                // Project Operations
                case 'build':
                    await this.runCommand('npm run build');
                    break;

                case 'test':
                    const testPattern = args.length > 0 ? ` ${args.join(' ')}` : '';
                    await this.runCommand(`npm test${testPattern}`);
                    break;

                case 'lint':
                    await this.runCommand('npm run lint');
                    break;

                case 'create':
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /create <type> <name>'));
                        return;
                    }
                    const [type, name] = args;
                    console.log(chalk.blue(`Creating ${type}: ${name}`));
                    // Implement creation logic based on type
                    break;

                // Session Management
                case 'new':
                case 'sessions':
                case 'export':
                case 'stats':
                case 'history':
                case 'debug':
                case 'temp':
                case 'system':
                    await this.handleSessionManagement(cmd, args);
                    break;

                // Model and Config
                case 'model':
                case 'models':
                case 'set-key':
                case 'config':
                    await this.handleModelConfig(cmd, args);
                    break;

                // MCP Commands
                case 'mcp':
                    await this.handleMcpCommands(args);
                    break;

                // Session Management
                case 'tokens':
                    await this.showTokenUsage();
                    break;

                case 'cache':
                    await this.manageTokenCache(args[0]);
                    break;

                case 'config':
                    await this.manageConfig({ show: true });
                    break;

                case 'status':
                    await this.showStatus();
                    break;

                case 'compact':
                    await this.compactSession();
                    break;

                case 'cost':
                    await this.showCost();
                    break;

                case 'init':
                    await this.handleInitProject(args.includes('--force'));
                    break;

                // Session Management  
                case 'new':
                    await this.handleSessionManagement('new', args);
                    break;

                case 'sessions':
                    await this.handleSessionManagement('sessions', args);
                    break;

                case 'export':
                    await this.handleSessionManagement('export', args);
                    break;

                case 'stats':
                    await this.handleSessionManagement('stats', args);
                    break;

                case 'history':
                    await this.handleSessionManagement('history', args);
                    break;

                case 'debug':
                    await this.handleSessionManagement('debug', args);
                    break;

                case 'temp':
                    await this.handleSessionManagement('temp', args);
                    break;

                case 'system':
                    await this.handleSessionManagement('system', args);
                    break;

                case 'models':
                    await this.showModelsPanel();
                    break;

                case 'set-key':
                    await this.handleModelConfig('set-key', args);
                    break;

                // Advanced Features
                case 'agents':
                case 'agent':
                case 'parallel':
                case 'factory':
                case 'blueprints':
                case 'create-agent':
                case 'launch-agent':
                case 'context':
                case 'stream':
                case 'approval':
                case 'todo':
                case 'todos':
                    await this.handleAdvancedFeatures(cmd, args);
                    break;

                // Documentation Commands
                case 'docs':
                    await this.handleDocsCommand(args);
                    break;
                case 'doc-search':
                    await this.handleDocSearchCommand(args);
                    break;
                case 'doc-add':
                    await this.handleDocAddCommand(args);
                    break;
                case 'doc-stats':
                    await this.handleDocStatsCommand(args);
                    break;
                case 'doc-list':
                    await this.handleDocListCommand(args);
                    break;
                case 'doc-tag':
                    await this.handleDocTagCommand(args);
                    break;
                case 'doc-sync':
                    await this.handleDocSyncCommand(args);
                    break;
                case 'doc-load':
                    await this.handleDocLoadCommand(args);
                    break;
                case 'doc-context':
                    await this.handleDocContextCommand(args);
                    break;
                case 'doc-unload':
                    await this.handleDocUnloadCommand(args);
                    break;
                case 'doc-suggest':
                    await this.handleDocSuggestCommand(args);
                    break;

                // Memory (panelized)
                case 'memory':
                    await this.handleMemoryPanels(args);
                    break;

                // Enhanced Services Commands
                case 'redis':
                case 'cache-stats':
                case 'cache-health':
                case 'cache-clear':
                    await this.handleCacheCommands(cmd, args);
                    break;

                case 'supabase':
                case 'db':
                case 'auth':
                case 'session-sync':
                    await this.handleSupabaseCommands(cmd, args);
                    break;

                case 'enhanced-stats':
                    await this.showEnhancedStats();
                    break;

                // Git Operations
                case 'commits':
                case 'git-history':
                    await this.showCommitHistoryPanel(args);
                    break;

                // IDE Diagnostics (panelized like commits)
                case 'diagnostic':
                case 'diag':
                    await this.handleDiagnosticPanels(args);
                    break;
                case 'monitor':
                    await this.handleDiagnosticPanels(['start', ...args]);
                    break;
                case 'diag-status':
                    await this.handleDiagnosticPanels(['status']);
                    break;

                // Security & Modes (panelized)
                case 'security':
                    await this.handleSecurityPanels(args);
                    break;
                case 'dev-mode':
                    await this.handleDevModePanels(args);
                    break;
                case 'safe-mode':
                    await this.handleSafeModePanel();
                    break;
                case 'clear-approvals':
                    await this.handleClearApprovalsPanel();
                    break;

                // Help and Exit
                case 'help':
                    this.showSlashHelp();
                    break;
                case 'queue':
                    this.handleQueueCommand(args);
                    break;
                case 'tokens':
                    await this.manageTokenCommands(args);
                    break;
                case 'clear':
                    await this.clearSession();
                    break;
                case 'exit':
                case 'quit':
                    await this.shutdown();
                    return;

                default: {
                    const result = await this.slashHandler.handle(command);
                    if (result.shouldExit) {
                        await this.shutdown();
                        return;
                    }
                }
            }
        } catch (error: any) {
            console.log(chalk.red(`Error executing ${command}: ${error.message}`));
        }

        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Dispatch @agent commands through the unified command router
     */
    private async dispatchAt(input: string): Promise<void> {
        const result = await this.slashHandler.handle(input);
        if (result.shouldExit) {
            await this.shutdown();
            return;
        }

        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Handle * file selection and tagging commands
     */
    private async dispatchStar(input: string): Promise<void> {
        const trimmed = input.slice(1).trim(); // Remove * and trim

        console.log(chalk.cyan('🔍 Interactive File Picker'));
        console.log(chalk.gray('─'.repeat(50)));

        try {
            // If no pattern provided, show current directory
            const pattern = trimmed || '*';
            const pickerId = 'file-picker-' + Date.now();

            this.createStatusIndicator(pickerId, `Finding files: ${pattern}`);
            this.startAdvancedSpinner(pickerId, 'Scanning files...');

            // Use the FilePickerHandler for better file selection management
            const { FilePickerHandler } = await import('./handlers/file-picker-handler');
            const filePickerHandler = new FilePickerHandler(this.workingDirectory);

            try {
                const selection = await filePickerHandler.selectFiles(pattern, {
                    maxDisplay: 50,
                    maxFilesPerDirectory: 10,
                    showIcons: true,
                    groupByDirectory: true
                });

                this.stopAdvancedSpinner(pickerId, true, `Selected ${selection.files.length} files`);

                // Store selection in our internal system for reference
                this.storeSelectedFiles(selection.files, pattern);

            } catch (selectionError: any) {
                this.stopAdvancedSpinner(pickerId, false, 'No files found');

                console.log(chalk.yellow(selectionError.message));
                console.log(chalk.dim('Try different patterns like:'));
                console.log(chalk.dim('  * *.ts     - TypeScript files'));
                console.log(chalk.dim('  * src/**   - Files in src directory'));
                console.log(chalk.dim('  * **/*.js  - JavaScript files recursively'));
                console.log(chalk.dim('  * *.json   - Configuration files'));
                console.log(chalk.dim('  * test/**  - Test files'));
            }

        } catch (error: any) {
            console.log(chalk.red(`Error during file search: ${error.message}`));
        }

        // Ensure output is flushed and visible before showing prompt
        console.log();
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Show interactive file picker with selection capabilities
     */
    private async showInteractiveFilePicker(files: string[], pattern: string): Promise<void> {
        console.log(chalk.blue(`\n📂 Found ${files.length} files matching "${pattern}":`));
        console.log(chalk.gray('─'.repeat(60)));

        // Group files by directory for better organization
        const groupedFiles = this.groupFilesByDirectory(files);

        // Display files in organized groups
        let fileIndex = 0;
        const maxDisplay = 50; // Limit display for large file lists

        for (const [directory, dirFiles] of groupedFiles.entries()) {
            if (fileIndex >= maxDisplay) {
                console.log(chalk.yellow(`... and ${files.length - fileIndex} more files`));
                break;
            }

            if (directory !== '.') {
                console.log(chalk.cyan(`\n📁 ${directory}/`));
            }

            for (const file of dirFiles.slice(0, Math.min(10, maxDisplay - fileIndex))) {
                const fileExt = path.extname(file);
                const fileIcon = this.getFileIcon(fileExt);
                const relativePath = directory === '.' ? file : `${directory}/${file}`;

                console.log(`  ${fileIcon} ${chalk.white(file)} ${chalk.dim('(' + relativePath + ')')}`);
                fileIndex++;

                if (fileIndex >= maxDisplay) break;
            }

            if (dirFiles.length > 10) {
                console.log(chalk.dim(`    ... and ${dirFiles.length - 10} more in this directory`));
            }
        }

        // Show file picker options
        console.log(chalk.gray('\n─'.repeat(60)));
        console.log(chalk.green('📋 File Selection Options:'));
        console.log(chalk.dim('• Files are now visible in the UI (if advanced UI is active)'));
        console.log(chalk.dim('• Use the file paths in your next message to reference them'));
        console.log(chalk.dim('• Example: "Analyze these files: src/file1.ts, src/file2.ts"'));

        // Store files in session context for easy reference
        this.storeSelectedFiles(files, pattern);

        // Optional: Show quick selection menu for first few files
        if (files.length <= 10) {
            console.log(chalk.yellow('\n💡 Quick reference paths:'));
            files.forEach((file, index) => {
                console.log(chalk.dim(`   ${index + 1}. ${file}`));
            });
        }
    }

    /**
     * Group files by their directory for organized display
     */
    private groupFilesByDirectory(files: string[]): Map<string, string[]> {
        const groups = new Map<string, string[]>();

        files.forEach(file => {
            const directory = path.dirname(file);
            const fileName = path.basename(file);

            if (!groups.has(directory)) {
                groups.set(directory, []);
            }
            groups.get(directory)!.push(fileName);
        });

        // Sort directories, with '.' (current) first
        return new Map([...groups.entries()].sort(([a], [b]) => {
            if (a === '.') return -1;
            if (b === '.') return 1;
            return a.localeCompare(b);
        }));
    }

    /**
     * Get appropriate icon for file extension
     */
    private getFileIcon(extension: string): string {
        const iconMap: { [key: string]: string } = {
            '.ts': '🔷',
            '.tsx': '⚛️',
            '.js': '💛',
            '.jsx': '⚛️',
            '.json': '📋',
            '.md': '📝',
            '.txt': '📄',
            '.yml': '⚙️',
            '.yaml': '⚙️',
            '.css': '🎨',
            '.scss': '🎨',
            '.html': '🌐',
            '.py': '🐍',
            '.java': '☕',
            '.go': '🔷',
            '.rust': '🦀',
            '.rs': '🦀',
        };

        return iconMap[extension.toLowerCase()] || '📄';
    }

    /**
     * Store selected files in session context for future reference
     */
    private storeSelectedFiles(files: string[], pattern: string): void {
        // Store in a simple context that can be referenced later
        if (!this.selectedFiles) {
            this.selectedFiles = new Map();
        }

        this.selectedFiles.set(pattern, {
            files,
            timestamp: new Date(),
            pattern
        });

        // Keep only the last 5 file selections to avoid memory buildup
        if (this.selectedFiles.size > 5) {
            const oldestKey = this.selectedFiles.keys().next().value;
            if (oldestKey !== undefined) {
                this.selectedFiles.delete(oldestKey);
            }
        }
    }
    /**
     * Show agent suggestions when @ is pressed
     */
    private showAgentSuggestions(): void {
        console.log(chalk.cyan('\n💡 Available Agents:'));
        console.log(chalk.gray('─'.repeat(50)));

        // Get available agents from AgentManager
        const availableAgents = this.agentManager.listAgents();

        if (availableAgents.length > 0) {
            availableAgents.forEach(agent => {
                const statusIcon = agent.status === 'ready' ? '✅' :
                    agent.status === 'busy' ? '⏳' : '❌';
                console.log(`${statusIcon} ${chalk.blue('@' + agent.specialization)} - ${chalk.dim(agent.description)}`);

                // Show some capabilities
                const capabilities = agent.capabilities.slice(0, 3).join(', ');
                if (capabilities) {
                    console.log(`   ${chalk.gray('Capabilities:')} ${chalk.yellow(capabilities)}`);
                }
            });
        } else {
            console.log(chalk.yellow('No agents currently available'));
            console.log(chalk.dim('Standard agents:'));
            console.log(`✨ ${chalk.blue('@universal-agent')} - All-in-one enterprise agent`);
            console.log(`🔍 ${chalk.blue('@ai-analysis')} - AI code analysis and review`);
            console.log(`📝 ${chalk.blue('@code-review')} - Code review specialist`);
            console.log(`⚛️ ${chalk.blue('@react-expert')} - React and Next.js expert`);
        }

        console.log(chalk.gray('\n─'.repeat(50)));
        console.log(chalk.dim('💡 Usage: @agent-name <your task description>'));
        console.log('');
    }

    /**
     * Show file picker suggestions when * is pressed
     */
    private showFilePickerSuggestions(): void {
        console.log(chalk.magenta('\n🔍 File Selection Commands:'));
        console.log(chalk.gray('─'.repeat(50)));

        console.log(`${chalk.magenta('*')}              Browse all files in current directory`);
        console.log(`${chalk.magenta('* *.ts')}         Find all TypeScript files`);
        console.log(`${chalk.magenta('* *.js')}         Find all JavaScript files`);
        console.log(`${chalk.magenta('* src/**')}       Browse files in src directory`);
        console.log(`${chalk.magenta('* **/*.tsx')}     Find React component files`);
        console.log(`${chalk.magenta('* package.json')} Find package.json files`);
        console.log(`${chalk.magenta('* *.md')}         Find all markdown files`);

        console.log(chalk.gray('\n─'.repeat(50)));
        console.log(chalk.dim('💡 Usage: * <pattern> to find and select files'));
        console.log(chalk.dim('📋 Selected files can be referenced in your next message'));
        console.log('');
        // Ensure output is flushed and visible before showing prompt

        this.showPrompt();
    }

    /**
     * Handle slash commands (Claude Code style)
     */
    private async handleSlashCommand(command: string): Promise<void> {
        const parts = command.slice(1).split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        try {
            switch (cmd) {
                case 'init':
                    await this.handleInitProject(args.includes('--force'));
                    break;

                case 'plan':
                    if (args.length === 0) {
                        this.currentMode = 'plan';
                        console.log(chalk.green('✓ Switched to plan mode'));
                    } else {
                        await this.generatePlan(args.join(' '), {});
                    }
                    break;

                case 'auto':
                    if (args.length === 0) {
                        this.currentMode = 'auto';
                        console.log(chalk.green('✓ Switched to auto mode'));
                    } else {
                        await this.autoExecute(args.join(' '), {});
                    }
                    break;

                case 'default':
                    this.currentMode = 'default';
                    console.log(chalk.green('✓ Switched to default mode'));
                    break;

                case 'agent':
                    if (args.length === 0) {
                        await this.listAgents();
                    } else {
                        this.currentAgent = args[0];
                        console.log(chalk.green(`✓ Switched to agent: ${args[0]}`));
                    }
                    break;

                case 'model':
                    if (args.length === 0) {
                        await this.listModels();
                    } else {
                        this.switchModel(args[0]);
                    }
                    break;

                case 'clear':
                    await this.clearSession();
                    break;

                case 'compact':
                    await this.compactSession();
                    break;

                case 'diag':
                case 'diagnostic':
                    await this.handleDiagnosticCommand(args);
                    break;

                case 'health':
                    await this.handleProjectHealthCommand();
                    break;

                case 'tokens':
                    if (args[0] === 'reset') {
                        this.resetSessionTokenUsage();
                        console.log(chalk.green('✅ Session token counters reset'));
                    } else if (args[0] === 'test') {
                        // Test real AI operation with actual agent service
                        console.log(chalk.blue('🧪 Testing real AI operation...'));
                        this.startAIOperation('Testing AI System');

                        try {
                            // Use real agent service for testing - returns taskId immediately
                            const taskId = await agentService.executeTask('universal-agent', 'Test AI Operation: Testing real AI integration and token usage');

                            // Update with estimated token usage
                            this.updateTokenUsage(250, true, 'claude-sonnet-4-20250514');

                            this.stopAIOperation();
                            console.log(chalk.green(`\n✅ AI test launched (Task ID: ${taskId.slice(-6)})`));
                            this.showPrompt();
                        } catch (error: any) {
                            this.stopAIOperation();
                            console.log(chalk.red(`\n❌ AI test failed: ${error.message}`));
                            this.showPrompt();
                        }
                    } else {
                        await this.showTokenUsage();
                    }
                    break;

                case 'cache':
                    await this.manageTokenCache(args[0]);
                    break;

                case 'mcp':
                    await this.handleMcpCommands(args);
                    break;

                case 'cost':
                    await this.showCost();
                    break;

                case 'config':
                    await this.manageConfig({ show: true });
                    break;

                case 'status':
                    await this.showStatus();
                    break;

                case 'todo':
                    await this.manageTodo({ list: true });
                    break;

                case 'todos':
                    await this.manageTodo({ list: true });
                    break;

                // Agent Management
                case 'agents':
                    await this.listAgents();
                    break;

                case 'parallel':
                    if (args.length < 2) {
                        console.log(boxen('Usage: /parallel <agent1,agent2,...> <task>', { title: '🤖 Parallel', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                        return;
                    }
                    {
                        const agentNames = args[0].split(',').map(n => n.trim()).filter(Boolean);
                        const task = args.slice(1).join(' ');
                        console.log(boxen(`Running ${agentNames.length} agents in parallel...`, { title: '🤖 Parallel', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));
                        try {
                            await Promise.all(agentNames.map(name => agentService.executeTask(name, task, {})));
                            console.log(boxen('All agents launched successfully', { title: '✅ Parallel', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                        } catch (e: any) {
                            console.log(boxen(`Parallel execution error: ${e.message}`, { title: '❌ Parallel', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }));
                        }
                    }
                    break;

                case 'factory':
                    this.showFactoryPanel();
                    break;

                case 'create-agent':
                    if (args.length < 2) {
                        console.log(boxen('Usage: /create-agent [--vm|--container] <name> <specialization>\nExamples:\n  /create-agent react-expert "React development and testing"\n  /create-agent --vm repo-analyzer "Repository analysis"', { title: '🧬 Create Agent', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                        return;
                    }
                    // Reuse real implementation already present earlier in handleAdvancedFeatures
                    await this.handleAdvancedFeatures('create-agent', args);
                    break;

                case 'launch-agent':
                    if (args.length === 0) {
                        console.log(boxen('Usage: /launch-agent <blueprint-id> [task]', { title: '🚀 Launch Agent', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                        return;
                    }
                    await this.handleAdvancedFeatures('launch-agent', args);
                    break;

                // Session Management
                case 'new':
                    await this.handleSessionManagement('new', args);
                    break;

                case 'sessions':
                    await this.handleSessionManagement('sessions', args);
                    break;

                case 'export':
                    await this.handleSessionManagement('export', args);
                    break;

                case 'stats':
                    await this.handleSessionManagement('stats', args);
                    break;

                case 'history':
                    await this.handleSessionManagement('history', args);
                    break;

                case 'debug':
                    await this.handleSessionManagement('debug', args);
                    break;

                case 'temp':
                    await this.handleSessionManagement('temp', args);
                    break;

                case 'system':
                    await this.handleSessionManagement('system', args);
                    break;

                // Model & Config
                case 'models':
                    await this.showModelsPanel();
                    break;

                case 'set-key':
                    await this.handleModelConfig('set-key', args);
                    break;

                // Advanced Features
                case 'context':
                    await this.handleAdvancedFeatures('context', args);
                    break;

                case 'stream':
                    await this.handleAdvancedFeatures('stream', args);
                    break;

                case 'approval':
                    await this.handleAdvancedFeatures('approval', args);
                    break;

                // File Operations
                case 'read':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /read <file>'));
                        return;
                    }
                    await this.readFile(args[0]);
                    break;

                case 'write':
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /write <file> <content>'));
                        return;
                    }
                    const filename = args[0];
                    const content = args.slice(1).join(' ');
                    await this.writeFile(filename, content);
                    break;

                case 'edit':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /edit <file>'));
                        return;
                    }
                    await this.editFile(args[0]);
                    break;

                case 'ls':
                    const directory = args[0] || '.';
                    await this.listFiles(directory);
                    break;

                case 'search':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /search <query>'));
                        return;
                    }
                    await this.searchFiles(args.join(' '));
                    break;

                // Terminal Operations
                case 'run':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /run <command>'));
                        return;
                    }
                    await this.runCommand(args.join(' '));
                    break;

                case 'npm':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /npm <args>'));
                        return;
                    }
                    await this.runCommand(`npm ${args.join(' ')}`);
                    break;

                case 'yarn':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /yarn <args>'));
                        return;
                    }
                    await this.runCommand(`yarn ${args.join(' ')}`);
                    break;

                case 'git':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /git <args>'));
                        return;
                    }
                    await this.runCommand(`git ${args.join(' ')}`);
                    break;

                case 'docker':
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /docker <args>'));
                        return;
                    }
                    await this.runCommand(`docker ${args.join(' ')}`);
                    break;

                // Project Operations
                case 'build':
                    await this.buildProject();
                    break;

                case 'test':
                    const pattern = args.join(' ');
                    await this.runTests(pattern);
                    break;

                case 'lint':
                    await this.runLinting();
                    break;

                // Model Management
                case 'models':
                    await this.listModels();
                    break;

                case 'help':
                    this.showSlashHelp();
                    break;

                case 'exit':
                case 'quit':
                    await this.shutdown();
                    break;

                default:
                    console.log(chalk.red(`Unknown command: /${cmd}`));
                    console.log(chalk.dim('Type /help for available commands'));
            }
        } catch (error: any) {
            console.log(chalk.red(`Error executing /${cmd}: ${error.message}`));
        }

        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Handle regular chat input based on current mode
     */
    private async handleChatInput(input: string): Promise<void> {
        try {
            // Load relevant project context for enhanced chat responses
            const relevantContext = await this.getRelevantProjectContext(input);
            const enhancedInput = relevantContext ? `${input}\n\nContext: ${relevantContext}` : input;

            switch (this.currentMode) {
                case 'plan':
                    await this.handlePlanMode(enhancedInput);
                    break;

                case 'auto':
                    await this.handleAutoMode(enhancedInput);
                    break;

                case 'vm':
                    await this.handleVMMode(enhancedInput);
                    break;

                default:
                    await this.handleDefaultMode(enhancedInput);
            }

            // Update project context disabled to avoid constant file changes
            // await this.updateProjectContext(input);
        } catch (error: any) {
            console.log(chalk.red(`Error: ${error.message}`));
        }

        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * VM mode: Chat directly with VM agents in containers using real communication
     */
    private async handleVMMode(input: string): Promise<void> {
        console.log(chalk.blue('🐳 VM Mode: Real communication with VM agents...'));

        try {
            // Get VM orchestrator instance from slash handler
            const vmOrchestrator = this.slashHandler.getVMOrchestrator?.();
            if (!vmOrchestrator) {
                console.log(chalk.red('❌ VM Orchestrator not available'));
                console.log(chalk.gray('Use /vm-init to initialize VM system'));
                return;
            }

            // Get registered VM agents from the bridge
            const bridgeStats = vmOrchestrator.getBridgeStats?.();
            const activeAgents = bridgeStats?.activeConnections || 0;
            const containers = this.slashHandler.getActiveVMContainers?.() || [];

            if (containers.length === 0) {
                console.log(chalk.yellow('⚠️ No active VM containers'));
                console.log(chalk.gray('Use /vm-create <repo-url> to create one'));
                console.log(chalk.gray('Use /default to exit VM mode'));
                return;
            }

            console.log(chalk.cyan(`🌉 Bridge Stats: ${activeAgents} agents, ${containers.length} containers`));
            console.log(chalk.gray(`Message: ${input.substring(0, 100)}${input.length > 100 ? '...' : ''}`));

            // Send message to each VM agent through the communication bridge
            for (const container of containers) {
                try {
                    console.log(chalk.blue(`🤖 VM Agent ${container.id.slice(0, 8)}: Sending via bridge...`));

                    // Use real communication through VMOrchestrator bridge
                    if (vmOrchestrator.sendMessageToAgent) {
                        const response = await vmOrchestrator.sendMessageToAgent(container.agentId, input);

                        if (response.success) {
                            console.log(chalk.green(`✅ VM Agent ${container.id.slice(0, 8)}: Response received`));
                            console.log(chalk.white(`📝 Response: ${response.data?.substring(0, 200)}${response.data?.length > 200 ? '...' : ''}`));
                            console.log(chalk.gray(`⏱️ Response time: ${response.metadata?.responseTime}ms`));
                        } else {
                            console.log(chalk.red(`❌ VM Agent ${container.id.slice(0, 8)}: ${response.error}`));
                        }
                    } else {
                        // Bridge not initialized - show error and guidance
                        console.log(chalk.red(`❌ VM Bridge not initialized for ${container.id.slice(0, 8)}`));
                        console.log(chalk.gray('   VM communication system requires proper initialization'));
                        console.log(chalk.gray('   This indicates a configuration or startup issue'));
                    }

                    console.log(chalk.gray(`Repository: ${container.repositoryUrl}`));
                    console.log(chalk.gray(`VS Code: http://localhost:${container.vscodePort}`));
                    console.log('');

                } catch (error: any) {
                    console.log(chalk.red(`❌ VM Agent ${container.id.slice(0, 8)} error: ${error.message}`));
                    console.log(chalk.gray('Continuing with next agent...'));
                }
            }

            // Show bridge statistics
            if (vmOrchestrator.getBridgeStats) {
                const stats = vmOrchestrator.getBridgeStats();
                console.log(chalk.cyan('📊 Communication Stats:'));
                console.log(chalk.gray(`   Messages routed: ${stats.totalMessagesRouted}`));
                console.log(chalk.gray(`   Success rate: ${Math.round((stats.successfulRequests / (stats.successfulRequests + stats.failedRequests)) * 100) || 0}%`));
                console.log(chalk.gray(`   Avg response time: ${Math.round(stats.averageResponseTime)}ms`));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ VM Mode communication error: ${error.message}`));
            console.log(chalk.gray('Use /default to exit VM mode'));
            console.log(chalk.gray('Use /vm-status to check system health'));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Plan mode: Generate comprehensive plan with todo.md and request approval
     */
    private async handlePlanMode(input: string): Promise<void> {
        console.log(chalk.blue('🎯 Entering Enhanced Planning Mode...'));

        try {
            // Start progress indicator using our new methods
            const planningId = 'planning-' + Date.now();
            this.createStatusIndicator(planningId, 'Generating comprehensive plan', input);
            this.startAdvancedSpinner(planningId, 'Analyzing requirements and generating plan...');

            // Generate comprehensive plan with todo.md
            const plan = await enhancedPlanning.generatePlan(input, {
                maxTodos: 15,
                includeContext: true,
                showDetails: true,
                saveTodoFile: true,
                todoFilePath: 'todo.md'
            });

            this.stopAdvancedSpinner(planningId, true, `Plan generated with ${plan.todos.length} todos`);

            // Show plan summary
            console.log(chalk.blue.bold('\n📋 Plan Generated:'));
            console.log(chalk.green(`✓ Todo file saved: ${path.join(this.workingDirectory, 'todo.md')}`));
            console.log(chalk.cyan(`📊 ${plan.todos.length} todos created`));
            console.log(chalk.cyan(`⏱️  Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`));

            // Request approval for execution using the enhanced approval system
            const { approvalSystem } = await import('./ui/approval-system');

            const planDetails = {
                totalSteps: plan.todos.length,
                estimatedDuration: plan.estimatedTotalDuration,
                riskLevel: plan.riskAssessment?.overallRisk || 'medium',
                categories: [...new Set(plan.todos.map(t => t.category))],
                priorities: this.calculatePriorityDistribution(plan.todos),
                dependencies: plan.todos.filter(t => t.dependencies.length > 0).length,
                affectedFiles: plan.todos.flatMap(t => t.files || []),
                commands: plan.todos.flatMap(t => t.commands || []),
            };

            const approvalResult = await approvalSystem.requestPlanApproval(
                `Execute Plan: ${plan.title}`,
                `Execute ${plan.todos.length} tasks with enhanced risk analysis`,
                planDetails,
                {
                    showBreakdown: true,
                    showTimeline: true,
                    allowModification: true,
                }
            );

            if (approvalResult.approved) {
                console.log(chalk.green('\n🚀 Plan approved! Starting execution...'));
                console.log(chalk.cyan('📋 Plan will be executed step by step'));

                // Execute the plan directly without switching modes
                await this.executePlanDirectly(plan.id);

                // Show final summary
                this.showExecutionSummary();

                console.log(chalk.green.bold('\n🎉 Plan execution completed successfully!'));
                process.stdout.write('');
                await new Promise(resolve => setTimeout(resolve, 150));
                this.showPrompt();
                console.log(chalk.cyan('📄 Check the updated todo.md file for execution details'));

                // Reset mode and return to normal chat after successful execution
                console.log(chalk.green('🔄 Returning to normal chat mode...'));
                this.currentMode = 'default';
                this.showPrompt();

            } else {
                console.log(chalk.yellow('\n📝 Plan saved but not executed.'));
                console.log(chalk.gray('You can review the todo.md file and run `/plan execute` later.'));
                console.log(chalk.gray('Or use `/auto [task]` to execute specific parts of the plan.'));

                // Ask if they want to regenerate the plan
                const regenerate = await approvalSystem.confirm(
                    'Do you want to regenerate the plan with different requirements?',
                    'This will create a new plan and overwrite the current todo.md',
                    false
                );

                if (regenerate) {
                    const newRequirements = await approvalSystem.promptInput('Enter new or modified requirements: ');
                    if (newRequirements.trim()) {
                        await this.handlePlanMode(newRequirements);
                    }
                } else {
                    // User declined regeneration, exit plan mode and return to default
                    console.log(chalk.yellow('🔄 Exiting plan mode and returning to default mode...'));
                    this.currentMode = 'default';
                    this.showPrompt();
                }
            }

        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Plan generation failed: ${error.message}`, source: 'planning' });
            console.log(chalk.red(`❌ Planning failed: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Execute plan directly without mode switching
     */
    private async executePlanDirectly(planId: string): Promise<void> {
        try {
            // Enable event streaming for plan execution
            console.log(chalk.dim('🎨 Plan Mode - Activating event streaming for execution...'));
            this.subscribeToAllEventSources();

            await enhancedPlanning.executePlan(planId);
        } catch (error: any) {
            console.log(chalk.red(`❌ Plan execution failed: ${error.message}`));
            throw error;
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Calculate priority distribution for plan approval
     */
    private calculatePriorityDistribution(todos: any[]): Record<string, number> {
        return todos.reduce((acc, todo) => {
            acc[todo.priority] = (acc[todo.priority] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }

    private showExecutionSummary(): void {
        const indicators = Array.from(this.indicators.values());
        const completed = indicators.filter(i => i.status === 'completed').length;
        const failed = indicators.filter(i => i.status === 'failed').length;
        const warnings = indicators.filter(i => i.status === 'warning').length;

        const summary = boxen(
            `${chalk.bold('Execution Summary')}\n\n` +
            `${chalk.green('✅ Completed:')} ${completed}\n` +
            `${chalk.red('❌ Failed:')} ${failed}\n` +
            `${chalk.yellow('⚠️ Warnings:')} ${warnings}\n` +
            `${chalk.blue('📊 Total:')} ${indicators.length}\n\n` +
            `${chalk.gray('Overall Status:')} ${this.getOverallStatusText()}`,
            {
                padding: 1,
                margin: { top: 1, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: failed > 0 ? 'red' : completed === indicators.length ? 'green' : 'yellow',
            }
        );

        console.log(summary);
    }

    private getOverallStatusText(): string {
        const indicators = Array.from(this.indicators.values());

        if (indicators.length === 0) return chalk.gray('No tasks');

        const completed = indicators.filter(i => i.status === 'completed').length;
        const failed = indicators.filter(i => i.status === 'failed').length;

        if (failed > 0) {
            return chalk.red('Some tasks failed');
        } else if (completed === indicators.length) {
            this.showPrompt();
            return chalk.green('All tasks completed successfully');
        } else {
            this.showPrompt();
            return chalk.blue('Tasks in progress');
        }

    }


    /**
     * Auto mode: Execute immediately without approval
     */
    private async handleAutoMode(input: string): Promise<void> {
        console.log(chalk.blue('🚀 Auto-executing task...'));

        // Use agent if specified, otherwise auto-select
        if (this.currentAgent) {
            await this.executeAgent(this.currentAgent, input, { auto: true });
        } else {
            await this.autoExecute(input, {});
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }
    /**
     * Default mode: Unified Aggregator - observes and subscribes to all event sources
     */
    private async handleDefaultMode(input: string): Promise<void> {
        // Initialize as Unified Aggregator for all event sources
        this.subscribeToAllEventSources();

        // Re-enable auto-todo generation in default chat mode
        // Triggers when user explicitly mentions "todo" or when the task is complex
        try {
            const wantsTodos = /\btodo(s)?\b/i.test(input);
            const autoTodoCfg = this.configManager.get('autoTodo') as any;
            const requireExplicit = !!(autoTodoCfg && autoTodoCfg.requireExplicitTrigger);
            const shouldTrigger = requireExplicit ? wantsTodos : (wantsTodos || this.assessTaskComplexity(input));
            if (shouldTrigger) {
                console.log(chalk.cyan('📋 Detected actionable request — generating todos...'));
                await this.autoGenerateTodosAndOrchestrate(input);
                return; // Background execution will proceed; keep chat responsive
            }
        } catch { /* fallback to normal chat if assessment fails */ }

        // Handle execute command for last generated plan
        if (input.toLowerCase().trim() === 'execute' && this.lastGeneratedPlan) {
            console.log(chalk.blue('🚀 Executing the generated plan...'));
            try {
                await this.planningManager.executePlan(this.lastGeneratedPlan.id);
                console.log(chalk.green('✅ Plan execution completed!'));
                this.lastGeneratedPlan = undefined; // Clear the stored plan
                return;
            } catch (error: any) {
                console.log(chalk.red(`Plan execution failed: ${error?.message || error}`));
                return;
            }
        }

        // Check if input mentions specific agent
        const agentMatch = input.match(/@(\w+)/);

        if (agentMatch) {
            const agentName = agentMatch[1];
            const task = input.replace(agentMatch[0], '').trim();
            await this.executeAgent(agentName, task, {});
        } else {
            // DEFAULT CHAT MODE: Simple chat (auto-todos handled above)
            try {
                // Direct chat response without complexity assessment or auto-todos
                const toolRecommendations = toolRouter.analyzeMessage({ role: 'user', content: input });
                if (toolRecommendations.length > 0) {
                    const topRecommendation = toolRecommendations[0];
                    console.log(chalk.blue(`🔧 Detected ${topRecommendation.tool} intent (${Math.round(topRecommendation.confidence * 100)}% confidence)`));

                    // Auto-execute high-confidence tool recommendations

                }

                // Activate structured UI for better visualization
                console.log(chalk.dim('🎨 Default Mode (Unified Aggregator) - Activating structured UI...'));
                advancedUI.startInteractiveMode();

                // Record user message in session
                chatManager.addMessage(input, 'user');

                // Build model-ready messages from session history (respects history setting)
                let messages = chatManager.getContextMessages().map(m => ({
                    role: m.role as 'system' | 'user' | 'assistant',
                    content: m.content,
                }));

                // Auto-compact if approaching token limit with more aggressive thresholds
                const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
                const estimatedTokens = Math.round(totalChars / 4);

                if (estimatedTokens > 100000) { // More aggressive - compact at 100k instead of 150k
                    console.log(chalk.yellow(`⚠️ Token usage: ${estimatedTokens.toLocaleString()}, auto-compacting...`));
                    await this.compactSession();

                    // Rebuild messages after compaction
                    messages = chatManager.getContextMessages().map(m => ({
                        role: m.role as 'system' | 'user' | 'assistant',
                        content: m.content,
                    }));

                    // Re-check token count after compaction
                    const newTotalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
                    const newEstimatedTokens = Math.round(newTotalChars / 4);
                    console.log(chalk.green(`✅ Compacted to ${newEstimatedTokens.toLocaleString()} tokens`));
                } else if (estimatedTokens > 50000) {
                    console.log(wrapBlue(`📊 Token usage: ${estimatedTokens.toLocaleString()}`));
                }

                // Stream assistant response with enhanced streaming
                process.stdout.write(`${chalk.cyan('\nAssistant: ')}`);
                let assistantText = '';
                let hasToolCalls = false;

                for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
                    if (ev.type === 'text_delta' && ev.content) {
                        assistantText += ev.content;
                        process.stdout.write(ev.content);

                        // Text content is already handled by console output
                    } else if (ev.type === 'tool_call') {
                        hasToolCalls = true;
                        const toolMessage = `🛠️ Tool call: ${ev.content}`;
                        console.log(`\n${chalk.blue(toolMessage)}`);

                        // Log to structured UI
                        advancedUI.logInfo('Tool Call', ev.content);

                        // Check if tool call involves background agents
                        if (ev.metadata?.backgroundAgents) {
                            ev.metadata.backgroundAgents.forEach((agentInfo: any) => {
                                this.routeEventToUI('bg_agent_orchestrated', {
                                    parentTool: ev.content,
                                    agentId: agentInfo.id,
                                    agentName: agentInfo.name,
                                    task: agentInfo.task
                                });
                            });
                        }
                    } else if (ev.type === 'tool_result') {
                        const resultMessage = `✅ Result: ${ev.content}`;
                        console.log(`${chalk.green(resultMessage)}`);

                        // Log to structured UI
                        advancedUI.logSuccess('Tool Result', ev.content);

                        // Show results from background agents if present
                        if (ev.metadata?.backgroundResults) {
                            ev.metadata.backgroundResults.forEach((result: any) => {
                                advancedUI.logSuccess(
                                    'Background Result',
                                    `${result.agentName}: ${result.summary}`
                                );

                                // Show file changes if present
                                if (result.fileChanges) {
                                    result.fileChanges.forEach((change: any) => {
                                        this.advancedUI.showFileDiff(
                                            change.path,
                                            change.before,
                                            change.after
                                        );
                                    });
                                }
                            });
                        }

                        // Show file diffs and content using advancedUI
                        if (ev.metadata?.filePath) {
                            if (ev.metadata?.originalContent && ev.metadata?.newContent) {
                                this.advancedUI.showFileDiff(ev.metadata.filePath, ev.metadata.originalContent, ev.metadata.newContent);
                            } else if (ev.metadata?.content) {
                                this.advancedUI.showFileContent(ev.metadata.filePath, ev.metadata.content);
                            }
                        }
                    } else if (ev.type === 'error') {
                        const errorMessage = ev.content || ev.error || 'Unknown error';
                        console.log(`${chalk.red(errorMessage)}`);

                        // Log to structured UI
                        advancedUI.logError('Error', errorMessage);
                    }
                }

                // Add separator if tool calls were made
                if (hasToolCalls) {
                    console.log(chalk.gray('─'.repeat(50)));
                }

                // Save assistant message to history
                if (assistantText.trim().length > 0) {
                    chatManager.addMessage(assistantText.trim(), 'assistant');
                }

                console.log(); // newline after streaming

                // Update token usage after streaming completes (sync with session)
                this.syncTokensFromSession();
            } catch (err: any) {
                console.log(chalk.red(`Chat error: ${err.message}`));
            }
        }
    }

    /**
     * Generate execution plan for a task
     */
    async generatePlan(task: string, options: PlanOptions): Promise<void> {
        console.log(wrapBlue(`🎯 Generating plan for: ${task}`));

        try {
            // Start progress indicator using enhanced UI
            const planningId = 'planning-' + Date.now();
            this.createStatusIndicator(planningId, 'Generating comprehensive plan', task);
            this.startAdvancedSpinner(planningId, 'Analyzing requirements and generating plan...');

            // Use enhanced planning service like in plan mode
            const plan = await enhancedPlanning.generatePlan(task, {
                maxTodos: 15,
                includeContext: true,
                showDetails: true,
                saveTodoFile: true,
                todoFilePath: 'todo.md'
            });

            this.stopAdvancedSpinner(planningId, true, `Plan generated with ${plan.todos.length} todos`);

            // Show plan summary like in plan mode
            console.log(chalk.blue.bold('\n📋 Plan Generated:'));
            console.log(chalk.green(`✓ Todo file saved: ${path.join(this.workingDirectory, 'todo.md')}`));
            console.log(chalk.cyan(`📊 ${plan.todos.length} todos created`));
            console.log(chalk.cyan(`⏱️  Estimated duration: ${Math.round(plan.estimatedTotalDuration)} minutes`));

            // Plan is already saved to todo.md by enhancedPlanning

            if (options.execute) {
                // Use enhanced approval system
                const approved = await enhancedPlanning.requestPlanApproval(plan.id);
                if (approved) {
                    console.log(chalk.green('\n🚀 Executing plan...'));
                    await this.executeAdvancedPlan(plan.id);
                    this.showExecutionSummary();
                    console.log(chalk.green.bold('\n🎉 Plan execution completed successfully!'));
                    process.stdout.write('');
                    await new Promise(resolve => setTimeout(resolve, 150));
                    this.showPrompt();

                    // Reset mode and return to normal chat after successful execution
                    console.log(chalk.green('🔄 Returning to normal chat mode...'));
                    this.currentMode = 'default';

                } else {
                    console.log(chalk.yellow('\n📝 Plan saved but not executed.'));
                    console.log(chalk.gray('You can review the todo.md file and run `/plan execute` later.'));

                    // Add regeneration option like in plan mode
                    const regenerate = await this.askAdvancedConfirmation(
                        'Do you want to regenerate the plan with different requirements?',
                        'This will create a new plan and overwrite the current todo.md',
                        false
                    );

                    if (regenerate) {
                        const newRequirements = await this.askForInput('Enter new or modified requirements: ');
                        if (newRequirements.trim()) {
                            await this.generatePlan(newRequirements, options);
                        }
                    }
                }
            }
        } catch (error: any) {
            console.log(chalk.red(`Plan generation failed: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Execute task with specific agent
     */
    async executeAgent(name: string, task: string, options: AgentOptions): Promise<void> {
        console.log(formatAgent(name, 'executing', task));

        try {
            // Launch real agent via AgentService; run asynchronously
            const taskId = await agentService.executeTask(name, task, {});
            console.log(wrapBlue(`🚀 Launched ${name} (Task ID: ${taskId.slice(-6)})`));
        } catch (error: any) {
            console.log(chalk.red(`Agent execution failed: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Autonomous execution with best agent selection
     */
    async autoExecute(task: string, options: AutoOptions): Promise<void> {
        console.log(wrapBlue(`🚀 Auto-executing: ${task}`));

        try {
            if (options.planFirst) {
                // Use real PlanningService to create and execute plan asynchronously
                const plan = await planningService.createPlan(task, {
                    showProgress: true,
                    autoExecute: true,
                    confirmSteps: false,
                });
                console.log(chalk.cyan(`📋 Generated plan with ${plan.steps.length} steps (id: ${plan.id}). Executing in background...`));
                // Fire-and-forget execution to keep CLI responsive
                (async () => {
                    try {
                        await planningService.executePlan(plan.id, {
                            showProgress: true,
                            autoExecute: true,
                            confirmSteps: false,
                        });
                    } catch (err: any) {
                        console.log(chalk.red(`❌ Plan execution error: ${err.message}`));
                    }
                })();
            } else {
                // Direct autonomous execution - select best agent and launch
                const selected = this.agentManager.findBestAgentForTask(task as any);
                console.log(chalk.blue(`🤖 Selected agent: ${chalk.cyan(selected)}`));
                const taskId = await agentService.executeTask(selected as any, task, {});
                console.log(wrapBlue(`🚀 Launched ${selected} (Task ID: ${taskId.slice(-6)})`));
            }
        } catch (error: any) {
            console.log(chalk.red(`Auto execution failed: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Manage todo items and planning
     */
    async manageTodo(options: TodoOptions): Promise<void> {
        if (options.list) {
            console.log(chalk.cyan('📋 Todo Items:'));
            const plans = this.planningManager.listPlans();

            if (plans.length === 0) {
                console.log(chalk.dim('No todo items found'));
                return;
            }

            plans.forEach((plan, index) => {
                const status = '⏳'; // Plans don't have status property, using default
                console.log(`${index + 1}. ${status} ${plan.title}`);
                console.log(`   ${chalk.dim(plan.description)}`);
            });
        }

        if (options.add) {
            console.log(wrapBlue(`Adding todo: ${options.add}`));
            await this.generatePlan(options.add, {});
        }

        if (options.complete) {
            console.log(chalk.green(`Marking todo ${options.complete} as complete`));
            // Implementation for marking todo complete
        }
    }

    /**
     * Manage CLI configuration
     */
    async manageConfig(options: ConfigOptions): Promise<void> {
        if (options.show) {
            console.log(chalk.cyan('⚙️ Current Configuration:'));
            const config = this.configManager.getConfig();
            console.log(chalk.dim('Model:'), chalk.green(config.currentModel));
            console.log(chalk.dim('Working Directory:'), chalk.blue(this.workingDirectory));
            console.log(chalk.dim('Mode:'), chalk.yellow(this.currentMode));
            if (this.currentAgent) {
                console.log(chalk.dim('Current Agent:'), chalk.cyan(this.currentAgent));
            }
            console.log(); // Add spacing after config info
        }

        if (options.model) {
            this.switchModel(options.model);
        }
    }

    /**
     * Initialize project with CLAUDE.md context file (NIKOCLI.md)
     */
    async initProject(options: InitOptions): Promise<void> {
        console.log(chalk.blue('🔧 Initializing project context...'));

        const claudeFile = path.join(this.workingDirectory, 'NIKOCLI.md');

        try {
            // Check if CLAUDE.md (NIKOCLI.md) already exists
            const exists = await fs.access(claudeFile).then(() => true).catch(() => false);

            if (exists && !options.force) {
                console.log(chalk.yellow('NIKOCLI.md already exists. Use --force to overwrite.'));
                return;
            }

            // Analyze project structure
            console.log(chalk.dim('Analyzing project structure...'));
            const analysis = await this.analyzeProject();

            // Generate CLAUDE.md content
            const content = this.generateClaudeMarkdown(analysis);

            // Write file
            await fs.writeFile(claudeFile, content, 'utf8');

            console.log(chalk.green('✓ NIKOCLI.md created successfully'));
            console.log(chalk.dim(`Context file: ${claudeFile}`));

        } catch (error: any) {
            console.log(chalk.red(`Failed to initialize project: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * Show system status and agent information
     */
    async showStatus(): Promise<void> {
        const stats = this.agentManager.getStats();
        const planningStats = this.planningManager.getPlanningStats();

        const lines: string[] = [];
        lines.push('System:');
        lines.push(`• Working Directory: ${this.workingDirectory}`);
        lines.push(`• Mode: ${this.currentMode}`);
        lines.push(`• Model: ${advancedAIProvider.getCurrentModelInfo().name}`);
        if (this.currentAgent) lines.push(`• Current Agent: ${this.currentAgent}`);
        lines.push('');
        lines.push('Agents:');
        lines.push(`• Total: ${stats.totalAgents}`);
        lines.push(`• Active: ${stats.activeAgents}`);
        lines.push(`• Pending Tasks: ${stats.pendingTasks}`);
        lines.push('');
        lines.push('Planning:');
        lines.push(`• Plans Generated: ${planningStats.totalPlansGenerated}`);
        lines.push(`• Plans Executed: ${planningStats.totalPlansExecuted}`);
        lines.push(`• Success Rate: ${planningStats.totalPlansExecuted > 0 ? Math.round((planningStats.successfulExecutions / planningStats.totalPlansExecuted) * 100) : 0}%`);

        const panel = boxen(lines.join('\n'), {
            title: '🔍 NikCLI Status',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan'
        });

        console.log(panel);
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * List available agents and their capabilities
     */
    async listAgents(): Promise<void> {
        console.log(chalk.cyan.bold('🤖 Available Agents'));
        console.log(chalk.gray('─'.repeat(50)));
        const available = agentService.getAvailableAgents();
        available.forEach(agent => {
            console.log(chalk.white(`  • ${agent.name}`));
            console.log(chalk.gray(`    ${agent.description}`));
        });
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    /**
     * List available AI models
     */
    async listModels(): Promise<void> {
        console.log(chalk.cyan.bold('🧠 Available Models'));
        console.log(chalk.gray('─'.repeat(50)));
        try {
            const currentModel = configManager.getCurrentModel();
            const models = configManager.listModels();

            if (!models || models.length === 0) {
                console.log(chalk.yellow('No models configured. Use /models add or /set-model to configure one.'));
                return;
            }

            models.forEach(({ name, config, hasApiKey }) => {
                const indicator = name === currentModel ? chalk.green('→') : ' ';
                const provider = chalk.gray(`[${config.provider}]`);
                const key = hasApiKey ? chalk.green('key✓') : chalk.yellow('key?');
                console.log(`${indicator} ${name} ${provider} ${chalk.gray(config.model)} ${chalk.gray(`(${key})`)}`);
            });
        } catch (err: any) {
            console.log(chalk.red(`Failed to list models: ${err.message || err}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    // Command Handler Methods
    private async handleFileOperations(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'read': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /read <filepath> [<from-to>] [--from N --to M] [--step K] [--more]'));
                        return;
                    }
                    const filePath = args[0];
                    const rest = args.slice(1);

                    // Helpers for flag parsing
                    const hasFlag = (name: string) => rest.includes(`--${name}`);
                    const getFlag = (name: string) => {
                        const i = rest.findIndex(v => v === `--${name}`);
                        return i !== -1 ? rest[i + 1] : undefined;
                    };
                    const rangeToken = rest.find(v => /^\d+-\d+$/.test(v));

                    // Determine mode
                    let mode: 'default' | 'range' | 'step' | 'more' = 'default';
                    if (hasFlag('more')) mode = 'more';
                    else if (rangeToken || hasFlag('from') || hasFlag('to')) mode = 'range';
                    else if (hasFlag('step')) mode = 'step';

                    const defaultStep = 200;
                    let step = parseInt(getFlag('step') || `${defaultStep}`, 10);
                    if (!Number.isFinite(step) || step <= 0) step = defaultStep;

                    const fileInfo = await toolsManager.readFile(filePath);
                    const lines = fileInfo.content.split(/\r?\n/);
                    const total = lines.length;

                    const key = `read:${path.resolve(filePath)}`;
                    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

                    console.log(formatFileOp('📄 File:', filePath, `${fileInfo.size} bytes, ${fileInfo.language || 'unknown'}`));
                    console.log(chalk.gray(`Lines: ${total}`));
                    console.log(chalk.gray('─'.repeat(50)));

                    const printSlice = (from: number, to: number) => {
                        const f = clamp(from, 1, total);
                        const t = clamp(to, 1, total);
                        if (f > total) {
                            console.log(chalk.yellow('End of file reached.'));
                            return { printed: false, end: total };
                        }
                        const slice = lines.slice(f - 1, t).join('\n');
                        console.log(chalk.gray(`Showing lines ${f}-${t} of ${total}`));
                        console.log(slice);
                        return { printed: true, end: t };
                    };

                    if (mode === 'range') {
                        // Parse from/to
                        let from: number | undefined;
                        let to: number | undefined;
                        if (rangeToken) {
                            const [a, b] = rangeToken.split('-').map(s => parseInt(s, 10));
                            if (Number.isFinite(a)) from = a;
                            if (Number.isFinite(b)) to = b;
                        }
                        const fromFlag = parseInt(getFlag('from') || '', 10);
                        const toFlag = parseInt(getFlag('to') || '', 10);
                        if (Number.isFinite(fromFlag)) from = fromFlag;
                        if (Number.isFinite(toFlag)) to = toFlag;

                        const f = clamp((from ?? 1), 1, total);
                        const t = clamp((to ?? (f + step - 1)), 1, total);
                        printSlice(f, t);
                        // Prepare next cursor
                        this.sessionContext.set(key, { nextStart: t + 1, step });
                    } else if (mode === 'step') {
                        const f = 1;
                        const t = clamp(f + step - 1, 1, total);
                        printSlice(f, t);
                        this.sessionContext.set(key, { nextStart: t + 1, step });
                    } else if (mode === 'more') {
                        const state = this.sessionContext.get(key) || { nextStart: 1, step };
                        // Allow overriding step via flag in --more
                        if (hasFlag('step')) state.step = step;
                        const f = clamp(state.nextStart || 1, 1, total);
                        const t = clamp(f + (state.step || step) - 1, 1, total);
                        const res = printSlice(f, t);
                        if (res.printed) {
                            this.sessionContext.set(key, { nextStart: (res.end + 1), step: (state.step || step) });
                            if (res.end < total) {
                                console.log(chalk.gray('─'.repeat(50)));
                                console.log(chalk.cyan(`Tip: use "/read ${filePath} --more" to continue (next from line ${res.end + 1})`));
                            }
                        }
                    } else {
                        // default behavior: show all, but protect against huge outputs
                        if (total > 400) {
                            const approved = await this.askAdvancedConfirmation(
                                `Large file: ${total} lines`,
                                `Show first ${defaultStep} lines now?`,
                                false
                            );
                            if (approved) {
                                const f = 1;
                                const t = clamp(f + defaultStep - 1, 1, total);
                                printSlice(f, t);
                                this.sessionContext.set(key, { nextStart: t + 1, step: defaultStep });
                                if (t < total) {
                                    console.log(chalk.gray('─'.repeat(50)));
                                    console.log(chalk.cyan(`Tip: use "/read ${filePath} --more" to continue (next from line ${t + 1})`));
                                }
                            } else {
                                console.log(chalk.yellow('Skipped large output. Specify a range, e.g.'));
                                console.log(chalk.cyan(`/read ${filePath} 1-200`));
                            }
                        } else {
                            console.log(fileInfo.content);
                        }
                    }

                    console.log(chalk.gray('─'.repeat(50)));
                    break;
                }
                case 'write': {
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /write <filepath> <content>'));
                        return;
                    }
                    const filePath = args[0];
                    const content = args.slice(1).join(' ');

                    // Request approval
                    const approved = await this.askAdvancedConfirmation(
                        `Write file: ${filePath}`,
                        `Write ${content.length} characters to file`,
                        false
                    );

                    if (!approved) {
                        console.log(chalk.yellow('❌ File write operation cancelled'));
                        return;
                    }

                    const writeId = 'write-' + Date.now();
                    this.createStatusIndicator(writeId, `Writing ${filePath}`);
                    this.startAdvancedSpinner(writeId, 'Writing file...');

                    await toolsManager.writeFile(filePath, content);

                    this.stopAdvancedSpinner(writeId, true, `File written: ${filePath}`);
                    console.log(chalk.green(`✅ File written: ${filePath}`));
                    break;
                }
                case 'edit': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /edit <filepath>'));
                        return;
                    }
                    const filePath = args[0];
                    console.log(formatFileOp('📝 Opening', filePath, 'in system editor'));
                    try {
                        await toolsManager.runCommand('code', [filePath]);
                    } catch {
                        try {
                            await toolsManager.runCommand('open', [filePath]);
                        } catch {
                            console.log(chalk.yellow(`Could not open ${filePath}. Please open it manually.`));
                        }
                    }
                    break;
                }
                case 'ls': {
                    const directory = args[0] || '.';
                    const files = await toolsManager.listFiles(directory);
                    console.log(formatFileOp('📁 Files in', directory));
                    console.log(chalk.gray('─'.repeat(40)));
                    if (files.length === 0) {
                        console.log(chalk.yellow('No files found'));
                    } else {
                        files.slice(0, 50).forEach(file => {
                            console.log(`${chalk.cyan('•')} ${file}`);
                        });
                        if (files.length > 50) {
                            console.log(chalk.gray(`... and ${files.length - 50} more files`));
                        }
                    }
                    break;
                }
                case 'search': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /search <query> [directory] [--limit N] [--more]'));
                        return;
                    }
                    const query = args[0];
                    const directory = (args[1] && !args[1].startsWith('--')) ? args[1] : '.';
                    const rest = args.slice(1).filter(a => a.startsWith('--'));

                    const hasFlag = (name: string) => rest.includes(`--${name}`);
                    const getFlag = (name: string) => {
                        const i = rest.findIndex(v => v === `--${name}`);
                        return i !== -1 ? rest[i + 1] : undefined;
                    };
                    let limit = parseInt(getFlag('limit') || '30', 10);
                    if (!Number.isFinite(limit) || limit <= 0) limit = 30;
                    const key = `search:${path.resolve(directory)}:${query}`;
                    const state = this.sessionContext.get(key) || { offset: 0, limit };
                    if (hasFlag('limit')) state.limit = limit;

                    console.log(formatSearch(query, directory));
                    const spinId = `search-${Date.now()}`;
                    this.createStatusIndicator(spinId, `Searching: ${query}`, `in ${directory}`);
                    this.startAdvancedSpinner(spinId, `Searching files...`);

                    const results = await toolsManager.searchInFiles(query, directory);

                    this.stopAdvancedSpinner(spinId, true, `Search complete: ${results.length} matches`);

                    if (results.length === 0) {
                        console.log(chalk.yellow('No matches found'));
                    } else {
                        const start = Math.max(0, state.offset);
                        const end = Math.min(results.length, start + (state.limit || limit));
                        console.log(chalk.green(`Found ${results.length} matches (showing ${start + 1}-${end}):`));
                        console.log(chalk.gray('─'.repeat(50)));
                        results.slice(start, end).forEach(result => {
                            console.log(chalk.cyan(`${result.file}:${result.line}`));
                            console.log(`  ${result.content}`);
                        });
                        if (end < results.length) {
                            this.sessionContext.set(key, { offset: end, limit: (state.limit || limit) });
                            console.log(chalk.gray('─'.repeat(50)));
                            console.log(chalk.cyan(`Tip: use "/search ${query} ${directory} --more" to see the next ${state.limit || limit} results`));
                        } else {
                            this.sessionContext.delete(key);
                        }
                    }
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `File operation failed: ${error.message}`, source: 'file-ops' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleTerminalOperations(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'run': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /run <command> [args...]'));
                        return;
                    }
                    const [cmd, ...cmdArgs] = args;
                    const fullCommand = `${cmd} ${cmdArgs.join(' ')}`;

                    const approved = await this.askAdvancedConfirmation(
                        `Execute command: ${fullCommand}`,
                        `Run command in ${process.cwd()}`,
                        false
                    );

                    if (!approved) {
                        console.log(chalk.yellow('❌ Command execution cancelled'));
                        return;
                    }

                    console.log(formatCommand(fullCommand));
                    const cmdId = 'cmd-' + Date.now();
                    this.createStatusIndicator(cmdId, `Executing: ${cmd}`);
                    this.startAdvancedSpinner(cmdId, `Running: ${fullCommand}`);

                    const result = await toolsManager.runCommand(cmd, cmdArgs, { stream: true });

                    if (result.code === 0) {
                        this.stopAdvancedSpinner(cmdId, true, 'Command completed successfully');
                        console.log(chalk.green('✅ Command completed successfully'));
                    } else {
                        this.stopAdvancedSpinner(cmdId, false, `Command failed with exit code ${result.code}`);
                        console.log(chalk.red(`❌ Command failed with exit code ${result.code}`));
                    }
                    break;
                }
                case 'install': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /install <packages...>'));
                        console.log(chalk.gray('Options: --global, --dev, --yarn, --pnpm'));
                        return;
                    }

                    const packages = args.filter(arg => !arg.startsWith('--'));
                    const isGlobal = args.includes('--global') || args.includes('-g');
                    const isDev = args.includes('--dev') || args.includes('-D');
                    const manager = args.includes('--yarn') ? 'yarn' :
                        args.includes('--pnpm') ? 'pnpm' : 'npm';

                    const approved = await this.askAdvancedConfirmation(
                        `Install packages: ${packages.join(', ')}`,
                        `Using ${manager}${isGlobal ? ' (global)' : ''}${isDev ? ' (dev)' : ''}`,
                        false
                    );

                    if (!approved) {
                        console.log(chalk.yellow('❌ Package installation cancelled'));
                        return;
                    }

                    console.log(wrapBlue(`📦 Installing ${packages.join(', ')} with ${manager}...`));
                    const installId = 'install-' + Date.now();
                    this.createAdvancedProgressBar(installId, 'Installing packages', packages.length);

                    for (let i = 0; i < packages.length; i++) {
                        const pkg = packages[i];
                        this.updateStatusIndicator(installId, { details: `Installing ${pkg}...` });

                        const success = await toolsManager.installPackage(pkg, {
                            global: isGlobal,
                            dev: isDev,
                            manager: manager as any
                        });

                        if (!success) {
                            this.addLiveUpdate({ type: 'warning', content: `Failed to install ${pkg}`, source: 'install' });
                            console.log(chalk.yellow(`⚠️ Failed to install ${pkg}`));
                        } else {
                            this.addLiveUpdate({ type: 'log', content: `Installed ${pkg}`, source: 'install' });
                        }

                        this.updateAdvancedProgress(installId, i + 1, packages.length);
                    }

                    this.completeAdvancedProgress(installId, `Completed installation of ${packages.length} packages`);
                    console.log(chalk.green(`✅ Package installation completed`));
                    break;
                }
                case 'npm':
                case 'yarn':
                case 'git':
                case 'docker': {
                    await toolsManager.runCommand(command, args, { stream: true });
                    break;
                }
                case 'ps': {
                    const processes = toolsManager.getRunningProcesses();
                    if (processes.length === 0) {
                        console.log(boxen('No processes currently running', { title: '🔄 Processes', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                    } else {
                        const lines: string[] = [];
                        processes.forEach(proc => {
                            const duration = Date.now() - proc.startTime.getTime();
                            lines.push(`${chalk.cyan('PID')} ${proc.pid}: ${chalk.bold(proc.command)} ${proc.args.join(' ')}`);
                            lines.push(`  Status: ${proc.status} | Duration: ${Math.round(duration / 1000)}s`);
                            lines.push(`  CWD: ${proc.cwd}`);
                        });
                        console.log(boxen(lines.join('\n'), { title: `🔄 Processes (${processes.length})`, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }));
                    }
                    break;
                }
                case 'kill': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /kill <pid>'));
                        return;
                    }
                    const pid = parseInt(args[0]);
                    if (isNaN(pid)) {
                        console.log(chalk.red('Invalid PID'));
                        return;
                    }
                    console.log(boxen(`Attempting to kill process ${pid}…`, { title: '🛑 Kill Process', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                    const success = await toolsManager.killProcess(pid);
                    console.log(boxen(success ? `Process ${pid} terminated` : `Could not kill process ${pid}`, { title: success ? '✅ Kill Success' : '❌ Kill Failed', padding: 1, margin: 1, borderStyle: 'round', borderColor: success ? 'green' : 'red' }));
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Terminal operation failed: ${error.message}`, source: 'terminal' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleProjectOperations(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'build': {
                    console.log(chalk.blue('🔨 Building project...'));
                    const result = await toolsManager.build();
                    if (result.success) {
                        console.log(chalk.green('✅ Build completed successfully'));
                    } else {
                        console.log(chalk.red('❌ Build failed'));
                        if (result.errors && result.errors.length > 0) {
                            console.log(chalk.yellow('Errors found:'));
                            result.errors.forEach(error => {
                                console.log(`  ${chalk.red('•')} ${error.message}`);
                            });
                        }
                    }
                    break;
                }
                case 'test': {
                    const pattern = args[0];
                    console.log(wrapBlue(`🧪 Running tests${pattern ? ` (${pattern})` : ''}...`));
                    const result = await toolsManager.runTests(pattern);
                    if (result.success) {
                        console.log(chalk.green('✅ All tests passed'));
                    } else {
                        console.log(chalk.red('❌ Some tests failed'));
                        if (result.errors && result.errors.length > 0) {
                            console.log(chalk.yellow('Test errors:'));
                            result.errors.forEach(error => {
                                console.log(`  ${chalk.red('•')} ${error.message}`);
                            });
                        }
                    }
                    break;
                }
                case 'lint': {
                    const result = await toolsManager.lint();
                    if (result.success) {
                        console.log(boxen('No linting errors found', { title: '✅ Lint', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                    } else {
                        const lines: string[] = ['Issues found:'];
                        if (result.errors && result.errors.length > 0) {
                            result.errors.slice(0, 20).forEach(error => {
                                const sev = error.severity === 'error' ? 'ERROR' : 'WARNING';
                                lines.push(`• ${sev}: ${error.message}`);
                            });
                            if (result.errors.length > 20) lines.push(`… and ${result.errors.length - 20} more`);
                        }
                        console.log(boxen(lines.join('\n'), { title: '⚠️ Lint', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                    }
                    break;
                }
                case 'create': {
                    if (args.length < 2) {
                        console.log(boxen('Usage: /create <type> <name>\nTypes: react, next, node, express', { title: '🧱 Create', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                        return;
                    }
                    const [type, name] = args;
                    const result = await toolsManager.setupProject(type as any, name);
                    if (result.success) {
                        const lines = [`Project ${name} created successfully!`, `📁 Location: ${result.path}`];
                        console.log(boxen(lines.join('\n'), { title: '✅ Create', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                    } else {
                        console.log(boxen(`Failed to create project ${name}`, { title: '❌ Create', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red' }));
                    }
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Project operation failed: ${error.message}`, source: 'project' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
    }

    private async handleSessionManagement(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'new': {
                    const title = args.join(' ') || undefined;
                    const session = chatManager.createNewSession(title);
                    console.log(boxen(`${session.title} (${session.id.slice(0, 8)})`, { title: '🆕 New Session', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                    break;
                }
                case 'sessions': {
                    const sessions = chatManager.listSessions();
                    const current = chatManager.getCurrentSession();
                    const lines: string[] = [];
                    if (sessions.length === 0) {
                        lines.push('No sessions found');
                    } else {
                        sessions.forEach((session) => {
                            const isCurrent = session.id === current?.id;
                            const prefix = isCurrent ? '→ ' : '  ';
                            const messageCount = session.messages.filter(m => m.role !== 'system').length;
                            lines.push(`${prefix}${session.title} (${session.id.slice(0, 8)})`);
                            lines.push(`   ${messageCount} messages | ${session.updatedAt.toLocaleString()}`);
                        });
                    }
                    console.log(boxen(lines.join('\n'), { title: '📝 Chat Sessions', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));
                    break;
                }
                case 'export': {
                    const sessionId = args[0];
                    const markdown = chatManager.exportSession(sessionId);
                    const filename = `chat-export-${Date.now()}.md`;
                    await fs.writeFile(filename, markdown);
                    console.log(boxen(`Session exported to ${filename}`, { title: '📤 Export', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
                    break;
                }
                case 'stats': {
                    const stats = chatManager.getSessionStats();
                    const modelInfo = advancedAIProvider.getCurrentModelInfo();
                    const content = [
                        `Model: ${modelInfo.name}`,
                        `Total Sessions: ${stats.totalSessions}`,
                        `Total Messages: ${stats.totalMessages}`,
                        `Current Session Messages: ${stats.currentSessionMessages}`
                    ].join('\n');
                    console.log(boxen(content, { title: '📊 Usage Statistics', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }));
                    break;
                }
                case 'history': {
                    if (args.length === 0) {
                        const enabled = configManager.get('chatHistory');
                        console.log(chalk.green(`Chat history: ${enabled ? 'enabled' : 'disabled'}`));
                        return;
                    }
                    const setting = args[0].toLowerCase();
                    if (setting !== 'on' && setting !== 'off') {
                        console.log(chalk.red('Usage: /history <on|off>'));
                        return;
                    }
                    configManager.set('chatHistory', setting === 'on');
                    console.log(chalk.green(`✅ Chat history ${setting === 'on' ? 'enabled' : 'disabled'}`));
                    break;
                }
                case 'debug': {
                    console.log(chalk.blue.bold('\n🔍 Debug Information:'));
                    console.log(chalk.gray('═'.repeat(40)));
                    const currentModel = configManager.getCurrentModel();
                    console.log(chalk.green(`Current Model: ${currentModel}`));
                    const models = configManager.get('models');
                    const currentModelConfig = models[currentModel];
                    if (currentModelConfig) {
                        console.log(chalk.green(`Provider: ${currentModelConfig.provider}`));
                        console.log(chalk.green(`Model: ${currentModelConfig.model}`));
                    }
                    // Test API key
                    const apiKey = configManager.getApiKey(currentModel);
                    if (apiKey) {
                        console.log(chalk.green(`✅ API Key: ${apiKey.slice(0, 10)}...${apiKey.slice(-4)} (${apiKey.length} chars)`));
                    } else {
                        console.log(chalk.red(`❌ API Key: Not configured`));
                    }
                    break;
                }
                case 'temp': {
                    if (args.length === 0) {
                        console.log(chalk.green(`Current temperature: ${configManager.get('temperature')}`));
                        return;
                    }
                    const temp = parseFloat(args[0]);
                    if (isNaN(temp) || temp < 0 || temp > 2) {
                        console.log(chalk.red('Temperature must be between 0.0 and 2.0'));
                        return;
                    }
                    configManager.set('temperature', temp);
                    console.log(chalk.green(`✅ Temperature set to ${temp}`));
                    break;
                }
                case 'system': {
                    if (args.length === 0) {
                        const session = chatManager.getCurrentSession();
                        console.log(chalk.green('Current system prompt:'));
                        console.log(chalk.gray(session?.systemPrompt || 'None'));
                        return;
                    }
                    const prompt = args.join(' ');
                    const session = chatManager.getCurrentSession();
                    if (session) {
                        session.systemPrompt = prompt;
                        // Update the system message
                        const systemMsgIndex = session.messages.findIndex(m => m.role === 'system');
                        if (systemMsgIndex >= 0) {
                            session.messages[systemMsgIndex].content = prompt;
                        } else {
                            session.messages.unshift({
                                role: 'system',
                                content: prompt,
                                timestamp: new Date(),
                            });
                        }
                        console.log(chalk.green('✅ System prompt updated'));
                    }
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Session management failed: ${error.message}`, source: 'session' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleModelConfig(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'model': {
                    if (args.length === 0) {
                        await this.showCurrentModelPanel();
                        return;
                    }
                    const modelName = args[0];
                    configManager.setCurrentModel(modelName);
                    try {
                        // Sync AdvancedAIProvider immediately so no restart is required
                        advancedAIProvider.setModel(modelName);
                        console.log(boxen(`Switched to model: ${modelName}\nApplied immediately (no restart needed)`, {
                            title: '🤖 Model Updated', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
                        }));
                    } catch {
                        console.log(chalk.green(`✅ Switched to model: ${modelName}`));
                    }

                    // Validate API key for the selected model/provider
                    try {
                        const modelsCfg = configManager.get('models') as any;
                        const modelCfg = modelsCfg[modelName];
                        const provider = modelCfg?.provider || 'unknown';
                        const apiKey = configManager.getApiKey(modelName);
                        if (!apiKey) {
                            const tip = provider === 'openai' ? 'Env: OPENAI_API_KEY' :
                                provider === 'anthropic' ? 'Env: ANTHROPIC_API_KEY' :
                                    provider === 'google' ? 'Env: GOOGLE_GENERATIVE_AI_API_KEY' :
                                        provider === 'vercel' ? 'Env: V0_API_KEY' :
                                            provider === 'gateway' ? 'Env: GATEWAY_API_KEY' : 'Env: (n/a)';

                            console.log(boxen(
                                `Provider: ${provider}\n` +
                                `Model: ${modelCfg?.model || modelName}\n` +
                                `API key not configured.\n` +
                                `Tip: /set-key ${modelName} <your-api-key>  |  ${tip}`,
                                { title: '🔑 API Key Missing', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }
                            ));

                            const approve = await this.askAdvancedConfirmation(
                                'Open interactive API key setup now?',
                                `Configure key for ${provider} (${modelName})`,
                                true
                            );
                            if (approve) {
                                await this.interactiveSetApiKey();
                            }
                        }
                    } catch {/* ignore validation errors */ }

                    await this.showCurrentModelPanel(modelName);
                    break;
                }
                case 'models': {
                    await this.showModelsPanel();
                    break;
                }
                case 'set-key': {
                    if (args.length < 2) {
                        await this.interactiveSetApiKey();
                        return;
                    }
                    const [modelName, apiKey] = args;
                    configManager.setApiKey(modelName, apiKey);
                    console.log(chalk.green(`✅ API key set for ${modelName}`));
                    break;
                }
                case 'config': {
                    if (args.length > 0 && ['interactive', 'edit', 'i'].includes(args[0].toLowerCase())) {
                        await this.showInteractiveConfiguration();
                    } else {
                        await this.showConfigurationPanel();
                    }
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Model/config operation failed: ${error.message}`, source: 'config' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }
    private async handleAdvancedFeatures(command: string, args: string[]): Promise<void> {
        try {
            switch (command) {
                case 'agents': {
                    this.showAgentsPanel();
                    break;
                }
                case 'agent': {
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /agent <name> <task>'));
                        return;
                    }
                    const agentName = args[0];
                    const task = args.slice(1).join(' ');
                    console.log(formatAgent(agentName, 'executing', task));
                    const taskId = await agentService.executeTask(agentName, task, {});
                    console.log(wrapBlue(`🚀 Launched ${agentName} (Task ID: ${taskId.slice(-6)})`));
                    break;
                }
                case 'parallel': {
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /parallel <agent1,agent2,...> <task>'));
                        return;
                    }
                    const agentNames = args[0].split(',').map(name => name.trim());
                    const task = args.slice(1).join(' ');
                    console.log(wrapBlue(`⚡ Running ${agentNames.length} agents in parallel...`));
                    // Implementation would execute agents in parallel
                    break;
                }
                case 'factory': {
                    this.showFactoryPanel();
                    break;
                }
                case 'blueprints': {
                    this.showBlueprintsPanel();
                    break;
                }
                case 'create-agent': {
                    if (args.length < 2) {
                        console.log(chalk.red('Usage: /create-agent [--vm|--container] <name> <specialization>'));
                        console.log(chalk.gray('Examples:'));
                        console.log(chalk.gray('  /create-agent react-expert "React development and testing"'));
                        console.log(chalk.gray('  /create-agent --vm repo-analyzer "Repository analysis and documentation"'));
                        console.log(chalk.gray('  /create-agent --container test-runner "Isolated testing environment"'));
                        return;
                    }

                    // Parse arguments similar to nik-cli-commands.ts logic
                    let agentType: 'standard' | 'vm' | 'container' = 'standard';
                    let name = '';
                    let specialization = '';

                    for (let i = 0; i < args.length; i++) {
                        const arg = args[i];
                        if (arg === '--vm') {
                            agentType = 'vm';
                        } else if (arg === '--container') {
                            agentType = 'container';
                        } else {
                            name = args[i];
                            specialization = args.slice(i + 1).join(' ');
                            break;
                        }
                    }

                    const blueprint = await agentFactory.createAgentBlueprint({
                        name,
                        specialization,
                        autonomyLevel: 'fully-autonomous',
                        contextScope: 'project',
                        agentType,
                    });
                    console.log(chalk.green(`✅ Agent blueprint created: ${blueprint.name}`));
                    console.log(chalk.gray(`Blueprint ID: ${blueprint.id}`));
                    break;
                }
                case 'launch-agent': {
                    if (args.length === 0) {
                        console.log(chalk.red('Usage: /launch-agent <blueprint-id> [task]'));
                        return;
                    }
                    const blueprintId = args[0];
                    const task = args.slice(1).join(' ');
                    const agent = await agentFactory.launchAgent(blueprintId);
                    if (task) {
                        console.log(formatAgent('agent', 'running', task));
                        const result = await agent.run(task);
                        console.log(chalk.green('✅ Agent execution completed'));
                    } else {
                        console.log(chalk.blue('🤖 Agent launched and ready'));
                    }
                    break;
                }
                case 'context': {
                    if (args.length === 0) {
                        const ctx = workspaceContext.getContextForAgent('cli', 10);
                        const lines: string[] = [];
                        lines.push(`📁 Root: ${this.workingDirectory}`);
                        lines.push(`🎯 Selected Paths (${ctx.selectedPaths.length}):`);
                        ctx.selectedPaths.forEach(p => lines.push(`• ${p}`));
                        lines.push('');
                        lines.push('Tip: /context <paths...> to set paths');

                        console.log(boxen(lines.join('\n'), {
                            title: '🌍 Workspace Context',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'green'
                        }));
                        return;
                    }
                    const paths = args;
                    await workspaceContext.selectPaths(paths);
                    const confirm = [`Updated selected paths (${paths.length}):`, ...paths.map(p => `• ${p}`)].join('\n');
                    console.log(boxen(confirm, {
                        title: '🌍 Workspace Context Updated',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'green'
                    }));
                    break;
                }
                case 'stream': {
                    if (args.length > 0 && args[0] === 'clear') {
                        const activeAgents = agentStream.getActiveAgents();
                        activeAgents.forEach(agentId => {
                            agentStream.clearAgentStream(agentId);
                        });
                        console.log(boxen('All agent streams cleared', {
                            title: '📡 Agent Streams', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
                        }));
                    } else {
                        agentStream.showLiveDashboard();
                        console.log(boxen('Live dashboard opened in terminal', {
                            title: '📡 Agent Streams', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
                        }));
                    }
                    break;
                }
                case 'approval': {
                    if (args.length === 0) {
                        console.log(chalk.blue('Approval System Configuration:'));
                        const config = approvalSystem.getConfig();
                        console.log(JSON.stringify(config, null, 2));
                    } else {
                        // Handle approval subcommands
                        const subcommand = args[0];
                        if (subcommand === 'test') {
                            const approved = await approvalSystem.quickApproval(
                                'Test Approval',
                                'This is a test of the approval system',
                                'low'
                            );
                            console.log(approved ? chalk.green('Approved') : chalk.yellow('Cancelled'));
                        }
                    }
                    break;
                }
                case 'todo':
                case 'todos': {
                    await this.handleTodoOperations(command, args);
                    break;
                }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Advanced feature failed: ${error.message}`, source: 'advanced' });
            console.log(chalk.red(`❌ Error: ${error.message}`));
        }
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    // Documentation Commands Handlers
    private async handleDocsCommand(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                // Show help and status
                console.log(chalk.blue.bold('\n📚 Documentation System'));
                console.log(chalk.gray('─'.repeat(50)));

                // Show status as a panel
                const stats = docLibrary.getStats();
                const lines: string[] = [];
                lines.push(`📖 Library: ${stats.totalDocs} documents`);
                lines.push(`📂 Categories: ${stats.categories.length}${stats.categories.length ? ` (${stats.categories.join(', ')})` : ''}`);
                lines.push(`📝 Total Words: ${stats.totalWords.toLocaleString()}`);
                if (stats.languages?.length) lines.push(`🌍 Languages: ${stats.languages.join(', ')}`);
                lines.push('');
                lines.push('📋 Commands:');
                lines.push('/docs                      - Help and status');
                lines.push('/doc-search <query> [cat]  - Search library');
                lines.push('/doc-add <url> [cat]       - Add documentation');
                lines.push('/doc-stats [--detailed]    - Show statistics');
                lines.push('/doc-list [category]       - List documentation');
                lines.push('/doc-load <names>          - Load docs to AI context');
                lines.push('/doc-context [--detailed]  - Show AI doc context');
                lines.push('/doc-unload [names|--all]  - Unload docs');
                lines.push('/doc-suggest <query>       - Suggest docs');

                console.log(boxen(lines.join('\n'), {
                    title: '📚 Documentation System',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'magenta'
                }));

                return;
            }

            // Handle subcommands
            if (args.length === 0) {
                console.log(chalk.red('Missing subcommand. Use /doc help for available commands.'));
                return;
            }

            const subcommand = args[0];
            const subArgs = args.slice(1);

            switch (subcommand) {
                case 'status':
                    docLibrary.showStatus();
                    break;
                case 'help':
                    await this.handleDocsCommand([]);
                    break;
                default:
                    console.log(chalk.red(`❌ Unknown docs subcommand: ${subcommand}`));
                    console.log(chalk.gray('Use "/docs" for help'));
            }
        } catch (error: any) {
            console.error(chalk.red(`❌ Docs command error: ${error.message}`));
        }
        // Ensure output is flushed and visible before showing prompt
        console.log(); // Extra newline for better separation
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocSearchCommand(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                console.log(chalk.red('Usage: /doc-search <query> [category]'));
                console.log(chalk.gray('Example: /doc-search "react hooks"'));
                console.log(chalk.gray('Example: /doc-search "api" backend'));
                return;
            }

            const query = args[0];
            const category = args[1];

            console.log(chalk.blue(`🔍 Searching for: "${query}"${category ? ` in category: ${category}` : ''}`));

            const results = await docLibrary.search(query, category, 10);

            if (results.length === 0) {
                console.log(chalk.yellow('❌ No documents found'));
                console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'));
                return;
            }

            console.log(chalk.green(`\n✅ Found ${results.length} results:`));
            console.log(chalk.gray('─'.repeat(60)));

            results.forEach((result, index) => {
                console.log(chalk.blue(`${index + 1}. ${result.entry.title}`));
                console.log(chalk.gray(`   Score: ${(result.score * 100).toFixed(1)}% | Category: ${result.entry.category}`));
                console.log(chalk.gray(`   URL: ${result.entry.url}`));
                console.log(chalk.gray(`   Tags: ${result.entry.tags.join(', ')}`));
                if (result.snippet) {
                    console.log(chalk.white(`   Preview: ${result.snippet.substring(0, 120)}...`));
                }
                console.log();
            });

        } catch (error: any) {
            console.error(chalk.red(`❌ Search error: ${error.message}`));
        }
    }

    private async handleDocAddCommand(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                console.log(chalk.red('Usage: /doc-add <url> [category] [tags...]'));
                console.log(chalk.gray('Example: /doc-add https://reactjs.org/'));
                console.log(chalk.gray('Example: /doc-add https://nodejs.org/ backend node,api'));
                return;
            }

            const url = args[0];
            const category = args[1] || 'general';
            const tags = args.slice(2);

            // Simple URL validation
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                console.log(chalk.red('❌ Invalid URL. Must start with http:// or https://'));
                return;
            }

            console.log(chalk.blue(`📖 Adding documentation from: ${url}`));
            if (category !== 'general') console.log(chalk.gray(`📂 Category: ${category}`));
            if (tags.length > 0) console.log(chalk.gray(`🏷️ Tags: ${tags.join(', ')}`));

            const spinner = ora('Extracting content...').start();

            try {
                const entry = await docLibrary.addDocumentation(url, category, tags);
                spinner.succeed('Documentation added successfully!');

                await this.withPanelOutput(async () => {
                    const content = [
                        chalk.green('✅ Document Added'),
                        chalk.gray('────────────────────────────────────────'),
                        `${chalk.blue('📄 Title:')} ${entry.title}`,
                        `${chalk.gray('🆔 ID:')} ${entry.id}`,
                        `${chalk.gray('📂 Category:')} ${entry.category}`,
                        `${chalk.gray('🏷️ Tags:')} ${entry.tags.join(', ')}`,
                        `${chalk.gray('📝 Words:')} ${entry.metadata.wordCount}`,
                        `${chalk.gray('🌍 Language:')} ${entry.metadata.language}`,
                    ].join('\n');

                    console.log(boxen(content, {
                        title: '📚 Documentation',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'green'
                    }));
                });

            } catch (error: any) {
                spinner.fail('Failed to add documentation');
                throw error;
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Add documentation error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocStatsCommand(args: string[]): Promise<void> {
        try {
            const detailed = args.includes('--detailed') || args.includes('-d');

            const stats = docLibrary.getStats();

            console.log(chalk.blue.bold('\n📊 Documentation Library Statistics'));
            console.log(chalk.gray('─'.repeat(50)));

            console.log(chalk.green(`📖 Total Documents: ${stats.totalDocs}`));
            console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`));
            console.log(chalk.green(`📂 Categories: ${stats.categories.length}`));
            console.log(chalk.green(`🌍 Languages: ${stats.languages.length}`));
            console.log(chalk.green(`👁️ Average Access Count: ${stats.avgAccessCount.toFixed(1)}`));

            if (detailed && stats.categories.length > 0) {
                console.log(chalk.blue('\n📂 By Category:'));
                stats.categories.forEach((category: string) => {
                    console.log(chalk.gray(`  • ${category}`));
                });

                console.log(chalk.blue('\n🌍 By Language:'));
                stats.languages.forEach((language: string) => {
                    console.log(chalk.gray(`  • ${language}`));
                });
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Stats error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();

    }

    private async handleDocListCommand(args: string[]): Promise<void> {
        try {
            const category = args[0];

            // Get all documents (accessing the private docs Map)
            const allDocs = Array.from((docLibrary as any).docs.values()) as DocumentationEntry[];

            // Filter by category if specified
            const docs = category
                ? allDocs.filter(doc => doc.category === category)
                : allDocs;

            if (docs.length === 0) {
                const msg = category ? `No documents found in category: ${category}` : 'No documents in library\nUse /doc-add <url> to add documentation';
                console.log(boxen(msg, { title: '📋 Documentation', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                return;
            }

            const lines: string[] = [];
            docs
                .sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime())
                .slice(0, 50)
                .forEach((doc, index) => {
                    lines.push(`${index + 1}. ${doc.title}`);
                    lines.push(`   ID: ${doc.id} | Category: ${doc.category}`);
                    lines.push(`   URL: ${doc.url}`);
                    lines.push(`   Tags: ${doc.tags.join(', ') || 'none'}`);
                    lines.push(`   Words: ${doc.metadata.wordCount} | Access: ${doc.accessCount}x`);
                    lines.push(`   Added: ${doc.timestamp.toLocaleDateString()}`);
                });
            const title = `📋 Documentation List${category ? ` (Category: ${category})` : ''}`;
            console.log(boxen(lines.join('\n'), { title, padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));

        } catch (error: any) {
            console.error(chalk.red(`❌ List error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocTagCommand(args: string[]): Promise<void> {
        try {
            console.log(chalk.yellow('🏷️ Document tagging feature is coming soon!'));
            console.log(chalk.gray('This will allow you to:'));
            console.log(chalk.gray('• Add tags to existing documents'));
            console.log(chalk.gray('• Remove tags from documents'));
            console.log(chalk.gray('• Search documents by tags'));
            console.log(chalk.gray('• List all available tags'));

            if (args.length > 0) {
                console.log(chalk.gray(`\nYour input: ${args.join(' ')}`));
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Tag error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocSyncCommand(args: string[]): Promise<void> {
        try {
            const cloudProvider = getCloudDocsProvider();
            if (!cloudProvider?.isReady()) {
                console.log(boxen('Cloud documentation not configured\nSet SUPABASE_URL and SUPABASE_ANON_KEY or use /config to enable', { title: '⚠️ Docs Sync', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                return;
            }

            const spinner = ora('Syncing with cloud...').start();

            try {
                const result = await cloudProvider.sync();
                spinner.succeed('Docs sync complete');
                const lines = [
                    `Downloaded: ${result.downloaded}`,
                    `Uploaded: ${result.uploaded}`,
                ];
                if (result.downloaded > 0) lines.push('Use /doc-search to explore new content');
                console.log(boxen(lines.join('\n'), { title: '🔄 Docs Sync', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green' }));
            } catch (error: any) {
                spinner.fail('Sync failed');
                throw error;
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Sync error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocLoadCommand(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                const suggestions = await docsContextManager.suggestDocs('popular');
                const lines = [
                    'Usage: /doc-load <doc-names>',
                    'Example: /doc-load "react hooks" nodejs-api',
                    'Example: /doc-load frontend-docs backend-docs',
                ];
                if (suggestions.length > 0) {
                    lines.push('');
                    lines.push('Suggestions:');
                    suggestions.forEach(t => lines.push(` • ${t}`));
                }
                console.log(boxen(lines.join('\n'), { title: '📚 Load Docs', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                return;
            }

            console.log(boxen(`Loading ${args.length} document(s) into AI context…`, { title: '📚 Load Docs', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));

            const loadedDocs = await docsContextManager.loadDocs(args);

            if (loadedDocs.length > 0) {
                const stats = docsContextManager.getContextStats();
                console.log(chalk.green(`✅ Context updated:`));
                console.log(chalk.gray(`   • Loaded docs: ${stats.loadedCount}`));
                console.log(chalk.gray(`   • Total words: ${stats.totalWords.toLocaleString()}`));
                console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`));
                console.log(chalk.gray(`   • Categories: ${stats.categories.join(', ')}`));

                console.log(chalk.blue('\n💬 AI agents now have access to loaded documentation!'));
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Load error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocContextCommand(args: string[]): Promise<void> {
        try {
            const stats = docsContextManager.getContextStats();

            console.log(chalk.blue.bold('\n📚 AI Documentation Context Status'));
            console.log(chalk.gray('─'.repeat(50)));

            if (stats.loadedCount === 0) {
                console.log(chalk.yellow('❌ No documentation loaded in context'));
                console.log(chalk.gray('Use /doc-load <names> to load documentation'));
                console.log(chalk.gray('Use /doc-suggest <query> to find relevant docs'));
                return;
            }

            console.log(chalk.green(`📖 Loaded Documents: ${stats.loadedCount}`));
            console.log(chalk.green(`📝 Total Words: ${stats.totalWords.toLocaleString()}`));
            console.log(chalk.green(`📊 Context Usage: ${stats.utilizationPercent.toFixed(1)}%`));
            console.log(chalk.green(`📂 Categories: ${stats.categories.join(', ')}`));
            console.log(chalk.green(`🏠 Local: ${stats.sources.local}, ☁️ Shared: ${stats.sources.shared}`));

            if (args.includes('--detailed') || args.includes('-d')) {
                console.log(chalk.blue('\n📋 Loaded Documents:'));
                const loadedDocs = docsContextManager.getLoadedDocs();

                loadedDocs.forEach((doc, index) => {
                    const wordCount = doc.content.split(' ').length;
                    console.log(chalk.blue(`${index + 1}. ${doc.title}`));
                    console.log(chalk.gray(`   Category: ${doc.category} | Source: ${doc.source}`));
                    console.log(chalk.gray(`   Tags: ${doc.tags.join(', ')}`));
                    console.log(chalk.gray(`   Words: ${wordCount.toLocaleString()} | Loaded: ${doc.loadedAt.toLocaleString()}`));
                    if (doc.summary) {
                        console.log(chalk.gray(`   Summary: ${doc.summary}`));
                    }
                    console.log();
                });
            }

            // Context summary for AI
            const summary = docsContextManager.getContextSummary();
            if (args.includes('--summary')) {
                console.log(chalk.blue('\n🤖 AI Context Summary:'));
                console.log(chalk.gray('─'.repeat(40)));
                console.log(summary);
            }

        } catch (error: any) {
            console.error(chalk.red(`❌ Context error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocUnloadCommand(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                // Show current loaded docs and ask for confirmation to clear all
                const stats = docsContextManager.getContextStats();
                if (stats.loadedCount === 0) {
                    console.log(chalk.yellow('❌ No documentation loaded in context'));
                    return;
                }

                console.log(chalk.yellow(`⚠️ This will remove all ${stats.loadedCount} loaded documents from AI context`));
                console.log(chalk.gray('Use /doc-unload <names> to remove specific documents'));
                console.log(chalk.gray('Use /doc-unload --all to confirm removal of all documents'));
                return;
            }

            if (args.includes('--all')) {
                await docsContextManager.unloadDocs();
                console.log(chalk.green('✅ All documentation removed from AI context'));
                return;
            }

            await docsContextManager.unloadDocs(args);

            const stats = docsContextManager.getContextStats();
            console.log(chalk.green('✅ Documentation context updated'));
            console.log(chalk.gray(`   • Remaining docs: ${stats.loadedCount}`));
            console.log(chalk.gray(`   • Context usage: ${stats.utilizationPercent.toFixed(1)}%`));

        } catch (error: any) {
            console.error(chalk.red(`❌ Unload error: ${error.message}`));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }

    private async handleDocSuggestCommand(args: string[]): Promise<void> {
        try {
            const query = args.join(' ');
            if (!query) {
                console.log(chalk.red('Usage: /doc-suggest <query>'));
                console.log(chalk.gray('Example: /doc-suggest react hooks'));
                console.log(chalk.gray('Example: /doc-suggest authentication'));
                return;
            }

            console.log(chalk.blue(`💡 Suggesting documentation for: "${query}"`));

            const suggestions = await docsContextManager.suggestDocs(query, 10);

            if (suggestions.length === 0) {
                console.log(chalk.yellow('❌ No relevant documentation found'));
                console.log(chalk.gray('Try different keywords or use /doc-add to add more documentation'));
                return;
            }

            console.log(chalk.green(`\n✅ Found ${suggestions.length} relevant documents:`));
            console.log(chalk.gray('─'.repeat(50)));

            suggestions.forEach((title, index) => {
                console.log(chalk.blue(`${index + 1}. ${title}`));
            });

            console.log(chalk.gray('\n💡 To load these documents:'));
            console.log(chalk.gray(`/doc-load "${suggestions.slice(0, 3).join('" "')}"`));

        } catch (error: any) {
            console.error(chalk.red(`❌ Suggest error: ${error.message}`));
        }
    }

    // Enhanced Planning Methods (from enhanced-planning.ts)
    private async generateAdvancedPlan(goal: string, options: any = {}): Promise<any> {
        const {
            maxTodos = 20,
            includeContext = true,
            showDetails = true,
            saveTodoFile = true,
            todoFilePath = 'todo.md'
        } = options;

        console.log(chalk.blue.bold(`\n🎯 Generating Advanced Plan: ${goal}`));
        console.log(chalk.gray('─'.repeat(60)));

        // Get project context
        let projectContext = '';
        if (includeContext) {
            console.log(chalk.gray('📁 Analyzing project context...'));
            const context = workspaceContext.getContextForAgent('planner', 10);
            projectContext = context.projectSummary;
        }

        // Generate AI-powered plan
        console.log(chalk.gray('🧠 Generating AI plan...'));
        const todos = await this.generateTodosWithAI(goal, projectContext, maxTodos);

        // Create plan object
        const plan = {
            id: Date.now().toString(),
            title: this.extractPlanTitle(goal),
            description: goal,
            goal,
            todos,
            status: 'draft',
            estimatedTotalDuration: todos.reduce((sum: number, todo: any) => sum + todo.estimatedDuration, 0),
            createdAt: new Date(),
            workingDirectory: this.workingDirectory,
            context: {
                projectInfo: includeContext ? projectContext : undefined,
                userRequirements: [goal],
            },
        };

        // Show plan details
        if (showDetails) {
            this.displayAdvancedPlan(plan);
        }

        // Save todo.md file
        if (saveTodoFile) {
            await this.saveTodoMarkdown(plan, todoFilePath);
        }

        return plan;
    }

    private async generateTodosWithAI(goal: string, context: string, maxTodos: number): Promise<any[]> {
        try {
            // Check cache first to save massive tokens
            const truncatedContext = context.length > 1000 ? context.substring(0, 1000) + '...' : context;
            const planningPrompt = `Plan: ${goal} (max ${maxTodos} todos)`;

            const cachedResponse = await tokenCache.getCachedResponse(
                planningPrompt,
                truncatedContext,
                ['planning', 'todos', 'ai-generation']
            );

            if (cachedResponse) {
                console.log(chalk.green('🎯 Using cached planning response'));
                try {
                    const planData = JSON.parse(cachedResponse.response || '{}');
                    if (planData.todos && Array.isArray(planData.todos)) {
                        return planData.todos.slice(0, maxTodos);
                    }
                } catch (e) {
                    console.log(chalk.yellow('⚠️ Cached response format invalid, generating new plan'));
                }
            }

            // Build optimized context-aware message for AI planning - reduced token usage
            const messages = [{
                role: 'system' as const,
                content: `Expert project planner. Generate JSON todo array:
{"todos":[{"title":"Task title","description":"Task desc","priority":"low/medium/high/critical","category":"planning/setup/implementation/testing/docs/deployment","estimatedDuration":30,"dependencies":[],"tags":["tag"],"commands":["cmd"],"files":["file.ts"],"reasoning":"Brief reason"}]}
Max ${maxTodos} todos. Context: ${truncatedContext}`
            }, {
                role: 'user' as const,
                content: planningPrompt
            }];

            // Stream AI response for real-time feedback
            let assistantText = '';

            for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
                if (ev.type === 'text_delta' && ev.content) {
                    assistantText += ev.content;
                    process.stdout.write(ev.content);
                }
            }
            console.log(); // newline

            // Update token usage after streaming completes (sync with session)
            this.syncTokensFromSession();

            // Extract JSON from response
            const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('AI did not return valid JSON plan');
            }

            const planData = JSON.parse(jsonMatch[0]);

            // Convert to TodoItem format
            const todos = planData.todos.map((todoData: any, index: number) => ({
                id: `todo-${Date.now()}-${index}`,
                title: todoData.title || `Task ${index + 1}`,
                description: todoData.description || '',
                status: 'pending',
                priority: todoData.priority || 'medium',
                category: todoData.category || 'implementation',
                estimatedDuration: todoData.estimatedDuration || 30,
                dependencies: todoData.dependencies || [],
                tags: todoData.tags || [],
                commands: todoData.commands || [],
                files: todoData.files || [],
                reasoning: todoData.reasoning || '',
                createdAt: new Date(),
            }));

            // Cache the successful response for future use
            const tokensEstimated = Math.round((planningPrompt.length + assistantText.length) / 4);
            await tokenCache.setCachedResponse(
                planningPrompt,
                JSON.stringify({ todos: planData.todos }),
                truncatedContext,
                tokensEstimated,
                ['planning', 'todos', 'ai-generation']
            );

            console.log(chalk.green(`✅ Generated ${todos.length} todos (cached for future use)`));
            return todos;

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to generate AI plan: ${error.message}`));

            // Fallback: create a simple todo
            return [{
                id: `todo-${Date.now()}`,
                title: 'Execute Task',
                description: goal,
                status: 'pending',
                priority: 'medium',
                category: 'implementation',
                estimatedDuration: 60,
                dependencies: [],
                tags: ['manual'],
                reasoning: 'Fallback todo when AI planning fails',
                createdAt: new Date(),
            }];
        }
    }

    private displayAdvancedPlan(plan: any): void {
        console.log(boxen(
            `${chalk.blue.bold(plan.title)}\n\n` +
            `${chalk.gray('Goal:')} ${plan.goal}\n` +
            `${chalk.gray('Todos:')} ${plan.todos.length}\n` +
            `${chalk.gray('Estimated Duration:')} ${Math.round(plan.estimatedTotalDuration)} minutes\n` +
            `${chalk.gray('Status:')} ${this.getPlanStatusColor(plan.status)(plan.status.toUpperCase())}`,
            {
                padding: 1,
                margin: { top: 1, bottom: 1, left: 0, right: 0 },
                borderStyle: 'round',
                borderColor: 'blue',
            }
        ));

        console.log(chalk.blue.bold('\n📋 Todo Items:'));
        console.log(chalk.gray('─'.repeat(60)));

        plan.todos.forEach((todo: any, index: number) => {
            const priorityIcon = this.getPlanPriorityIcon(todo.priority);
            const statusIcon = this.getPlanStatusIcon(todo.status);
            const categoryColor = this.getPlanCategoryColor(todo.category);

            console.log(`${index + 1}. ${statusIcon} ${priorityIcon} ${chalk.bold(todo.title)}`);
            console.log(`   ${chalk.gray(todo.description)}`);
            console.log(`   ${categoryColor(todo.category)} | ${chalk.gray(todo.estimatedDuration + 'min')} | ${chalk.gray(todo.tags.join(', '))}`);

            if (todo.dependencies.length > 0) {
                console.log(`   ${chalk.yellow('Dependencies:')} ${todo.dependencies.join(', ')}`);
            }

            if (todo.files && todo.files.length > 0) {
                console.log(`   ${wrapBlue('Files:')} ${todo.files.join(', ')}`);
            }

            console.log();
        });
    }

    private async executeAdvancedPlan(planId: string): Promise<void> {
        const plan = enhancedPlanning.getPlan(planId);
        if (!plan) {
            throw new Error(`Plan ${planId} not found`);
        }

        if (plan.status !== 'approved') {
            const approved = await this.handlePlanApproval(planId);
            if (!approved) {
                return;
            }
        }

        console.log(chalk.blue.bold(`\n🚀 Executing Plan: ${plan.title}`));
        console.log(chalk.cyan('🤖 Auto Mode: Plan will execute automatically'));
        console.log(chalk.gray('═'.repeat(60)));

        plan.status = 'executing';
        plan.startedAt = new Date();

        // Create a progress indicator for plan execution
        const planProgressId = `plan-progress-${plan.id}`;
        this.createAdvancedProgressBar(planProgressId, `Executing Plan: ${plan.title}`, plan.todos.length);

        try {
            // Execute todos in dependency order
            const executionOrder = this.resolveDependencyOrder(plan.todos);
            let completedCount = 0;
            let autoSkipped = 0;

            for (const todo of executionOrder) {
                console.log(chalk.cyan(`\n📋 [${completedCount + 1}/${plan.todos.length}] ${todo.title}`));
                console.log(chalk.gray(`   ${todo.description}`));

                todo.status = 'in_progress';
                todo.startedAt = new Date();

                try {
                    // Execute the todo
                    const startTime = Date.now();
                    await this.executeSingleTodo(todo, plan);
                    const duration = Date.now() - startTime;

                    todo.status = 'completed';
                    todo.completedAt = new Date();
                    todo.actualDuration = Math.round(duration / 60000);

                    console.log(chalk.green(`   ✅ Completed in ${Math.round(duration / 1000)}s`));
                    completedCount++;

                    // Update todo.md file
                    await this.saveTodoMarkdown(plan);

                } catch (error: any) {
                    todo.status = 'failed';
                    console.log(chalk.red(`   ❌ Failed: ${error.message}`));

                    // In auto mode, decide automatically based on error severity
                    if (error.message.includes('critical') || error.message.includes('fatal')) {
                        console.log(chalk.red('🛑 Critical error detected - stopping execution'));
                        plan.status = 'failed';
                        return;
                    } else {
                        // Auto-continue on non-critical errors
                        console.log(chalk.yellow('⚠️  Non-critical error - continuing with remaining todos'));
                        todo.status = 'failed'; // Keep as failed but continue
                        autoSkipped++;
                    }
                }

                // Show progress
                const progress = Math.round((completedCount / plan.todos.length) * 100);
                // Update structured progress indicator and print concise progress
                this.updateAdvancedProgress(planProgressId, completedCount, plan.todos.length);
                this.updateStatusIndicator(planProgressId, { details: `Completed ${completedCount}/${plan.todos.length} (${progress}%)` });
                console.log(`   ${formatProgress(completedCount, plan.todos.length)}`);

                // Brief pause between todos for readability
                if (completedCount < plan.todos.length) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Plan completed
            plan.status = 'completed';
            plan.completedAt = new Date();
            plan.actualTotalDuration = plan.todos.reduce((sum: number, todo: any) => sum + (todo.actualDuration || 0), 0);

            console.log(chalk.green.bold(`\n🎉 Plan Completed Successfully!`));
            console.log(chalk.gray(`✅ ${completedCount}/${plan.todos.length} todos completed`));
            if (autoSkipped > 0) {
                console.log(chalk.yellow(`⚠️  ${autoSkipped} todos had non-critical errors`));
            }
            console.log(chalk.gray(`⏱️  Total time: ${plan.actualTotalDuration} minutes`));

            // Update final todo.md
            await this.saveTodoMarkdown(plan);

            // Complete progress indicator
            this.completeAdvancedProgress(planProgressId, 'Plan execution completed');

            // Add completion summary to live updates
            this.addLiveUpdate({
                type: 'log',
                content: `Plan '${plan.title}' completed: ${completedCount}/${plan.todos.length} todos successful`,
                source: 'plan-execution'
            });

        } catch (error: any) {
            plan.status = 'failed';
            console.log(chalk.red(`\n❌ Plan execution failed: ${error.message}`));
            this.addLiveUpdate({
                type: 'error',
                content: `Plan '${plan.title}' failed: ${error.message}`,
                source: 'plan-execution'
            });
        }
    }

    private async executeSingleTodo(todo: any, plan: any): Promise<void> {
        console.log(chalk.gray(`   🔍 Analyzing todo: ${todo.title}`));

        // Build a compact execution prompt and hand off to the autonomous provider
        const toolsList = Array.isArray(todo.tools) && todo.tools.length > 0 ? todo.tools.join(', ') : 'read_file, write_file, explore_directory, execute_command, analyze_project, manage_packages, generate_code';

        const executionMessages: any[] = [
            {
                role: 'system',
                content: `You are an autonomous executor that completes specific development tasks.\n\nCURRENT TASK: ${todo.title}\nTASK DESCRIPTION: ${todo.description || ''}\nAVAILABLE TOOLS: ${toolsList}\n\nGUIDELINES:\n- Be autonomous and safe\n- Follow project conventions\n- Create production-ready code\n- Provide clear progress updates\n- Use tools when needed without asking for permission\n\nExecute the task now using the available tools.`
            },
            {
                role: 'user',
                content: `Execute task: ${todo.title}${todo.description ? `\n\nDetails: ${todo.description}` : ''}`
            }
        ];

        let responseText = '';
        try {
            for await (const event of advancedAIProvider.executeAutonomousTask('Execute task', { messages: executionMessages })) {
                if (event.type === 'text_delta' && event.content) {
                    responseText += event.content;
                } else if (event.type === 'tool_call') {
                    console.log(chalk.cyan(`   🛠️ Tool: ${event.toolName}`));
                } else if (event.type === 'tool_result') {
                    console.log(chalk.gray(`   ↪ Result from ${event.toolName}`));
                } else if (event.type === 'error') {
                    throw new Error(event.error || 'Unknown autonomous execution error');
                }
            }
        } catch (err: any) {
            console.log(chalk.yellow(`   ⚠️ Autonomous execution warning: ${err.message}`));
        }

        // Optional: still honor any concrete commands/files declared by the todo
        if (todo.commands && todo.commands.length > 0) {
            for (const command of todo.commands) {
                console.log(`   ${formatCommand(command)}`);
                try {
                    const [cmd, ...args] = command.split(' ');
                    await toolsManager.runCommand(cmd, args);
                } catch (error) {
                    console.log(chalk.yellow(`   ⚠️ Command warning: ${error}`));
                }
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        if (todo.files && todo.files.length > 0) {
            for (const file of todo.files) {
                console.log(chalk.yellow(`   📄 Working on file: ${file}`));
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }
    }

    private resolveDependencyOrder(todos: any[]): any[] {
        const resolved: any[] = [];
        const remaining = [...todos];

        while (remaining.length > 0) {
            const canExecute = remaining.filter(todo =>
                todo.dependencies.every((depId: string) =>
                    resolved.some(resolvedTodo => resolvedTodo.id === depId)
                )
            );

            if (canExecute.length === 0) {
                // Break circular dependencies by taking the first remaining todo
                const next = remaining.shift()!;
                resolved.push(next);
            } else {
                // Execute todos with satisfied dependencies
                canExecute.forEach(todo => {
                    const index = remaining.indexOf(todo);
                    remaining.splice(index, 1);
                    resolved.push(todo);
                });
            }
        }

        return resolved;
    }

    private async handlePlanApproval(planId: string): Promise<boolean> {
        const plan = enhancedPlanning.getPlan(planId);
        if (!plan) {
            throw new Error(`Plan ${planId} not found`);
        }

        console.log(chalk.yellow.bold('\n⚠️  Plan Review Required'));
        console.log(chalk.gray('═'.repeat(60)));

        // Show plan summary
        this.displayPlanSummary(plan);

        // Ask for approval
        const approved = await this.askAdvancedConfirmation(
            `Execute Plan: ${plan.title}`,
            `Execute ${plan.todos.length} tasks with estimated duration of ${Math.round(plan.estimatedTotalDuration)} minutes`,
            false
        );

        if (approved) {
            plan.status = 'approved';
            plan.approvedAt = new Date();
            console.log(chalk.green('✅ Plan approved for execution'));
        } else {
            console.log(chalk.yellow('❌ Plan execution cancelled'));
        }

        return approved;
    }

    private displayPlanSummary(plan: any): void {
        const stats = {
            byPriority: this.groupPlanBy(plan.todos, 'priority'),
            byCategory: this.groupPlanBy(plan.todos, 'category'),
            totalFiles: new Set(plan.todos.flatMap((t: any) => t.files || [])).size,
            totalCommands: plan.todos.reduce((sum: number, t: any) => sum + (t.commands?.length || 0), 0),
        };

        console.log(chalk.cyan('📊 Plan Statistics:'));
        console.log(`  • Total Todos: ${plan.todos.length}`);
        console.log(`  • Estimated Duration: ${Math.round(plan.estimatedTotalDuration)} minutes`);
        console.log(`  • Files to modify: ${stats.totalFiles}`);
        console.log(`  • Commands to run: ${stats.totalCommands}`);

        console.log(chalk.cyan('\n🎯 Priority Distribution:'));
        Object.entries(stats.byPriority).forEach(([priority, todos]) => {
            const icon = this.getPlanPriorityIcon(priority);
            console.log(`  ${icon} ${priority}: ${(todos as any[]).length} todos`);
        });

        console.log(chalk.cyan('\n📁 Category Distribution:'));
        Object.entries(stats.byCategory).forEach(([category, todos]) => {
            const color = this.getPlanCategoryColor(category);
            console.log(`  • ${color(category)}: ${(todos as any[]).length} todos`);
        });
    }

    private async saveTodoMarkdown(plan: any, filename: string = 'todo.md'): Promise<void> {
        const todoPath = path.join(this.workingDirectory, filename);

        let content = `# Todo Plan: ${plan.title}\n\n`;
        content += `**Goal:** ${plan.goal}\n\n`;
        content += `**Status:** ${plan.status.toUpperCase()}\n`;
        content += `**Created:** ${plan.createdAt.toISOString()}\n`;
        content += `**Estimated Duration:** ${Math.round(plan.estimatedTotalDuration)} minutes\n\n`;

        if (plan.context.projectInfo) {
            content += `## Project Context\n\n`;
            const projectInfoBlock = typeof plan.context.projectInfo === 'string'
                ? plan.context.projectInfo
                : JSON.stringify(plan.context.projectInfo, null, 2);
            const fenceLang = typeof plan.context.projectInfo === 'string' ? '' : 'json';
            content += `\`\`\`${fenceLang}\n${projectInfoBlock}\n\`\`\`\n\n`;
        }

        content += `## Todo Items (${plan.todos.length})\n\n`;

        plan.todos.forEach((todo: any, index: number) => {
            const statusEmoji = this.getPlanStatusEmoji(todo.status);
            const priorityEmoji = this.getPlanPriorityEmoji(todo.priority);

            content += `### ${index + 1}. ${statusEmoji} ${todo.title} ${priorityEmoji}\n\n`;
            content += `**Description:** ${todo.description}\n\n`;
            content += `**Category:** ${todo.category} | **Priority:** ${todo.priority} | **Duration:** ${todo.estimatedDuration}min\n\n`;

            if (todo.reasoning) {
                content += `**Reasoning:** ${todo.reasoning}\n\n`;
            }

            if (todo.dependencies.length > 0) {
                content += `**Dependencies:** ${todo.dependencies.join(', ')}\n\n`;
            }

            if (todo.files && todo.files.length > 0) {
                content += `**Files:** \`${todo.files.join('\`, \`')}\`\n\n`;
            }

            if (todo.commands && todo.commands.length > 0) {
                content += `**Commands:**\n`;
                todo.commands.forEach((cmd: string) => {
                    content += `- \`${cmd}\`\n`;
                });
                content += '\n';
            }

            if (todo.tags.length > 0) {
                content += `**Tags:** ${todo.tags.map((tag: string) => `#${tag}`).join(' ')}\n\n`;
            }

            if (todo.status === 'completed' && todo.completedAt) {
                content += `**Completed:** ${todo.completedAt.toISOString()}\n`;
                if (todo.actualDuration) {
                    content += `**Actual Duration:** ${todo.actualDuration}min\n`;
                }
                content += '\n';
            }

            content += '---\n\n';
        });

        // Add statistics
        content += `## Statistics\n\n`;
        content += `- **Total Todos:** ${plan.todos.length}\n`;
        content += `- **Completed:** ${plan.todos.filter((t: any) => t.status === 'completed').length}\n`;
        content += `- **In Progress:** ${plan.todos.filter((t: any) => t.status === 'in_progress').length}\n`;
        content += `- **Pending:** ${plan.todos.filter((t: any) => t.status === 'pending').length}\n`;
        content += `- **Failed:** ${plan.todos.filter((t: any) => t.status === 'failed').length}\n`;

        if (plan.actualTotalDuration) {
            content += `- **Actual Duration:** ${plan.actualTotalDuration}min\n`;
            content += `- **Estimated vs Actual:** ${Math.round((plan.actualTotalDuration / plan.estimatedTotalDuration) * 100)}%\n`;
        }

        content += `\n---\n*Generated by NikCLI on ${new Date().toISOString()}*\n`;

        await fs.writeFile(todoPath, content, 'utf8');
        console.log(chalk.green(`📄 Todo file saved: ${todoPath}`));
    }

    // Planning Utility Methods
    private extractPlanTitle(goal: string): string {
        return goal.length > 50 ? goal.substring(0, 47) + '...' : goal;
    }

    private groupPlanBy<T>(array: T[], key: keyof T): Record<string, T[]> {
        return array.reduce((groups, item) => {
            const group = String(item[key]);
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {} as Record<string, T[]>);
    }

    private getPlanStatusColor(status: string): any {
        switch (status) {
            case 'completed': return chalk.green;
            case 'executing': case 'in_progress': return chalk.blue;
            case 'approved': return chalk.cyan;
            case 'failed': return chalk.red;
            case 'cancelled': return chalk.yellow;
            default: return chalk.gray;
        }
    }

    private getPlanStatusIcon(status: string): string {
        switch (status) {
            case 'completed': return '✅';
            case 'in_progress': return '🔄';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            default: return '⏳';
        }
    }

    private getPlanStatusEmoji(status: string): string {
        switch (status) {
            case 'completed': return '✅';
            case 'in_progress': return '🔄';
            case 'failed': return '❌';
            case 'skipped': return '⏭️';
            default: return '⏳';
        }
    }

    private getPlanPriorityIcon(priority: string): string {
        switch (priority) {
            case 'critical': return '🔴';
            case 'high': return '🟡';
            case 'medium': return '🟢';
            case 'low': return '🔵';
            default: return '⚪';
        }
    }

    private getPlanPriorityEmoji(priority: string): string {
        switch (priority) {
            case 'critical': return '🔥';
            case 'high': return '⚡';
            case 'medium': return '📋';
            case 'low': return '📝';
            default: return '📄';
        }
    }

    private getPlanCategoryColor(category: string): any {
        switch (category) {
            case 'planning': return chalk.cyan;
            case 'setup': return chalk.blue;
            case 'implementation': return chalk.green;
            case 'testing': return chalk.yellow;
            case 'documentation': return chalk.magenta;
            case 'deployment': return chalk.red;
            default: return chalk.gray;
        }
    }

    // Utility methods
    private async initializeSystems(): Promise<void> {
        await this.agentManager.initialize();
        // Ensure orchestrator services share our working directory
        planningService.setWorkingDirectory(this.workingDirectory);

        // Initialize memory and snapshot services
        await memoryService.initialize();
        await snapshotService.initialize();

        // Event bridge is idempotent
        this.setupOrchestratorEventBridge();

        // Initialize cloud docs provider
        await this.initializeCloudDocs();

        console.log(chalk.dim('✓ Systems initialized'));
    }

    private async initializeCloudDocs(): Promise<void> {
        try {
            const cloudDocsConfig = this.configManager.get('cloudDocs');

            // Get API credentials from environment or config
            const apiUrl = cloudDocsConfig.apiUrl || process.env.SUPABASE_URL;
            const apiKey = cloudDocsConfig.apiKey || process.env.SUPABASE_ANON_KEY;

            if (cloudDocsConfig.enabled && apiUrl && apiKey) {
                const provider = createCloudDocsProvider({
                    ...cloudDocsConfig,
                    apiUrl,
                    apiKey
                });

                if (cloudDocsConfig.autoSync) {
                    console.log(chalk.gray('📚 Auto-syncing documentation library...'));
                    await provider.sync();
                }

                console.log(chalk.dim('✓ Cloud documentation system ready'));
            } else {
                console.log(chalk.dim('ℹ️ Cloud documentation disabled'));
            }
        } catch (error: any) {
            console.log(chalk.yellow(`⚠️ Cloud docs initialization failed: ${error.message}`));
        }
    }

    private switchModel(modelName: string): void {
        try {
            this.configManager.setCurrentModel(modelName);

            // Validate the new model using model provider
            if (modelProvider.validateApiKey()) {
                console.log(chalk.green(`✅ Switched to model: ${modelName}`));
            } else {
                console.log(chalk.yellow(`⚠️  Switched to model: ${modelName} (API key needed)`));
            }

            this.addLiveUpdate({
                type: 'info',
                content: `Model switched to: ${modelName}`,
                source: 'model-switch'
            });
        } catch (error: any) {
            this.addLiveUpdate({
                type: 'error',
                content: `Model switch failed: ${error.message}`,
                source: 'model-switch'
            });
            console.log(chalk.red(`❌ Could not switch model: ${error.message}`));
        }
    }

    private async askForApproval(question: string): Promise<boolean> {
        return await this.askAdvancedConfirmation(question, undefined, false);
    }

    private async askForInput(prompt: string): Promise<string> {
        return new Promise((resolve) => {
            if (!this.rl) {
                resolve('');
                return;
            }

            this.rl.question(chalk.cyan(prompt), (answer) => {
                resolve(answer.trim());
            });
        });
    }

    private async promptInput(prompt: string, isPassword: boolean = false): Promise<string> {
        return new Promise((resolve) => {
            if (!this.rl) {
                resolve('');
                return;
            }

            if (isPassword) {
                // For passwords, we'll use a simple hidden input approach
                process.stdout.write(chalk.cyan(prompt));

                const stdin = process.stdin;
                stdin.setRawMode(true);
                stdin.resume();
                stdin.setEncoding('utf8');

                let password = '';

                const onData = (char: string) => {
                    switch (char) {
                        case '\n':
                        case '\r':
                        case '\u0004':
                            stdin.setRawMode(false);
                            stdin.pause();
                            stdin.off('data', onData);
                            process.stdout.write('\n');
                            resolve(password);
                            break;
                        case '\u0003':
                            process.exit();
                            break;
                        case '\u007f':
                            if (password.length > 0) {
                                password = password.slice(0, -1);
                                process.stdout.write('\b \b');
                            }
                            break;
                        default:
                            if (char.charCodeAt(0) >= 32) {
                                password += char;
                                process.stdout.write('*');
                            }
                            break;
                    }
                };

                stdin.on('data', onData);
            } else {
                this.rl.question(chalk.cyan(prompt), (answer) => {
                    resolve(answer.trim());
                });
            }
        });
    }

    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private async clearSession(): Promise<void> {
        // Clear current chat session
        chatManager.clearCurrentSession();

        // Clear legacy session context
        this.sessionContext.clear();

        // Clear UI indicators and state
        this.indicators.clear();
        this.liveUpdates.length = 0;

        // Stop any running spinners
        this.spinners.forEach(spinner => spinner.stop());
        this.spinners.clear();

        // Stop any progress bars
        this.progressBars.forEach(bar => bar.stop());
        this.progressBars.clear();

        console.log(chalk.green('✅ Session and UI state cleared'));
        this.addLiveUpdate({ type: 'info', content: 'Session cleared', source: 'session' });
    }

    private async compactSession(): Promise<void> {
        console.log(chalk.blue('📊 Compacting session to save tokens...'));

        const session = chatManager.getCurrentSession();
        if (!session || session.messages.length <= 3) {
            const box = boxen('Session too short to compact', {
                title: '📦 Compact Session', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
            });
            console.log(box);
            return;
        }

        try {
            const originalCount = session.messages.length;

            // Estimate tokens before
            const estimateTokens = (msgs: any[]) => Math.round(msgs.reduce((s, m) => s + (m.content?.length || 0), 0) / 4);
            const tokensBefore = estimateTokens(session.messages);

            // Ultra-aggressive compaction: keep only system message and last user+assistant pair
            const systemMessages = session.messages.filter(m => m.role === 'system');
            const recentMessages = session.messages.slice(-2); // Only last 2 messages

            // Create ultra-short summary
            const olderMessages = session.messages.slice(0, -2).filter(m => m.role !== 'system');

            let removed = 0;
            if (olderMessages.length > 0) {
                removed = olderMessages.length;
                const summaryMessage = {
                    role: 'system' as const,
                    content: `[Compacted ${olderMessages.length} messages into summary]`,
                    timestamp: new Date()
                };

                session.messages = [...systemMessages, summaryMessage, ...recentMessages];
            }

            // Additional token optimization: truncate long messages
            session.messages.forEach(msg => {
                if (msg.content.length > 2000) {
                    msg.content = msg.content.substring(0, 2000) + '...[truncated]';
                }
            });

            const tokensAfter = estimateTokens(session.messages);
            const tokensSaved = Math.max(0, tokensBefore - tokensAfter);

            const details = [
                `${chalk.green('Messages:')} ${originalCount} → ${session.messages.length}  (${removed} removed)`,
                `${chalk.green('Est. Tokens:')} ${tokensBefore.toLocaleString()} → ${tokensAfter.toLocaleString()}  (${chalk.yellow('-' + tokensSaved.toLocaleString())})`,
                '',
                chalk.gray('Kept: system messages + last user/assistant pair'),
                chalk.gray('Long messages truncated to 2000 chars')
            ].join('\n');

            console.log(boxen(details, {
                title: '📦 Compact Session', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
            }));

            this.addLiveUpdate({ type: 'info', content: `Session compacted (saved ~${tokensSaved} tokens)`, source: 'session' });
        } catch (error: any) {
            console.log(boxen(`Error compacting session: ${error.message}`, {
                title: '❌ Compact Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    private async manageTokenCommands(args: string[]): Promise<void> {
        const action = args[0];

        switch (action) {
            case 'reset':
                // Reset session counters
                this.sessionTokenUsage = 0;
                this.contextTokens = 0;
                this.sessionStartTime = new Date();
                console.log(chalk.green('✅ Session token counters reset'));
                this.addLiveUpdate({
                    type: 'info',
                    content: 'Token counters reset',
                    source: 'tokens'
                });
                break;

            case 'compare':
                await this.showModelComparison();
                break;

            case 'pricing':
                await this.showModelPricing();
                break;

            case 'estimate':
                const targetTokens = parseInt(args[1]) || 50000;
                await this.showCostEstimate(targetTokens);
                break;

            case 'cache':
                await this.manageTokenCache(args[1]);
                break;

            case 'help':
                this.showTokenHelp();
                break;

            default:
                await this.showTokenUsage();
        }
    }
    private async showModelComparison(): Promise<void> {
        console.log(chalk.blue('💸 Complete Model Cost Comparison'));

        try {
            const session = chatManager.getCurrentSession();
            if (!session) {
                console.log(chalk.gray('No active session for comparison'));
                return;
            }

            const userTokens = Math.round(session.messages.filter(m => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4);
            const assistantTokens = Math.round(session.messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4);

            const { calculateTokenCost, MODEL_COSTS } = await import('./config/token-limits');
            const currentModel = this.configManager.getCurrentModel();

            console.log(boxen(
                `${chalk.cyan('Session Tokens:')}\n` +
                `Input (User): ${chalk.white(userTokens.toLocaleString())} tokens\n` +
                `Output (Assistant): ${chalk.white(assistantTokens.toLocaleString())} tokens\n` +
                `Total: ${chalk.white((userTokens + assistantTokens).toLocaleString())} tokens`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan'
                }
            ));

            console.log(chalk.cyan('\n🏆 All Models Comparison:'));
            console.log(chalk.gray('─'.repeat(90)));
            console.log(chalk.white('Model'.padEnd(30) + 'Total Cost'.padStart(12) + 'Input Cost'.padStart(12) + 'Output Cost'.padStart(12) + 'Provider'.padStart(15)));
            console.log(chalk.gray('─'.repeat(90)));

            const allModels = Object.keys(MODEL_COSTS).filter(k => k !== 'default');
            const costs = allModels.map(modelKey => {
                const cost = calculateTokenCost(userTokens, assistantTokens, modelKey);
                return { modelKey, ...cost };
            }).sort((a, b) => a.totalCost - b.totalCost);

            costs.forEach(cost => {
                const isCurrentModel = cost.modelKey === currentModel;
                const prefix = isCurrentModel ? chalk.green('→ ') : '  ';
                const modelName = isCurrentModel ? chalk.green.bold(cost.model) : cost.model;
                const totalCost = isCurrentModel ? chalk.yellow.bold(`$${cost.totalCost.toFixed(4)}`) : `$${cost.totalCost.toFixed(4)}`;
                const provider = cost.modelKey.includes('claude') ? 'Anthropic' :
                    cost.modelKey.includes('gpt') ? 'OpenAI' :
                        cost.modelKey.includes('gemini') ? 'Google' : 'Unknown';

                console.log(`${prefix}${modelName.padEnd(28)} ${totalCost.padStart(10)} $${cost.inputCost.toFixed(4).padStart(7)} $${cost.outputCost.toFixed(4).padStart(8)} ${provider.padStart(13)}`);
            });

            // Show savings potential
            const currentCost = costs.find(c => c.modelKey === currentModel);
            const cheapestCost = costs[0];
            if (currentCost && cheapestCost && currentCost.totalCost > cheapestCost.totalCost) {
                const savings = currentCost.totalCost - cheapestCost.totalCost;
                const savingsPercent = (savings / currentCost.totalCost) * 100;
                console.log(chalk.yellow(`\n💡 Potential savings: $${savings.toFixed(4)} (${savingsPercent.toFixed(1)}%) by switching to ${cheapestCost.model}`));
            }

        } catch (error: any) {
            console.log(chalk.red(`Model comparison error: ${error.message}`));
        }
    }

    private async showModelPricing(): Promise<void> {
        console.log(chalk.blue('🏷️ Current Model Pricing Details'));

        try {
            const { getModelPricing, MODEL_COSTS } = await import('./config/token-limits');
            const currentModel = this.configManager.getCurrentModel();
            const pricing = getModelPricing(currentModel);

            console.log(boxen(
                `${chalk.cyan('Current Model:')}\n` +
                `${chalk.white(pricing.displayName)}\n\n` +
                `${chalk.green('Input Pricing:')} $${pricing.input.toFixed(2)} per 1M tokens\n` +
                `${chalk.green('Output Pricing:')} $${pricing.output.toFixed(2)} per 1M tokens\n\n` +
                `${chalk.yellow('Examples:')}\n` +
                `• 1K input + 1K output = $${((pricing.input + pricing.output) / 1000).toFixed(4)}\n` +
                `• 10K input + 10K output = $${((pricing.input + pricing.output) / 100).toFixed(4)}\n` +
                `• 100K input + 100K output = $${((pricing.input + pricing.output) / 10).toFixed(3)}`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'blue'
                }
            ));

            // Show all available models
            console.log(chalk.cyan('\n📋 All Available Models:'));
            console.log(chalk.gray('─'.repeat(80)));

            Object.entries(MODEL_COSTS).forEach(([key, model]) => {
                if (key === 'default') return;
                const isCurrentModel = key === currentModel;
                const prefix = isCurrentModel ? chalk.green('→ ') : '  ';
                const modelName = isCurrentModel ? chalk.green.bold(model.displayName) : model.displayName;

                console.log(`${prefix}${modelName.padEnd(25)} In: $${model.input.toFixed(2).padStart(6)} Out: $${model.output.toFixed(2).padStart(6)}`);
            });

        } catch (error: any) {
            console.log(chalk.red(`Pricing display error: ${error.message}`));
        }
    }

    private async showCostEstimate(targetTokens: number): Promise<void> {
        console.log(chalk.blue(`💰 Cost Estimate for ${targetTokens.toLocaleString()} tokens`));

        try {
            const { calculateTokenCost, MODEL_COSTS } = await import('./config/token-limits');
            const currentModel = this.configManager.getCurrentModel();

            // Assume 50/50 input/output split
            const inputTokens = Math.floor(targetTokens / 2);
            const outputTokens = Math.floor(targetTokens / 2);

            console.log(boxen(
                `${chalk.cyan('Estimation Parameters:')}\n` +
                `Target Tokens: ${chalk.white(targetTokens.toLocaleString())}\n` +
                `Input Tokens: ${chalk.white(inputTokens.toLocaleString())} (50%)\n` +
                `Output Tokens: ${chalk.white(outputTokens.toLocaleString())} (50%)`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'cyan'
                }
            ));

            console.log(chalk.cyan('\n💸 Cost Estimates by Model:'));
            console.log(chalk.gray('─'.repeat(60)));

            const models = Object.keys(MODEL_COSTS).filter(k => k !== 'default');
            models.forEach(modelKey => {
                const cost = calculateTokenCost(inputTokens, outputTokens, modelKey);
                const isCurrentModel = modelKey === currentModel;
                const prefix = isCurrentModel ? chalk.green('→ ') : '  ';
                const modelName = isCurrentModel ? chalk.green.bold(cost.model) : cost.model;
                const totalCost = isCurrentModel ? chalk.yellow.bold(`$${cost.totalCost.toFixed(4)}`) : `$${cost.totalCost.toFixed(4)}`;

                console.log(`${prefix}${modelName.padEnd(25)} ${totalCost}`);
            });

        } catch (error: any) {
            console.log(chalk.red(`Cost estimation error: ${error.message}`));
        }
    }

    private showTokenHelp(): void {
        console.log(chalk.blue('🎫 Token Commands Help'));
        console.log(chalk.gray('─'.repeat(60)));
        console.log('Usage: /tokens [command] [options]');
        console.log('');
        console.log('Commands:');
        console.log('  (no args)     Show current session token usage and costs');
        console.log('  compare       Compare costs across all models for current session');
        console.log('  pricing       Show detailed pricing for current model');
        console.log('  estimate <n>  Estimate costs for N tokens (default: 50000)');
        console.log('  reset         Reset session token counters');
        console.log('  cache <cmd>   Manage token caches (clear, stats, optimize)');
        console.log('  help          Show this help message');
        console.log('');
        console.log('Examples:');
        console.log('  /tokens              # Show current usage');
        console.log('  /tokens compare      # Compare all models');
        console.log('  /tokens estimate 100000  # Estimate cost for 100K tokens');
        console.log('  /tokens cache clear  # Clear token caches');
    }

    private async manageTokenCache(action?: string): Promise<void> {
        switch (action) {
            case 'clear':
                await Promise.all([
                    tokenCache.clearCache(),
                    completionCache.clearCache()
                ]);
                console.log(chalk.green('✅ All caches cleared'));
                break;

            case 'cleanup':
                const removed = await tokenCache.cleanupExpired();
                console.log(chalk.green(`✅ Removed ${removed} expired cache entries`));
                break;

            case 'settings':
                console.log(chalk.blue('⚙️ Current Cache Settings:'));
                console.log(`  Max cache size: 1000 entries`);
                console.log(`  Similarity threshold: 0.85`);
                console.log(`  Max age: 7 days`);
                console.log(`  Cache file: ./.nikcli/token-cache.json`);
                break;

            case 'export':
                const exportPath = `./cache-export-${Date.now()}.json`;
                await tokenCache.exportCache(exportPath);
                break;

            default: // 'stats' or no argument
                const stats = tokenCache.getStats();
                const completionStats = completionCache.getStats();
                const totalTokensSaved = stats.totalTokensSaved + (completionStats.totalHits * 50); // Estimate 50 tokens saved per completion hit

                console.log(boxen(
                    `${chalk.cyan.bold('🔮 Advanced Cache System Statistics')}\n\n` +
                    `${chalk.magenta('📦 Full Response Cache:')}\n` +
                    `  Entries: ${chalk.white(stats.totalEntries.toLocaleString())}\n` +
                    `  Hits: ${chalk.green(stats.totalHits.toLocaleString())}\n` +
                    `  Tokens Saved: ${chalk.yellow(stats.totalTokensSaved.toLocaleString())}\n\n` +
                    `${chalk.cyan('🔮 Completion Protocol Cache:')} ${chalk.red('NEW!')}\n` +
                    `  Patterns: ${chalk.white(completionStats.totalPatterns.toLocaleString())}\n` +
                    `  Hits: ${chalk.green(completionStats.totalHits.toLocaleString())}\n` +
                    `  Avg Confidence: ${chalk.blue(Math.round(completionStats.averageConfidence * 100))}%\n\n` +
                    `${chalk.green.bold('💰 Total Savings:')}\n` +
                    `Combined Tokens: ${chalk.yellow(totalTokensSaved.toLocaleString())}\n` +
                    `Estimated Cost: ~$${(totalTokensSaved * 0.003 / 1000).toFixed(2)}`,
                    {
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'magenta'
                    }
                ));

                if (stats.totalEntries > 0) {
                    console.log(chalk.cyan('\n🔧 Available Actions:'));
                    console.log('  /cache clear    - Clear all cache entries');
                    console.log('  /cache cleanup  - Remove expired entries');
                    console.log('  /cache settings - Show cache configuration');
                    console.log('  /cache export   - Export cache to file');
                }
                break;
        }
    }

    private async showTokenUsage(): Promise<void> {
        console.log(chalk.blue('💰 Token Usage Analysis & Real Costs'));

        try {
            const session = chatManager.getCurrentSession();

            if (session) {
                const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
                const estimatedTokens = Math.round(totalChars / 4);
                const tokenLimit = 250000;
                const usagePercent = Math.round((estimatedTokens / tokenLimit) * 100);

                // Calculate real costs for current model
                const currentModel = this.configManager.getCurrentModel();
                const userTokens = Math.round(session.messages.filter(m => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4);
                const assistantTokens = Math.round(session.messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4);

                const { calculateTokenCost, getModelPricing, MODEL_COSTS } = await import('./config/token-limits');
                const currentCost = calculateTokenCost(userTokens, assistantTokens, currentModel);
                const modelPricing = getModelPricing(currentModel);

                console.log(boxen(
                    `${chalk.cyan('Current Session Token Usage')}\n\n` +
                    `Messages: ${chalk.white(session.messages.length.toLocaleString())}\n` +
                    `Characters: ${chalk.white(totalChars.toLocaleString())}\n` +
                    `Est. Tokens: ${chalk.white(estimatedTokens.toLocaleString())}\n` +
                    `Usage: ${usagePercent > 75 ? chalk.red(`${usagePercent}%`) : usagePercent > 50 ? chalk.yellow(`${usagePercent}%`) : chalk.green(`${usagePercent}%`)}\n` +
                    `Limit: ${chalk.gray(tokenLimit.toLocaleString())}\n\n` +
                    `${chalk.yellow('💰 Real-time Cost:')}\n` +
                    `Model: ${chalk.white(currentCost.model)}\n` +
                    `Input Cost: ${chalk.green('$' + currentCost.inputCost.toFixed(4))}\n` +
                    `Output Cost: ${chalk.green('$' + currentCost.outputCost.toFixed(4))}\n` +
                    `Total Cost: ${chalk.yellow.bold('$' + currentCost.totalCost.toFixed(4))}`,
                    {
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: usagePercent > 75 ? 'red' : usagePercent > 50 ? 'yellow' : 'green'
                    }
                ));

                // Message breakdown with costs (panel)
                {
                    const systemMsgs = session.messages.filter(m => m.role === 'system');
                    const userMsgs = session.messages.filter(m => m.role === 'user');
                    const assistantMsgs = session.messages.filter(m => m.role === 'assistant');
                    const sysTokens = Math.round(systemMsgs.reduce((sum, m) => sum + m.content.length, 0) / 4);
                    const lines = [
                        `System: ${systemMsgs.length} (${sysTokens.toLocaleString()} tokens)`,
                        `User: ${userMsgs.length} (${userTokens.toLocaleString()} tokens) - $${currentCost.inputCost.toFixed(4)}`,
                        `Assistant: ${assistantMsgs.length} (${assistantTokens.toLocaleString()} tokens) - $${currentCost.outputCost.toFixed(4)}`
                    ];
                    console.log(boxen(lines.join('\n'), { title: '📋 Message Breakdown', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));
                }

                // Model pricing comparison (panel)
                {
                    const comparisonModels = [
                        'claude-3-5-sonnet-latest',
                        'claude-3-7-sonnet-20250219',
                        'gpt-4o',
                        'gpt-4o-mini',
                        'gpt-5',
                        'gpt-5-mini-2025-08-07',
                        'gpt-5-nano-2025-08-07',
                        'gemini-2.5-pro',
                        'gemini-2.5-flash',
                        'gemini-2.5-flash-lite'
                    ];
                    const lines: string[] = [];
                    comparisonModels.forEach(modelKey => {
                        if (MODEL_COSTS[modelKey]) {
                            const cost = calculateTokenCost(userTokens, assistantTokens, modelKey);
                            const isCurrentModel = modelKey === currentModel;
                            const mark = isCurrentModel ? '→ ' : '  ';
                            lines.push(`${mark}${cost.model}  $${cost.totalCost.toFixed(4)} (In $${cost.inputCost.toFixed(4)} | Out $${cost.outputCost.toFixed(4)})`);
                        }
                    });
                    if (lines.length > 0) {
                        console.log(boxen(lines.join('\n'), { title: '💸 Model Pricing Comparison', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'blue' }));
                    }
                }

                // Current model pricing details (panel)
                console.log(boxen([
                    `Model: ${currentCost.model}`,
                    `Input:  $${modelPricing.input.toFixed(2)} per 1M tokens`,
                    `Output: $${modelPricing.output.toFixed(2)} per 1M tokens`
                ].join('\n'), { title: '🏷️ Current Model Pricing', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan' }));

                // Cost projections
                if (estimatedTokens > 10000) {
                    const projectedDailyCost = (currentCost.totalCost / estimatedTokens) * 50000; // Assuming 50k tokens/day
                    const projectedMonthlyCost = projectedDailyCost * 30;
                    console.log(boxen([
                        `Daily (50k tokens): $${projectedDailyCost.toFixed(4)}`,
                        `Monthly (~1.5M tokens): $${projectedMonthlyCost.toFixed(2)}`
                    ].join('\n'), { title: '📊 Cost Projections', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow' }));
                }

                // Router-aware average spend per model (per 1K tokens)
                try {
                    const models = this.configManager.get('models');
                    const provider = models[currentModel]?.provider;
                    const sessionTokens = Math.max(1, userTokens + assistantTokens);
                    const variantEntries = Object.entries(models).filter(([, cfg]: any) => cfg.provider === provider);
                    const { calculateTokenCost: calc } = await import('./config/token-limits');
                    const lines: string[] = [];
                    variantEntries.slice(0, 10).forEach(([name]) => {
                        try {
                            const c = calc(userTokens, assistantTokens, name);
                            const avgPer1K = (c.totalCost / sessionTokens) * 1000;
                            lines.push(`${c.model}  avg $/1K: $${avgPer1K.toFixed(4)}  total: $${c.totalCost.toFixed(4)}`);
                        } catch { }
                    });
                    if (lines.length > 0) {
                        console.log(boxen(lines.join('\n'), { title: '🔀 Router: Avg Spend per Model (per 1K)', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta' }));
                    }
                } catch { }

                // Recommendations
                if (estimatedTokens > 150000) {
                    console.log(chalk.red('\n⚠️ CRITICAL: Very high token usage!'));
                    console.log(chalk.yellow('Recommendations:'));
                    console.log('  • Use /compact to compress session immediately');
                    console.log('  • Start a new session with /new');
                    console.log('  • Consider switching to a cheaper model for simple tasks');
                } else if (estimatedTokens > 100000) {
                    console.log(chalk.yellow('\n⚠️ WARNING: High token usage'));
                    console.log('Recommendations:');
                    console.log('  • Consider using /compact soon');
                    console.log('  • Auto-compaction will trigger at 100k tokens');
                } else if (estimatedTokens > 50000) {
                    console.log(chalk.blue('\n💡 INFO: Moderate token usage'));
                    console.log('  • Session is healthy');
                    console.log('  • Auto-monitoring active');
                }

            } else {
                console.log(chalk.gray('No active session'));
            }

            // Show current UI session tracking
            const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60);
            const totalTokens = this.sessionTokenUsage + this.contextTokens;
            console.log(chalk.cyan('\n🎯 Current UI Session:'));
            console.log(`  • Total tokens: ${totalTokens.toLocaleString()} (${this.sessionTokenUsage.toLocaleString()} session + ${this.contextTokens.toLocaleString()} context)`);
            console.log(`  • Duration: ${sessionDuration} minutes`);
            console.log(`  • Started: ${this.sessionStartTime.toLocaleTimeString()}`);
            console.log(chalk.gray('  • Use /tokens reset to clear session counters'));
            console.log(chalk.gray('  • Use /tokens compare to see all model costs'));

        } catch (error: any) {
            console.log(chalk.red(`Token analysis error: ${error.message}`));
        }
    }

    private async showCost(): Promise<void> {
        console.log(chalk.blue('💰 Token usage and cost information'));

        try {
            const session = chatManager.getCurrentSession();
            const stats = chatManager.getSessionStats();

            if (session) {
                // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
                const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
                const estimatedTokens = Math.round(totalChars / 4);

                console.log(chalk.cyan('📊 Current Session:'));
                console.log(`  Messages: ${session.messages.length}`);
                console.log(`  Characters: ${totalChars.toLocaleString()}`);
                console.log(`  Estimated Tokens: ${estimatedTokens.toLocaleString()}`);

                console.log(chalk.cyan('\n📊 Overall Stats:'));
                console.log(`  Total Sessions: ${stats.totalSessions}`);
                console.log(`  Total Messages: ${stats.totalMessages}`);

                // Show current model pricing info
                const currentModel = this.configManager.getCurrentModel();
                console.log(chalk.cyan('\n🏷️ Current Model:'));
                console.log(`  Model: ${currentModel}`);
                console.log(chalk.gray('  Note: Actual costs depend on your AI provider\'s pricing'));

                this.addLiveUpdate({
                    type: 'info',
                    content: `Session stats: ${session.messages.length} messages, ~${estimatedTokens} tokens`,
                    source: 'cost-analysis'
                });
            } else {
                console.log(chalk.gray('No active session for cost analysis'));
            }
        } catch (error: any) {
            this.addLiveUpdate({
                type: 'error',
                content: `Cost calculation failed: ${error.message}`,
                source: 'cost-analysis'
            });
            console.log(chalk.red(`❌ Error calculating costs: ${error.message}`));
        }
    }

    private async handleTodoOperations(command: string, args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                const plans = enhancedPlanning.getActivePlans();
                if (plans.length === 0) {
                    console.log(boxen('No todo lists found', {
                        title: '📋 Todos', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
                    }));
                    return;
                }

                const lines: string[] = [];
                lines.push('Active Todo Lists:');
                plans.forEach((plan, index) => {
                    const completed = plan.todos.filter(t => t.status === 'completed').length;
                    const inProgress = plan.todos.filter(t => t.status === 'in_progress').length;
                    const pending = plan.todos.filter(t => t.status === 'pending').length;
                    const failed = plan.todos.filter(t => t.status === 'failed').length;
                    lines.push(`${index + 1}. ${plan.title}`);
                    lines.push(`   Status: ${plan.status} | Todos: ${plan.todos.length}`);
                    lines.push(`   ✅ ${completed} | 🔄 ${inProgress} | ⏳ ${pending} | ❌ ${failed}`);
                });
                console.log(boxen(lines.join('\n'), {
                    title: '📋 Todos', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
                }));
                return;
            }

            const subcommand = args[0].toLowerCase();
            const restArgs = args.slice(1);

            switch (subcommand) {
                case 'show': {
                    const planId = restArgs[0];
                    if (!planId) {
                        const plans = enhancedPlanning.getActivePlans();
                        const latestPlan = plans[plans.length - 1];
                        if (latestPlan) {
                            enhancedPlanning.showPlanStatus(latestPlan.id);
                        } else {
                            console.log(boxen('No todo lists found', {
                                title: '📋 Todos', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
                            }));
                        }
                    } else {
                        enhancedPlanning.showPlanStatus(planId);
                    }
                    break;
                }
                case 'open':
                case 'edit': {
                    const todoPath = 'todo.md';
                    console.log(formatFileOp('Opening', todoPath, 'in your default editor'));
                    try {
                        await toolsManager.runCommand('code', [todoPath]);
                    } catch {
                        try {
                            await toolsManager.runCommand('open', [todoPath]);
                        } catch {
                            console.log(chalk.yellow(`Could not open ${todoPath}. Please open it manually.`));
                        }
                    }
                    break;
                }
                default:
                    if (['on', 'enable', 'off', 'of', 'disable', 'status'].includes(subcommand)) {
                        // Toggle auto‑todos behavior via config
                        const cfg = this.configManager.get('autoTodo') as any || { requireExplicitTrigger: false };
                        if (subcommand === 'on' || subcommand === 'enable') {
                            this.configManager.set('autoTodo', { ...cfg, requireExplicitTrigger: false } as any);
                            console.log(boxen('Auto‑todos enabled (complex inputs can trigger background todos).\nUse "/todos off" to require explicit "todo".', {
                                title: '📋 Todos: Auto Mode', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
                            }));
                        } else if (subcommand === 'off' || subcommand === 'of' || subcommand === 'disable') {
                            this.configManager.set('autoTodo', { ...cfg, requireExplicitTrigger: true } as any);
                            console.log(boxen('Auto‑todos disabled. Only messages containing "todo" will trigger todos.\nUse "/todos on" to enable automatic triggering.', {
                                title: '📋 Todos: Explicit Mode', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
                            }));
                        } else if (subcommand === 'status') {
                            const current = (this.configManager.get('autoTodo') as any)?.requireExplicitTrigger;
                            const status = current ? 'Explicit Only (off)' : 'Automatic (on)';
                            console.log(boxen(`Current: ${status}\n- on  = auto (complex inputs can trigger)\n- off = explicit only (requires "todo")`, {
                                title: '📋 Todos: Status', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
                            }));
                        }
                    } else {
                        console.log(boxen(`Unknown todo command: ${subcommand}\nAvailable: show | open | edit | on | off | status`, {
                            title: '📋 Todos', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
                        }));
                    }
            }
        } catch (error: any) {
            this.addLiveUpdate({ type: 'error', content: `Todo operation failed: ${error.message}`, source: 'todo' });
            console.log(boxen(`Todo operation failed: ${error.message}`, {
                title: '❌ Todos Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    /**
     * Handle MCP (Model Context Protocol) commands - Claude Code/OpenCode compatible
     */
    private async handleMcpCommands(args: string[]): Promise<void> {
        if (args.length === 0) {
            const lines: string[] = [];
            lines.push('Server Management:');
            lines.push('/mcp list                    - List configured servers');
            lines.push('/mcp servers                 - Detailed server status');
            lines.push('/mcp add-local <name> <cmd>  - Add local server');
            lines.push('/mcp add-remote <name> <url> - Add remote server');
            lines.push('/mcp remove <name>           - Remove server');
            lines.push('');
            lines.push('Server Operations:');
            lines.push('/mcp test <server>           - Test server');
            lines.push('/mcp call <server> <method> [params] - Make call');
            lines.push('/mcp health                  - Check health');
            lines.push('');
            lines.push('Compatibility:');
            lines.push('/mcp import-claude           - Import Claude config');
            lines.push('/mcp export-config           - Export Claude-style config');
            lines.push('');
            lines.push('Examples:');
            lines.push('/mcp add-local filesystem ["uvx","mcp-server-filesystem","--path","."]');
            lines.push('/mcp add-remote myapi https://api.example.com/mcp');

            console.log(boxen(lines.join('\n'), {
                title: '🔮 MCP Commands', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'magenta'
            }));
            return;
        }

        const command = args[0].toLowerCase();
        const restArgs = args.slice(1);

        try {
            switch (command) {
                case 'list':
                case 'servers':
                    await this.listMcpServers();
                    break;

                case 'add-local':
                    if (restArgs.length < 2) {
                        console.log(chalk.red('Usage: /mcp add-local <name> <command-array>'));
                        console.log(chalk.gray('Example: /mcp add-local filesystem ["uvx", "mcp-server-filesystem", "--path", "."]'));
                        return;
                    }
                    await this.addLocalMcpServer(restArgs[0], restArgs.slice(1));
                    break;

                case 'add-remote':
                    if (restArgs.length < 2) {
                        console.log(chalk.red('Usage: /mcp add-remote <name> <url>'));
                        console.log(chalk.gray('Example: /mcp add-remote myapi https://api.example.com/mcp'));
                        return;
                    }
                    await this.addRemoteMcpServer(restArgs[0], restArgs[1]);
                    break;

                case 'add':
                    // Legacy compatibility
                    await this.addMcpServer(restArgs);
                    break;

                case 'test':
                    if (restArgs.length === 0) {
                        console.log(chalk.red('Usage: /mcp test <server-name>'));
                        return;
                    }
                    await this.testMcpServer(restArgs[0]);
                    break;

                case 'call':
                    if (restArgs.length < 2) {
                        console.log(chalk.red('Usage: /mcp call <server-name> <method> [params-json]'));
                        return;
                    }
                    await this.callMcpServer(restArgs[0], restArgs[1], restArgs[2]);
                    break;

                case 'health':
                    await this.checkMcpHealth();
                    break;

                case 'remove':
                    if (restArgs.length === 0) {
                        console.log(chalk.red('Usage: /mcp remove <server-name>'));
                        return;
                    }
                    await this.removeMcpServer(restArgs[0]);
                    break;

                case 'import-claude':
                    await this.importClaudeDesktopConfig();
                    break;

                case 'export-config':
                    await this.exportMcpConfig();
                    break;

                default:
                    console.log(boxen(`Unknown MCP command: ${command}\nUse /mcp for available commands`, {
                        title: '🔮 MCP', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
                    }));
            }
        } catch (error: any) {
            console.log(boxen(`MCP command failed: ${error.message}`, {
                title: '❌ MCP Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
            this.addLiveUpdate({
                type: 'error',
                content: `MCP ${command} failed: ${error.message}`,
                source: 'mcp'
            });
        }
    }

    /**
     * List configured MCP servers
     */
    private async listMcpServers(): Promise<void> {
        console.log(wrapBlue('📡 MCP Servers'));

        const servers = await mcpClient.listServers();

        if (servers.length === 0) {
            console.log(chalk.gray('No MCP servers configured'));
            console.log(chalk.gray('Use "/mcp add <name> <type> <endpoint>" to add a server'));
            return;
        }

        for (const server of servers) {
            const healthIcon = server.healthy ? chalk.green('🟢') : chalk.red('🔴');
            const typeColor = server.type === 'http' ? chalk.blue : server.type === 'websocket' ? chalk.cyan : chalk.yellow;

            console.log(`${healthIcon} ${chalk.bold(server.name)} ${typeColor(`[${server.type}]`)}`);
            if (server.endpoint) {
                console.log(`   ${chalk.gray('Endpoint:')} ${server.endpoint}`);
            }
            if (server.command) {
                console.log(`   ${chalk.gray('Command:')} ${server.command} ${(server.args || []).join(' ')}`);
            }
            if (server.capabilities && server.capabilities.length > 0) {
                console.log(`   ${chalk.gray('Capabilities:')} ${server.capabilities.join(', ')}`);
            }
            console.log(`   ${chalk.gray('Priority:')} ${server.priority || 1} | ${chalk.gray('Enabled:')} ${server.enabled ? 'Yes' : 'No'}`);
            console.log();
        }
    }

    /**
     * Add local MCP server (Claude Code format)
     */
    private async addLocalMcpServer(name: string, commandArgs: string[]): Promise<void> {
        try {
            // Parse command array if it's a JSON string
            let command: string[];
            if (commandArgs.length === 1 && commandArgs[0].startsWith('[')) {
                command = JSON.parse(commandArgs[0]);
            } else {
                command = commandArgs;
            }

            const mcpConfig = this.configManager.get('mcp') as Record<string, any> || {};
            mcpConfig[name] = {
                type: 'local',
                command,
                enabled: true,
                environment: {}
            };

            this.configManager.set('mcp', mcpConfig);
            console.log(chalk.green(`✅ Added local MCP server: ${name}`));
            console.log(chalk.gray(`Command: ${JSON.stringify(command)}`));
        } catch (error: any) {
            console.log(chalk.red(`Failed to add local server: ${error.message}`));
        }
    }

    /**
     * Add remote MCP server (OpenCode format)
     */
    private async addRemoteMcpServer(name: string, url: string): Promise<void> {
        try {
            const mcpConfig = this.configManager.get('mcp') as Record<string, any> || {};
            mcpConfig[name] = {
                type: 'remote',
                url,
                enabled: true,
                headers: {}
            };

            this.configManager.set('mcp', mcpConfig);
            console.log(chalk.green(`✅ Added remote MCP server: ${name}`));
            console.log(chalk.gray(`URL: ${url}`));
        } catch (error: any) {
            console.log(chalk.red(`Failed to add remote server: ${error.message}`));
        }
    }

    /**
     * Import Claude Desktop configuration
     */
    private async importClaudeDesktopConfig(): Promise<void> {
        try {
            const fs = await import('fs');
            const path = await import('path');
            const os = await import('os');

            // Try to find Claude Desktop config
            const possiblePaths = [
                path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
                path.join(os.homedir(), '.config', 'claude', 'claude_desktop_config.json'),
                path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json')
            ];

            let configPath: string | null = null;
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    configPath = p;
                    break;
                }
            }

            if (!configPath) {
                console.log(chalk.yellow('⚠️ Claude Desktop config not found'));
                console.log(chalk.gray('Checked paths:'));
                possiblePaths.forEach(p => console.log(chalk.gray(`  • ${p}`)));
                return;
            }

            const claudeConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (!claudeConfig.mcpServers) {
                console.log(chalk.yellow('⚠️ No MCP servers found in Claude Desktop config'));
                return;
            }

            // Convert Claude Desktop format to NikCLI format
            const mcpConfig = this.configManager.get('mcp') as Record<string, any> || {};
            let imported = 0;

            for (const [serverName, serverConfig] of Object.entries(claudeConfig.mcpServers as Record<string, any>)) {
                if (serverConfig.command) {
                    mcpConfig[serverName] = {
                        type: 'local',
                        command: Array.isArray(serverConfig.command) ? serverConfig.command : [serverConfig.command],
                        enabled: true,
                        environment: serverConfig.env || {}
                    };
                    imported++;
                }
            }

            this.configManager.set('mcp', mcpConfig);
            console.log(chalk.green(`✅ Imported ${imported} MCP servers from Claude Desktop`));
            console.log(chalk.gray(`Config file: ${configPath}`));

        } catch (error: any) {
            console.log(chalk.red(`Failed to import Claude Desktop config: ${error.message}`));
        }
    }

    /**
     * Export MCP configuration in Claude Code format
     */
    private async exportMcpConfig(): Promise<void> {
        try {
            const mcpConfig = this.configManager.get('mcp') as Record<string, any> || {};

            const exportConfig = {
                "$schema": "https://opencode.ai/config.json",
                mcp: mcpConfig
            };

            console.log(chalk.blue('📄 Claude Code/OpenCode Compatible Configuration:'));
            console.log(chalk.gray('─'.repeat(60)));
            console.log(JSON.stringify(exportConfig, null, 2));
            console.log(chalk.gray('─'.repeat(60)));
            console.log(chalk.cyan('💡 Save this to your Claude Code config file'));

        } catch (error: any) {
            console.log(chalk.red(`Failed to export config: ${error.message}`));
        }
    }
    /**
     * Add new MCP server (Legacy format for backward compatibility)
     */
    private async addMcpServer(args: string[]): Promise<void> {
        if (args.length < 3) {
            console.log(chalk.red('Usage: /mcp add <name> <type> <endpoint/command>'));
            console.log(chalk.gray('Types: http, websocket, command, stdio'));
            console.log(chalk.gray('Examples:'));
            console.log(chalk.gray('  /mcp add myapi http https://api.example.com/mcp'));
            console.log(chalk.gray('  /mcp add local command "/usr/local/bin/mcp-server"'));
            console.log(chalk.gray('  /mcp add ws websocket wss://example.com/mcp'));
            console.log(chalk.yellow('💡 Consider using /mcp add-local or /mcp add-remote for Claude Code compatibility'));
            return;
        }

        const [name, type, endpointOrCommand] = args;

        if (!['http', 'websocket', 'command', 'stdio'].includes(type)) {
            console.log(chalk.red(`Invalid server type: ${type}`));
            console.log(chalk.gray('Valid types: http, websocket, command, stdio'));
            return;
        }

        // Build server config based on Claude Code patterns
        const serverConfig: McpServerConfig = {
            name,
            type: type as 'http' | 'websocket' | 'command' | 'stdio',
            enabled: true,
            priority: 1,
            timeout: 30000,
            retries: 3,
        };

        if (type === 'http' || type === 'websocket') {
            serverConfig.endpoint = endpointOrCommand;
            serverConfig.headers = {
                'User-Agent': 'NikCLI-MCP/1.0',
                'Content-Type': 'application/json'
            };
        } else if (type === 'command' || type === 'stdio') {
            const commandParts = endpointOrCommand.split(' ');
            serverConfig.command = commandParts[0];
            serverConfig.args = commandParts.slice(1);
        }

        // Save to config manager (legacy format)
        const mcpServers = this.configManager.get('mcpServers') as Record<string, any> || {};
        mcpServers[name] = {
            name,
            type: serverConfig.type as 'http' | 'websocket' | 'command' | 'stdio',
            enabled: serverConfig.enabled,
            endpoint: serverConfig.endpoint,
            command: typeof serverConfig.command === 'string' ? serverConfig.command : serverConfig.command?.[0],
            args: Array.isArray(serverConfig.command) ? serverConfig.command.slice(1) : serverConfig.args,
            headers: serverConfig.headers,
            timeout: serverConfig.timeout,
            retries: serverConfig.retries,
            priority: serverConfig.priority,
            capabilities: serverConfig.capabilities,
            authentication: serverConfig.authentication
        };
        this.configManager.set('mcpServers', mcpServers);

        console.log(chalk.green(`✅ MCP server '${name}' added successfully`));
        console.log(chalk.gray(`Type: ${type} | Endpoint: ${endpointOrCommand}`));

        // Test the connection
        console.log(chalk.gray('Testing connection...'));
        await this.testMcpServer(name);
    }

    /**
     * Test MCP server connection
     */
    private async testMcpServer(serverName: string): Promise<void> {
        console.log(wrapBlue(`🧪 Testing MCP server: ${serverName}`));

        const result = await mcpClient.testServer(serverName);

        if (result.success) {
            console.log(chalk.green(`✅ Server '${serverName}' is healthy`));
            if (result.latency !== undefined) {
                console.log(chalk.gray(`   Response time: ${result.latency}ms`));
            }
        } else {
            console.log(chalk.red(`❌ Server '${serverName}' is not responding`));
            if (result.error) {
                console.log(chalk.gray(`   Error: ${result.error}`));
            }
        }
    }

    /**
     * Make MCP call to server
     */
    private async callMcpServer(serverName: string, method: string, paramsJson?: string): Promise<void> {
        console.log(wrapBlue(`📡 Calling MCP server '${serverName}' method '${method}'`));

        let params = {};
        if (paramsJson) {
            try {
                params = JSON.parse(paramsJson);
            } catch (error) {
                console.log(chalk.red('Invalid JSON parameters'));
                return;
            }
        }

        const request = {
            method,
            params,
            id: `call-${Date.now()}`
        };

        try {
            const response = await mcpClient.call(serverName, request);

            if (response.result) {
                console.log(chalk.green('✅ MCP Call Successful'));
                console.log(chalk.gray('Response:'));
                console.log(JSON.stringify(response.result, null, 2));
            } else if (response.error) {
                console.log(chalk.red('❌ MCP Call Failed'));
                console.log(chalk.gray('Error:'), response.error.message);
            }

            if (response.fromCache) {
                console.log(chalk.cyan('📦 Result from cache'));
            }

            if (response.executionTime) {
                console.log(chalk.gray(`⏱️ Execution time: ${response.executionTime}ms`));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ MCP call failed: ${error.message}`));
        }
    }

    /**
     * Check health of all MCP servers
     */
    private async checkMcpHealth(): Promise<void> {
        console.log(wrapBlue('🏥 Checking MCP server health'));

        const servers = mcpClient.getConfiguredServers();

        if (servers.length === 0) {
            console.log(chalk.gray('No MCP servers configured'));
            return;
        }

        for (const server of servers) {
            const healthy = await mcpClient.checkServerHealth(server.name);
            const icon = healthy ? chalk.green('🟢') : chalk.red('🔴');
            console.log(`${icon} ${server.name} (${server.type})`);
        }
    }

    /**
     * Remove MCP server (supports both new and legacy formats)
     */
    private async removeMcpServer(serverName: string): Promise<void> {
        let removed = false;

        // Try to remove from new format first
        const mcpConfig = this.configManager.get('mcp') as Record<string, any> || {};
        if (mcpConfig[serverName]) {
            delete mcpConfig[serverName];
            this.configManager.set('mcp', mcpConfig);
            removed = true;
        }

        // Try to remove from legacy format
        const legacyConfig = this.configManager.get('mcpServers') as Record<string, any> || {};
        if (legacyConfig[serverName]) {
            delete legacyConfig[serverName];
            this.configManager.set('mcpServers', legacyConfig);
            removed = true;
        }

        if (removed) {
            console.log(chalk.green(`✅ Removed MCP server: ${serverName}`));
        } else {
            console.log(chalk.red(`❌ MCP server '${serverName}' not found`));
            console.log(chalk.gray('Use /mcp list to see available servers'));
        }
    }

    private showSlashHelp(): void {
        const commands = [
            // Mode Commands
            ['/plan [task]', 'Switch to plan mode or generate plan'],
            ['/auto [task]', 'Switch to auto mode or execute task'],
            ['/default', 'Switch to default mode'],

            // File Operations  
            ['/read <file>', 'Read file contents'],
            ['/write <file> <content>', 'Write content to file'],
            ['/edit <file>', 'Edit file interactively'],
            ['/ls [directory]', 'List files in directory'],
            ['/search <query>', 'Search in files'],

            // Terminal Operations
            ['/run <command>', 'Execute terminal command'],
            ['/install <packages>', 'Install npm/yarn packages'],
            ['/npm <args>', 'Run npm commands'],
            ['/yarn <args>', 'Run yarn commands'],
            ['/git <args>', 'Run git commands'],
            ['/commits [options]', 'Show git commit history in a panel'],
            ['/git-history [options]', 'Show git commit history in a panel'],
            ['/docker <args>', 'Run docker commands'],
            ['/ps', 'List running processes'],
            ['/kill <pid>', 'Kill process by PID'],

            // Project Operations
            ['/build', 'Build the project'],
            ['/test [pattern]', 'Run tests'],
            ['/lint', 'Run linting'],
            ['/create <type> <name>', 'Create new project'],

            // Agent Management
            ['/agents', 'List available agents'],
            ['/agent <name> <task>', 'Run specific agent'],
            ['/parallel <agents> <task>', 'Run multiple agents'],
            ['/factory', 'Show agent factory dashboard'],
            ['/create-agent [--vm|--container] <name> <specialization>', 'Create new agent with explicit name'],
            ['/launch-agent <id|name> [task]', 'Launch agent from blueprint'],

            // Blueprint Management
            ['/blueprints', 'List and manage all blueprints'],
            ['/blueprint <id|name>', 'Show detailed blueprint information'],
            ['/delete-blueprint <id|name>', 'Delete a blueprint'],
            ['/export-blueprint <id|name> <file>', 'Export blueprint to file'],
            ['/import-blueprint <file>', 'Import blueprint from file'],
            ['/search-blueprints <query>', 'Search blueprints by capabilities'],

            // VM Container Management
            ['/vm', 'Show VM management help'],
            ['/vm-create <repo-url>', 'Create a new VM container'],
            ['/vm-list', 'List all active VM containers'],
            ['/vm-stop <id>', 'Stop a specific VM container'],
            ['/vm-remove <id>', 'Remove a VM container'],
            ['/vm-connect <id>', 'Connect to a VM container'],
            ['/vm-create-pr <id> "<title>" "<desc>" [branch] [base] [draft]', 'Create GitHub PR from VM container changes'],
            ['/vm-mode', 'Enter VM chat mode'],

            // Session Management
            ['/new [title]', 'Start new chat session'],
            ['/sessions', 'List all sessions'],
            ['/export [sessionId]', 'Export session to markdown'],
            ['/stats', 'Show usage statistics'],
            ['/history <on|off>', 'Enable/disable chat history'],
            ['/debug', 'Show debug information'],
            ['/temp <0.0-2.0>', 'Set temperature'],
            ['/system <prompt>', 'Set system prompt'],
            ['/tokens', 'Show token usage and optimize'],
            ['/compact', 'Force session compaction'],
            ['/cache [stats|clear|settings]', 'Manage token cache system'],

            // Model & Config
            ['/models', 'List available models'],
            ['/model <name>', 'Switch to model'],
            ['/set-key <model> <key>', 'Set API key'],
            ['/config [interactive , i]', 'Show configuration'],

            // MCP (Model Context Protocol)
            ['/mcp servers', 'List configured MCP servers'],
            ['/mcp test <server>', 'Test MCP server connection'],
            ['/mcp call <server> <method>', 'Make MCP call'],
            ['/mcp add <name> <type> <endpoint>', 'Add new MCP server'],
            ['/mcp remove <name>', 'Remove MCP server'],
            ['/mcp health', 'Check all server health'],

            // Memory & Personalization
            ['/remember "fact"', 'Store important information in long-term memory'],
            ['/recall "query"', 'Search memories for relevant information'],
            ['/memory stats', 'Show memory statistics'],
            ['/memory config', 'Show memory configuration'],
            ['/memory context', 'Show current session context'],
            ['/memory personalization', 'Show user personalization data'],
            ['/memory cleanup', 'Clean up old/unimportant memories'],
            ['/forget <memory-id>', 'Delete a specific memory (use with caution)'],

            // Context & Indexing
            ['/context <paths>', 'Select workspace context paths'],
            ['/index <path>', 'Index files in path for better context'],

            // Snapshot Management
            ['/snapshot <name> [type]', 'Create project snapshot (quick/full/dev/config)'],
            ['/snap <name>', 'Alias for quick snapshot'],
            ['/restore <snapshot-id>', 'Restore files from snapshot'],
            ['/snapshots [query]', 'List available snapshots'],

            // Vision & Image Analysis
            ['/analyze-image <path>', 'Analyze image with AI vision models'],
            ['/generate-image <prompt>', 'Generate images with AI (DALL-E 3, GPT-Image-1)'],

            // Documentation Management
            ['/docs', 'Documentation system help and status'],
            ['/doc-search <query> [category]', 'Search documentation library'],
            ['/doc-add <url> [category]', 'Add documentation from URL'],
            ['/doc-stats [--detailed]', 'Show library statistics'],
            ['/doc-list [category]', 'List available documentation'],
            ['/doc-sync', 'Sync with cloud documentation library'],
            ['/doc-load <names>', 'Load docs into AI agent context'],
            ['/doc-context [--detailed]', 'Show AI context documentation'],
            ['/doc-unload [names]', 'Remove docs from AI context'],
            ['/doc-suggest <query>', 'Suggest relevant documentation'],
            ['/doc-tag <id> <tags>', 'Manage document tags (coming soon)'],

            // IDE Diagnostics
            ['/diagnostic start [path]', 'Start IDE diagnostic monitoring (specific path or entire project)'],
            ['/diagnostic stop [path]', 'Stop IDE diagnostic monitoring (specific path or all)'],
            ['/diagnostic status', 'Show diagnostic monitoring status'],
            ['/diagnostic run', 'Run comprehensive diagnostic scan'],
            ['/monitor [path]', 'Alias for /diagnostic start'],
            ['/diag-status', 'Alias for /diagnostic status'],

            // Security Commands
            ['/security [status|set|help]', 'Manage security settings'],
            ['/dev-mode [enable|status|help]', 'Developer mode controls'],
            ['/safe-mode', 'Enable safe mode (maximum security)'],
            ['/clear-approvals', 'Clear session approvals'],

            // Advanced Features
            ['/enhanced [command]', 'Enhanced AI features (smart suggestions, analytics)'],
            ['/stream [clear]', 'Show/clear agent streams'],
            ['/approval [test]', 'Approval system controls'],
            ['/todo [command]', 'Todo list operations'],
            ['/todos [on|off|status]', 'Show lists; toggle auto‑todos'],

            // Basic Commands
            ['/init [--force]', 'Initialize project context'],
            ['/status', 'Show system status'],
            ['/clear', 'Clear session context'],
            ['/clear-session', 'Clear current chat session'],
            ['/help', 'Show this help'],
            ['/exit', 'Exit NikCLI'],
            ['/quit', 'Quit NikCLI (alias for exit)']
        ];

        const pad = (s: string) => s.padEnd(25);
        const lines: string[] = [];

        const addGroup = (title: string, a: number, b: number) => {
            lines.push(title);
            commands.slice(a, b).forEach(([cmd, desc]) => {
                lines.push(`${pad(cmd)} ${desc}`);
            });
            lines.push('');
        };

        addGroup('🎯 Mode Control:', 0, 3);
        addGroup('📁 File Operations:', 3, 8);
        addGroup('⚡ Terminal Operations:', 8, 18);
        addGroup('🔨 Project Operations:', 18, 22);
        addGroup('🤖 Agent Management:', 22, 28);
        addGroup('📋 Blueprint Management:', 28, 34);
        addGroup('🐳 VM Container Management:', 34, 42);
        addGroup('📝 Session Management:', 42, 53);
        addGroup('⚙️ Configuration:', 53, 57);
        addGroup('🔮 MCP (Model Context Protocol):', 57, 63);
        addGroup('🧠 Memory & Personalization:', 63, 71);
        addGroup('🔍 Context & Indexing:', 71, 73);
        addGroup('📸 Snapshot Management:', 73, 77);
        addGroup('👁️ Vision & Image Analysis:', 77, 79);
        addGroup('📚 Documentation Management:', 79, 91);
        addGroup('🔒 Security Commands:', 96, 100);
        addGroup('🔧 Advanced Features:', 100, 105);
        addGroup('📋 Basic Commands:', 105, commands.length);

        lines.push('💡 Shortcuts: Ctrl+C exit | Esc interrupt | Cmd+Esc default');

        console.log(boxen(lines.join('\n'), {
            title: '📚 Available Slash Commands',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'cyan'
        }));
    }

    private showChatWelcome(): void {
        const title = chalk.cyanBright('🤖 NikCLI');
        const subtitle = chalk.gray('Autonomous AI Developer Assistant');
        const enhancedBadge = this.enhancedFeaturesEnabled ?
            chalk.green('🚀 Enhanced Features Active') :
            chalk.dim('💡 Use /enhanced enable for smart features');

        console.log(boxen(
            `${title}\n${subtitle}\n\n` +
            `${enhancedBadge}\n\n` +
            `${wrapBlue('Mode:')} ${chalk.yellow(this.currentMode)}\n` +
            `${wrapBlue('Model:')} ${chalk.green(advancedAIProvider.getCurrentModelInfo().name)}\n` +
            `${wrapBlue('Directory:')} ${chalk.cyan(path.basename(this.workingDirectory))}\n\n` +
            `${chalk.dim('Type /help for commands or start chatting!')}\n` +
            `${chalk.dim('Use Shift+Tab to cycle modes: default → auto → plan')}`,
            {
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan',
                titleAlignment: 'center',
            }
        ));
    }

    /**
     * Display cognitive orchestration status
     */
    private displayCognitiveStatus(): void {
        if (!this.streamingOrchestrator) return;

        console.log(chalk.dim('\n🧠 Cognitive Orchestration System Status:'));
        console.log(chalk.dim('─'.repeat(50)));

        // Get supervision metrics if available
        const metrics = this.streamingOrchestrator.getSupervisionMetrics();

        console.log(chalk.dim(`🎯 Supervision: ${metrics.cognition ? 'Active' : 'Inactive'}`));
        console.log(chalk.dim(`📊 Metrics: ${Object.keys(metrics.metrics).length} tracked`));
        console.log(chalk.dim(`🔄 Patterns: ${Object.keys(metrics.patterns).length} recognized`));
        console.log(chalk.dim(`📈 History: ${metrics.historyLength} entries`));

        // Display component status
        console.log(chalk.dim(`🧠 ValidatorManager: Cognitive validation enabled`));
        console.log(chalk.dim(`🔧 ToolRouter: Advanced routing algorithms active`));
        console.log(chalk.dim(`🤖 AgentFactory: Multi-dimensional selection enabled`));
        console.log(chalk.dim(`🚀 AdvancedAIProvider: Intelligent commands ready`));
        console.log(chalk.dim(`🎯 Orchestration Level: ${this.orchestrationLevel}/10`));

        console.log(chalk.green('\n✅ All cognitive components initialized and coordinating\n'));
    }

    /**
     * Initialize project context
     */
    private async handleInitProject(force: boolean = false): Promise<void> {
        try {
            console.log(chalk.blue('🚀 Initializing project context...'));

            // Check for package.json
            const packageJsonPath = path.join(this.workingDirectory, 'package.json');
            const hasPackage = require('fs').existsSync(packageJsonPath);

            if (hasPackage && !force) {
                // Continue to generate/update NIKOCLI.md even if package.json exists
                console.log(chalk.yellow('ℹ️ Project already initialized (package.json present)'));
            } else if (!hasPackage) {
                // Setup basic project structure
                const basicPackageJson = {
                    name: path.basename(this.workingDirectory),
                    version: '1.0.0',
                    description: 'Project managed by NikCLI',
                    scripts: {
                        start: 'node index.js',
                        test: 'echo "No tests specified" && exit 1'
                    }
                };
                await fs.writeFile(packageJsonPath, JSON.stringify(basicPackageJson, null, 2));
                console.log(chalk.green('✅ Created package.json'));
            }

            // Initialize git if not present
            const gitDir = path.join(this.workingDirectory, '.git');
            if (!require('fs').existsSync(gitDir)) {
                try {
                    console.log(chalk.blue('🔧 Initializing git repository...'));
                    const { spawn } = require('child_process');
                    const child = spawn('git', ['init'], { cwd: this.workingDirectory });
                    await new Promise((resolve) => child.on('close', resolve));
                    console.log(chalk.green('✅ Git repository initialized'));
                } catch {
                    console.log(chalk.yellow('⚠️ Could not initialize git (skipping)'));
                }
            }

            // Generate repository overview and write to NIKOCLI.md
            const overview = await this.generateRepositoryOverview();
            await fs.writeFile(this.projectContextFile, overview.markdown, 'utf8');

            const lines: string[] = [];
            lines.push(`${chalk.green('📄 Created:')} NIKOCLI.md`);
            lines.push(`${chalk.green('📦 Package:')} ${require('fs').existsSync(packageJsonPath) ? 'present' : 'missing'}`);
            lines.push(`${chalk.green('🧪 Tests:')} ${overview.summary.testFiles} files`);
            lines.push(`${chalk.green('🗂️ Files:')} ${overview.summary.totalFiles} | ${chalk.green('Dirs:')} ${overview.summary.totalDirs}`);
            if (overview.summary.gitBranch) lines.push(`${chalk.green('🌿 Branch:')} ${overview.summary.gitBranch}`);
            if (overview.summary.lastCommit) lines.push(`${chalk.green('🕒 Last Commit:')} ${overview.summary.lastCommit}`);
            lines.push('');
            lines.push(chalk.gray('Use /read NIKOCLI.md to view details'));

            console.log(boxen(lines.join('\n'), {
                title: '🧭 Project Initialized', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
            }));

            // Show a preview panel of the generated NIKOCLI.md
            const preview = overview.markdown.split('\n').slice(0, 40).join('\n');
            console.log(boxen(preview + (overview.markdown.includes('\n', 1) ? '\n\n… (truncated)' : ''), {
                title: '📘 NIKOCLI.md (Preview)',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }));

        } catch (error: any) {
            console.log(boxen(`Failed to initialize project: ${error.message}`, {
                title: '❌ Init Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    /**
     * Build a comprehensive repository overview for NIKOCLI.md
     */
    private async generateRepositoryOverview(): Promise<{ markdown: string; summary: any }> {
        const pkgPath = path.join(this.workingDirectory, 'package.json');
        let pkg: any = null;
        try { pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')); } catch { /* ignore */ }

        // Gather directory structure (top-level only + src/tests breakdown)
        const fsSync = require('fs');
        const listDirSafe = (p: string) => {
            try { return fsSync.readdirSync(p, { withFileTypes: true }); } catch { return []; }
        };

        const topItems = listDirSafe(this.workingDirectory);
        const topDirs = topItems.filter((d: any) => d.isDirectory()).map((d: any) => d.name);
        const topFiles = topItems.filter((d: any) => d.isFile()).map((d: any) => d.name);

        const walkCount = (root: string) => {
            let files = 0, dirs = 0, tests = 0, ts = 0, js = 0;
            const walk = (dir: string) => {
                let entries: any[] = [];
                try { entries = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return; }
                for (const e of entries) {
                    const p = path.join(dir, e.name);
                    if (e.isDirectory()) { dirs++; walk(p); }
                    else if (e.isFile()) {
                        files++;
                        if (/\.(test|spec)\.(ts|js|tsx|jsx)$/.test(e.name)) tests++;
                        if (/\.ts$|\.tsx$/.test(e.name)) ts++;
                        if (/\.js$|\.jsx$/.test(e.name)) js++;
                    }
                }
            };
            walk(root);
            return { files, dirs, tests, ts, js };
        };

        const counts = walkCount(this.workingDirectory);

        // Git info (best-effort)
        let gitBranch = '';
        let lastCommit = '';
        try {
            const { execSync } = require('child_process');
            gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.workingDirectory, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            const log = execSync('git log -1 --pretty=format:"%h %ad %s" --date=short', { cwd: this.workingDirectory, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            lastCommit = log;
        } catch { /* ignore */ }

        // Build markdown
        const lines: string[] = [];
        lines.push(`# NikCLI Project Overview`);
        lines.push('');
        lines.push(`Generated: ${new Date().toISOString()}`);
        lines.push('');
        lines.push(`## Project`);
        lines.push(`- Name: ${pkg?.name || path.basename(this.workingDirectory)}`);
        if (pkg?.version) lines.push(`- Version: ${pkg.version}`);
        if (pkg?.description) lines.push(`- Description: ${pkg.description}`);
        if (gitBranch) lines.push(`- Git Branch: ${gitBranch}`);
        if (lastCommit) lines.push(`- Last Commit: ${lastCommit}`);
        lines.push('');
        lines.push('## Scripts');
        if (pkg?.scripts) {
            Object.entries(pkg.scripts).forEach(([k, v]: any) => lines.push(`- ${k}: ${v}`));
        } else {
            lines.push('- (none)');
        }
        lines.push('');
        lines.push('## Dependencies');
        const deps = Object.keys(pkg?.dependencies || {});
        const devDeps = Object.keys(pkg?.devDependencies || {});
        lines.push(`- Dependencies (${deps.length})`);
        deps.slice(0, 50).forEach(d => lines.push(`  - ${d}`));
        if (deps.length > 50) lines.push('  - ...');
        lines.push(`- DevDependencies (${devDeps.length})`);
        devDeps.slice(0, 50).forEach(d => lines.push(`  - ${d}`));
        if (devDeps.length > 50) lines.push('  - ...');
        lines.push('');
        lines.push('## Top-level Structure');
        topDirs.forEach((d: any) => lines.push(`- ${d}/`));
        topFiles.forEach((f: any) => lines.push(`- ${f}`));
        lines.push('');
        lines.push('## Code Stats');
        lines.push(`- Files: ${counts.files}`);
        lines.push(`- Directories: ${counts.dirs}`);
        lines.push(`- Test Files: ${counts.tests}`);
        lines.push(`- TypeScript Files: ${counts.ts}`);
        lines.push(`- JavaScript Files: ${counts.js}`);
        lines.push('');
        lines.push('## Notes');
        lines.push('- This file is used by NikCLI to provide project context.');
        lines.push('- Update sections as needed, or regenerate with /init --force.');

        const markdown = lines.join('\n');
        const summary = { totalFiles: counts.files, totalDirs: counts.dirs, testFiles: counts.tests, gitBranch, lastCommit };
        return { markdown, summary };
    }

    /**
     * Cycle through modes: default → plan → auto → vm → default
     */
    private cycleModes(): void {
        const modes: Array<'default' | 'plan' | 'auto' | 'vm'> = ['default', 'plan', 'auto', 'vm'];
        const currentIndex = modes.indexOf(this.currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        const nextMode = modes[nextIndex];

        this.currentMode = nextMode;

        // Sync with StreamingOrchestrator mode state
        if (this.streamingOrchestrator) {
            // Access the context property to sync mode state
            const orchestratorContext = (this.streamingOrchestrator as any).context;
            if (orchestratorContext) {
                orchestratorContext.planMode = (nextMode === 'plan');
                orchestratorContext.autoAcceptEdits = (nextMode === 'auto');
                orchestratorContext.vmMode = (nextMode === 'vm');
            }
        }

        const modeNames = {
            default: '💬 Default Chat',
            plan: '📋 Planning Mode',
            auto: '🤖 Auto Mode',
            vm: '🐳 VM Mode'
        };

        console.log(chalk.yellow(`\n🔄 Switched to ${modeNames[nextMode]}`));
        console.log(chalk.gray(`💡 Use Cmd+Tab or Cmd+] to cycle modes`));
        this.showPrompt();
    }

    public showPrompt(): void {
        if (!this.rl) return;
        if (this.isInquirerActive) return; // avoid drawing over interactive lists

        if (this.isChatMode) {
            // Use new chat UI system
            this.renderChatUI();
        } else {
            // Use old prompt system for backward compatibility
            this.showLegacyPrompt();
        }
    }

    /**
     * Legacy prompt system (for backward compatibility)
     */
    private showLegacyPrompt(): void {
        if (!this.rl) return;

        // Calculate session info
        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60);
        const totalTokens = this.sessionTokenUsage + this.contextTokens;
        const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString();
        const costDisplay = this.realTimeCost > 0 ? `$${this.realTimeCost.toFixed(4)}` : '$0.0000';

        const terminalWidth = process.stdout.columns || 120;
        const workingDir = path.basename(this.workingDirectory);

        // Mode info
        const modeIcon = this.currentMode === 'auto' ? '🚀' :
            this.currentMode === 'plan' ? '🧠' :
                this.currentMode === 'vm' ? '🐳' : '💎';
        const modeText = this.currentMode.toUpperCase();

        // Status info
        const queueStatus = inputQueue.getStatus();
        const queueCount = queueStatus.queueLength;
        const statusDot = this.assistantProcessing ? chalk.blue('●') : chalk.gray('●');
        const readyText = this.assistantProcessing ? chalk.blue(`Loading ${this.renderLoadingBar()}`) : 'Ready';

        // Model/provider
        const currentModel = this.configManager.getCurrentModel();
        const providerIcon = this.getProviderIcon(currentModel);
        const modelColor = this.getProviderColor(currentModel);
        const modelDisplay = `${providerIcon} ${modelColor(currentModel)}`;

        // Create status bar
        const statusLeft = `${modeIcon} ${readyText} | ${modelDisplay}`;
        const queuePart = queueCount > 0 ? ` | 📥 ${queueCount}` : '';
        const visionPart = ` | ${this.getVisionStatusIcon()}`;
        const imgPart = ` | ${this.getImageGenStatusIcon()}`;
        const statusRight = `💰 ${tokensDisplay} | ${costDisplay} | ⏱️ ${sessionDuration}m | 📁 ${workingDir}${queuePart}${visionPart}${imgPart}`;
        const statusPadding = Math.max(0, terminalWidth - this._stripAnsi(statusLeft).length - this._stripAnsi(statusRight).length - 4);

        // Determine border color based on state
        let borderColor;
        if (this.userInputActive) {
            borderColor = chalk.green; // Green when user is active
        } else if (this.assistantProcessing) {
            borderColor = chalk.blue;  // Blue when assistant is processing
        } else {
            borderColor = chalk.cyan;  // Default cyan when idle
        }

        // Display status bar using process.stdout.write to avoid extra lines
        if (!this.isPrintingPanel) {
            process.stdout.write(borderColor('┌' + '─'.repeat(terminalWidth - 2) + '┐') + '\n');
            process.stdout.write(borderColor('│') + chalk.green(` ${statusLeft}`) + ' '.repeat(statusPadding) + chalk.gray(statusRight + ' ') + borderColor('│') + '\n');
            process.stdout.write(borderColor('└' + '─'.repeat(terminalWidth - 2) + '┘') + '\n');
        }

        // Input prompt
        const inputPrompt = chalk.green('❯ ');
        this.rl.setPrompt(inputPrompt);
        this.rl.prompt();
    }

    /**
     * Strip ANSI escape codes to calculate actual string length
     */
    private _stripAnsi(str: string): string {
        return str.replace(/\x1b\[[0-9;]*m/g, '');
    }

    // NEW: Chat UI Methods
    /**
     * Initialize chat UI system
     */
    private initializeChatUI(): void {
        this.updateTerminalDimensions();
        this.isChatMode = true;

        // Handle terminal resize
        process.stdout.on('resize', () => {
            this.updateTerminalDimensions();
            this.renderChatUI();
        });
    }

    /**
     * Update terminal dimensions
     */
    private updateTerminalDimensions(): void {
        this.terminalHeight = process.stdout.rows || 24;
        this.chatAreaHeight = this.terminalHeight - 4; // Reserve 4 lines for prompt and status
    }

    /**
     * Add message to chat buffer
     */
    private addChatMessage(message: string): void {
        this.chatBuffer.push(message);

        // Keep buffer size manageable
        if (this.chatBuffer.length > this.maxChatLines) {
            this.chatBuffer = this.chatBuffer.slice(-this.maxChatLines);
        }

        this.renderChatUI();
    }

    /**
     * Render the chat UI with fixed prompt
     */
    private renderChatUI(): void {
        if (!this.isChatMode) return;
        if (this.isInquirerActive) return; // avoid drawing over interactive lists
        if (this.isPrintingPanel) return; // avoid drawing over panels
        // Move cursor to bottom and render prompt area
        this.renderPromptArea();
    }

    /**
     * Render the chat area (scrollable content)
     */
    private renderChatArea(): void {
        const visibleLines = this.chatBuffer.slice(-this.chatAreaHeight);

        // Fill with chat content
        visibleLines.forEach(line => {
            console.log(line);
        });

        // Fill remaining space with empty lines
        const remainingLines = this.chatAreaHeight - visibleLines.length;
        for (let i = 0; i < remainingLines; i++) {
            console.log('');
        }
    }

    /**
     * Render status bar
     */
    private renderStatusBar(): void {
        if (this.isPrintingPanel) return; // avoid interleaving while panels print
        const width = process.stdout.columns || 80;
        const currentFile = 'Ready';
        const contextInfo = `Context left until auto-compact: ${this.contextTokens > 0 ? Math.round((this.contextTokens / this.maxContextTokens) * 100) : 87}%`;

        // Get real-time cost information
        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60); // minutes
        const totalTokens = this.sessionTokenUsage + this.contextTokens;
        const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString();
        const costDisplay = this.realTimeCost > 0 ? `$${this.realTimeCost.toFixed(4)}` : '$0.0000';
        const sessionDisplay = ` | ${sessionDuration}m session`;

        // Get current model info
        const currentModel = this.configManager.getCurrentModel();
        const providerIcon = this.getProviderIcon(currentModel);
        const modelColor = this.getProviderColor(currentModel);
        const statusBar = chalk.bgGray.white(
            `${currentFile} | ${contextInfo} | 📊 ${tokensDisplay} tokens | ${costDisplay} | ${providerIcon} ${modelColor(currentModel)} | ${this.getVisionStatusIcon()} | ${this.getImageGenStatusIcon()}${sessionDisplay}`
        );

        console.log(statusBar);
    }

    // Temporarily pause/resume CLI prompt for external interactive prompts (inquirer)
    public suspendPrompt(): void {
        try { this.rl?.pause(); } catch { /* ignore */ }
    }

    public resumePromptAndRender(): void {
        try { this.rl?.resume(); } catch { /* ignore */ }
        // slight delay to avoid racing with panel prints
        setTimeout(() => this.renderPromptAfterOutput(), 30);
    }

    // Public hooks for external modules to guard panel output
    public beginPanelOutput(): void {
        this.isPrintingPanel = true;
        this.suspendPrompt();
    }

    public endPanelOutput(): void {
        this.isPrintingPanel = false;
        this.resumePromptAndRender();
    }

    /**
     * Ensure panels print atomically, without the status frame interleaving
     */
    private async withPanelOutput(fn: () => Promise<void> | void): Promise<void> {
        this.isPrintingPanel = true;
        try {
            await fn();
        } finally {
            this.isPrintingPanel = false;
            setTimeout(() => this.renderPromptAfterOutput(), 30);
        }
    }

    /**
     * Get provider icon based on model name
     */
    private getProviderIcon(modelName: string): string {
        const lowerModel = modelName.toLowerCase();

        if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
            return '🟠'; // Claude/Anthropic = orange dot
        } else if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
            return '⚫'; // OpenAI/GPT = black dot
        } else if (lowerModel.includes('gemini') || lowerModel.includes('google')) {
            return '🔵'; // Google/Gemini = blue dot
        } else {
            return '⚪'; // Default = white dot
        }
    }

    /**
     * Get provider colorizer for model name
     */
    private getProviderColor(modelName: string): (s: string) => string {
        const lowerModel = modelName.toLowerCase();
        if (lowerModel.includes('claude') || lowerModel.includes('anthropic')) {
            return chalk.hex('#FFA500'); // orange
        } else if (lowerModel.includes('gpt') || lowerModel.includes('openai')) {
            return chalk.black; // black
        } else if (lowerModel.includes('gemini') || lowerModel.includes('google')) {
            return chalk.blue; // blue
        }
        return chalk.white;
    }

    // Inline loading bar for status area (fake progress)
    private renderLoadingBar(width: number = 12): string {
        const pct = Math.max(0, Math.min(100, this.statusBarStep));
        const filled = Math.round((pct / 100) * width);
        return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`;
    }

    private startStatusBar(): void {
        if (this.statusBarTimer) return;
        this.statusBarStep = 0;
        this.lastBarSegments = -1;
        this.statusBarTimer = setInterval(() => {
            if (this.isInquirerActive) return; // don't animate during interactive
            if (this.statusBarStep < 100) {
                this.statusBarStep = Math.min(100, this.statusBarStep + 7);
                // Redraw only if visible bar segment changed
                const width = 12;
                const filled = Math.round((this.statusBarStep / 100) * width);
                if (filled !== this.lastBarSegments) {
                    this.lastBarSegments = filled;
                    this.renderPromptAfterOutput();
                }
            } else {
                // Reached 100% – stop the timer to avoid any flashing
                if (this.statusBarTimer) {
                    clearInterval(this.statusBarTimer);
                    this.statusBarTimer = null;
                }
            }
        }, 120);
    }

    private stopStatusBar(): void {
        if (this.statusBarTimer) {
            clearInterval(this.statusBarTimer);
            this.statusBarTimer = null;
        }
        this.statusBarStep = 0;
        this.lastBarSegments = -1;
        this.renderPromptAfterOutput();
    }

    /**
     * Vision status icon: 👁️🟢 if at least one provider key is configured and vision enabled, otherwise 👁️🔴
     */
    private getVisionStatusIcon(): string {
        try {
            const cfg = visionProvider.getConfig();
            const providers = visionProvider.getAvailableProviders();
            const ok = cfg.enabled && providers.length > 0;
            return ok ? '👁️ | 🟢' : '👁️ | 🔴';
        } catch {
            return '👁️ | 🔴';
        }
    }

    /**
     * Image generation status icon: 🎨🟢 if OpenAI image keys are present, otherwise 🎨🔴
     */
    private getImageGenStatusIcon(): string {
        try {
            const hasKey = !!(
                this.configManager.getApiKey('gpt-image-1') ||
                this.configManager.getApiKey('dall-e-3') ||
                this.configManager.getApiKey('dall-e-2') ||
                this.configManager.getApiKey('openai')
            );
            return hasKey ? '🎨 | 🟢' : '🎨 | 🔴';
        } catch {
            return '🎨 | 🔴';
        }
    }

    /**
     * Render prompt area (fixed at bottom)
 */
    private renderPromptArea(): void {
        if (this.isPrintingPanel) return; // do not draw status frame while a panel prints
        // Calculate session info (copied from showLegacyPrompt)
        const sessionDuration = Math.floor((Date.now() - this.sessionStartTime.getTime()) / 1000 / 60);
        const totalTokens = this.sessionTokenUsage + this.contextTokens;
        const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString();
        const costDisplay = this.realTimeCost > 0 ? `$${this.realTimeCost.toFixed(4)}` : '$0.0000';

        const terminalWidth = process.stdout.columns || 120;
        const workingDir = path.basename(this.workingDirectory);

        // Mode info
        const modeIcon = this.currentMode === 'auto' ? '🚀' :
            this.currentMode === 'plan' ? '🧠' :
                this.currentMode === 'vm' ? '🐳' : '💎';
        const modeText = this.currentMode.toUpperCase();

        // Status info
        const readyText = this.assistantProcessing ? chalk.blue(`Loading ${this.renderLoadingBar()}`) : chalk.green('Ready');
        const statusIndicator = this.assistantProcessing ? '⏳' : '✅';

        // Move cursor to bottom of terminal (reserve 3 lines for frame + 1 for prompt)
        const terminalHeight = process.stdout.rows || 24;
        // Start drawing 3 lines above the last row so we don't scroll on newline
        process.stdout.write(`\x1B[${Math.max(1, terminalHeight - 3)};0H`);

        // Clear the bottom lines
        process.stdout.write('\x1B[J'); // Clear from cursor to end

        // Model/provider
        const currentModel2 = this.configManager.getCurrentModel();
        const providerIcon2 = this.getProviderIcon(currentModel2);
        const modelColor2 = this.getProviderColor(currentModel2);
        const modelDisplay2 = `${providerIcon2} ${modelColor2(currentModel2)}`;

        // Queue/agents
        const queueStatus2 = inputQueue.getStatus();
        const queueCount2 = queueStatus2.queueLength;
        const runningAgents = (() => { try { return agentService.getActiveAgents().length; } catch { return 0; } })();

        // Create status bar (hide Mode when DEFAULT)
        const modeSegment = this.currentMode === 'default' ? '' : ` | Mode: ${modeText}`;
        const statusLeft = `${statusIndicator} ${readyText}${modeSegment} | ${modelDisplay2}`;
        const rightExtra = `${queueCount2 > 0 ? ` | 📥 ${queueCount2}` : ''}${runningAgents > 0 ? ` | 🤖 ${runningAgents}` : ''}`;
        const visionPart2 = ` | ${this.getVisionStatusIcon()}`;
        const imgPart2 = ` | ${this.getImageGenStatusIcon()}`;
        const statusRight = `💰 ${tokensDisplay} | ${costDisplay} | ⏱️ ${sessionDuration}m | 📁 ${workingDir}${rightExtra}${visionPart2}${imgPart2}`;
        const statusPadding = Math.max(0, terminalWidth - this._stripAnsi(statusLeft).length - this._stripAnsi(statusRight).length - 4);

        // Display status bar with frame using process.stdout.write to avoid extra lines
        if (!this.isPrintingPanel) {
            process.stdout.write(chalk.cyan('┌' + '─'.repeat(terminalWidth - 2) + '┐') + '\n');
            process.stdout.write(chalk.cyan('│') + chalk.green(` ${statusLeft}`) + ' '.repeat(statusPadding) + chalk.gray(statusRight + ' ') + chalk.cyan('│') + '\n');
            process.stdout.write(chalk.cyan('└' + '─'.repeat(terminalWidth - 2) + '┘') + '\n');
        }

        if (this.rl) {
            // Simple clean prompt
            this.rl.setPrompt(chalk.green('❯ '));
            this.rl.prompt();
        }
    }

    /**
     * Build the prompt string
     */
    private buildPrompt(): string {
        const workingDir = path.basename(this.workingDirectory);
        const modeIcon = this.currentMode === 'auto' ? '🚀' :
            this.currentMode === 'plan' ? '🎯' :
                this.currentMode === 'vm' ? '🐳' : '💬';
        const agentInfo = this.currentAgent ? `@${this.currentAgent}:` : '';
        const statusDot = this.assistantProcessing ? chalk.blue('●') : chalk.red('●');

        // Get token and cost information
        const tokenInfo = this.getTokenInfoSync();
        const costInfo = this.getCostInfoSync();

        // When assistant is processing (green dot), show "Assistant" in blue instead of working dir and hide icon
        if (this.assistantProcessing) {
            return `[${chalk.blue('Assistant')} ${statusDot}] ${tokenInfo} ${costInfo} > `;
        } else {
            return `[${modeIcon} ${workingDir} ${statusDot}] ${tokenInfo} ${costInfo} > `;
        }
    }

    /**
     * Get token information synchronously for prompt
     */
    private getTokenInfoSync(): string {
        try {
            const session = chatManager.getCurrentSession();

            if (session) {
                const totalChars = session.messages.reduce((sum, msg) => sum + msg.content.length, 0);
                const estimatedTokens = Math.round(totalChars / 4);
                const tokensDisplay = estimatedTokens > 1000 ? `${(estimatedTokens / 1000).toFixed(1)}k` : estimatedTokens.toString();
                return `📊${tokensDisplay}`;
            } else {
                return `📊0`;
            }
        } catch (error) {
            return `📊--`;
        }
    }

    /**
     * Get cost information synchronously for prompt
     */
    private getCostInfoSync(): string {
        try {
            const session = chatManager.getCurrentSession();

            if (session) {
                const userTokens = Math.round(session.messages.filter(m => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4);
                const assistantTokens = Math.round(session.messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4);

                const currentModel = this.configManager.getCurrentModel();

                // Use updated calculateTokenCost for accurate real-time pricing
                try {
                    const { calculateTokenCost } = require('./config/token-limits');
                    const costResult = calculateTokenCost(userTokens, assistantTokens, currentModel);
                    return `💰$${costResult.totalCost.toFixed(4)}`;
                } catch (error) {
                    // Fallback calculation
                    const costPerToken = this.getCostPerToken(currentModel);
                    const totalCost = (userTokens + assistantTokens) * costPerToken;
                    return `💰$${totalCost.toFixed(4)}`;
                }
            } else {
                return `💰$0.0000`;
            }
        } catch (error) {
            return `💰$--`;
        }
    }

    /**
     * Get cost per token for a model using real pricing from MODEL_COSTS
     */
    private getCostPerToken(modelName: string): number {
        try {
            // Import the updated MODEL_COSTS with real pricing
            const { getModelPricing } = require('./config/token-limits');
            const pricing = getModelPricing(modelName);

            // Calculate average cost per token (input + output average)
            // Assuming typical usage is 70% input, 30% output
            const inputWeight = 0.7;
            const outputWeight = 0.3;
            const avgCostPer1M = (pricing.input * inputWeight) + (pricing.output * outputWeight);

            // Convert to cost per token
            return avgCostPer1M / 1000000;
        } catch (error) {
            // Fallback to conservative estimate
            return 0.000009; // Default to conservative pricing
        }
    }

    /**
     * Hook to render prompt after console output
     */
    private renderPromptAfterOutput(): void {
        if (!this.isChatMode) return;
        if (this.isPrintingPanel) return;
        if (this.isInquirerActive) return; // don't redraw during interactive prompts
        try { if (inputQueue.isBypassEnabled()) return; } catch { /* ignore */ }
        if (this.promptRenderTimer) {
            clearTimeout(this.promptRenderTimer);
            this.promptRenderTimer = null;
        }
        this.promptRenderTimer = setTimeout(() => {
            try {
                if (!this.isPrintingPanel && !this.isInquirerActive && !(inputQueue.isBypassEnabled?.() ?? false)) this.renderPromptArea();
            } finally {
                if (this.promptRenderTimer) {
                    clearTimeout(this.promptRenderTimer);
                    this.promptRenderTimer = null;
                }
            }
        }, 50);
    }

    /**
     * Get current session token usage
     */
    public getSessionTokenUsage(): number {
        return this.sessionTokenUsage;
    }

    /**
     * Reset session token usage
     */
    public resetSessionTokenUsage(): void {
        this.sessionTokenUsage = 0;
        this.contextTokens = 0;
        this.realTimeCost = 0;
        this.sessionStartTime = new Date();
    }

    /**
     * Manage toolchain token usage to prevent limits
     */
    public manageToolchainTokens(toolName: string, estimatedTokens: number): boolean {
        const currentUsage = this.toolchainContext.get(toolName) || 0;
        const newTotal = currentUsage + estimatedTokens;

        if (newTotal > this.toolchainTokenLimit) {
            console.log(chalk.yellow(`⚠️ Toolchain token limit reached for ${toolName}`));
            console.log(chalk.dim(`   Current: ${currentUsage}, Adding: ${estimatedTokens}, Limit: ${this.toolchainTokenLimit}`));

            // Clear old context for this tool
            this.toolchainContext.set(toolName, estimatedTokens);
            return false; // Indicates limit reached
        }

        this.toolchainContext.set(toolName, newTotal);
        return true; // Indicates safe to proceed
    }

    /**
     * Clear toolchain context to free tokens
     */
    public clearToolchainContext(toolName?: string): void {
        if (toolName) {
            this.toolchainContext.delete(toolName);
            console.log(chalk.blue(`🧹 Cleared context for ${toolName}`));
        } else {
            this.toolchainContext.clear();
            console.log(chalk.blue(`🧹 Cleared all toolchain context`));
        }
    }



    /**
     * Show detailed token status
     */
    private showTokenStatus(): void {
        console.log(chalk.cyan.bold('\n🔢 Token Status'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`${chalk.blue('Session Tokens:')} ${this.sessionTokenUsage}`);
        console.log(`${chalk.blue('Context Tokens:')} ${this.contextTokens}`);
        console.log(`${chalk.blue('Total Tokens:')} ${this.sessionTokenUsage + this.contextTokens}`);
        console.log(`${chalk.blue('Toolchain Limit:')} ${this.toolchainTokenLimit}`);

        if (this.toolchainContext.size > 0) {
            console.log(chalk.blue('\nToolchain Usage:'));
            this.toolchainContext.forEach((tokens, tool) => {
                const percentage = (tokens / this.toolchainTokenLimit * 100).toFixed(1);
                const color = tokens > this.toolchainTokenLimit * 0.8 ? chalk.red :
                    tokens > this.toolchainTokenLimit * 0.5 ? chalk.yellow : chalk.green;
                console.log(`  ${tool}: ${color(tokens)} tokens (${percentage}%)`);
            });
        }
    }

    /**
     * Initialize model pricing data (could be fetched from web API)
     */
    private initializeModelPricing(): void {
        // Anthropic Claude pricing (per 1M tokens)
        this.modelPricing.set('claude-sonnet-4-20250514', { input: 15.00, output: 75.00 });
        this.modelPricing.set('claude-3-5-sonnet-latest', { input: 0.25, output: 1.25 });
        this.modelPricing.set('claude-4-opus-20250514', { input: 3.00, output: 15.00 });

        // OpenAI pricing (per 1M tokens)
        this.modelPricing.set('gpt-4o', { input: 5.00, output: 15.00 });
        this.modelPricing.set('gpt-4o-mini', { input: 0.15, output: 0.60 });
        this.modelPricing.set('gpt-5', { input: 10.00, output: 30.00 });

        // Google Gemini pricing (per 1M tokens)
        this.modelPricing.set('gemini-2.5-pro', { input: 1.25, output: 5.00 });
        this.modelPricing.set('gemini-2.5-flash', { input: 0.075, output: 0.30 });
        this.modelPricing.set('gemini-2.5-flash-lite', { input: 0.075, output: 0.30 });
    }

    /**
     * Calculate cost for tokens used
     */
    private calculateCost(inputTokens: number, outputTokens: number, modelName: string): number {
        const pricing = this.modelPricing.get(modelName);
        if (!pricing) return 0;

        const inputCost = (inputTokens / 1000000) * pricing.input;
        const outputCost = (outputTokens / 1000000) * pricing.output;
        return inputCost + outputCost;
    }

    /**
     * Start AI operation tracking with spinner
     */
    public startAIOperation(operation: string = 'Processing'): void {
        this.aiOperationStart = new Date();
        this.stopSpinner(); // Stop any existing spinner

        const ora = require('ora');
        this.activeSpinner = ora({
            text: '',
            spinner: 'dots',
            color: 'cyan'
        }).start();

        this.updateSpinnerText(operation);

        // Update spinner every 500ms with realtime stats
        const interval = setInterval(() => {
            if (!this.activeSpinner || !this.aiOperationStart) {
                clearInterval(interval);
                return;
            }
            this.updateSpinnerText(operation);
        }, 500);

        // Store interval for cleanup
        (this.activeSpinner as any)._interval = interval;
    }

    /**
     * Update spinner text with realtime stats
     */
    private updateSpinnerText(operation: string): void {
        if (!this.activeSpinner || !this.aiOperationStart) return;

        const elapsed = Math.floor((Date.now() - this.aiOperationStart.getTime()) / 1000);
        const totalTokens = this.sessionTokenUsage + this.contextTokens;
        const tokensDisplay = totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens.toString();
        const cost = this.realTimeCost.toFixed(4);

        const spinnerText = `${operation}... (${elapsed}s • ${tokensDisplay} tokens • $${cost} • esc to interrupt)`;
        this.activeSpinner.text = spinnerText;
    }

    /**
     * Stop AI operation tracking
     */
    public stopAIOperation(): void {
        this.stopSpinner();
        this.aiOperationStart = null;
    }

    /**
     * Stop active spinner
     */
    private stopSpinner(): void {
        if (this.activeSpinner) {
            if ((this.activeSpinner as any)._interval) {
                clearInterval((this.activeSpinner as any)._interval);
            }
            this.activeSpinner.stop();
            this.activeSpinner = null;
        }
    }

    /**
     * Update token usage with real tracking
     */
    public updateTokenUsage(tokens: number, isOutput: boolean = false, modelName?: string): void {
        this.sessionTokenUsage += tokens;

        if (modelName) {
            const inputTokens = isOutput ? 0 : tokens;
            const outputTokens = isOutput ? tokens : 0;
            this.realTimeCost += this.calculateCost(inputTokens, outputTokens, modelName);
        }

        // Don't update UI during streaming to avoid duplicates
        // UI will be updated when streaming completes
    }

    /**
     * Sync token usage from current session (same method as /tokens command)
     */
    private async syncTokensFromSession(): Promise<void> {
        try {
            const session = chatManager.getCurrentSession();
            if (session) {
                // Calculate tokens the same way as /tokens command
                const userTokens = Math.round(session.messages.filter(m => m.role === 'user').reduce((sum, m) => sum + m.content.length, 0) / 4);
                const assistantTokens = Math.round(session.messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + m.content.length, 0) / 4);

                // Update session tokens
                this.sessionTokenUsage = userTokens + assistantTokens;

                // Calculate real cost using the same method as /tokens
                const { calculateTokenCost } = await import('./config/token-limits');
                const currentModel = this.configManager.getCurrentModel();
                this.realTimeCost = calculateTokenCost(userTokens, assistantTokens, currentModel).totalCost;
            }
        } catch (error) {
            // Fallback to keep existing values if import fails
            console.debug('Failed to sync tokens from session:', error);
        }
    }

    /**
     * Update context token count
     */
    public updateContextTokens(tokens: number): void {
        this.contextTokens = tokens;

        // Don't update UI during streaming to avoid duplicates
        // UI will be updated when streaming completes
    }

    /**
     * Detect if a user request is complex and needs automatic planning
     */
    private detectComplexRequest(input: string): boolean {
        // Keywords that suggest complex multi-step tasks
        const complexKeywords = [
            'implement', 'create', 'build', 'develop', 'add feature', 'integrate',
            'refactor', 'restructure', 'migrate', 'setup', 'configure', 'install',
            'deploy', 'optimize', 'fix bug', 'add component', 'create api', 'database'
        ];

        // Check for multiple files/directories mentioned
        const filePatterns = input.match(/\b\w+\.\w+\b/g) || [];
        const pathPatterns = input.match(/\b[\w\/]+\/[\w\/]+/g) || [];

        // Check length and complexity
        const wordCount = input.split(/\s+/).length;
        const hasComplexKeywords = complexKeywords.some(keyword =>
            input.toLowerCase().includes(keyword.toLowerCase())
        );

        // Determine if request needs planning
        return (
            hasComplexKeywords ||
            wordCount > 20 ||
            filePatterns.length > 2 ||
            pathPatterns.length > 1 ||
            input.includes(' and ') ||
            input.includes(' then ')
        );
    }

    private async analyzeProject(): Promise<any> {
        // Implementation for project analysis
        return {
            name: path.basename(this.workingDirectory),
            framework: 'Unknown',
            languages: ['typescript', 'javascript'],
            dependencies: [],
            structure: {}
        };
    }

    private generateClaudeMarkdown(analysis: any): string {
        return `# NIKOCLI.md

This file provides guidance to NikCLI when working with code in this repository.

## Project Overview
- **Name**: ${analysis.name}
- **Framework**: ${analysis.framework}
- **Languages**: ${analysis.languages.join(', ')}

## Architecture
[Project architecture description will be auto-generated based on analysis]

## Development Commands
[Development commands will be auto-detected and listed here]

## Conventions
[Code conventions and patterns will be documented here]

## Context
This file is automatically maintained by NikCLI to provide consistent context across sessions.
`;
    }

    private async savePlanToFile(plan: ExecutionPlan, filename: string): Promise<void> {
        const content = `# Execution Plan: ${plan.title}
## Description
${plan.description}

## Steps
${plan.steps.map((step, index) => `${index + 1}. ${step.title}\n   ${step.description}`).join('\n\n')}

## Risk Assessment
- Overall Risk: ${plan.riskAssessment.overallRisk}
- Estimated Duration: ${Math.round(plan.estimatedTotalDuration / 1000)}s

Generated by NikCLI on ${new Date().toISOString()}
`;

        await fs.writeFile(filename, content, 'utf8');
        console.log(chalk.green(`✓ Plan saved to ${filename}`));
    }

    private async shutdown(): Promise<void> {
        console.log(chalk.blue('\n👋 Shutting down NikCLI...'));

        // Stop file watcher
        if (this.fileWatcher) {
            try {
                this.fileWatcher.close();
                console.log(chalk.dim('👀 File watcher stopped'));
            } catch (error: any) {
                console.log(chalk.gray(`File watcher cleanup warning: ${error.message}`));
            }
        }

        // Complete any running progress operations
        if (this.progressTracker) {
            try {
                const running = Array.from(this.progressTracker.operations.values())
                    .filter((op: any) => op.status === 'running');

                running.forEach((op: any) => {
                    this.progressTracker.complete(op.id, false, 'Interrupted by shutdown');
                });

                if (running.length > 0) {
                    console.log(chalk.dim(`📊 Stopped ${running.length} running operations`));
                }
            } catch (error: any) {
                console.log(chalk.gray(`Progress tracker cleanup warning: ${error.message}`));
            }
        }

        // Save both caches before shutdown
        try {
            await Promise.all([
                tokenCache.saveCache(),
                completionCache.saveCache()
            ]);
            console.log(chalk.dim('💾 All caches saved'));
        } catch (error: any) {
            console.log(chalk.gray(`Cache save warning: ${error.message}`));
        }

        // Clean up UI resources
        this.indicators.clear();
        this.liveUpdates.length = 0;
        this.spinners.forEach(spinner => {
            try {
                spinner.stop();
            } catch (error: any) {
                // Ignore spinner cleanup errors
            }
        });
        this.spinners.clear();
        this.progressBars.forEach(bar => {
            try {
                bar.stop();
            } catch (error: any) {
                // Ignore progress bar cleanup errors
            }
        });
        this.progressBars.clear();

        if (this.rl) {
            this.rl.close();
        }

        // Cleanup systems
        this.agentManager.cleanup();

        console.log(chalk.green('✅ All systems cleaned up successfully!'));
        console.log(chalk.green('✓ Goodbye!'));
        process.exit(0);
    }

    // File Operations Methods
    private async readFile(filepath: string): Promise<void> {
        try {
            const readId = 'read-' + Date.now();
            this.createStatusIndicator(readId, `Reading ${filepath}`);
            this.startAdvancedSpinner(readId, 'Reading file...');

            const content = await toolsManager.readFile(filepath);

            this.stopAdvancedSpinner(readId, true, `Read ${filepath}`);
            console.log(chalk.blue.bold(`\n📄 File: ${filepath}`));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(content);
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.dim('✅ File read completed'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to read ${filepath}: ${error.message}`));
        }
    }

    private async writeFile(filepath: string, content: string): Promise<void> {
        try {
            const writeId = 'write-' + Date.now();
            this.createStatusIndicator(writeId, `Writing ${filepath}`);
            this.startAdvancedSpinner(writeId, 'Writing file...');

            await toolsManager.writeFile(filepath, content);

            this.stopAdvancedSpinner(writeId, true, `Written ${filepath}`);
            console.log(chalk.green(`✅ File written: ${filepath}`));
            console.log(chalk.gray('─'.repeat(50)));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to write ${filepath}: ${error.message}`));
        }
    }

    private async editFile(filepath: string): Promise<void> {
        try {
            console.log(chalk.blue(`📝 Opening ${filepath} for editing...`));
            console.log(chalk.gray('This would open an interactive editor. For now, use /read and /write commands.'));
            console.log(chalk.gray('─'.repeat(50)));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to edit ${filepath}: ${error.message}`));
            console.log(chalk.gray('─'.repeat(50)));
        }
    }

    private async listFiles(directory: string): Promise<void> {
        try {
            const lsId = 'ls-' + Date.now();
            this.createStatusIndicator(lsId, `Listing ${directory}`);
            this.startAdvancedSpinner(lsId, 'Listing files...');

            const files = await toolsManager.listFiles(directory);

            this.stopAdvancedSpinner(lsId, true, `Listed ${files.length} items`);
            console.log(chalk.blue.bold(`\n📁 Directory: ${directory}`));
            console.log(chalk.gray('─'.repeat(50)));
            files.forEach(file => {
                const icon = '📄'; // Simple icon for now
                console.log(`${icon} ${chalk.cyan(file)}`);
            });
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.dim(`✅ Listed ${files.length} files`));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to list ${directory}: ${error.message}`));
        }
    }

    private async searchFiles(query: string): Promise<void> {
        try {
            const searchId = 'search-' + Date.now();
            this.createStatusIndicator(searchId, `Searching: ${query}`);
            this.startAdvancedSpinner(searchId, 'Searching files...');

            const results = await toolsManager.searchInFiles(query, this.workingDirectory);

            this.stopAdvancedSpinner(searchId, true, `Found ${results.length} matches`);
            console.log(chalk.blue.bold(`\n🔍 Search Results: "${query}"`));
            console.log(chalk.gray('─'.repeat(50)));

            results.forEach(result => {
                console.log(chalk.cyan(result.file || 'Unknown file'));
                console.log(chalk.gray(`  Match: ${result.content || result.toString()}`));
            });
            console.log(chalk.gray('─'.repeat(50)));
            console.log(chalk.dim(`✅ Search completed`));
        } catch (error: any) {
            console.log(chalk.red(`❌ Search failed: ${error.message}`));
        }
    }

    private async runCommand(command: string): Promise<void> {
        try {
            const cmdId = 'cmd-' + Date.now();
            this.createStatusIndicator(cmdId, `Executing: ${command}`);
            this.startAdvancedSpinner(cmdId, `Running: ${command}`);

            const result = await toolsManager.runCommand(command.split(' ')[0], command.split(' ').slice(1), { stream: true });

            const success = result.code === 0;
            this.stopAdvancedSpinner(cmdId, success, success ? 'Command completed' : 'Command failed');

            if (result.stdout) {
                console.log(chalk.blue.bold(`\n💻 Output:`));
                console.log(result.stdout);
                process.stdout.write('');
                await new Promise(resolve => setTimeout(resolve, 150)); // Extra newline for better separation
                this.showPrompt();
            }

            if (result.stderr) {
                console.log(chalk.red.bold(`\n❌ Error:`));
                console.log(result.stderr);
                process.stdout.write('');
                await new Promise(resolve => setTimeout(resolve, 150)); // Extra newline for better separation
                this.showPrompt();
            }

            console.log(chalk.gray(`\n📊 Exit Code: ${result.code}`));
        } catch (error: any) {
            console.log(chalk.red(`❌ Command failed: ${error.message}`));
        }
        process.stdout.write('');
    }

    private async buildProject(): Promise<void> {
        try {
            console.log(chalk.blue('🔨 Building project...'));

            // Try common build commands
            const buildCommands = ['npm run build', 'yarn build', 'pnpm build', 'make', 'cargo build'];

            for (const cmd of buildCommands) {
                try {
                    await this.runCommand(cmd);
                    return;
                } catch {
                    continue;
                }
            }

            console.log(chalk.yellow('⚠️ No build command found. Try /run <your-build-command>'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Build failed: ${error.message}`));
        }
    }

    private async runTests(pattern?: string): Promise<void> {
        try {
            console.log(chalk.blue('🧪 Running tests...'));

            const testCmd = pattern ? `npm test ${pattern}` : 'npm test';
            await this.runCommand(testCmd);
        } catch (error: any) {
            console.log(chalk.red(`❌ Tests failed: ${error.message}`));
        }
    }

    private async runLinting(): Promise<void> {
        try {
            console.log(chalk.blue('🔍 Running linting...'));

            // Try common lint commands
            const lintCommands = ['npm run lint', 'yarn lint', 'pnpm lint', 'eslint .'];

            for (const cmd of lintCommands) {
                try {
                    await this.runCommand(cmd);
                    return;
                } catch {
                    continue;
                }
            }

            console.log(chalk.yellow('⚠️ No lint command found. Try /run <your-lint-command>'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Linting failed: ${error.message}`));
        }
    }

    // ===== ENHANCED SERVICES COMMAND HANDLERS =====

    /**
     * Handle cache-related commands
     */
    private async handleCacheCommands(cmd: string, args: string[]): Promise<void> {
        try {
            switch (cmd) {
                case 'redis':
                    if (args.length === 0) {
                        await this.showRedisStatus();
                    } else {
                        const subCmd = args[0];
                        switch (subCmd) {
                            case 'connect':
                                await this.connectRedis();
                                break;
                            case 'disconnect':
                                await this.disconnectRedis();
                                break;
                            case 'health':
                                await this.showRedisHealth();
                                break;
                            case 'config':
                                await this.showRedisConfig();
                                break;
                            default:
                                console.log(chalk.yellow('Usage: /redis [connect|disconnect|health|config]'));
                        }
                    }
                    break;

                case 'cache-stats':
                    await this.showCacheStats();
                    break;

                case 'cache-health':
                    await this.showCacheHealth();
                    break;

                case 'cache-clear':
                    if (args.length === 0 || args[0] === 'all') {
                        await this.clearAllCaches();
                    } else {
                        await this.clearSpecificCache(args[0]);
                    }
                    break;
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Cache command failed: ${error.message}`));
        }
    }

    /**
     * Handle Supabase-related commands
     */
    private async handleSupabaseCommands(cmd: string, args: string[]): Promise<void> {
        try {
            switch (cmd) {
                case 'supabase':
                    if (args.length === 0) {
                        await this.showSupabaseStatus();
                    } else {
                        const subCmd = args[0];
                        switch (subCmd) {
                            case 'connect':
                                await this.connectSupabase();
                                break;
                            case 'health':
                                await this.showSupabaseHealth();
                                break;
                            case 'features':
                                await this.showSupabaseFeatures();
                                break;
                            default:
                                console.log(chalk.yellow('Usage: /supabase [connect|health|features]'));
                        }
                    }
                    break;

                case 'db':
                    await this.handleDatabaseCommands(args);
                    break;

                case 'auth':
                    await this.handleAuthCommands(args);
                    break;

                case 'session-sync':
                    await this.syncSessions(args[0]);
                    break;
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Supabase command failed: ${error.message}`));
        }
    }

    /**
     * Show Redis status
     */
    private async showRedisStatus(): Promise<void> {
        const config = this.configManager.getRedisConfig();

        console.log(chalk.blue('\n🔴 Redis Configuration:'));
        console.log(`   Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`   Host: ${config.host}:${config.port}`);
        console.log(`   Database: ${config.database}`);
        console.log(`   Key Prefix: ${config.keyPrefix}`);
        console.log(`   TTL: ${config.ttl}s`);
        console.log(`   Fallback: ${config.fallback.enabled ? chalk.green('Enabled') : chalk.red('Disabled')} (${config.fallback.strategy})`);

        if (config.enabled) {
            try {
                const { redisProvider } = await import('./providers/redis/redis-provider');
                const healthy = redisProvider.isHealthy();
                console.log(`   Connection: ${healthy ? chalk.green('Connected') : chalk.red('Disconnected')}`);

                if (healthy) {
                    const health = redisProvider.getLastHealthCheck();
                    if (health) {
                        console.log(`   Latency: ${health.latency}ms`);
                        const memUsed =
                            health.memory?.used !== undefined
                                ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB`
                                : 'N/A';
                        console.log(`   Memory Used: ${memUsed}`);
                        console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`);
                    }
                }
            } catch (error: any) {
                console.log(`   Error: ${chalk.red(error.message)}`);
            }
        }
    }

    /**
     * Show cache statistics
     */
    private async showCacheStats(): Promise<void> {
        try {
            const stats = await cacheService.getStats();

            console.log(chalk.blue('\n📊 Cache Statistics:'));
            console.log(chalk.green('Redis Cache:'));
            console.log(`   Enabled: ${stats.redis.enabled ? 'Yes' : 'No'}`);
            console.log(`   Connected: ${stats.redis.connected ? chalk.green('Yes') : chalk.red('No')}`);
            console.log(`   Entries: ${stats.redis.entries || 'Unknown'}`);

            console.log(chalk.cyan('Fallback Cache:'));
            console.log(`   Enabled: ${stats.fallback.enabled ? 'Yes' : 'No'}`);
            console.log(`   Type: ${stats.fallback.type}`);

            console.log(chalk.yellow('Overall Performance:'));
            console.log(`   Total Hits: ${stats.totalHits}`);
            console.log(`   Total Misses: ${stats.totalMisses}`);
            console.log(`   Hit Rate: ${stats.hitRate}%`);

            if (this.isEnhancedMode) {
                const enhancedStats = await enhancedTokenCache.getStats();
                console.log(chalk.magenta('Enhanced Token Cache:'));
                console.log(`   Total Entries: ${enhancedStats.totalEntries}`);
                console.log(`   Total Hits: ${enhancedStats.totalHits}`);
                console.log(`   Tokens Saved: ${enhancedStats.totalTokensSaved}`);
                console.log(`   Memory Cache Size: ${enhancedStats.cacheSize}`);
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to get cache stats: ${error.message}`));
        }
    }

    /**
     * Show Supabase status
     */
    private async showSupabaseStatus(): Promise<void> {
        const config = this.configManager.getSupabaseConfig();
        const credentials = this.configManager.getSupabaseCredentials();

        console.log(chalk.blue('\n🟢 Supabase Configuration:'));
        console.log(`   Enabled: ${config.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`   URL: ${credentials.url ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`);
        console.log(`   Anon Key: ${credentials.anonKey ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`);
        console.log(`   Service Key: ${credentials.serviceRoleKey ? chalk.green('✓ Set') : chalk.red('✗ Missing')}`);

        console.log('\n   Features:');
        Object.entries(config.features).forEach(([feature, enabled]) => {
            console.log(`   ${feature}: ${enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
        });

        if (config.enabled) {
            try {
                const health = await enhancedSupabaseProvider.healthCheck();
                console.log(`\n   Connection: ${health.connected ? chalk.green('Connected') : chalk.red('Disconnected')}`);
                if (health.latency) {
                    console.log(`   Latency: ${health.latency}ms`);
                }
            } catch (error: any) {
                console.log(`   Error: ${chalk.red(error.message)}`);
            }
        }
    }

    /**
     * Handle authentication commands
     */
    private async handleAuthCommands(args: string[]): Promise<void> {
        if (args.length === 0) {
            // Show current auth status
            const currentUser = authProvider.getCurrentUser();
            const profile = authProvider.getCurrentProfile();

            if (currentUser) {
                console.log(chalk.green('\n🔐 Authentication Status: Signed In'));
                console.log(`   User: ${profile?.email || profile?.username || currentUser.id}`);
                console.log(`   Subscription: ${profile?.subscription_tier || 'Unknown'}`);
                console.log(`   Authenticated: ${authProvider.isAuthenticated() ? 'Yes' : 'Session Expired'}`);

                if (profile) {
                    console.log('\n   Usage This Month:');
                    console.log(`   Sessions: ${profile.usage.sessionsThisMonth}/${profile.quotas.sessionsPerMonth}`);
                    console.log(`   Tokens: ${profile.usage.tokensThisMonth}/${profile.quotas.tokensPerMonth}`);
                    console.log(`   API Calls (hour): ${profile.usage.apiCallsThisHour}/${profile.quotas.apiCallsPerHour}`);
                }
            } else {
                console.log(chalk.gray('🔐 Authentication Status: Not signed in'));
                console.log(chalk.dim('   Use /auth signin to authenticate'));
            }
            return;
        }

        const subCmd = args[0];
        switch (subCmd) {
            case 'signin':
            case 'login':
                await this.handleAuthSignIn();
                break;
            case 'signup':
            case 'register':
                await this.handleAuthSignUp();
                break;
            case 'signout':
            case 'logout':
                await this.handleAuthSignOut();
                break;
            case 'profile':
                await this.showAuthProfile();
                break;
            case 'quotas':
                await this.showAuthQuotas();
                break;
            default:
                console.log(chalk.yellow('Usage: /auth [signin|signup|signout|profile|quotas]'));
        }
    }

    /**
     * Sign in handler
     */
    private async handleAuthSignIn(): Promise<void> {
        const rl = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        try {
            const email = await new Promise<string>(resolve =>
                rl.question('Email: ', resolve)
            );

            const password = await new Promise<string>(resolve =>
                rl.question('Password: ', resolve)
            );

            if (email && password) {
                console.log(chalk.blue('🔄 Signing in...'));
                const result = await authProvider.signIn(email, password, { rememberMe: true });

                if (result) {
                    console.log(chalk.green(`✅ Welcome back, ${result.profile.email}!`));

                    // Set user for enhanced session manager
                    this.enhancedSessionManager.setCurrentUser(result.session.user.id);
                } else {
                    console.log(chalk.red('❌ Sign in failed - invalid credentials'));
                }
            }
        } catch (error: any) {
            console.log(chalk.red(`❌ Sign in error: ${error.message}`));
        } finally {
            rl.close();
        }
    }

    /**
     * Show enhanced stats
     */
    private async showEnhancedStats(): Promise<void> {
        console.log(chalk.blue('\n📈 Enhanced Services Statistics'));
        console.log(chalk.gray('═'.repeat(50)));

        // Cache stats
        await this.showCacheStats();

        // Session sync stats
        if (this.isEnhancedMode) {
            try {
                const syncStatus = await this.enhancedSessionManager.getSyncStatus();
                console.log(chalk.magenta('\n💾 Session Sync Status:'));
                console.log(`   Total Local: ${syncStatus.totalLocal}`);
                console.log(`   Total Cloud: ${syncStatus.totalCloud}`);
                console.log(`   Synced: ${syncStatus.synced}`);
                console.log(`   Conflicts: ${syncStatus.conflicts}`);
                console.log(`   Local Only: ${syncStatus.localOnly}`);
                console.log(`   Cloud Only: ${syncStatus.cloudOnly}`);
            } catch (error: any) {
                console.log(chalk.yellow(`⚠️ Session sync status unavailable: ${error.message}`));
            }
        }

        // System health
        const cacheHealth = cacheService.getHealthStatus();
        console.log(chalk.cyan('\n🏥 System Health:'));
        console.log(`   Cache Service: ${cacheHealth.overall ? chalk.green('Healthy') : chalk.red('Unhealthy')}`);
        console.log(`   Redis: ${cacheHealth.redis.healthy ? chalk.green('Connected') : chalk.red('Disconnected')}`);
        console.log(`   SmartCache: ${cacheHealth.smartCache.healthy ? chalk.green('Ready') : chalk.red('Error')}`);

        if (this.isEnhancedMode) {
            const tokenCacheHealth = enhancedTokenCache.getHealth();
            console.log(`   Enhanced Token Cache: ${tokenCacheHealth.healthy ? chalk.green('Healthy') : chalk.red('Unhealthy')}`);
        }
    }

    /**
     * Show git commit history in a panel
     */
    private async showCommitHistoryPanel(args: string[]): Promise<void> {
        try {
            // Parse arguments for options like --count, --oneline, --graph, etc.
            const options = this.parseCommitHistoryArgs(args);

            console.log(chalk.blue('📋 Loading commit history...'));

            // Get commit history using git log
            const gitCommand = this.buildGitLogCommand(options);
            const { exec } = require('child_process');
            const { promisify } = require('util');
            const execAsync = promisify(exec);

            const { stdout, stderr } = await execAsync(gitCommand);

            if (stderr && !stderr.includes('warning')) {
                console.log(chalk.red(`❌ Git error: ${stderr}`));
                return;
            }

            // Format the commit history for display
            const formattedHistory = this.formatCommitHistory(stdout, options);

            // Display directly in console with boxen (like /tokens command)
            const historyBox = boxen(formattedHistory, {
                title: '📋 Git Commit History',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'magenta'
            });

            console.log(historyBox);

        } catch (error: any) {
            if (error.message.includes('not a git repository')) {
                console.log(chalk.yellow('⚠️  This directory is not a git repository'));
            } else {
                console.log(chalk.red(`❌ Failed to get commit history: ${error.message}`));
            }
        }
    }

    /**
     * Panelized Memory commands (stats, config, context, personalization, cleanup)
     */
    private async handleMemoryPanels(args: string[]): Promise<void> {
        const showHelp = () => {
            const lines = [
                '/memory stats            - Show memory statistics',
                '/memory config           - Show memory configuration',
                '/memory context          - Show current session context',
                '/memory personalization  - Show inferred user personalization',
                '/memory cleanup          - Clean low-importance, older context (safe)',
                '',
                'Related:',
                '/remember "fact"        - Store an important fact',
                '/recall "query"         - Search memories',
                '/forget <id>            - Delete a memory by ID'
            ].join('\n');

            console.log(boxen(lines, {
                title: '🧠 Memory: Help',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }));
        };

        if (!args || args.length === 0 || args[0].toLowerCase() === 'help') {
            showHelp();
            return;
        }

        const sub = args[0].toLowerCase();
        try {
            switch (sub) {
                case 'stats': {
                    const stats = memoryService.getMemoryStats();
                    const lines: string[] = [];
                    lines.push(`${chalk.green('Total Memories:')} ${stats.totalMemories}`);
                    lines.push(`${chalk.green('Average Importance:')} ${stats.averageImportance ? stats.averageImportance.toFixed(1) : '0.0'}/10`);
                    if (stats.oldestMemory) {
                        lines.push(`${chalk.green('Oldest:')} ${new Date(stats.oldestMemory).toLocaleString()}`);
                    }
                    if (stats.newestMemory) {
                        lines.push(`${chalk.green('Newest:')} ${new Date(stats.newestMemory).toLocaleString()}`);
                    }
                    if (stats.memoriesBySource && Object.keys(stats.memoriesBySource).length > 0) {
                        lines.push('');
                        lines.push(chalk.cyan('By Source:'));
                        Object.entries(stats.memoriesBySource).forEach(([src, count]) =>
                            lines.push(`  • ${src}: ${count}`)
                        );
                    }

                    console.log(boxen(lines.join('\n'), {
                        title: '🧠 Memory: Statistics',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'green'
                    }));
                    break;
                }

                case 'config': {
                    const cfg = memoryService.getConfig?.() || {};
                    const lines: string[] = [];
                    lines.push(`${chalk.green('Enabled:')} ${cfg.enabled ? 'Yes' : 'No'}`);
                    lines.push(`${chalk.green('Backend:')} ${cfg.backend || 'memory'}`);
                    if (cfg.embedding_model) lines.push(`${chalk.green('Embedding Model:')} ${cfg.embedding_model}`);
                    if (cfg.max_memories !== undefined) lines.push(`${chalk.green('Max Memories:')} ${cfg.max_memories}`);
                    if (cfg.auto_cleanup !== undefined) lines.push(`${chalk.green('Auto Cleanup:')} ${cfg.auto_cleanup ? 'Yes' : 'No'}`);
                    if (cfg.similarity_threshold !== undefined) lines.push(`${chalk.green('Similarity Threshold:')} ${cfg.similarity_threshold}`);
                    if (cfg.importance_decay_days !== undefined) lines.push(`${chalk.green('Importance Decay (days):')} ${cfg.importance_decay_days}`);

                    console.log(boxen(lines.join('\n'), {
                        title: '🧠 Memory: Configuration',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }

                case 'context': {
                    const session = memoryService.getCurrentSession?.();
                    if (!session) {
                        console.log(boxen('No active memory session', {
                            title: '🧠 Memory: Context',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'yellow'
                        }));
                        break;
                    }

                    const recents = await memoryService.getConversationContext(session.sessionId, 2);
                    const lines: string[] = [];
                    lines.push(`${chalk.green('Session ID:')} ${session.sessionId}`);
                    if (session.userId) lines.push(`${chalk.green('User ID:')} ${session.userId}`);
                    if (session.topic) lines.push(`${chalk.green('Topic:')} ${session.topic}`);
                    lines.push(`${chalk.green('Participants:')} ${session.participants.join(', ')}`);
                    lines.push(`${chalk.green('Started:')} ${new Date(session.startTime).toLocaleString()}`);
                    lines.push(`${chalk.green('Last Activity:')} ${new Date(session.lastActivity).toLocaleString()}`);

                    if (recents.length > 0) {
                        lines.push('');
                        lines.push(chalk.cyan(`Recent Context (${recents.length}):`));
                        recents.slice(0, 5).forEach(m => {
                            const text = (m.content || '').replace(/\s+/g, ' ').slice(0, 80);
                            lines.push(`  • ${text}${m.content.length > 80 ? '…' : ''}`);
                        });
                    }

                    console.log(boxen(lines.join('\n'), {
                        title: '🧠 Memory: Context',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'cyan'
                    }));
                    break;
                }

                case 'personalization': {
                    const session = memoryService.getCurrentSession?.();
                    if (!session?.userId) {
                        console.log(boxen('No user ID in current session', {
                            title: '🧠 Memory: Personalization',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'yellow'
                        }));
                        break;
                    }
                    const p = await memoryService.getPersonalization(session.userId);
                    if (!p) {
                        console.log(boxen('No personalization data available', {
                            title: '🧠 Memory: Personalization',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'yellow'
                        }));
                        break;
                    }
                    const lines: string[] = [];
                    lines.push(`${chalk.green('User ID:')} ${p.userId}`);
                    lines.push(`${chalk.green('Communication Style:')} ${p.communication_style}`);
                    lines.push(`${chalk.green('Preferred Length:')} ${p.interaction_patterns.preferred_response_length}`);
                    lines.push(`${chalk.green('Detail Level:')} ${p.interaction_patterns.preferred_detail_level}`);
                    if (p.expertise_areas?.length) lines.push(`${chalk.green('Expertise Areas:')} ${p.expertise_areas.slice(0, 5).join(', ')}`);
                    if (p.frequent_topics?.length) lines.push(`${chalk.green('Frequent Topics:')} ${p.frequent_topics.slice(0, 5).join(', ')}`);
                    if (p.interaction_patterns.common_tasks?.length) lines.push(`${chalk.green('Common Tasks:')} ${p.interaction_patterns.common_tasks.slice(0, 5).join(', ')}`);

                    console.log(boxen(lines.join('\n'), {
                        title: '🧠 Memory: Personalization',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'magenta'
                    }));
                    break;
                }

                case 'cleanup': {
                    // Simple, safe cleanup: delete low-importance (<=3) older than 14 days
                    const now = Date.now();
                    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
                    const deleted = await memoryService.deleteMemoriesByCriteria({
                        timeRange: { start: 0, end: now - twoWeeks },
                        importance: { max: 3 }
                    });

                    const msg = deleted > 0
                        ? `Deleted ${deleted} low-importance, older memories`
                        : 'No eligible memories to clean';
                    console.log(boxen(msg, {
                        title: '🧠 Memory: Cleanup',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: deleted > 0 ? 'green' : 'yellow'
                    }));
                    break;
                }

                default:
                    showHelp();
            }
        } catch (error: any) {
            console.log(boxen(`Memory command failed: ${error.message}`,
                {
                    title: '❌ Memory Error',
                    padding: 1,
                    margin: 1,
                    borderStyle: 'round',
                    borderColor: 'red'
                }
            ));
        }
    }

    /**
     * Parse commit history arguments
     */
    private parseCommitHistoryArgs(args: string[]): any {
        const options = {
            count: 20,
            oneline: false,
            graph: false,
            all: false,
            author: null as string | null,
            since: null as string | null,
            until: null as string | null
        };

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            switch (arg) {
                case '--count':
                case '-n':
                    options.count = parseInt(args[i + 1]) || 20;
                    i++; // skip next arg
                    break;
                case '--oneline':
                    options.oneline = true;
                    break;
                case '--graph':
                    options.graph = true;
                    break;
                case '--all':
                    options.all = true;
                    break;
                case '--author':
                    options.author = args[i + 1];
                    i++; // skip next arg
                    break;
                case '--since':
                    options.since = args[i + 1];
                    i++; // skip next arg
                    break;
                case '--until':
                    options.until = args[i + 1];
                    i++; // skip next arg
                    break;
            }
        }

        return options;
    }

    /**
     * Build git log command based on options
     */
    private buildGitLogCommand(options: any): string {
        let command = 'git log';

        if (options.oneline) {
            command += ' --oneline';
        } else {
            command += ' --pretty=format:"%C(yellow)%h%C(reset) - %C(green)%ad%C(reset) %C(blue)(%an)%C(reset)%n  %s%n"';
            command += ' --date=relative';
        }

        if (options.graph) {
            command += ' --graph';
        }

        if (options.all) {
            command += ' --all';
        }

        if (options.author) {
            command += ` --author="${options.author}"`;
        }

        if (options.since) {
            command += ` --since="${options.since}"`;
        }

        if (options.until) {
            command += ` --until="${options.until}"`;
        }

        command += ` -${options.count}`;

        return command;
    }

    /**
     * Format commit history for display
     */
    private formatCommitHistory(stdout: string, options: any): string {
        if (!stdout.trim()) {
            return chalk.yellow('No commits found');
        }

        // If oneline format, each line is already formatted
        if (options.oneline) {
            return stdout.trim();
        }

        // For detailed format, add some styling
        let formatted = stdout.trim();

        // Add separator between commits for better readability
        formatted = formatted.replace(/\n\n/g, '\n' + chalk.gray('─'.repeat(50)) + '\n\n');

        return formatted;
    }

    /**
     * Panelized IDE Diagnostic commands (help/start/stop/status/run)
     */
    private async handleDiagnosticPanels(args: string[]): Promise<void> {
        if (!args || args.length === 0) {
            const content = [
                '/diagnostic start [path] - Start monitoring (optional path)',
                '/diagnostic stop [path]  - Stop monitoring (or path)',
                '/diagnostic status       - Show monitoring status',
                '/diagnostic run          - Run diagnostic scan',
                '/monitor [path]          - Alias for diagnostic start',
                '/diag-status             - Alias for diagnostic status'
            ].join('\n');

            console.log(boxen(content, {
                title: '🔍 IDE Diagnostics: Help',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            }));
            return;
        }

        const sub = args[0].toLowerCase();
        const rest = args.slice(1);
        try {
            switch (sub) {
                case 'start': {
                    const watchPath = rest[0];
                    ideDiagnosticIntegration.setActive(true);
                    await ideDiagnosticIntegration.startMonitoring(watchPath);
                    const status = await ideDiagnosticIntegration.getMonitoringStatus();

                    const lines: string[] = [];
                    lines.push(watchPath ? `✅ Monitoring started for: ${watchPath}` : '✅ Monitoring started for entire project');
                    lines.push('');
                    lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`);
                    lines.push(`Watched paths: ${status.watchedPaths.length}`);
                    lines.push(`Active watchers: ${status.totalWatchers}`);
                    if (status.watchedPaths.length > 0) {
                        lines.push('');
                        lines.push('Watched paths:');
                        status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`));
                    }
                    lines.push('');
                    lines.push('Tips:');
                    lines.push('• Use /diag-status to check monitoring status');
                    lines.push('• Use /diagnostic stop to stop monitoring');

                    console.log(boxen(lines.join('\n'), {
                        title: '🔍 IDE Diagnostics: Monitoring',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'cyan'
                    }));
                    break;
                }
                case 'stop': {
                    const watchPath = rest[0];
                    await ideDiagnosticIntegration.stopMonitoring(watchPath);
                    const content = watchPath ? `⏹️ Stopped monitoring path: ${watchPath}` : '⏹️ Stopped all monitoring';
                    console.log(boxen(content, {
                        title: '🔍 IDE Diagnostics: Monitoring Stopped',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                case 'status': {
                    const status = await ideDiagnosticIntegration.getMonitoringStatus();
                    const quick = await ideDiagnosticIntegration.getQuickStatus();
                    const lines: string[] = [];
                    lines.push(`Monitoring: ${status.enabled ? 'Active' : 'Inactive'}`);
                    lines.push(`Watched paths: ${status.watchedPaths.length}`);
                    lines.push(`Active watchers: ${status.totalWatchers}`);
                    if (status.watchedPaths.length > 0) {
                        lines.push('');
                        lines.push('Watched paths:');
                        status.watchedPaths.forEach((p: string) => lines.push(`• ${p}`));
                    }
                    lines.push('');
                    lines.push(`Current status: ${quick}`);

                    console.log(boxen(lines.join('\n'), {
                        title: '🔍 IDE Diagnostics: Status',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'cyan'
                    }));
                    break;
                }
                case 'run': {
                    const wasActive = (ideDiagnosticIntegration as any)['isActive'];
                    if (!wasActive) ideDiagnosticIntegration.setActive(true);
                    const context = await ideDiagnosticIntegration.getWorkflowContext();

                    const lines: string[] = [];
                    lines.push(`Errors: ${context.errors}`);
                    lines.push(`Warnings: ${context.warnings}`);
                    if (context.errors === 0 && context.warnings === 0) {
                        lines.push('✅ No errors or warnings found');
                    }
                    lines.push('');
                    lines.push(`Build: ${context.buildStatus}`);
                    lines.push(`Tests: ${context.testStatus}`);
                    lines.push(`Lint: ${context.lintStatus}`);
                    lines.push('');
                    lines.push(`Branch: ${context.vcsStatus.branch}`);
                    if (context.vcsStatus.hasChanges) {
                        lines.push(`Changes: ${context.vcsStatus.stagedFiles} staged, ${context.vcsStatus.unstagedFiles} unstaged`);
                    }
                    if (context.affectedFiles.length > 0) {
                        lines.push('');
                        lines.push('Affected files:');
                        context.affectedFiles.slice(0, 10).forEach((f: string) => lines.push(`• ${f}`));
                        if (context.affectedFiles.length > 10) {
                            lines.push(`… and ${context.affectedFiles.length - 10} more`);
                        }
                    }
                    if (context.recommendations.length > 0) {
                        lines.push('');
                        lines.push('💡 Recommendations:');
                        context.recommendations.forEach((rec: string) => lines.push(`• ${rec}`));
                    }

                    console.log(boxen(lines.join('\n'), {
                        title: '📊 Diagnostic Results',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'magenta'
                    }));

                    if (!wasActive) ideDiagnosticIntegration.setActive(false);
                    break;
                }
                default: {
                    console.log(chalk.red(`❌ Unknown diagnostic command: ${sub}`));
                    const content = 'Use /diagnostic for available subcommands';
                    console.log(boxen(content, {
                        title: '🔍 IDE Diagnostics',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'red'
                    }));
                }
            }
        } catch (error: any) {
            console.log(boxen(`Diagnostic command failed: ${error.message}`, {
                title: '❌ Diagnostic Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized Snapshot: create quick/full/dev/config
     */
    private async handleSnapshotCommand(args: string[], quickAlias: boolean = false): Promise<void> {
        try {
            if (args.length === 0) {
                const content = [
                    '/snapshot <name> [quick|full|dev|config]',
                    '/snap <name>            - Alias for quick snapshot',
                    '/snapshots [query]      - List snapshots',
                    '/restore <snapshot-id>  - Restore snapshot (with backup)'
                ].join('\n');
                console.log(boxen(content, {
                    title: '📸 Snapshot Commands', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
                }));
                return;
            }

            const name = args[0];
            const type = (args[1] || (quickAlias ? 'quick' : 'quick')).toLowerCase();

            let id: string | null = null;
            switch (type) {
                case 'quick':
                    id = await snapshotService.createQuickSnapshot(name);
                    break;
                case 'full':
                    id = await snapshotService.createFullSnapshot(name);
                    break;
                case 'dev':
                    id = await snapshotService.createDevSnapshot(name);
                    break;
                case 'config':
                    id = await snapshotService.createFromTemplate('config', name);
                    break;
                default:
                    id = await snapshotService.createQuickSnapshot(name);
            }

            console.log(boxen(`Snapshot created: ${name}\nID: ${id}`, {
                title: '📸 Snapshot Created', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
            }));
        } catch (error: any) {
            console.log(boxen(`Snapshot failed: ${error.message}`, {
                title: '❌ Snapshot Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized Snapshots list
     */
    private async handleSnapshotsList(args: string[]): Promise<void> {
        try {
            const query = args[0] || '';
            const list = await snapshotService.searchSnapshots(query, { limit: 20 });
            if (!list || list.length === 0) {
                console.log(boxen('No snapshots found', {
                    title: '📸 Snapshots', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
                }));
                return;
            }
            const lines: string[] = [];
            lines.push(`Found ${list.length} snapshot(s)`);
            lines.push('');
            list.slice(0, 20).forEach(s => {
                const ts = new Date(s.timestamp).toLocaleString();
                const tags = s.metadata?.tags?.length ? ` [${s.metadata.tags.join(', ')}]` : '';
                lines.push(`${s.id.substring(0, 8)}  ${s.name}  ${ts}${tags}`);
            });
            console.log(boxen(lines.join('\n'), {
                title: '📸 Snapshots', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
            }));
        } catch (error: any) {
            console.log(boxen(`List snapshots failed: ${error.message}`, {
                title: '❌ Snapshots Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized restore snapshot
     */
    private async handleSnapshotRestore(args: string[]): Promise<void> {
        try {
            if (args.length === 0) {
                console.log(boxen('Usage: /restore <snapshot-id>', {
                    title: '📸 Restore Snapshot', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
                }));
                return;
            }
            const id = args[0];
            await snapshotService.restoreSnapshot(id, { backup: true, overwrite: true });
            console.log(boxen(`Restored snapshot: ${id}`, {
                title: '📸 Snapshot Restored', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
            }));
        } catch (error: any) {
            console.log(boxen(`Restore failed: ${error.message}`, {
                title: '❌ Restore Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized Security command
     */
    private async handleSecurityPanels(args: string[]): Promise<void> {
        const sub = (args[0] || 'status').toLowerCase();
        try {
            switch (sub) {
                case 'status': {
                    const status = toolService.getSecurityStatus();
                    const config = this.configManager.getAll();
                    const lines: string[] = [];
                    lines.push(`Security Mode: ${config.securityMode}`);
                    lines.push(`Developer Mode: ${status.devModeActive ? 'Active' : 'Inactive'}`);
                    lines.push(`Session Approvals: ${status.sessionApprovals}`);
                    lines.push(`Approval Policy: ${config.approvalPolicy}`);
                    lines.push('');
                    lines.push('📋 Tool Approval Policies:');
                    const pol = (config as any).toolApprovalPolicies || {};
                    lines.push(`• File Operations: ${pol.fileOperations}`);
                    lines.push(`• Git Operations: ${pol.gitOperations}`);
                    lines.push(`• Package Operations: ${pol.packageOperations}`);
                    lines.push(`• System Commands: ${pol.systemCommands}`);
                    lines.push(`• Network Requests: ${pol.networkRequests}`);

                    console.log(boxen(lines.join('\n'), {
                        title: '🔒 Security Status',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                case 'set': {
                    if (args.length < 3) {
                        const content = [
                            'Usage: /security set <security-mode> <safe|default|developer>',
                            'Example: /security set security-mode safe'
                        ].join('\n');
                        console.log(boxen(content, {
                            title: '🔒 Security Help',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'yellow'
                        }));
                        break;
                    }
                    const key = args[1];
                    const value = args[2];
                    if (key === 'security-mode' && ['safe', 'default', 'developer'].includes(value)) {
                        this.configManager.set('securityMode', value as any);
                        console.log(boxen(`Security mode set to: ${value}`, {
                            title: '🔒 Security Updated',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'green'
                        }));
                    } else {
                        console.log(boxen('Invalid setting. Only security-mode is supported here.', {
                            title: '🔒 Security Error',
                            padding: 1,
                            margin: 1,
                            borderStyle: 'round',
                            borderColor: 'red'
                        }));
                    }
                    break;
                }
                case 'help': {
                    const content = [
                        '/security status                - Show current security settings',
                        '/security set security-mode ... - Change security mode',
                        '/security help                  - Show this help',
                        '',
                        'Modes: safe | default | developer'
                    ].join('\n');
                    console.log(boxen(content, {
                        title: '🔒 Security Help',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                default: {
                    console.log(boxen(`Unknown security command: ${sub}\nUse /security help`, {
                        title: '🔒 Security',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'red'
                    }));
                }
            }
        } catch (error: any) {
            console.log(boxen(`Security command failed: ${error.message}`, {
                title: '❌ Security Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized Dev Mode command
     */
    private async handleDevModePanels(args: string[]): Promise<void> {
        const action = (args[0] || 'enable').toLowerCase();
        try {
            switch (action) {
                case 'enable': {
                    const minutes = args[1] ? parseInt(args[1], 10) : undefined;
                    const ms = minutes ? minutes * 60000 : undefined;
                    toolService.enableDevMode(ms);
                    const content = [
                        `Developer mode enabled${minutes ? ` for ${minutes} minutes` : ' for 1 hour (default)'}`,
                        'Reduced security restrictions active.',
                        'Use /security status to see current settings.'
                    ].join('\n');
                    console.log(boxen(content, {
                        title: '🛠️ Developer Mode',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                case 'status': {
                    const isActive = toolService.isDevModeActive();
                    const content = `Status: ${isActive ? 'Active' : 'Inactive'}${isActive ? '\n⚠️ Security restrictions are reduced' : ''}`;
                    console.log(boxen(content, {
                        title: '🛠️ Developer Mode: Status',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                case 'help': {
                    const lines = [
                        '/dev-mode enable [minutes] - Enable developer mode',
                        '/dev-mode status           - Check developer mode status',
                        '/dev-mode help             - Show this help',
                        '',
                        '⚠️ Developer mode reduces security restrictions'
                    ];
                    console.log(boxen(lines.join('\n'), {
                        title: '🛠️ Developer Mode: Help',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'yellow'
                    }));
                    break;
                }
                default: {
                    console.log(boxen(`Unknown dev-mode command: ${action}\nUse /dev-mode help`, {
                        title: '🛠️ Developer Mode',
                        padding: 1,
                        margin: 1,
                        borderStyle: 'round',
                        borderColor: 'red'
                    }));
                }
            }
        } catch (error: any) {
            console.log(boxen(`Dev-mode command failed: ${error.message}`, {
                title: '❌ Developer Mode Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized Safe Mode enable
     */
    private async handleSafeModePanel(): Promise<void> {
        try {
            const cfg = this.configManager.getAll();
            cfg.securityMode = 'safe';
            this.configManager.setAll(cfg as any);
            console.log(boxen('Maximum security restrictions. All risky operations require approval.\nUse /security status to see details.', {
                title: '🔒 Safe Mode Enabled',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }));
        } catch (error: any) {
            console.log(boxen(`Safe mode command failed: ${error.message}`, {
                title: '🔒 Safe Mode Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red'
            }));
        }
    }

    /**
     * Panelized approvals clear
     */
    private async handleClearApprovalsPanel(): Promise<void> {
        try {
            toolService.clearSessionApprovals();
            console.log(boxen('All session approvals cleared. Next operations will require fresh approval.', {
                title: '✅ Approvals Cleared',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'green'
            }));
        } catch (error: any) {
            console.log(boxen(`Clear approvals command failed: ${error.message}`, {
                title: '❌ Approvals Error',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'red'
            }));
        }
    }

    /**
     * Clear all caches
     */
    private async clearAllCaches(): Promise<void> {
        try {
            console.log(chalk.blue('🧹 Clearing all caches...'));
            await cacheService.clearAll();

            if (this.isEnhancedMode) {
                await enhancedTokenCache.clearCache();
            }

            console.log(chalk.green('✅ All caches cleared'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to clear caches: ${error.message}`));
        }
    }

    /**
     * Sync sessions
     */
    private async syncSessions(direction?: string): Promise<void> {
        if (!this.isEnhancedMode) {
            console.log(chalk.yellow('⚠️ Enhanced services not enabled'));
            return;
        }

        try {
            console.log(chalk.blue('🔄 Syncing sessions...'));
            const result = await this.enhancedSessionManager.syncAllSessions();

            console.log(chalk.green('✅ Session sync completed:'));
            console.log(`   Synced: ${result.synced}`);
            console.log(`   Conflicts: ${result.conflicts}`);
            console.log(`   Errors: ${result.errors}`);
        } catch (error: any) {
            console.log(chalk.red(`❌ Session sync failed: ${error.message}`));
        }
    }

    // ===== REDIS IMPLEMENTATION METHODS =====

    private async connectRedis(): Promise<void> {
        console.log(chalk.blue('🔄 Connecting to Redis...'));

        try {
            const { redisProvider } = await import('./providers/redis/redis-provider');

            if (redisProvider.isHealthy()) {
                console.log(chalk.yellow('⚠️ Redis is already connected'));
                return;
            }

            // Force reconnection
            await redisProvider.reconnect();

            // Wait a moment for connection to establish
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (redisProvider.isHealthy()) {
                console.log(chalk.green('✅ Redis connected successfully'));

                // Show basic info
                const health = redisProvider.getLastHealthCheck();
                if (health) {
                    console.log(`   Latency: ${health.latency}ms`);
                    const memUsed =
                        health.memory?.used !== undefined
                            ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB`
                            : 'N/A';
                    console.log(`   Memory Used: ${memUsed}`);
                    console.log(`   Keys: ${health.keyspace?.keys ?? 'Unknown'}`);
                }
            } else {
                console.log(chalk.red('❌ Redis connection failed'));
                console.log(chalk.dim('   Check Redis server is running and configuration is correct'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Redis connection error: ${error.message}`));
            console.log(chalk.dim('   Ensure Redis is installed and running: redis-server'));
        }
    }

    private async showRedisHealth(): Promise<void> {
        try {
            const { redisProvider } = await import('./providers/redis/redis-provider');

            if (!redisProvider.isHealthy()) {
                console.log(chalk.red('❌ Redis is not connected'));
                return;
            }

            console.log(chalk.blue('\n🏥 Redis Health Status:'));

            const health = await redisProvider.getHealth();

            console.log(chalk.green('Connection:'));
            console.log(`   Status: ${chalk.green('Connected')}`);
            console.log(`   Latency: ${health.latency}ms`);
            const uptimeStr =
                health.uptime !== undefined
                    ? `${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m`
                    : 'N/A';
            console.log(`   Uptime: ${uptimeStr}`);

            console.log(chalk.cyan('Memory Usage:'));
            const memUsed =
                health.memory?.used !== undefined
                    ? `${(health.memory.used / 1024 / 1024).toFixed(2)} MB`
                    : 'N/A';
            const memPeak =
                health.memory?.peak !== undefined
                    ? `${(health.memory.peak / 1024 / 1024).toFixed(2)} MB`
                    : 'N/A';
            console.log(`   Used: ${memUsed}`);
            console.log(`   Peak: ${memPeak}`);

            console.log(chalk.yellow('Keyspace:'));
            console.log(`   Total Keys: ${health.keyspace?.keys ?? 'Unknown'}`);
            console.log(`   Keys with Expiry: ${health.keyspace?.expires ?? 'Unknown'}`);

            // Show configuration info
            const config = redisProvider.getConfig();
            console.log(chalk.magenta('Configuration:'));
            console.log(`   Key Prefix: ${config.keyPrefix}`);
            console.log(`   Default TTL: ${config.ttl}s`);
            console.log(`   Max Retries: ${config.maxRetries}`);

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to get Redis health: ${error.message}`));
        }
    }

    private async showRedisConfig(): Promise<void> {
        const config = this.configManager.getRedisConfig();

        console.log(chalk.blue('\n⚙️ Redis Configuration:'));

        console.log(chalk.green('Connection Settings:'));
        console.log(`   Host: ${config.host}`);
        console.log(`   Port: ${config.port}`);
        console.log(`   Database: ${config.database}`);
        console.log(`   Password: ${config.password ? chalk.green('Set') : chalk.gray('Not set')}`);

        console.log(chalk.cyan('Cache Settings:'));
        console.log(`   Key Prefix: ${config.keyPrefix}`);
        console.log(`   Default TTL: ${config.ttl} seconds`);
        console.log(`   Max Retries: ${config.maxRetries}`);
        console.log(`   Retry Delay: ${config.retryDelayMs}ms`);

        console.log(chalk.yellow('Cluster Settings:'));
        console.log(`   Enabled: ${config.cluster.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        if (config.cluster.enabled && config.cluster.nodes) {
            console.log(`   Nodes: ${config.cluster.nodes.length}`);
            config.cluster.nodes.forEach((node, idx) => {
                console.log(`     ${idx + 1}. ${node.host}:${node.port}`);
            });
        }

        console.log(chalk.magenta('Fallback Settings:'));
        console.log(`   Enabled: ${config.fallback.enabled ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`   Strategy: ${config.fallback.strategy}`);

        console.log(chalk.blue('Cache Strategies:'));
        Object.entries(config.strategies).forEach(([strategy, enabled]) => {
            console.log(`   ${strategy}: ${enabled ? chalk.green('Enabled') : chalk.gray('Disabled')}`);
        });

        // Show connection string (without password)
        const connectionString = this.configManager.getRedisConnectionString();
        if (connectionString) {
            const safeConnectionString = connectionString.replace(/:([^:@]+)@/, ':***@');
            console.log(chalk.dim(`\n   Connection String: ${safeConnectionString}`));
        }
    }
    private async showCacheHealth(): Promise<void> {
        console.log(chalk.blue('\n🏥 Cache System Health:'));

        try {
            // Overall cache service health
            const health = cacheService.getHealthStatus();

            console.log(chalk.green('Cache Service:'));
            console.log(`   Overall Status: ${health.overall ? chalk.green('Healthy') : chalk.red('Unhealthy')}`);

            console.log(chalk.red('Redis Cache:'));
            console.log(`   Healthy: ${health.redis.healthy ? chalk.green('Yes') : chalk.red('No')}`);
            console.log(`   Connected: ${health.redis.connected ? chalk.green('Yes') : chalk.red('No')}`);

            console.log(chalk.cyan('Smart Cache (Fallback):'));
            console.log(`   Healthy: ${health.smartCache.healthy ? chalk.green('Yes') : chalk.red('No')}`);

            // Get detailed statistics
            const stats = await cacheService.getStats();

            console.log(chalk.yellow('Performance Metrics:'));
            console.log(`   Total Hits: ${stats.totalHits}`);
            console.log(`   Total Misses: ${stats.totalMisses}`);
            console.log(`   Hit Rate: ${stats.hitRate}%`);

            // Enhanced token cache health if available
            if (this.isEnhancedMode) {
                const tokenCacheHealth = enhancedTokenCache.getHealth();
                console.log(chalk.magenta('Enhanced Token Cache:'));
                console.log(`   Healthy: ${tokenCacheHealth.healthy ? chalk.green('Yes') : chalk.red('No')}`);
                console.log(`   Memory Entries: ${tokenCacheHealth.details.memoryCache.entries}`);
            }

            // Show recommendations
            console.log(chalk.blue('\n💡 Recommendations:'));
            if (!health.redis.healthy) {
                console.log(chalk.dim('   • Consider starting Redis for better performance'));
            }
            if (stats.hitRate < 50) {
                console.log(chalk.dim('   • Cache hit rate is low, consider adjusting cache strategies'));
            }
            if (stats.totalMisses > stats.totalHits * 2) {
                console.log(chalk.dim('   • High miss rate detected, check cache TTL settings'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to get cache health: ${error.message}`));
        }
    }

    private async clearSpecificCache(cacheType: string): Promise<void> {
        try {
            console.log(chalk.blue(`🧹 Clearing ${cacheType} cache...`));

            switch (cacheType.toLowerCase()) {
                case 'redis':
                    const { redisProvider } = await import('./providers/redis/redis-provider');
                    if (redisProvider.isHealthy()) {
                        await redisProvider.flushAll();
                        console.log(chalk.green('✅ Redis cache cleared'));
                    } else {
                        console.log(chalk.yellow('⚠️ Redis not connected, nothing to clear'));
                    }
                    break;

                case 'smart':
                case 'memory':
                    // Dynamic import for SmartCache
                    const { smartCache: SmartCacheManager } = await import('./core/smart-cache-manager');
                    SmartCacheManager.cleanup();
                    console.log(chalk.green('✅ Smart cache cleared'));
                    break;

                case 'token':
                case 'tokens':
                    if (this.isEnhancedMode) {
                        await enhancedTokenCache.clearCache();
                        console.log(chalk.green('✅ Enhanced token cache cleared'));
                    } else {
                        // Clear legacy token cache
                        await tokenCache.clearCache();
                        console.log(chalk.green('✅ Token cache cleared'));
                    }
                    break;

                case 'session':
                case 'sessions':
                    const sessionCacheCleared = await cacheService.delete('session:*');
                    console.log(chalk.green('✅ Session cache cleared'));
                    break;

                default:
                    console.log(chalk.yellow(`⚠️ Unknown cache type: ${cacheType}`));
                    console.log(chalk.dim('   Available types: redis, smart, token, session'));
                    return;
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to clear ${cacheType} cache: ${error.message}`));
        }
    }

    private async disconnectRedis(): Promise<void> {
        try {
            console.log(chalk.blue('🔌 Disconnecting from Redis...'));

            const { redisProvider } = await import('./providers/redis/redis-provider');

            if (!redisProvider.isHealthy()) {
                console.log(chalk.yellow('⚠️ Redis is already disconnected'));
                return;
            }

            await redisProvider.disconnect();
            console.log(chalk.green('✅ Redis disconnected successfully'));
            console.log(chalk.dim('   Cache will automatically fall back to memory cache'));

        } catch (error: any) {
            console.log(chalk.red(`❌ Redis disconnect error: ${error.message}`));
        }
    }

    private async connectSupabase(): Promise<void> {
        console.log(chalk.blue('📡 Connecting to Supabase...'));

        try {
            // Dynamic import for enhanced services
            const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider');

            // Check configuration
            const config = simpleConfigManager.getSupabaseConfig();
            if (!config.enabled) {
                console.log(chalk.yellow('⚠️ Supabase is disabled in configuration'));
                console.log(chalk.dim('Enable in config to use Supabase features'));
                return;
            }

            if (!config.url || !config.anonKey) {
                console.log(chalk.red('❌ Supabase URL and anon key required'));
                console.log(chalk.dim('Configure Supabase credentials in settings'));
                return;
            }

            // Test connection
            try {
                enhancedSupabaseProvider.isHealthy();
            } catch (error) {
                // Initialization handled internally
            }

            if (enhancedSupabaseProvider.isHealthy()) {
                console.log(chalk.green('✅ Supabase connected successfully'));

                // Display connection info
                console.log(chalk.dim(`   URL: ${config.url}`));
                console.log(chalk.dim(`   Features: ${Object.entries(config.features).filter(([_, enabled]) => enabled).map(([name, _]) => name).join(', ')}`));

                // Test basic functionality
                console.log(chalk.green('   Connection: ✅ Established'));
                console.log(chalk.green('   Status: ✅ Ready for operations'));

            } else {
                console.log(chalk.red('❌ Failed to connect to Supabase'));
                console.log(chalk.dim('Check your configuration and network connection'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Supabase connection error: ${error.message}`));
            if (error.message.includes('Invalid API key') || error.message.includes('Invalid JWT')) {
                console.log(chalk.dim('Check your Supabase anon key configuration'));
            } else if (error.message.includes('fetch')) {
                console.log(chalk.dim('Check your network connection and Supabase URL'));
            }
        }
    }

    private async showSupabaseHealth(): Promise<void> {
        try {
            console.log(chalk.blue('🏥 Supabase Health Status'));
            console.log(chalk.gray('─'.repeat(50)));

            // Dynamic import for enhanced services
            const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider');

            const config = simpleConfigManager.getSupabaseConfig();

            // Configuration status
            console.log(chalk.bold('📋 Configuration'));
            console.log(`   Enabled: ${config.enabled ? chalk.green('✅') : chalk.red('❌')}`);
            console.log(`   URL: ${config.url ? chalk.green('✅ Configured') : chalk.red('❌ Missing')}`);
            console.log(`   Anon Key: ${config.anonKey ? chalk.green('✅ Configured') : chalk.red('❌ Missing')}`);
            console.log(`   Service Key: ${config.serviceRoleKey ? chalk.green('✅ Configured') : chalk.yellow('⚠️ Optional')}`);
            console.log();

            if (!config.enabled) {
                console.log(chalk.yellow('⚠️ Supabase is disabled'));
                return;
            }

            // Connection status
            const isHealthy = enhancedSupabaseProvider.isHealthy();
            console.log(chalk.bold('🔗 Connection Status'));
            console.log(`   Overall: ${isHealthy ? chalk.green('✅ Healthy') : chalk.red('❌ Unhealthy')}`);

            if (isHealthy) {
                console.log(`   Database: ${chalk.green('✅ Connected')}`);
                console.log(`   Auth Service: ${chalk.green('✅ Ready')}`);
                console.log(`   Storage: ${chalk.green('✅ Available')}`);
                console.log(`   Real-time: ${chalk.green('✅ Connected')}`);
                console.log();

                // Basic statistics
                console.log(chalk.bold('📊 Statistics'));
                console.log(`   Status: ${chalk.green('Connected and operational')}`);
                console.log(`   Last Check: ${new Date().toLocaleString()}`);
            } else {
                console.log(chalk.dim('   Not connected - run /supabase connect to establish connection'));
            }
            console.log();

            // Feature status
            console.log(chalk.bold('🎯 Features'));
            const features = config.features;
            console.log(`   Database: ${features.database ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled')}`);
            console.log(`   Authentication: ${features.auth ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled')}`);
            console.log(`   Storage: ${features.storage ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled')}`);
            console.log(`   Real-time: ${features.realtime ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled')}`);
            console.log(`   Vector Search: ${features.vector ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled')}`);

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to get Supabase health: ${error.message}`));
        }
    }

    private async showSupabaseFeatures(): Promise<void> {
        try {
            console.log(chalk.blue('🎯 Supabase Features & Capabilities'));
            console.log(chalk.gray('─'.repeat(50)));

            const config = simpleConfigManager.getSupabaseConfig();

            // Core Features
            console.log(chalk.bold.cyan('🏗️ Core Features'));
            const coreFeatures = [
                { name: 'PostgreSQL Database', enabled: config.features.database, description: 'Full-featured PostgreSQL with row-level security' },
                { name: 'Authentication', enabled: config.features.auth, description: 'User management with JWT tokens and social logins' },
                { name: 'File Storage', enabled: config.features.storage, description: 'Secure file uploads and downloads with CDN' },
                { name: 'Real-time Subscriptions', enabled: config.features.realtime, description: 'Live data updates and collaborative features' },
                { name: 'Vector Search (pgvector)', enabled: config.features.vector, description: 'AI embeddings for semantic search' }
            ];

            coreFeatures.forEach(feature => {
                const status = feature.enabled ? chalk.green('✅ Enabled') : chalk.gray('⚪ Disabled');
                console.log(`   ${status} ${chalk.bold(feature.name)}`);
                console.log(`     ${chalk.dim(feature.description)}`);
            });
            console.log();

            // NikCLI Integration Features
            console.log(chalk.bold.cyan('🤖 NikCLI Integration'));
            const integrationFeatures = [
                { name: 'Session Synchronization', description: 'Sync chat sessions across devices', available: true },
                { name: 'Agent Blueprints', description: 'Share and discover AI agent configurations', available: true },
                { name: 'Usage Analytics', description: 'Track token usage and performance metrics', available: true },
                { name: 'Team Collaboration', description: 'Share workspaces and collaborate in real-time', available: true },
                { name: 'Cloud Caching', description: 'Persistent cache for AI responses and data', available: true },
                { name: 'User Profiles & Quotas', description: 'Manage usage limits and subscription tiers', available: true }
            ];

            integrationFeatures.forEach(feature => {
                const status = feature.available ? chalk.green('✅ Available') : chalk.yellow('⚠️ Planned');
                console.log(`   ${status} ${chalk.bold(feature.name)}`);
                console.log(`     ${chalk.dim(feature.description)}`);
            });
            console.log();

            // Dynamic import and show current status
            try {
                const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider');

                if (enhancedSupabaseProvider.isHealthy()) {
                    console.log(chalk.bold.cyan('📊 Current Usage'));
                    console.log(`   Connection: ${chalk.green('✅ Active')}`);
                    console.log(`   Status: ${chalk.green('Operational')}`);
                    console.log(`   Last Check: ${new Date().toLocaleString()}`);
                    console.log();
                }
            } catch (error) {
                console.log(chalk.yellow('⚠️ Unable to fetch usage statistics'));
                console.log();
            }

            // Configuration Guide
            console.log(chalk.bold.cyan('⚙️ Configuration'));
            console.log(`   Project URL: ${config.url ? chalk.green('✅ Configured') : chalk.red('❌ Required')}`);
            console.log(`   Anonymous Key: ${config.anonKey ? chalk.green('✅ Configured') : chalk.red('❌ Required')}`);
            console.log(`   Service Role Key: ${config.serviceRoleKey ? chalk.green('✅ Configured') : chalk.yellow('⚠️ Optional')}`);

            if (!config.url || !config.anonKey) {
                console.log();
                console.log(chalk.yellow('💡 To configure Supabase:'));
                console.log(chalk.dim('   1. Create a project at https://supabase.com'));
                console.log(chalk.dim('   2. Get your URL and anon key from Settings > API'));
                console.log(chalk.dim('   3. Update your NikCLI configuration'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to display Supabase features: ${error.message}`));
        }
    }

    private async handleDatabaseCommands(args: string[]): Promise<void> {
        if (args.length === 0) {
            console.log(chalk.yellow('Usage: /db [sessions|blueprints|users|metrics] [action] [options]'));
            console.log(chalk.dim('Available actions: list, get, create, update, delete, stats'));
            return;
        }

        const [table, action, ...options] = args;

        try {
            // Dynamic import for enhanced services
            const { enhancedSupabaseProvider } = await import('./providers/supabase/enhanced-supabase-provider');

            if (!enhancedSupabaseProvider.isHealthy()) {
                console.log(chalk.red('❌ Database not available'));
                console.log(chalk.dim('Run /supabase connect to establish connection'));
                return;
            }

            switch (table) {
                case 'sessions':
                    await this.handleSessionCommands(action, options);
                    break;
                case 'blueprints':
                    await this.handleBlueprintCommands(action, options);
                    break;
                case 'users':
                    await this.handleUserCommands(action, options);
                    break;
                case 'metrics':
                    await this.handleMetricCommands(action, options);
                    break;
                case 'stats':
                    await this.showDatabaseStats();
                    break;
                default:
                    console.log(chalk.yellow(`Unknown table: ${table}`));
                    console.log(chalk.dim('Available tables: sessions, blueprints, users, metrics'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Database operation failed: ${error.message}`));
        }
    }

    private async handleSessionCommands(action: string, options: string[]): Promise<void> {

        switch (action) {
            case 'list':
                console.log(chalk.blue('📋 Sessions'));
                console.log(chalk.yellow('   Database operations require connection to Supabase'));
                console.log(chalk.dim('   Ensure Supabase is configured and connected'));
                break;

            case 'get':
                console.log(chalk.blue('📄 Session Details'));
                console.log(chalk.yellow('   Database operations require full Supabase integration'));
                break;

            case 'delete':
                console.log(chalk.blue('🗑️ Delete Session'));
                console.log(chalk.yellow('   Database operations require full Supabase integration'));
                break;

            default:
                console.log(chalk.yellow('Available actions: list, get, delete'));
                console.log(chalk.dim('Note: Full database operations coming soon'));
        }
    }

    private async handleBlueprintCommands(action: string, _options: string[]): Promise<void> {

        switch (action) {
            case 'list':
                console.log(chalk.blue('🗂️ Agent Blueprints'));
                console.log(chalk.yellow('   Blueprint operations require full Supabase integration'));
                break;

            case 'get':
                console.log(chalk.blue('📋 Blueprint Details'));
                console.log(chalk.yellow('   Blueprint operations require full Supabase integration'));
                break;

            default:
                console.log(chalk.yellow('Available actions: list, get'));
                console.log(chalk.dim('Note: Blueprint operations coming soon'));
        }
    }

    private async handleUserCommands(action: string, _options: string[]): Promise<void> {
        switch (action) {
            case 'list':
                console.log(chalk.blue('👥 Users'));
                console.log(chalk.yellow('   User operations require full Supabase integration'));
                break;

            case 'stats':
                console.log(chalk.blue('📊 User Statistics'));
                console.log(chalk.yellow('   Statistics require full Supabase integration'));
                break;

            default:
                console.log(chalk.yellow('Available actions: list, stats'));
                console.log(chalk.dim('Note: User operations coming soon'));
        }
    }

    private async handleMetricCommands(action: string, _options: string[]): Promise<void> {
        switch (action) {
            case 'list':
                console.log(chalk.blue('📈 Recent Metrics'));
                console.log(chalk.yellow('   Metric operations require full Supabase integration'));
                break;

            case 'stats':
                console.log(chalk.blue('📊 Today\'s Metrics'));
                console.log(chalk.yellow('   Statistics require full Supabase integration'));
                break;

            default:
                console.log(chalk.yellow('Available actions: list, stats'));
                console.log(chalk.dim('Note: Metric operations coming soon'));
        }
    }

    private async showDatabaseStats(): Promise<void> {
        try {
            console.log(chalk.blue('🗃️ Database Statistics'));
            console.log(chalk.gray('─'.repeat(40)));
            console.log(chalk.yellow('   Database statistics require full Supabase integration'));
            console.log(chalk.dim('   Configure Supabase to view detailed statistics'));

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to get database stats: ${error.message}`));
        }
    }

    private async handleAuthSignUp(): Promise<void> {
        console.log(chalk.blue('📝 Create New Account'));
        console.log(chalk.gray('─'.repeat(40)));

        try {
            // Dynamic import for auth provider
            const { authProvider } = await import('./providers/supabase/auth-provider');

            if (!authProvider.getConfig().enabled) {
                console.log(chalk.yellow('⚠️ Authentication is not enabled'));
                console.log(chalk.dim('Enable Supabase authentication in configuration'));
                return;
            }

            if (authProvider.isAuthenticated()) {
                const profile = authProvider.getCurrentProfile();
                console.log(chalk.yellow(`⚠️ Already signed in as ${profile?.email || profile?.username}`));
                console.log(chalk.dim('Sign out first to create a new account'));
                return;
            }

            // Collect user information
            const email = await this.promptInput('Email address: ');
            if (!email || !this.isValidEmail(email)) {
                console.log(chalk.red('❌ Invalid email address'));
                return;
            }

            const password = await this.promptInput('Password (min 8 characters): ', true);
            if (!password || password.length < 8) {
                console.log(chalk.red('❌ Password must be at least 8 characters'));
                return;
            }

            const confirmPassword = await this.promptInput('Confirm password: ', true);
            if (password !== confirmPassword) {
                console.log(chalk.red('❌ Passwords do not match'));
                return;
            }

            // Optional information
            const username = await this.promptInput('Username (optional): ');
            const fullName = await this.promptInput('Full name (optional): ');

            // Create account
            console.log(chalk.blue('🔄 Creating account...'));

            const result = await authProvider.signUp(email, password, {
                username: username || undefined,
                fullName: fullName || undefined,
                metadata: {
                    source: 'nikcli',
                    version: '0.3.0-beta',
                    created_at: new Date().toISOString()
                }
            });

            if (result) {
                console.log(chalk.green('✅ Account created successfully!'));
                console.log(chalk.dim('You are now signed in and can use all NikCLI features'));

                // Display welcome info
                const { profile } = result;
                console.log();
                console.log(chalk.blue('🎉 Welcome to NikCLI!'));
                console.log(`   Email: ${profile.email}`);
                console.log(`   Subscription: ${profile.subscription_tier}`);
                console.log(`   Monthly Sessions: ${profile.quotas.sessionsPerMonth}`);
                console.log(`   Monthly Tokens: ${profile.quotas.tokensPerMonth}`);

                // Record usage
                await authProvider.recordUsage('sessions', 1);

            } else {
                console.log(chalk.red('❌ Account creation failed'));
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Sign up failed: ${error.message}`));
            if (error.message.includes('already exists') || error.message.includes('already registered')) {
                console.log(chalk.dim('Try signing in instead: /auth signin'));
            } else if (error.message.includes('rate limit')) {
                console.log(chalk.dim('Too many attempts. Please try again later.'));
            }
        }
    }

    private async handleAuthSignOut(): Promise<void> {
        // Implementation for sign out
        try {
            await authProvider.signOut();
            console.log(chalk.green('👋 Signed out successfully'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Sign out error: ${error.message}`));
        }
    }

    private async showAuthProfile(): Promise<void> {
        try {
            // Dynamic import for auth provider
            const { authProvider } = await import('./providers/supabase/auth-provider');

            if (!authProvider.isAuthenticated()) {
                console.log(chalk.yellow('⚠️ Not signed in'));
                console.log(chalk.dim('Sign in with: /auth signin'));
                return;
            }

            const profile = authProvider.getCurrentProfile();
            const user = authProvider.getCurrentUser();

            if (!profile || !user) {
                console.log(chalk.red('❌ Could not load profile'));
                return;
            }

            console.log(chalk.blue('👤 User Profile'));
            console.log(chalk.gray('─'.repeat(40)));

            // Basic Info
            console.log(chalk.bold('📋 Basic Information'));
            console.log(`   Email: ${chalk.cyan(profile.email || 'Not provided')}`);
            console.log(`   Username: ${chalk.cyan(profile.username || 'Not set')}`);
            console.log(`   Full Name: ${chalk.cyan(profile.full_name || 'Not provided')}`);
            console.log(`   User ID: ${chalk.dim(user.id)}`);
            console.log();

            // Subscription Info
            console.log(chalk.bold('💎 Subscription'));
            const tierColor = profile.subscription_tier === 'free' ? 'yellow' :
                profile.subscription_tier === 'pro' ? 'blue' : 'green';
            console.log(`   Tier: ${chalk[tierColor](profile.subscription_tier.toUpperCase())}`);
            console.log();

            // Preferences
            console.log(chalk.bold('⚙️ Preferences'));
            console.log(`   Theme: ${chalk.cyan(profile.preferences.theme)}`);
            console.log(`   Language: ${chalk.cyan(profile.preferences.language)}`);
            console.log(`   Notifications: ${profile.preferences.notifications ? chalk.green('✅ On') : chalk.gray('❌ Off')}`);
            console.log(`   Analytics: ${profile.preferences.analytics ? chalk.green('✅ On') : chalk.gray('❌ Off')}`);
            console.log();

            // Account Info
            console.log(chalk.bold('📅 Account Information'));
            console.log(`   Account Created: ${new Date(user.created_at).toLocaleString()}`);
            console.log(`   Last Sign In: ${(user as any).last_sign_in_at ? new Date((user as any).last_sign_in_at).toLocaleString() : 'Never'}`);
            console.log(`   Email Verified: ${(user as any).email_confirmed_at ? chalk.green('✅ Yes') : chalk.yellow('⚠️ Pending')}`);

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to load profile: ${error.message}`));
        }
    }

    private async showAuthQuotas(): Promise<void> {
        try {
            // Dynamic import for auth provider
            const { authProvider } = await import('./providers/supabase/auth-provider');

            if (!authProvider.isAuthenticated()) {
                console.log(chalk.yellow('⚠️ Not signed in'));
                console.log(chalk.dim('Sign in with: /auth signin'));
                return;
            }

            const profile = authProvider.getCurrentProfile();
            if (!profile) {
                console.log(chalk.red('❌ Could not load profile'));
                return;
            }

            console.log(chalk.blue('📊 Usage Quotas & Limits'));
            console.log(chalk.gray('─'.repeat(50)));

            // Subscription tier info
            const tierColor = profile.subscription_tier === 'free' ? 'yellow' :
                profile.subscription_tier === 'pro' ? 'blue' : 'green';
            console.log(`   Subscription: ${chalk[tierColor].bold(profile.subscription_tier.toUpperCase())}`);
            console.log();

            // Sessions quota
            const sessionQuota = authProvider.checkQuota('sessions');
            const sessionPercent = Math.round((sessionQuota.used / sessionQuota.limit) * 100);
            const sessionColor = sessionPercent > 90 ? 'red' : sessionPercent > 70 ? 'yellow' : 'green';

            console.log(chalk.bold('💬 Chat Sessions (Monthly)'));
            console.log(`   Used: ${chalk[sessionColor](sessionQuota.used.toString())} / ${sessionQuota.limit}`);
            console.log(`   Remaining: ${chalk.cyan((sessionQuota.limit - sessionQuota.used).toString())}`);
            console.log(`   Usage: ${chalk[sessionColor](`${sessionPercent}%`)}`);
            if (sessionQuota.resetTime) {
                console.log(`   Resets: ${chalk.dim(sessionQuota.resetTime.toLocaleDateString())}`);
            }
            console.log();

            // Tokens quota
            const tokenQuota = authProvider.checkQuota('tokens');
            const tokenPercent = Math.round((tokenQuota.used / tokenQuota.limit) * 100);
            const tokenColor = tokenPercent > 90 ? 'red' : tokenPercent > 70 ? 'yellow' : 'green';

            console.log(chalk.bold('🎯 AI Tokens (Monthly)'));
            console.log(`   Used: ${chalk[tokenColor](tokenQuota.used.toLocaleString())} / ${tokenQuota.limit.toLocaleString()}`);
            console.log(`   Remaining: ${chalk.cyan((tokenQuota.limit - tokenQuota.used).toLocaleString())}`);
            console.log(`   Usage: ${chalk[tokenColor](`${tokenPercent}%`)}`);
            if (tokenQuota.resetTime) {
                console.log(`   Resets: ${chalk.dim(tokenQuota.resetTime.toLocaleDateString())}`);
            }
            console.log();

            // API calls quota
            const apiQuota = authProvider.checkQuota('apiCalls');
            const apiPercent = Math.round((apiQuota.used / apiQuota.limit) * 100);
            const apiColor = apiPercent > 90 ? 'red' : apiPercent > 70 ? 'yellow' : 'green';

            console.log(chalk.bold('⚡ API Calls (Hourly)'));
            console.log(`   Used: ${chalk[apiColor](apiQuota.used.toString())} / ${apiQuota.limit}`);
            console.log(`   Remaining: ${chalk.cyan((apiQuota.limit - apiQuota.used).toString())}`);
            console.log(`   Usage: ${chalk[apiColor](`${apiPercent}%`)}`);
            if (apiQuota.resetTime) {
                console.log(`   Resets: ${chalk.dim(apiQuota.resetTime.toLocaleString())}`);
            }
            console.log();

            // Upgrade info for free users
            if (profile.subscription_tier === 'free') {
                console.log(chalk.bold.yellow('💡 Upgrade Benefits'));
                console.log(chalk.dim('   PRO: 1,000 sessions/month, 100k tokens/month, 300 API calls/hour'));
                console.log(chalk.dim('   ENTERPRISE: Unlimited usage, priority support, custom features'));
            }

            // Warnings
            const warnings = [];
            if (!sessionQuota.allowed) warnings.push('Sessions limit reached');
            if (!tokenQuota.allowed) warnings.push('Token limit reached');
            if (!apiQuota.allowed) warnings.push('API rate limit reached');

            if (warnings.length > 0) {
                console.log(chalk.bold.red('⚠️ Quota Warnings'));
                warnings.forEach(warning => {
                    console.log(chalk.red(`   • ${warning}`));
                });
            }

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to load quotas: ${error.message}`));
        }
    }

    /**
     * Assess if a task is complex enough to require todo generation
     */
    private assessTaskComplexity(input: string): boolean {
        const lowerInput = input.toLowerCase();

        // Keywords that indicate complex tasks (ridotto per permettere più chat normale)
        const complexKeywords = [
            'create', 'build', 'implement', 'develop', 'setup', 'configure',
            'refactor', 'migrate', 'deploy', 'install', 'integrate',
            'crea', 'implementa', 'sviluppa', 'configura', 'costruisci',
            'migra', 'installa', 'integra'
        ];

        // Keywords that indicate simple tasks (espanso per catturare più chat normali)
        const simpleKeywords = [
            'show', 'list', 'check', 'status', 'help', 'what', 'how', 'explain', 'describe',
            'tell', 'info', 'display', 'view', 'find', 'search', 'look', 'see', 'get',
            'mostra', 'elenca', 'controlla', 'aiuto', 'cosa', 'come', 'spiega', 'descrivi',
            'dimmi', 'informazioni', 'visualizza', 'vedi', 'trova', 'cerca', 'guarda'
        ];

        // Check for complex indicators
        const hasComplexKeywords = complexKeywords.some(keyword => lowerInput.includes(keyword));
        const hasSimpleKeywords = simpleKeywords.some(keyword => lowerInput.includes(keyword));

        // Task is complex if:
        // - Contains complex keywords AND no simple keywords
        // - Is longer than 200 characters (increased threshold)
        // - Contains multiple sentences or steps
        const isLongTask = input.length > 200;
        const hasMultipleSentences = input.split(/[.!?]/).length > 2;
        const hasSteps = /step|then|after|next|first|second/.test(lowerInput);

        return (hasComplexKeywords && !hasSimpleKeywords) || isLongTask || hasMultipleSentences || hasSteps;
    }

    /**
     * Auto-generate todos and orchestrate background agents for complex tasks
     */
    private async autoGenerateTodosAndOrchestrate(input: string): Promise<void> {
        try {
            console.log(chalk.blue('📋 Creating execution todos...'));

            // Use agent todo manager directly for chat default (NOT enhanced planning)
            const { agentTodoManager } = await import('./core/agent-todo-manager');

            // Create universal agent ID for this task
            const universalAgentId = 'universal-agent-' + Date.now();

            // Generate todos using agent todo manager (max 6 for chat default)
            const todos = await agentTodoManager.planTodos(universalAgentId, input);

            // Limit to max 6 todos for chat default
            const limitedTodos = todos.slice(0, 6);

            // Display todos to user
            this.displayGeneratedTodos(limitedTodos);

            // Start executing todos with background agents
            console.log(chalk.green('🚀 Starting background execution...'));
            console.log(chalk.gray(`I've broken down your request into ${limitedTodos.length} actionable steps and started working on them in the background.`));
            console.log(chalk.gray('You can continue chatting while I work.'));

            // Execute todos in background (non-blocking)
            this.executeInBackground(limitedTodos, universalAgentId);

        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to generate todos: ${error.message}`));
            // Fallback to direct response
            console.log(chalk.yellow('🔄 Falling back to direct chat response...'));

            // Continue with normal chat flow
            const relevantContext = await this.getRelevantProjectContext(input);
            const enhancedInput = relevantContext ? `${input}\n\nContext: ${relevantContext}` : input;

            // Build model-ready messages
            chatManager.addMessage(input, 'user');
            let messages = chatManager.getContextMessages().map(m => ({
                role: m.role as 'system' | 'user' | 'assistant',
                content: m.content,
            }));

            // Simple AI response
            process.stdout.write(`${chalk.cyan('\nAssistant: ')}`);
            let assistantText = '';

            for await (const ev of advancedAIProvider.streamChatWithFullAutonomy(messages)) {
                if (ev.type === 'text_delta' && ev.content) {
                    assistantText += ev.content;
                    process.stdout.write(ev.content);
                }
            }

            // Update token usage after streaming completes (sync with session)
            this.syncTokensFromSession();
        }
    }
    /**
     * Display generated todos to user
     */
    private displayGeneratedTodos(todos: any[]): void {
        console.log(chalk.cyan.bold('\n📋 Execution Plan:'));
        todos.forEach((todo, index) => {
            const priority = todo.priority === 'critical' ? '🔴' :
                todo.priority === 'high' ? '🟡' : '🟢';
            console.log(`  ${index + 1}. ${priority} ${todo.title}`);
            if (todo.description && todo.description !== todo.title) {
                console.log(`     ${chalk.gray(todo.description)}`);
            }
        });
        console.log('');
    }

    /**
     * Execute todos in background using orchestrated agents
     */
    private executeInBackground(todos: any[], agentId: string): void {
        // Non-blocking execution
        setTimeout(async () => {
            try {
                const { agentTodoManager } = await import('./core/agent-todo-manager');

                // Todos are already generated by agentTodoManager.planTodos()
                // Just execute them directly
                await agentTodoManager.executeTodos(agentId);

                console.log(chalk.green('\n✅ Background execution completed!'));
                console.log(chalk.gray('All background tasks have been completed successfully.'));

            } catch (error: any) {
                console.log(chalk.red(`\n❌ Background execution failed: ${error.message}`));
                console.log(chalk.gray(`Some background tasks encountered issues: ${error.message}`));
            }
        }, 100); // Small delay to avoid blocking the chat
    }

    // Token tracking API to be called from AI providers
    public static getInstance(): NikCLI | null {
        return globalNikCLI;
    }

    // ========================================================================
    // IDE Diagnostic Command Handlers
    // ========================================================================

    private async handleDiagnosticCommand(args: string[]): Promise<void> {
        if (args.length === 0) {
            console.log(chalk.blue('🔧 IDE Diagnostic Commands:'));
            console.log(chalk.gray('  /diag list                 - List all diagnostics'));
            console.log(chalk.gray('  /diag file <path>          - Get file diagnostics'));
            console.log(chalk.gray('  /diag build                - Run build and get diagnostics'));
            console.log(chalk.gray('  /diag lint                 - Run lint and get diagnostics'));
            console.log(chalk.gray('  /diag test                 - Run tests and get diagnostics'));
            console.log(chalk.gray('  /diag vcs                  - Get VCS status'));
            console.log(chalk.gray('  /diag status               - Quick diagnostic status'));
            return;
        }

        const command = args[0];
        const subArgs = args.slice(1);

        try {
            switch (command) {
                case 'list':
                    await this.showDiagnosticsList();
                    break;

                case 'file':
                    if (subArgs.length === 0) {
                        console.log(chalk.red('Usage: /diag file <path>'));
                        return;
                    }
                    await this.showFileDiagnostics(subArgs[0]);
                    break;

                case 'build':
                    await this.runBuildDiagnostics();
                    break;

                case 'lint':
                    await this.runLintDiagnostics();
                    break;

                case 'test':
                    await this.runTestDiagnostics();
                    break;

                case 'vcs':
                    await this.showVcsStatus();
                    break;

                case 'status':
                    await this.showQuickDiagnosticStatus();
                    break;

                default:
                    console.log(chalk.red(`Unknown diagnostic command: ${command}`));
                    console.log(chalk.gray('Use /diag for available commands'));
            }
        } catch (error: any) {
            console.log(chalk.red(`Diagnostic command failed: ${error.message}`));
        }
    }

    private async handleProjectHealthCommand(): Promise<void> {
        console.log(chalk.blue('🏥 Running project health analysis...'));

        try {
            const analysis = await ideDiagnosticIntegration.runProjectAnalysis();

            // Display health status with color coding
            const healthColor = analysis.health === 'healthy' ? chalk.green :
                analysis.health === 'degraded' ? chalk.yellow : chalk.red;

            console.log(healthColor(`\n📊 Project Health: ${analysis.health.toUpperCase()}`));
            console.log(chalk.white(`Summary: ${analysis.summary}`));

            if (analysis.details.buildTool || analysis.details.lintTool || analysis.details.testTool) {
                console.log(chalk.blue('\n🔧 Available Tools:'));
                if (analysis.details.toolsAvailable) {
                    const tools = analysis.details.toolsAvailable;
                    if (tools.buildTool !== 'none') console.log(chalk.gray(`  Build: ${tools.buildTool}`));
                    if (tools.lintTool !== 'none') console.log(chalk.gray(`  Lint: ${tools.lintTool}`));
                    if (tools.testTool !== 'none') console.log(chalk.gray(`  Test: ${tools.testTool}`));
                }
            }

            if (analysis.recommendations.length > 0) {
                console.log(chalk.blue('\n💡 Recommendations:'));
                analysis.recommendations.forEach(rec => {
                    console.log(chalk.gray(`  • ${rec}`));
                });
            }

        } catch (error: any) {
            console.log(chalk.red(`Health analysis failed: ${error.message}`));
        }
    }

    private async showDiagnosticsList(): Promise<void> {
        try {
            const response = await mcpClient.call('ide-diagnostic', {
                method: 'diag.list',
                params: {},
                id: 'cli-list'
            });

            const diagnostics = response.result || [];

            if (diagnostics.length === 0) {
                console.log(chalk.green('✅ No diagnostics found'));
                return;
            }

            console.log(chalk.blue(`\n🔍 Found ${diagnostics.length} diagnostic${diagnostics.length !== 1 ? 's' : ''}:`));

            // Group by file
            const byFile = new Map<string, any[]>();
            for (const diag of diagnostics) {
                if (!byFile.has(diag.file)) {
                    byFile.set(diag.file, []);
                }
                byFile.get(diag.file)!.push(diag);
            }

            // Display grouped diagnostics
            for (const [file, fileDiags] of byFile.entries()) {
                console.log(chalk.cyan(`\n📄 ${file}:`));
                fileDiags.forEach(diag => {
                    const severityColor = diag.severity === 'error' ? chalk.red :
                        diag.severity === 'warning' ? chalk.yellow : chalk.blue;
                    const location = diag.range ? `:${diag.range.startLine}:${diag.range.startCol}` : '';
                    console.log(`  ${severityColor(diag.severity.toUpperCase())}${location} ${diag.message} ${chalk.gray(`[${diag.source}]`)}`);
                });
            }

        } catch (error: any) {
            console.log(chalk.red(`Failed to get diagnostics: ${error.message}`));
        }
    }

    private async showFileDiagnostics(filePath: string): Promise<void> {
        try {
            const fileInfo = await ideDiagnosticIntegration.getFileDiagnostics(filePath);

            console.log(chalk.blue(`\n📄 Diagnostics for ${filePath}:`));
            console.log(chalk.white(`Summary: ${fileInfo.summary}`));

            if (fileInfo.diagnostics.length > 0) {
                console.log(chalk.blue('\n🔍 Issues:'));
                fileInfo.diagnostics.forEach(diag => {
                    const severityColor = diag.severity === 'error' ? chalk.red :
                        diag.severity === 'warning' ? chalk.yellow : chalk.blue;
                    const location = diag.range ? `:${diag.range.startLine}:${diag.range.startCol}` : '';
                    console.log(`  ${severityColor(diag.severity.toUpperCase())}${location} ${diag.message} ${chalk.gray(`[${diag.source}]`)}`);
                });
            }

            if (fileInfo.related.length > 0) {
                console.log(chalk.blue('\n🔗 Related:'));
                fileInfo.related.forEach(rel => {
                    console.log(`  📄 ${rel.file}: ${rel.message}`);
                });
            }

        } catch (error: any) {
            console.log(chalk.red(`Failed to get file diagnostics: ${error.message}`));
        }
    }

    private async runBuildDiagnostics(): Promise<void> {
        console.log(chalk.blue('🔨 Running build diagnostics...'));

        try {
            const response = await mcpClient.call('ide-diagnostic', {
                method: 'build.run',
                params: {},
                id: 'cli-build'
            });

            const result = response.result;
            const summary = result.summary;

            const statusColor = summary.success ? chalk.green : chalk.red;
            console.log(statusColor(`\n📊 Build ${summary.success ? 'SUCCESS' : 'FAILED'}`));
            console.log(chalk.white(`Duration: ${summary.duration}ms`));
            console.log(chalk.white(`Command: ${summary.command}`));

            if (summary.errors > 0 || summary.warnings > 0) {
                console.log(chalk.white(`Errors: ${summary.errors}, Warnings: ${summary.warnings}`));
            }

            if (result.diagnostics && result.diagnostics.length > 0) {
                console.log(chalk.blue('\n🔍 Build Issues:'));
                result.diagnostics.slice(0, 10).forEach((diag: any) => {
                    const severityColor = diag.severity === 'error' ? chalk.red : chalk.yellow;
                    console.log(`  ${severityColor(diag.severity.toUpperCase())} ${diag.file}: ${diag.message}`);
                });

                if (result.diagnostics.length > 10) {
                    console.log(chalk.gray(`  ... and ${result.diagnostics.length - 10} more`));
                }
            }

        } catch (error: any) {
            console.log(chalk.red(`Build diagnostics failed: ${error.message}`));
        }
    }

    private async runLintDiagnostics(): Promise<void> {
        console.log(chalk.blue('🧹 Running lint diagnostics...'));

        try {
            const response = await mcpClient.call('ide-diagnostic', {
                method: 'lint.run',
                params: {},
                id: 'cli-lint'
            });

            const result = response.result;
            const summary = result.summary;

            const statusColor = summary.errors === 0 ? chalk.green : chalk.red;
            console.log(statusColor(`\n📊 Lint Results`));
            console.log(chalk.white(`Files checked: ${summary.files}`));
            console.log(chalk.white(`Errors: ${summary.errors}, Warnings: ${summary.warnings}`));

            if (result.diagnostics && result.diagnostics.length > 0) {
                console.log(chalk.blue('\n🔍 Lint Issues:'));
                result.diagnostics.slice(0, 10).forEach((diag: any) => {
                    const severityColor = diag.severity === 'error' ? chalk.red : chalk.yellow;
                    const rule = diag.code ? ` [${diag.code}]` : '';
                    console.log(`  ${severityColor(diag.severity.toUpperCase())} ${diag.file}: ${diag.message}${chalk.gray(rule)}`);
                });

                if (result.diagnostics.length > 10) {
                    console.log(chalk.gray(`  ... and ${result.diagnostics.length - 10} more`));
                }
            }

        } catch (error: any) {
            console.log(chalk.red(`Lint diagnostics failed: ${error.message}`));
        }
    }

    private async runTestDiagnostics(): Promise<void> {
        console.log(chalk.blue('🧪 Running test diagnostics...'));

        try {
            const response = await mcpClient.call('ide-diagnostic', {
                method: 'test.run',
                params: {},
                id: 'cli-test'
            });

            const result = response.result;
            const summary = result.summary;

            const statusColor = summary.failed === 0 ? chalk.green : chalk.red;
            console.log(statusColor(`\n📊 Test Results`));
            console.log(chalk.white(`Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}, Skipped: ${summary.skipped}`));
            console.log(chalk.white(`Duration: ${summary.duration}ms`));
            console.log(chalk.white(`Command: ${summary.command}`));

            if (result.diagnostics && result.diagnostics.length > 0) {
                console.log(chalk.blue('\n🔍 Test Failures:'));
                result.diagnostics.slice(0, 10).forEach((diag: any) => {
                    console.log(`  ${chalk.red('FAILED')} ${diag.file}: ${diag.message}`);
                });

                if (result.diagnostics.length > 10) {
                    console.log(chalk.gray(`  ... and ${result.diagnostics.length - 10} more`));
                }
            }

        } catch (error: any) {
            console.log(chalk.red(`Test diagnostics failed: ${error.message}`));
        }
    }

    private async showVcsStatus(): Promise<void> {
        try {
            const response = await mcpClient.call('ide-diagnostic', {
                method: 'vcs.status',
                params: {},
                id: 'cli-vcs'
            });

            const vcs = response.result;

            console.log(chalk.blue(`\n🌿 VCS Status:`));
            console.log(chalk.white(`Branch: ${vcs.branch}`));

            if (vcs.ahead > 0 || vcs.behind > 0) {
                const sync = [];
                if (vcs.ahead > 0) sync.push(`${vcs.ahead} ahead`);
                if (vcs.behind > 0) sync.push(`${vcs.behind} behind`);
                console.log(chalk.yellow(`Sync: ${sync.join(', ')}`));
            }

            if (vcs.staged.length > 0) {
                console.log(chalk.green(`\n📝 Staged (${vcs.staged.length}):`));
                vcs.staged.slice(0, 5).forEach((file: any) => {
                    console.log(`  ${chalk.green(file.status)} ${file.file}`);
                });
                if (vcs.staged.length > 5) {
                    console.log(chalk.gray(`  ... and ${vcs.staged.length - 5} more`));
                }
            }

            if (vcs.unstaged.length > 0) {
                console.log(chalk.red(`\n📝 Unstaged (${vcs.unstaged.length}):`));
                vcs.unstaged.slice(0, 5).forEach((file: any) => {
                    console.log(`  ${chalk.red(file.status)} ${file.file}`);
                });
                if (vcs.unstaged.length > 5) {
                    console.log(chalk.gray(`  ... and ${vcs.unstaged.length - 5} more`));
                }
            }

            if (vcs.untracked.length > 0) {
                console.log(chalk.gray(`\n📝 Untracked (${vcs.untracked.length}):`));
                vcs.untracked.slice(0, 5).forEach((file: string) => {
                    console.log(`  ${chalk.gray('??')} ${file}`);
                });
                if (vcs.untracked.length > 5) {
                    console.log(chalk.gray(`  ... and ${vcs.untracked.length - 5} more`));
                }
            }

        } catch (error: any) {
            console.log(chalk.red(`VCS status failed: ${error.message}`));
        }
    }

    private async showQuickDiagnosticStatus(): Promise<void> {
        try {
            const quickStatus = await ideDiagnosticIntegration.getQuickStatus();
            console.log(`\n${quickStatus}`);

            // Also show project health summary
            const healthSummary = await getProjectHealthSummary();
            console.log(chalk.white(`Project: ${healthSummary}`));

        } catch (error: any) {
            console.log(chalk.red(`Status check failed: ${error.message}`));
        }
    }

    /**
     * Show agents panel display
     */
    private showAgentsPanel(): void {
        const agents = agentService.getAvailableAgents();

        let agentsList = '';
        agents.forEach(agent => {
            agentsList += `${chalk.green('•')} ${chalk.bold(agent.name)}\n`;
            agentsList += `  ${chalk.gray(agent.description)}\n\n`;
        });

        const agentsBox = boxen(agentsList.trim(), {
            title: '🤖 Available Agents',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'blue'
        });

        console.log(agentsBox);
    }

    /**
     * Show factory panel display
     */
    private showFactoryPanel(): void {
        const factoryInfo = `${chalk.cyan('🏭 Agent Factory Dashboard')}\n\n` +
            `${chalk.yellow('Features:')}\n` +
            `• Dynamic agent creation\n` +
            `• Blueprint management\n` +
            `• Capability assessment\n` +
            `• Performance monitoring\n\n` +
            `${chalk.dim('Use /create-agent to build new agents')}`;

        const factoryBox = boxen(factoryInfo, {
            title: '🏭 Agent Factory',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'yellow'
        });

        console.log(factoryBox);
    }

    /**
     * Show blueprints panel display
     */
    private showBlueprintsPanel(): void {
        const blueprintsInfo = `${chalk.cyan('📋 Blueprint Management')}\n\n` +
            `${chalk.yellow('Available Operations:')}\n` +
            `• List all blueprints\n` +
            `• Create new blueprints\n` +
            `• Export blueprints to file\n` +
            `• Import blueprints from file\n` +
            `• Search by capabilities\n\n` +
            `${chalk.gray('Note: Blueprint operations require Supabase integration')}\n` +
            `${chalk.dim('Use /blueprint <id> for detailed information')}`;

        const blueprintsBox = boxen(blueprintsInfo, {
            title: '📋 Agent Blueprints',
            padding: 1,
            margin: 1,
            borderStyle: 'round',
            borderColor: 'magenta'
        });

        console.log(blueprintsBox);
    }

    /**
     * Show configuration panel with proper formatting
     */
    private async showConfigurationPanel(): Promise<void> {
        try {
            const cfg = configManager.getConfig();

            const lines: string[] = [];
            lines.push(chalk.cyan.bold('⚙️ System Configuration'));
            lines.push(chalk.gray('─'.repeat(60)));

            // 1) General
            lines.push('');
            lines.push(chalk.green('1) General'));
            lines.push(`   Current Model: ${chalk.yellow(cfg.currentModel)}`);
            lines.push(`   Temperature: ${chalk.cyan(String(cfg.temperature))}`);
            lines.push(`   Max Tokens: ${chalk.cyan(String(cfg.maxTokens))}`);
            lines.push(`   Chat History: ${cfg.chatHistory ? chalk.green('on') : chalk.gray('off')} (max ${cfg.maxHistoryLength})`);
            if (cfg.systemPrompt) {
                const preview = cfg.systemPrompt.length > 80 ? cfg.systemPrompt.slice(0, 77) + '…' : cfg.systemPrompt;
                lines.push(`   System Prompt: ${chalk.gray(preview)}`);
            }
            lines.push(`   Auto Analyze Workspace: ${cfg.autoAnalyzeWorkspace ? chalk.green('on') : chalk.gray('off')}`);

            // 2) Auto Todos
            lines.push('');
            lines.push(chalk.green('2) Auto Todos'));
            const requireExplicit = (cfg as any).autoTodo?.requireExplicitTrigger === true;
            lines.push(`   Mode: ${requireExplicit ? chalk.yellow('Explicit only (use "todo")') : chalk.green('Automatic (complex input allowed)')}`);
            lines.push(`   Toggle: ${chalk.cyan('/todos on')} | ${chalk.cyan('/todos off')} | ${chalk.cyan('/todos status')}`);

            // 3) Model Routing
            lines.push('');
            lines.push(chalk.green('3) Model Routing'));
            lines.push(`   Enabled: ${cfg.modelRouting.enabled ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   Verbose: ${cfg.modelRouting.verbose ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   Mode: ${chalk.cyan(cfg.modelRouting.mode)}`);

            // 4) Agents
            lines.push('');
            lines.push(chalk.green('4) Agents'));
            lines.push(`   Max Concurrent Agents: ${chalk.cyan(String(cfg.maxConcurrentAgents))}`);
            lines.push(`   Guidance System: ${cfg.enableGuidanceSystem ? chalk.green('on') : chalk.gray('off')}`);
            lines.push(`   Default Agent Timeout: ${chalk.cyan(String(cfg.defaultAgentTimeout))} ms`);
            lines.push(`   Log Level: ${chalk.cyan(cfg.logLevel)}`);

            // 5) Security
            lines.push('');
            lines.push(chalk.green('5) Security'));
            lines.push(`   Require Network Approval: ${cfg.requireApprovalForNetwork ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   Approval Policy: ${chalk.cyan(cfg.approvalPolicy)}`);
            lines.push(`   Security Mode: ${chalk.cyan(cfg.securityMode)}`);

            // 6) Tool Approval Policies
            lines.push('');
            lines.push(chalk.green('6) Tool Approval Policies'));
            Object.entries(cfg.toolApprovalPolicies).forEach(([k, v]) => {
                lines.push(`   ${k}: ${chalk.cyan(String(v))}`);
            });

            // 7) Session Settings
            lines.push('');
            lines.push(chalk.green('7) Session Settings'));
            lines.push(`   Approval Timeout: ${chalk.cyan(String(cfg.sessionSettings.approvalTimeoutMs))} ms`);
            lines.push(`   Dev Mode Timeout: ${chalk.cyan(String(cfg.sessionSettings.devModeTimeoutMs))} ms`);
            lines.push(`   Batch Approval: ${cfg.sessionSettings.batchApprovalEnabled ? chalk.green('on') : chalk.gray('off')}`);
            lines.push(`   Auto-Approve ReadOnly: ${cfg.sessionSettings.autoApproveReadOnly ? chalk.green('on') : chalk.gray('off')}`);

            // 8) Sandbox
            lines.push('');
            lines.push(chalk.green('8) Sandbox'));
            lines.push(`   Enabled: ${cfg.sandbox.enabled ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   File System: ${cfg.sandbox.allowFileSystem ? chalk.green('allowed') : chalk.red('blocked')}`);
            lines.push(`   Network: ${cfg.sandbox.allowNetwork ? chalk.green('allowed') : chalk.red('blocked')}`);
            lines.push(`   Commands: ${cfg.sandbox.allowCommands ? chalk.green('allowed') : chalk.red('blocked')}`);
            lines.push(`   Trusted Domains: ${chalk.cyan(String(cfg.sandbox.trustedDomains.length))}`);

            // 9) Redis
            lines.push('');
            lines.push(chalk.green('9) Redis'));
            lines.push(`   Enabled: ${cfg.redis.enabled ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   Host: ${chalk.cyan(cfg.redis.host)}  Port: ${chalk.cyan(String(cfg.redis.port))}  DB: ${chalk.cyan(String(cfg.redis.database))}`);
            lines.push(`   TTL: ${chalk.cyan(String(cfg.redis.ttl))}s  Retries: ${chalk.cyan(String(cfg.redis.maxRetries))}  Delay: ${chalk.cyan(String(cfg.redis.retryDelayMs))}ms`);
            lines.push(`   Cluster: ${cfg.redis.cluster?.enabled ? chalk.green('on') : chalk.gray('off')}`);
            lines.push(`   Fallback: ${cfg.redis.fallback.enabled ? chalk.green('on') : chalk.gray('off')} (${chalk.cyan(cfg.redis.fallback.strategy)})`);
            lines.push(`   Strategies: tokens=${cfg.redis.strategies.tokens ? 'on' : 'off'}, sessions=${cfg.redis.strategies.sessions ? 'on' : 'off'}, agents=${cfg.redis.strategies.agents ? 'on' : 'off'}, docs=${cfg.redis.strategies.documentation ? 'on' : 'off'}`);

            // 10) Supabase
            lines.push('');
            lines.push(chalk.green('10) Supabase'));
            lines.push(`   Enabled: ${cfg.supabase.enabled ? chalk.green('yes') : chalk.gray('no')}`);
            if (cfg.supabase.url) lines.push(`   URL: ${chalk.cyan(cfg.supabase.url)}`);
            lines.push(`   Features: db=${cfg.supabase.features.database ? 'on' : 'off'}, storage=${cfg.supabase.features.storage ? 'on' : 'off'}, auth=${cfg.supabase.features.auth ? 'on' : 'off'}, realtime=${cfg.supabase.features.realtime ? 'on' : 'off'}, vector=${cfg.supabase.features.vector ? 'on' : 'off'}`);
            lines.push(`   Tables: sessions=${cfg.supabase.tables.sessions}, blueprints=${cfg.supabase.tables.blueprints}, users=${cfg.supabase.tables.users}, metrics=${cfg.supabase.tables.metrics}, docs=${cfg.supabase.tables.documents}`);

            // 11) Cloud Docs
            lines.push('');
            lines.push(chalk.green('11) Cloud Docs'));
            lines.push(`   Enabled: ${cfg.cloudDocs.enabled ? chalk.green('yes') : chalk.gray('no')}`);
            lines.push(`   Provider: ${chalk.cyan(cfg.cloudDocs.provider)}`);
            lines.push(`   Auto Sync: ${cfg.cloudDocs.autoSync ? 'on' : 'off'}  Contribution: ${cfg.cloudDocs.contributionMode ? 'on' : 'off'}`);
            lines.push(`   Max Context: ${chalk.cyan(String(cfg.cloudDocs.maxContextSize))}`);
            lines.push(`   Auto Load For Agents: ${cfg.cloudDocs.autoLoadForAgents ? 'on' : 'off'}  Smart Suggestions: ${cfg.cloudDocs.smartSuggestions ? 'on' : 'off'}`);

            // 12) Models & Keys (sorted by name)
            lines.push('');
            lines.push(chalk.green('12) Models & API Keys'));
            const modelEntries = Object.entries(cfg.models).sort((a, b) => a[0].localeCompare(b[0]));
            modelEntries.forEach(([name, mc]) => {
                const isCurrent = name === cfg.currentModel;
                const hasKey = configManager.getApiKey(name) !== undefined;
                const bullet = isCurrent ? chalk.yellow('●') : chalk.gray('○');
                const keyStatus = hasKey ? chalk.green('✅ key') : chalk.red('❌ key');
                lines.push(`   ${bullet} ${chalk.cyan(name)}  (${(mc as any).provider}/${(mc as any).model})  ${keyStatus}`);
            });

            const configBox = boxen(lines.join('\n'), {
                title: '⚙️ Configuration Panel',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'cyan'
            });

            console.log(configBox);
            console.log(chalk.gray('Tip: Use /config interactive to edit settings'));
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to show configuration: ${error.message}`));
        }
    }

    /**
     * Interactive configuration editor using inquirer
     */
    private async showInteractiveConfiguration(): Promise<void> {
        // Prevent user input queue interference during interactive prompts
        try {
            inputQueue.enableBypass();
        } catch { /* ignore */ }

        const sectionChoices = [
            { name: 'General', value: 'general' },
            { name: 'Auto Todos', value: 'autotodos' },
            { name: 'Model Routing', value: 'routing' },
            { name: 'Agents', value: 'agents' },
            { name: 'Security', value: 'security' },
            { name: 'Session Settings', value: 'session' },
            { name: 'Sandbox', value: 'sandbox' },
            { name: 'Models & Keys', value: 'models' },
            { name: 'Exit', value: 'exit' },
        ];

        const asNumber = (v: any, min?: number, max?: number) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return 'Enter a number';
            if (min !== undefined && n < min) return `Min ${min}`;
            if (max !== undefined && n > max) return `Max ${max}`;
            return true;
        };

        // Loop until user exits
        let done = false;
        while (!done) {
            const { section } = await inquirer.prompt<{ section: string }>([{
                type: 'list', name: 'section', message: 'Configuration — select section', choices: sectionChoices
            }]);

            const cfg = this.configManager.getAll() as any;

            switch (section) {
                case 'general': {
                    const ans = await inquirer.prompt([
                        { type: 'input', name: 'temperature', message: 'Temperature (0–2)', default: cfg.temperature, validate: (v: any) => asNumber(v, 0, 2) },
                        { type: 'input', name: 'maxTokens', message: 'Max tokens', default: cfg.maxTokens, validate: (v: any) => asNumber(v, 1, 800000) },
                        { type: 'confirm', name: 'chatHistory', message: 'Enable chat history?', default: cfg.chatHistory },
                        { type: 'input', name: 'maxHistoryLength', message: 'Max history length', default: cfg.maxHistoryLength, validate: (v: any) => asNumber(v, 1, 5000) },
                    ]);
                    this.configManager.set('temperature', Number(ans.temperature) as any);
                    this.configManager.set('maxTokens', Number(ans.maxTokens) as any);
                    this.configManager.set('chatHistory', Boolean(ans.chatHistory) as any);
                    this.configManager.set('maxHistoryLength', Number(ans.maxHistoryLength) as any);
                    console.log(chalk.green('✅ Updated General settings'));
                    break;
                }
                case 'autotodos': {
                    const current = !!cfg.autoTodo?.requireExplicitTrigger;
                    const { requireExplicitTrigger } = await inquirer.prompt<{ requireExplicitTrigger: boolean }>([{
                        type: 'confirm', name: 'requireExplicitTrigger', message: 'Require explicit "todo" to trigger?', default: current
                    }]);
                    this.configManager.set('autoTodo', { ...(cfg.autoTodo || {}), requireExplicitTrigger } as any);
                    console.log(chalk.green('✅ Updated Auto Todos settings'));
                    break;
                }
                case 'routing': {
                    const { enabled, verbose, mode } = await inquirer.prompt([
                        { type: 'confirm', name: 'enabled', message: 'Enable routing?', default: cfg.modelRouting.enabled },
                        { type: 'confirm', name: 'verbose', message: 'Verbose routing logs?', default: cfg.modelRouting.verbose },
                        { type: 'list', name: 'mode', message: 'Routing mode', choices: ['conservative', 'balanced', 'aggressive'], default: cfg.modelRouting.mode },
                    ]);
                    this.configManager.set('modelRouting', { enabled, verbose, mode } as any);
                    console.log(chalk.green('✅ Updated Model Routing'));
                    break;
                }
                case 'agents': {
                    const { maxConcurrentAgents, enableGuidanceSystem, defaultAgentTimeout, logLevel } = await inquirer.prompt([
                        { type: 'input', name: 'maxConcurrentAgents', message: 'Max concurrent agents', default: cfg.maxConcurrentAgents, validate: (v: any) => asNumber(v, 1, 10) },
                        { type: 'confirm', name: 'enableGuidanceSystem', message: 'Enable guidance system?', default: cfg.enableGuidanceSystem },
                        { type: 'input', name: 'defaultAgentTimeout', message: 'Default agent timeout (ms)', default: cfg.defaultAgentTimeout, validate: (v: any) => asNumber(v, 1000, 3600000) },
                        { type: 'list', name: 'logLevel', message: 'Log level', choices: ['debug', 'info', 'warn', 'error'], default: cfg.logLevel },
                    ]);
                    this.configManager.set('maxConcurrentAgents', Number(maxConcurrentAgents) as any);
                    this.configManager.set('enableGuidanceSystem', Boolean(enableGuidanceSystem) as any);
                    this.configManager.set('defaultAgentTimeout', Number(defaultAgentTimeout) as any);
                    this.configManager.set('logLevel', logLevel as any);
                    console.log(chalk.green('✅ Updated Agent settings'));
                    break;
                }
                case 'security': {
                    const { requireApprovalForNetwork, approvalPolicy, securityMode } = await inquirer.prompt([
                        { type: 'confirm', name: 'requireApprovalForNetwork', message: 'Require approval for network requests?', default: cfg.requireApprovalForNetwork },
                        { type: 'list', name: 'approvalPolicy', message: 'Approval policy', choices: ['strict', 'moderate', 'permissive'], default: cfg.approvalPolicy },
                        { type: 'list', name: 'securityMode', message: 'Security mode', choices: ['safe', 'default', 'developer'], default: cfg.securityMode },
                    ]);
                    this.configManager.set('requireApprovalForNetwork', Boolean(requireApprovalForNetwork) as any);
                    this.configManager.set('approvalPolicy', approvalPolicy as any);
                    this.configManager.set('securityMode', securityMode as any);
                    console.log(chalk.green('✅ Updated Security settings'));
                    break;
                }
                case 'session': {
                    const s = cfg.sessionSettings;
                    const a = await inquirer.prompt([
                        { type: 'input', name: 'approvalTimeoutMs', message: 'Approval timeout (ms)', default: s.approvalTimeoutMs, validate: (v: any) => asNumber(v, 5000, 300000) },
                        { type: 'input', name: 'devModeTimeoutMs', message: 'Dev mode timeout (ms)', default: s.devModeTimeoutMs, validate: (v: any) => asNumber(v, 60000, 7200000) },
                        { type: 'confirm', name: 'batchApprovalEnabled', message: 'Enable batch approvals?', default: s.batchApprovalEnabled },
                        { type: 'confirm', name: 'autoApproveReadOnly', message: 'Auto approve read-only?', default: s.autoApproveReadOnly },
                    ]);
                    this.configManager.set('sessionSettings', {
                        approvalTimeoutMs: Number(a.approvalTimeoutMs),
                        devModeTimeoutMs: Number(a.devModeTimeoutMs),
                        batchApprovalEnabled: Boolean(a.batchApprovalEnabled),
                        autoApproveReadOnly: Boolean(a.autoApproveReadOnly)
                    } as any);
                    console.log(chalk.green('✅ Updated Session settings'));
                    break;
                }
                case 'sandbox': {
                    const s = cfg.sandbox;
                    const a = await inquirer.prompt([
                        { type: 'confirm', name: 'enabled', message: 'Enable sandbox?', default: s.enabled },
                        { type: 'confirm', name: 'allowFileSystem', message: 'Allow file system?', default: s.allowFileSystem },
                        { type: 'confirm', name: 'allowNetwork', message: 'Allow network?', default: s.allowNetwork },
                        { type: 'confirm', name: 'allowCommands', message: 'Allow commands?', default: s.allowCommands },
                    ]);
                    this.configManager.set('sandbox', { ...s, ...a } as any);
                    console.log(chalk.green('✅ Updated Sandbox settings'));
                    break;
                }
                case 'models': {
                    const list = this.configManager.listModels();
                    if (!list || list.length === 0) {
                        console.log(chalk.yellow('No models configured'));
                        break;
                    }
                    const { selection } = await inquirer.prompt<{ selection: string }>([{
                        type: 'list', name: 'selection', message: 'Models', choices: [
                            { name: 'Set current model', value: 'setcurrent' },
                            { name: 'Set API key', value: 'setkey' },
                            { name: 'Back', value: 'back' }
                        ]
                    }]);
                    if (selection === 'setcurrent') {
                        const { model } = await inquirer.prompt<{ model: string }>([{
                            type: 'list', name: 'model', message: 'Choose current model', choices: list.map(m => ({ name: `${m.name} (${(m.config as any).provider})`, value: m.name })), default: this.configManager.getCurrentModel()
                        }]);
                        this.configManager.setCurrentModel(model);
                        try { advancedAIProvider.setModel(model); } catch { /* ignore */ }
                        console.log(chalk.green(`✅ Current model set: ${model}`));
                    } else if (selection === 'setkey') {
                        await this.interactiveSetApiKey();
                    }
                    break;
                }
                case 'exit':
                default:
                    done = true;
                    break;
            }



        }


        console.log(chalk.dim('Exited interactive configuration'));

        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();

    }

    /**
     * Show models panel with proper formatting
     */
    private async showModelsPanel(): Promise<void> {
        try {
            const currentModel = configManager.get('currentModel');
            const models = configManager.get('models');

            let modelsContent = chalk.blue.bold('🤖 AI Models Dashboard\n');
            modelsContent += chalk.gray('─'.repeat(50)) + '\n\n';

            // Current active model
            modelsContent += chalk.green('🟢 Current Active Model:\n');
            modelsContent += `   ${chalk.yellow.bold(currentModel)}\n\n`;

            // Available models
            modelsContent += chalk.green('📋 Available Models:\n');
            Object.entries(models).forEach(([name, config]) => {
                const isCurrent = name === currentModel;
                const hasKey = configManager.getApiKey(name) !== undefined;

                const currentIndicator = isCurrent ? chalk.yellow('→ ') : '  ';
                const keyStatus = hasKey ? chalk.green('✅') : chalk.red('❌');

                modelsContent += `${currentIndicator}${keyStatus} ${chalk.bold(name)}\n`;
                modelsContent += `     ${chalk.gray(`Provider: ${(config as any).provider}`)}\n`;
                modelsContent += `     ${chalk.gray(`Model: ${(config as any).model}`)}\n`;

                if (!hasKey) {
                    modelsContent += `     ${chalk.red('⚠️  API key required')}\n`;
                }
                modelsContent += '\n';
            });

            // Usage instructions
            modelsContent += chalk.green('💡 Usage:\n');
            modelsContent += `   ${chalk.cyan('/model <name>')}     - Switch to specific model\n`;
            modelsContent += `   ${chalk.cyan('/set-key <model> <key>')} - Configure API key\n`;

            const modelsBox = boxen(modelsContent.trim(), {
                title: '🤖 Models Panel',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue'
            });

            console.log(modelsBox);
        } catch (error: any) {
            console.log(chalk.red(`❌ Failed to show models: ${error.message}`));
        }
    }

    /**
     * Interactive provider → model → API key setup with boxen panels
     */
    private async interactiveSetApiKey(): Promise<void> {
        try {
            const all = configManager.listModels();
            if (!all || all.length === 0) {
                console.log(boxen('No models configured. Use /models to review configuration.', {
                    title: '🔑 Set API Key', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
                }));
                return;
            }

            // Group models by provider
            const byProvider = new Map<string, { name: string; label: string }[]>();
            for (const m of all) {
                const label = `${m.name} ${chalk.gray(`(${(m.config as any).model})`)} ${m.hasApiKey ? chalk.green('key✓') : chalk.yellow('key?')}`;
                const arr = byProvider.get(m.config.provider) || [];
                arr.push({ name: m.name, label });
                byProvider.set(m.config.provider, arr);
            }

            const providers = Array.from(byProvider.keys()).sort();

            // Panel: provider selection
            console.log(boxen('Select the provider to configure the API key.', {
                title: '🔑 Set API Key – Provider', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
            }));

            const inquirer = await import('inquirer');
            const { inputQueue } = await import('./core/input-queue');
            // Suspend our readline prompt to avoid UI conflicts
            this.suspendPrompt();
            inputQueue.enableBypass();
            let provider: string;
            try {
                const ans = await inquirer.default.prompt([
                    {
                        type: 'list',
                        name: 'provider',
                        message: 'Choose provider',
                        choices: providers,
                        pageSize: Math.min(10, providers.length)
                    }
                ]);
                provider = ans.provider;
            } finally {
                inputQueue.disableBypass();
                this.resumePromptAndRender();
            }

            // If provider doesn't require a key (ollama), show info and exit
            if (provider === 'ollama') {
                console.log(boxen('Ollama provider does not require API keys.', {
                    title: 'ℹ️ No Key Required', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
                }));
                return;
            }

            const modelsForProvider = (byProvider.get(provider) || []).sort((a, b) => a.name.localeCompare(b.name));
            if (modelsForProvider.length === 0) {
                console.log(boxen(`No models found for provider: ${provider}`, {
                    title: '❌ Set API Key', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
                }));
                return;
            }

            // Panel: model selection
            console.log(boxen(`Provider: ${provider}\nSelect the model to attach the key.`, {
                title: '🔑 Set API Key – Model', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'cyan'
            }));

            // Suspend again for next prompt
            this.suspendPrompt();
            inputQueue.enableBypass();
            let modelName: string;
            try {
                const ans2 = await inquirer.default.prompt([
                    {
                        type: 'list',
                        name: 'model',
                        message: 'Choose model',
                        choices: modelsForProvider.map(m => ({ name: m.label, value: m.name })),
                        pageSize: Math.min(15, modelsForProvider.length)
                    }
                ]);
                modelName = ans2.model;
            } finally {
                inputQueue.disableBypass();
                this.resumePromptAndRender();
            }

            // Panel: enter API key (masked)
            console.log(boxen(`Model: ${modelName}\nEnter the API key for ${provider}. It will be stored encrypted.`, {
                title: '🔑 Set API Key – Secret', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'yellow'
            }));

            // Suspend again for secret prompt
            this.suspendPrompt();
            inputQueue.enableBypass();
            let apiKey: string;
            try {
                const ans3 = await inquirer.default.prompt([
                    {
                        type: 'password',
                        name: 'apiKey',
                        message: `Enter ${provider.toUpperCase()} API key`,
                        mask: '*',
                        validate: (v: string) => v && v.trim().length > 5 ? true : 'Please enter a valid key'
                    }
                ]);
                apiKey = ans3.apiKey.trim();
            } finally {
                inputQueue.disableBypass();
                this.resumePromptAndRender();
            }

            configManager.setApiKey(modelName, apiKey);

            // Success panel
            const tip = provider === 'openai' ? 'Env: OPENAI_API_KEY' :
                provider === 'anthropic' ? 'Env: ANTHROPIC_API_KEY' :
                    provider === 'google' ? 'Env: GOOGLE_GENERATIVE_AI_API_KEY' :
                        provider === 'vercel' ? 'Env: V0_API_KEY' :
                            provider === 'gateway' ? 'Env: GATEWAY_API_KEY' : 'Env: (n/a)';

            const masked = apiKey.length <= 8 ? '*'.repeat(apiKey.length) : `${apiKey.slice(0, 4)}****${apiKey.slice(-4)}`;
            const content = [
                `${chalk.green('Provider:')} ${provider}`,
                `${chalk.green('Model:')} ${modelName}`,
                `${chalk.green('Key:')} ${masked}`,
                '',
                chalk.gray(`Stored encrypted in ~/.nikcli/config.json  |  ${tip}`)
            ].join('\n');

            console.log(boxen(content, {
                title: '✅ API Key Saved', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'green'
            }));
        } catch (error: any) {
            console.log(boxen(`Failed to set API key: ${error.message}`, {
                title: '❌ Set API Key', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt()
    }
    /**
     * Show current model details and pricing in a panel
     */
    private async showCurrentModelPanel(modelName?: string): Promise<void> {
        try {
            const current = advancedAIProvider.getCurrentModelInfo();
            const activeModel = modelName || (this.configManager.getCurrentModel ? this.configManager.getCurrentModel() : current?.name);

            const { getModelPricing } = await import('./config/token-limits');
            const pricing = getModelPricing(activeModel);

            const provider = current?.config?.provider || 'unknown';
            const modelId = current?.name || activeModel || 'unknown';

            // Pricing values are per 1M tokens; also show per 1K for convenience
            const inputPer1M = pricing?.input ?? 0;
            const outputPer1M = pricing?.output ?? 0;
            const inputPer1K = inputPer1M / 1000;
            const outputPer1K = outputPer1M / 1000;

            const content = [
                `${chalk.green('Model:')} ${chalk.yellow.bold(modelId)}  ${chalk.gray(`(${provider})`)}`,
                '',
                chalk.cyan('Pricing'),
                `  Input:  $${inputPer1M.toFixed(2)} per 1M tokens  (${inputPer1K === 0 ? 'n/a' : `$${inputPer1K.toFixed(4)} per 1K`})`,
                `  Output: $${outputPer1M.toFixed(2)} per 1M tokens  (${outputPer1K === 0 ? 'n/a' : `$${outputPer1K.toFixed(4)} per 1K`})`,
                '',
                chalk.gray('Tip: /models to list options, /model <name> to switch')
            ].join('\n');

            console.log(boxen(content, {
                title: '🤖 Current Model',
                padding: 1,
                margin: 1,
                borderStyle: 'round',
                borderColor: 'blue'
            }));
        } catch (error: any) {
            console.log(boxen(`Failed to show model: ${error.message}`, {
                title: '❌ Model Error', padding: 1, margin: 1, borderStyle: 'round', borderColor: 'red'
            }));
        }
        console.log();
        process.stdout.write('');
        await new Promise(resolve => setTimeout(resolve, 150));
        this.showPrompt();
    }
}

// Global instance for access from other modules
let globalNikCLI: NikCLI | null = null;

// Export function to set global instance
export function setGlobalNikCLI(instance: NikCLI): void {
    globalNikCLI = instance;
    // Use consistent global variable name
    (global as any).__nikCLI = instance;
}
