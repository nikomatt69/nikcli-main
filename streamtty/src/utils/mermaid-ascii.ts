import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export interface MermaidASCIIOptions {
  paddingX?: number;
  paddingY?: number;
  borderPadding?: number;
  ascii?: boolean;
  coords?: boolean;
}

/**
 * Wrapper for mermaid-ascii binary integration
 * Converts Mermaid diagrams to ASCII art using the external mermaid-ascii tool
 */
export class MermaidASCIIWrapper {
  private binaryPath: string;
  private tempDir: string;

  constructor(binaryPath?: string) {
    this.binaryPath = binaryPath || 'npx mermaid-ascii';
    this.tempDir = join(tmpdir(), 'streamtty-mermaid');

    // Ensure temp directory exists
    try {
      mkdirSync(this.tempDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Convert mermaid code to ASCII diagram
   */
  async convertToASCII(mermaidCode: string, options: MermaidASCIIOptions = {}): Promise<string> {
    // Validate mermaid code
    if (!mermaidCode.trim()) {
      return '[Empty Mermaid diagram]';
    }

    // Check if mermaid-ascii is available
    if (!(await this.isBinaryAvailable())) {
      return this.getFallbackDiagram(mermaidCode);
    }

    try {
      // Create temporary file for mermaid code
      const tempFile = join(this.tempDir, `diagram-${Date.now()}.mermaid`);
      writeFileSync(tempFile, mermaidCode.trim());

      // Build command arguments
      const args = this.buildCommandArgs(tempFile, options);
      const command = `${this.binaryPath} ${args}`;

      // Execute mermaid-ascii command
      const { stdout, stderr } = await execAsync(command, {
        timeout: 10000, // 10 second timeout
        encoding: 'utf8'
      });

      // Clean up temp file
      try {
        unlinkSync(tempFile);
      } catch (error) {
        // Ignore cleanup errors
      }

      if (stderr && stderr.trim()) {
        console.warn('Mermaid-ASCII warning:', stderr);
      }

      return stdout.trim() || this.getFallbackDiagram(mermaidCode);

    } catch (error) {
      console.warn('Mermaid-ASCII conversion failed:', error instanceof Error ? error.message : error);
      return this.getFallbackDiagram(mermaidCode);
    }
  }

  /**
   * Build command line arguments for mermaid-ascii
   */
  private buildCommandArgs(filePath: string, options: MermaidASCIIOptions): string {
    const args: string[] = [`--file "${filePath}"`];

    if (options.paddingX !== undefined) {
      args.push(`--paddingX ${options.paddingX}`);
    }

    if (options.paddingY !== undefined) {
      args.push(`--paddingY ${options.paddingY}`);
    }

    if (options.borderPadding !== undefined) {
      args.push(`--borderPadding ${options.borderPadding}`);
    }

    if (options.ascii) {
      args.push('--ascii');
    }

    if (options.coords) {
      args.push('--coords');
    }

    return args.join(' ');
  }

  /**
   * Check if mermaid-ascii binary is available
   */
  async isBinaryAvailable(): Promise<boolean> {
    try {
      await execAsync(`${this.binaryPath} --help`, { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate fallback ASCII diagram when mermaid-ascii is not available
   */
  private getFallbackDiagram(mermaidCode: string): string {
    const lines = mermaidCode.split('\n');
    const maxWidth = Math.max(...lines.map(l => l.length), 40);
    const width = Math.min(maxWidth + 4, 80);

    const topBorder = '┌' + '─'.repeat(width - 2) + '┐';
    const bottomBorder = '└' + '─'.repeat(width - 2) + '┘';
    const title = '│ 📊 Mermaid Diagram (mermaid-ascii not found) │'.padEnd(width - 1) + '│';

    const contentLines = lines.slice(0, 8).map(line => {
      const truncated = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
      return '│ ' + truncated.padEnd(width - 4) + ' │';
    });

    const suggestion = '│ Install: https://github.com/AlexanderGrooff/mermaid-ascii │'.padEnd(width - 1) + '│';

    return [
      topBorder,
      title,
      '│' + ' '.repeat(width - 2) + '│',
      ...contentLines,
      '│' + ' '.repeat(width - 2) + '│',
      suggestion,
      bottomBorder
    ].join('\n');
  }

  /**
   * Check if content looks like a mermaid diagram
   */
  static isMermaidCode(content: string): boolean {
    const trimmed = content.trim().toLowerCase();

    const mermaidKeywords = [
      'graph',
      'flowchart',
      'sequencediagram',
      'classDiagram',
      'stateDiagram',
      'journey',
      'gantt',
      'pie',
      'gitgraph',
      'requirement',
      'erdiagram',
      'mindmap'
    ];

    return mermaidKeywords.some(keyword =>
      trimmed.startsWith(keyword.toLowerCase())
    );
  }

  /**
   * Extract mermaid code from markdown code block
   */
  static extractMermaidFromMarkdown(markdown: string): string | null {
    // Match ```mermaid code blocks
    const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/gi;
    const match = mermaidRegex.exec(markdown);

    if (match && match[1]) {
      return match[1].trim();
    }

    return null;
  }
}

/**
 * Singleton instance with default settings
 */
export const mermaidASCII = new MermaidASCIIWrapper();

/**
 * Quick conversion function for mermaid code
 */
export async function convertMermaidToASCII(
  mermaidCode: string,
  options?: MermaidASCIIOptions
): Promise<string> {
  return mermaidASCII.convertToASCII(mermaidCode, options);
}

/**
 * Check if mermaid-ascii binary is available on the system
 */
export async function isMermaidASCIIAvailable(): Promise<boolean> {
  return mermaidASCII.isBinaryAvailable();
}