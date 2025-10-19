/**
 * ANSI Code Sanitizer
 * Prevents ANSI injection attacks while preserving safe color codes
 */

export interface SanitizationOptions {
  stripAnsi?: boolean;        // Strip all ANSI codes
  maxLength?: number;         // Max buffer size
  allowUnicode?: boolean;     // Allow Unicode characters
  stripControlChars?: boolean; // Strip control characters
}

/**
 * Safe ANSI escape codes that are allowed
 */
const SAFE_ANSI_PATTERNS = [
  /\x1b\[\d{1,3}(?:;\d{1,3})*m/g,           // Colors (SGR - Select Graphic Rendition)
  /\x1b\[2K/g,                               // Erase entire line
  /\x1b\[0J/g,                               // Erase from cursor to end of display
];

/**
 * Dangerous ANSI patterns that should be stripped
 */
const DANGEROUS_ANSI_PATTERNS = [
  /\x1b\]\d*;[^\x07]*\x07/g,                // OSC (Operating System Command)
  /\x1b\]\d*;[^\x1b]*(?:\x1b\\|\x1b\])/g,   // OSC alternative
  /\x1b\[[?0-9;]*[sS]/g,                    // Save/restore cursor
  /\x1b\[[?0-9;]*[AB]/g,                    // Cursor movement
  /\x1b\[s/g,                                // Save cursor
  /\x1b\[u/g,                                // Restore cursor
  /\x1b\[H/g,                                // Cursor home
  /\x1b\[J/g,                                // Erase display
  /\x00/g,                                   // Null bytes (DoS)
  /\x1b\[[?0-9;]*h/g,                       // Set mode
  /\x1b\[[?0-9;]*l/g,                       // Reset mode
];

/**
 * Control characters to filter
 */
const DANGEROUS_CONTROL_CHARS = [
  '\x00', // Null
  '\x01', // SOH (Start of Heading)
  '\x02', // STX (Start of Text)
  '\x03', // ETX (End of Text)
  '\x04', // EOT (End of Transmission)
  '\x05', // ENQ (Enquiry)
  '\x06', // ACK (Acknowledge)
  '\x07', // BEL (Bell)
  '\x08', // BS (Backspace)
  '\x0E', // SO (Shift Out)
  '\x0F', // SI (Shift In)
  '\x10', // DLE (Data Link Escape)
  '\x11', // DC1 (Device Control 1)
  '\x12', // DC2 (Device Control 2)
  '\x13', // DC3 (Device Control 3)
  '\x14', // DC4 (Device Control 4)
  '\x15', // NAK (Negative Acknowledge)
  '\x16', // SYN (Synchronous Idle)
  '\x17', // ETB (End of Transmission Block)
  '\x18', // CAN (Cancel)
  '\x19', // EM (End of Medium)
  '\x1A', // SUB (Substitute)
  '\x1B', // ESC is allowed (it's part of ANSI codes)
  '\x7F', // DEL (Delete)
];

/**
 * Sanitize input for terminal output
 * Removes dangerous sequences while preserving safe ANSI color codes
 */
export function sanitizeForTerminal(
  input: string,
  options?: SanitizationOptions
): string {
  if (!input) return input;

  const {
    stripAnsi = false,
    maxLength = 1000000,
    allowUnicode = true,
    stripControlChars = true,
  } = options || {};

  let result = input;

  // Check length
  if (result.length > maxLength) {
    console.warn(`Input exceeds max length (${maxLength}), truncating`);
    result = result.substring(0, maxLength);
  }

  // Strip dangerous ANSI sequences first
  for (const pattern of DANGEROUS_ANSI_PATTERNS) {
    result = result.replace(pattern, '');
  }

  // Handle safe ANSI codes
  if (stripAnsi) {
    // Remove all ANSI codes
    result = result.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  } else {
    // Keep safe codes only - validate they match safe patterns
    const unsafeAnsiCodes: Array<{ code: string; index: number }> = [];

    // Extract all ANSI-like sequences
    const allAnsiRegex = /\x1b\[[0-9;]*[a-zA-Z]/g;
    let match;

    while ((match = allAnsiRegex.exec(result)) !== null) {
      let isSafe = false;

      // Check against safe patterns
      for (const pattern of SAFE_ANSI_PATTERNS) {
        const testRegex = new RegExp(`^${pattern.source}$`);
        if (testRegex.test(match[0])) {
          isSafe = true;
          break;
        }
      }

      if (!isSafe) {
        // Mark for removal
        unsafeAnsiCodes.push({ code: match[0], index: match.index });
      }
    }

    // Remove unsafe codes (reverse iteration to preserve indices)
    for (let i = unsafeAnsiCodes.length - 1; i >= 0; i--) {
      const item = unsafeAnsiCodes[i];
      result = result.substring(0, item.index) + result.substring(item.index + item.code.length);
    }
  }

  // Strip control characters if requested
  if (stripControlChars) {
    for (const char of DANGEROUS_CONTROL_CHARS) {
      result = result.split(char).join('');
    }
  }

  // Unicode validation if needed
  if (!allowUnicode) {
    result = result.replace(/[^\x00-\x7F]/g, '?');
  }

  // Remove consecutive null bytes (DoS attempt)
  result = result.replace(/\x00+/g, '');

  return result;
}

/**
 * Validate input for safety
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitized: string;
}

export function validateInput(input: string, maxLength: number = 1000000): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let sanitized = input;

  // Check length
  if (input.length > maxLength) {
    errors.push(`Input exceeds maximum length of ${maxLength}`);
    sanitized = sanitized.substring(0, maxLength);
  }

  // Check for dangerous patterns
  if (/\x1b\].*?\x07/.test(input)) {
    warnings.push('OSC sequences detected (stripped)');
  }

  if (/\x00/.test(input)) {
    errors.push('Null bytes detected');
    sanitized = sanitized.replace(/\x00/g, '');
  }

  // Check for excessive ANSI codes (possible DoS)
  const ansiCount = (input.match(/\x1b\[/g) || []).length;
  if (ansiCount > 1000) {
    warnings.push(`Excessive ANSI codes detected (${ansiCount})`);
  }

  // Sanitize
  sanitized = sanitizeForTerminal(sanitized, {
    stripAnsi: false,
    maxLength,
    allowUnicode: true,
    stripControlChars: true,
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    sanitized,
  };
}

/**
 * Strip all ANSI codes (for logging, etc.)
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Check if text contains ANSI codes
 */
export function hasAnsiCodes(text: string): boolean {
  return /\x1b\[[0-9;]*[a-zA-Z]/.test(text);
}

/**
 * Count visible characters (excluding ANSI codes)
 */
export function getVisibleLength(text: string): number {
  return stripAnsiCodes(text).length;
}

/**
 * Truncate text to visible length, preserving ANSI codes
 */
export function truncatePreservingAnsi(text: string, maxVisible: number): string {
  let visibleCount = 0;
  let result = '';
  let i = 0;

  while (i < text.length && visibleCount < maxVisible) {
    if (text[i] === '\x1b') {
      // Found ANSI code start
      const endIdx = text.indexOf('m', i);
      if (endIdx !== -1) {
        // Include entire ANSI code
        result += text.substring(i, endIdx + 1);
        i = endIdx + 1;
        continue;
      }
    }

    result += text[i];
    visibleCount++;
    i++;
  }

  return result;
}

/**
 * Create a content security policy validator
 */
export class ContentValidator {
  private maxLength: number;
  private maxLines: number;
  private allowedPatterns: RegExp[] = [];
  private blockedPatterns: RegExp[] = [];

  constructor(config?: { maxLength?: number; maxLines?: number }) {
    this.maxLength = config?.maxLength ?? 1000000;
    this.maxLines = config?.maxLines ?? 10000;
  }

  /**
   * Add allowed pattern
   */
  allowPattern(pattern: RegExp): void {
    this.allowedPatterns.push(pattern);
  }

  /**
   * Add blocked pattern
   */
  blockPattern(pattern: RegExp): void {
    this.blockedPatterns.push(pattern);
  }

  /**
   * Validate content
   */
  validate(content: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      sanitized: content,
    };

    // Length check
    if (content.length > this.maxLength) {
      result.errors.push(`Content exceeds maximum length (${this.maxLength})`);
      result.valid = false;
    }

    // Line count check
    const lineCount = content.split('\n').length;
    if (lineCount > this.maxLines) {
      result.errors.push(`Content exceeds maximum lines (${this.maxLines})`);
      result.valid = false;
    }

    // Check blocked patterns
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(content)) {
        result.warnings.push(`Blocked pattern detected: ${pattern.source}`);
      }
    }

    // Sanitize
    result.sanitized = sanitizeForTerminal(content, {
      stripAnsi: false,
      maxLength: this.maxLength,
      allowUnicode: true,
      stripControlChars: true,
    });

    return result;
  }
}

/**
 * Export validator instance
 */
export const defaultValidator = new ContentValidator();
