import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { logger } from '../../utils/logger';
import { UniversalAgent } from '../universal-agent';
import { BackgroundAgentInstance } from '../../services/background-agent-service';

/**
 * Code Analyzer Agent
 * Continuously analyzes code for quality, patterns, and issues
 */
export class CodeAnalyzerAgent extends EventEmitter {
  private instance: BackgroundAgentInstance;
  private agent: UniversalAgent;
  private isRunning = false;
  private analysisCache: Map<string, { hash: string; lastAnalyzed: Date; results: any }> = new Map();
  private analysisQueue: string[] = [];
  private isAnalyzing = false;

  constructor(instance: BackgroundAgentInstance, agent: UniversalAgent) {
    super();
    this.instance = instance;
    this.agent = agent;
  }

  /**
   * Start the code analyzer
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      await logger.logService('warn', 'code-analyzer-agent', 'Code analyzer is already running');
      return;
    }

    try {
      this.isRunning = true;
      
      // Initialize analysis cache
      await this.initializeAnalysisCache();

      // Start analysis loop
      this.startAnalysisLoop();

      await logger.logService('info', 'code-analyzer-agent', 'Started code analyzer', {
        agentId: this.instance.id,
        workingDirectory: this.instance.config.workingDirectory
      });

      this.emit('started');

    } catch (error: any) {
      await logger.logService('error', 'code-analyzer-agent', 'Failed to start code analyzer', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Stop the code analyzer
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      await logger.logService('warn', 'code-analyzer-agent', 'Code analyzer is not running');
      return;
    }

    try {
      this.isRunning = false;
      this.analysisQueue = [];

      await logger.logService('info', 'code-analyzer-agent', 'Stopped code analyzer', {
        agentId: this.instance.id
      });

      this.emit('stopped');

    } catch (error: any) {
      await logger.logService('error', 'code-analyzer-agent', 'Failed to stop code analyzer', {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  /**
   * Get current status
   */
  public getStatus(): { 
    isRunning: boolean; 
    isAnalyzing: boolean; 
    queueLength: number; 
    analyzedFiles: number; 
    lastActivity?: Date 
  } {
    return {
      isRunning: this.isRunning,
      isAnalyzing: this.isAnalyzing,
      queueLength: this.analysisQueue.length,
      analyzedFiles: this.analysisCache.size,
      lastActivity: this.instance.lastActivity
    };
  }

  /**
   * Queue a file for analysis
   */
  public async queueFile(filePath: string): Promise<void> {
    if (!this.analysisQueue.includes(filePath)) {
      this.analysisQueue.push(filePath);
      await logger.logService('debug', 'code-analyzer-agent', `Queued file for analysis: ${filePath}`, {
        agentId: this.instance.id
      });
    }
  }

  /**
   * Analyze a specific file
   */
  public async analyzeFile(filePath: string): Promise<any> {
    try {
      const fullPath = path.resolve(this.instance.config.workingDirectory, filePath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      const hash = this.hashContent(content);
      
      // Check if file needs analysis
      const cached = this.analysisCache.get(fullPath);
      if (cached && cached.hash === hash) {
        await logger.logService('debug', 'code-analyzer-agent', `File unchanged, using cached analysis: ${filePath}`, {
          agentId: this.instance.id
        });
        return cached.results;
      }

      // Perform analysis
      const results = await this.performAnalysis(fullPath, content, path.extname(filePath));

      // Cache results
      this.analysisCache.set(fullPath, {
        hash,
        lastAnalyzed: new Date(),
        results
      });

      this.instance.lastActivity = new Date();
      this.emit('file-analyzed', { filePath, results });

      return results;

    } catch (error: any) {
      await logger.logService('error', 'code-analyzer-agent', `Failed to analyze file: ${filePath}`, {
        error: error.message,
        agentId: this.instance.id
      });
      throw error;
    }
  }

  private async initializeAnalysisCache(): Promise<void> {
    this.analysisCache.clear();

    const { workingDirectory } = this.instance.config;
    const codeFiles = await this.findCodeFiles(workingDirectory);

    for (const file of codeFiles) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        const hash = this.hashContent(content);
        
        this.analysisCache.set(file, {
          hash,
          lastAnalyzed: new Date(0), // Mark as needing analysis
          results: null
        });
      } catch (error) {
        // Skip files that can't be read
        continue;
      }
    }

    await logger.logService('info', 'code-analyzer-agent', `Initialized analysis cache with ${this.analysisCache.size} files`, {
      agentId: this.instance.id
    });
  }

  private async findCodeFiles(workingDirectory: string): Promise<string[]> {
    const { glob } = await import('globby');
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.py',
      '**/*.java',
      '**/*.cpp',
      '**/*.c',
      '**/*.h'
    ];

    const files = await glob(patterns, {
      cwd: workingDirectory,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
        '**/.next/**',
        '**/coverage/**'
      ]
    });

    return files.map(file => path.resolve(workingDirectory, file));
  }

  private startAnalysisLoop(): void {
    const interval = this.instance.config.interval || 30000; // Default 30 seconds

    setInterval(async () => {
      if (!this.isRunning || this.isAnalyzing) {
        return;
      }

      await this.processAnalysisQueue();
    }, interval);
  }

  private async processAnalysisQueue(): Promise<void> {
    if (this.analysisQueue.length === 0) {
      return;
    }

    this.isAnalyzing = true;

    try {
      const filePath = this.analysisQueue.shift()!;
      await this.analyzeFile(filePath);
    } catch (error: any) {
      await logger.logService('error', 'code-analyzer-agent', 'Failed to process analysis queue', {
        error: error.message,
        agentId: this.instance.id
      });
    } finally {
      this.isAnalyzing = false;
    }
  }

  private async performAnalysis(filePath: string, content: string, extension: string): Promise<any> {
    const taskId = nanoid();
    
    await logger.logService('info', 'code-analyzer-agent', `Performing analysis: ${filePath}`, {
      filePath,
      taskId,
      agentId: this.instance.id
    });

    // Create analysis task
    const task = {
      id: taskId,
      type: 'code-analysis',
      title: `Code Analysis: ${path.basename(filePath)}`,
      description: `Analyze code quality and patterns for ${filePath}`,
      priority: 'normal' as const,
      status: 'pending' as const,
      data: {
        filePath,
        content,
        extension,
        analysisType: this.getAnalysisType(extension)
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      progress: 0
    };

    // Execute analysis with universal agent
    const result = await this.agent.executeTask(task);

    // Extract analysis results
    const analysisResults = {
      filePath,
      extension,
      analysisType: this.getAnalysisType(extension),
      metrics: this.extractMetrics(content, extension),
      issues: this.extractIssues(content, extension),
      suggestions: this.extractSuggestions(content, extension),
      complexity: this.calculateComplexity(content, extension),
      timestamp: new Date(),
      agentResult: result
    };

    await logger.logService('info', 'code-analyzer-agent', `Analysis completed: ${filePath}`, {
      filePath,
      taskId,
      status: result.status,
      agentId: this.instance.id
    });

    return analysisResults;
  }

  private getAnalysisType(extension: string): string {
    switch (extension.toLowerCase()) {
      case '.ts':
      case '.tsx':
        return 'typescript';
      case '.js':
      case '.jsx':
        return 'javascript';
      case '.py':
        return 'python';
      case '.java':
        return 'java';
      case '.cpp':
      case '.c':
      case '.h':
        return 'cpp';
      default:
        return 'generic';
    }
  }

  private extractMetrics(content: string, extension: string): any {
    const lines = content.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim().length > 0);
    const commentLines = lines.filter(line => line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*'));

    return {
      totalLines: lines.length,
      nonEmptyLines: nonEmptyLines.length,
      commentLines: commentLines.length,
      commentRatio: lines.length > 0 ? commentLines.length / lines.length : 0,
      averageLineLength: nonEmptyLines.length > 0 ? 
        nonEmptyLines.reduce((sum, line) => sum + line.length, 0) / nonEmptyLines.length : 0,
      maxLineLength: Math.max(...lines.map(line => line.length), 0)
    };
  }

  private extractIssues(content: string, extension: string): any[] {
    const issues: any[] = [];
    const lines = content.split('\n');

    // Basic issue detection
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      // Check for long lines
      if (line.length > 120) {
        issues.push({
          type: 'style',
          severity: 'warning',
          message: 'Line too long',
          line: lineNumber,
          column: 1
        });
      }

      // Check for TODO comments
      if (line.includes('TODO') || line.includes('FIXME') || line.includes('HACK')) {
        issues.push({
          type: 'todo',
          severity: 'info',
          message: 'TODO/FIXME/HACK comment found',
          line: lineNumber,
          column: line.indexOf('TODO') || line.indexOf('FIXME') || line.indexOf('HACK')
        });
      }

      // Check for console.log in production code
      if (line.includes('console.log') && !line.includes('//')) {
        issues.push({
          type: 'debug',
          severity: 'warning',
          message: 'console.log found - consider removing for production',
          line: lineNumber,
          column: line.indexOf('console.log')
        });
      }
    }

    return issues;
  }

  private extractSuggestions(content: string, extension: string): any[] {
    const suggestions: any[] = [];

    // Basic suggestions based on content analysis
    if (content.includes('var ')) {
      suggestions.push({
        type: 'modernization',
        message: 'Consider using let/const instead of var',
        priority: 'medium'
      });
    }

    if (content.includes('function(') && !content.includes('=>')) {
      suggestions.push({
        type: 'modernization',
        message: 'Consider using arrow functions for better readability',
        priority: 'low'
      });
    }

    if (content.includes('==') && !content.includes('===')) {
      suggestions.push({
        type: 'best-practice',
        message: 'Consider using strict equality (===) instead of loose equality (==)',
        priority: 'high'
      });
    }

    return suggestions;
  }

  private calculateComplexity(content: string, extension: string): any {
    const lines = content.split('\n');
    let complexity = 1; // Base complexity
    let nestingLevel = 0;
    let maxNesting = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Count control structures
      if (trimmed.includes('if') || trimmed.includes('for') || trimmed.includes('while') || 
          trimmed.includes('switch') || trimmed.includes('catch') || trimmed.includes('try')) {
        complexity++;
        nestingLevel++;
        maxNesting = Math.max(maxNesting, nestingLevel);
      }
      
      // Count closing braces (reduce nesting)
      if (trimmed.includes('}')) {
        nestingLevel = Math.max(0, nestingLevel - 1);
      }
    }

    return {
      cyclomaticComplexity: complexity,
      maxNestingLevel: maxNesting,
      averageNestingLevel: lines.length > 0 ? complexity / lines.length : 0
    };
  }

  private hashContent(content: string): string {
    // Simple hash function for content comparison
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}