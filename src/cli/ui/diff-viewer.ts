import chalk from 'chalk';
import * as diff from 'diff';
import boxen from 'boxen';
import * as fs from 'fs';
import * as path from 'path';

export interface FileDiff {
  filePath: string;
  originalContent: string;
  newContent: string;
  isNew: boolean;
  isDeleted: boolean;
}

export interface DiffOptions {
  context?: number;
  showLineNumbers?: boolean;
  highlightWords?: boolean;
  compact?: boolean;
}

export class DiffViewer {
  /**
   * Show diff for a single file modification
   */
  static showFileDiff(fileDiff: FileDiff, options: DiffOptions = {}): void {
    const { context = 3, showLineNumbers = true, highlightWords = true, compact = false } = options;

    console.log(chalk.blue.bold(`\n📄 File: ${fileDiff.filePath}`));
    
    if (fileDiff.isNew) {
      console.log(chalk.green('✨ New file created'));
      this.showNewFileContent(fileDiff.newContent, showLineNumbers, compact);
      return;
    }

    if (fileDiff.isDeleted) {
      console.log(chalk.red('🗑️  File deleted'));
      return;
    }

    // Generate line-by-line diff
    const diffResult = diff.diffLines(fileDiff.originalContent, fileDiff.newContent);
    
    if (diffResult.length === 1 && !diffResult[0].added && !diffResult[0].removed) {
      console.log(chalk.gray('   No changes'));
      return;
    }

    console.log(chalk.gray('─'.repeat(80)));
    
    let lineNumber = 1;
    let addedLines = 0;
    let removedLines = 0;

    diffResult.forEach(part => {
      const lines = part.value.split('\n').filter((line, index, arr) => 
        index < arr.length - 1 || line.length > 0
      );

      if (part.added) {
        addedLines += lines.length;
        lines.forEach(line => {
          const lineNum = showLineNumbers ? chalk.green(`+${lineNumber.toString().padStart(4)} `) : '';
          console.log(`${lineNum}${chalk.green(`+ ${line}`)}`);
          lineNumber++;
        });
      } else if (part.removed) {
        removedLines += lines.length;
        lines.forEach(line => {
          const lineNum = showLineNumbers ? chalk.red(`-${lineNumber.toString().padStart(4)} `) : '';
          console.log(`${lineNum}${chalk.red(`- ${line}`)}`);
        });
      } else {
        lines.forEach(line => {
          const lineNum = showLineNumbers ? chalk.gray(` ${lineNumber.toString().padStart(4)} `) : '';
          console.log(`${lineNum}${chalk.gray(`  ${line}`)}`);
          lineNumber++;
        });
      }
    });

    console.log(chalk.gray('─'.repeat(80)));
    console.log(chalk.green(`+${addedLines} additions`) + chalk.gray(' | ') + chalk.red(`-${removedLines} deletions`));
  }

  /**
   * Show multiple file diffs in a summary view
   */
  static showMultiFileDiff(fileDiffs: FileDiff[], options: DiffOptions = {}): void {
    console.log(chalk.blue.bold(`\n📁 File Changes Summary (${fileDiffs.length} files)`));
    console.log(chalk.gray('═'.repeat(80)));

    const summary = {
      created: fileDiffs.filter(f => f.isNew).length,
      modified: fileDiffs.filter(f => !f.isNew && !f.isDeleted).length,
      deleted: fileDiffs.filter(f => f.isDeleted).length,
    };

    if (summary.created > 0) console.log(chalk.green(`✨ ${summary.created} files created`));
    if (summary.modified > 0) console.log(chalk.yellow(`📝 ${summary.modified} files modified`));
    if (summary.deleted > 0) console.log(chalk.red(`🗑️  ${summary.deleted} files deleted`));

    console.log();

    fileDiffs.forEach(fileDiff => {
      const status = fileDiff.isNew ? chalk.green('NEW') :
                    fileDiff.isDeleted ? chalk.red('DEL') :
                    chalk.yellow('MOD');
      
      console.log(`${status} ${fileDiff.filePath}`);
      
      if (!options.compact) {
        this.showFileDiff(fileDiff, { ...options, compact: true });
      }
    });
  }

  /**
   * Show content of a new file
   */
  private static showNewFileContent(content: string, showLineNumbers: boolean, compact: boolean): void {
    const lines = content.split('\n');
    
    if (compact && lines.length > 10) {
      console.log(chalk.green('✨ New file created'));
      console.log(chalk.gray(`   ${lines.length} lines`));
      console.log(chalk.gray('   First 5 lines:'));
      lines.slice(0, 5).forEach((line, index) => {
        const lineNum = showLineNumbers ? chalk.green(`+${(index + 1).toString().padStart(4)} `) : '';
        console.log(`${lineNum}${chalk.green(`+ ${line}`)}`);
      });
      if (lines.length > 5) {
        console.log(chalk.gray(`   ... ${lines.length - 5} more lines`));
      }
    } else {
      lines.forEach((line, index) => {
        const lineNum = showLineNumbers ? chalk.green(`+${(index + 1).toString().padStart(4)} `) : '';
        console.log(`${lineNum}${chalk.green(`+ ${line}`)}`);
      });
    }
  }

  /**
   * Create a FileDiff object from file paths
   */
  static async createFileDiff(filePath: string, originalPath?: string): Promise<FileDiff> {
    const fullPath = path.resolve(filePath);
    
    let originalContent = '';
    let newContent = '';
    let isNew = false;
    let isDeleted = false;

    try {
      // Try to read new content
      newContent = await fs.promises.readFile(fullPath, 'utf8');
    } catch (error) {
      isDeleted = true;
    }

    if (originalPath) {
      try {
        originalContent = await fs.promises.readFile(originalPath, 'utf8');
      } catch (error) {
        // Original file doesn't exist, this is a new file
        isNew = true;
      }
    } else {
      // Check if file existed before (simplified check)
      try {
        const stats = await fs.promises.stat(fullPath);
        // If file is very recent, consider it new
        const now = Date.now();
        const fileTime = stats.mtime.getTime();
        isNew = (now - fileTime) < 5000; // 5 seconds
      } catch (error) {
        isNew = true;
      }
    }

    return {
      filePath,
      originalContent,
      newContent,
      isNew,
      isDeleted,
    };
  }

  /**
   * Interactive diff approval
   */
  static async showDiffAndAskApproval(fileDiffs: FileDiff[]): Promise<boolean> {
    console.log(chalk.yellow.bold('\n⚠️  The following files will be modified:'));
    
    this.showMultiFileDiff(fileDiffs, { compact: true });
    
    console.log(chalk.yellow('\n📋 Review the changes above carefully.'));
    
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(chalk.cyan('Do you want to proceed with these changes? (y/N): '), (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Show word-level diff (more detailed)
   */
  static showWordDiff(original: string, modified: string): void {
    const wordDiff = diff.diffWords(original, modified);
    
    let result = '';
    wordDiff.forEach(part => {
      if (part.added) {
        result += chalk.green.bold(part.value);
      } else if (part.removed) {
        result += chalk.red.strikethrough(part.value);
      } else {
        result += part.value;
      }
    });
    
    console.log(result);
  }

  /**
   * Save diff to file for later review
   */
  static async saveDiffToFile(fileDiffs: FileDiff[], outputPath: string): Promise<void> {
    let content = `# File Changes Report\n\nGenerated: ${new Date().toISOString()}\n\n`;
    
    content += `## Summary\n`;
    content += `- ${fileDiffs.filter(f => f.isNew).length} files created\n`;
    content += `- ${fileDiffs.filter(f => !f.isNew && !f.isDeleted).length} files modified\n`;
    content += `- ${fileDiffs.filter(f => f.isDeleted).length} files deleted\n\n`;
    
    fileDiffs.forEach(fileDiff => {
      content += `## ${fileDiff.filePath}\n\n`;
      
      if (fileDiff.isNew) {
        content += `**Status**: New file\n\n`;
        content += '```\n' + fileDiff.newContent + '\n```\n\n';
      } else if (fileDiff.isDeleted) {
        content += `**Status**: Deleted\n\n`;
      } else {
        content += `**Status**: Modified\n\n`;
        const diffResult = diff.createPatch(fileDiff.filePath, fileDiff.originalContent, fileDiff.newContent);
        content += '```diff\n' + diffResult + '\n```\n\n';
      }
    });
    
    await fs.promises.writeFile(outputPath, content, 'utf8');
    console.log(chalk.green(`📄 Diff report saved to: ${outputPath}`));
  }
}
