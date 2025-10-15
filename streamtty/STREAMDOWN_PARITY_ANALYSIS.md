# StreamTTY vs Streamdown - Analisi Completa per Parità

## 🎯 Obiettivo
Trasformare StreamTTY in un clone esatto di Streamdown ma per TTY invece che per il web.

---

## 📊 Feature Matrix

| Feature | Streamdown (Web) | StreamTTY (TTY) | Gap | Priorità |
|---------|------------------|-----------------|-----|----------|
| **Core Markdown** |
| GitHub Flavored Markdown | ✅ remark-gfm | ✅ marked + gfm | ✅ | - |
| Streaming Parser | ✅ | ✅ | ✅ | - |
| Incomplete Blocks | ✅ | ✅ | ✅ | - |
| **Math & Diagrams** |
| Math Rendering (KaTeX) | ✅ rehype-katex | ❌ | **CRITICAL** | 🔴 HIGH |
| Mermaid Diagrams | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| Custom Mermaid Config | ✅ MermaidConfig | ❌ | **CRITICAL** | 🔴 HIGH |
| **Syntax Highlighting** |
| Shiki Integration | ✅ Dual themes | ❌ | **CRITICAL** | 🔴 HIGH |
| Custom Themes | ✅ BundledTheme | ❌ | **CRITICAL** | 🟡 MEDIUM |
| Language Detection | ✅ Auto | ⚠️ Basic | **NEEDED** | 🟡 MEDIUM |
| **Security** |
| rehype-harden | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| Link Validation | ✅ allowedLinkPrefixes | ❌ | **NEEDED** | 🟡 MEDIUM |
| Image Validation | ✅ allowedImagePrefixes | ❌ | **NEEDED** | 🟡 MEDIUM |
| **Plugin System** |
| Rehype Plugins | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| Remark Plugins | ✅ | ⚠️ Limited | **NEEDED** | 🟡 MEDIUM |
| Custom Plugins | ✅ | ❌ | **NEEDED** | 🟢 LOW |
| **Interactive Controls** |
| Copy Button (Code) | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| Download Button | ✅ | ❌ | **NEEDED** | 🟡 MEDIUM |
| Custom Controls Config | ✅ | ❌ | **NEEDED** | 🟢 LOW |
| **Animation** |
| isAnimating Prop | ✅ | ❌ | **NEEDED** | 🟡 MEDIUM |
| Disable Controls While Streaming | ✅ | ❌ | **NEEDED** | 🟡 MEDIUM |
| **Tables** |
| Table Rendering | ✅ Full | ⚠️ Placeholder | **CRITICAL** | 🔴 HIGH |
| Table Styling | ✅ | ❌ | **NEEDED** | 🟡 MEDIUM |
| **Component Props** |
| parseIncompleteMarkdown | ✅ | ✅ | ✅ | - |
| className | ✅ | ⚠️ style only | **NEEDED** | 🟢 LOW |
| components (override) | ✅ | ❌ | **NEEDED** | 🟡 MEDIUM |
| rehypePlugins | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| remarkPlugins | ✅ | ⚠️ Limited | **CRITICAL** | 🔴 HIGH |
| shikiTheme | ✅ [light, dark] | ❌ | **CRITICAL** | 🔴 HIGH |
| mermaidConfig | ✅ | ❌ | **CRITICAL** | 🔴 HIGH |
| controls | ✅ granular | ❌ | **NEEDED** | 🟡 MEDIUM |

---

## 🔴 CRITICAL Missing Features (Must Have)

### 1. **Math Rendering (KaTeX per TTY)**
```typescript
// Streamdown ha:
import rehypeKatex from 'rehype-katex'

// StreamTTY needs:
// - Convertire LaTeX in ASCII art o Unicode
// - Librerie possibili: 
//   - asciimath (per formule semplici)
//   - katex + renderToString -> strip HTML -> format per TTY
//   - mathjs per valutazioni
```

**Soluzione TTY:**
- Inline math: `$x^2 + y^2 = z^2$` → render come ASCII/Unicode: `x² + y² = z²`
- Block math: Usare box blessed con formattazione Unicode avanzata
- Librerie: `mathjs`, `unicode-math-symbols`, custom renderer

**Esempio Output:**
```
┌─────────────────────────┐
│  E = mc²                │
│                         │
│  ∫₀^∞ e^(-x²) dx = √π/2 │
└─────────────────────────┘
```

### 2. **Mermaid Diagrams per TTY**
```typescript
// Streamdown ha:
import mermaid from 'mermaid'

// StreamTTY needs:
// - Parser Mermaid -> ASCII art
// - Librerie possibili:
//   - mermaid-cli + conversione a testo
//   - mermaid-to-ascii (custom)
//   - blessed-contrib per grafici
```

**Soluzione TTY:**
- Flowchart → ASCII art con box e linee
- Sequence diagrams → Timeline con frecce ASCII
- Gantt → Barre progress blessed-contrib

**Esempio Flowchart:**
```
┌────────┐
│ Start  │
└───┬────┘
    │
    ▼
┌─────────────────┐     Yes    ┌─────────┐
│ Is it working?  ├────────────▶│  Great! │
└────────┬────────┘             └─────────┘
         │ No
         ▼
    ┌────────┐
    │ Debug  │
    └───┬────┘
        │
        └─────┐
              │
              ▼
```

### 3. **Shiki Syntax Highlighting**
```typescript
// Streamdown usa:
import { codeToHtml } from 'shiki'
const highlighted = await codeToHtml(code, {
  lang: 'typescript',
  themes: { light: 'github-light', dark: 'github-dark' }
})

// StreamTTY needs:
// - Shiki → ANSI colors invece di HTML
// - Supporto multi-theme (light/dark terminal)
```

**Soluzione TTY:**
- Usare `shiki` con custom renderer ANSI
- O usare `cli-highlight` (già incluso) ma migliorato
- Mappare Shiki themes → ANSI color codes

**Implementazione:**
```typescript
import { getHighlighter } from 'shiki'

async function highlightForTerminal(code: string, lang: string) {
  const highlighter = await getHighlighter({
    themes: ['github-light', 'github-dark'],
    langs: ['typescript', 'javascript', ...]
  })
  
  // Custom renderer per ANSI
  const tokens = highlighter.codeToThemedTokens(code, lang)
  return tokensToAnsi(tokens) // Custom conversion
}
```

### 4. **Rehype/Remark Plugin System**
```typescript
// Streamdown architecture:
export const defaultRehypePlugins = {
  harden: [harden, { allowedLinkPrefixes: ['*'], ... }],
  raw: rehypeRaw,
  katex: [rehypeKatex, { errorColor: "..." }]
}

export const defaultRemarkPlugins = {
  gfm: [remarkGfm, {}],
  math: [remarkMath, { singleDollarTextMath: false }]
}

// StreamTTY needs:
// - Plugin architecture
// - Support per custom plugins
// - TTY-specific plugins
```

**Plugin TTY da creare:**
- `remark-tty-math` - Math rendering per terminal
- `remark-tty-mermaid` - Diagram rendering
- `rehype-tty-harden` - Security per terminal (strip ANSI exploits)
- `rehype-tty-highlight` - Shiki integration

### 5. **Security (rehype-harden equivalent)**
```typescript
// Streamdown ha:
[harden, {
  allowedLinkPrefixes: ['*'],
  allowedImagePrefixes: ['*'],
  defaultOrigin: undefined
}]

// StreamTTY needs:
// - Validazione ANSI codes (prevent escape sequence attacks)
// - Link validation
// - Sanitizzazione input
```

**Security TTY-specific:**
- Strip malicious ANSI escape sequences
- Validate blessed tags injection
- Limite lunghezza buffer per DoS prevention
- Sanitize user input prima del parsing

### 6. **Interactive Controls**
```typescript
// Streamdown ha:
controls={true} // or { table: boolean, code: boolean, mermaid: boolean }

// StreamTTY needs:
// - Key bindings per copy code
// - Export diagram to file
// - Interactive table navigation
```

**Controlli TTY:**
- `c` - Copy code block sotto cursor
- `e` - Export diagram/table to file
- `Arrow keys` - Navigate table cells
- `Space` - Expand/collapse sections

### 7. **Table Rendering**
```typescript
// StreamTTY ha solo placeholder
// Need: Full table support con:
// - Alignment (left, center, right)
// - Borders blessed
// - Scrollable per large tables
```

**Implementazione:**
```typescript
import { table } from 'blessed-contrib'

renderTable(token: TableToken) {
  return table({
    parent: this.container,
    keys: true,
    vi: true,
    fg: 'white',
    selectedFg: 'white',
    selectedBg: 'blue',
    interactive: true,
    label: 'Table',
    border: { type: 'line' },
    columnSpacing: 3,
    columnWidth: [20, 20, 20],
    headers: token.headers,
    data: token.rows
  })
}
```

---

## 🟡 MEDIUM Priority Features

### 8. **Animation Support**
```typescript
// Streamdown:
<Streamdown isAnimating={status === 'streaming'}>

// StreamTTY needs:
// - Spinner/progress durante streaming
// - Disable controls durante animation
// - Smooth transitions
```

### 9. **Custom Component Overrides**
```typescript
// Streamdown:
components={{
  code: CustomCodeBlock,
  h1: CustomHeading,
  ...
}}

// StreamTTY needs:
// - Custom blessed widgets per tipo
// - Override rendering logic
```

### 10. **Theme Configuration**
```typescript
// StreamTTY needs:
interface ThemeConfig {
  light: BlessedTheme
  dark: BlessedTheme
  auto: boolean // detect terminal theme
}
```

---

## 📝 Implementation Plan

### Phase 1: Critical Infrastructure (2-3 weeks)
1. ✅ Plugin System Architecture
   - Create `TTYPlugin` interface
   - Implement plugin loader
   - Add plugin hooks (pre-parse, post-parse, pre-render, post-render)

2. ✅ Math Rendering
   - Integrate KaTeX → Unicode converter
   - Create `remark-tty-math` plugin
   - ASCII math renderer with blessed boxes

3. ✅ Shiki Integration
   - Shiki → ANSI color mapper
   - Theme support (light/dark)
   - Language auto-detection improvements

4. ✅ Security Layer
   - `rehype-tty-harden` plugin
   - ANSI escape sanitizer
   - Input validation

### Phase 2: Interactive Features (2 weeks)
5. ✅ Mermaid Diagrams
   - Mermaid parser → ASCII art
   - Support flowchart, sequence, gantt
   - Interactive navigation

6. ✅ Table Rendering
   - Full table support with blessed-contrib
   - Alignment, borders, scrolling
   - Interactive cell navigation

7. ✅ Interactive Controls
   - Key bindings system
   - Copy/export functionality
   - Control visibility config

### Phase 3: Polish & Optimization (1 week)
8. ✅ Animation & Streaming
   - Streaming indicators
   - Smooth updates
   - Control state management

9. ✅ Custom Components
   - Component override system
   - Custom widget factory

10. ✅ Documentation & Examples
    - Complete API docs
    - Migration guide from Streamdown
    - Example gallery

---

## 🛠️ Technical Architecture

### New Files to Create

```
streamtty/
├── src/
│   ├── plugins/
│   │   ├── remark/
│   │   │   ├── math.ts              # Math rendering
│   │   │   ├── mermaid.ts           # Diagram rendering
│   │   │   └── tty-extensions.ts
│   │   ├── rehype/
│   │   │   ├── harden.ts            # Security
│   │   │   ├── highlight.ts         # Shiki integration
│   │   │   └── ansi-safe.ts
│   │   └── index.ts
│   ├── renderers/
│   │   ├── math-renderer.ts         # KaTeX → Unicode
│   │   ├── mermaid-renderer.ts      # Mermaid → ASCII
│   │   ├── table-renderer.ts        # Full table support
│   │   └── shiki-ansi.ts            # Shiki → ANSI
│   ├── security/
│   │   ├── ansi-sanitizer.ts
│   │   └── input-validator.ts
│   ├── controls/
│   │   ├── key-handler.ts
│   │   ├── copy-manager.ts
│   │   └── export-manager.ts
│   ├── themes/
│   │   ├── light.ts
│   │   ├── dark.ts
│   │   └── theme-detector.ts
│   └── core/
│       ├── plugin-system.ts
│       └── config.ts
```

### Dependencies to Add

```json
{
  "dependencies": {
    "shiki": "^1.x",                    // Syntax highlighting
    "katex": "^0.16.x",                 // Math rendering  
    "mathjs": "^12.x",                  // Math parsing
    "unicode-math-symbols": "^1.x",     // Unicode math
    "blessed-contrib": "^4.x",          // Tables & graphs
    "ansi-regex": "^6.x",               // ANSI sanitization
    "sanitize-html": "^2.x",            // HTML sanitization
    "remark-math": "^6.x",              // Math plugin
    "rehype-katex": "^7.x"              // KaTeX plugin
  }
}
```

---

## 📋 API Parity Checklist

### Props API
```typescript
// Streamdown
interface StreamdownProps {
  children: string
  parseIncompleteMarkdown?: boolean
  className?: string
  components?: Partial<Components>
  rehypePlugins?: PluggableList
  remarkPlugins?: PluggableList
  shikiTheme?: [BundledTheme, BundledTheme]
  mermaidConfig?: MermaidConfig
  controls?: boolean | ControlsConfig
  isAnimating?: boolean
}

// StreamTTY - Target API
interface StreamTTYProps {
  content: string
  parseIncomplete?: boolean
  style?: BlessedStyle                    // Equiv to className
  components?: ComponentOverrides         // Custom widgets
  rehypePlugins?: TTYPluggableList       // TTY-specific
  remarkPlugins?: TTYPluggableList       // TTY-specific
  theme?: 'light' | 'dark' | 'auto'      // Shiki equiv
  shikiLanguages?: string[]              // Language support
  mermaidConfig?: MermaidTTYConfig       // Mermaid config
  controls?: boolean | TTYControlsConfig // Interactive controls
  isStreaming?: boolean                  // Equiv to isAnimating
  onError?: (error: Error) => void       // Error handling
}
```

### Controls Config
```typescript
// Streamdown
type ControlsConfig = {
  table?: boolean
  code?: boolean
  mermaid?: boolean
}

// StreamTTY
type TTYControlsConfig = {
  table?: boolean          // Navigate tables
  code?: boolean           // Copy code blocks
  mermaid?: boolean        // Export diagrams
  math?: boolean           // Copy math expressions
  keys?: KeyBindings       // Custom key bindings
}

type KeyBindings = {
  copy?: string            // Default: 'c'
  export?: string          // Default: 'e'
  navigate?: {
    up?: string
    down?: string
    left?: string
    right?: string
  }
}
```

---

## 🎯 Success Criteria

StreamTTY sarà considerato un vero clone di Streamdown quando:

1. ✅ **Feature Parity**: Tutte le feature di Streamdown hanno un equivalente TTY
2. ✅ **API Parity**: Le props API sono equivalenti (con adattamenti TTY)
3. ✅ **Plugin System**: Sistema di plugin compatibile con remark/rehype
4. ✅ **Security**: Stesso livello di sicurezza con validazioni TTY-specific
5. ✅ **Performance**: Streaming performance comparabile
6. ✅ **Documentation**: Doc completa con migration guide
7. ✅ **Examples**: Gallery di esempi che dimostrano tutte le features

---

## 📊 Current Status

| Category | Completion | Notes |
|----------|-----------|-------|
| Core Markdown | 80% | Base solida, serve solo polish |
| Math Rendering | 0% | Non implementato |
| Mermaid | 0% | Non implementato |
| Syntax Highlighting | 30% | Base presente, serve Shiki |
| Plugin System | 0% | Da creare da zero |
| Security | 20% | Base presente, serve hardening |
| Tables | 10% | Solo placeholder |
| Controls | 0% | Non implementato |
| Animation | 50% | Streaming OK, serve polish |

**Overall Progress: ~25%**

---

## 🚀 Next Steps

1. **Immediate** (This Sprint):
   - [ ] Create plugin system architecture
   - [ ] Implement basic rehype-tty-harden
   - [ ] Start Shiki integration POC

2. **Short Term** (Next 2 weeks):
   - [ ] Complete math rendering
   - [ ] Mermaid ASCII renderer
   - [ ] Full table support

3. **Medium Term** (Next month):
   - [ ] Interactive controls
   - [ ] Complete plugin ecosystem
   - [ ] Documentation

---

## 📚 Resources

### Streamdown References
- [Streamdown GitHub](https://github.com/vercel/streamdown)
- [Streamdown Docs](https://streamdown.ai/)

### TTY Libraries
- [Blessed](https://github.com/chjj/blessed) - Terminal UI
- [Blessed Contrib](https://github.com/yaronn/blessed-contrib) - Charts/Tables
- [Shiki](https://shiki.matsu.io/) - Syntax highlighting
- [KaTeX](https://katex.org/) - Math rendering

### Security
- [ANSI Escape Codes](https://en.wikipedia.org/wiki/ANSI_escape_code)
- [Terminal Security Best Practices](https://owasp.org/www-community/attacks/Code_Injection)

---

**Date**: 2025-01-15
**Author**: NikCLI Team
**Version**: 1.0

