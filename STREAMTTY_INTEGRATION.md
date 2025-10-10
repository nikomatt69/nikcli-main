# Streamtty Native Integration

## Overview
NikCLI now uses streamtty natively for all streaming output. All AI chunks, tool calls, system messages, and UI updates are rendered through streamtty for consistent markdown formatting.

## Architecture

### Centralized Rendering Service
**File:** `src/cli/services/streamtty-service.ts`

The `StreamttyService` is a singleton that manages all terminal rendering:
- Handles AI streaming chunks (`text_delta` events)
- Renders tool calls, thinking, and system messages
- Supports both blessed (TUI) and stdout modes
- Provides graceful fallback when TTY unavailable
- Tracks rendering statistics

### Key Components

#### 1. StreamttyService
- **Location:** `src/cli/services/streamtty-service.ts`
- **Methods:**
  - `streamChunk(chunk, type)`: Stream individual chunks with type metadata
  - `renderBlock(content, type)`: Render complete blocks
  - `createStreamRenderer()`: Create streaming generators
  - `getStats()`: Get rendering statistics

#### 2. AdvancedUI Integration
- **Location:** `src/cli/ui/advanced-cli-ui.ts`
- **Changes:**
  - All `logInfo()`, `logError()`, `logWarning()`, `logSuccess()` now route through streamttyService
  - `logFunctionCall()` and `logFunctionUpdate()` output markdown-formatted content
  - `printLiveUpdate()` formats updates as markdown lists

#### 3. AI Providers
- **AdvancedAIProvider** (`src/cli/ai/advanced-ai-provider.ts`):
  - `text_delta` events yield raw markdown
  - Removed `chunkText()` method - streamtty handles chunking
  - All cached responses streamed through streamttyService
  
- **ModelProvider** (`src/cli/ai/model-provider.ts`):
  - Reasoning summaries formatted as markdown blockquotes
  - Streamed through streamttyService before main content

- **ModernAIProvider** (`src/cli/ai/modern-ai-provider.ts`):
  - Reasoning output formatted as markdown
  - Integrated with streamttyService

#### 4. Orchestrators
- **StreamingOrchestrator** (`src/cli/streaming-orchestrator.ts`):
  - `displayMessage()` formats all message types as markdown
  - Panel displays rendered as markdown cards
  - VM messages streamed directly through streamttyService

- **NikCLI** (`src/cli/nik-cli.ts`):
  - All AI streaming loops use streamttyService
  - VM command output routed through streamttyService
  - Removed OutputFormatter.formatFinalOutput calls during streaming

#### 5. Planning Systems
- **EnhancedPlanning** (`src/cli/planning/enhanced-planning.ts`):
  - Execution summaries formatted as markdown tables
  - Statistics displayed as markdown
  - Error messages rendered through streamttyService

- **PlanExecutor** (`src/cli/planning/plan-executor.ts`):
  - Plan approval displays formatted as markdown
  - Execution summaries as markdown reports
  - Step execution logged through streamttyService

#### 6. Chat Systems
- **AutonomousClaudeInterface** (`src/cli/chat/autonomous-claude-interface.ts`):
  - Removed bridge pattern (createStringPushStream)
  - Direct streaming through streamttyService
  - All event types formatted as markdown

- **ChatInterface** (`src/cli/chat/chat-interface.ts`):
  - Replaced renderChatStreamToTerminal with streamttyService
  - Direct chunk-by-chunk streaming

## Migration Guide

### Before (Legacy)
```typescript
const bridge = createStringPushStream()
const renderPromise = renderChatStreamToTerminal(bridge.generator)

for await (const ev of stream) {
  if (ev.type === 'text_delta') {
    bridge.push(ev.content)
  }
}

bridge.end()
await renderPromise
```

### After (Streamtty Native)
```typescript
const { streamttyService } = await import('./services/streamtty-service')

for await (const ev of stream) {
  if (ev.type === 'text_delta') {
    await streamttyService.streamChunk(ev.content, 'ai')
  }
}
```

## Chunk Types

The service supports type metadata for appropriate formatting:
- `'ai'`: AI-generated content (raw markdown)
- `'tool'`: Tool calls and results (code blocks)
- `'thinking'`: Reasoning/thinking (blockquotes)
- `'system'`: System messages (info blockquotes)
- `'error'`: Errors (error blockquotes)
- `'user'`: User input (quote blocks)
- `'vm'`: VM/container output
- `'agent'`: Agent status messages

## Markdown Format Examples

### AI Content
```markdown
This is **bold** and *italic* text with `inline code`.

- List item 1
- List item 2

```code
function example() {}
```
```

### Tool Calls
```markdown
**readfile()**
  - ℹ Reading: src/example.ts
  - ✓ Completed
```

### System Messages
```markdown
> ℹ️ Initializing services...
> ✓ Services initialized
```

### Errors
```markdown
> ❌ **Error**
> Connection failed: timeout
```

## Benefits

1. **Consistent Formatting**: All output uses markdown, rendered uniformly
2. **Better UX**: Rich formatting (bold, italic, code blocks) in streaming
3. **Cleaner Code**: Single rendering path instead of multiple formatters
4. **Extensible**: Easy to add new chunk types or formatting rules
5. **Fallback Safe**: Graceful degradation when TTY unavailable

## Deprecated Components

- `src/cli/ui/streamdown-renderer.ts`: Kept for backward compatibility, marked deprecated
- `OutputFormatter.formatFinalOutput()`: Now just adds spacing, deprecated
- Bridge pattern (`createStringPushStream`): Replaced by direct streamttyService

## Layout Structure

```
┌─────────────────────────────────────────┐
│                                         │
│    AI Streaming Content Area            │
│    (rendered via streamttyService)      │
│    - Markdown formatted                 │
│    - Code blocks                        │
│    - Lists, tables, etc.                │
│                                         │
│                                         │
├─────────────────────────────────────────┤
│    Status Bar & Plan HUD (fixed)        │
│    Prompt Area (fixed)                  │
└─────────────────────────────────────────┘
```

The prompt area with status bar and plan HUD remains fixed at the bottom, while all streaming content flows through streamtty above it.

## Statistics

- **Files Modified:** 11
- **New Service:** 1 (streamtty-service.ts)
- **Deprecated Files:** 2 (streamdown-renderer.ts, parts of output-formatter.ts)
- **Integration Points:** 50+ streamttyService usages across codebase

## Testing Checklist

- [ ] AI text streaming renders markdown correctly
- [ ] Code blocks display with syntax highlighting
- [ ] Tool calls show as formatted blocks
- [ ] Error messages display as markdown alerts
- [ ] Status bar and prompt remain fixed at bottom
- [ ] Plan HUD works correctly with streaming above
- [ ] VM agent output renders properly
- [ ] Multiple agents coordinate without conflicts
- [ ] Fallback mode works when TTY unavailable

## Future Enhancements

1. Enable blessed mode for full TUI experience (currently stdout mode)
2. Add streaming progress indicators
3. Support for images and charts in markdown
4. Real-time diff rendering in streaming
5. Custom themes through streamtty styles

