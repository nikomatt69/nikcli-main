import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, resolve, extname, dirname } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { createHash } from 'crypto';

export interface FileEmbedding {
  path: string;
  content: string;
  summary: string;
  importance: number;
  lastModified: Date;
  hash: string;
  language: string;
  size: number;
  dependencies: string[];
  exports: string[];
  functions: string[];
  classes: string[];
  types: string[];
}

export interface WorkspaceContext {
  rootPath: string;
  projectName: string;
  framework: string;
  languages: string[];
  files: Map<string, FileEmbedding>;
  structure: any;
  dependencies: string[];
  scripts: Record<string, string>;
  lastAnalyzed: Date;
  gitInfo?: {
    branch: string;
    commits: string[];
    status: string;
  };
}

export interface ConversationContext {
  messages: any[];
  workspaceState: WorkspaceContext;
  executionHistory: any[];
  currentPlan?: ExecutionPlan;
  toolchainState: Map<string, any>;
  userPreferences: {
    language: string;
    framework: string;
    style: string;
    patterns: string[];
  };
}

export interface ExecutionPlan {
  id: string;
  goal: string;
  status: 'planning' | 'executing' | 'completed' | 'failed';
  todos: PlanTodo[];
  createdAt: Date;
  estimatedDuration: number;
  actualDuration?: number;
  context: any;
}

export interface PlanTodo {
  id: string;
  title: string;
  description: string;
  tools: string[];
  dependencies: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  reasoning: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export class WorkspaceRAG {
  private context: WorkspaceContext;
  private embeddings: Map<string, number[]> = new Map();
  private contextCache: Map<string, any> = new Map();

  constructor(workspacePath: string) {
    this.context = this.initializeWorkspace(workspacePath);
    this.analyzeWorkspace();
  }

  private initializeWorkspace(path: string): WorkspaceContext {
    return {
      rootPath: resolve(path),
      projectName: this.extractProjectName(path),
      framework: 'unknown',
      languages: [],
      files: new Map(),
      structure: {},
      dependencies: [],
      scripts: {},
      lastAnalyzed: new Date(),
    };
  }

  private extractProjectName(path: string): string {
    const packageJsonPath = join(path, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        return pkg.name || 'unnamed-project';
      } catch { }
    }
    return require('path').basename(path);
  }

  // Analisi completa del workspace con RAG
  async analyzeWorkspace(): Promise<WorkspaceContext> {
    console.log(chalk.blue('🧠 Building workspace context with RAG...'));

    // 1. Scan all files
    await this.scanFiles();

    // 2. Analyze project structure  
    await this.analyzeProjectStructure();

    // 3. Extract dependencies and relationships
    this.extractDependencies(this.context.files as any, this.context.framework);

    // 4. Analyze git context
    await this.analyzeGitContext();

    // 5. Build semantic understanding
    await this.buildSemanticIndex();

    this.context.lastAnalyzed = new Date();
    return this.context;
  }

  private async scanFiles(): Promise<void> {
    const scanDirectory = (dirPath: string, depth: number = 0): void => {
      if (depth > 5) return; // Prevent infinite recursion

      const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'coverage'];
      const items = readdirSync(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (skipDirs.includes(item.name)) continue;

        const fullPath = join(dirPath, item.name);
        const relativePath = relative(this.context.rootPath, fullPath);

        if (item.isDirectory()) {
          scanDirectory(fullPath, depth + 1);
        } else if (item.isFile()) {
          this.analyzeFile(fullPath, relativePath);
        }
      }
    };

    scanDirectory(this.context.rootPath);
  }

  private analyzeFile(fullPath: string, relativePath: string): void {
    try {
      const stats = statSync(fullPath);
      const content = readFileSync(fullPath, 'utf-8');
      const ext = extname(fullPath);
      const language = this.detectLanguage(ext);

      // Skip binary files and very large files
      if (stats.size > 1024 * 1024 || this.isBinaryFile(ext)) return;

      const fileEmbedding: FileEmbedding = {
        path: relativePath,
        content,
        summary: this.generateFileSummary(content, language),
        importance: this.calculateImportance(relativePath, content, language),
        lastModified: stats.mtime,
        hash: createHash('md5').update(content).digest('hex'),
        language,
        size: stats.size,
        dependencies: this.extractDependencies(content, language),
        exports: this.extractExports(content, language),
        functions: this.extractFunctions(content, language),
        classes: this.extractClasses(content, language),
        types: this.extractTypes(content, language),
      };

      this.context.files.set(relativePath, fileEmbedding);

      // Track languages
      if (!this.context.languages.includes(language)) {
        this.context.languages.push(language);
      }
    } catch (error) {
      // Skip files that can't be read
    }
  }

  private generateFileSummary(content: string, language: string): string {
    const lines = content.split('\n').length;

    switch (language) {
      case 'typescript':
      case 'javascript':
        const imports = (content.match(/import .* from/g) || []).length;
        const exports = (content.match(/export/g) || []).length;
        const functions = (content.match(/function \w+|const \w+ = |=>/g) || []).length;
        return `${language} file with ${lines} lines, ${imports} imports, ${exports} exports, ${functions} functions`;

      case 'json':
        try {
          const parsed = JSON.parse(content);
          const keys = Object.keys(parsed).length;
          return `JSON config with ${keys} keys`;
        } catch {
          return `Invalid JSON file`;
        }

      default:
        return `${language} file with ${lines} lines`;
    }
  }

  private calculateImportance(path: string, content: string, language: string): number {
    let importance = 50; // Base importance

    // Path-based importance
    if (path.includes('package.json')) importance += 40;
    if (path.includes('tsconfig.json')) importance += 30;
    if (path.includes('next.config')) importance += 30;
    if (path.includes('README')) importance += 20;
    if (path.includes('index.')) importance += 20;
    if (path.includes('app.') || path.includes('main.')) importance += 25;
    if (path.includes('config') || path.includes('settings')) importance += 15;
    if (path.includes('types') || path.includes('interfaces')) importance += 15;
    if (path.includes('test') || path.includes('spec')) importance -= 10;

    // Content-based importance
    const lines = content.split('\n').length;
    if (lines > 500) importance += 10;
    if (lines > 1000) importance += 15;

    // Language-specific importance
    if (language === 'typescript') importance += 10;
    if (content.includes('export default')) importance += 10;
    if (content.includes('React.createContext')) importance += 15;

    return Math.min(100, Math.max(0, importance));
  }

  private detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.json': 'json',
      '.md': 'markdown',
      '.css': 'css',
      '.scss': 'scss',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby'
    };
    return langMap[ext] || 'text';
  }

  private isBinaryFile(ext: string): boolean {
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.pdf', '.zip'];
    return binaryExts.includes(ext);
  }

  private extractDependencies(content: string, language: string): string[] {
    const deps: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Import statements
      const importMatches = content.match(/import .* from ['"]([^'"]+)['"]/g);
      if (importMatches) {
        importMatches.forEach(match => {
          const dep = match.match(/from ['"]([^'"]+)['"]/)?.[1];
          if (dep) deps.push(dep);
        });
      }

      // Require statements  
      const requireMatches = content.match(/require\(['"]([^'"]+)['"]\)/g);
      if (requireMatches) {
        requireMatches.forEach(match => {
          const dep = match.match(/require\(['"]([^'"]+)['"]\)/)?.[1];
          if (dep) deps.push(dep);
        });
      }
    }

    return [...new Set(deps)];
  }

  private extractExports(content: string, language: string): string[] {
    const exports: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Named exports
      const namedExports = content.match(/export \{ ([^}]+) \}/g);
      if (namedExports) {
        namedExports.forEach(match => {
          const items = match.replace('export { ', '').replace(' }', '').split(',');
          items.forEach(item => exports.push(item.trim()));
        });
      }

      // Default exports
      if (content.includes('export default')) {
        exports.push('default');
      }

      // Direct exports
      const directExports = content.match(/export (const|function|class) (\w+)/g);
      if (directExports) {
        directExports.forEach(match => {
          const name = match.split(' ')[2];
          if (name) exports.push(name);
        });
      }
    }

    return exports;
  }

  private extractFunctions(content: string, language: string): string[] {
    const functions: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      // Function declarations
      const funcDeclarations = content.match(/function (\w+)/g);
      if (funcDeclarations) {
        funcDeclarations.forEach(match => {
          const name = match.replace('function ', '');
          functions.push(name);
        });
      }

      // Arrow functions
      const arrowFunctions = content.match(/const (\w+) = [^=]*=>/g);
      if (arrowFunctions) {
        arrowFunctions.forEach(match => {
          const name = match.match(/const (\w+)/)?.[1];
          if (name) functions.push(name);
        });
      }
    }

    return functions;
  }

  private extractClasses(content: string, language: string): string[] {
    const classes: string[] = [];

    if (language === 'typescript' || language === 'javascript') {
      const classMatches = content.match(/class (\w+)/g);
      if (classMatches) {
        classMatches.forEach(match => {
          const name = match.replace('class ', '');
          classes.push(name);
        });
      }
    }

    return classes;
  }

  private extractTypes(content: string, language: string): string[] {
    const types: string[] = [];

    if (language === 'typescript') {
      // Interface declarations
      const interfaces = content.match(/interface (\w+)/g);
      if (interfaces) {
        interfaces.forEach(match => {
          const name = match.replace('interface ', '');
          types.push(name);
        });
      }

      // Type declarations
      const typeDeclarations = content.match(/type (\w+)/g);
      if (typeDeclarations) {
        typeDeclarations.forEach(match => {
          const name = match.replace('type ', '');
          types.push(name);
        });
      }
    }

    return types;
  }

  private async analyzeProjectStructure(): Promise<void> {
    // Detect framework
    const packageJsonPath = join(this.context.rootPath, 'package.json');
    if (existsSync(packageJsonPath)) {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      this.context.framework = this.detectFramework(pkg);
      this.context.dependencies = Object.keys(pkg.dependencies || {});
      this.context.scripts = pkg.scripts || {};
    }

    // Analyze directory structure
    this.context.structure = this.buildStructureTree();
  }

  private detectFramework(pkg: any): string {
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    if (deps.next) return 'Next.js';
    if (deps.nuxt) return 'Nuxt.js';
    if (deps['@angular/core']) return 'Angular';
    if (deps.vue) return 'Vue.js';
    if (deps.react) return 'React';
    if (deps.express) return 'Express';
    if (deps.fastify) return 'Fastify';
    if (deps.svelte) return 'Svelte';

    return 'JavaScript/Node.js';
  }

  private buildStructureTree(): any {
    const structure: any = { directories: [], files: [] };

    // Build a semantic tree of the most important parts
    const importantDirs = ['src', 'components', 'pages', 'api', 'lib', 'utils', 'hooks', 'types', 'styles'];
    const importantFiles = Array.from(this.context.files.values())
      .filter(f => f.importance > 70)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);

    structure.importantFiles = importantFiles;
    structure.directories = importantDirs.filter(dir =>
      Array.from(this.context.files.keys()).some(path => path.startsWith(dir + '/'))
    );

    return structure;
  }

  private async analyzeGitContext(): Promise<void> {
    try {
      const gitDir = join(this.context.rootPath, '.git');
      if (existsSync(gitDir)) {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          cwd: this.context.rootPath,
          encoding: 'utf-8'
        }).trim();

        const status = execSync('git status --porcelain', {
          cwd: this.context.rootPath,
          encoding: 'utf-8'
        }).trim();

        const commits = execSync('git log --oneline -10', {
          cwd: this.context.rootPath,
          encoding: 'utf-8'
        }).trim().split('\n');

        this.context.gitInfo = { branch, status, commits };
      }
    } catch (error) {
      // Git not available or not a git repo
    }
  }

  private async buildSemanticIndex(): Promise<void> {
    // Build semantic relationships between files
    for (const [path, file] of this.context.files) {
      // Create simple semantic vectors based on content
      this.embeddings.set(path, this.createSimpleEmbedding(file));
    }
  }

  private createSimpleEmbedding(file: FileEmbedding): number[] {
    // Simple TF-IDF-like embedding for semantic similarity
    const words = file.content.toLowerCase().match(/\b\w+\b/g) || [];
    const wordFreq = new Map<string, number>();

    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Create embedding vector (simplified)
    const embedding = new Array(100).fill(0);
    let index = 0;

    for (const [word, freq] of wordFreq) {
      const hash = this.simpleHash(word) % 100;
      embedding[hash] += freq;
      if (++index > 50) break; // Limit processing
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash);
  }

  // Query methods for the chat system
  getRelevantFiles(query: string, limit: number = 10): FileEmbedding[] {
    const queryWords = query.toLowerCase().match(/\b\w+\b/g) || [];
    const scores: Array<{ file: FileEmbedding, score: number }> = [];

    for (const [path, file] of this.context.files) {
      let score = 0;

      // Content relevance
      queryWords.forEach(word => {
        if (file.content.toLowerCase().includes(word)) {
          score += 1;
        }
        if (file.path.toLowerCase().includes(word)) {
          score += 2;
        }
      });

      // Importance boost
      score += file.importance / 100;

      if (score > 0) {
        scores.push({ file, score });
      }
    }

    return scores
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.file);
  }

  getProjectSummary(): string {
    const fileCount = this.context.files.size;
    const languages = this.context.languages.join(', ');
    const framework = this.context.framework;
    const dependencies = this.context.dependencies.length;

    return `${this.context.projectName} (${framework}) - ${fileCount} files, Languages: ${languages}, ${dependencies} dependencies`;
  }

  getContext(): WorkspaceContext {
    return this.context;
  }

  // Update context when files change
  updateFile(path: string): void {
    const fullPath = join(this.context.rootPath, path);
    if (existsSync(fullPath)) {
      this.analyzeFile(fullPath, path);
    }
  }

  // Get context for specific query/task
  getContextForTask(task: string): {
    relevantFiles: FileEmbedding[];
    projectInfo: any;
    recommendations: string[];
  } {
    const relevantFiles = this.getRelevantFiles(task, 15);
    const projectInfo = {
      name: this.context.projectName,
      framework: this.context.framework,
      languages: this.context.languages,
      structure: this.context.structure,
      scripts: this.context.scripts
    };

    const recommendations = this.generateRecommendations(task, relevantFiles);

    return { relevantFiles, projectInfo, recommendations };
  }

  private generateRecommendations(task: string, files: FileEmbedding[]): string[] {
    const recommendations: string[] = [];

    // Analyze task and suggest relevant patterns
    const taskLower = task.toLowerCase();

    if (taskLower.includes('component') && this.context.framework.includes('React')) {
      recommendations.push('Use functional components with hooks');
      recommendations.push('Follow existing component patterns in /components');
    }

    if (taskLower.includes('api') && files.some(f => f.path.includes('api'))) {
      recommendations.push('Follow existing API structure');
      recommendations.push('Use consistent error handling patterns');
    }

    if (taskLower.includes('test')) {
      const hasTests = files.some(f => f.path.includes('test') || f.path.includes('spec'));
      if (hasTests) {
        recommendations.push('Follow existing test patterns');
      } else {
        recommendations.push('Set up testing infrastructure first');
      }
    }

    return recommendations;
  }
}
