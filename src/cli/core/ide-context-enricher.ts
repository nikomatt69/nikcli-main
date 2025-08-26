import { tool } from 'ai';
import { z } from 'zod';
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, extname, relative, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

const execAsync = promisify(exec);

export interface IDEContext {
  editor: string;
  workspace: string;
  projectType: string;
  dependencies: any;
  gitInfo: any;
  recentFiles: string[];
  openFiles: string[];
}

export class IDEContextEnricher {
  
  // IDE context enrichment tool
  getIDEContextTool() {
    return tool({
      description: 'Analyze and enrich IDE context including editor, workspace, project structure, and development environment',
      parameters: z.object({
        includeDependencies: z.boolean().default(true).describe('Include package.json and dependency analysis'),
        includeGitInfo: z.boolean().default(true).describe('Include Git repository information'),
        includeRecentFiles: z.boolean().default(true).describe('Include recently modified files'),
        includeOpenFiles: z.boolean().default(true).describe('Include currently open files in editor')
      }),
      execute: async ({ includeDependencies, includeGitInfo, includeRecentFiles, includeOpenFiles }) => {
        try {
          console.log(chalk.blue('🔍 Analyzing IDE and workspace context...'));
          
          const context: IDEContext = {
            editor: await this.detectEditor(),
            workspace: process.cwd(),
            projectType: await this.detectProjectType(),
            dependencies: includeDependencies ? await this.analyzeDependencies() : null,
            gitInfo: includeGitInfo ? await this.getGitInfo() : null,
            recentFiles: includeRecentFiles ? await this.getRecentFiles() : [],
            openFiles: includeOpenFiles ? await this.getOpenFiles() : []
          };
          
          return {
            context,
            analysis: this.generateContextAnalysis(context),
            recommendations: this.generateRecommendations(context)
          };
        } catch (error: any) {
          return {
            error: `IDE context analysis failed: ${error.message}`,
            partialContext: {
              editor: 'unknown',
              workspace: process.cwd(),
              projectType: 'unknown'
            }
          };
        }
      }
    });
  }
  
  // Detect current editor/IDE
  private async detectEditor(): Promise<string> {
    try {
      // Check for common editor environment variables
      const editorVars = ['EDITOR', 'VISUAL', 'VSCODE_PID', 'INTELLIJ_IDEA_PID'];
      
      for (const varName of editorVars) {
        if (process.env[varName]) {
          return process.env[varName] || 'unknown';
        }
      }
      
      // Check for VS Code
      if (process.env.VSCODE_PID || process.env.VSCODE_EXTENSION_HOST) {
        return 'VS Code';
      }
      
      // Check for IntelliJ/WebStorm
      if (process.env.INTELLIJ_IDEA_PID || process.env.WEBSTORM_PID) {
        return 'IntelliJ IDEA/WebStorm';
      }
      
      // Check for Vim/Neovim
      if (process.env.VIM || process.env.NVIM) {
        return 'Vim/Neovim';
      }
      
      return 'Terminal/CLI';
    } catch (error) {
      return 'unknown';
    }
  }
  
  // Detect project type based on files
  private async detectProjectType(): Promise<string> {
    const files = readdirSync(process.cwd());
    
    if (files.includes('package.json')) {
      try {
        const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
        if (packageJson.dependencies?.next || packageJson.dependencies?.['@next/next']) {
          return 'Next.js';
        }
        if (packageJson.dependencies?.react) {
          return 'React';
        }
        if (packageJson.dependencies?.vue) {
          return 'Vue.js';
        }
        return 'Node.js';
      } catch {
        return 'Node.js';
      }
    }
    
    if (files.includes('pyproject.toml') || files.includes('requirements.txt')) {
      return 'Python';
    }
    
    if (files.includes('Cargo.toml')) {
      return 'Rust';
    }
    
    if (files.includes('go.mod')) {
      return 'Go';
    }
    
    if (files.includes('pom.xml') || files.includes('build.gradle')) {
      return 'Java';
    }
    
    return 'Unknown';
  }
  
  // Analyze dependencies
  private async analyzeDependencies(): Promise<any> {
    try {
      if (existsSync('package.json')) {
        const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
        return {
          name: packageJson.name,
          version: packageJson.version,
          dependencies: Object.keys(packageJson.dependencies || {}).length,
          devDependencies: Object.keys(packageJson.devDependencies || {}).length,
          scripts: Object.keys(packageJson.scripts || {}),
          type: packageJson.type || 'commonjs'
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  }
  
  // Get Git information
  private async getGitInfo(): Promise<any> {
    try {
      const { stdout: branch } = await execAsync('git branch --show-current');
      const { stdout: remote } = await execAsync('git remote get-url origin');
      const { stdout: status } = await execAsync('git status --porcelain');
      
      return {
        branch: branch.trim(),
        remote: remote.trim(),
        hasChanges: status.trim().length > 0,
        changeCount: status.split('\n').filter(line => line.trim()).length
      };
    } catch (error) {
      return null;
    }
  }
  
  // Get recently modified files
  private async getRecentFiles(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('find . -type f -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" | head -10');
      return stdout.split('\n').filter(file => file.trim()).map(file => relative(process.cwd(), file));
    } catch (error) {
      return [];
    }
  }
  
  // Get currently open files (approximation)
  private async getOpenFiles(): Promise<string[]> {
    try {
      // This is an approximation - in a real implementation you'd integrate with the IDE's API
      // Use safer approach by avoiding shell metacharacters and using spawn instead of exec
      const { spawn } = await import('child_process');
      const { promisify } = await import('util');
      
      // Safer implementation: read directory instead of using lsof with shell pipes
      const workspaceFiles = this.getWorkspaceFiles('.', ['.ts', '.js', '.tsx', '.jsx']).slice(0, 5);
      return workspaceFiles;
    } catch (error) {
      return [];
    }
  }

  // Helper method to safely get workspace files
  private getWorkspaceFiles(dir: string, extensions: string[]): string[] {
    try {
      const files: string[] = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const subFiles = this.getWorkspaceFiles(join(dir, entry.name), extensions);
          files.push(...subFiles);
        } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
          files.push(join(dir, entry.name));
        }
      }
      
      return files;
    } catch (error) {
      return [];
    }
  }
  
  // Generate context analysis
  private generateContextAnalysis(context: IDEContext): string {
    let analysis = `📊 **IDE Context Analysis**\n\n`;
    
    analysis += `**Editor**: ${context.editor}\n`;
    analysis += `**Workspace**: ${context.workspace}\n`;
    analysis += `**Project Type**: ${context.projectType}\n\n`;
    
    if (context.dependencies) {
      analysis += `**Dependencies**: ${context.dependencies.dependencies} prod, ${context.dependencies.devDependencies} dev\n`;
      analysis += `**Available Scripts**: ${context.dependencies.scripts.join(', ')}\n\n`;
    }
    
    if (context.gitInfo) {
      analysis += `**Git**: ${context.gitInfo.branch} branch, ${context.gitInfo.hasChanges ? 'has changes' : 'clean'}\n`;
      if (context.gitInfo.hasChanges) {
        analysis += `**Changes**: ${context.gitInfo.changeCount} files modified\n`;
      }
      analysis += `**Remote**: ${context.gitInfo.remote}\n\n`;
    }
    
    if (context.recentFiles.length > 0) {
      analysis += `**Recent Files**: ${context.recentFiles.slice(0, 5).join(', ')}\n\n`;
    }
    
    return analysis;
  }
  
  // Generate recommendations based on context
  private generateRecommendations(context: IDEContext): string[] {
    const recommendations: string[] = [];
    
    if (context.projectType === 'Next.js') {
      recommendations.push('Consider using Next.js App Router for new features');
      recommendations.push('Enable TypeScript strict mode for better type safety');
    }
    
    if (context.projectType === 'React') {
      recommendations.push('Consider using React 18 features like Suspense');
      recommendations.push('Implement error boundaries for better error handling');
    }
    
    if (context.gitInfo?.hasChanges) {
      recommendations.push('Commit your changes before making major modifications');
      recommendations.push('Consider creating a feature branch for new work');
    }
    
    if (context.dependencies?.dependencies > 50) {
      recommendations.push('Consider auditing dependencies for security vulnerabilities');
      recommendations.push('Review and remove unused dependencies');
    }
    
    return recommendations;
  }
}
