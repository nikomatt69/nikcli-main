import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import * as chokidar from 'chokidar';
import { marked } from 'marked';
import * as yaml from 'js-yaml';

export interface GuidanceFile {
  path: string;
  type: 'claude' | 'codex' | 'agents' | 'nikocli';
  level: 'global' | 'project' | 'subdirectory';
  content: string;
  lastModified: Date;
  parsed?: {
    frontmatter?: Record<string, any>;
    sections?: Record<string, string>;
    instructions?: string[];
  };
}

export interface GuidanceContext {
  globalGuidance: GuidanceFile[];
  projectGuidance: GuidanceFile[];
  subdirGuidance: GuidanceFile[];
  mergedInstructions: string;
  lastUpdated: Date;
}

/**
 * GuidanceManager - Core system for CLAUDE.md/CODEX.md integration
 * Automatically detects, parses, and injects guidance files into AI context
 */
export class GuidanceManager {
  private watchers: chokidar.FSWatcher[] = [];
  private guidanceFiles: Map<string, GuidanceFile> = new Map();
  private currentContext: GuidanceContext | null = null;
  private workingDirectory: string;
  private globalGuidanceDir: string;
  private onContextUpdate?: (context: GuidanceContext) => void;

  constructor(workingDirectory: string, globalGuidanceDir?: string) {
    this.workingDirectory = workingDirectory;
    this.globalGuidanceDir = globalGuidanceDir || path.join(require('os').homedir(), '.nikcli');
    this.ensureGlobalGuidanceDir();
  }

  private ensureGlobalGuidanceDir(): void {
    if (!fs.existsSync(this.globalGuidanceDir)) {
      fs.mkdirSync(this.globalGuidanceDir, { recursive: true });
      console.log(chalk.blue(`📁 Created global guidance directory: ${this.globalGuidanceDir}`));
    }
  }

  /**
   * Initialize the guidance system
   */
  async initialize(onContextUpdate?: (context: GuidanceContext) => void): Promise<void> {
    this.onContextUpdate = onContextUpdate;

    console.log(chalk.blue('🧠 Initializing guidance system...'));

    // Scan for existing guidance files
    await this.scanGuidanceFiles();

    // Set up file watchers
    this.setupFileWatchers();

    // Build initial context
    await this.updateContext();

    console.log(chalk.green(`✅ Guidance system initialized with ${this.guidanceFiles.size} files`));
  }

  /**
   * Scan for all guidance files in global, project, and subdirectories
   */
  private async scanGuidanceFiles(): Promise<void> {
    const guidanceTypes = ['CLAUDE.md', 'CODEX.md', 'AGENTS.md'];

    // Scan global directory
    for (const filename of guidanceTypes) {
      const globalPath = path.join(this.globalGuidanceDir, filename);
      if (fs.existsSync(globalPath)) {
        await this.loadGuidanceFile(globalPath, 'global');
      }
    }

    // Scan project directory and subdirectories
    await this.scanProjectGuidance(this.workingDirectory);
  }

  private async scanProjectGuidance(dir: string): Promise<void> {
    const guidanceTypes = ['CLAUDE.md', 'CODEX.md', 'AGENTS.md', 'NIKOCLI.md'];

    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });

      // Check for guidance files in current directory
      for (const filename of guidanceTypes) {
        const filePath = path.join(dir, filename);
        if (fs.existsSync(filePath)) {
          const level = dir === this.workingDirectory ? 'project' : 'subdirectory';
          await this.loadGuidanceFile(filePath, level);
        }
      }

      // Recursively scan subdirectories (but avoid node_modules, .git, etc.)
      for (const item of items) {
        if (item.isDirectory() && !this.shouldSkipDirectory(item.name)) {
          const subDir = path.join(dir, item.name);
          await this.scanProjectGuidance(subDir);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = ['node_modules', '.git', '.next', 'dist', 'build', '.vscode', '.idea'];
    return skipDirs.includes(name) || name.startsWith('.');
  }

  /**
   * Load and parse a guidance file
   */
  private async loadGuidanceFile(filePath: string, level: 'global' | 'project' | 'subdirectory'): Promise<void> {
    try {
      const stats = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const filename = path.basename(filePath);

      const type = filename.startsWith('CLAUDE') ? 'claude' :
        filename.startsWith('CODEX') ? 'codex' : 'agents';

      const guidanceFile: GuidanceFile = {
        path: filePath,
        type,
        level,
        content,
        lastModified: stats.mtime,
        parsed: await this.parseGuidanceFile(content, type)
      };

      this.guidanceFiles.set(filePath, guidanceFile);

      console.log(chalk.cyan(`📋 Loaded ${level} guidance: ${path.relative(this.workingDirectory, filePath)}`));
    } catch (error: any) {
      console.log(chalk.yellow(`⚠️ Could not load guidance file ${filePath}: ${error.message}`));
    }
  }

  /**
   * Parse guidance file content and extract structured information
   */
  private async parseGuidanceFile(content: string, type: 'claude' | 'codex' | 'agents'): Promise<any> {
    const parsed: any = {
      sections: {},
      instructions: []
    };

    // Try to extract YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (frontmatterMatch) {
      try {
        parsed.frontmatter = yaml.load(frontmatterMatch[1]);
        content = frontmatterMatch[2];
      } catch (error) {
        // If YAML parsing fails, treat as regular markdown
      }
    }

    // Parse markdown sections
    const tokens = marked.lexer(content);
    let currentSection = '';
    let currentContent = '';

    for (const token of tokens) {
      if (token.type === 'heading' && token.depth <= 2) {
        // Save previous section
        if (currentSection && currentContent.trim()) {
          parsed.sections[currentSection] = currentContent.trim();
        }

        currentSection = token.text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, '_');
        currentContent = '';
      } else if (token.type === 'list') {
        // Extract instructions from lists
        const items = this.extractListItems(token);
        parsed.instructions.push(...items);
        currentContent += this.tokenToText(token) + '\n';
      } else {
        currentContent += this.tokenToText(token) + '\n';
      }
    }

    // Save last section
    if (currentSection && currentContent.trim()) {
      parsed.sections[currentSection] = currentContent.trim();
    }

    // If no sections found, treat entire content as instructions
    if (Object.keys(parsed.sections).length === 0) {
      parsed.sections.general = content.trim();
    }

    return parsed;
  }

  private extractListItems(listToken: any): string[] {
    const items: string[] = [];

    if (listToken.items) {
      for (const item of listToken.items) {
        if (item.tokens) {
          const text = item.tokens.map((t: any) => this.tokenToText(t)).join('').trim();
          if (text) items.push(text);
        }
      }
    }

    return items;
  }

  private tokenToText(token: any): string {
    switch (token.type) {
      case 'paragraph':
        return token.tokens ? token.tokens.map((t: any) => this.tokenToText(t)).join('') : '';
      case 'text':
        return token.text || '';
      case 'code':
        return `\`${token.text}\``;
      case 'codespan':
        return `\`${token.text}\``;
      case 'strong':
        return `**${token.text}**`;
      case 'em':
        return `*${token.text}*`;
      default:
        return token.raw || token.text || '';
    }
  }

  /**
   * Set up file watchers for automatic updates
   */
  private setupFileWatchers(): void {
    const watchPaths = [
      path.join(this.globalGuidanceDir, '*.md'),
      path.join(this.workingDirectory, '**/CLAUDE.md'),
      path.join(this.workingDirectory, '**/NIKOCLI.md'),
      path.join(this.workingDirectory, '**/CODEX.md'),
      path.join(this.workingDirectory, '**/AGENTS.md')
    ];

    for (const watchPath of watchPaths) {
      const watcher = chokidar.watch(watchPath, {
        ignored: /node_modules|\.git|\.next|dist|build/,
        persistent: true,
        ignoreInitial: true
      });

      watcher.on('add', (filePath) => this.handleFileChange(filePath, 'add'));
      watcher.on('change', (filePath) => this.handleFileChange(filePath, 'change'));
      watcher.on('unlink', (filePath) => this.handleFileChange(filePath, 'unlink'));

      this.watchers.push(watcher);
    }

    console.log(chalk.blue('👀 File watchers active for guidance files'));
  }

  private async handleFileChange(filePath: string, changeType: 'add' | 'change' | 'unlink'): Promise<void> {
    console.log(chalk.yellow(`📝 Guidance file ${changeType}: ${path.relative(this.workingDirectory, filePath)}`));

    if (changeType === 'unlink') {
      this.guidanceFiles.delete(filePath);
    } else {
      const level = filePath.includes(this.globalGuidanceDir) ? 'global' :
        path.dirname(filePath) === this.workingDirectory ? 'project' : 'subdirectory';
      await this.loadGuidanceFile(filePath, level);
    }

    await this.updateContext();
  }

  /**
   * Update the merged guidance context
   */
  private async updateContext(): Promise<void> {
    const globalGuidance = Array.from(this.guidanceFiles.values()).filter(f => f.level === 'global');
    const projectGuidance = Array.from(this.guidanceFiles.values()).filter(f => f.level === 'project');
    const subdirGuidance = Array.from(this.guidanceFiles.values()).filter(f => f.level === 'subdirectory');

    // Merge instructions with proper priority (subdirectory > project > global)
    const mergedInstructions = this.mergeInstructions(globalGuidance, projectGuidance, subdirGuidance);

    this.currentContext = {
      globalGuidance,
      projectGuidance,
      subdirGuidance,
      mergedInstructions,
      lastUpdated: new Date()
    };

    console.log(chalk.green(`🔄 Guidance context updated (${globalGuidance.length + projectGuidance.length + subdirGuidance.length} files)`));

    // Notify listeners
    if (this.onContextUpdate && this.currentContext) {
      this.onContextUpdate(this.currentContext);
    }
  }

  /**
   * Merge instructions from multiple guidance files
   */
  private mergeInstructions(global: GuidanceFile[], project: GuidanceFile[], subdir: GuidanceFile[]): string {
    let instructions: string[] = [];

    // Add global instructions first
    for (const file of global) {
      if (file.parsed?.sections?.general) {
        instructions.push(`# Global ${file.type.toUpperCase()} Guidelines\n${file.parsed.sections.general}`);
      }
      for (const [section, content] of Object.entries(file.parsed?.sections || {})) {
        if (section !== 'general') {
          instructions.push(`## Global ${section.replace(/_/g, ' ')}\n${content}`);
        }
      }
    }

    // Add project-level instructions
    for (const file of project) {
      if (file.parsed?.sections?.general) {
        instructions.push(`# Project ${file.type.toUpperCase()} Guidelines\n${file.parsed.sections.general}`);
      }
      for (const [section, content] of Object.entries(file.parsed?.sections || {})) {
        if (section !== 'general') {
          instructions.push(`## Project ${section.replace(/_/g, ' ')}\n${content}`);
        }
      }
    }

    // Add subdirectory-specific instructions (highest priority)
    for (const file of subdir) {
      const relativePath = path.relative(this.workingDirectory, path.dirname(file.path));
      if (file.parsed?.sections?.general) {
        instructions.push(`# Directory-Specific ${file.type.toUpperCase()} Guidelines (${relativePath})\n${file.parsed.sections.general}`);
      }
      for (const [section, content] of Object.entries(file.parsed?.sections || {})) {
        if (section !== 'general') {
          instructions.push(`## ${relativePath} ${section.replace(/_/g, ' ')}\n${content}`);
        }
      }
    }

    return instructions.join('\n\n');
  }

  /**
   * Get current guidance context
   */
  getContext(): GuidanceContext | null {
    return this.currentContext;
  }

  /**
   * Get guidance for a specific context (agent system prompt injection)
   */
  getContextForAgent(agentType?: string, currentDirectory?: string): string {
    if (!this.currentContext) {
      return '';
    }

    let relevantInstructions = this.currentContext.mergedInstructions;

    // Filter instructions based on agent type
    if (agentType) {
      const agentSpecific = Array.from(this.guidanceFiles.values())
        .filter(f => f.type === 'agents' && f.parsed?.sections?.[agentType.toLowerCase()])
        .map(f => f.parsed!.sections![agentType.toLowerCase()])
        .join('\n\n');

      if (agentSpecific) {
        relevantInstructions = `# Agent-Specific Instructions for ${agentType}\n${agentSpecific}\n\n${relevantInstructions}`;
      }
    }

    // Add context-specific instructions
    if (currentDirectory && currentDirectory !== this.workingDirectory) {
      const dirSpecific = Array.from(this.guidanceFiles.values())
        .filter(f => f.level === 'subdirectory' && path.dirname(f.path) === currentDirectory)
        .map(f => f.content)
        .join('\n\n');

      if (dirSpecific) {
        relevantInstructions = `${dirSpecific}\n\n${relevantInstructions}`;
      }
    }

    return relevantInstructions;
  }

  /**
   * Create a sample guidance file
   */
  createSampleGuidanceFile(type: 'claude' | 'codex' | 'agents' | 'nikocli', location: 'global' | 'project'): string {
    const templates = {
      claude: `# CLAUDE.md

Codebase and user instructions are shown below. Be sure to adhere to these instructions.

## Development Commands

### Next.js Web Application
- \`npm run dev\` - Start Next.js development server on http://localhost:3000
- \`npm run build\` - Build the Next.js application for production
- \`npm run start\` - Start the production Next.js server
- \`npm run lint\` - Run ESLint for code linting

## Architecture Overview

This is an autonomous AI-powered CLI coding assistant.

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files.
`,

      codex: `# CODEX.md

Instructions for Codex AI assistant.

## Project Rules

- Follow TypeScript best practices
- Use existing project patterns and conventions
- Always run tests after making changes
- Prefer composition over inheritance

## Tools Available

- File operations (read, write, edit)
- Command execution (npm, git, etc.)
- Code analysis and testing
- Project scaffolding

## Safety Guidelines

- Ask for confirmation before destructive operations
- Never modify .git directory directly
- Back up important files before major changes
`,

      nikocli: `# NIKOCLI.md

Codebase and user instructions are shown below. Be sure to adhere to these instructions.

## Development Commands

### Next.js Web Application
- \`npm run dev\` - Start Next.js development server on http://localhost:3000
- \`npm run build\` - Build the Next.js application for production
- \`npm run start\` - Start the production Next.js server
- \`npm run lint\` - Run ESLint for code linting

## Architecture Overview

This is an autonomous AI-powered CLI coding assistant.

## Important Instructions

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files`,

      agents: `---
name: "Project Agent Configuration"
version: "1.0"
---

# AGENTS.md

Agent-specific instructions and configurations.

## coding-agent

You are a senior software engineer specializing in TypeScript and React.
Focus on clean, maintainable code with proper error handling.

## react-agent

You are a React expert. Use modern patterns:
- Functional components with hooks
- TypeScript for type safety
- Proper state management
- Accessibility best practices

## backend-agent

You are a backend specialist focusing on:
- Node.js and Express
- Database design and optimization
- API design and security
- Performance optimization
`
    };

    const content = templates[type];
    const filename = `${type.toUpperCase()}.md`;
    const targetPath = location === 'global' ?
      path.join(this.globalGuidanceDir, filename) :
      path.join(this.workingDirectory, filename);

    try {
      fs.writeFileSync(targetPath, content, 'utf-8');
      console.log(chalk.green(`✅ Created sample ${type} guidance file: ${targetPath}`));
      return targetPath;
    } catch (error: any) {
      console.log(chalk.red(`❌ Failed to create guidance file: ${error.message}`));
      throw error;
    }
  }

  /**
   * List all guidance files
   */
  listGuidanceFiles(): GuidanceFile[] {
    return Array.from(this.guidanceFiles.values());
  }

  /**
   * Get guidance file stats
   */
  getStats(): {
    totalFiles: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
    totalSize: number;
  } {
    const files = Array.from(this.guidanceFiles.values());

    return {
      totalFiles: files.length,
      byType: {
        claude: files.filter(f => f.type === 'claude').length,
        codex: files.filter(f => f.type === 'codex').length,
        agents: files.filter(f => f.type === 'agents').length
      },
      byLevel: {
        global: files.filter(f => f.level === 'global').length,
        project: files.filter(f => f.level === 'project').length,
        subdirectory: files.filter(f => f.level === 'subdirectory').length
      },
      totalSize: files.reduce((sum, f) => sum + f.content.length, 0)
    };
  }

  /**
   * Cleanup watchers and resources
   */
  async cleanup(): Promise<void> {
    console.log(chalk.blue('🧹 Cleaning up guidance system...'));

    for (const watcher of this.watchers) {
      await watcher.close();
    }

    this.watchers = [];
    this.guidanceFiles.clear();
    this.currentContext = null;

    console.log(chalk.green('✅ Guidance system cleaned up'));
  }
}

export const guidanceManager = new GuidanceManager(process.cwd());