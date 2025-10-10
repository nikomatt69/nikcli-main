#!/usr/bin/env node
import { Streamtty } from '../src';

const fullMarkdown = `# AI Streaming Demo

This demonstrates **real-time streaming** of markdown content, similar to how AI models generate text.

## What is Streamtty?

Streamtty is a *drop-in replacement* for markdown rendering in TTY environments. It's designed specifically for **AI-powered streaming**, handling incomplete markdown gracefully.

### Key Features

1. **Streaming-optimized** - Handles incomplete Markdown during generation
2. **Beautiful rendering** - Styled output with syntax highlighting
3. **Interactive** - Scroll, search, and navigate with ease

Here's a code example:

\`\`\`typescript
import { Streamtty } from 'streamtty';

const streamtty = new Streamtty();
streamtty.stream('# Hello ');
streamtty.stream('**World**!');
\`\`\`

> **Note**: Even if markdown is incomplete (like an unclosed \`**bold\` tag), Streamtty will render it beautifully.

---

## Technical Details

The parser handles various markdown elements:

- Headers (h1-h6)
- **Bold** and *italic* text
- \`Inline code\` and code blocks
- Lists (ordered and unordered)
- Blockquotes
- Tables
- Links and images
- Horizontal rules

### Performance

Streamtty is optimized for streaming with:
- Debounced rendering
- Incremental parsing
- Efficient blessed updates

---

*Streaming complete! Press 'q' to quit.*
`;

// Create Streamtty instance
const streamtty = new Streamtty({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
});

// Simulate streaming by sending characters one at a time
let index = 0;
const streamInterval = setInterval(() => {
  if (index < fullMarkdown.length) {
    // Stream in chunks (more realistic than char-by-char)
    const chunkSize = Math.floor(Math.random() * 10) + 1;
    const chunk = fullMarkdown.slice(index, index + chunkSize);
    streamtty.stream(chunk);
    index += chunkSize;
  } else {
    clearInterval(streamInterval);
  }
}, 50); // Stream at ~20 chunks per second

// Handle exit
process.on('SIGINT', () => {
  clearInterval(streamInterval);
  streamtty.destroy();
  process.exit(0);
});
