import blessed, { Widgets } from 'blessed';
import { ParsedToken, RenderContext, BlessedStyle, MarkdownStyles } from '../types';
import { mathRenderer } from '../renderers/math-renderer';
import { mermaidRenderer } from '../renderers/mermaid-renderer';
import { shikiRenderer } from '../renderers/shiki-ansi';
import { tableRenderer } from '../renderers/table-renderer';

export class BlessedRenderer {
  private context: RenderContext;
  private defaultStyles: MarkdownStyles;
  private shikiInitialized: boolean = false;

  constructor(context: RenderContext) {
    this.context = context;
    this.defaultStyles = this.getDefaultStyles();
    this.initializeEnhancedFeatures();
  }

  /**
   * Initialize enhanced features if enabled
   */
  private async initializeEnhancedFeatures(): Promise<void> {
    const options = this.context.options;

    // Initialize Shiki if enabled
    if (options.enhancedFeatures?.shiki && options.shikiLanguages) {
      try {
        await shikiRenderer.initialize(
          options.shikiLanguages as any,
          options.theme as any
        );
        this.shikiInitialized = true;
      } catch (error) {
        console.warn('Failed to initialize Shiki:', error);
      }
    }
  }

  /**
   * Render tokens to blessed components
   */
  public render(tokens: ParsedToken[]): void {
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
        const element = this.renderToken(token, yOffset);
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
          content += `{cyan-fg}{bold}${token.content}{/bold}{/cyan-fg}`;
          break;
        case 'link':
          content += `{blue-fg}{underline}${token.content}{/underline}{/blue-fg}`;
          break;
        case 'del':
          content += `{strike}${token.content}{/strike}`;
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
  private renderToken(token: ParsedToken, yOffset: number): Widgets.BoxElement | null {
    // Check for custom component overrides
    const customComponent = this.context.options.components?.[token.type as keyof typeof this.context.options.components];
    if (customComponent) {
      return customComponent(token, yOffset);
    }

    switch (token.type) {
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

      // Enhanced token types
      case 'math-inline':
        return this.renderMathInline(token, yOffset);

      case 'math-block':
        return this.renderMathBlock(token, yOffset);

      case 'mermaid':
        return this.renderMermaid(token, yOffset);

      default:
        return this.renderText(token, yOffset);
    }
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
    const content = `{strike}${token.content}{/strike}`;

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

    // Check for special language types
    if (lang === 'mermaid' && this.context.options.enhancedFeatures?.mermaid) {
      return this.renderMermaid(token, yOffset);
    }
    if (lang === 'math-block' && this.context.options.enhancedFeatures?.math) {
      return this.renderMathBlock(token, yOffset);
    }

    let content = token.content;
    if (token.incomplete) {
      content = `{yellow-fg}[Code block (${lang})...]{/yellow-fg}`;
    }

    const box = blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content: '',
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

    // Highlight asynchronously
    this.highlightCode(content, lang).then(highlighted => {
      box.setContent(highlighted);
      this.context.screen.render();
    });

    return box;
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
    const bullet = token.ordered ? '1.' : '•';
    const content = `${bullet} ${this.formatInlineStyles(token.content)}`;

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content,
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
   * Render table (with advanced support)
   */
  private renderTable(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    // Use advanced table renderer if enabled
    if (this.context.options.enhancedFeatures?.advancedTables) {
      const interactive = typeof this.context.options.controls === 'object'
        ? this.context.options.controls.table ?? false
        : false;

      return tableRenderer.render(token, yOffset, this.context.container, interactive);
    }

    // Fallback to simple table rendering
    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content: '{cyan-fg}[Table]{/cyan-fg}',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
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

      // Strikethrough: ~~text~~
      formatted = formatted.replace(/~~(.+?)~~/g, '{strike}$1{/strike}');
    }

    return formatted;
  }

  /**
   * Highlight code (with Shiki support)
   */
  private async highlightCode(code: string, lang: string): Promise<string> {
    if (!this.context.options.syntaxHighlight) {
      return code;
    }

    // Use Shiki if available and enabled
    if (this.shikiInitialized && this.context.options.enhancedFeatures?.shiki) {
      try {
        return await shikiRenderer.highlight(code, lang);
      } catch (error) {
        console.warn('Shiki highlighting failed, using fallback:', error);
      }
    }

    // Fallback to basic highlighting
    return this.highlightCodeFallback(code);
  }

  /**
   * Fallback code highlighting
   */
  private highlightCodeFallback(code: string): string {
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
   * Render inline math
   */
  private renderMathInline(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const rendered = mathRenderer.renderInline(token.content);

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 0,
      width: '100%',
      height: 'shrink',
      content: `{cyan-fg}${rendered}{/cyan-fg}`,
      tags: true,
      wrap: true,
    });
  }

  /**
   * Render block math
   */
  private renderMathBlock(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const rendered = mathRenderer.renderBlock(token.content);

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content: `{cyan-fg}${rendered}{/cyan-fg}`,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'cyan',
        },
      },
      padding: {
        left: 1,
        right: 1,
      },
    });
  }

  /**
   * Render Mermaid diagram
   */
  private renderMermaid(token: ParsedToken, yOffset: number): Widgets.BoxElement {
    const rendered = mermaidRenderer.render(token.content);

    return blessed.box({
      parent: this.context.container,
      top: yOffset,
      left: 2,
      width: '100%-4',
      height: 'shrink',
      content: `{magenta-fg}${rendered}{/magenta-fg}`,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        border: {
          fg: 'magenta',
        },
      },
      padding: {
        left: 1,
        right: 1,
      },
      scrollable: true,
      keys: true,
      vi: true,
    });
  }

  /**
   * Get token height for layout calculation
   */
  private getTokenHeight(token: ParsedToken): number {
    switch (token.type) {
      case 'heading':
        return 2;
      case 'codeblock':
        return token.content.split('\n').length + 4;
      case 'hr':
        return 2;
      case 'table':
        return 5;
      case 'math-block':
        return token.content.split('\n').length + 6;
      case 'mermaid':
        return Math.min(token.content.split('\n').length + 4, 30);
      case 'strong':
      case 'em':
      case 'code':
      case 'link':
      case 'del':
      case 'math-inline':
        // Inline tokens should be rendered on the same line
        return 0;
      default:
        return Math.max(1, Math.ceil(token.content.length / 80));
    }
  }

  /**
   * Get default styles
   */
  private getDefaultStyles(): MarkdownStyles {
    return {


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
}
