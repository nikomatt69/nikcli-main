import { getHighlighter, BundledLanguage } from 'shiki';

/**
 * ANSI color code generator from RGB values
 */
function rgbToAnsi24bit(rgb: string): string {
  if (!rgb || rgb === 'transparent') return '';
  
  // Parse hex color
  if (rgb.startsWith('#')) {
    const hex = rgb.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }
  }
  
  return '';
}

/**
 * Background ANSI color from RGB
 */
function rgbToAnsiBg24bit(rgb: string): string {
  if (!rgb || rgb === 'transparent') return '';
  
  if (rgb.startsWith('#')) {
    const hex = rgb.slice(1);
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `\x1b[48;2;${r};${g};${b}m`;
    }
  }
  
  return '';
}

/**
 * ANSI style codes
 */
const ANSI_STYLES = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  inverse: '\x1b[7m',
};

/**
 * Shiki highlighter cache
 */
let highlighterCache: Map<string, any> = new Map();

/**
 * Get or create Shiki highlighter
 */
async function getShikiHighlighter(theme: string) {
  const cacheKey = `shiki-${theme}`;
  
  if (highlighterCache.has(cacheKey)) {
    return highlighterCache.get(cacheKey);
  }

  try {
    const highlighter = await getHighlighter({
      themes: [theme as any],
      langs: [
        'typescript',
        'javascript',
        'python',
        'bash',
        'sql',
        'json',
        'yaml',
        'markdown',
        'html',
        'css',
        'rust',
        'go',
        'java',
        'c',
        'cpp',
      ],
    });

    highlighterCache.set(cacheKey, highlighter);
    return highlighter;
  } catch (error) {
    console.warn('Shiki initialization failed, using fallback highlighting');
    return null;
  }
}

/**
 * Convert Shiki tokens to ANSI-colored string
 */
async function tokensToAnsi(
  tokens: Array<Array<{ content: string; color: string }>>,
  theme: string
): Promise<string> {
  let result = '';

  for (const line of tokens) {
    for (const token of line) {
      const ansiColor = rgbToAnsi24bit(token.color);
      
      if (ansiColor) {
        result += `${ansiColor}${token.content}${ANSI_STYLES.reset}`;
      } else {
        result += token.content;
      }
    }
    result += '\n';
  }

  return result;
}

/**
 * Highlight code using Shiki with ANSI output
 */
export async function highlightCodeWithShiki(
  code: string,
  lang: string = 'text',
  theme: string = 'nord'
): Promise<string> {
  if (!code || code.length === 0) {
    return code;
  }

  try {
    const highlighter = await getShikiHighlighter(theme);
    
    if (!highlighter) {
      // Fallback: return code as-is with basic coloring
      return applyBasicHighlighting(code, lang);
    }

    // Validate language
    const validLang = highlighter.getLoadedLanguages().includes(lang as BundledLanguage)
      ? (lang as BundledLanguage)
      : 'text';

    const html = await highlighter.codeToHtml(code, {
      lang: validLang,
      theme: theme as any,
    });

    // Parse HTML and convert to ANSI
    return htmlToAnsi(html);
  } catch (error) {
    console.warn('Shiki highlighting failed, using fallback');
    return applyBasicHighlighting(code, lang);
  }
}

/**
 * Convert HTML from Shiki to ANSI codes
 * Extracts color spans and converts to ANSI
 */
function htmlToAnsi(html: string): string {
  // Extract content from <pre> tag
  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (!preMatch) return '';

  let content = preMatch[1];
  
  // Replace spans with color codes
  // Pattern: <span style="color: #RRGGBB">text</span>
  content = content.replace(
    /<span style="color: (#[0-9a-fA-F]{6})">([\s\S]*?)<\/span>/g,
    (_, color, text) => {
      const ansiCode = rgbToAnsi24bit(color);
      return `${ansiCode}${text}${ANSI_STYLES.reset}`;
    }
  );

  // Remove remaining HTML tags
  content = content.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  content = content
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return content;
}

/**
 * Basic syntax highlighting fallback
 * Simple keyword and string coloring
 */
function applyBasicHighlighting(code: string, lang: string): string {
  let highlighted = code;

  // Keywords
  const keywords = [
    'function', 'const', 'let', 'var', 'if', 'else', 'return',
    'for', 'while', 'class', 'import', 'export', 'from', 'as',
    'async', 'await', 'try', 'catch', 'finally', 'throw',
    'new', 'this', 'super', 'extends', 'implements',
    'public', 'private', 'protected', 'static', 'readonly',
    'interface', 'type', 'enum', 'namespace', 'module',
    'true', 'false', 'null', 'undefined', 'default',
  ];

  // Color keywords (magenta)
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    highlighted = highlighted.replace(
      regex,
      `\x1b[35m$1\x1b[0m`
    );
  }

  // Color strings (green)
  highlighted = highlighted.replace(
    /(["'`])(?:(?=(\\?))\2.)*?\1/g,
    '\x1b[32m$&\x1b[0m'
  );

  // Color comments (gray)
  highlighted = highlighted.replace(
    /\/\/.*$/gm,
    '\x1b[90m$&\x1b[0m'
  );

  highlighted = highlighted.replace(
    /\/\*[\s\S]*?\*\//g,
    '\x1b[90m$&\x1b[0m'
  );

  // Color numbers (cyan)
  highlighted = highlighted.replace(
    /\b(\d+\.?\d*)\b/g,
    '\x1b[36m$1\x1b[0m'
  );

  return highlighted;
}

/**
 * Get ANSI theme from Shiki theme name
 */
export function getAnsiThemeColors(theme: string): Record<string, string> {
  // Common color mappings for popular themes
  const themes: Record<string, Record<string, string>> = {
    nord: {
      foreground: '#D8DEE9',
      background: '#2E3440',
      keyword: '#81A1C1',
      string: '#A3BE8C',
      comment: '#616E88',
      number: '#B48EAD',
      function: '#88C0D0',
    },
    'github-light': {
      foreground: '#24292E',
      background: '#FFFFFF',
      keyword: '#D73A49',
      string: '#032F62',
      comment: '#6A737D',
      number: '#005CC5',
      function: '#6F42C1',
    },
    'github-dark': {
      foreground: '#C9D1D9',
      background: '#0D1117',
      keyword: '#FF7B72',
      string: '#A5D6FF',
      comment: '#8B949E',
      number: '#79C0FF',
      function: '#D2A8FF',
    },
    'one-dark-pro': {
      foreground: '#ABB2BF',
      background: '#282C34',
      keyword: '#C678DD',
      string: '#98C379',
      comment: '#5C6370',
      number: '#D19A66',
      function: '#61AFEF',
    },
    dracula: {
      foreground: '#F8F8F2',
      background: '#282A36',
      keyword: '#FF79C6',
      string: '#F1FA8C',
      comment: '#6272A4',
      number: '#BD93F9',
      function: '#50FA7B',
    },
  };

  return themes[theme] || themes.nord;
}

/**
 * Format code with syntax highlighting for terminal output
 * Returns ready-to-display ANSI string
 */
export async function formatCodeForTerminal(
  code: string,
  lang: string = 'text',
  options?: {
    theme?: 'nord' | 'github-light' | 'github-dark' | 'one-dark-pro' | 'dracula';
    lineNumbers?: boolean;
    maxWidth?: number;
  }
): Promise<string> {
  const theme = options?.theme || 'nord';
  let highlighted = await highlightCodeWithShiki(code, lang, theme);

  // Add line numbers if requested
  if (options?.lineNumbers) {
    highlighted = addLineNumbers(highlighted);
  }

  // Word wrap if max width specified
  if (options?.maxWidth) {
    highlighted = wrapLines(highlighted, options.maxWidth);
  }

  return highlighted;
}

/**
 * Add line numbers to code
 */
function addLineNumbers(code: string): string {
  const lines = code.split('\n');
  const maxLineNum = lines.length;
  const maxDigits = String(maxLineNum).length;

  return lines
    .map((line, index) => {
      const lineNum = String(index + 1).padStart(maxDigits, ' ');
      return `\x1b[90m${lineNum}\x1b[0m │ ${line}`;
    })
    .join('\n');
}

/**
 * Word wrap lines while preserving ANSI codes
 */
function wrapLines(code: string, maxWidth: number): string {
  return code
    .split('\n')
    .map(line => wrapLine(line, maxWidth))
    .join('\n');
}

/**
 * Wrap single line while preserving ANSI codes
 */
function wrapLine(line: string, maxWidth: number): string {
  // Remove ANSI codes to calculate visible length
  const visible = line.replace(/\x1b\[[0-9;]*m/g, '');
  
  if (visible.length <= maxWidth) {
    return line;
  }

  // Split and re-add codes per segment
  const wrapped: string[] = [];
  let current = '';
  let visibleCurrent = '';
  let inCode = false;
  let currentCode = '';

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '\x1b' && line[i + 1] === '[') {
      // Start of ANSI code
      inCode = true;
      currentCode = char;
    } else if (inCode) {
      currentCode += char;
      if (char === 'm') {
        inCode = false;
        current += currentCode;
      }
    } else {
      current += char;
      visibleCurrent += char;

      if (visibleCurrent.length >= maxWidth) {
        wrapped.push(current);
        current = '';
        visibleCurrent = '';
      }
    }
  }

  if (current) {
    wrapped.push(current);
  }

  return wrapped.join('\n');
}

/**
 * Clear Shiki cache (for testing or memory pressure)
 */
export function clearShikiCache(): void {
  highlighterCache.clear();
}

/**
 * Get cache stats
 */
export function getShikiCacheStats() {
  return {
    size: highlighterCache.size,
    keys: Array.from(highlighterCache.keys()),
  };
}
