#!/usr/bin/env node
import { marked } from 'marked';

const markdown = `This is *italic* and **bold** text.`;

console.log('Testing marked.js parsing...');
console.log('Input:', markdown);

try {
  const tokens = marked.lexer(markdown);
  console.log('Parsed tokens:', JSON.stringify(tokens, null, 2));
  
  // Check if paragraph has tokens
  const paragraph = tokens[0] as any;
  if (paragraph && paragraph.tokens) {
    console.log('Paragraph tokens:', JSON.stringify(paragraph.tokens, null, 2));
  }
} catch (error) {
  console.error('Parsing error:', error);
}