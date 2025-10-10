#!/usr/bin/env node
import { Streamtty } from '../src';

const markdown = `
# Streamtty Demo

This is a **bold** statement and this is *italic*.

## Code Example

Here's some inline \`code\` and a code block:

\`\`\`typescript
function hello(name: string): void {
  console.log(\`Hello, \${name}!\`);
}

hello('World');
\`\`\`

## Lists

Unordered list:
- First item
- Second item
  - Nested item
- Third item

Ordered list:
1. First
2. Second
3. Third

## Blockquote

> This is a blockquote.
> It can span multiple lines.

## Links and More

Check out [Streamtty](https://github.com) for more info!

---

## Table

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data 1   | Data 2   | Data 3   |
| Data 4   | Data 5   | Data 6   |

~~Strikethrough text~~ is also supported!

## Task List

- [x] Completed task
- [ ] Pending task
- [ ] Another pending task

---

Press 'q' or 'Escape' to quit.
Use arrow keys or j/k to scroll.
`;

// Create Streamtty instance
const streamtty = new Streamtty({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: false,
});

// Set the content
streamtty.setContent(markdown);

// Focus the container
streamtty.getContainer().focus();
