import * as path from 'path';
import chalk from 'chalk';
import { FindFilesTool } from '../tools/find-files-tool';

export interface FileSelection {
    files: string[];
    pattern: string;
    timestamp: Date;
}

export interface FilePickerOptions {
    maxDisplay?: number;
    maxFilesPerDirectory?: number;
    showIcons?: boolean;
    groupByDirectory?: boolean;
}

/**
 * Handles file selection and tagging operations for the * command
 */
export class FilePickerHandler {
    private workingDirectory: string;
    private selections: Map<string, FileSelection> = new Map();
    private findTool: FindFilesTool;

    constructor(workingDirectory: string) {
        this.workingDirectory = workingDirectory;
        this.findTool = new FindFilesTool(workingDirectory);
    }

    /**
     * Handle file selection with pattern
     */
    async selectFiles(pattern: string, options: FilePickerOptions = {}): Promise<FileSelection> {
        const defaultOptions: Required<FilePickerOptions> = {
            maxDisplay: 50,
            maxFilesPerDirectory: 10,
            showIcons: true,
            groupByDirectory: true
        };

        const opts = { ...defaultOptions, ...options };

        // Use FindFilesTool to get files
        const result = await this.findTool.execute(pattern, { cwd: this.workingDirectory });

        if (!result.success || result.data.length === 0) {
            throw new Error(`No files found matching pattern: ${pattern}`);
        }

        const selection: FileSelection = {
            files: result.data,
            pattern,
            timestamp: new Date()
        };

        // Store selection for future reference
        this.storeSelection(pattern, selection);

        // Display results
        await this.displayFileSelection(selection, opts);

        return selection;
    }

    /**
     * Display file selection results in organized format
     */
    private async displayFileSelection(selection: FileSelection, options: Required<FilePickerOptions>): Promise<void> {
        const { files, pattern } = selection;
        
        console.log(chalk.blue(`\n📂 Found ${files.length} files matching "${pattern}":`));
        console.log(chalk.gray('─'.repeat(60)));

        if (options.groupByDirectory) {
            await this.displayGroupedFiles(files, options);
        } else {
            await this.displayFlatFiles(files, options);
        }

        this.displaySelectionOptions(selection);
    }

    /**
     * Display files grouped by directory
     */
    private async displayGroupedFiles(files: string[], options: Required<FilePickerOptions>): Promise<void> {
        const groupedFiles = this.groupFilesByDirectory(files);
        let fileIndex = 0;

        for (const [directory, dirFiles] of groupedFiles.entries()) {
            if (fileIndex >= options.maxDisplay) {
                console.log(chalk.yellow(`... and ${files.length - fileIndex} more files`));
                break;
            }

            if (directory !== '.') {
                console.log(chalk.cyan(`\n📁 ${directory}/`));
            }

            const displayCount = Math.min(
                dirFiles.length, 
                options.maxFilesPerDirectory, 
                options.maxDisplay - fileIndex
            );

            for (let i = 0; i < displayCount; i++) {
                const file = dirFiles[i];
                const fileIcon = options.showIcons ? this.getFileIcon(path.extname(file)) : '📄';
                const relativePath = directory === '.' ? file : `${directory}/${file}`;
                
                console.log(`  ${fileIcon} ${chalk.white(file)} ${chalk.dim('(' + relativePath + ')')}`);
                fileIndex++;
            }

            if (dirFiles.length > options.maxFilesPerDirectory) {
                console.log(chalk.dim(`    ... and ${dirFiles.length - options.maxFilesPerDirectory} more in this directory`));
            }
        }
    }

    /**
     * Display files in flat list format
     */
    private async displayFlatFiles(files: string[], options: Required<FilePickerOptions>): Promise<void> {
        const displayCount = Math.min(files.length, options.maxDisplay);
        
        for (let i = 0; i < displayCount; i++) {
            const file = files[i];
            const fileIcon = options.showIcons ? this.getFileIcon(path.extname(file)) : '📄';
            
            console.log(`  ${fileIcon} ${chalk.white(file)}`);
        }

        if (files.length > options.maxDisplay) {
            console.log(chalk.yellow(`... and ${files.length - options.maxDisplay} more files`));
        }
    }

    /**
     * Display selection options and usage instructions
     */
    private displaySelectionOptions(selection: FileSelection): void {
        console.log(chalk.gray('\n─'.repeat(60)));
        console.log(chalk.green('📋 File Selection Options:'));
        console.log(chalk.dim('• Files are now available for reference in your next message'));
        console.log(chalk.dim('• Use the file paths directly: "Analyze these files: file1.ts, file2.ts"'));
        console.log(chalk.dim('• Integration with agent commands: "@code-review analyze these files"'));
        
        // Show quick reference for smaller selections
        if (selection.files.length <= 10) {
            console.log(chalk.yellow('\n💡 Quick reference paths:'));
            selection.files.forEach((file, index) => {
                console.log(chalk.dim(`   ${index + 1}. ${file}`));
            });
        }

        // Show pattern variations
        this.displayPatternSuggestions(selection.pattern);
    }

    /**
     * Display pattern suggestions based on current selection
     */
    private displayPatternSuggestions(currentPattern: string): void {
        console.log(chalk.cyan('\n🔍 Try these pattern variations:'));
        
        if (currentPattern === '*') {
            console.log(chalk.dim('  * *.ts      - TypeScript files only'));
            console.log(chalk.dim('  * src/**    - Files in src directory'));
            console.log(chalk.dim('  * **/*.tsx  - React components'));
        } else if (currentPattern.includes('*')) {
            console.log(chalk.dim('  *           - All files'));
            console.log(chalk.dim('  * *.json    - Configuration files'));
            console.log(chalk.dim('  * test/**   - Test files'));
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
            '.vue': '💚',
            '.php': '🐘',
            '.rb': '💎',
            '.sh': '📜',
            '.sql': '🗃️',
            '.xml': '📄',
            '.dockerfile': '🐳',
            '.gitignore': '🙈',
        };

        return iconMap[extension.toLowerCase()] || '📄';
    }

    /**
     * Store file selection for future reference
     */
    private storeSelection(pattern: string, selection: FileSelection): void {
        this.selections.set(pattern, selection);

        // Keep only the last 5 selections to avoid memory buildup
        if (this.selections.size > 5) {
            const oldestKey = this.selections.keys().next().value;
            if (oldestKey !== undefined) {
                this.selections.delete(oldestKey);
            }
        }
    }

    /**
     * Get stored file selection by pattern
     */
    getSelection(pattern: string): FileSelection | undefined {
        return this.selections.get(pattern);
    }

    /**
     * Get all stored selections
     */
    getAllSelections(): Map<string, FileSelection> {
        return new Map(this.selections);
    }

    /**
     * Clear all stored selections
     */
    clearSelections(): void {
        this.selections.clear();
    }

    /**
     * Get files matching pattern without display
     */
    async getFiles(pattern: string): Promise<string[]> {
        const result = await this.findTool.execute(pattern, { cwd: this.workingDirectory });
        return result.success ? result.data : [];
    }

    /**
     * Check if pattern has any matches
     */
    async hasMatches(pattern: string): Promise<boolean> {
        const files = await this.getFiles(pattern);
        return files.length > 0;
    }
}