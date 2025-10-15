import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Copy manager for code and math blocks
 * Handles copying content to system clipboard
 */
export class CopyManager {
    /**
     * Copy text to system clipboard
     */
    async copyToClipboard(text: string): Promise<boolean> {
        try {
            // Detect platform and use appropriate command
            const platform = process.platform;

            if (platform === 'darwin') {
                // macOS
                await execAsync(`echo ${this.escapeShell(text)} | pbcopy`);
                return true;
            } else if (platform === 'linux') {
                // Linux - try xclip first, then xsel
                try {
                    await execAsync(`echo ${this.escapeShell(text)} | xclip -selection clipboard`);
                    return true;
                } catch {
                    await execAsync(`echo ${this.escapeShell(text)} | xsel --clipboard`);
                    return true;
                }
            } else if (platform === 'win32') {
                // Windows
                await execAsync(`echo ${this.escapeShell(text)} | clip`);
                return true;
            }

            // Unsupported platform
            console.warn(`Clipboard not supported on platform: ${platform}`);
            return false;
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
            return false;
        }
    }

    /**
     * Escape shell command
     */
    private escapeShell(text: string): string {
        // Simple escaping - wrap in quotes and escape quotes
        return `"${text.replace(/"/g, '\\"')}"`;
    }

    /**
     * Copy code block
     */
    async copyCode(code: string, language?: string): Promise<boolean> {
        // Optionally format with language comment
        const formatted = language
            ? `// Language: ${language}\n${code}`
            : code;

        return this.copyToClipboard(formatted);
    }

    /**
     * Copy math expression
     */
    async copyMath(latex: string): Promise<boolean> {
        // Copy as LaTeX
        return this.copyToClipboard(latex);
    }

    /**
     * Check if clipboard is available
     */
    async isAvailable(): Promise<boolean> {
        const platform = process.platform;

        try {
            if (platform === 'darwin') {
                await execAsync('which pbcopy');
                return true;
            } else if (platform === 'linux') {
                try {
                    await execAsync('which xclip');
                    return true;
                } catch {
                    await execAsync('which xsel');
                    return true;
                }
            } else if (platform === 'win32') {
                await execAsync('where clip');
                return true;
            }
        } catch {
            return false;
        }

        return false;
    }
}

/**
 * Singleton instance
 */
export const copyManager = new CopyManager();

