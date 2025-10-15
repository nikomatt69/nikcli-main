import { RemarkPlugin, PluginContext } from '../types';

/**
 * Remark plugin for math detection and preprocessing
 * Detects inline math ($...$) and block math ($$...$$)
 */
export const remarkMath: RemarkPlugin = {
    name: 'remark-math',
    type: 'remark',
    priority: 10,
    enabled: true,

    async process(markdown: string, context: PluginContext): Promise<string> {
        let result = markdown;

        // Mark block math with special markers for later processing
        result = result.replace(
            /\$\$([^$]+?)\$\$/g,
            (match, content) => `\n\`\`\`math-block\n${content.trim()}\n\`\`\`\n`
        );

        // Mark inline math with special markers
        result = result.replace(
            /\$([^$\n]+?)\$/g,
            (match, content) => `\`math-inline:${content.trim()}\``
        );

        return result;
    },
};

