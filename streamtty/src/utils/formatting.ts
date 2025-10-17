/**
 * ANSI color codes for terminal output
 */
export const colors = {
  // Basic colors
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

  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',

  // Styles
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
  hidden: '\x1b[8m',
  strikethrough: '\x1b[9m',
};

/**
 * Colorize text with ANSI codes
 */
export function colorize(text: string, color: keyof typeof colors): string {
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Apply multiple styles to text
 */
export function style(
  text: string,
  styles: Array<keyof typeof colors>
): string {
  const prefix = styles.map(s => colors[s]).join('');
  return `${prefix}${text}${colors.reset}`;
}

/**
 * Strip ANSI codes from text
 */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get visual length of text (accounting for ANSI codes)
 */
export function visualLength(text: string): number {
  return stripAnsi(text).length;
}

/**
 * Pad text to specified width
 */
export function pad(
  text: string,
  width: number,
  align: 'left' | 'center' | 'right' = 'left'
): string {
  const length = visualLength(text);
  const padding = Math.max(0, width - length);

  switch (align) {
    case 'left':
      return text + ' '.repeat(padding);
    case 'right':
      return ' '.repeat(padding) + text;
    case 'center':
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    default:
      return text;
  }
}

/**
 * Truncate text to specified width with ellipsis
 */
export function truncate(
  text: string,
  width: number,
  ellipsis: string = '...'
): string {
  const length = visualLength(text);

  if (length <= width) {
    return text;
  }

  const stripped = stripAnsi(text);
  const truncated = stripped.slice(0, width - ellipsis.length);
  return truncated + ellipsis;
}

/**
 * Wrap text to specified width
 */
export function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  const words = text.split(/\s+/);
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testLength = visualLength(testLine);

    if (testLength <= width) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Create a horizontal line
 */
export function horizontalLine(
  width: number,
  char: string = '─',
  color?: keyof typeof colors
): string {
  const line = char.repeat(width);
  return color ? colorize(line, color) : line;
}

/**
 * Create a box around text
 */
export function box(
  text: string,
  options: {
    width?: number;
    padding?: number;
    title?: string;
    borderColor?: keyof typeof colors;
  } = {}
): string {
  const {
    width = 80,
    padding = 1,
    title,
    borderColor,
  } = options;

  const lines = wordWrap(text, width - (padding * 2) - 2);
  const maxLineLength = Math.max(...lines.map(l => visualLength(l)));
  const boxWidth = Math.min(width, maxLineLength + (padding * 2) + 2);

  const topBorder = title
    ? `┌─ ${title} ${'─'.repeat(Math.max(0, boxWidth - title.length - 5))}┐`
    : `┌${'─'.repeat(boxWidth - 2)}┐`;

  const bottomBorder = `└${'─'.repeat(boxWidth - 2)}┘`;

  const boxLines = [
    borderColor ? colorize(topBorder, borderColor) : topBorder,
  ];

  for (const line of lines) {
    const paddedLine = pad(line, boxWidth - (padding * 2) - 2);
    const boxLine = `│${' '.repeat(padding)}${paddedLine}${' '.repeat(padding)}│`;
    boxLines.push(borderColor ? colorize(boxLine, borderColor) : boxLine);
  }

  boxLines.push(borderColor ? colorize(bottomBorder, borderColor) : bottomBorder);

  return boxLines.join('\n');
}

/**
 * Indent text
 */
export function indent(text: string, spaces: number): string {
  const indentation = ' '.repeat(spaces);
  return text
    .split('\n')
    .map(line => indentation + line)
    .join('\n');
}

/**
 * Create a progress bar
 */
export function progressBar(
  current: number,
  total: number,
  width: number = 30,
  options: {
    showPercent?: boolean;
    completeChar?: string;
    incompleteChar?: string;
    color?: keyof typeof colors;
  } = {}
): string {
  const {
    showPercent = true,
    completeChar = '█',
    incompleteChar = '░',
    color,
  } = options;

  const percent = Math.min(100, Math.max(0, (current / total) * 100));
  const completeWidth = Math.floor((width * percent) / 100);
  const incompleteWidth = width - completeWidth;

  let bar = completeChar.repeat(completeWidth) + incompleteChar.repeat(incompleteWidth);

  if (color) {
    bar = colorize(bar, color);
  }

  if (showPercent) {
    const percentText = ` ${percent.toFixed(0)}%`;
    return `${bar}${percentText}`;
  }

  return bar;
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format duration to human readable
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}
