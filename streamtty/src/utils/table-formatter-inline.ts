/**
 * Table Formatter for ASCII output
 * Converts markdown tables to beautiful ASCII formatted tables
 */

export interface TableData {
  headers: string[];
  rows: string[][];
  align?: ('left' | 'center' | 'right')[];
}

export interface TableFormatOptions {
  maxWidth?: number;
  align?: ('left' | 'center' | 'right')[];
  borderStyle?: 'simple' | 'rounded' | 'double' | 'minimal';
  stripMarkdown?: boolean;
  compact?: boolean;
}

/**
 * Parse markdown table to structured data
 */
export function parseMarkdownTable(markdown: string): TableData | null {
  const lines = markdown.split('\n').filter(l => l.trim());

  if (lines.length < 2) return null;

  // First line is headers
  const headerLine = lines[0];
  const separatorLine = lines[1];

  // Parse headers
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h && h !== '');

  if (headers.length === 0) return null;

  // Detect alignment from separator line
  const alignmentCells = separatorLine
    .split('|')
    .map(a => a.trim())
    .filter(a => a && a !== '');

  const align: ('left' | 'center' | 'right')[] = alignmentCells.map(cell => {
    if (/^:-+:$/.test(cell)) return 'center';
    if (/-+:$/.test(cell)) return 'right';
    if (/^:-+/.test(cell)) return 'left';
    return 'left';
  });

  // Parse data rows
  const rows: string[][] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map(c => c.trim())
      .filter((_c, idx) => idx > 0 && idx <= headers.length);

    if (cells.length === headers.length) {
      rows.push(cells);
    }
  }

  return { headers, rows, align };
}

/**
 * Calculate column widths
 */
function calculateColumnWidths(
  table: TableData,
  maxWidth: number = 80,
  compact: boolean = false
): number[] {
  const minWidth = compact ? 3 : 5;
  const availableWidth = maxWidth - table.headers.length * 3 - 1;

  // Start with header widths
  let widths = table.headers.map(h => Math.max(h.length, minWidth));

  // Check data widths
  for (const row of table.rows) {
    for (let i = 0; i < row.length; i++) {
      widths[i] = Math.max(widths[i], Math.min(row[i].length, 30));
    }
  }

  // Scale if total exceeds max width
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  if (totalWidth > availableWidth) {
    const scale = availableWidth / totalWidth;
    widths = widths.map(w => Math.max(minWidth, Math.floor(w * scale)));
  }

  return widths;
}

/**
 * Wrap text to fit column width
 */
function wrapText(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);

  return lines.length === 0 ? [''] : lines;
}

/**
 * Align text in cell
 */
function alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
  text = text.padEnd(width);

  switch (align) {
    case 'right':
      return text.slice(-width); // Right align
    case 'center':
      const leftPad = Math.floor((width - text.trimEnd().length) / 2);
      return text.slice(0, leftPad).padEnd(width);
    case 'left':
    default:
      return text.slice(0, width);
  }
}

/**
 * Get border characters for style
 */
function getBorderChars(style: 'simple' | 'rounded' | 'double' | 'minimal') {
  const borders = {
    simple: {
      topLeft: '┌',
      topRight: '┐',
      bottomLeft: '└',
      bottomRight: '┘',
      topMid: '┬',
      bottomMid: '┴',
      leftMid: '├',
      rightMid: '┤',
      cross: '┼',
      horizontal: '─',
      vertical: '│',
    },
    rounded: {
      topLeft: '╭',
      topRight: '╮',
      bottomLeft: '╰',
      bottomRight: '╯',
      topMid: '┬',
      bottomMid: '┴',
      leftMid: '├',
      rightMid: '┤',
      cross: '┼',
      horizontal: '─',
      vertical: '│',
    },
    double: {
      topLeft: '╔',
      topRight: '╗',
      bottomLeft: '╚',
      bottomRight: '╝',
      topMid: '╦',
      bottomMid: '╩',
      leftMid: '╠',
      rightMid: '╣',
      cross: '╬',
      horizontal: '═',
      vertical: '║',
    },
    minimal: {
      topLeft: ' ',
      topRight: ' ',
      bottomLeft: ' ',
      bottomRight: ' ',
      topMid: ' ',
      bottomMid: ' ',
      leftMid: '  ',
      rightMid: ' ',
      cross: '  ',
      horizontal: ' ',
      vertical: ' ',
    },
  };

  return borders[style];
}

/**
 * Format table to ASCII art
 */
export function formatTableToASCII(
  table: TableData,
  options?: TableFormatOptions
): string {
  const maxWidth = options?.maxWidth || 80;
  const borderStyle = options?.borderStyle || 'simple';
  const compact = options?.compact ?? false;
  const align = options?.align || table.align || table.headers.map(() => 'left');

  const borders = getBorderChars(borderStyle);
  const colWidths = calculateColumnWidths(table, maxWidth, compact);

  const lines: string[] = [];

  // Top border
  let topLine = borders.topLeft;
  for (let i = 0; i < colWidths.length; i++) {
    topLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      topLine += borders.topMid;
    }
  }
  topLine += borders.topRight;
  lines.push(topLine);

  // Header row
  let headerLine = borders.vertical;
  for (let i = 0; i < table.headers.length; i++) {
    const aligned = alignText(table.headers[i], colWidths[i], align[i] || 'left');
    headerLine += ' ' + aligned + ' ' + borders.vertical;
  }
  lines.push(headerLine);

  // Separator after header
  let separatorLine = borders.leftMid;
  for (let i = 0; i < colWidths.length; i++) {
    separatorLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      separatorLine += borders.cross;
    }
  }
  separatorLine += borders.rightMid;
  lines.push(separatorLine);

  // Data rows
  for (const row of table.rows) {
    let dataLine = borders.vertical;
    for (let i = 0; i < row.length; i++) {
      const aligned = alignText(row[i], colWidths[i], align[i] || 'left');
      dataLine += ' ' + aligned + ' ' + borders.vertical;
    }
    lines.push(dataLine);
  }

  // Bottom border
  let bottomLine = borders.bottomLeft;
  for (let i = 0; i < colWidths.length; i++) {
    bottomLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      bottomLine += borders.bottomMid;
    }
  }
  bottomLine += borders.bottomRight;
  lines.push(bottomLine);

  return lines.join('\n');
}

/**
 * Format table with multi-line cells
 */
export function formatTableMultiline(
  table: TableData,
  options?: TableFormatOptions
): string {
  const maxWidth = options?.maxWidth || 80;
  const borderStyle = options?.borderStyle || 'simple';
  const align = options?.align || table.align || table.headers.map(() => 'left');

  const borders = getBorderChars(borderStyle);
  const colWidths = calculateColumnWidths(table, maxWidth, false);

  const lines: string[] = [];

  // Top border
  let topLine = borders.topLeft;
  for (let i = 0; i < colWidths.length; i++) {
    topLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      topLine += borders.topMid;
    }
  }
  topLine += borders.topRight;
  lines.push(topLine);

  // Header row
  const headerLines = table.headers.map((h, i) => {
    const wrapped = wrapText(h, colWidths[i]);
    return wrapped.map(line => alignText(line, colWidths[i], align[i] || 'left'));
  });

  const maxHeaderLines = Math.max(...headerLines.map(h => h.length));
  for (let lineIdx = 0; lineIdx < maxHeaderLines; lineIdx++) {
    let headerLine = borders.vertical;
    for (let colIdx = 0; colIdx < table.headers.length; colIdx++) {
      const line = headerLines[colIdx][lineIdx] || '';
      headerLine += ' ' + line.padEnd(colWidths[colIdx]) + ' ' + borders.vertical;
    }
    lines.push(headerLine);
  }

  // Separator
  let separatorLine = borders.leftMid;
  for (let i = 0; i < colWidths.length; i++) {
    separatorLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      separatorLine += borders.cross;
    }
  }
  separatorLine += borders.rightMid;
  lines.push(separatorLine);

  // Data rows
  for (const row of table.rows) {
    const cellLines = row.map((cell, i) => {
      const wrapped = wrapText(cell, colWidths[i]);
      return wrapped.map(line => alignText(line, colWidths[i], align[i] || 'left'));
    });

    const maxCellLines = Math.max(...cellLines.map(c => c.length));
    for (let lineIdx = 0; lineIdx < maxCellLines; lineIdx++) {
      let dataLine = borders.vertical;
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const line = cellLines[colIdx][lineIdx] || '';
        dataLine += ' ' + line.padEnd(colWidths[colIdx]) + ' ' + borders.vertical;
      }
      lines.push(dataLine);
    }
  }

  // Bottom border
  let bottomLine = borders.bottomLeft;
  for (let i = 0; i < colWidths.length; i++) {
    bottomLine += borders.horizontal.repeat(colWidths[i] + 2);
    if (i < colWidths.length - 1) {
      bottomLine += borders.bottomMid;
    }
  }
  bottomLine += borders.bottomRight;
  lines.push(bottomLine);

  return lines.join('\n');
}

/**
 * CSV to table data
 */
export function csvToTable(csv: string): TableData {
  const lines = csv.trim().split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(',').map(h => h.trim());
  const rows = lines.slice(1).map(line =>
    line.split(',').map(cell => cell.trim())
  );

  return { headers, rows };
}

/**
 * Detect if text is a table
 */
export function isTableMarkdown(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length < 2) return false;

  // Check for pipe separators
  const firstLine = lines[0];
  const secondLine = lines[1];

  if (!firstLine.includes('|') || !secondLine.includes('|')) {
    return false;
  }

  // Check if second line looks like a separator
  return /^[\s|:-]+$/.test(secondLine);
}
