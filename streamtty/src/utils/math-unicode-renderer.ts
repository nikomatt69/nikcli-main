/**
 * LaTeX to Unicode Math Renderer
 * Converts LaTeX math expressions to beautiful Unicode representations
 */

// Comprehensive Unicode math symbol mappings
const UNICODE_MAP = {
  // Superscripts
  '\\^0': '⁰',
  '\\^1': '¹',
  '\\^2': '²',
  '\\^3': '³',
  '\\^4': '⁴',
  '\\^5': '⁵',
  '\\^6': '⁶',
  '\\^7': '⁷',
  '\\^8': '⁸',
  '\\^9': '⁹',
  '\\^+': '⁺',
  '\\^-': '⁻',
  '\\^=': '⁼',
  '\\^(': '⁽',
  '\\^)': '⁾',

  // Subscripts
  '_0': '₀',
  '_1': '₁',
  '_2': '₂',
  '_3': '₃',
  '_4': '₄',
  '_5': '₅',
  '_6': '₆',
  '_7': '₇',
  '_8': '₈',
  '_9': '₉',
  '_+': '₊',
  '_-': '₋',
  '_=': '₌',
  '_(': '₍',
  '_)': '₎',

  // Greek letters (lowercase)
  'alpha': 'α',
  'beta': 'β',
  'gamma': 'γ',
  'delta': 'δ',
  'epsilon': 'ε',
  'zeta': 'ζ',
  'eta': 'η',
  'theta': 'θ',
  'iota': 'ι',
  'kappa': 'κ',
  'lambda': 'λ',
  'mu': 'μ',
  'nu': 'ν',
  'xi': 'ξ',
  'omicron': 'ο',
  'pi': 'π',
  'rho': 'ρ',
  'sigma': 'σ',
  'tau': 'τ',
  'upsilon': 'υ',
  'phi': 'φ',
  'chi': 'χ',
  'psi': 'ψ',
  'omega': 'ω',

  // Greek letters (uppercase)
  'Alpha': 'Α',
  'Beta': 'Β',
  'Gamma': 'Γ',
  'Delta': 'Δ',
  'Epsilon': 'Ε',
  'Zeta': 'Ζ',
  'Eta': 'Η',
  'Theta': 'Θ',
  'Iota': 'Ι',
  'Kappa': 'Κ',
  'Lambda': 'Λ',
  'Mu': 'Μ',
  'Nu': 'Ν',
  'Xi': 'Ξ',
  'Omicron': 'Ο',
  'Pi': 'Π',
  'Rho': 'Ρ',
  'Sigma': 'Σ',
  'Tau': 'Τ',
  'Upsilon': 'Υ',
  'Phi': 'Φ',
  'Chi': 'Χ',
  'Psi': 'Ψ',
  'Omega': 'Ω',

  // Math operators
  'sqrt': '√',
  'cbrt': '∛',
  'fourthroot': '∜',
  'integral': '∫',
  'sum': '∑',
  'prod': '∏',
  'coprod': '∐',
  'infty': '∞',
  'partial': '∂',
  'nabla': '∇',
  'approx': '≈',
  'ne': '≠',
  'leq': '≤',
  'geq': '≥',
  'll': '≪',
  'gg': '≫',
  'prec': '≺',
  'succ': '≻',
  'in': '∈',
  'notin': '∉',
  'subset': '⊂',
  'supset': '⊃',
  'subseteq': '⊆',
  'supseteq': '⊇',
  'cup': '∪',
  'cap': '∩',
  'setminus': '∖',
  'cdot': '·',
  'times': '×',
  'div': '÷',
  'pm': '±',
  'mp': '∓',
  'ast': '∗',
  'circ': '∘',
  'bullet': '•',
  'dagger': '†',
  'ddagger': '‡',
  'angle': '∠',
  'parallel': '∥',
  'perp': '⊥',
  'checkmark': '✓',
  'xmark': '✗',

  // Relations
  'equiv': '≡',
  'sim': '∼',
  'simeq': '≃',
  'cong': '≅',
  'asymp': '≍',
  'propto': '∝',
  'models': '⊨',
  'vdash': '⊢',
  'dashv': '⊣',

  // Logical operators
  'forall': '∀',
  'exists': '∃',
  'neg': '¬',
  'land': '∧',
  'lor': '∨',
  'implies': '⟹',
  'iff': '⟺',
  'bot': '⊥',
  'top': '⊤',

  // Arrows
  'to': '→',
  'rightarrow': '→',
  'leftarrow': '←',
  'leftrightarrow': '↔',
  'Rightarrow': '⇒',
  'Leftarrow': '⇐',
  'Leftrightarrow': '⇔',
  'mapsto': '↦',
  'longmapsto': '⟼',
  'uparrow': '↑',
  'downarrow': '↓',
  'updownarrow': '↕',
  'Uparrow': '⇑',
  'Downarrow': '⇓',
  'Updownarrow': '⇕',
  'nearrow': '↗',
  'searrow': '↘',
  'swarrow': '↙',
  'nwarrow': '↖',

  // Mathematical operators
  'frac': '⁄',  // Used in fractions
  'lfloor': '⌊',
  'rfloor': '⌋',
  'lceil': '⌈',
  'rceil': '⌉',

  // Miscellaneous
  'varphi': 'φ',
  'vartheta': 'ϑ',
  'ell': 'ℓ',
  'Re': 'ℜ',
  'Im': 'ℑ',
  'wp': '℘',
  'wr': '≀',
  'heartsuit': '♡',
  'diamondsuit': '♢',
  'clubsuit': '♣',
  'spadesuit': '♠',
  'flatsuit': '♭',
  'naturalsuit': '♮',
  'sharpsuit': '♯',
};

/**
 * Render LaTeX expression to Unicode inline format
 */
export function renderMathToUnicode(latex: string): string {
  if (!latex || latex.length === 0) {
    return latex;
  }

  let result = latex;

  // Replace LaTeX commands with Unicode equivalents
  for (const [latex_code, unicode] of Object.entries(UNICODE_MAP)) {
    // Handle both \cmd and cmd format
    const patterns = [
      new RegExp(`\\\\${latex_code}\\b`, 'g'),
      new RegExp(`\\b${latex_code}\\b`, 'g'),
    ];

    for (const pattern of patterns) {
      result = result.replace(pattern, unicode);
    }
  }

  // Handle special cases

  // Exponents: x^2 → x²
  result = result.replace(/\^(\d)/g, (_, digit) => {
    const superscripts = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
    return superscripts[parseInt(digit)] || _;
  });

  // Subscripts: x_i → xᵢ
  result = result.replace(/_(\d)/g, (_, digit) => {
    const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
    return subscripts[parseInt(digit)] || _;
  });

  // Handle sqrt with braces: \sqrt{x} → √x
  result = result.replace(/√\{([^}]+)\}/g, '√($1)');

  // Handle fractions (simple inline): x/y stays as x/y (can't do real fractions inline)
  // But we can indicate it better with slash
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)');

  // Handle parentheses variants
  result = result.replace(/\\left\(/g, '(');
  result = result.replace(/\\right\)/g, ')');
  result = result.replace(/\\left\[/g, '[');
  result = result.replace(/\\right\]/g, ']');
  result = result.replace(/\\left\{/g, '{');
  result = result.replace(/\\right\}/g, '}');

  // Remove remaining LaTeX command syntax
  result = result.replace(/\\[a-zA-Z]+/g, '');

  // Clean up whitespace
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Render math in block format with box
 */
export function renderMathBlock(
  latex: string,
  options?: { width?: number; boxStyle?: 'simple' | 'rounded' }
): string {
  const width = options?.width || 60;
  const style = options?.boxStyle || 'rounded';

  const unicode = renderMathToUnicode(latex);

  // Wrap in a box for display
  const lines = wrapText(unicode, width - 4);

  const topBorder = style === 'rounded'
    ? '┌' + '─'.repeat(width - 2) + '┐'
    : '┏' + '━'.repeat(width - 2) + '┓';

  const bottomBorder = style === 'rounded'
    ? '└' + '─'.repeat(width - 2) + '┘'
    : '┗' + '━'.repeat(width - 2) + '┛';

  const vertBorder = style === 'rounded' ? '│' : '┃';

  let result = topBorder + '\n';

  for (const line of lines) {
    const padded = line.padEnd(width - 4);
    result += vertBorder + '  ' + padded + '  ' + vertBorder + '\n';
  }

  result += bottomBorder;

  return result;
}

/**
 * Wrap text to fit within width
 */
function wrapText(text: string, width: number): string[] {
  if (text.length <= width) {
    return [text];
  }

  const lines: string[] = [];
  const words = text.split(' ');
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

  return lines;
}

/**
 * Detect if text contains LaTeX math
 */
export function containsMath(text: string): boolean {
  // Check for inline math: $...$ 
  // Check for display math: $$...$$
  // Check for LaTeX commands: \...
  return /\$.*?\$|\\\w+|_\{|_\d|\^\{|\^\d/.test(text);
}

/**
 * Extract math expressions from text
 */
export interface MathMatch {
  type: 'inline' | 'block';
  content: string;
  start: number;
  end: number;
}

export function extractMath(text: string): MathMatch[] {
  const matches: MathMatch[] = [];
  const blockRanges: Array<{ start: number; end: number }> = [];

  // Find display math: $$...$$ (non-greedy to handle multiple blocks)
  // Use negative lookahead/lookbehind to avoid matching triple $$$ 
  const blockRegex = /\$\$((?:(?!\$\$).)+)\$\$/gs;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(text)) !== null) {
    const start = blockMatch.index;
    const end = blockMatch.index + blockMatch[0].length;
    blockRanges.push({ start, end });
    matches.push({
      type: 'block',
      content: blockMatch[1],
      start,
      end,
    });
  }

  // Find inline math: $...$ (non-greedy, avoiding blocks)
  // Use negative lookahead to ensure we don't match $$
  const inlineRegex = /\$(?!\$)((?:(?!\$).)+)\$(?!\$)/gs;
  let inlineMatch;
  while ((inlineMatch = inlineRegex.exec(text)) !== null) {
    const matchStart = inlineMatch.index;
    const matchEnd = matchStart + inlineMatch[0].length;

    // Skip if this overlaps with any block match (more efficient than .some())
    const overlapsBlock = blockRanges.some(
      range => matchStart >= range.start && matchStart < range.end
    );

    if (!overlapsBlock) {
      matches.push({
        type: 'inline',
        content: inlineMatch[1],
        start: matchStart,
        end: matchEnd,
      });
    }
  }

  // Sort by position
  matches.sort((a, b) => a.start - b.start);

  return matches;
}

/**
 * Replace math in text with rendered Unicode
 */
export function replaceMathInText(text: string): string {
  const matches = extractMath(text);

  if (matches.length === 0) {
    return text;
  }

  let result = '';
  let lastEnd = 0;

  for (const match of matches) {
    // Add text before match
    result += text.slice(lastEnd, match.start);

    // Add rendered math (without $ delimiters)
    result += renderMathToUnicode(match.content);

    lastEnd = match.end;
  }

  // Add remaining text
  result += text.slice(lastEnd);

  return result;
}

/**
 * Format math expression with pretty printing
 */
export function formatMathExpression(latex: string): string {
  // Handle common patterns for prettier output
  let formatted = latex;

  // e.g., "x^2 + y^2 = z^2" → "x² + y² = z²"
  formatted = formatted.replace(/(\w)\^(\d+)/g, '$1' + '²'.repeat(Number('$2')));

  // Render to Unicode
  formatted = renderMathToUnicode(formatted);

  return formatted;
}
