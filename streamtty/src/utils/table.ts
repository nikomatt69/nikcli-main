import { pad, visualLength, horizontalLine } from './formatting';

export interface TableColumn {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableRow {
  [key: string]: string | number | boolean;
}

export interface TableOptions {
  maxWidth?: number;
  borderStyle?: 'single' | 'double' | 'rounded' | 'none';
  headerColor?: string;
  borderColor?: string;
  padding?: number;
}

/**
 * Parse markdown table to structured data
 */
export function parseMarkdownTable(markdown: string): {
  columns: TableColumn[];
  rows: TableRow[];
} {
  const lines = markdown.trim().split('\n').filter(l => l.trim());

  if (lines.length < 2) {
    return { columns: [], rows: [] };
  }

  // Parse header
  const headerLine = lines[0];
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0);

  // Parse alignment from separator line
  const separatorLine = lines[1];
  const alignments = separatorLine
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      if (s.startsWith(':') && s.endsWith(':')) return 'center';
      if (s.endsWith(':')) return 'right';
      return 'left';
    });

  const columns: TableColumn[] = headers.map((header, i) => ({
    header,
    align: alignments[i] || 'left',
  }));

  // Parse rows
  const rows: TableRow[] = [];
  for (let i = 2; i < lines.length; i++) {
    const cells = lines[i]
      .split('|')
      .map(c => c.trim())
      .filter(c => c.length > 0);

    if (cells.length === 0) continue;

    const row: TableRow = {};
    headers.forEach((header, j) => {
      row[header] = cells[j] || '';
    });

    rows.push(row);
  }

  return { columns, rows };
}

/**
 * Calculate column widths based on content
 */
export function calculateColumnWidths(
  columns: TableColumn[],
  rows: TableRow[],
  maxWidth?: number
): number[] {
  const widths = columns.map(col => {
    // Start with header width
    let width = visualLength(col.header);

    // Check all row values
    for (const row of rows) {
      const value = String(row[col.header] || '');
      width = Math.max(width, visualLength(value));
    }

    return width;
  });

  // Adjust if maxWidth is specified
  if (maxWidth) {
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    const borderWidth = (columns.length + 1) * 3; // For borders and padding
    const availableWidth = maxWidth - borderWidth;

    if (totalWidth > availableWidth) {
      // Scale down proportionally
      const scale = availableWidth / totalWidth;
      return widths.map(w => Math.max(5, Math.floor(w * scale)));
    }
  }

  return widths;
}

/**
 * Render table with blessed-style borders
 */
export function renderTable(
  columns: TableColumn[],
  rows: TableRow[],
  options: TableOptions = {}
): string {
  const {
    maxWidth,
    borderStyle = 'single',
    padding = 1,
  } = options;

  if (columns.length === 0) {
    return '';
  }

  const borders = getBorderChars(borderStyle);
  const widths = calculateColumnWidths(columns, rows, maxWidth);
  const lines: string[] = [];

  // Top border
  lines.push(createBorderLine(widths, borders.topLeft, borders.topMid, borders.topRight, borders.horizontal));

  // Header row
  const headerCells = columns.map((col, i) => {
    return pad(col.header, widths[i], col.align);
  });
  lines.push(
    borders.vertical +
    headerCells.map(cell => ' '.repeat(padding) + cell + ' '.repeat(padding)).join(borders.vertical) +
    borders.vertical
  );

  // Header separator
  lines.push(createBorderLine(widths, borders.leftMid, borders.midMid, borders.rightMid, borders.horizontal));

  // Data rows
  for (const row of rows) {
    const rowCells = columns.map((col, i) => {
      const value = String(row[col.header] || '');
      return pad(value, widths[i], col.align);
    });
    lines.push(
      borders.vertical +
      rowCells.map(cell => ' '.repeat(padding) + cell + ' '.repeat(padding)).join(borders.vertical) +
      borders.vertical
    );
  }

  // Bottom border
  lines.push(createBorderLine(widths, borders.bottomLeft, borders.bottomMid, borders.bottomRight, borders.horizontal));

  return lines.join('\n');
}

/**
 * Create a border line
 */
function createBorderLine(
  widths: number[],
  left: string,
  mid: string,
  right: string,
  horizontal: string
): string {
  const segments = widths.map(width => horizontal.repeat(width + 2)); // +2 for padding
  return left + segments.join(mid) + right;
}

/**
 * Get border characters for different styles
 */
function getBorderChars(style: 'single' | 'double' | 'rounded' | 'none') {
  switch (style) {
    case 'double':
      return {
        topLeft: '╔',
        topMid: '╦',
        topRight: '╗',
        bottomLeft: '╚',
        bottomMid: '╩',
        bottomRight: '╝',
        leftMid: '╠',
        midMid: '╬',
        rightMid: '╣',
        horizontal: '═',
        vertical: '║',
      };

    case 'rounded':
      return {
        topLeft: '╭',
        topMid: '┬',
        topRight: '╮',
        bottomLeft: '╰',
        bottomMid: '┴',
        bottomRight: '╯',
        leftMid: '├',
        midMid: '┼',
        rightMid: '┤',
        horizontal: '─',
        vertical: '│',
      };

    case 'none':
      return {
        topLeft: ' ',
        topMid: ' ',
        topRight: ' ',
        bottomLeft: ' ',
        bottomMid: ' ',
        bottomRight: ' ',
        leftMid: ' ',
        midMid: ' ',
        rightMid: ' ',
        horizontal: ' ',
        vertical: ' ',
      };

    case 'single':
    default:
      return {
        topLeft: '┌',
        topMid: '┬',
        topRight: '┐',
        bottomLeft: '└',
        bottomMid: '┴',
        bottomRight: '┘',
        leftMid: '├',
        midMid: '┼',
        rightMid: '┤',
        horizontal: '─',
        vertical: '│',
      };
  }
}

/**
 * Format table from markdown string
 */
export function formatMarkdownTable(
  markdown: string,
  options: TableOptions = {}
): string {
  const { columns, rows } = parseMarkdownTable(markdown);
  return renderTable(columns, rows, options);
}
