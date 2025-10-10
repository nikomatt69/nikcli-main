#!/usr/bin/env node
import { Streamtty } from './index';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);

function showHelp(): void {
  console.log(`
Streamtty - TTY Markdown Streaming Renderer

Usage:
  streamtty [options] [file]

Options:
  -h, --help              Show this help message
  -v, --version           Show version
  -s, --stream            Enable streaming mode (simulates AI-like streaming)
  --no-incomplete         Disable incomplete markdown parsing
  --no-syntax             Disable syntax highlighting
  --no-scroll             Disable auto-scroll
  -w, --width <number>    Set max width (default: 120)

Examples:
  streamtty document.md                 # Render markdown file
  streamtty -s document.md              # Render with streaming simulation
  cat README.md | streamtty             # Read from stdin
  echo "# Hello **World**" | streamtty  # Quick render

Keyboard Controls:
  ↑/k         Scroll up
  ↓/j         Scroll down
  PageUp      Scroll page up
  PageDown    Scroll page down
  Home/g      Go to top
  End/G       Go to bottom
  q/Esc       Quit
`);
}

function showVersion(): void {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf-8')
  );
  console.log(`streamtty v${packageJson.version}`);
}

async function main(): Promise<void> {
  // Parse args
  const options = {
    stream: false,
    parseIncomplete: true,
    syntaxHighlight: true,
    autoScroll: true,
    maxWidth: 120,
    file: null as string | null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
      
      case '-v':
      case '--version':
        showVersion();
        process.exit(0);
        break;
      
      case '-s':
      case '--stream':
        options.stream = true;
        break;
      
      case '--no-incomplete':
        options.parseIncomplete = false;
        break;
      
      case '--no-syntax':
        options.syntaxHighlight = false;
        break;
      
      case '--no-scroll':
        options.autoScroll = false;
        break;
      
      case '-w':
      case '--width':
        i++;
        options.maxWidth = parseInt(args[i], 10);
        break;
      
      default:
        if (!arg.startsWith('-')) {
          options.file = arg;
        }
    }
  }

  // Read content
  let content: string;
  
  if (options.file) {
    // Read from file
    try {
      content = fs.readFileSync(options.file, 'utf-8');
    } catch (error) {
      console.error(`Error reading file: ${options.file}`);
      process.exit(1);
    }
  } else if (!process.stdin.isTTY) {
    // Read from stdin
    const chunks: Buffer[] = [];
    
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    
    content = Buffer.concat(chunks).toString('utf-8');
  } else {
    // No input provided
    console.error('Error: No input provided. Use --help for usage information.');
    process.exit(1);
  }

  // Create Streamtty instance
  const streamtty = new Streamtty({
    parseIncompleteMarkdown: options.parseIncomplete,
    syntaxHighlight: options.syntaxHighlight,
    autoScroll: options.autoScroll,
    maxWidth: options.maxWidth,
  });

  // Render content
  if (options.stream) {
    // Simulate streaming
    let index = 0;
    const streamInterval = setInterval(() => {
      if (index < content.length) {
        const chunkSize = Math.floor(Math.random() * 10) + 1;
        const chunk = content.slice(index, index + chunkSize);
        streamtty.stream(chunk);
        index += chunkSize;
      } else {
        clearInterval(streamInterval);
      }
    }, 50);

    // Handle cleanup
    process.on('SIGINT', () => {
      clearInterval(streamInterval);
      streamtty.destroy();
      process.exit(0);
    });
  } else {
    // Render all at once
    streamtty.setContent(content);
  }
}

// Run CLI
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
