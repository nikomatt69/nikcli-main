import ansiRegex from 'ansi-regex';

/**
 * ANSI escape sequence sanitizer
 * Prevents malicious terminal escape sequences while preserving color codes
 */
export class ANSISanitizer {
    private static readonly SAFE_CSI_CODES = /^\x1b\[([\d;]*)m$/; // SGR (color) codes
    private static readonly DANGEROUS_PATTERNS = [
        /\x1b\][^\x07]*\x07/g,           // OSC sequences (can change title, etc.)
        /\x1b\[.*[HfABCDsuJK]/g,         // Cursor movement and screen manipulation
        /\x1b\[.*[@PXLM]/g,              // Character/line operations
        /\x1b\[[0-9;]*[hl]/g,            // Mode setting
        /\x1b\].*$/g,                     // Operating system commands
        /\x1b_.*\x1b\\/g,                // Application program commands
        /\x1b[PX^_]/g,                   // Control sequences
        /\x1b\[\?([\d;]*)[hlr]/g,        // DEC private mode
    ];

    /**
     * Sanitize ANSI codes - remove dangerous ones, keep color codes
     */
    static sanitize(input: string, stripAll: boolean = false): string {
        if (stripAll) {
            return this.stripAllANSI(input);
        }

        let result = input;

        // Remove dangerous escape sequences
        for (const pattern of this.DANGEROUS_PATTERNS) {
            result = result.replace(pattern, '');
        }

        // Validate remaining escape sequences
        const regex = ansiRegex();
        result = result.replace(regex, (match) => {
            // Allow SGR (color/style) codes
            if (this.SAFE_CSI_CODES.test(match)) {
                return match;
            }
            // Strip everything else
            return '';
        });

        return result;
    }

    /**
     * Strip all ANSI codes
     */
    static stripAllANSI(input: string): string {
        const regex = ansiRegex();
        return input.replace(regex, '');
    }

    /**
     * Validate if string contains only safe ANSI codes
     */
    static isSafe(input: string): boolean {
        const regex = ansiRegex();
        const matches = input.match(regex) || [];

        for (const match of matches) {
            if (!this.SAFE_CSI_CODES.test(match)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get count of ANSI sequences in string
     */
    static countSequences(input: string): number {
        const regex = ansiRegex();
        const matches = input.match(regex) || [];
        return matches.length;
    }

    /**
     * Extract all ANSI sequences from string
     */
    static extractSequences(input: string): string[] {
        const regex = ansiRegex();
        return input.match(regex) || [];
    }
}

/**
 * Sanitize ANSI codes in input
 */
export function sanitizeANSI(input: string, stripAll: boolean = false): string {
    return ANSISanitizer.sanitize(input, stripAll);
}

/**
 * Check if input contains only safe ANSI codes
 */
export function isSafeANSI(input: string): boolean {
    return ANSISanitizer.isSafe(input);
}

/**
 * Strip all ANSI codes
 */
export function stripANSI(input: string): string {
    return ANSISanitizer.stripAllANSI(input);
}

