#!/usr/bin/env node
/**
 * Enterprise Streaming Example
 * Demonstrates full Streamdown parity features for CLI agents:
 * - Real-time streaming with progress
 * - Math rendering (Unicode)
 * - Mermaid diagrams (ASCII)
 * - Code highlighting (Shiki)
 * - Tables with formatting
 * - Security & sanitization
 */

import { Streamtty } from '../src';
import {
  StreamStatsTracker,
  ProgressReporter,
} from '../src/streaming/stream-stats';
import { StreamIndicator } from '../src/widgets/stream-indicator';
import {
  PluginRegistry,
  mathPlugin,
  mermaidPlugin,
  securityPlugin,
  syntaxHighlightPlugin,
} from '../src/plugins/plugin-system-inline';

// Example AI streaming response with various features
const EXAMPLE_RESPONSE = `# AI Analysis Report

## Executive Summary

The system analyzed **1,247 data points** with 94.2% accuracy using advanced machine learning.

### Key Findings

\`\`\`typescript
interface AnalysisResult {
  accuracy: number;    // 0.942
  totalPoints: number; // 1247
  timestamp: Date;
}

const result: AnalysisResult = {
  accuracy: 0.942,
  totalPoints: 1247,
  timestamp: new Date(),
};

console.log('✓ Analysis complete');
\`\`\`

## Mathematical Formula

For quadratic equations: $ax^2 + bx + c = 0$

Using the formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$

## Process Flowchart

\`\`\`mermaid
graph TD
    A[Start Analysis] --> B{Data Valid?}
    B -->|Yes| C[Process Data]
    B -->|No| D[Log Error]
    C --> E[Calculate Results]
    E --> F[Generate Report]
    F --> G[End]
    D --> G
\`\`\`

## Results Table

| Metric | Value | Status |
|--------|-------|--------|
| Processing Time | 2.3s | ✓ Optimal |
| Memory Usage | 145 MB | ✓ Normal |
| Data Accuracy | 94.2% | ✓ Excellent |
| Error Rate | 5.8% | ⚠ Monitor |

## Recommendations

1. **Immediate Action**
   - Review error cases to improve accuracy
   - Consider ensemble methods for better predictions

2. **Long-term Strategy**
   - Scale to 10,000+ data points
   - Implement real-time processing
   - Add advanced visualization

> **Note**: All metrics are within acceptable thresholds.
> Performance can be improved by 15% with parameter tuning.

---

**Report generated**: 2025-01-18 • **Status**: ✓ Complete`;

/**
 * Main demo function
 */
async function main() {
  console.log('🚀 StreamTTY Enterprise Demo\n');
  console.log('Showcasing Streamdown parity features...\n');

  // Create stats tracker
  const stats = new StreamStatsTracker();
  const indicator = new StreamIndicator({
    prefix: '▸',
    showBar: true,
    showStats: true,
  });

  // Create plugin registry
  const registry = new PluginRegistry();
  registry.register(securityPlugin);
  registry.register(mathPlugin);
  registry.register(mermaidPlugin);
  registry.register(syntaxHighlightPlugin);

  await registry.init();

  // Create Streamtty instance
  const streamtty = new Streamtty({
    parseIncompleteMarkdown: true,
    syntaxHighlight: true,
    autoScroll: true,
    theme: 'dark',
  });

  console.log('📝 Starting streaming simulation...\n');

  // Show initial progress indicator
  indicator.show('Streaming response');

  // Simulate chunked streaming
  let processedLength = 0;
  const chunkSize = 50;
  let chunkCount = 0;

  while (processedLength < EXAMPLE_RESPONSE.length) {
    const chunk = EXAMPLE_RESPONSE.slice(processedLength, processedLength + chunkSize);
    processedLength += chunk.length;
    chunkCount++;

    // Process through plugin system
    const processedChunk = await registry.executeChunk(chunk);

    // Stream to renderer
    await streamtty.stream(processedChunk);

    // Update stats
    const bytes = Buffer.byteLength(chunk, 'utf-8');
    stats.recordChunk(bytes);

    // Update progress indicator
    const pct = Math.round((processedLength / EXAMPLE_RESPONSE.length) * 100);
    const progressBar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    const throughput = stats.getStats().throughputBytesPerSec.toFixed(1);

    indicator.update(`Streaming response`, {
      progress: processedLength,
      total: EXAMPLE_RESPONSE.length,
      stats: `${pct}% • [${progressBar}] • ${throughput} B/s`,
    });

    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  // Complete streaming
  indicator.complete('✓ Streaming complete');

  // Final render
  await streamtty.render();

  // Print stats
  const finalStats = stats.getStats();
  console.log('\n' + '─'.repeat(60));
  console.log('📊 Streaming Statistics');
  console.log('─'.repeat(60));
  console.log(`Chunks Received:    ${finalStats.chunksReceived}`);
  console.log(`Total Bytes:        ${(finalStats.bytesReceived / 1024).toFixed(2)} KB`);
  console.log(`Elapsed Time:       ${(finalStats.elapsedMs / 1000).toFixed(2)}s`);
  console.log(`Average Throughput: ${finalStats.throughputBytesPerSec.toFixed(1)} B/s`);
  console.log('─'.repeat(60));

  console.log('\n💡 Features Demonstrated:');
  console.log('  ✓ Markdown parsing with incomplete block handling');
  console.log('  ✓ Math rendering: LaTeX → Unicode (E=mc²)');
  console.log('  ✓ Mermaid diagrams: flowchart → ASCII art');
  console.log('  ✓ Syntax highlighting: TypeScript code');
  console.log('  ✓ Table formatting: with borders & alignment');
  console.log('  ✓ Security: ANSI sanitization & validation');
  console.log('  ✓ Plugin system: extensible architecture');
  console.log('\n✨ Press Ctrl+C to exit\n');

  // Keep screen open
  streamtty.getScreen().render();
}

// Run demo
main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
