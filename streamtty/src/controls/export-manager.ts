import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Export manager for diagrams and tables
 * Handles exporting content to files
 */
export class ExportManager {
    private exportDir: string;

    constructor(exportDir: string = './exports') {
        this.exportDir = exportDir;
    }

    /**
     * Export diagram to file
     */
    async exportDiagram(
        content: string,
        format: 'ascii' | 'mermaid' = 'ascii',
        filename?: string
    ): Promise<string> {
        const timestamp = Date.now();
        const name = filename || `diagram-${timestamp}.txt`;
        const filepath = join(this.exportDir, name);

        try {
            // Ensure export directory exists
            const { mkdir } = await import('fs/promises');
            await mkdir(this.exportDir, { recursive: true });

            // Write content
            await writeFile(filepath, content, 'utf-8');

            return filepath;
        } catch (error) {
            throw new Error(`Failed to export diagram: ${(error as Error).message}`);
        }
    }

    /**
     * Export table to file
     */
    async exportTable(
        content: string,
        format: 'txt' | 'csv' | 'md' = 'txt',
        filename?: string
    ): Promise<string> {
        const timestamp = Date.now();
        const ext = format === 'csv' ? 'csv' : format === 'md' ? 'md' : 'txt';
        const name = filename || `table-${timestamp}.${ext}`;
        const filepath = join(this.exportDir, name);

        try {
            // Ensure export directory exists
            const { mkdir } = await import('fs/promises');
            await mkdir(this.exportDir, { recursive: true });

            // Convert format if needed
            let exportContent = content;
            if (format === 'csv') {
                exportContent = this.convertToCSV(content);
            } else if (format === 'md') {
                exportContent = this.convertToMarkdown(content);
            }

            // Write content
            await writeFile(filepath, exportContent, 'utf-8');

            return filepath;
        } catch (error) {
            throw new Error(`Failed to export table: ${(error as Error).message}`);
        }
    }

    /**
     * Export code block to file
     */
    async exportCode(
        code: string,
        language?: string,
        filename?: string
    ): Promise<string> {
        const timestamp = Date.now();
        const ext = this.getFileExtension(language);
        const name = filename || `code-${timestamp}.${ext}`;
        const filepath = join(this.exportDir, name);

        try {
            // Ensure export directory exists
            const { mkdir } = await import('fs/promises');
            await mkdir(this.exportDir, { recursive: true });

            // Write content
            await writeFile(filepath, code, 'utf-8');

            return filepath;
        } catch (error) {
            throw new Error(`Failed to export code: ${(error as Error).message}`);
        }
    }

    /**
     * Export math expression to file
     */
    async exportMath(
        latex: string,
        filename?: string
    ): Promise<string> {
        const timestamp = Date.now();
        const name = filename || `math-${timestamp}.tex`;
        const filepath = join(this.exportDir, name);

        try {
            // Ensure export directory exists
            const { mkdir } = await import('fs/promises');
            await mkdir(this.exportDir, { recursive: true });

            // Write as LaTeX document
            const document = [
                '\\documentclass{article}',
                '\\usepackage{amsmath}',
                '\\begin{document}',
                latex.includes('$$') ? latex : `$$${latex}$$`,
                '\\end{document}',
            ].join('\n');

            await writeFile(filepath, document, 'utf-8');

            return filepath;
        } catch (error) {
            throw new Error(`Failed to export math: ${(error as Error).message}`);
        }
    }

    /**
     * Convert table to CSV
     */
    private convertToCSV(tableText: string): string {
        // Parse table text and convert to CSV
        const lines = tableText.split('\n').filter(l => l.trim());
        const csvLines: string[] = [];

        for (const line of lines) {
            // Skip separator lines
            if (line.match(/^[─┼│\s]+$/)) continue;

            // Extract cell values
            const cells = line
                .split('│')
                .map(c => c.trim())
                .filter(c => c);

            // Escape and quote cells
            const csvCells = cells.map(cell => {
                // Remove bold/formatting tags
                const cleaned = cell.replace(/\{[^}]+\}/g, '');
                // Quote if contains comma or quotes
                if (cleaned.includes(',') || cleaned.includes('"')) {
                    return `"${cleaned.replace(/"/g, '""')}"`;
                }
                return cleaned;
            });

            csvLines.push(csvCells.join(','));
        }

        return csvLines.join('\n');
    }

    /**
     * Convert table to markdown
     */
    private convertToMarkdown(tableText: string): string {
        const lines = tableText.split('\n').filter(l => l.trim());
        const mdLines: string[] = [];
        let headerSeen = false;

        for (const line of lines) {
            // Skip box drawing characters
            if (line.match(/^[─┼│\s]+$/)) continue;

            // Extract cell values
            const cells = line
                .split('│')
                .map(c => c.trim())
                .filter(c => c);

            if (cells.length === 0) continue;

            // Clean formatting
            const cleaned = cells.map(c => c.replace(/\{[^}]+\}/g, ''));

            // Add as markdown row
            mdLines.push(`| ${cleaned.join(' | ')} |`);

            // Add separator after header
            if (!headerSeen) {
                mdLines.push(`| ${cleaned.map(() => '---').join(' | ')} |`);
                headerSeen = true;
            }
        }

        return mdLines.join('\n');
    }

    /**
     * Get file extension for language
     */
    private getFileExtension(language?: string): string {
        const extensionMap: Record<string, string> = {
            javascript: 'js',
            typescript: 'ts',
            python: 'py',
            java: 'java',
            cpp: 'cpp',
            c: 'c',
            rust: 'rs',
            go: 'go',
            ruby: 'rb',
            php: 'php',
            bash: 'sh',
            shell: 'sh',
            json: 'json',
            yaml: 'yaml',
            xml: 'xml',
            html: 'html',
            css: 'css',
            sql: 'sql',
        };

        return extensionMap[language?.toLowerCase() || ''] || 'txt';
    }

    /**
     * Set export directory
     */
    setExportDir(dir: string): void {
        this.exportDir = dir;
    }

    /**
     * Get export directory
     */
    getExportDir(): string {
        return this.exportDir;
    }
}

/**
 * Singleton instance
 */
export const exportManager = new ExportManager();

