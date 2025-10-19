import { SecurityConfig } from '../types';
import { sanitizeForTerminal } from './ansi-sanitizer';

/**
 * Input validator for markdown content
 * Prevents buffer overflow, injection attacks, and validates content
 */
export class InputValidator {
    private config: Required<SecurityConfig>;

    constructor(config: SecurityConfig = {}) {
        this.config = {
            enabled: config.enabled ?? true,
            allowedLinkPrefixes: config.allowedLinkPrefixes ?? ['http://', 'https://'],
            allowedImagePrefixes: config.allowedImagePrefixes ?? ['http://', 'https://'],
            maxBufferSize: config.maxBufferSize ?? 10 * 1024 * 1024, // 10MB default
            stripDangerousAnsi: config.stripDangerousAnsi ?? true,
            sanitizeHtml: config.sanitizeHtml ?? true,
        };
    }

    /**
     * Validate markdown input
     */
    validate(input: string): ValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];
        let sanitized = input;

        if (!this.config.enabled) {
            return { valid: true, sanitized, errors, warnings };
        }

        // Check buffer size
        if (input.length > this.config.maxBufferSize) {
            errors.push(
                `Input exceeds maximum buffer size (${input.length} > ${this.config.maxBufferSize})`
            );
            return { valid: false, sanitized, errors, warnings };
        }

        // Sanitize ANSI codes if enabled
        if (this.config.stripDangerousAnsi) {
            const originalLength = sanitized.length;
            sanitized = sanitizeForTerminal(sanitized);
            if (sanitized.length !== originalLength) {
                warnings.push('Dangerous ANSI escape sequences were removed');
            }
        }

        // Validate links
        const linkValidation = this.validateLinks(sanitized);
        if (!linkValidation.valid) {
            warnings.push(...linkValidation.warnings);
        }

        // Validate images
        const imageValidation = this.validateImages(sanitized);
        if (!imageValidation.valid) {
            warnings.push(...imageValidation.warnings);
        }

        // Check for blessed tag injection
        const injectionCheck = this.checkBlessedInjection(sanitized);
        if (!injectionCheck.valid) {
            errors.push(...injectionCheck.errors);
            sanitized = injectionCheck.sanitized;
        }

        // Sanitize HTML if enabled
        if (this.config.sanitizeHtml) {
            sanitized = this.sanitizeHtmlEntities(sanitized);
        }

        return {
            valid: errors.length === 0,
            sanitized,
            errors,
            warnings,
        };
    }

    /**
     * Validate link prefixes
     */
    private validateLinks(input: string): ValidationResult {
        const warnings: string[] = [];
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        let match;

        while ((match = linkRegex.exec(input)) !== null) {
            const url = match[2];
            const isAllowed = this.config.allowedLinkPrefixes.some(prefix =>
                prefix === '*' || url.startsWith(prefix)
            );

            if (!isAllowed) {
                warnings.push(`Link with prefix '${url.split(':')[0]}' is not in allowed list`);
            }
        }

        return {
            valid: true, // Links are warnings, not errors
            sanitized: input,
            warnings,
            errors: [],
        };
    }

    /**
     * Validate image prefixes
     */
    private validateImages(input: string): ValidationResult {
        const warnings: string[] = [];
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;

        while ((match = imageRegex.exec(input)) !== null) {
            const url = match[2];
            const isAllowed = this.config.allowedImagePrefixes.some(prefix =>
                prefix === '*' || url.startsWith(prefix)
            );

            if (!isAllowed) {
                warnings.push(`Image with prefix '${url.split(':')[0]}' is not in allowed list`);
            }
        }

        return {
            valid: true, // Images are warnings, not errors
            sanitized: input,
            warnings,
            errors: [],
        };
    }

    /**
     * Check for blessed tag injection
     */
    private checkBlessedInjection(input: string): ValidationResult {
        const errors: string[] = [];
        let sanitized = input;

        // Check for unbalanced tags
        const openTags = (input.match(/\{[a-z-]+}/gi) || []).length;
        const closeTags = (input.match(/\{\/[a-z-]+}/gi) || []).length;

        if (openTags !== closeTags) {
            errors.push('Unbalanced blessed tags detected');
            // Escape all blessed tags
            sanitized = sanitized.replace(/\{/g, '\\{');
        }

        // Check for potentially malicious tags
        const dangerousTags = ['open', 'close', 'exec', 'eval'];
        for (const tag of dangerousTags) {
            if (input.includes(`{${tag}}`) || input.includes(`{/${tag}}`)) {
                errors.push(`Potentially dangerous blessed tag detected: ${tag}`);
                sanitized = sanitized.replace(new RegExp(`\\{\\/?${tag}\\}`, 'gi'), '');
            }
        }

        return {
            valid: errors.length === 0,
            sanitized,
            errors,
            warnings: [],
        };
    }

    /**
     * Sanitize HTML entities
     */
    private sanitizeHtmlEntities(input: string): string {
        const entityMap: Record<string, string> = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        };

        // Only sanitize if not already in markdown code
        let result = input;
        const codeBlockRegex = /```[\s\S]*?```|`[^`]+`/g;
        const codeBlocks: string[] = [];

        // Preserve code blocks
        result = result.replace(codeBlockRegex, (match) => {
            codeBlocks.push(match);
            return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
        });

        // Sanitize outside code blocks (only in HTML contexts)
        result = result.replace(/<[^>]+>/g, (tag) => {
            return tag.replace(/[&<>"']/g, char => entityMap[char] || char);
        });

        // Restore code blocks
        result = result.replace(/__CODE_BLOCK_(\d+)__/g, (match, index) => {
            return codeBlocks[parseInt(index)];
        });

        return result;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<SecurityConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Get current configuration
     */
    getConfig(): Required<SecurityConfig> {
        return { ...this.config };
    }
}

/**
 * Validation result
 */
export interface ValidationResult {
    valid: boolean;
    sanitized: string;
    errors: string[];
    warnings: string[];
}

/**
 * Singleton instance
 */
export const inputValidator = new InputValidator();

/**
 * Validate input with default validator
 */
export function validateInput(input: string, config?: SecurityConfig): ValidationResult {
    if (config) {
        const validator = new InputValidator(config);
        return validator.validate(input);
    }
    return inputValidator.validate(input);
}

