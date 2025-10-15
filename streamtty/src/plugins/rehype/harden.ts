import { RehypePlugin, PluginContext } from '../types';
import { ParsedToken } from '../../types';
import { sanitizeANSI } from '../../security/ansi-sanitizer';

/**
 * Harden individual token
 */
function hardenToken(token: ParsedToken, config: HardenTokenConfig): ParsedToken {
    const hardened = { ...token };

    // Sanitize content for ANSI if enabled
    if (config.stripDangerousAnsi && hardened.content) {
        hardened.content = sanitizeANSI(hardened.content);
    }

    // Validate links
    if (token.type === 'link' && hardened.content) {
        const isAllowed = config.allowedLinkPrefixes.some(prefix =>
            prefix === '*' || hardened.content.startsWith(prefix)
        );
        if (!isAllowed) {
            // Strip link, keep text
            hardened.type = 'text';
        }
    }

    // Validate images
    if (token.type === 'image' && hardened.content) {
        const isAllowed = config.allowedImagePrefixes.some(prefix =>
            prefix === '*' || hardened.content.startsWith(prefix)
        );
        if (!isAllowed) {
            // Convert to text
            hardened.type = 'text';
            hardened.content = `[Image: ${hardened.content}]`;
        }
    }

    // Escape potential blessed tag injection in text content
    if (['text', 'paragraph'].includes(hardened.type) && hardened.content) {
        hardened.content = escapeBlessedTags(hardened.content);
    }

    return hardened;
}

/**
 * Escape blessed tags in user content
 */
function escapeBlessedTags(content: string): string {
    // Only escape if tags are unbalanced or potentially malicious
    const openTags = (content.match(/\{[a-z-]+}/gi) || []).length;
    const closeTags = (content.match(/\{\/[a-z-]+}/gi) || []).length;

    if (openTags !== closeTags) {
        // Escape all braces
        return content.replace(/\{/g, '\\{').replace(/\}/g, '\\}');
    }

    return content;
}

/**
 * Rehype plugin for TTY security hardening
 * Validates and sanitizes tokens for safe rendering
 */
export const rehypeHarden: RehypePlugin = {
    name: 'rehype-harden',
    type: 'rehype',
    priority: 1, // Run early
    enabled: true,

    async process(tokens: ParsedToken[], context: PluginContext): Promise<ParsedToken[]> {
        const config = context.options as HardenConfig;
        const allowedLinkPrefixes = config.allowedLinkPrefixes || ['http://', 'https://'];
        const allowedImagePrefixes = config.allowedImagePrefixes || ['http://', 'https://'];
        const stripDangerousAnsi = config.stripDangerousAnsi ?? true;

        return tokens.map(token => hardenToken(token, {
            allowedLinkPrefixes,
            allowedImagePrefixes,
            stripDangerousAnsi,
        }));
    },
};

/**
 * Harden configuration
 */
export interface HardenConfig {
    allowedLinkPrefixes?: string[];
    allowedImagePrefixes?: string[];
    stripDangerousAnsi?: boolean;
}

interface HardenTokenConfig {
    allowedLinkPrefixes: string[];
    allowedImagePrefixes: string[];
    stripDangerousAnsi: boolean;
}

