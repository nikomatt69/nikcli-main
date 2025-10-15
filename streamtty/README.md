# Streamtty

> A drop-in replacement for markdown rendering in TTY environments, designed for AI-powered streaming with blessed.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

Streamtty is inspired by [Streamdown](https://github.com/vercel/streamdown) but built specifically for terminal/TTY environments using [blessed](https://github.com/chjj/blessed). It handles the unique challenges of streaming Markdown content from AI models in terminals, providing seamless formatting even with incomplete or unterminated Markdown blocks.

## ✨ Features

### Core Features
- 🚀 **Streaming-optimized** - Handles incomplete Markdown gracefully during real-time generation
- 🎨 **Unterminated block parsing** - Styles incomplete bold, italic, code, links, and headings
- 📊 **GitHub Flavored Markdown** - Tables, task lists, and strikethrough support
- 📝 **Rich formatting** - Headers, lists, blockquotes, links, and more
- ⚡ **Performance optimized** - Debounced rendering for efficient updates
- 🎮 **Interactive** - Built-in keyboard navigation and scrolling

### Enhanced Features (Streamdown Parity) ✨ NEW
- 📐 **Math Rendering** - LaTeX math expressions converted to Unicode (inline and block)
- 📊 **Mermaid Diagrams** - Flowcharts, sequence diagrams, and more rendered as ASCII art
- 🎨 **Shiki Syntax Highlighting** - Advanced code highlighting with multiple themes
- 📋 **Advanced Tables** - Full table support with alignment, borders, and navigation
- 🛡️ **Security Layer** - ANSI sanitization, input validation, and injection prevention
- ⌨️ **Interactive Controls** - Copy code, export diagrams, navigate with keyboard shortcuts
- 🔌 **Plugin System** - Remark/Rehype compatible plugin architecture
- 🎭 **Theme Support** - Light/dark themes with auto-detection
- 🧩 **Component Overrides** - Customize rendering for any token type

## 📦 Installation

```bash
yarn add streamtty blessed
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { Streamtty } from 'streamtty';

const markdown = `
# Hello World

This is **bold** and this is *italic*.

\`\`\`typescript
console.log('Hello, Streamtty!');
\`\`\`
`;

const streamtty = new Streamtty();
streamtty.setContent(markdown);
```

### Streaming Usage (AI-like)

```typescript
import { Streamtty } from 'streamtty';

const streamtty = new Streamtty({
  parseIncompleteMarkdown: true,
  autoScroll: true,
});

// Simulate AI streaming
const chunks = ['# Hello ', '**World**', '!\n\nThis is ', '`streaming`'];
for (const chunk of chunks) {
  streamtty.stream(chunk);
  await new Promise(resolve => setTimeout(resolve, 100));
}
```

### Interactive Chat Example

```typescript
import blessed from 'blessed';
import { Streamtty } from 'streamtty';

const screen = blessed.screen({
  smartCSR: true,
  title: 'AI Chat',
});

const streamtty = new Streamtty({ screen });

// Stream AI response character by character
function streamResponse(response: string) {
  let index = 0;
  const interval = setInterval(() => {
    if (index < response.length) {
      streamtty.stream(response[index]);
      index++;
    } else {
      clearInterval(interval);
    }
  }, 50);
}

streamResponse('# AI Response\n\nHere is some **formatted** text!');
```

### Enhanced Features Usage

```typescript
import { Streamtty } from 'streamtty';

// Enable all enhanced features
const streamtty = new Streamtty({
  syntaxHighlight: true,
  theme: 'dark',
  shikiLanguages: ['typescript', 'python', 'bash'],
  enhancedFeatures: {
    math: true,              // LaTeX math rendering
    mermaid: true,           // Mermaid diagrams
    shiki: true,             // Advanced syntax highlighting
    security: true,          // ANSI sanitization & validation
    interactiveControls: true, // Keyboard shortcuts
    advancedTables: true,    // Enhanced table rendering
  },
  controls: {
    code: true,    // Press 'c' to copy code blocks
    table: true,   // Arrow keys to navigate tables
    mermaid: true, // Press 'e' to export diagrams
    math: true,    // Copy math expressions
  },
  security: {
    enabled: true,
    stripDangerousAnsi: true,
    allowedLinkPrefixes: ['https://'],
  },
});

// Math rendering
const mathContent = `
Inline math: $E = mc^2$

Block math:
$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$
`;
streamtty.setContent(mathContent);

// Mermaid diagrams
const diagramContent = `
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Success]
    B -->|No| D[Retry]
\`\`\`
`;
streamtty.stream(diagramContent);

// Advanced tables
const tableContent = `
| Feature | Status | Priority |
|---------|:------:|----------|
| Math    | ✅     | High     |
| Mermaid | ✅     | High     |
| Tables  | ✅     | Medium   |
`;
streamtty.stream(tableContent);
```

### Plugin System

```typescript
import { Streamtty, RemarkPlugin, RehypePlugin } from 'streamtty';

// Custom remark plugin (pre-parse)
const customRemarkPlugin: RemarkPlugin = {
  name: 'custom-remark',
  type: 'remark',
  priority: 50,
  async process(markdown, context) {
    // Transform markdown before parsing
    return markdown.replace(/TODO:/g, '📝 TODO:');
  },
};

// Custom rehype plugin (post-parse)
const customRehypePlugin: RehypePlugin = {
  name: 'custom-rehype',
  type: 'rehype',
  priority: 50,
  async process(tokens, context) {
    // Transform tokens after parsing
    return tokens.map(token => {
      if (token.type === 'text' && token.content.includes('IMPORTANT')) {
        token.style = { fg: 'red', bold: true };
      }
      return token;
    });
  },
};

const streamtty = new Streamtty({
  remarkPlugins: [customRemarkPlugin],
  rehypePlugins: [customRehypePlugin],
});
```

## 📖 API Reference

### `Streamtty`

Main class for rendering streamed markdown in TTY.

#### Constructor Options

```typescript
interface StreamttyOptions {
  parseIncompleteMarkdown?: boolean;  // Default: true
  styles?: Partial<MarkdownStyles>;
  syntaxHighlight?: boolean;          // Default: true
  showLineNumbers?: boolean;          // Default: false
  maxWidth?: number;                  // Default: 120
  gfm?: boolean;                      // Default: true
  screen?: Widgets.Screen;            // Custom blessed screen
  autoScroll?: boolean;               // Default: true
}
```

#### Methods

##### `stream(chunk: string): void`

Stream a chunk of markdown content. Handles incomplete markdown gracefully.

```typescript
streamtty.stream('# Hello ');
streamtty.stream('**World**');
```

##### `setContent(markdown: string): void`

Set complete markdown content all at once.

```typescript
streamtty.setContent('# Complete Document\n\nWith **multiple** paragraphs.');
```

##### `render(): void`

Manually trigger a render. Usually not needed as rendering is automatic.

##### `clear(): void`

Clear all content from the display.

```typescript
streamtty.clear();
```

##### `startAutoRender(intervalMs?: number): void`

Start auto-rendering at specified interval (default: 50ms).

##### `stopAutoRender(): void`

Stop auto-rendering.

##### `getScreen(): Widgets.Screen`

Get the blessed screen instance.

##### `getContainer(): Widgets.BoxElement`

Get the blessed container box.

##### `getContent(): string`

Get current buffer content.

##### `destroy(): void`

Cleanup and destroy the instance.

## 🎨 Styling

Streamtty uses blessed's styling system. You can customize styles for different markdown elements:

```typescript
const streamtty = new Streamtty({
  styles: {
    h1: { fg: 'cyan', bold: true },
    h2: { fg: 'blue', bold: true },
    code: { fg: 'green', bold: true },
    codeBlock: { fg: 'white', bg: 'black' },
    blockquote: { fg: 'gray', italic: true },
    link: { fg: 'blue', underline: true },
  },
});
```

## ⌨️ Keyboard Shortcuts

Built-in keyboard navigation:

- `↑` / `k` - Scroll up
- `↓` / `j` - Scroll down
- `Page Up` - Scroll up one page
- `Page Down` - Scroll down one page
- `Home` / `g` - Go to top
- `End` / `G` - Go to bottom
- `Escape` / `q` / `Ctrl+C` - Exit

## 📚 Examples

Check out the `examples/` directory for complete examples:

### Basic Example

```bash
yarn tsx examples/basic.ts
```

Shows static markdown rendering with various elements.

### Streaming Example

```bash
yarn tsx examples/streaming.ts
```

Simulates AI-like streaming of markdown content.

### Chat Example

```bash
yarn tsx examples/chat.ts
```

Interactive chat interface with streaming AI responses.

## 🔧 Development

```bash
# Install dependencies
yarn install

# Build
yarn build

# Watch mode
yarn dev

# Run examples
yarn example:basic
yarn example:streaming
yarn example:chat
```

## 📝 Markdown Support

Streamtty supports a wide range of markdown features:

### Basic Formatting

- **Bold**: `**text**` or `__text__`
- *Italic*: `*text*` or `_text_`
- `Inline code`: `` `code` ``
- ~~Strikethrough~~: `~~text~~`

### Headers

```markdown
# H1
## H2
### H3
#### H4
##### H5
###### H6
```

### Lists

```markdown
- Unordered list
- Items

1. Ordered list
2. Items
```

### Code Blocks

````markdown
```typescript
function hello(): void {
  console.log('Hello!');
}
```
````

### Blockquotes

```markdown
> This is a blockquote
> Multiple lines supported
```

### Links

```markdown
[Link text](https://example.com)
```

### Tables

```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
```

### Horizontal Rules

```markdown
---
```

### Task Lists

```markdown
- [x] Completed task
- [ ] Pending task
```

## 🆚 Streamdown vs Streamtty

| Feature | Streamdown | Streamtty |
|---------|-----------|-----------|
| Environment | React / Web | TTY / Terminal |
| Rendering | React Components | Blessed Widgets |
| Output | HTML/JSX | ANSI/Terminal |
| Use Case | Web Apps | CLI Tools / TUIs |
| Dependencies | React, ReactDOM | Blessed, Marked |

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT © [Your Name]

## 🙏 Credits

- Inspired by [Streamdown](https://github.com/vercel/streamdown) by Vercel
- Built with [blessed](https://github.com/chjj/blessed)
- Markdown parsing by [marked](https://github.com/markedjs/marked)

## 🔗 Links

- [Streamdown](https://github.com/vercel/streamdown) - The web/React version
- [blessed](https://github.com/chjj/blessed) - Terminal UI library
- [marked](https://github.com/markedjs/marked) - Markdown parser

---

Made with ❤️ for the terminal
