#!/usr/bin/env npx tsx

import { Streamtty } from '../src';

const testContent = `
# Enhanced Streamtty Test

This test demonstrates the new simplified **visual-only** streamtty capabilities.

## Features Tested

1. **Mermaid Diagrams** (with mermaid-ascii integration)
2. **Enhanced Tables** (with tty-table)
3. **ASCII Charts** (with asciichart)
4. **Syntax Highlighting**

## Mermaid Diagram Test

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

## Table Test

| Feature | Status | Performance |
|---------|--------|-------------|
| Mermaid | ✅ | Excellent |
| Tables | ✅ | Fast |
| Charts | ✅ | Good |
| Interactive | ❌ | Disabled |

## Code Block Test

\`\`\`typescript
// Enhanced streaming with visual-only features
const streamtty = new Streamtty({
  enhancedFeatures: {
    mermaid: true,
    advancedTables: true,
    interactiveControls: false // Visual-only!
  }
});

async function streamContent(content: string) {
  await streamtty.stream(content);
  await streamtty.render();
}
\`\`\`

## Chart Data Test (CSV)

\`\`\`
Month,Sales,Growth
Jan,100,5
Feb,120,20
Mar,110,-8
Apr,140,27
May,155,11
\`\`\`

## Link and Path Test

Check out [GitHub](https://github.com) and local file at \`/path/to/file.ts\`.

---

**Test completed!** 🎉
`;

async function runTest() {
  console.log('🚀 Starting Enhanced Streamtty Test...\n');

  try {
    const streamtty = new Streamtty({
      parseIncompleteMarkdown: true,
      syntaxHighlight: true,
      autoScroll: true,
      maxWidth: 100,
      gfm: true,
      enhancedFeatures: {
        math: true,
        mermaid: true,
        shiki: true,
        security: true,
        interactiveControls: false, // No interactive features
        advancedTables: true,
      },
      theme: 'dark',
    });

    // Simulate streaming by chunking the content
    const chunks = testContent.split('\n\n');

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] + '\n\n';

      console.log(`📦 Streaming chunk ${i + 1}/${chunks.length}...`);
      await streamtty.stream(chunk);

      // Small delay to simulate real streaming
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log('\n✅ Test completed successfully!');
    console.log('\nPress Ctrl+C to exit...');

    // Keep the screen alive
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Run the test
runTest().catch(console.error);