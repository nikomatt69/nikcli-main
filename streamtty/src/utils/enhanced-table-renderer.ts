import Table from 'tty-table';
import * as asciichart from 'asciichart';

export interface TableData {
  headers: string[];
  rows: string[][];
  align?: ('left' | 'center' | 'right')[];
}

export interface ChartData {
  values: number[];
  labels?: string[];
  config?: {
    height?: number;
    width?: number;
    colors?: string[];
    format?: (x: number, i: number) => string;
  };
}

/**
 * Enhanced table and chart renderer using tty-table and asciichart
 */
export class EnhancedTableRenderer {
  /**
   * Render a table using tty-table
   */
  static renderTable(data: TableData, options: {
    borderStyle?: 'solid' | 'dashed' | 'none';
    headerAlign?: 'left' | 'center' | 'right';
    compact?: boolean;
    width?: number;
  } = {}): string {
    try {
      // Calculate optimal column widths
      const colWidths = data.headers.map((title, index) => {
        const maxDataWidth = Math.max(...data.rows.map(row => (row[index] || '').length));
        return Math.max(title.length, maxDataWidth, 12); // Better minimum width
      });

      // Prepare header configuration
      const header = data.headers.map((title, index) => ({
        value: title,
        headerAlign: options.headerAlign || 'left',
        align: data.align?.[index] || 'left',
        width: colWidths[index],
      }));

      // Prepare rows
      const rows = data.rows.map(row =>
        row.map((cell, index) => ({
          value: cell,
          align: data.align?.[index] || 'left'
        }))
      );

      // Table options
      const tableOptions = {
        borderStyle: options.borderStyle || 'solid',
        headerAlign: options.headerAlign || 'left',
        align: 'left',
        color: 'white',
        compact: false, // Disable compact mode for better readability
        width: options.width || process.stdout.columns || 100
      };

      // Create and render table
      const table = Table(header as any, rows as any, tableOptions as any);
      const rendered = table.render();

      // Convert to rounded corners
      return this.convertToRoundedCorners(rendered);

    } catch (error) {
      console.warn('tty-table rendering failed:', error);
      return this.renderFallbackTable(data);
    }
  }

  /**
   * Render a line chart using asciichart
   */
  static renderChart(data: ChartData): string {
    try {
      const config = {
        height: data.config?.height || 10,
        width: data.config?.width || 80,
        colors: data.config?.colors || ['blue'],
        format: data.config?.format || ((x: number) => x.toFixed(2))
      };

      let chart = asciichart.plot(data.values, config);

      // Add labels if provided
      if (data.labels && data.labels.length > 0) {
        const labelLine = data.labels.join(' | ');
        chart += '\n' + labelLine;
      }

      return chart;

    } catch (error) {
      console.warn('asciichart rendering failed:', error);
      return this.renderFallbackChart(data);
    }
  }

  /**
   * Render multiple data series as a chart
   */
  static renderMultiChart(datasets: { label: string; values: number[]; color?: string }[]): string {
    try {
      const colors = [
        'blue',
        'green',
        'red',
        'yellow',
        'magenta',
        'cyan'
      ];

      const series = datasets.map(dataset => dataset.values);
      const seriesColors = datasets.map((dataset, index) =>
        dataset.color || colors[index % colors.length]
      );

      const config = {
        height: 12,
        colors: seriesColors,
        format: (x: number) => x.toFixed(1)
      };

      let chart = asciichart.plot(series, config);

      // Add legend
      const legend = datasets.map((dataset, index) =>
        `${index + 1}: ${dataset.label}`
      ).join(' | ');

      chart += '\nLegend: ' + legend;

      return chart;

    } catch (error) {
      console.warn('Multi-chart rendering failed:', error);
      return '[Chart rendering failed]';
    }
  }

  /**
   * Auto-detect if data looks like chart data
   */
  static isChartData(content: string): boolean {
    // Simple heuristics to detect chart data
    const lines = content.trim().split('\n');

    // Check if it looks like CSV with numbers
    if (lines.length > 1) {
      const firstDataLine = lines[1]?.split(/[,\t\|]/);
      const hasNumbers = firstDataLine?.some(cell =>
        !isNaN(parseFloat(cell.trim())) && isFinite(parseFloat(cell.trim()))
      );
      return !!hasNumbers;
    }

    return false;
  }

  /**
   * Auto-detect if content is table data
   */
  static isTableData(content: string): boolean {
    const lines = content.trim().split('\n');

    // Check for markdown table syntax
    if (lines.some(line => line.includes('|'))) {
      return true;
    }

    // Check for CSV-like structure
    if (lines.length > 1) {
      const separators = [',', '\t', ';'];
      return separators.some(sep => {
        const firstLineCols = lines[0]?.split(sep).length || 0;
        const secondLineCols = lines[1]?.split(sep).length || 0;
        return firstLineCols > 1 && firstLineCols === secondLineCols;
      });
    }

    return false;
  }

  /**
   * Parse markdown table to TableData
   */
  static parseMarkdownTable(markdown: string): TableData | null {
    const lines = markdown.trim().split('\n').filter(line => line.trim());

    if (lines.length < 3) return null; // Need header, separator, and at least one data row

    // Parse header - handle both | table | and table | formats
    const headerLine = lines[0];
    let headers = headerLine.split('|').map(cell => cell.trim());

    // Remove empty first/last cells if they exist (from | table | format)
    if (headers.length > 0 && headers[0] === '') {
      headers = headers.slice(1);
    }
    if (headers.length > 0 && headers[headers.length - 1] === '') {
      headers = headers.slice(0, -1);
    }

    // Clean header text from markdown formatting
    headers = headers.map(header => {
      return header
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
        .replace(/\*(.*?)\*/g, '$1')      // Remove italic
        .replace(/`(.*?)`/g, '$1')        // Remove code
        .trim();
    });

    if (headers.length === 0) return null;

    // Skip separator line (line 1 contains --- | --- | ---)
    const dataLines = lines.slice(2);

    // Parse data rows
    const rows: string[][] = [];
    for (const line of dataLines) {
      let cells = line.split('|').map(cell => cell.trim());

      // Remove empty first/last cells if they exist
      if (cells.length > 0 && cells[0] === '') {
        cells = cells.slice(1);
      }
      if (cells.length > 0 && cells[cells.length - 1] === '') {
        cells = cells.slice(0, -1);
      }

      // Clean cell content from markdown formatting
      cells = cells.map(cell => {
        return cell
          .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold
          .replace(/\*(.*?)\*/g, '$1')      // Remove italic
          .replace(/`(.*?)`/g, '$1')        // Remove code
          .replace(/~~(.*?)~~/g, '$1')      // Remove strikethrough
          .trim();
      });

      // Only add rows that match the header count
      if (cells.length === headers.length) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return null;

    return { headers, rows };
  }

  /**
   * Parse CSV data to chart data
   */
  static parseCSVToChart(csv: string): ChartData | null {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return null;

    try {
      const dataLines = lines.slice(1);

      // Find first numeric column
      let valueColumnIndex = -1;
      let labelColumnIndex = -1;

      const firstDataRow = dataLines[0]?.split(/[,\t]/).map(c => c.trim());
      if (!firstDataRow) return null;

      // Find label column (first non-numeric) and value column (first numeric)
      for (let i = 0; i < firstDataRow.length; i++) {
        const cell = firstDataRow[i];
        const isNumeric = !isNaN(parseFloat(cell)) && isFinite(parseFloat(cell));

        if (!isNumeric && labelColumnIndex === -1) {
          labelColumnIndex = i;
        }
        if (isNumeric && valueColumnIndex === -1) {
          valueColumnIndex = i;
        }
      }

      if (valueColumnIndex === -1) return null;

      const values: number[] = [];
      const labels: string[] = [];

      for (const line of dataLines) {
        const cells = line.split(/[,\t]/).map(c => c.trim());
        if (cells.length > valueColumnIndex) {
          const value = parseFloat(cells[valueColumnIndex]);
          if (!isNaN(value) && isFinite(value)) {
            values.push(value);
            if (labelColumnIndex >= 0 && cells[labelColumnIndex]) {
              labels.push(cells[labelColumnIndex]);
            }
          }
        }
      }

      return values.length > 0 ? { values, labels: labels.length > 0 ? labels : undefined } : null;

    } catch (error) {
      return null;
    }
  }

  /**
   * Convert table corners to rounded Unicode characters
   */
  private static convertToRoundedCorners(table: string): string {
    return table
      .replace(/┌/g, '╭')  // Top-left corner
      .replace(/┐/g, '╮')  // Top-right corner
      .replace(/└/g, '╰')  // Bottom-left corner
      .replace(/┘/g, '╯')  // Bottom-right corner
      .replace(/├/g, '├')  // Left T-junction (keep)
      .replace(/┤/g, '┤')  // Right T-junction (keep)
      .replace(/┬/g, '┬')  // Top T-junction (keep)
      .replace(/┴/g, '┴')  // Bottom T-junction (keep)
      .replace(/┼/g, '┼'); // Cross junction (keep)
  }

  /**
   * Fallback table renderer
   */
  private static renderFallbackTable(data: TableData): string {
    const lines: string[] = [];

    // Calculate column widths
    const colWidths = data.headers.map((header, index) => {
      const maxDataWidth = Math.max(...data.rows.map(row => (row[index] || '').length));
      return Math.max(header.length, maxDataWidth, 5);
    });

    const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) + (colWidths.length - 1) * 3 + 4;

    // Top border with rounded corners
    const topBorder = '╭' + '─'.repeat(totalWidth - 2) + '╮';
    lines.push(topBorder);

    // Header row
    const headerCells = data.headers.map((header, index) =>
      header.padEnd(colWidths[index])
    );
    const headerLine = '│ ' + headerCells.join(' │ ') + ' │';
    lines.push(headerLine);

    // Header separator
    const separatorCells = colWidths.map(width => '─'.repeat(width));
    const separatorLine = '├─' + separatorCells.join('─┼─') + '─┤';
    lines.push(separatorLine);

    // Data rows
    for (const row of data.rows) {
      const rowCells = row.map((cell, index) =>
        (cell || '').padEnd(colWidths[index])
      );
      const rowLine = '│ ' + rowCells.join(' │ ') + ' │';
      lines.push(rowLine);
    }

    // Bottom border with rounded corners
    const bottomBorder = '╰' + '─'.repeat(totalWidth - 2) + '╯';
    lines.push(bottomBorder);

    return lines.join('\n');
  }

  /**
   * Fallback chart renderer
   */
  private static renderFallbackChart(data: ChartData): string {
    const maxValue = Math.max(...data.values);
    const minValue = Math.min(...data.values);
    const range = maxValue - minValue;

    const height = 8;
    const lines: string[] = [];

    for (let i = height - 1; i >= 0; i--) {
      const threshold = minValue + (range * i / (height - 1));
      let line = '';

      for (const value of data.values) {
        line += value >= threshold ? '█' : ' ';
      }

      lines.push(`${threshold.toFixed(1).padStart(6)} │${line}`);
    }

    // Add labels if available
    if (data.labels) {
      const labelLine = '      │' + data.labels.map(label => label.slice(0, 1)).join('');
      lines.push(labelLine);
    }

    return lines.join('\n');
  }
}

/**
 * Convenience functions
 */
export function renderTable(data: TableData, options?: any): string {
  return EnhancedTableRenderer.renderTable(data, options);
}

export function renderChart(data: ChartData): string {
  return EnhancedTableRenderer.renderChart(data);
}

export function parseMarkdownTable(markdown: string): TableData | null {
  return EnhancedTableRenderer.parseMarkdownTable(markdown);
}

export function parseCSVToChart(csv: string): ChartData | null {
  return EnhancedTableRenderer.parseCSVToChart(csv);
}