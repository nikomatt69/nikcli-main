import { Widgets } from 'blessed';

export interface StreamttyOptions {
  /**
   * Parse and style unterminated Markdown blocks
   */
  parseIncompleteMarkdown?: boolean;

  /**
   * Custom style overrides for different markdown elements
   */
  styles?: Partial<MarkdownStyles>;

  /**
   * Enable syntax highlighting for code blocks
   */
  syntaxHighlight?: boolean;

  /**
   * Show line numbers in code blocks
   */
  showLineNumbers?: boolean;

  /**
   * Maximum width for the content (auto-wrap)
   */
  maxWidth?: number;

  /**
   * Enable GFM (GitHub Flavored Markdown) extensions
   */
  gfm?: boolean;

  /**
   * Custom blessed screen instance
   */
  screen?: Widgets.Screen;

  /**
   * Auto-scroll to bottom on updates
   */
  autoScroll?: boolean;
}

export interface MarkdownStyles {
  h1: BlessedStyle;
  h2: BlessedStyle;
  h3: BlessedStyle;
  h4: BlessedStyle;
  h5: BlessedStyle;
  h6: BlessedStyle;
  paragraph: BlessedStyle;
  strong: BlessedStyle;
  em: BlessedStyle;
  code: BlessedStyle;
  codeBlock: BlessedStyle;
  blockquote: BlessedStyle;
  link: BlessedStyle;
  list: BlessedStyle;
  listItem: BlessedStyle;
  table: BlessedStyle;
  tableHeader: BlessedStyle;
  hr: BlessedStyle;
}

export interface BlessedStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  underline?: boolean;
  italic?: boolean;
  inverse?: boolean;
}

export interface ParsedToken {
  type: TokenType;
  content: string;
  depth?: number;
  ordered?: boolean;
  lang?: string;
  style?: BlessedStyle;
  incomplete?: boolean;
  raw?: string;
}

export type TokenType =
  | 'heading'
  | 'paragraph'
  | 'text'
  | 'strong'
  | 'em'
  | 'code'
  | 'codeblock'
  | 'blockquote'
  | 'list'
  | 'listitem'
  | 'link'
  | 'image'
  | 'table'
  | 'hr'
  | 'br'
  | 'del'
  | 'task'
  | 'incomplete';

export interface StreamBuffer {
  content: string;
  tokens: ParsedToken[];
  lastUpdate: number;
}

export interface RenderContext {
  screen: Widgets.Screen;
  container: Widgets.BoxElement;
  options: Required<StreamttyOptions>;
  buffer: StreamBuffer;
}
