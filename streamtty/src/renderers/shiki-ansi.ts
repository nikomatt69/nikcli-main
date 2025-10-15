import { createHighlighter, type Highlighter, type BundledLanguage, type BundledTheme } from 'shiki';

/**
 * Shiki to ANSI color converter
 * Converts Shiki syntax highlighting to ANSI terminal codes
 */
export class ShikiANSIRenderer {
    private highlighter: Highlighter | null = null;
    private initialized: boolean = false;
    private theme: 'light' | 'dark' = 'dark';

    // Map Shiki colors to ANSI codes
    private static readonly ANSI_COLORS: Record<string, string> = {
        // Foreground colors
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        gray: '\x1b[90m',

        // Bright colors
        brightRed: '\x1b[91m',
        brightGreen: '\x1b[92m',
        brightYellow: '\x1b[93m',
        brightBlue: '\x1b[94m',
        brightMagenta: '\x1b[95m',
        brightCyan: '\x1b[96m',
        brightWhite: '\x1b[97m',

        // Styles
        reset: '\x1b[0m',
        bold: '\x1b[1m',
        dim: '\x1b[2m',
        italic: '\x1b[3m',
        underline: '\x1b[4m',
    };

    /**
     * Initialize Shiki highlighter
     */
    async initialize(
        languages: BundledLanguage[] = ['typescript', 'javascript', 'python', 'bash', 'json', 'markdown'],
        theme: 'light' | 'dark' = 'dark'
    ): Promise<void> {
        if (this.initialized) return;

        try {
            const themeMap: Record<'light' | 'dark', BundledTheme> = {
                light: 'github-light',
                dark: 'github-dark',
            };

            this.theme = theme;
            this.highlighter = await createHighlighter({
                themes: [themeMap[theme]],
                langs: languages as BundledLanguage[],
            });
            this.initialized = true;
        } catch (error) {
            console.warn('Failed to initialize Shiki highlighter:', error);
            this.initialized = false;
        }
    }

    /**
     * Highlight code with Shiki and convert to ANSI
     */
    async highlight(code: string, language: string): Promise<string> {
        if (!this.initialized || !this.highlighter) {
            return code; // Fallback to unhighlighted
        }

        try {
            const themeMap: Record<'light' | 'dark', BundledTheme> = {
                light: 'github-light',
                dark: 'github-dark',
            };

            // Get themed tokens from Shiki
            const tokens = this.highlighter.codeToTokensBase(code, {
                lang: language as BundledLanguage,
                theme: themeMap[this.theme],
            });

            // Convert tokens to ANSI codes
            let result = '';
            for (const line of tokens) {
                for (const token of line) {
                    const ansiCode = this.colorToANSI(token.color || '#ffffff');
                    result += ansiCode + token.content + ShikiANSIRenderer.ANSI_COLORS.reset;
                }
                result += '\n';
            }

            return result.trimEnd();
        } catch (error) {
            console.warn(`Failed to highlight code for language '${language}':`, error);
            return code; // Fallback
        }
    }

    /**
     * Convert hex color to closest ANSI color code
     */
    private colorToANSI(hexColor: string): string {
        // Parse hex color
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        // Calculate luminance
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Map to closest ANSI color based on hue and luminance
        if (luminance < 50) {
            return ShikiANSIRenderer.ANSI_COLORS.gray;
        } else if (luminance > 200) {
            return ShikiANSIRenderer.ANSI_COLORS.brightWhite;
        }

        // Determine dominant color
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        if (delta < 30) {
            // Grayish
            return luminance > 128
                ? ShikiANSIRenderer.ANSI_COLORS.white
                : ShikiANSIRenderer.ANSI_COLORS.gray;
        }

        // Color-specific mapping
        if (r > g && r > b) {
            // Red-ish
            return luminance > 128
                ? ShikiANSIRenderer.ANSI_COLORS.brightRed
                : ShikiANSIRenderer.ANSI_COLORS.red;
        } else if (g > r && g > b) {
            // Green-ish
            return luminance > 128
                ? ShikiANSIRenderer.ANSI_COLORS.brightGreen
                : ShikiANSIRenderer.ANSI_COLORS.green;
        } else if (b > r && b > g) {
            // Blue-ish
            return luminance > 128
                ? ShikiANSIRenderer.ANSI_COLORS.brightBlue
                : ShikiANSIRenderer.ANSI_COLORS.blue;
        } else if (r > 150 && g > 150 && b < 100) {
            // Yellow-ish
            return ShikiANSIRenderer.ANSI_COLORS.yellow;
        } else if (r > 150 && b > 150) {
            // Magenta-ish
            return ShikiANSIRenderer.ANSI_COLORS.magenta;
        } else if (g > 150 && b > 150) {
            // Cyan-ish
            return ShikiANSIRenderer.ANSI_COLORS.cyan;
        }

        // Default
        return ShikiANSIRenderer.ANSI_COLORS.white;
    }

    /**
     * Check if highlighter supports a language
     */
    supportsLanguage(language: string): boolean {
        if (!this.highlighter) return false;
        return this.highlighter.getLoadedLanguages().includes(language as BundledLanguage);
    }

    /**
     * Switch theme
     */
    async setTheme(theme: 'light' | 'dark'): Promise<void> {
        this.theme = theme;
        // Re-initialize with new theme
        this.initialized = false;
        await this.initialize(
            this.highlighter?.getLoadedLanguages() as BundledLanguage[] || [],
            theme
        );
    }

    /**
     * Load additional language
     */
    async loadLanguage(language: BundledLanguage): Promise<void> {
        if (!this.highlighter) return;

        try {
            await this.highlighter.loadLanguage(language);
        } catch (error) {
            console.warn(`Failed to load language '${language}':`, error);
        }
    }

    /**
     * Get loaded languages
     */
    getLoadedLanguages(): string[] {
        return this.highlighter?.getLoadedLanguages() || [];
    }

    /**
     * Check if initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }
}

/**
 * Singleton instance
 */
export const shikiRenderer = new ShikiANSIRenderer();

