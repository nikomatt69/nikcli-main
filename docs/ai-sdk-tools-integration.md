# AI SDK Tool Integration Guide

This document describes how NikCLI tools are integrated with AI SDK v4 tool calling system.

## Overview

NikCLI uses an adapter pattern to convert `BaseTool` instances from the `ToolRegistry` into AI SDK `CoreTool` format. This allows all registered tools to be used seamlessly with AI SDK's `generateText` and `streamText` functions.

## Architecture

### Components

1. **BaseTool** (`src/cli/tools/base-tool.ts`)
   - Abstract base class for all NikCLI tools
   - Defines `execute()` method signature
   - Provides path safety validation

2. **ToolRegistry** (`src/cli/tools/tool-registry.ts`)
   - Manages registration and discovery of tools
   - Stores tool metadata (risk level, category, tags)
   - Provides filtering and validation

3. **AI SDK Tool Adapter** (`src/cli/tools/ai-sdk-tool-adapter.ts`)
   - Converts `BaseTool` → AI SDK `CoreTool`
   - Handles parameter schema mapping
   - Serializes tool results for AI SDK

4. **Modern AI Provider** (`src/cli/ai/modern-ai-provider.ts`)
   - Integrates adapter with AI SDK
   - Manages tool selection and filtering
   - Handles multi-step tool calls

## Usage

### Basic Integration

```typescript
import { convertToolRegistryToAISDKTools } from '../tools/ai-sdk-tool-adapter'
import { ToolRegistry } from '../tools/tool-registry'

// Create registry
const registry = new ToolRegistry(workingDirectory)

// Convert to AI SDK tools
const tools = convertToolRegistryToAISDKTools(registry)

// Use with AI SDK
const result = await generateText({
  model: yourModel,
  tools,
  prompt: 'Find all TypeScript files',
  maxSteps: 5, // Enable multi-step tool calls
})
```

### Filtering Tools

```typescript
import { filterToolsByCriteria } from '../tools/ai-sdk-tool-adapter'

// Get only low-risk filesystem tools
const safeTools = filterToolsByCriteria(tools, registry, {
  maxRiskLevel: 'low',
  categories: ['filesystem'],
  excludeTags: ['dangerous'],
})
```

### Using Custom Parameter Schemas

```typescript
import { z } from 'zod'
import type { ToolParameterSchema } from '../tools/ai-sdk-tool-adapter'

// Define custom schemas for specific tools
const customSchemas: ToolParameterSchema = {
  'my-custom-tool': z.object({
    param1: z.string(),
    param2: z.number(),
  }),
}

const tools = convertToolRegistryToAISDKTools(registry, customSchemas)
```

## Features

### Multi-Step Tool Calls

AI SDK supports multi-step tool calls via `maxSteps`. When enabled, the model can:
1. Call a tool
2. Receive the result
3. Call another tool based on the result
4. Generate a final text response

```typescript
const result = await generateText({
  model,
  tools,
  prompt: 'Read package.json and install dependencies',
  maxSteps: 10, // Allow up to 10 tool call steps
})
```

### Tool Choice Control

Control when tools are used:

```typescript
// Force tool usage
toolChoice: 'required'

// Disable tools
toolChoice: 'none'

// Force specific tool
toolChoice: { type: 'tool', toolName: 'read-file-tool' }

// Let model decide (default)
toolChoice: 'auto'
```

### Active Tools (Performance Optimization)

Limit available tools to improve performance:

```typescript
experimental_activeTools: ['read-file-tool', 'find-files-tool']
```

This is automatically set based on `selectActiveTools()` which analyzes the user's message and selects relevant tools.

### Tool Call Repair

Automatically fix invalid tool calls:

```typescript
experimental_repairToolCall: async ({ toolCall, tools, error }) => {
  // Custom repair logic
  // Returns repaired tool call or null to skip
}
```

The default repair handler uses a stronger model to fix invalid arguments.

## Parameter Schema Mapping

Tools can define their parameter schemas in several ways:

1. **Explicit Schema Export**: Tool exports a Zod schema
   ```typescript
   export const MyToolParamsSchema = z.object({ ... })
   ```

2. **Default Schemas**: Adapter includes default schemas for common tools
   - `find-files-tool`: pattern + options
   - `read-file-tool`: filePath + options
   - `write-file-tool`: filePath + content + options
   - etc.

3. **Inferred Schemas**: Adapter infers schema from tool name patterns
   - Tools with "read"/"write"/"file" → filePath pattern
   - Tools with "find"/"search" → pattern pattern
   - Default → empty object

## Result Serialization

Tool results are automatically serialized to ensure JSON compatibility:
- Primitives → as-is
- Arrays → recursively serialized
- Objects → recursively serialized
- Buffers → base64 encoded
- Dates → ISO strings
- Errors → error message object

## Error Handling

The adapter handles errors gracefully:
- Tool execution errors → returns `{ success: false, error: message }`
- Invalid arguments → caught and returned as error
- Non-serializable results → serialized with fallback

## Examples

### Example 1: Simple File Read

```typescript
const tools = convertToolRegistryToAISDKTools(registry)

const result = await generateText({
  model: openai('gpt-4'),
  tools,
  prompt: 'Read the contents of src/index.ts',
  maxSteps: 3,
})

// Model will:
// 1. Call read-file-tool with { filePath: 'src/index.ts' }
// 2. Receive file contents
// 3. Generate response with file contents
```

### Example 2: Multi-Tool Workflow

```typescript
const result = await generateText({
  model,
  tools,
  prompt: 'Find all test files and show their structure',
  maxSteps: 10,
  toolChoice: 'required', // Force tool usage
})

// Model will:
// 1. Call find-files-tool with pattern: '**/*.test.ts'
// 2. Call read-file-tool for each found file
// 3. Call tree-tool to show structure
// 4. Generate summary response
```

### Example 3: Filtered Tools

```typescript
// Only allow read operations
const readOnlyTools = filterToolsByCriteria(tools, registry, {
  categories: ['filesystem'],
  excludeTags: ['write', 'delete', 'modify'],
})

const result = await generateText({
  model,
  tools: readOnlyTools,
  prompt: 'Analyze the codebase structure',
})
```

## Configuration

Tool behavior can be configured via `config-manager.ts`:

```typescript
// Model configuration
{
  toolChoice: 'auto' | 'none' | 'required' | { type: 'tool', toolName: string }
  parallelToolCalls: boolean // Enable parallel tool execution
  maxSteps: number // Maximum tool call steps
}
```

## Best Practices

1. **Use Active Tools**: Limit tools to relevant ones for better performance
2. **Set Appropriate maxSteps**: Consider task complexity (3-10 steps typical)
3. **Filter by Risk**: Use `filterToolsByCriteria` to restrict dangerous operations
4. **Custom Schemas**: Define explicit schemas for complex tools
5. **Error Handling**: Always check `result.success` in tool results
6. **Tool Choice**: Use `'required'` when tools are essential, `'auto'` otherwise

## References

- [AI SDK Tool Calling Documentation](https://v4.ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK Agents Guide](https://ai-sdk.dev/docs/agents)
- [OpenRouter Tool Calling](https://openrouter.ai/docs/guides/features/tool-calling)

