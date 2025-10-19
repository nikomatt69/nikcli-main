/**
 * KaTeX/LaTeX → Unicode inline rendering
 * Semplice, niente HTML/blessed, output string puro
 * Compatibile con streaming chunks
 */

interface MathSymbolMap {
  [key: string]: string
}

// Symbol mapping: LaTeX → Unicode
const SYMBOL_MAP: MathSymbolMap = {
  // Greek letters
  'alpha': 'α', 'beta': 'β', 'gamma': 'γ', 'delta': 'δ', 'epsilon': 'ε',
  'zeta': 'ζ', 'eta': 'η', 'theta': 'θ', 'iota': 'ι', 'kappa': 'κ',
  'lambda': 'λ', 'mu': 'μ', 'nu': 'ν', 'xi': 'ξ', 'omicron': 'ο',
  'pi': 'π', 'rho': 'ρ', 'sigma': 'σ', 'tau': 'τ', 'upsilon': 'υ',
  'phi': 'φ', 'chi': 'χ', 'psi': 'ψ', 'omega': 'ω',

  // Math operators
  'infty': '∞', 'inf': '∞',
  'sum': '∑', 'prod': '∏', 'coprod': '∐',
  'int': '∫', 'iint': '∬', 'iiint': '∭',
  'sqrt': '√', 'cbrt': '∛',
  'approx': '≈', 'neq': '≠', 'leq': '≤', 'geq': '≥',
  'll': '≪', 'gg': '≫',
  'pm': '±', 'mp': '∓',
  'times': '×', 'div': '÷', 'cdot': '·',
  'forall': '∀', 'exists': '∃', 'emptyset': '∅',
  'in': '∈', 'ni': '∋', 'subset': '⊂', 'supset': '⊃',
  'cap': '∩', 'cup': '∪',
  'wedge': '∧', 'vee': '∨',
  'neg': '¬', 'implies': '⇒', 'iff': '⇔',
  'partial': '∂', 'nabla': '∇',
  'dagger': '†', 'ddagger': '‡',
  'star': '★', 'ast': '*',
  'propto': '∝', 'angle': '∠',
  'mid': '∣', 'parallel': '∥', 'perp': '⊥',

  // Relations
  'sim': '~', 'simeq': '≃', 'cong': '≅', 'equiv': '≡',

  // Logical
  'top': '⊤', 'bot': '⊥',
  'oplus': '⊕', 'ominus': '⊖', 'otimes': '⊗', 'oslash': '⊘',

  // Arrows
  'to': '→', 'gets': '←', 'leftrightarrow': '↔',
  'Rightarrow': '⇒', 'Leftarrow': '⇐', 'Leftrightarrow': '⇔',
  'mapsto': '↦', 'longrightarrow': '→',

  // Superscript digits
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',

  // Other
  'degree': '°', 'prime': '′', 'dprime': '″',
}

/**
 * Render LaTeX/KaTeX to Unicode string
 * @param latex LaTeX source string
 * @param inline Whether it's inline (true) or display (false) mode
 * @returns Rendered Unicode string
 */
export function renderMathToUnicode(latex: string, inline: boolean = true): string {
  if (!latex || latex.trim().length === 0) {
    return ''
  }

  let result = latex

  // 1. Replace \command{...} style symbols
  result = result.replace(/\\([a-zA-Z]+)/g, (match, cmd) => {
    const symbol = SYMBOL_MAP[cmd]
    return symbol || match
  })

  // 2. Handle superscript: x^2 → x²
  result = result.replace(/\^(\{[^}]+\}|.)/g, (match, exp) => {
    // Remove braces if present
    const expContent = exp.replace(/[{}]/g, '')

    // Convert each character
    return expContent
      .split('')
      .map((char: string | number) => {
        const superscripts: { [key: string]: string } = {
          '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
          '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
          '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
          'n': 'ⁿ', 'i': 'ⁱ', 'a': 'ᵃ', 'x': 'ˣ',
        }
        return superscripts[char] || char
      })
      .join('')
  })

  // 3. Handle subscript: x_i → xᵢ (fallback: x[i])
  result = result.replace(/_(\{[^}]+\}|.)/g, (match, sub) => {
    const subContent = sub.replace(/[{}]/g, '')

    // Limited subscript support
    const subscripts: { [key: string]: string } = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
      '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
      'i': 'ᵢ', 'n': 'ₙ', 'x': 'ₓ',
    }

    const converted = subContent
      .split('')
      .map((char: string | number) => subscripts[char as string] || char)
      .join('')

    // Fallback: if no subscript support, use [i] notation
    return converted === subContent ? `[${subContent}]` : converted
  })

  // 4. Fractions: \frac{a}{b} → (a)/(b) or a/b
  result = result.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, (match, num, denom) => {
    // For inline, use compact form
    if (inline) {
      return `${num}/${denom}`
    }
    // For display, could format as multi-line but we keep it simple
    return `\n(${num})\n─────\n(${denom})\n`
  })

  // 5. Radicals: \sqrt{x} → √(x), \sqrt[3]{x} → ∛(x)
  result = result.replace(/\\sqrt(?:\[(\d)\])?\{([^}]+)\}/g, (match, root, radicand) => {
    const rootNum = root || '2'
    const radical = rootNum === '2' ? '√' : rootNum === '3' ? '∛' : `√[${rootNum}]`
    return `${radical}(${radicand})`
  })

  // 6. Limits: \sum_{i=1}^{n} → ∑(i=1 to n)
  result = result.replace(/([∑∏∫])_\{([^}]+)\}\^\{([^}]+)\}/g, '$1($2→$3)')

  // 7. Clean up remaining braces
  result = result.replace(/[{}]/g, '')

  // 8. Handle common LaTeX sequences
  result = result
    .replace(/\\\\/g, '\n')  // Line breaks
    .replace(/\\left/g, '')
    .replace(/\\right/g, '')
    .replace(/\\middle/g, '')
    .replace(/\\limits/g, '')

  // 9. Remove empty braces
  result = result.replace(/\(\)/g, '')

  return result.trim()
}

/**
 * Render display mode math (block, possibly multi-line)
 */
export function renderMathBlock(latex: string): string {
  const content = renderMathToUnicode(latex, false)

  // Box the content for visual separation
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)

  if (lines.length === 0) return ''

  const maxLen = Math.max(...lines.map(l => l.length))
  const padding = 2
  const width = maxLen + padding * 2

  let boxed = '\n┌' + '─'.repeat(width) + '┐\n'

  for (const line of lines) {
    const spaces = ' '.repeat(padding + (width - padding * 2 - line.length) / 2)
    boxed += `│${spaces}${line}${spaces}│\n`
  }

  boxed += '└' + '─'.repeat(width) + '┘\n'

  return boxed
}

/**
 * Render inline math (no newlines)
 */
export function renderMathInline(latex: string): string {
  return renderMathToUnicode(latex, true)
}

/**
 * Detect if text contains math expressions
 */
export function containsMath(text: string): boolean {
  return /(\$\$[^\$]+\$\$|\$[^\$]+\$|\\(.+?)(?=\s|$))/g.test(text)
}

/**
 * Extract and process all math expressions in text
 */
export function processMathInText(text: string): string {
  return text
    // Display math: $$ ... $$
    .replace(/\$\$([^\$]+)\$\$/g, (match, latex) => {
      return renderMathBlock(latex)
    })
    // Inline math: $ ... $
    .replace(/\$([^\$]+)\$/g, (match, latex) => {
      return renderMathInline(latex)
    })
}
