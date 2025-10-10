#!/usr/bin/env node
import { Streamtty } from './dist';

const markdown = `This is *italic* and **bold** text.`;

console.log('Testing italic formatting...');
console.log('Input:', markdown);

// Create Streamtty instance
const streamtty = new Streamtty({
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: false,
});

// Set the content
streamtty.setContent(markdown);

// Get the content to see what was parsed
const content = streamtty.getContent();
console.log('Parsed content:', content);

// Focus the container
streamtty.getContainer().focus();

// Exit after 2 seconds
setTimeout(() => {
  streamtty.destroy();
  process.exit(0);
}, 2000);