# AI SDK Tool Adapter - Usage Examples

This document demonstrates how to use the AI SDK Tool Adapter to integrate NikCLI tools with AI SDK v4 tool calling.

## Overview

The AI SDK Tool Adapter (`src/cli/tools/ai-sdk-tool-adapter.ts`) converts NikCLI `BaseTool` instances into AI SDK `CoreTool` format, enabling seamless integration with AI SDK's `generateText` and `streamText` functions.

## Basic Usage

### Example 1: Using Tools from Registry

```typescript
import { modernAIProvider } from '../ai/modern-ai-provider'
import { type CoreMessage } from 'ai'

// Get tools from registry via adapter
const tools = modernAIProvider.getAISDKToolsFromRegistry()

// Use in AI SDK generateText
const result = await generateText({
  model: yourModel,
  messages: [
    { role: 'user', content: 'Find all TypeScript files in src/' }
  ],
  tools,
  maxSteps: 10, // Allow multiple tool calls
})

// Access tool results
for (const toolCall of result.toolCalls) {
  console.log(`Tool: ${toolCall.toolName}`)
  console.log(`Args:`, toolCall.args)
}
```

### Example 2: Filtering Tools by Risk Level

```typescript
// Only include low and medium risk tools
const safeTools = modernAIProvider.getAISDKToolsFromRegistry(undefined, {
  maxRiskLevel: 'medium',
  excludeCategories: ['system', 'blockchain'], // Exclude dangerous categories
})

const result = await generateText({
  model: yourModel,
  messages: messages,
  tools: safeTools,
  maxSteps: 5,
})
```

### Example 3: Using Specific Tools (Whitelist)

```typescript
// Only allow specific tools
const limitedTools = modernAIProvider.getToolsWithOptions({
  whitelist: ['read-file-tool', 'find-files-tool', 'glob-tool'],
  useRegistry: true,
})

const result = await generateText({
  model: yourModel,
  messages: messages,
  tools: limitedTools,
  maxSteps: 10,
})
```

### Example 4: Streaming with Tool Calls

```typescript
import { streamText } from 'ai'

const stream = await streamText({
  model: yourModel,
  messages: [
    { role: 'user', content: 'Read package.json and find all dependencies' }
  ],
  tools: modernAIProvider.getAISDKToolsFromRegistry(),
  maxSteps: 10,
})

for await (const chunk of stream.fullStream) {
  if (chunk.type === 'tool-call') {
    console.log(`Calling tool: ${chunk.toolCallName}`)
  } else if (chunk.type === 'tool-result') {
    console.log(`Tool result:`, chunk.result)
  } else if (chunk.type === 'text-delta') {
    process.stdout.write(chunk.textDelta)
  }
}
```

### Example 5: Using with ModernAIProvider's Built-in Methods

```typescript
// The provider automatically uses the adapter internally
const messages: CoreMessage[] = [
  { role: 'user', content: 'Search for files matching *.ts pattern' }
]

// Stream with automatic tool selection
for await (const event of modernAIProvider.streamChatWithTools(messages, {
  toolOptions: {
    maxRiskLevel: 'medium',
    maxTools: 5, // Active Tools Pattern - select 5 most relevant
    enableRepair: true, // Enable tool call repair
  }
})) {
  if (event.type === 'tool_call') {
    console.log(`Tool called: ${event.toolCall?.toolName}`)
  } else if (event.type === 'text') {
    process.stdout.write(event.content || '')
  }
}
```

### Example 6: Custom Parameter Schemas

```typescript
import { z } from 'zod'
import type { ToolParameterSchema } from '../tools/ai-sdk-tool-adapter'

// Define custom parameter schema for a tool
const customSchemas: ToolParameterSchema = {
  'read-file-tool': z.object({
    filePath: z.string().describe('Path to file'),
    options: z.object({
      maxLines: z.number().optional(),
      encoding: z.string().optional(),
    }).optional(),
  }),
}

// Use custom schemas
const tools = modernAIProvider.getAISDKToolsFromRegistry(customSchemas)
```

## Tool Call Repair

The adapter includes automatic tool call repair that attempts to fix invalid tool calls:

```typescript
// Repair is enabled by default
const result = await generateText({
  model: yourModel,
  messages: messages,
  tools: tools,
  experimental_repairToolCall: async ({ toolCall, error }) => {
    // Custom repair logic
    console.log(`Repairing tool call: ${toolCall.toolName}`)
    // The adapter provides a default repair handler
    return null // Return null to use default repair
  },
})
```

## Active Tools Pattern

The provider implements the Active Tools Pattern to intelligently select relevant tools:

```typescript
// Automatically selects 5 most relevant tools based on user message
const tools = modernAIProvider.getToolsWithOptions({
  maxTools: 5, // Limit to 5 tools for better performance
  useRegistry: true,
})

// The provider analyzes the user's message and selects tools like:
// - "read file" → selects read-file-tool
// - "search for" → selects find-files-tool, grep-tool
// - "execute command" → selects run-command-tool
```

## Error Handling

Tool execution errors are automatically handled and returned in a consistent format:

```typescript
const result = await generateText({
  model: yourModel,
  messages: messages,
  tools: tools,
})

// Check tool results
for (const toolResult of result.toolResults) {
  if (toolResult.result?.success === false) {
    console.error(`Tool ${toolResult.toolName} failed:`, toolResult.result.error)
  } else {
    console.log(`Tool ${toolResult.toolName} succeeded:`, toolResult.result.data)
  }
}
```

## Tool Metadata

Access tool metadata for better control:

```typescript
import { ToolRegistry } from '../tools/tool-registry'

const registry = new ToolRegistry(process.cwd())

// Get metadata for a specific tool
const metadata = registry.getToolMetadata('read-file-tool')
console.log(`Risk level: ${metadata?.riskLevel}`)
console.log(`Category: ${metadata?.category}`)
console.log(`Description: ${metadata?.description}`)

// List tools by category
const fileTools = registry.listToolsByCategory('filesystem')

// List tools by risk level
const safeTools = registry.listToolsByRiskLevel('low')
```

## Best Practices

1. **Use Active Tools Pattern**: Limit tools to 5-7 most relevant ones for better performance
2. **Filter by Risk Level**: Use `maxRiskLevel` to prevent dangerous operations
3. **Enable Repair**: Keep tool call repair enabled for better reliability
4. **Use Registry Tools**: Prefer registry tools over inline definitions for consistency
5. **Handle Errors**: Always check `success` field in tool results
6. **Set maxSteps**: Configure appropriate `maxSteps` based on task complexity

## Configuration

Configure tool behavior via `AIProviderOptions`:

```typescript
const options: AIProviderOptions = {
  toolOptions: {
    maxRiskLevel: 'medium',      // Only low/medium risk tools
    categories: ['filesystem'],   // Only filesystem tools
    excludeTags: ['experimental'], // Exclude experimental tools
    whitelist: ['read-file-tool'], // Only specific tools
    maxTools: 5,                  // Active Tools Pattern limit
    enableRepair: true,           // Enable repair
    useRegistry: true,            // Use registry via adapter
  },
}
```

## Testing

Test tool integration:

```typescript
// Test a specific tool
const findFilesTool = registry.getTool('find-files-tool')
const result = await findFilesTool.execute('*.ts', { cwd: './src' })

console.log(`Found ${result.data.length} files`)
console.log(`Success: ${result.success}`)
```

## Migration from Inline Tools

If you're currently using inline tool definitions, migrate to the adapter:

```typescript
// Before (inline)
const tools = {
  read_file: tool({
    description: 'Read file',
    parameters: z.object({ path: z.string() }),
    execute: async ({ path }) => { /* ... */ },
  }),
}

// After (adapter)
const tools = modernAIProvider.getAISDKToolsFromRegistry()
// All tools from registry are automatically available
```

## References

- [AI SDK Tool Calling Documentation](https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK Agents Best Practices](https://ai-sdk.dev/docs/agents)
- [Tool Call Repair](https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#tool-call-repair)
- [Active Tools Pattern](https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#active-tools)
