import katex from 'katex';
import { MathRenderConfig } from '../types';

/**
 * Math renderer for TTY
 * Converts LaTeX math to Unicode/ASCII representation
 */
export class MathRenderer {
    private config: MathRenderConfig;

    // Unicode math symbol mappings
    private static readonly UNICODE_SYMBOLS: Record<string, string> = {
        // Greek letters
        'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
        'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
        'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'pi': 'π',
        'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ', 'phi': 'φ',
        'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',

        // Capital Greek
        'Gamma': 'Γ', 'Delta': 'Δ', 'Theta': 'Θ', 'Lambda': 'Λ', 'Xi': 'Ξ',
        'Pi': 'Π', 'Sigma': 'Σ', 'Phi': 'Φ', 'Psi': 'Ψ', 'Omega': 'Ω',

        // Math operators
        'pm': '±', 'mp': '∓', 'times': '×', 'div': '÷', 'cdot': '·',
        'leq': '≤', 'geq': '≥', 'neq': '≠', 'approx': '≈', 'equiv': '≡',
        'propto': '∝', 'infty': '∞', 'partial': '∂', 'nabla': '∇',
        'sum': '∑', 'prod': '∏', 'int': '∫', 'oint': '∮',
        'sqrt': '√', 'cbrt': '∛',

        // Arrows
        'rightarrow': '→', 'leftarrow': '←', 'uparrow': '↑', 'downarrow': '↓',
        'leftrightarrow': '↔', 'Rightarrow': '⇒', 'Leftarrow': '⇐',
        'Leftrightarrow': '⇔', 'mapsto': '↦',

        // Set theory
        'in': '∈', 'notin': '∉', 'subset': '⊂', 'supset': '⊃',
        'subseteq': '⊆', 'supseteq': '⊇', 'cup': '∪', 'cap': '∩',
        'emptyset': '∅', 'exists': '∃', 'forall': '∀',

        // Logic
        'land': '∧', 'lor': '∨', 'lnot': '¬', 'implies': '⇒',

        // Other
        'dots': '…', 'cdots': '⋯', 'ldots': '…', 'vdots': '⋮',
        'therefore': '∴', 'because': '∵',
    };

    // Superscript digits
    private static readonly SUPERSCRIPTS: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
        'n': 'ⁿ', 'i': 'ⁱ',
    };

    // Subscript digits
    private static readonly SUBSCRIPTS: Record<string, string> = {
        '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
        '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
        '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
        'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
        'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ',
        'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
        'v': 'ᵥ', 'x': 'ₓ',
    };

    constructor(config: MathRenderConfig = {}) {
        this.config = {
            displayMode: false,
            throwOnError: false,
            errorColor: 'red',
            ...config,
        };
    }

    /**
     * Convert LaTeX math to Unicode representation
     */
    convertToUnicode(latex: string, displayMode: boolean = false): string {
        try {
            // Try to parse with KaTeX first for validation
            const parsed = katex.renderToString(latex, {
                displayMode: displayMode || this.config.displayMode,
                throwOnError: this.config.throwOnError || false,
                trust: this.config.trust || false,
                macros: this.config.macros || {},
            });

            // Convert to Unicode representation
            return this.latexToUnicode(latex);
        } catch (error) {
            if (this.config.throwOnError) {
                throw error;
            }
            return this.formatError((error as Error).message);
        }
    }

    /**
     * Convert LaTeX to Unicode text
     */
    private latexToUnicode(latex: string): string {
        let result = latex;

        // Remove LaTeX commands we don't need
        result = result.replace(/\\text\{([^}]+)\}/g, '$1');
        result = result.replace(/\\mathrm\{([^}]+)\}/g, '$1');
        result = result.replace(/\\mathbf\{([^}]+)\}/g, '$1');
        result = result.replace(/\\mathit\{([^}]+)\}/g, '$1');

        // Replace backslash commands with Unicode
        for (const [command, symbol] of Object.entries(MathRenderer.UNICODE_SYMBOLS)) {
            const regex = new RegExp(`\\\\${command}\\b`, 'g');
            result = result.replace(regex, symbol);
        }

        // Handle fractions: \frac{a}{b} → a/b
        result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');

        // Handle superscripts: x^2 → x²
        result = result.replace(/(\w)\^(\d)/g, (match, base, exp) => {
            return base + (MathRenderer.SUPERSCRIPTS[exp] || `^${exp}`);
        });
        result = result.replace(/(\w)\^\{([^}]+)\}/g, (match, base, exp) => {
            return base + this.toSuperscript(exp);
        });

        // Handle subscripts: x_0 → x₀
        result = result.replace(/(\w)_(\w)/g, (match, base, sub) => {
            return base + (MathRenderer.SUBSCRIPTS[sub] || `_${sub}`);
        });
        result = result.replace(/(\w)_\{([^}]+)\}/g, (match, base, sub) => {
            return base + this.toSubscript(sub);
        });

        // Handle square roots: \sqrt{x} → √x
        result = result.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
        result = result.replace(/\\sqrt\[3\]\{([^}]+)\}/g, '∛($1)');

        // Handle common environments
        result = result.replace(/\\begin\{([^}]+)\}(.*?)\\end\{\1\}/gs, '$2');

        // Clean up remaining LaTeX artifacts
        result = result.replace(/\\\\/g, '\n');
        result = result.replace(/\\,/g, ' ');
        result = result.replace(/\\;/g, '  ');
        result = result.replace(/[{}]/g, '');

        return result.trim();
    }

    /**
     * Convert text to superscript
     */
    private toSuperscript(text: string): string {
        return text
            .split('')
            .map(char => MathRenderer.SUPERSCRIPTS[char] || char)
            .join('');
    }

    /**
     * Convert text to subscript
     */
    private toSubscript(text: string): string {
        return text
            .split('')
            .map(char => MathRenderer.SUBSCRIPTS[char] || char)
            .join('');
    }

    /**
     * Format error message
     */
    private formatError(message: string): string {
        return `[Math Error: ${message}]`;
    }

    /**
     * Render inline math (compact)
     */
    renderInline(latex: string): string {
        return this.convertToUnicode(latex, false);
    }

    /**
     * Render block math (centered, bordered)
     */
    renderBlock(latex: string): string {
        const content = this.convertToUnicode(latex, true);
        const lines = content.split('\n');
        const maxWidth = Math.max(...lines.map(line => line.length));

        // Create bordered box
        const border = '─'.repeat(maxWidth + 4);
        const result = [
            `┌${border}┐`,
            ...lines.map(line => `│  ${line.padEnd(maxWidth)}  │`),
            `└${border}┘`,
        ];

        return result.join('\n');
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<MathRenderConfig>): void {
        this.config = { ...this.config, ...config };
    }
}

/**
 * Singleton instance
 */
export const mathRenderer = new MathRenderer();

