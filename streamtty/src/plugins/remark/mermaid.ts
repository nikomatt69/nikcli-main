import { RemarkPlugin, PluginContext } from '../types';

/**
 * Remark plugin for Mermaid diagram detection
 * Marks mermaid code blocks for special rendering
 */
export const remarkMermaid: RemarkPlugin = {
    name: 'remark-mermaid',
    type: 'remark',
    priority: 15,
    enabled: true,

    async process(markdown: string, context: PluginContext): Promise<string> {
        // Mermaid blocks are already marked as code blocks with language 'mermaid'
        // No preprocessing needed - parser will handle them
        return markdown;
    },
};

