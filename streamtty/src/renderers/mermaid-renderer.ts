import { MermaidTTYConfig } from '../types';
import { mermaidASCII, MermaidASCIIWrapper } from '../utils/mermaid-ascii';

/**
 * Mermaid diagram renderer for TTY
 * Converts Mermaid diagrams to ASCII art using mermaid-ascii when available
 */
export class MermaidRenderer {
    private config: MermaidTTYConfig;
    private useExternalTool: boolean = true;

    constructor(config: MermaidTTYConfig = {}) {
        this.config = {
            theme: config.theme || 'default',
            flowchart: config.flowchart || {},
            sequence: config.sequence || {},
            gantt: config.gantt || {},
        };
    }

    /**
     * Render mermaid diagram to ASCII (async to support external tool)
     */
    async render(mermaidCode: string): Promise<string> {
        const trimmed = mermaidCode.trim();

        // Try external mermaid-ascii tool first if enabled
        if (this.useExternalTool) {
            try {
                const result = await mermaidASCII.convertToASCII(trimmed, {
                    paddingX: 2,
                    paddingY: 1,
                    borderPadding: 1,
                    ascii: true
                });

                // If external tool succeeded, return result
                if (result && !result.includes('mermaid-ascii not found')) {
                    return result;
                }
            } catch (error) {
                // Fall back to internal renderer
                this.useExternalTool = false;
            }
        }

        // Fallback to internal renderer
        return this.renderInternal(trimmed);
    }

    /**
     * Internal mermaid rendering (existing logic)
     */
    private renderInternal(mermaidCode: string): string {
        const trimmed = mermaidCode.trim();

        // Detect diagram type
        if (trimmed.startsWith('graph') || trimmed.startsWith('flowchart')) {
            return this.renderFlowchart(trimmed);
        } else if (trimmed.startsWith('sequenceDiagram')) {
            return this.renderSequence(trimmed);
        } else if (trimmed.startsWith('gantt')) {
            return this.renderGantt(trimmed);
        } else if (trimmed.startsWith('classDiagram')) {
            return this.renderClassDiagram(trimmed);
        } else if (trimmed.startsWith('stateDiagram')) {
            return this.renderStateDiagram(trimmed);
        } else if (trimmed.startsWith('pie')) {
            return this.renderPie(trimmed);
        }

        return this.renderFallback(trimmed);
    }

    /**
     * Render flowchart to ASCII
     */
    private renderFlowchart(code: string): string {
        const lines = code.split('\n').slice(1); // Skip graph/flowchart line
        const nodes: Map<string, FlowNode> = new Map();
        const edges: FlowEdge[] = [];

        // Parse nodes and edges
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('%%')) continue;

            // Match node definition: A[Label] or A(Label) or A{Label}
            const nodeMatch = trimmed.match(/(\w+)([\[({])(.*?)([\])}])/);
            if (nodeMatch) {
                const [, id, open, label, close] = nodeMatch;
                const shape = this.getNodeShape(open, close);
                nodes.set(id, { id, label, shape });
            }

            // Match edge: A --> B or A -- text --> B
            const edgeMatch = trimmed.match(/(\w+)\s*(-+>?|-+)\s*(?:\|([^|]+)\|)?\s*(\w+)/);
            if (edgeMatch) {
                const [, from, arrow, label, to] = edgeMatch;
                edges.push({ from, to, label: label?.trim(), arrow });
            }
        }

        // Render ASCII
        return this.buildFlowchartASCII(nodes, edges);
    }

    /**
     * Get node shape from brackets
     */
    private getNodeShape(open: string, close: string): 'box' | 'rounded' | 'diamond' | 'circle' {
        if (open === '[' && close === ']') return 'box';
        if (open === '(' && close === ')') return 'rounded';
        if (open === '{' && close === '}') return 'diamond';
        return 'box';
    }

    /**
     * Build flowchart ASCII representation
     */
    private buildFlowchartASCII(nodes: Map<string, FlowNode>, edges: FlowEdge[]): string {
        const lines: string[] = [];
        const rendered = new Set<string>();

        // Simple vertical layout
        for (const [id, node] of nodes) {
            if (rendered.has(id)) continue;

            // Render node
            lines.push(this.renderNode(node));
            rendered.add(id);

            // Find outgoing edges
            const outgoing = edges.filter(e => e.from === id);
            for (const edge of outgoing) {
                // Render edge
                lines.push(this.renderEdge(edge));
            }
        }

        return lines.join('\n');
    }

    /**
     * Render a single node
     */
    private renderNode(node: FlowNode): string {
        const label = node.label || node.id;
        const width = Math.max(label.length + 4, 12);

        switch (node.shape) {
            case 'box':
                return [
                    '┌' + '─'.repeat(width) + '┐',
                    '│ ' + label.padEnd(width - 2) + ' │',
                    '└' + '─'.repeat(width) + '┘',
                ].join('\n');

            case 'rounded':
                return [
                    '╭' + '─'.repeat(width) + '╮',
                    '│ ' + label.padEnd(width - 2) + ' │',
                    '╰' + '─'.repeat(width) + '╯',
                ].join('\n');

            case 'diamond':
                const padding = Math.floor((width - label.length) / 2);
                return [
                    ' '.repeat(padding) + '╱' + '─'.repeat(label.length) + '╲',
                    '│ ' + label + ' │',
                    ' '.repeat(padding) + '╲' + '─'.repeat(label.length) + '╱',
                ].join('\n');

            default:
                return label;
        }
    }

    /**
     * Render an edge
     */
    private renderEdge(edge: FlowEdge): string {
        const connector = edge.arrow.includes('>') ? '▼' : '│';
        const label = edge.label ? ` ${edge.label} ` : '';
        return [
            '     │',
            `     ${connector}${label}`,
        ].join('\n');
    }

    /**
     * Render sequence diagram
     */
    private renderSequence(code: string): string {
        const lines = code.split('\n').slice(1);
        const participants: string[] = [];
        const messages: SequenceMessage[] = [];

        // Parse participants and messages
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('%%')) continue;

            // Participant
            const partMatch = trimmed.match(/participant\s+(\w+)(?:\s+as\s+(.+))?/);
            if (partMatch) {
                participants.push(partMatch[2] || partMatch[1]);
                continue;
            }

            // Message
            const msgMatch = trimmed.match(/(\w+)\s*(-+>>?|-+x)\s*(\w+)\s*:\s*(.+)/);
            if (msgMatch) {
                const [, from, arrow, to, text] = msgMatch;
                messages.push({ from, to, text, arrow });
            }
        }

        // Render ASCII timeline
        return this.buildSequenceASCII(participants, messages);
    }

    /**
     * Build sequence diagram ASCII
     */
    private buildSequenceASCII(participants: string[], messages: SequenceMessage[]): string {
        const lines: string[] = [];
        const width = 20;

        // Header with participants
        const header = participants.map(p => p.padEnd(width)).join('  ');
        lines.push(header);
        lines.push(participants.map(() => '│'.padEnd(width)).join('  '));

        // Messages
        for (const msg of messages) {
            const arrow = msg.arrow.includes('x') ? '──X' : '──▶';
            lines.push(`    ${arrow} ${msg.text}`);
            lines.push(participants.map(() => '│'.padEnd(width)).join('  '));
        }

        return lines.join('\n');
    }

    /**
     * Render Gantt chart (simplified)
     */
    private renderGantt(code: string): string {
        const lines: string[] = ['[Gantt Chart]'];
        const tasks = code.split('\n').filter(line => {
            const trimmed = line.trim();
            return trimmed && !trimmed.startsWith('%%') && !trimmed.startsWith('gantt');
        });

        for (const task of tasks) {
            const taskMatch = task.match(/(.+?)\s*:\s*(.+)/);
            if (taskMatch) {
                const [, name, duration] = taskMatch;
                const barLength = Math.min(Math.max(10, Math.floor(Math.random() * 30)), 40);
                const bar = '█'.repeat(barLength);
                lines.push(`${name.trim().padEnd(20)} ${bar}`);
            }
        }

        return lines.join('\n');
    }

    /**
     * Render class diagram (simplified)
     */
    private renderClassDiagram(code: string): string {
        return '[Class Diagram]\n' + this.renderFallback(code);
    }

    /**
     * Render state diagram (simplified)
     */
    private renderStateDiagram(code: string): string {
        return '[State Diagram]\n' + this.renderFallback(code);
    }

    /**
     * Render pie chart (simplified)
     */
    private renderPie(code: string): string {
        return '[Pie Chart]\n' + this.renderFallback(code);
    }

    /**
     * Fallback renderer for unsupported diagrams
     */
    private renderFallback(code: string): string {
        const lines = code.split('\n');
        const boxWidth = Math.max(...lines.map(l => l.length)) + 4;

        return [
            '┌' + '─'.repeat(boxWidth) + '┐',
            '│  [Mermaid Diagram]' + ' '.repeat(boxWidth - 20) + '  │',
            '│' + ' '.repeat(boxWidth) + '│',
            ...lines.slice(0, 10).map(line => '│  ' + line.padEnd(boxWidth - 2) + '│'),
            '└' + '─'.repeat(boxWidth) + '┘',
        ].join('\n');
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<MermaidTTYConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

interface FlowNode {
    id: string;
    label: string;
    shape: 'box' | 'rounded' | 'diamond' | 'circle';
}

interface FlowEdge {
    from: string;
    to: string;
    label?: string;
    arrow: string;
}

interface SequenceMessage {
    from: string;
    to: string;
    text: string;
    arrow: string;
}

/**
 * Singleton instance
 */
export const mermaidRenderer = new MermaidRenderer();

/**
 * Convenience function for rendering mermaid diagrams
 */
export async function renderMermaidDiagram(
    mermaidCode: string,
    config?: MermaidTTYConfig
): Promise<string> {
    if (config) {
        const renderer = new MermaidRenderer(config);
        return renderer.render(mermaidCode);
    }
    return mermaidRenderer.render(mermaidCode);
}

