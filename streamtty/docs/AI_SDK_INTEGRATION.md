# AI SDK Integration Guide

## Overview

Streamtty now features enterprise-level AI SDK compatibility, enabling seamless integration with AI-powered CLI agents, streaming LLM responses, and tool execution workflows. This guide explains how to use the AI SDK features in your terminal applications.

## Core Concepts

### Stream Events

Stream events are structured messages that represent different types of AI interactions:

```typescript
type StreamEventType =
  | "text_delta" // Streaming text chunks from AI
  | "tool_call" // Tool execution request from AI
  | "tool_result" // Tool execution result
  | "thinking" // AI reasoning/cognitive process
  | "reasoning" // Deep thinking mode
  | "start" // Stream start
  | "complete" // Stream complete
  | "error" // Error occurred
  | "status" // Status update
  | "step"; // Execution step
```

### Stream Event Structure

```typescript
interface StreamEvent {
  type: StreamEventType;
  content?: string;
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolResult?: any;
  metadata?: {
    timestamp?: number;
    duration?: number;
    agentId?: string;
    taskId?: string;
    [key: string]: any;
  };
}
```

## Quick Start

### Basic Usage

```typescript
import { Streamtty, StreamProtocol } from "streamtty";

// Create a streamtty instance
const renderer = new Streamtty();

// Stream AI text
await renderer.streamEvent(StreamProtocol.createTextDelta("Hello from AI!"));

// Stream a tool call
await renderer.streamEvent(
  StreamProtocol.createToolCall("read_file", { path: "test.txt" })
);

// Stream a tool result
await renderer.streamEvent(
  StreamProtocol.createToolResult("File content here...")
);

// Stream thinking process
await renderer.streamEvent(
  StreamProtocol.createThinking("Let me analyze this...")
);
```

### Streaming Multiple Events

```typescript
async function* generateAIStream(): AsyncGenerator<StreamEvent> {
  yield StreamProtocol.createStatus("Starting...", "running");
  yield StreamProtocol.createThinking("Analyzing the request...");
  yield StreamProtocol.createTextDelta("I need to read the file first.\n\n");
  yield StreamProtocol.createToolCall("read_file", { path: "config.json" });
  yield StreamProtocol.createToolResult({ success: true, content: "..." });
  yield StreamProtocol.createTextDelta("Based on the configuration...\n\n");
  yield StreamProtocol.createStatus("Complete", "completed");
}

// Stream all events
const renderer = new Streamtty();
await renderer.streamEvents(generateAIStream());
```

## Streamdown-Compatible API

For developers familiar with Vercel's Streamdown, we provide a compatible API:

```typescript
import { createStreamRenderer } from "streamtty/streamdown-compat";

const renderer = createStreamRenderer({
  formatToolCalls: true,
  showThinking: true,
  renderTimestamps: false,
});

// Append text
renderer.append("Hello world\n");

// Append structured events
await renderer.appendStructured({
  type: "tool_call",
  toolName: "search",
  toolArgs: { query: "typescript" },
});

// Handle events
renderer.on("chunk", (chunk) => {
  console.log("Received:", chunk);
});

renderer.on("complete", () => {
  console.log("Streaming complete");
});

// Complete and cleanup
renderer.complete();
renderer.destroy();
```

### Utility Streamers

```typescript
import {
  createAIStreamer,
  createTextStreamer,
  createDebugStreamer,
} from "streamtty/streamdown-compat";

// AI-optimized renderer with tool formatting
const aiRenderer = createAIStreamer({
  formatToolCalls: true,
  showThinking: true,
  maxToolResultLength: 200,
});

// Simple text streamer
const textRenderer = createTextStreamer();

// Debug renderer with timestamps
const debugRenderer = createDebugStreamer({
  renderTimestamps: true,
});
```

## Advanced Features

### Event Validation

```typescript
import { StreamProtocol } from "streamtty";

const event = {
  type: "tool_call",
  toolName: "read_file",
  toolArgs: { path: "test.txt" },
};

if (StreamProtocol.validateEvent(event)) {
  await renderer.streamEvent(event);
} else {
  console.error("Invalid event");
}
```

### Event Transformation

```typescript
// Add timestamps and metadata
const transformed = StreamProtocol.transformEvent(event);

// Create events with metadata
const eventWithMeta = StreamProtocol.createToolCall(
  "read_file",
  { path: "test.txt" },
  { agentId: "agent-001", taskId: "task-123" }
);
```

### Event Filtering

```typescript
import { StreamProtocol } from "streamtty";

// Check if event should be rendered
const options = { showThinking: false };
if (StreamProtocol.shouldRenderEvent(event, options)) {
  await renderer.streamEvent(event);
}
```

### Custom Formatting Options

```typescript
const renderer = new Streamtty();

// Update AI SDK options
renderer.updateAIOptions({
  formatToolCalls: true,
  showThinking: false,
  maxToolResultLength: 500,
  renderTimestamps: true,
});

// Get current options
const options = renderer.getAIOptions();
```

## Integration Examples

### CLI Agent Integration

```typescript
import { Streamtty, StreamProtocol } from "streamtty";

async function runAgent(userMessage: string) {
  const renderer = new Streamtty();

  // Start agent
  await renderer.streamEvent(
    StreamProtocol.createStatus("Agent starting...", "running")
  );

  // Agent thinks
  await renderer.streamEvent(
    StreamProtocol.createThinking("Analyzing your request...")
  );

  // Agent responds
  await renderer.streamEvent(
    StreamProtocol.createTextDelta("I understand you want to...\n\n")
  );

  // Agent uses a tool
  await renderer.streamEvent(
    StreamProtocol.createToolCall("search", { query: "typescript docs" })
  );

  // Tool returns result
  await renderer.streamEvent(
    StreamProtocol.createToolResult({
      found: true,
      results: ["doc1.md", "doc2.md"],
    })
  );

  // Agent completes
  await renderer.streamEvent(
    StreamProtocol.createStatus("Task complete", "completed")
  );
}
```

### Stream Processing Pipeline

```typescript
async function processAIStream(
  stream: AsyncGenerator<StreamEvent>
): Promise<string> {
  const renderer = new Streamtty();
  let fullText = "";

  for await (const event of stream) {
    await renderer.streamEvent(event);

    if (event.type === "text_delta" && event.content) {
      fullText += event.content;
    }
  }

  return fullText;
}
```

### Error Handling

```typescript
import { StreamProtocol, StreamttyAISDKError } from "streamtty";

try {
  await renderer.streamEvent(event);
} catch (error) {
  if (error instanceof StreamttyAISDKError) {
    console.error("AI SDK Error:", error.event, error.code);

    // Send error event
    await renderer.streamEvent(
      StreamProtocol.createError(error.message, error)
    );
  }
}
```

## Tool Call Formatting

Tool calls are automatically formatted with icons and syntax highlighting:

### Supported Tools

The renderer automatically selects appropriate icons for common tools:

- `read_file` → 📖
- `write_file` → ✏️
- `search` → 🔍
- `run_command` → ⚡
- `web_search` → 🌐
- `create_file` → 📄
- `delete_file` → 🗑️
- `list_files` → 📁
- `grep` → 🔎
- `git` → 🌿
- `npm` → 📦
- `docker` → 🐳

### Custom Tool Rendering

````typescript
// Tool calls are rendered as:
// 🔧 **tool_name**
// ```json
// {
//   "arg1": "value1",
//   "arg2": "value2"
// }
// ```

// Tool results are rendered as:
// ✓ **Result**: preview of result (truncated to maxToolResultLength)
````

## Performance Considerations

### Event Batching

For high-frequency streams, batch events for better performance:

```typescript
const events = [];
for await (const event of highFrequencyStream) {
  events.push(event);

  if (events.length >= 10) {
    // Process batch
    for (const e of events) {
      await renderer.streamEvent(e);
    }
    events.length = 0;
  }
}
```

### Memory Management

```typescript
// Cleanup when done
renderer.destroy();

// Or use try-finally
try {
  await renderer.streamEvents(stream);
} finally {
  renderer.destroy();
}
```

## Best Practices

1. **Always validate events** before streaming to prevent runtime errors
2. **Use StreamProtocol factory methods** for consistent event creation
3. **Handle errors gracefully** with error events
4. **Clean up resources** with `destroy()` when done
5. **Batch events** for high-frequency streams
6. **Use metadata** to track event context (agentId, taskId, etc.)
7. **Respect showThinking option** for user preferences
8. **Truncate large results** to avoid overwhelming output

## API Reference

See [API.md](./API.md) for complete API documentation.

## Migration Guide

See [MIGRATION.md](./MIGRATION.md) for migrating from other streaming libraries.

## Examples

See the `examples/` directory for more complete examples:

- `examples/ai-agent.ts` - Full AI agent implementation
- `examples/tool-streaming.ts` - Tool execution workflow
- `examples/custom-renderer.ts` - Custom event handling
- `examples/performance.ts` - High-performance streaming

## Support

For issues, questions, or contributions, please visit:
https://github.com/yourusername/streamtty
