#!/usr/bin/env node
import { Streamtty } from './dist';

const markdown = `
# Test Italic Formatting

This is a test of **bold** and *italic* text formatting.

## Mixed Formatting

Here's some *italic text* and **bold text** in the same line.

You can also use _underscores_ for *italic* and __double underscores__ for **bold**.

## Code and Links

Here's some \`inline code\` and a [link](https://example.com).

## Strikethrough

~~This text is strikethrough~~ and this is normal.

## Complex Example

This paragraph has *italic*, **bold**, \`code\`, and [links](https://example.com) all mixed together.

---

Press 'q' or 'Escape' to quit.
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