#!/usr/bin/env node
import blessed from 'blessed';
import { Streamtty } from '../src';

// Create screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'AI Chat Demo',
  fullUnicode: true,
});

// Create chat display area
const chatContainer = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: '100%',
  height: '100%-3',
  border: {
    type: 'line',
  },
  style: {
    border: {
      fg: 'cyan',
    },
  },
  label: ' Chat ',
  scrollable: true,
  alwaysScroll: true,
  keys: true,
  vi: true,
  mouse: true,
  scrollbar: {
    ch: '█',
    style: {
      fg: 'blue',
    },
  },
});

// Create input box
const inputBox = blessed.textbox({
  parent: screen,
  bottom: 0,
  left: 0,
  width: '100%',
  height: 3,
  border: {
    type: 'line',
  },
  style: {
    border: {
      fg: 'green',
    },
  },
  label: ' Your Message (Enter to send, Ctrl+C to quit) ',
  inputOnFocus: true,
});

// Create Streamtty instance for rendering messages
const streamtty = new Streamtty({
  screen,
  parseIncompleteMarkdown: true,
  syntaxHighlight: true,
  autoScroll: true,
});

// Override the container with our chat container
(streamtty as any).context.container = chatContainer;

// Sample AI responses
const aiResponses = [
  `Sure! Here's an example of **TypeScript**:

\`\`\`typescript
interface User {
  name: string;
  age: number;
}

const greet = (user: User): string => {
  return \`Hello, \${user.name}!\`;
};
\`\`\`

TypeScript adds *static typing* to JavaScript, making your code more robust.`,
  
  `Let me explain **markdown streaming**:

## Why Stream Markdown?

1. **Better UX** - Users see content as it generates
2. **Progressive Enhancement** - Content becomes readable immediately
3. **Performance** - No waiting for complete response

> The key challenge is handling *incomplete* markdown during streaming.

That's where **Streamtty** comes in!`,
  
  `Here are some **useful tips**:

- Use \`Ctrl+C\` to exit
- Scroll with arrow keys or *j/k*
- Press \`Home\` or \`g\` to go to top
- Press \`End\` or \`G\` to go to bottom

*Hope this helps!* 🚀`,
];

let messageCount = 0;

// Handle input submission
inputBox.on('submit', (text: string) => {
  if (!text.trim()) {
    inputBox.clearValue();
    inputBox.focus();
    return;
  }

  // Add user message
  const userMessage = `\n\n---\n\n**You:** ${text}\n\n`;
  streamtty.stream(userMessage);

  // Clear input
  inputBox.clearValue();
  inputBox.focus();

  // Simulate AI response with streaming
  setTimeout(() => {
    const aiMessage = `**AI:**\n\n`;
    streamtty.stream(aiMessage);

    // Get a response (cycle through responses)
    const response = aiResponses[messageCount % aiResponses.length];
    messageCount++;

    // Stream the response character by character
    let index = 0;
    const streamInterval = setInterval(() => {
      if (index < response.length) {
        const chunkSize = Math.floor(Math.random() * 5) + 1;
        const chunk = response.slice(index, index + chunkSize);
        streamtty.stream(chunk);
        index += chunkSize;
      } else {
        clearInterval(streamInterval);
      }
    }, 30);
  }, 500);
});

// Handle cancel
inputBox.on('cancel', () => {
  inputBox.clearValue();
  inputBox.focus();
});

// Setup key bindings
screen.key(['escape', 'C-c'], () => {
  return process.exit(0);
});

chatContainer.key(['up', 'k'], () => {
  chatContainer.scroll(-1);
  screen.render();
});

chatContainer.key(['down', 'j'], () => {
  chatContainer.scroll(1);
  screen.render();
});

chatContainer.key(['pageup'], () => {
  chatContainer.scroll(-(chatContainer.height as number));
  screen.render();
});

chatContainer.key(['pagedown'], () => {
  chatContainer.scroll(chatContainer.height as number);
  screen.render();
});

// Initial message
const welcomeMessage = `# Welcome to Streamtty Chat Demo! 🎉

This is an interactive chat demo showing **real-time markdown streaming**.

Type your message below and press Enter to send. The AI will respond with streamed markdown.

Try asking:
- "Show me some code"
- "Explain markdown streaming"
- "Give me some tips"

---

`;

streamtty.setContent(welcomeMessage);

// Focus input
inputBox.focus();

// Render screen
screen.render();
