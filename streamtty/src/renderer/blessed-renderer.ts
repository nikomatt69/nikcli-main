import blessed, { Widgets } from 'blessed';
import { ParsedToken, RenderContext, BlessedStyle, MarkdownStyles } from '../types';
import { renderMermaidDiagram } from '../renderers/mermaid-renderer';
import { EnhancedTableRenderer, parseMarkdownTable, parseCSVToChart } from '../utils/enhanced-table-renderer';

export class BlessedRenderer {
  private context: RenderContext;
  private defaultStyles: MarkdownStyles;

  constructor(context: RenderContext) {
    this.context = context;
    this.defaultStyles = this.getDefaultStyles();
  }

  /**
   * Render tokens to blessed components
   */
  public async render(tokens: ParsedToken[]): Promise<void> {
    // Clear existing content
    this.context.container.children.forEach(child => child.destroy());

    let yOffset = 0;
    let currentLineTokens: ParsedToken[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      // If it's an inline token, add to current line
      if (['strong', 'em', 'code', 'link', 'del', 'text'].includes(token.type)) {
        currentLineTokens.push(token);
      } else {
        // Render current line if we have content
        if (currentLineTokens.length > 0) {
          this.renderInlineLine(currentLineTokens, yOffset);
          yOffset += 1;
          currentLineTokens = [];
        }

        // Render the block token
        const element = await this.renderToken(token, yOffset);
        if (element) {
          yOffset += this.getTokenHeight(token);
        }
      }
    }

    // Render any remaining inline content
    if (currentLineTokens.length > 0) {
      this.renderInlineLine(currentLineTokens, yOffset);
    }

    // Auto-scroll if enabled
    if (this.context.options.autoScroll) {
      this.context.container.setScrollPerc(100);
    }

    this.context.screen.render();
  }

  /**
   * Render a line of inline tokens
   */
  private renderInlineLine(tokens: ParsedToken[], yOffset: number): void {
    let content = '';

    for (const token of tokens) {
      switch (token.type) {
        case 'strong':
          content += `{bold}${token.content}{/bold}`;
          break;
        case 'em':
          content += `{italic}${token.content}{/italic}`;
          break;
        case 'code':
          content += `{cyan-fg}${token.content}{/cyan-fg}`;
          break;
        case 'link':
          content += `{blue-fg}{underline}${token.content}{/underline}{/blue-fg}`;
          break;
        case 'del':
          // Blessed doesn't support strikethrough, use a visual alternative
          content += `{gray-fg}~~${token.content}~~{/gray-fg}`;
          break;
        default:
          content += token.content;
      }
    }

    blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: this.defaultStyles.paragraph,
      wrap: true,
    });
  }

  /**
   * Render a single token
   */
  private async renderToken(token: ParsedToken, yOffset: number): Promise<Widgets.BoxElement | null> {
    switch (token.type) {
      case 'heading':
        return this.renderHeading(token, yOffset);

      case 'paragraph':
      case 'text':
        return this.renderText(token, yOffset);

      case 'strong':
        return this.renderStrong(token, yOffset);

      case 'em':
        return this.renderEm(token, yOffset);

      case 'code':
        return this.renderInlineCode(token, yOffset);

      case 'link':
        return this.renderLink(token, yOffset);

      case 'del':
        return this.renderDel(token, yOffset);

      case 'codeblock':
        return this.renderCodeBlock(token, yOffset);

      case 'blockquote':
        return this.renderBlockquote(token, yOffset);

      case 'listitem':
        return this.renderListItem(token, yOffset);

      case 'hr':
        return this.renderHorizontalRule(token, yOffset);

      case 'table':
        return this.renderTable(token, yOffset);

      case 'mermaid':
        return await this.renderMermaid(token, yOffset);

      default:
        return this.renderText(token, yOffset);
    }
  }

  /**
   * Render heading
   */
  private renderHeading(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const depth = token.depth || 1;
    const style = this.getHeadingStyle(depth);

    const prefix = token.incomplete ? '# ' : '';
    const content = prefix + token.content;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
    });
  }

  /**
   * Render text/paragraph
   */
  private renderText(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.paragraph;
    let content = this.formatInlineStyles(token.content);

    if (token.incomplete) {
      content += '{yellow-fg}...{/yellow-fg}';
    }

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render strong/bold text
   */
  private renderStrong(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.strong;
    const content = `{bold}${token.content}{/bold}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render emphasis/italic text
   */
  private renderEm(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.em;
    const content = `{italic}${token.content}{/italic}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render inline code
   */
  private renderInlineCode(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.code;
    const content = `{cyan-fg}{bold}${token.content}{/bold}{/cyan-fg}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render link
   */
  private renderLink(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.link;
    const content = `{blue-fg}{underline}${token.content}{/underline}{/blue-fg}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render strikethrough text
   */
  private renderDel(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.paragraph;
    // Blessed doesn't support strikethrough, use visual alternative
    const content = `{gray-fg}~~${token.content}~~{/gray-fg}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render code block
   */
  private renderCodeBlock(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.codeBlock;
    const lang = token.lang || 'text';

    let content = token.content;
    if (token.incomplete) {
      content = `{yellow-fg}[Code block (${lang})...]{/yellow-fg}`;
    }

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content: this.highlightCode(content, lang),
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: style.fg || 'blue',
        },
        ...style,
      },
      padding: {
        left: 1,
        right: 1,
      },
    });
  }

  /**
   * Render blockquote
   */
  private renderBlockquote(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.blockquote;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content: this.formatInlineStyles(token.content),
      tags: true,
      border: {
        type: 'line',

      },
      style: {
        border: {
          fg: style.fg || 'gray',
          left: false,
          right: false,
          top: false,
          bottom: false,
        },
        ...style,
      },
      padding: {
        left: 1,
      },
    });
  }

  /**
   * Render list item
   */
  private renderListItem(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const style = this.defaultStyles.listItem;

    // Detect task list items
    let bullet = token.ordered ? '1.' : '•';
    let content = token.content;

    // Handle task list formatting: - [ ] or - [x]
    const taskMatch = content.match(/^(\[ \]|\[x\]|\[X\])\s*(.*)/);
    if (taskMatch) {
      const isCompleted = taskMatch[1] !== '[ ]';
      bullet = isCompleted ? '✅' : '☐';
      content = taskMatch[2];
    }

    const formattedContent = `${bullet} ${this.formatInlineStyles(content)}`;

    // Calculate proper height for wrapping
    const maxWidth = this.context.options.maxWidth || 120;
    const lineWidth = maxWidth - 6; // Account for indentation and padding
    const estimatedLines = Math.ceil(formattedContent.length / lineWidth);
    const height = Math.max(estimatedLines, 1);

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height,
      content: formattedContent,
      tags: true,
      style: style,
      wrap: true,
    });
  }

  /**
   * Render horizontal rule
   */
  private renderHorizontalRule(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 1,
      content: '─'.repeat(80),
      style: {
        fg: 'gray',
      },
    });
  }

  /**
   * Render table using enhanced table renderer
   */
  private renderTable(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    let content: string;

    try {
      // Try to parse as markdown table first
      const tableData = parseMarkdownTable(token.content);

      if (tableData && tableData.headers.length > 0) {
        content = EnhancedTableRenderer.renderTable(tableData, {
          borderStyle: 'solid',
          compact: false,
          width: this.context.options.maxWidth || 80
        });
      } else if (EnhancedTableRenderer.isChartData(token.content)) {
        // If it looks like chart data, render as chart
        const chartData = parseCSVToChart(token.content);
        if (chartData) {
          content = EnhancedTableRenderer.renderChart(chartData);
        } else {
          content = '[Chart Data]\n' + token.content;
        }
      } else {
        // Fallback: render the raw content
        content = token.content;
      }
    } catch (error) {
      console.warn('Table render error:', error);
      content = '[Table Render Error]\n' + token.content;
    }

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: false, // Disable tags for table content to preserve formatting
      border: {
        type: 'line'
      },
      style: {
        fg: 'cyan',
        bg: 'black',
        border: {
          fg: 'cyan'
        }
      },
      padding: {
        top: 1,
        bottom: 1,
        left: 2,
        right: 2
      }
    });
  }

  /**
   * Format inline styles (bold, italic, code, links)
   * This is now used only for text that hasn't been parsed as inline tokens
   */
  private formatInlineStyles(text: string): string {
    let formatted = text;

    // Only apply formatting if the text contains markdown syntax that wasn't parsed
    // This is a fallback for cases where marked.js didn't parse inline elements
    if (/\*\*.*\*\*|__.*__|\*.*\*|_.*_|`.*`|\[.*\]\(.*\)|~~.*~~/.test(text)) {
      // Bold: **text** or __text__
      formatted = formatted.replace(/\*\*(.+?)\*\*/g, '{bold}$1{/bold}');
      formatted = formatted.replace(/__(.+?)__/g, '{bold}$1{/bold}');

      // Italic: *text* or _text_
      formatted = formatted.replace(/\*(.+?)\*/g, '{italic}$1{/italic}');
      formatted = formatted.replace(/_(.+?)_/g, '{italic}$1{/italic}');

      // Inline code: `code`
      formatted = formatted.replace(/`(.+?)`/g, '{cyan-fg}{bold}$1{/bold}{/cyan-fg}');

      // Links: [text](url)
      formatted = formatted.replace(/\[(.+?)\]\((.+?)\)/g, '{blue-fg}{underline}$1{/underline}{/blue-fg}');

      // Strikethrough: ~~text~~ (blessed doesn't support strike, use gray)
      formatted = formatted.replace(/~~(.+?)~~/g, '{gray-fg}~~$1~~{/gray-fg}');
    }

    return formatted;
  }

  /**
   * Highlight code (basic implementation)
   */
  private highlightCode(code: string, lang: string): string {
    // Basic syntax highlighting - in production you'd use a proper highlighter
    if (!this.context.options.syntaxHighlight) {
      return code;
    }

    // Simple keyword highlighting
    const keywords = ['function', 'const', 'let', 'var', 'if', 'else', 'return', 'for', 'while', 'class', 'import', 'export'];
    let highlighted = code;

    for (const keyword of keywords) {
      const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
      highlighted = highlighted.replace(regex, '{magenta-fg}$1{/magenta-fg}');
    }

    // Strings
    highlighted = highlighted.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, '{green-fg}$&{/green-fg}');

    // Comments
    highlighted = highlighted.replace(/(\/\/.*)$/gm, '{gray-fg}$1{/gray-fg}');
    highlighted = highlighted.replace(/(\/\*[\s\S]*?\*\/)/g, '{gray-fg}$1{/gray-fg}');

    return highlighted;
  }

  /**
   * Get heading style based on depth
   */
  private getHeadingStyle(depth: number): BlessedStyle {
    const styles = [
      this.defaultStyles.h1,
      this.defaultStyles.h2,
      this.defaultStyles.h3,
      this.defaultStyles.h4,
      this.defaultStyles.h5,
      this.defaultStyles.h6,
    ];

    return styles[depth - 1] || styles[0];
  }

  /**
   * Get token height for layout calculation
   */
  private getTokenHeight(token: ParsedToken): number {
    const maxWidth = this.context.options.maxWidth || 120;

    switch (token.type) {
      case 'heading':
        return 2; // Heading + spacing

      case 'codeblock':
        const codeLines = token.content.split('\n').length;
        return codeLines + 4; // Content + border + padding

      case 'hr':
        return 2; // Line + spacing

      case 'table':
        // Better table height calculation
        const lines = token.content.split('\n').filter(line => line.trim());
        return Math.max(lines.length + 4, 6); // Table rows + borders + padding

      case 'mermaid':
        // Estimate mermaid diagram height
        const diagramLines = token.content.split('\n').length;
        return Math.max(diagramLines + 6, 10); // Diagram + border + padding

      case 'blockquote':
        const quoteLines = Math.ceil(token.content.length / (maxWidth - 6));
        return quoteLines + 2; // Content + border

      case 'listitem':
        const itemLines = Math.ceil(token.content.length / (maxWidth - 4));
        return Math.max(itemLines, 1);

      case 'strong':
      case 'em':
      case 'code':
      case 'link':
      case 'del':
        // Inline tokens should be rendered on the same line
        return 0;

      case 'paragraph':
      case 'text':
      default:
        // Better text wrapping calculation
        if (!token.content) return 1;
        const textLines = Math.ceil(token.content.length / maxWidth);
        return Math.max(textLines, 1);
    }
  }

  /**
   * Get default styles
   */
  private getDefaultStyles(): MarkdownStyles {
    return {
      h1: { fg: 'cyan', bold: true },
      h2: { fg: 'blue', bold: true },
      h3: { fg: 'green', bold: true },
      h4: { fg: 'yellow', bold: true },
      h5: { fg: 'magenta', bold: true },
      h6: { fg: 'white', bold: true },
      paragraph: { fg: 'white' },
      strong: { bold: true },
      em: { italic: true },
      code: { fg: 'cyan', bold: true },
      codeBlock: { fg: 'white', bg: 'black' },
      blockquote: { fg: 'gray', italic: true },
      link: { fg: 'blue', underline: true },
      list: { fg: 'white' },
      listItem: { fg: 'white' },
      table: { fg: 'cyan' },
      tableHeader: { fg: 'cyan', bold: true },
      hr: { fg: 'gray' },
    };
  }

  /**
   * Render mermaid diagram
   */
  private async renderMermaid(token: ParsedToken, yOffset: number): Promise<Widgets.BoxElement> {
    let content: string;

    try {
      // Use mermaid-ascii to convert to ASCII art
      const asciiDiagram = await renderMermaidDiagram(token.content);
      content = asciiDiagram;
    } catch (error) {
      // Fallback if mermaid rendering fails
      content = `[Mermaid Diagram]\n${token.content}`;
    }

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content,
      tags: false, // Disable tags for ASCII art to preserve formatting
      border: {
        type: 'line'
      },
      style: {
        fg: 'cyan',
        bg: 'black',
        border: {
          fg: 'blue'
        }
      },
      padding: {
        top: 1,
        bottom: 1,
        left: 2,
        right: 2
      }
    });
  }
}
