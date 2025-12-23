/**
 * TUI Example Usage
 * Demonstrates how to use the TUI in a real application
 */

import { TUIApplication, elementManager, eventBus, tuiState } from './index'

async function exampleUsage(): Promise<void> {
  console.log('=== NikCLI TUI Example ===\n')

  // Create application
  const app = new TUIApplication({
    title: 'NikCLI Example',
    theme: 'default',
    defaultLayout: 'dual',
    enableMouse: true,
    enableKeyboard: true
  })

  await app.initialize()

  console.log('✓ Application initialized\n')

  // Example 1: Create a custom panel
  console.log('Example 1: Creating custom panel...')
  createCustomPanel()
  console.log('✓ Custom panel created\n')

  // Example 2: Stream data
  console.log('Example 2: Streaming data...')
  streamData()
  console.log('✓ Data streamed\n')

  // Example 3: Create todo items
  console.log('Example 3: Managing todos...')
  manageTodos()
  console.log('✓ Todos managed\n')

  // Example 4: Chat interaction
  console.log('Example 4: Chat interaction...')
  simulateChat()
  console.log('✓ Chat simulated\n')

  // Example 5: Theme switching
  console.log('Example 5: Theme switching...')
  switchTheme(app)
  console.log('✓ Theme switched\n')

  // Show final status
  console.log('=== Final Status ===')
  const status = app.getStatus()
  console.log(`Elements: ${status.elementCount}`)
  console.log(`Theme: ${status.theme}`)
  console.log(`Layout: ${tuiState.getState().layout.mode}`)
  console.log(`Panels: ${tuiState.getState().layout.panels.length}`)

  console.log('\n✅ Example completed successfully!')
  console.log('\nTo start the TUI, run: await app.start()')
}

function createCustomPanel(): void {
  // Create a custom stats panel
  const statsPanel = elementManager.createElement(
    'panel',
    {
      id: 'stats-panel',
      type: 'panel',
      title: 'System Stats',
      width: '50%',
      height: '30%',
      pinned: true
    },
    eventBus,
    tuiState.getState().theme
  )

  // Update with sample data
  statsPanel.update({
    type: 'content',
    content: `CPU: 45%
Memory: 2.1GB / 8GB
Disk: 120GB / 500GB
Load: 0.25, 0.30, 0.28`
  })

  elementManager.registerElement(statsPanel)
}

function streamData(): void {
  const streamAdapter = elementManager.getElement('main-stream')

  if (streamAdapter) {
    // Stream various types of data
    streamAdapter.update({
      type: 'content',
      content: '[2024-01-15 10:30:15] Starting application...\n'
    })

    streamAdapter.update({
      type: 'content',
      content: '[2024-01-15 10:30:16] Loading configuration...\n'
    })

    streamAdapter.update({
      type: 'content',
      content: '[2024-01-15 10:30:17] ✓ Configuration loaded\n'
    })

    streamAdapter.update({
      type: 'content',
      content: '[2024-01-15 10:30:18] Connecting to database...\n'
    })

    streamAdapter.update({
      type: 'content',
      content: '[2024-01-15 10:30:19] ✓ Database connected\n'
    })
  }
}

function manageTodos(): void {
  const todoPanel = elementManager.getElement('todo-panel')

  if (todoPanel) {
    // Add sample todos
    todoPanel.update({
      type: 'todos',
      todos: [
        {
          id: '1',
          text: 'Implement TUI architecture',
          completed: true,
          priority: 'high',
          createdAt: Date.now() - 86400000
        },
        {
          id: '2',
          text: 'Create PanelElement system',
          completed: true,
          priority: 'high',
          createdAt: Date.now() - 43200000
        },
        {
          id: '3',
          text: 'Add StreamElement integration',
          completed: false,
          priority: 'medium',
          createdAt: Date.now() - 21600000
        },
        {
          id: '4',
          text: 'Implement NavigationSystem',
          completed: false,
          priority: 'medium',
          createdAt: Date.now() - 10800000
        },
        {
          id: '5',
          text: 'Add theme support',
          completed: false,
          priority: 'low',
          createdAt: Date.now()
        }
      ]
    })
  }
}

function simulateChat(): void {
  const chatPanel = elementManager.getElement('chat-panel')

  if (chatPanel) {
    // Simulate a chat conversation
    const messages = [
      {
        role: 'user' as const,
        content: 'Hello! Can you help me with my project?',
        timestamp: Date.now() - 300000
      },
      {
        role: 'assistant' as const,
        content: 'Of course! I\'d be happy to help. What project are you working on?',
        timestamp: Date.now() - 290000
      },
      {
        role: 'user' as const,
        content: 'I\'m building a TUI application with NikCLI',
        timestamp: Date.now() - 280000
      },
      {
        role: 'assistant' as const,
        content: 'Great! The TUI architecture we built should be perfect for that. What specific feature would you like to implement?',
        timestamp: Date.now() - 270000
      },
      {
        role: 'user' as const,
        content: 'I need to create a custom panel for displaying logs',
        timestamp: Date.now() - 260000
      },
      {
        role: 'assistant' as const,
        content: 'You can extend PanelElement and override the render methods. Check out DiffPanel or TodoPanel for examples!',
        timestamp: Date.now() - 250000
      }
    ]

    messages.forEach(msg => {
      chatPanel.update({
        type: 'chat',
        messages: [msg]
      })
    })
  }
}

function switchTheme(app: TUIApplication): void {
  const themeAdapter = app.getThemeAdapter()
  const themes = themeAdapter.getAvailableThemes()
  const currentTheme = themeAdapter.getTheme()
  const currentIndex = themes.indexOf(currentTheme.name)
  const nextTheme = themes[(currentIndex + 1) % themes.length]

  console.log(`Switching from ${currentTheme.name} to ${nextTheme}`)
  themeAdapter.setTheme(nextTheme)
}

// Run example if called directly
if (require.main === module) {
  exampleUsage().catch(error => {
    console.error('Example failed:', error)
    process.exit(1)
  })
}

export { exampleUsage, createCustomPanel, streamData, manageTodos, simulateChat, switchTheme }
