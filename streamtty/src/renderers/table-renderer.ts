import blessed, { Widgets } from 'blessed';
import { ParsedToken } from '../types';

/**
 * Advanced table renderer for TTY
 * Renders markdown tables with proper alignment and formatting
 */
export class TableRenderer {
    /**
     * Render a table token to a blessed table widget
     */
    render(
        token: ParsedToken,
        yOffset: number,
        parent: Widgets.BoxElement,
        interactive: boolean = false
    ): Widgets.BoxElement {
        try {
            // Parse table data from token
            const tableData = this.parseTableToken(token);

            if (!tableData) {
                return this.renderFallback(token, yOffset, parent);
            }

            return this.renderTable(tableData, yOffset, parent, interactive);
        } catch (error) {
            console.warn('Failed to render table:', error);
            return this.renderFallback(token, yOffset, parent);
        }
    }

    /**
     * Parse table token to structured data
     */
    private parseTableToken(token: ParsedToken): TableData | null {
        try {
            // Token content should be JSON stringified table data
            const parsed = JSON.parse(token.content);

            if (!parsed.header || !parsed.rows) {
                return null;
            }

            return {
                headers: parsed.header.map((h: any) => h.text || String(h)),
                rows: parsed.rows.map((row: any) =>
                    row.map((cell: any) => cell.text || String(cell))
                ),
                align: parsed.align || [],
            };
        } catch (error) {
            // Try to parse from raw markdown table
            return this.parseMarkdownTable(token.raw || token.content);
        }
    }

    /**
     * Parse raw markdown table
     */
    private parseMarkdownTable(markdown: string): TableData | null {
        const lines = markdown.trim().split('\n');
        if (lines.length < 3) return null;

        // Parse header
        const headers = lines[0]
            .split('|')
            .map(h => h.trim())
            .filter(h => h);

        // Parse alignment from separator line
        const alignLine = lines[1];
        const align = alignLine
            .split('|')
            .map(a => a.trim())
            .filter(a => a)
            .map(a => {
                if (a.startsWith(':') && a.endsWith(':')) return 'center';
                if (a.endsWith(':')) return 'right';
                return 'left';
            });

        // Parse rows
        const rows = lines.slice(2).map(line =>
            line
                .split('|')
                .map(c => c.trim())
                .filter(c => c)
        );

        return { headers, rows, align };
    }

    /**
     * Render table with blessed
     */
    private renderTable(
        data: TableData,
        yOffset: number,
        parent: Widgets.BoxElement,
        interactive: boolean
    ): Widgets.BoxElement {
        const { headers, rows, align } = data;

        // Calculate column widths
        const colWidths = this.calculateColumnWidths(headers, rows);

        // Build table content
        const content = this.buildTableContent(headers, rows, colWidths, align);

        // Create box with table content
        const tableBox = blessed.box({
            parent,
            top: yOffset,
            left: 0,
            width: '100%-4',
            height: 'shrink',
            content,
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'cyan',
                },
            },
            padding: {
                left: 1,
                right: 1,
            },
            scrollable: true,
            keys: interactive,
            vi: interactive,
            mouse: interactive,
        });

        if (interactive) {
            this.setupTableControls(tableBox);
        }

        return tableBox;
    }

    /**
     * Calculate column widths
     */
    private calculateColumnWidths(headers: string[], rows: string[][]): number[] {
        const widths: number[] = headers.map(h => h.length);

        for (const row of rows) {
            row.forEach((cell, i) => {
                widths[i] = Math.max(widths[i] || 0, cell.length);
            });
        }

        return widths.map(w => Math.min(w + 2, 30)); // Cap at 30 chars
    }

    /**
     * Build table content string
     */
    private buildTableContent(
        headers: string[],
        rows: string[][],
        widths: number[],
        align: string[]
    ): string {
        const lines: string[] = [];

        // Header row
        const headerLine = headers
            .map((h, i) => this.alignText(h, widths[i], align[i] || 'left'))
            .join(' │ ');
        lines.push(`{bold}${headerLine}{/bold}`);

        // Separator
        const separator = widths.map(w => '─'.repeat(w)).join('─┼─');
        lines.push(separator);

        // Data rows
        for (const row of rows) {
            const rowLine = row
                .map((cell, i) => this.alignText(cell, widths[i], align[i] || 'left'))
                .join(' │ ');
            lines.push(rowLine);
        }

        return lines.join('\n');
    }

    /**
     * Align text within column width
     */
    private alignText(text: string, width: number, align: string): string {
        const trimmed = text.substring(0, width);

        switch (align) {
            case 'center':
                const totalPadding = width - trimmed.length;
                const leftPad = Math.floor(totalPadding / 2);
                const rightPad = totalPadding - leftPad;
                return ' '.repeat(leftPad) + trimmed + ' '.repeat(rightPad);

            case 'right':
                return trimmed.padStart(width);

            default: // left
                return trimmed.padEnd(width);
        }
    }

    /**
     * Setup interactive table controls
     */
    private setupTableControls(box: Widgets.BoxElement): void {
        // Scroll with arrow keys
        box.key(['up', 'k'], () => {
            box.scroll(-1);
            box.screen.render();
        });

        box.key(['down', 'j'], () => {
            box.scroll(1);
            box.screen.render();
        });

        box.key(['pageup'], () => {
            box.scroll(-(box.height as number || 10));
            box.screen.render();
        });

        box.key(['pagedown'], () => {
            box.scroll(box.height as number || 10);
            box.screen.render();
        });
    }

    /**
     * Fallback renderer for invalid tables
     */
    private renderFallback(
        token: ParsedToken,
        yOffset: number,
        parent: Widgets.BoxElement
    ): Widgets.BoxElement {
        return blessed.box({
            parent,
            top: yOffset,
            left: 0,
            width: '100%',
            height: 'shrink',
            content: '{cyan-fg}[Table]{/cyan-fg}',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'cyan',
                },
            },
        });
    }
}

interface TableData {
    headers: string[];
    rows: string[][];
    align: string[];
}

/**
 * Singleton instance
 */
export const tableRenderer = new TableRenderer();

