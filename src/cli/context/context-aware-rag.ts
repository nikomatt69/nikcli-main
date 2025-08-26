import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync } from 'fs';
import { join, resolve, relative, extname } from 'path';
import { createHash } from 'crypto';
import chalk from 'chalk';

// Vector similarity and embeddings (simple implementation)
interface EmbeddingVector {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, any>;
  timestamp: Date;
}

interface WorkspaceMemory {
  files: Map<string, FileMemory>;
  interactions: InteractionMemory[];
  context: WorkspaceContext;
  embeddings: EmbeddingVector[];
  lastUpdated: Date;
}

interface FileMemory {
  path: string;
  hash: string;
  content: string;
  summary: string;
  language: string;
  imports: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  lastAnalyzed: Date;
  importance: number;
}

interface InteractionMemory {
  id: string;
  timestamp: Date;
  userInput: string;
  aiResponse: string;
  actions: ActionMemory[];
  context: string;
  successful: boolean;
}

interface ActionMemory {
  type: 'read_file' | 'write_file' | 'execute_command' | 'analyze' | 'generate';
  target: string;
  params: any;
  result: any;
  duration: number;
}

interface WorkspaceContext {
  rootPath: string;
  projectName: string;
  framework: string;
  languages: string[];
  dependencies: Record<string, string>;
  structure: any;
  currentGoals: string[];
  recentChanges: string[];
  problemsIdentified: string[];
  solutionsApplied: string[];
}

export class ContextAwareRAGSystem {
  private memory!: WorkspaceMemory;
  private memoryPath: string;
  private workingDir: string;

  constructor(workingDirectory: string) {
    this.workingDir = resolve(workingDirectory);
    this.memoryPath = join(this.workingDir, '.nikcli');
    this.ensureMemoryDir();
    this.loadMemory();
  }

  private ensureMemoryDir(): void {
    if (!existsSync(this.memoryPath)) {
      mkdirSync(this.memoryPath, { recursive: true });
    }
  }

  private loadMemory(): void {
    const memoryFile = join(this.memoryPath, 'workspace-memory.json');

    if (existsSync(memoryFile)) {
      try {
        const data = JSON.parse(readFileSync(memoryFile, 'utf-8'));
        this.memory = {
          files: new Map(data.files || []),
          interactions: data.interactions || [],
          context: data.context || this.createInitialContext(),
          embeddings: data.embeddings || [],
          lastUpdated: new Date(data.lastUpdated || Date.now())
        };
      } catch (error) {
        console.log(chalk.yellow('⚠️ Could not load existing memory, creating new'));
        this.memory = this.createFreshMemory();
      }
    } else {
      this.memory = this.createFreshMemory();
    }
  }

  private createFreshMemory(): WorkspaceMemory {
    return {
      files: new Map(),
      interactions: [],
      context: this.createInitialContext(),
      embeddings: [],
      lastUpdated: new Date()
    };
  }

  private createInitialContext(): WorkspaceContext {
    return {
      rootPath: this.workingDir,
      projectName: 'Unknown',
      framework: 'Unknown',
      languages: [],
      dependencies: {},
      structure: {},
      currentGoals: [],
      recentChanges: [],
      problemsIdentified: [],
      solutionsApplied: []
    };
  }

  private saveMemory(): void {
    const memoryFile = join(this.memoryPath, 'workspace-memory.json');
    const data = {
      files: Array.from(this.memory.files.entries()),
      interactions: this.memory.interactions,
      context: this.memory.context,
      embeddings: this.memory.embeddings,
      lastUpdated: new Date()
    };

    try {
      writeFileSync(memoryFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log(chalk.red('❌ Failed to save workspace memory'));
    }
  }

  // Context-aware file analysis
  async analyzeFile(filePath: string, content?: string): Promise<FileMemory> {
    const fullPath = resolve(this.workingDir, filePath);
    const relativePath = relative(this.workingDir, fullPath);

    if (!content) {
      if (!existsSync(fullPath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      content = readFileSync(fullPath, 'utf-8');
    }

    const hash = createHash('md5').update(content).digest('hex');
    const language = this.detectLanguage(extname(filePath));

    // Check if file changed
    const existingMemory = this.memory.files.get(relativePath);
    if (existingMemory && existingMemory.hash === hash) {
      return existingMemory; // No changes
    }

    console.log(chalk.blue(`🔍 Analyzing: ${relativePath}`));

    const analysis = this.performCodeAnalysis(content, language);
    const summary = await this.generateFileSummary(content, language, analysis);
    const importance = this.calculateImportance(relativePath, analysis);

    const fileMemory: FileMemory = {
      path: relativePath,
      hash,
      content,
      summary,
      language,
      imports: analysis.imports,
      exports: analysis.exports,
      functions: analysis.functions,
      classes: analysis.classes,
      lastAnalyzed: new Date(),
      importance
    };

    this.memory.files.set(relativePath, fileMemory);

    // Create embedding for semantic search
    await this.createEmbedding(relativePath, content, summary);

    this.saveMemory();
    return fileMemory;
  }

  // Comprehensive workspace analysis
  async analyzeWorkspace(): Promise<WorkspaceContext> {
    console.log(chalk.blue('🔍 Performing comprehensive workspace analysis...'));

    // Analyze package.json first
    const packagePath = join(this.workingDir, 'package.json');
    if (existsSync(packagePath)) {
      const packageContent = readFileSync(packagePath, 'utf-8');
      const packageJson = JSON.parse(packageContent);

      this.memory.context.projectName = packageJson.name || 'Unknown';
      this.memory.context.dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      this.memory.context.framework = this.detectFramework(packageJson);
    }

    // Scan and analyze important files
    const importantFiles = await this.findImportantFiles();

    for (const filePath of importantFiles) {
      try {
        await this.analyzeFile(filePath);
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Could not analyze ${filePath}`));
      }
    }

    // Update context with findings
    this.memory.context.languages = this.extractLanguages();
    this.memory.context.structure = this.buildProjectStructure();

    this.saveMemory();
    return this.memory.context;
  }

  // Semantic search and retrieval
  async searchRelevantContext(query: string, maxResults: number = 5): Promise<FileMemory[]> {
    const queryEmbedding = this.createSimpleEmbedding(query);
    const results: Array<{ file: FileMemory; similarity: number }> = [];

    for (const [path, file] of this.memory.files) {
      // Simple text similarity (in production, use proper embeddings)
      const similarity = this.calculateSimilarity(query, file.content + ' ' + file.summary);

      if (similarity > 0.1) {
        results.push({ file, similarity });
      }
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults)
      .map(r => r.file);
  }

  // Store interaction for learning
  recordInteraction(userInput: string, aiResponse: string, actions: ActionMemory[]): string {
    const interaction: InteractionMemory = {
      id: createHash('md5').update(`${Date.now()}-${userInput}`).digest('hex').substring(0, 8),
      timestamp: new Date(),
      userInput,
      aiResponse,
      actions,
      context: this.generateCurrentContextString(),
      successful: actions.every(a => !a.result?.error)
    };

    this.memory.interactions.push(interaction);

    // Keep only last 100 interactions
    if (this.memory.interactions.length > 100) {
      this.memory.interactions = this.memory.interactions.slice(-100);
    }

    this.saveMemory();
    return interaction.id;
  }

  // Get relevant context for AI
  getContextForAI(query?: string): {
    workspaceContext: WorkspaceContext;
    relevantFiles: FileMemory[];
    recentInteractions: InteractionMemory[];
    currentGoals: string[];
    knownProblems: string[];
  } {
    let relevantFiles: FileMemory[] = [];

    if (query) {
      // Get semantically relevant files
      relevantFiles = Array.from(this.memory.files.values())
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 10);
    } else {
      // Get most important files
      relevantFiles = Array.from(this.memory.files.values())
        .sort((a, b) => b.importance - a.importance)
        .slice(0, 8);
    }

    const recentInteractions = this.memory.interactions
      .slice(-5)
      .filter(i => i.successful);

    return {
      workspaceContext: this.memory.context,
      relevantFiles,
      recentInteractions,
      currentGoals: this.memory.context.currentGoals,
      knownProblems: this.memory.context.problemsIdentified
    };
  }

  // Update current goals and problems
  updateGoals(goals: string[]): void {
    this.memory.context.currentGoals = goals;
    this.saveMemory();
  }

  addProblem(problem: string): void {
    if (!this.memory.context.problemsIdentified.includes(problem)) {
      this.memory.context.problemsIdentified.push(problem);
      this.saveMemory();
    }
  }

  addSolution(solution: string): void {
    if (!this.memory.context.solutionsApplied.includes(solution)) {
      this.memory.context.solutionsApplied.push(solution);
      this.saveMemory();
    }
  }

  addRecentChange(change: string): void {
    this.memory.context.recentChanges.push(change);

    // Keep only last 20 changes
    if (this.memory.context.recentChanges.length > 20) {
      this.memory.context.recentChanges = this.memory.context.recentChanges.slice(-20);
    }

    this.saveMemory();
  }

  // Helper methods
  private performCodeAnalysis(content: string, language: string): any {
    const analysis = {
      imports: [] as string[],
      exports: [] as string[],
      functions: [] as string[],
      classes: [] as string[],
      lines: content.split('\n').length,
      complexity: 0
    };

    switch (language) {
      case 'typescript':
      case 'javascript':
        analysis.imports = (content.match(/import .* from ['"`].*['"`]/g) || []);
        analysis.exports = (content.match(/export .*/g) || []);
        analysis.functions = (content.match(/function \w+|const \w+ = |=>/g) || []);
        analysis.classes = (content.match(/class \w+/g) || []);
        break;
      case 'python':
        analysis.imports = (content.match(/from .* import .*|import .*/g) || []);
        analysis.functions = (content.match(/def \w+/g) || []);
        analysis.classes = (content.match(/class \w+/g) || []);
        break;
    }

    analysis.complexity = this.calculateComplexity(content);
    return analysis;
  }

  private async generateFileSummary(content: string, language: string, analysis: any): Promise<string> {
    // Simple rule-based summary (in production, use AI)
    const lines = content.split('\n').length;
    const summary = `${language} file with ${analysis.functions.length} functions, ${analysis.classes.length} classes (${lines} lines)`;

    // Add specific insights based on content
    if (content.includes('useState') || content.includes('useEffect')) {
      return `React ${summary} with hooks`;
    }
    if (content.includes('express') || content.includes('app.listen')) {
      return `Express ${summary} with API endpoints`;
    }
    if (content.includes('test(') || content.includes('describe(')) {
      return `Test ${summary}`;
    }

    return summary;
  }

  private calculateImportance(path: string, analysis: any): number {
    let importance = 0;

    // Path-based importance
    if (path.includes('index.')) importance += 20;
    if (path.includes('app.') || path.includes('main.')) importance += 25;
    if (path.includes('package.json')) importance += 30;
    if (path.includes('tsconfig.json')) importance += 15;
    if (path.includes('src/')) importance += 10;
    if (path.includes('components/')) importance += 5;

    // Content-based importance
    importance += Math.min(analysis.functions.length * 2, 20);
    importance += Math.min(analysis.classes.length * 3, 15);
    importance += Math.min(analysis.imports.length, 10);

    return Math.min(importance, 100);
  }

  private async findImportantFiles(): Promise<string[]> {
    const important: string[] = [];
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.json', '.md'];

    const scan = (dir: string, depth: number = 0) => {
      if (depth > 3) return; // Limit depth

      try {
        const items = readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
          const fullPath = join(dir, item.name);
          const relativePath = relative(this.workingDir, fullPath);

          // Skip common ignored directories
          if (item.name.startsWith('.') && item.name !== '.env') continue;
          if (['node_modules', 'dist', 'build', '.git'].includes(item.name)) continue;

          if (item.isDirectory()) {
            scan(fullPath, depth + 1);
          } else if (item.isFile() && extensions.includes(extname(item.name))) {
            important.push(relativePath);
          }
        }
      } catch (error) {
        // Skip inaccessible directories
      }
    };

    scan(this.workingDir);
    return important;
  }

  private detectLanguage(extension: string): string {
    const map: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.json': 'json',
      '.md': 'markdown'
    };
    return map[extension] || 'text';
  }

  private detectFramework(packageJson: any): string {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps.next) return 'Next.js';
    if (deps.react) return 'React';
    if (deps.vue) return 'Vue.js';
    if (deps.express) return 'Express';
    if (deps.fastify) return 'Fastify';
    if (deps.nestjs) return 'Nest.js';
    if (deps.bun) return 'Bun';
    if (deps.deno) return 'Deno';
    if (deps.rails) return 'Ruby on Rails';
    if (deps.spring) return 'Spring Boot';
    if (deps.aspnet) return 'ASP.NET';
    if (deps.laravel) return 'Laravel';
    if (deps.yii) return 'Yii';
    if (deps.symfony) return 'Symfony';
    if (deps.elixir) return 'Elixir';
    if (deps.phoenix) return 'Phoenix';
    if (deps.flutter) return 'Flutter';
    if (deps.swift) return 'Swift';
    if (deps.kotlin) return 'Kotlin';
    if (deps.golang) return 'Go';
    if (deps.erlang) return 'Erlang';
    if (deps.elixir) return 'Elixir';


    return 'Node.js';
  }

  private extractLanguages(): string[] {
    const languages = new Set<string>();
    for (const file of this.memory.files.values()) {
      if (file.language !== 'text') {
        languages.add(file.language);
      }
    }
    return Array.from(languages);
  }

  private buildProjectStructure(): any {
    // Build simplified structure from memory
    const structure: any = {};

    for (const file of this.memory.files.values()) {
      const parts = file.path.split('/');
      let current = structure;

      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]]) current[parts[i]] = {};
        current = current[parts[i]];
      }

      if (!current._files) current._files = [];
      current._files.push(parts[parts.length - 1]);
    }

    return structure;
  }

  private createSimpleEmbedding(text: string): number[] {
    // Simple embedding - in production use proper embeddings
    const words = text.toLowerCase().split(/\W+/);
    const vector = new Array(100).fill(0);

    for (let i = 0; i < words.length; i++) {
      const hash = this.simpleHash(words[i]);
      vector[hash % 100] += 1;
    }

    return vector;
  }

  private async createEmbedding(path: string, content: string, summary: string): Promise<void> {
    const text = `${path} ${summary} ${content.substring(0, 500)}`;
    const vector = this.createSimpleEmbedding(text);

    const embedding: EmbeddingVector = {
      id: path,
      content: summary,
      vector,
      metadata: { path, language: this.detectLanguage(extname(path)) },
      timestamp: new Date()
    };

    // Replace existing embedding
    this.memory.embeddings = this.memory.embeddings.filter(e => e.id !== path);
    this.memory.embeddings.push(embedding);
  }

  private calculateSimilarity(query: string, content: string): number {
    const queryWords = new Set(query.toLowerCase().split(/\W+/));
    const contentWords = new Set(content.toLowerCase().split(/\W+/));

    const intersection = new Set([...queryWords].filter(x => contentWords.has(x)));
    const union = new Set([...queryWords, ...contentWords]);

    return intersection.size / union.size;
  }

  private calculateComplexity(content: string): number {
    let complexity = 0;

    // Simple complexity metrics
    complexity += (content.match(/if\s*\(/g) || []).length;
    complexity += (content.match(/for\s*\(/g) || []).length * 2;
    complexity += (content.match(/while\s*\(/g) || []).length * 2;
    complexity += (content.match(/switch\s*\(/g) || []).length * 3;
    complexity += (content.match(/catch\s*\(/g) || []).length;

    return complexity;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generateCurrentContextString(): string {
    const ctx = this.memory.context;
    return `Project: ${ctx.projectName} (${ctx.framework}) | Files: ${this.memory.files.size} | Languages: ${ctx.languages.join(', ')}`;
  }

  // Clear memory (useful for testing)
  clearMemory(): void {
    this.memory = this.createFreshMemory();
    this.saveMemory();
  }

  // Get memory stats
  getMemoryStats(): any {
    return {
      totalFiles: this.memory.files.size,
      totalInteractions: this.memory.interactions.length,
      successfulInteractions: this.memory.interactions.filter(i => i.successful).length,
      currentGoals: this.memory.context.currentGoals.length,
      knownProblems: this.memory.context.problemsIdentified.length,
      lastUpdated: this.memory.lastUpdated
    };
  }
}
