/**
 * Example: Using AI SDK Tool Integration with NikCLI Tools
 * 
 * This example demonstrates how to use the AI SDK tool adapter
 * to convert NikCLI BaseTool instances into AI SDK tools.
 */

import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { ToolRegistry } from '../../src/cli/tools/tool-registry'
import {
  convertToolRegistryToAISDKTools,
  filterToolsByCriteria,
} from '../../src/cli/tools/ai-sdk-tool-adapter'

/**
 * Example 1: Basic tool usage with find-files-tool
 */
export async function example1_FindFiles() {
  const registry = new ToolRegistry(process.cwd())
  const tools = convertToolRegistryToAISDKTools(registry)

  const result = await generateText({
    model: openai('gpt-4'),
    tools,
    prompt: 'Find all TypeScript files in the src directory',
    maxSteps: 3,
  })

  console.log('Result:', result.text)
  console.log('Tool calls:', result.toolCalls)
  console.log('Tool results:', result.toolResults)
}

/**
 * Example 2: Multi-step workflow with read-file-tool
 */
export async function example2_ReadAndAnalyze() {
  const registry = new ToolRegistry(process.cwd())
  const tools = convertToolRegistryToAISDKTools(registry)

  const result = await generateText({
    model: openai('gpt-4'),
    tools,
    prompt: 'Read package.json and tell me what dependencies are installed',
    maxSteps: 5,
    toolChoice: 'required', // Force tool usage
  })

  console.log('Analysis:', result.text)

  // Access step-by-step execution
  for (const step of result.steps) {
    console.log(`Step ${step.stepType}:`, {
      toolCalls: step.toolCalls?.length || 0,
      tokens: step.usage?.totalTokens || 0,
    })
  }
}

/**
 * Example 3: Filtered tools for safety
 */
export async function example3_ReadOnlyTools() {
  const registry = new ToolRegistry(process.cwd())
  const allTools = convertToolRegistryToAISDKTools(registry)

  // Only allow read operations
  const readOnlyTools = filterToolsByCriteria(allTools, registry, {
    maxRiskLevel: 'low',
    categories: ['filesystem'],
    excludeTags: ['write', 'delete', 'modify'],
  })

  const result = await generateText({
    model: openai('gpt-4'),
    tools: readOnlyTools,
    prompt: 'Analyze the project structure and list all source files',
    maxSteps: 10,
  })

  console.log('Analysis:', result.text)
}

/**
 * Example 4: Web search integration
 */
export async function example4_WebSearch() {
  const registry = new ToolRegistry(process.cwd())
  const tools = convertToolRegistryToAISDKTools(registry)

  const result = await generateText({
    model: openai('gpt-4'),
    tools,
    prompt: 'Search for the latest TypeScript best practices and summarize them',
    maxSteps: 5,
    experimental_activeTools: ['web-search-tool'], // Only use web search
  })

  console.log('Summary:', result.text)
}

/**
 * Example 5: Custom tool selection based on message
 */
export async function example5_SmartToolSelection(userMessage: string) {
  const registry = new ToolRegistry(process.cwd())
  const allTools = convertToolRegistryToAISDKTools(registry)

  // Analyze message to select relevant tools
  const lowerMessage = userMessage.toLowerCase()
  let selectedTools: Record<string, any> = {}

  if (lowerMessage.includes('read') || lowerMessage.includes('show')) {
    selectedTools = filterToolsByCriteria(allTools, registry, {
      categories: ['filesystem'],
      tags: ['read'],
    })
  } else if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
    selectedTools = filterToolsByCriteria(allTools, registry, {
      categories: ['filesystem', 'search'],
      tags: ['search', 'glob'],
    })
  } else {
    // Default: use all low-risk tools
    selectedTools = filterToolsByCriteria(allTools, registry, {
      maxRiskLevel: 'medium',
    })
  }

  const result = await generateText({
    model: openai('gpt-4'),
    tools: selectedTools,
    prompt: userMessage,
    maxSteps: 10,
    experimental_activeTools: Object.keys(selectedTools),
  })

  return result
}

/**
 * Example 6: Error handling and tool call repair
 */
export async function example6_WithErrorHandling() {
  const registry = new ToolRegistry(process.cwd())
  const tools = convertToolRegistryToAISDKTools(registry)

  try {
    const result = await generateText({
      model: openai('gpt-4'),
      tools,
      prompt: 'Read the file at invalid/path/file.txt',
      maxSteps: 3,
      // Tool call repair is automatically enabled
      experimental_repairToolCall: async ({ toolCall, tools, error }) => {
        console.log('Tool call repair triggered:', {
          tool: toolCall.toolName,
          error: error.message,
        })
        // Return null to skip repair, or return repaired tool call
        return null
      },
    })

    // Check for tool execution errors
    for (const result of result.toolResults || []) {
      if (result.result && typeof result.result === 'object' && 'error' in result.result) {
        console.warn(`Tool ${result.toolName} failed:`, result.result.error)
      }
    }

    return result
  } catch (error: any) {
    console.error('Generation failed:', error.message)
    throw error
  }
}

// Run examples (commented out to avoid execution)
// example1_FindFiles()
// example2_ReadAndAnalyze()
// example3_ReadOnlyTools()
// example4_WebSearch()
// example5_SmartToolSelection('Find all test files in the project')

