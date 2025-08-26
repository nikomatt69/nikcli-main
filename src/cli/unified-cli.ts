import { autonomousClaudeInterface } from './chat/autonomous-claude-interface';

/**
 * Unified CLI Entry Point
 * Provides Claude Code-style autonomous terminal interface
 */


async function main() {
  try {
    autonomousClaudeInterface.start();
  } catch (error) {
    console.error('Failed to start autonomous interface:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  autonomousClaudeInterface.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  autonomousClaudeInterface.stop();
  process.exit(0);
});

// Start the CLI
main();