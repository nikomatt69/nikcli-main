import marked from 'marked';
import { ParsedToken, TokenType } from '../types';

// Use any for Token types to avoid version-specific issues with marked library
type Token = any;

export class StreamingMarkdownParser {
  private buffer: string = '';
  private tokens: ParsedToken[] = [];
  private parseIncomplete: boolean;

  constructor(parseIncomplete: boolean = true) {
    this.parseIncomplete = parseIncomplete;

    // Configure marked for GFM
    marked.setOptions({
      gfm: true,
      breaks: true,
    });
  }

  /**
   * Add chunk to buffer and parse
   */
  public addChunk(chunk: string): ParsedToken[] {
    // Decode HTML entities and preprocess custom tags
    const processedChunk = this.preprocessText(chunk);
    this.buffer += processedChunk;
    return this.parse();
  }

  /**
   * Preprocess text to handle HTML entities, ANSI codes, and custom tags
   */
  private preprocessText(text: string): string {
    let processed = text;

    // Strip ANSI color codes first (comprehensive removal)
    processed = processed.replace(/\x1b\[[0-9;]*m/g, '');           // Standard color codes
    processed = processed.replace(/\x1b\[[\d;]*[A-Za-z]/g, '');     // All ANSI CSI sequences
    processed = processed.replace(/\x1b[A-Z]/g, '');                // Single char sequences
    processed = processed.replace(/\x1b\([AB0-9]/g, '');            // Character set sequences
    processed = processed.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, ''); // Other control chars

    // Decode common HTML entities
    processed = processed.replace(/&#39;/g, "'");
    processed = processed.replace(/&quot;/g, '"');
    processed = processed.replace(/&amp;/g, '&');
    processed = processed.replace(/&lt;/g, '<');
    processed = processed.replace(/&gt;/g, '>');
    processed = processed.replace(/&nbsp;/g, ' ');

    // Convert custom {italic} tags to standard markdown
    processed = processed.replace(/\{italic\}(.*?)\{\/italic\}/g, '*$1*');

    return processed;
  }

  /**
   * Parse current buffer
   */
  public parse(): ParsedToken[] {
    try {
      const markedTokens = marked.lexer(this.buffer);

      // Process tokens to handle inline formatting
      const processedTokens = this.processInlineTokens(markedTokens);
      this.tokens = this.convertTokens(processedTokens);

      // Handle incomplete markdown if enabled
      if (this.parseIncomplete) {
        this.handleIncompleteMarkdown();
      }

      return this.tokens;
    } catch (error) {
      // If parsing fails (incomplete markdown), try to parse what we can
      return this.parsePartial();
    }
  }

  /**
   * Parse inline formatting from text that wasn't processed by marked.js
   */
  private parseInlineFromText(text: string): Token[] {
    const tokens: Token[] = [];

    // Regular expressions for different inline elements
    const patterns = [
      { regex: /\*\*(.*?)\*\*/g, type: 'strong' },
      { regex: /__(.*?)__/g, type: 'strong' },
      { regex: /\*(.*?)\*/g, type: 'em' },
      { regex: /_(.*?)_/g, type: 'em' },
      { regex: /`(.*?)`/g, type: 'codespan' },
      { regex: /\[([^\]]+)\]\(([^)]+)\)/g, type: 'link' },
      { regex: /~~(.*?)~~/g, type: 'del' },
    ];

    // Find all matches and their positions
    const matches: Array<{ type: string; content: string; start: number; end: number }> = [];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(text)) !== null) {
        matches.push({
          type: pattern.type,
          content: match[1] || match[0],
          start: match.index,
          end: match.index + match[0].length
        });
      }
    }

    // Sort matches by position
    matches.sort((a, b) => a.start - b.start);

    // Build tokens
    let lastEnd = 0;
    for (const match of matches) {
      // Add text before this match
      if (match.start > lastEnd) {
        const textContent = text.slice(lastEnd, match.start);
        if (textContent.trim()) {
          tokens.push({
            type: 'text',
            raw: textContent,
            text: textContent
          } as any);
        }
      }

      // Add the formatted token
      tokens.push({
        type: match.type,
        raw: text.slice(match.start, match.end),
        text: match.content
      } as any);

      lastEnd = match.end;
    }

    // Add remaining text
    if (lastEnd < text.length) {
      const textContent = text.slice(lastEnd);
      if (textContent.trim()) {
        tokens.push({
          type: 'text',
          raw: textContent,
          text: textContent
        } as any);
      }
    }

    return tokens;
  }

  /**
   * Process tokens to extract inline formatting
   */
  private processInlineTokens(tokens: Token[]): Token[] {
    const processedTokens: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'paragraph') {
        const paragraph = token as any;
        if (paragraph.tokens && paragraph.tokens.length > 0) {
          // Flatten paragraph tokens to get inline elements
          const flattenedTokens = this.flattenInlineTokens(paragraph.tokens);
          processedTokens.push(...flattenedTokens);
        } else {
          // If no tokens, try to parse inline formatting from raw text
          const inlineTokens = this.parseInlineFromText(paragraph.text || paragraph.raw || '');
          if (inlineTokens.length > 0) {
            processedTokens.push(...inlineTokens);
          } else {
            processedTokens.push(token);
          }
        }
      } else if (token.type === 'blockquote') {
        const blockquote = token as any;
        if (blockquote.tokens && blockquote.tokens.length > 0) {
          // Process blockquote tokens
          const processedBlockquoteTokens = this.processInlineTokens(blockquote.tokens);
          processedTokens.push(...processedBlockquoteTokens);
        } else {
          processedTokens.push(token);
        }
      } else {
        processedTokens.push(token);
      }
    }

    return processedTokens;
  }

  /**
   * Flatten inline tokens recursively
   */
  private flattenInlineTokens(tokens: Token[]): Token[] {
    const flattened: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'em' || token.type === 'strong' || token.type === 'codespan' || token.type === 'link' || token.type === 'del' || token.type === 'text') {
        flattened.push(token);
      } else if ('tokens' in token && token.tokens && token.tokens.length > 0) {
        // Recursively flatten nested tokens
        flattened.push(...this.flattenInlineTokens(token.tokens));
      } else {
        flattened.push(token);
      }
    }

    return flattened;
  }

  /**
   * Parse partial/incomplete markdown
   */
  private parsePartial(): ParsedToken[] {
    const tokens: ParsedToken[] = [];
    const lines = this.buffer.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Try to identify incomplete patterns
      const token = this.parseIncompleteLine(line);
      tokens.push(token);
    }

    return tokens;
  }

  /**
   * Parse a single line that might be incomplete
   */
  private parseIncompleteLine(line: string): ParsedToken {
    // Heading (incomplete or complete)
    if (/^#{1,6}\s/.test(line)) {
      const depth = line.match(/^(#{1,6})/)?.[1].length || 1;
      return {
        type: 'heading',
        content: line.replace(/^#{1,6}\s/, ''),
        depth,
        incomplete: !line.includes('\n'),
      };
    }

    // Code block (incomplete)
    if (line.startsWith('```')) {
      const lang = line.replace('```', '').trim();
      return {
        type: 'codeblock',
        content: '',
        lang: lang || 'text',
        incomplete: true,
      };
    }

    // Blockquote
    if (line.startsWith('>')) {
      return {
        type: 'blockquote',
        content: line.replace(/^>\s*/, ''),
        incomplete: !line.includes('\n'),
      };
    }

    // List item
    if (/^[-*+]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const ordered = /^\d+\./.test(line);
      return {
        type: 'listitem',
        content: line.replace(/^[-*+\d.]\s*/, ''),
        ordered,
        incomplete: !line.includes('\n'),
      };
    }

    // Default to text with inline formatting
    return this.parseInlineFormatting(line);
  }

  /**
   * Handle incomplete markdown patterns
   */
  private handleIncompleteMarkdown(): void {
    const lastToken = this.tokens[this.tokens.length - 1];
    if (!lastToken) return;

    // Check if buffer ends with incomplete patterns
    const patterns = [
      { regex: /\*\*[^*]+$/, type: 'strong' },
      { regex: /\*[^*]+$/, type: 'em' },
      { regex: /`[^`]+$/, type: 'code' },
      { regex: /\[[^\]]+$/, type: 'link' },
      { regex: /^#{1,6}\s[^\n]+$/, type: 'heading' },
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(this.buffer)) {
        // Mark as incomplete
        if (lastToken.content) {
          lastToken.incomplete = true;
        }
      }
    }
  }

  /**
   * Parse inline formatting (bold, italic, code, links)
   */
  private parseInlineFormatting(text: string): ParsedToken {
    // This is a simplified version - in production you'd want more robust parsing
    let content = text;
    let incomplete = false;

    // Check for incomplete patterns
    if (/\*\*[^*]+$/.test(text) || /\*[^*]+$/.test(text) || /`[^`]+$/.test(text)) {
      incomplete = true;
    }

    return {
      type: 'text',
      content,
      incomplete,
    };
  }

  /**
   * Convert marked tokens to our format
   */
  private convertTokens(markedTokens: Token[]): ParsedToken[] {
    const tokens: ParsedToken[] = [];

    for (const token of markedTokens) {
      const converted = this.convertToken(token);
      if (converted) {
        if (Array.isArray(converted)) {
          tokens.push(...converted);
        } else {
          tokens.push(converted);
        }
      }
    }

    return tokens;
  }

  /**
   * Convert a single marked token
   */
  private convertToken(token: Token): ParsedToken | ParsedToken[] | null {
    switch (token.type) {
      case 'heading':
        return {
          type: 'heading',
          content: token.text,
          depth: token.depth,
          raw: token.raw,
        };

      case 'paragraph':
        // Paragraph tokens are now processed separately, so this should not happen
        return {
          type: 'paragraph',
          content: token.text,
          raw: token.raw,
        };

      case 'strong':
        return {
          type: 'strong',
          content: token.text,
          raw: token.raw,
        };

      case 'em':
        return {
          type: 'em',
          content: token.text,
          raw: token.raw,
        };

      case 'codespan':
        return {
          type: 'code',
          content: token.text,
          raw: token.raw,
        };

      case 'link':
        const link = token as any;
        return {
          type: 'link',
          content: link.text,
          raw: token.raw,
        };

      case 'del':
        return {
          type: 'del',
          content: token.text,
          raw: token.raw,
        };

      case 'text':
        return {
          type: 'text',
          content: token.text,
          raw: token.raw,
        };

      case 'code':
        return {
          type: 'codeblock',
          content: token.text,
          lang: token.lang || 'text',
          raw: token.raw,
        };

      case 'blockquote':
        const blockquote = token as any;
        return blockquote.tokens.map((t: Token) => this.convertToken(t)).flat().filter(Boolean) as ParsedToken[];

      case 'list':
        const list = token as any;
        return list.items.map((item: any, index: number) => ({
          type: 'listitem' as TokenType,
          content: item.text,
          ordered: list.ordered,
          depth: 0,
          raw: item.raw,
        }));

      case 'hr':
        return {
          type: 'hr',
          content: '',
          raw: token.raw,
        };

      case 'table':
        return {
          type: 'table',
          content: JSON.stringify(token),
          raw: token.raw,
        };

      case 'space':
        return null;

      default:
        return {
          type: 'text',
          content: (token as any).text || (token as any).raw || '',
          raw: token.raw,
        };
    }
  }

  /**
   * Clear buffer
   */
  public clear(): void {
    this.buffer = '';
    this.tokens = [];
  }

  /**
   * Get current buffer
   */
  public getBuffer(): string {
    return this.buffer;
  }

  /**
   * Get current tokens
   */
  public getTokens(): ParsedToken[] {
    return this.tokens;
  }
}
