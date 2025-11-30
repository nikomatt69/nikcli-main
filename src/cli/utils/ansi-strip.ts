/**
 * ANSI Code Stripping and Width Calculation
 * Handles prompt width calculation for readline.setPrompt()
 * Critical for fixing invisible ANSI codes in CLI output
 */

export class AnsiStripper {
  // ANSI escape sequence pattern (CSI sequences)
  private static readonly ANSI_PATTERN = /\x1b\[[^m]*m/g

  // Alternative ANSI patterns for edge cases
  private static readonly ANSI_8_BIT = /\x1b\[[0-9;]*m/g
  private static readonly OSC_PATTERN = /\x1b\][^\x07]*\x07/g
  private static readonly ST_PATTERN = /\x1b\\[^\x1b]*\x1b\\/g

  /**
   * Strip all ANSI codes from string
   * Removes color, bold, underline, and other formatting
   */
  static strip(str: string): string {
    return str
      .replace(AnsiStripper.ANSI_8_BIT, '')
      .replace(AnsiStripper.OSC_PATTERN, '')
      .replace(AnsiStripper.ST_PATTERN, '')
  }

  /**
   * Calculate visual width (for terminal display)
   * Accounts for double-width characters (emoji, CJK)
   */
  static visualWidth(str: string): number {
    const stripped = AnsiStripper.strip(str)
    let width = 0

    for (const char of stripped) {
      const code = char.charCodeAt(0)
      // Simple heuristic: emoji and CJK are double-width
      if (code > 0x1000 || (code >= 0x2000 && code <= 0x206f)) {
        width += 2
      } else {
        width += 1
      }
    }

    return width
  }

  /**
   * Safe prompt for readline - strips ANSI from full prompt
   * Required because readline.setPrompt() calculates width incorrectly with ANSI codes
   */
  static safePrompt(coloredPrompt: string): string {
    // For multiline prompts, strip ANSI from all lines
    return AnsiStripper.strip(coloredPrompt)
  }
}

export const ansiStripper = AnsiStripper
