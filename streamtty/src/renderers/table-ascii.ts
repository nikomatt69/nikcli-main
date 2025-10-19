/**
 * Table rendering to ASCII art
 * Handles markdown table parsing and ASCII box generation
 * Inline rendering, no dependencies
 */

export interface TableRenderOptions {
  maxWidth?: number
  colWidths?: number[]
  align?: Array<'left' | 'center' | 'right'>
  borderStyle?: 'simple' | 'rounded' | 'double'
  stripMarkdown?: boolean
  colors?: boolean
}

/**
 * Simple table representation
 */
interface ParsedTable {
  headers: string[]
  rows: string[][]
  align: Array<'left' | 'center' | 'right'>
}

/**
 * Parse markdown table format
 * | Header 1 | Header 2 |
 * |----------|----------|
 * | Cell 1   | Cell 2   |
 */
function parseMarkdownTable(content: string): ParsedTable | null {
  const lines = content
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && l.startsWith('|'))

  if (lines.length < 2) {
    return null
  }

  // Parse header
  const headerLine = lines[0]
  const headers = headerLine
    .split('|')
    .map(h => h.trim())
    .filter(h => h.length > 0)

  // Parse alignment from separator line
  const separatorLine = lines[1]
  const separators = separatorLine
    .split('|')
    .map(s => s.trim())
    .filter(s => s.length > 0)

  const align: Array<'left' | 'center' | 'right'> = separators.map(sep => {
    if (sep.startsWith(':') && sep.endsWith(':')) return 'center'
    if (sep.endsWith(':')) return 'right'
    if (sep.startsWith(':')) return 'left'
    return 'left'
  })

  // Parse rows
  const rows = lines.slice(2).map(line =>
    line
      .split('|')
      .map(cell => cell.trim())
      .filter(cell => cell.length > 0)
  )

  return { headers, rows, align }
}

/**
 * Calculate optimal column widths
 */
function calculateColumnWidths(
  headers: string[],
  rows: string[][],
  options: TableRenderOptions = {}
): number[] {
  const minWidth = 3
  const maxWidth = options.maxWidth || 30
  const colCount = headers.length

  // Start with header widths
  let widths = headers.map(h => Math.min(h.length + 2, maxWidth))

  // Check row widths
  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const cell = row[i] || ''
      const cellWidth = Math.min(cell.length + 2, maxWidth)
      widths[i] = Math.max(widths[i], cellWidth)
    }
  }

  // Enforce minimums
  widths = widths.map(w => Math.max(w, minWidth))

  return widths
}

/**
 * Wrap text to fit column width
 */
function wrapCell(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text]
  }

  const lines: string[] = []
  let current = text

  while (current.length > 0) {
    lines.push(current.substring(0, width))
    current = current.substring(width)
  }

  return lines
}

/**
 * Align text within column
 */
function alignText(text: string, width: number, align: 'left' | 'center' | 'right'): string {
  const padding = width - text.length

  if (padding <= 0) {
    return text.substring(0, width)
  }

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text
    case 'center':
      return ' '.repeat(Math.floor(padding / 2)) + text + ' '.repeat(Math.ceil(padding / 2))
    case 'left':
    default:
      return text + ' '.repeat(padding)
  }
}

/**
 * Get border characters for style
 */
function getBorderChars(style: 'simple' | 'rounded' | 'double' = 'simple') {
  const chars = {
    simple: {
      topLeft: '┌', topRight: '┐', bottomLeft: '└', bottomRight: '┘',
      horizontal: '─', vertical: '│',
      topTee: '┬', bottomTee: '┴', leftTee: '├', rightTee: '┤',
      cross: '┼',
    },
    rounded: {
      topLeft: '╭', topRight: '╮', bottomLeft: '╰', bottomRight: '╯',
      horizontal: '─', vertical: '│',
      topTee: '┬', bottomTee: '┴', leftTee: '├', rightTee: '┤',
      cross: '┼',
    },
    double: {
      topLeft: '╔', topRight: '╗', bottomLeft: '╚', bottomRight: '╝',
      horizontal: '═', vertical: '║',
      topTee: '╦', bottomTee: '╩', leftTee: '╠', rightTee: '╣',
      cross: '╬',
    },
  }

  return chars[style]
}

/**
 * Render table to ASCII art
 */
export function renderTableToASCII(
  headers: string[],
  rows: string[][],
  options: TableRenderOptions = {}
): string {
  if (!headers || headers.length === 0) {
    return '[Empty table]'
  }

  const widths = calculateColumnWidths(headers, rows, options)
  const border = getBorderChars(options.borderStyle || 'simple')
  const align = options.align || headers.map(() => 'left' as const)

  let output = ''

  // Top border
  output += border.topLeft
  for (let i = 0; i < headers.length; i++) {
    output += border.horizontal.repeat(widths[i])
    output += i < headers.length - 1 ? border.topTee : border.topRight
  }
  output += '\n'

  // Header row
  output += border.vertical
  for (let i = 0; i < headers.length; i++) {
    const aligned = alignText(headers[i], widths[i], align[i] || 'left')
    output += aligned
    output += border.vertical
  }
  output += '\n'

  // Header separator
  output += border.leftTee
  for (let i = 0; i < headers.length; i++) {
    output += border.horizontal.repeat(widths[i])
    output += i < headers.length - 1 ? border.cross : border.rightTee
  }
  output += '\n'

  // Data rows
  for (const row of rows) {
    output += border.vertical
    for (let i = 0; i < headers.length; i++) {
      const cell = row[i] || ''
      const aligned = alignText(cell, widths[i], align[i] || 'left')
      output += aligned
      output += border.vertical
    }
    output += '\n'
  }

  // Bottom border
  output += border.bottomLeft
  for (let i = 0; i < headers.length; i++) {
    output += border.horizontal.repeat(widths[i])
    output += i < headers.length - 1 ? border.bottomTee : border.bottomRight
  }
  output += '\n'

  return output
}

/**
 * Parse and render markdown table in one go
 */
export function renderMarkdownTableToASCII(
  content: string,
  options: TableRenderOptions = {}
): string {
  const parsed = parseMarkdownTable(content)

  if (!parsed) {
    return '[Invalid table format]'
  }

  // Align from separator if not provided
  const finalAlign = options.align || parsed.align

  return renderTableToASCII(parsed.headers, parsed.rows, {
    ...options,
    align: finalAlign,
  })
}

/**
 * Check if content looks like a markdown table
 */
export function isMarkdownTable(content: string): boolean {
  const lines = content.split('\n').filter(l => l.trim().length > 0)
  
  if (lines.length < 2) {
    return false
  }

  // First line has pipes
  if (!lines[0].includes('|')) {
    return false
  }

  // Second line is separator
  const secondLine = lines[1].trim()
  return /^\|?[\s\-:|]+\|?$/.test(secondLine)
}

/**
 * Extract table from markdown content
 */
export function extractTable(content: string): string | null {
  const lines = content.split('\n')
  let tableStart = -1
  let tableEnd = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('|') && tableStart === -1) {
      tableStart = i
    }

    if (tableStart !== -1 && line.length > 0 && !line.startsWith('|')) {
      tableEnd = i
      break
    }

    if (tableStart !== -1 && i === lines.length - 1) {
      tableEnd = i + 1
    }
  }

  if (tableStart !== -1 && tableEnd !== -1) {
    return lines.slice(tableStart, tableEnd).join('\n')
  }

  return null
}
