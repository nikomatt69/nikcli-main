/**
 * NikCLI SDK - Agent Example
 * Example of creating and using custom agents
 */

import { initializeSDK, type AgentConfig, type CreateAgentTask } from '../src'

/**
 * Custom Agent Example
 * Demonstrates how to create and use custom agents
 */
export async function agentExample() {
  // Initialize SDK
  const sdk = await initializeSDK({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
    },
    enableAgents: true,
    enableStreaming: true,
  })

  // Create a custom agent
  const customAgent: AgentConfig = {
    id: 'custom-agent-1',
    name: 'Custom Agent',
    description: 'A custom agent for demonstration',
    specialization: 'general',
    capabilities: [
      {
        name: 'text-processing',
        description: 'Process and analyze text',
        version: '1.0.0',
        supportedTasks: ['analyze', 'summarize', 'translate'],
        performanceScore: 85,
        isActive: true,
      },
      {
        name: 'data-analysis',
        description: 'Analyze data and generate insights',
        version: '1.0.0',
        supportedTasks: ['analyze', 'visualize', 'report'],
        performanceScore: 90,
        isActive: true,
      },
    ],
    maxConcurrentTasks: 3,
    timeout: 300000,
    retryAttempts: 3,
    autonomyLevel: 'semi-autonomous',
    temperature: 0.7,
    maxTokens: 4000,
  }

  // Register the agent
  await sdk.registerAgent(customAgent)

  // Create a task
  const task: CreateAgentTask = {
    type: 'user_request',
    title: 'Analyze Text',
    description: 'Analyze the provided text and generate insights',
    priority: 'medium',
    data: {
      text: 'This is a sample text for analysis. It contains multiple sentences and should be processed to extract key insights.',
    },
    requiredCapabilities: ['text-processing'],
    estimatedDuration: 5000,
  }

  // Execute the task
  try {
    const taskId = await sdk.executeTask(task, customAgent.id)
    console.log(`Task scheduled with ID: ${taskId}`)

    // Wait for completion (in a real app, you'd use event listeners)
    await new Promise(resolve => setTimeout(resolve, 6000))

    // Get task history
    const history = sdk.getAgentManager().getTaskHistory()
    console.log('Task history:', history)

    // Get agent metrics
    const metrics = sdk.getAgentManager().getAgentMetrics(customAgent.id)
    console.log('Agent metrics:', metrics)

  } catch (error) {
    console.error('Task execution failed:', error)
  }

  // Cleanup
  await sdk.cleanup()
}

/**
 * Multi-Agent Example
 * Demonstrates using multiple agents for complex tasks
 */
export async function multiAgentExample() {
  const sdk = await initializeSDK({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
    },
    enableAgents: true,
    enableStreaming: true,
    maxConcurrentTasks: 5,
  })

  // Create multiple specialized agents
  const agents: AgentConfig[] = [
    {
      id: 'text-agent',
      name: 'Text Processing Agent',
      description: 'Specialized in text analysis and processing',
      specialization: 'text-processing',
      capabilities: [
        {
          name: 'text-analysis',
          description: 'Analyze text content',
          version: '1.0.0',
          supportedTasks: ['analyze', 'summarize', 'extract'],
          performanceScore: 95,
          isActive: true,
        },
      ],
      maxConcurrentTasks: 2,
      timeout: 300000,
      retryAttempts: 3,
      autonomyLevel: 'semi-autonomous',
    },
    {
      id: 'data-agent',
      name: 'Data Analysis Agent',
      description: 'Specialized in data analysis and visualization',
      specialization: 'data-analysis',
      capabilities: [
        {
          name: 'data-analysis',
          description: 'Analyze data and generate insights',
          version: '1.0.0',
          supportedTasks: ['analyze', 'visualize', 'report'],
          performanceScore: 90,
          isActive: true,
        },
      ],
      maxConcurrentTasks: 2,
      timeout: 300000,
      retryAttempts: 3,
      autonomyLevel: 'semi-autonomous',
    },
    {
      id: 'code-agent',
      name: 'Code Generation Agent',
      description: 'Specialized in code generation and review',
      specialization: 'code-generation',
      capabilities: [
        {
          name: 'code-generation',
          description: 'Generate and review code',
          version: '1.0.0',
          supportedTasks: ['generate', 'review', 'refactor'],
          performanceScore: 88,
          isActive: true,
        },
      ],
      maxConcurrentTasks: 2,
      timeout: 300000,
      retryAttempts: 3,
      autonomyLevel: 'semi-autonomous',
    },
  ]

  // Register all agents
  for (const agent of agents) {
    await sdk.registerAgent(agent)
  }

  // Create multiple tasks
  const tasks: CreateAgentTask[] = [
    {
      type: 'user_request',
      title: 'Analyze Document',
      description: 'Analyze a document and extract key information',
      priority: 'high',
      data: {
        document: 'This is a sample document for analysis...',
      },
      requiredCapabilities: ['text-analysis'],
      estimatedDuration: 3000,
    },
    {
      type: 'user_request',
      title: 'Generate Report',
      description: 'Generate a data analysis report',
      priority: 'medium',
      data: {
        data: [1, 2, 3, 4, 5],
      },
      requiredCapabilities: ['data-analysis'],
      estimatedDuration: 4000,
    },
    {
      type: 'user_request',
      title: 'Create Function',
      description: 'Create a utility function in TypeScript',
      priority: 'low',
      data: {
        requirements: 'A function that calculates the factorial of a number',
      },
      requiredCapabilities: ['code-generation'],
      estimatedDuration: 2000,
    },
  ]

  // Execute tasks in parallel
  try {
    const taskIds = await Promise.all(
      tasks.map(task => sdk.executeTask(task))
    )

    console.log(`Scheduled ${taskIds.length} tasks`)

    // Wait for all tasks to complete
    await new Promise(resolve => setTimeout(resolve, 10000))

    // Get system statistics
    const stats = sdk.getStats()
    console.log('System statistics:', stats)

    // Get agent statistics
    const agentStats = sdk.getAgentManager().getStats()
    console.log('Agent statistics:', agentStats)

  } catch (error) {
    console.error('Multi-agent execution failed:', error)
  }

  // Cleanup
  await sdk.cleanup()
}

/**
 * Streaming Example
 * Demonstrates real-time streaming with agents
 */
export async function streamingExample() {
  const sdk = await initializeSDK({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
    },
    enableAgents: true,
    enableStreaming: true,
  })

  const streamManager = sdk.getStreamManager()

  // Setup event listeners
  streamManager.addEventListener('streamEvent', (event) => {
    console.log(`[${event.timestamp?.toISOString()}] ${event.type}: ${event.content}`)
  })

  // Start streaming
  await streamManager.startStream()

  // Send messages
  await streamManager.sendMessage('Hello, this is a test message')
  await streamManager.sendMessage('This is another message with metadata', {
    source: 'example',
    priority: 'high',
  })

  // Simulate agent thinking
  await streamManager.simulateThinking(2000)

  // Simulate tool call
  await streamManager.simulateToolCall('analyze-text', {
    text: 'Sample text for analysis',
    options: { language: 'en' },
  })

  // Get stream statistics
  const stats = streamManager.getStats()
  console.log('Stream statistics:', stats)

  // Stop streaming
  streamManager.stopStream()

  // Cleanup
  await sdk.cleanup()
}

/**
 * Error Handling Example
 * Demonstrates proper error handling with agents
 */
export async function errorHandlingExample() {
  const sdk = await initializeSDK({
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY,
    },
    enableAgents: true,
    enableStreaming: true,
  })

  // Create an agent with error-prone configuration
  const errorAgent: AgentConfig = {
    id: 'error-agent',
    name: 'Error Agent',
    description: 'An agent that demonstrates error handling',
    specialization: 'testing',
    capabilities: [
      {
        name: 'error-testing',
        description: 'Test error handling',
        version: '1.0.0',
        supportedTasks: ['test', 'fail'],
        performanceScore: 50,
        isActive: true,
      },
    ],
    maxConcurrentTasks: 1,
    timeout: 1000, // Very short timeout to trigger errors
    retryAttempts: 2,
    autonomyLevel: 'supervised',
  }

  await sdk.registerAgent(errorAgent)

  // Setup error handling
  sdk.getAgentManager().addEventListener('error.occurred', (event) => {
    console.error('Agent error occurred:', event.data)
  })

  sdk.getAgentManager().addEventListener('task.failed', (event) => {
    console.error('Task failed:', event.data)
  })

  // Create a task that will likely fail
  const task: CreateAgentTask = {
    type: 'user_request',
    title: 'Error Test',
    description: 'A task designed to test error handling',
    priority: 'low',
    data: {
      shouldFail: true,
    },
    requiredCapabilities: ['error-testing'],
    estimatedDuration: 5000, // Longer than timeout
  }

  try {
    const taskId = await sdk.executeTask(task, errorAgent.id)
    console.log(`Task scheduled with ID: ${taskId}`)

    // Wait for task to fail
    await new Promise(resolve => setTimeout(resolve, 5000))

  } catch (error) {
    console.error('Expected error occurred:', error)
  }

  // Cleanup
  await sdk.cleanup()
}

// Run examples if this file is executed directly
if (require.main === module) {
  console.log('Running NikCLI SDK Agent Examples...')
  
  agentExample()
    .then(() => console.log('Agent example completed'))
    .catch(console.error)

  multiAgentExample()
    .then(() => console.log('Multi-agent example completed'))
    .catch(console.error)

  streamingExample()
    .then(() => console.log('Streaming example completed'))
    .catch(console.error)

  errorHandlingExample()
    .then(() => console.log('Error handling example completed'))
    .catch(console.error)
}
