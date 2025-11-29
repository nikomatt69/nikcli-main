#!/usr/bin/env node
/**
 * Test/Demo script for StructuredLayoutUI
 *
 * This demonstrates the 3-section layout:
 * - Top: Fixed status bar with build info, directory, shortcuts
 * - Center: Scrollable logs/stream area
 * - Bottom: Fixed prompt for user input
 *
 * Usage: npm run test:layout
 * or: ts-node src/cli/test-structured-layout.ts
 */

import { createStructuredLayout } from './ui/structured-layout-adapter'
import type { LayoutContext } from './ui/structured-layout-ui'

async function main() {
  // Create the layout with initial context
  const context: LayoutContext = {
    workingDirectory: process.cwd(),
    currentModel: 'claude-sonnet-4.5',
    provider: 'anthropic',
    buildStatus: 'OpenCode Gemini Pro 3',
    version: 'v1.0.85',
    contextPercentage: 45,
    planMode: false,
    autoAcceptEdits: false,
    activeAgents: 0,
    processingMessage: false
  }

  const layout = createStructuredLayout(context, {
    captureStdout: true,
    captureStderr: true,
    formatMarkdown: true
  })

  // Handle events
  layout.on('submit', (input: string) => {
    if (!input.trim()) return

    layout.log(`\n{bold}User:{/bold} ${input}\n`, 'cyan')

    // Simulate processing
    layout.updateContext({ processingMessage: true })
    layout.showSpinner('Processing your request...')

    // Simulate AI response after 1 second
    setTimeout(() => {
      layout.showSuccess('Request processed successfully!')

      layout.log('\n{bold}Assistant:{/bold}', 'green')
      layout.log('I understand you want to test the structured layout.', 'white')
      layout.log('\nHere are some features of this layout:', 'white')
      layout.log('  • {green-fg}Fixed top bar{/green-fg} with status information', 'white')
      layout.log('  • {cyan-fg}Scrollable center panel{/cyan-fg} for logs and output', 'white')
      layout.log('  • {yellow-fg}Fixed bottom prompt{/yellow-fg} for user input', 'white')
      layout.log('  • {magenta-fg}Auto-scroll{/magenta-fg} to keep latest messages visible\n', 'white')

      layout.updateContext({ processingMessage: false, activeAgents: 0 })

      // Handle special commands
      if (input.toLowerCase() === 'help') {
        showHelp(layout)
      } else if (input.toLowerCase() === 'clear') {
        layout.clearLogs()
      } else if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        layout.showInfo('Goodbye!')
        setTimeout(() => {
          cleanup()
        }, 500)
      } else if (input.toLowerCase().startsWith('agents ')) {
        const count = parseInt(input.split(' ')[1]) || 0
        layout.updateContext({ activeAgents: count })
        layout.showInfo(`Active agents set to ${count}`)
      } else if (input.toLowerCase() === 'plan') {
        layout.updateContext({ planMode: !context.planMode })
        layout.showInfo(`Plan mode ${!context.planMode ? 'enabled' : 'disabled'}`)
        context.planMode = !context.planMode
      } else if (input.toLowerCase() === 'stream') {
        simulateStreaming(layout)
      }
    }, 1000)
  })

  layout.on('cancel', () => {
    layout.showWarning('Input cancelled')
    layout.clearInput()
  })

  layout.on('interrupt', () => {
    layout.showWarning('\nInterrupt signal received (Ctrl+C)')
    layout.log('Press Ctrl+C again to exit, or type "exit" to quit gracefully\n', 'yellow')
  })

  layout.on('escape', () => {
    layout.showInfo('Escape pressed - clearing input')
    layout.clearInput()
  })

  layout.on('command-palette', () => {
    layout.showInfo('Command palette triggered (Ctrl+P)')
  })

  layout.on('agents-view', () => {
    layout.showInfo('Agents view triggered (Tab)')
  })

  // Activate the layout
  layout.activate()

  // Show welcome message
  showWelcome(layout)

  // Cleanup function
  function cleanup() {
    layout.deactivate()
    layout.destroy()
    process.exit(0)
  }

  // Handle process termination
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)
}

function showWelcome(layout: any) {
  layout.log('\n{bold}{cyan-fg}═══════════════════════════════════════════════════════════{/cyan-fg}{/bold}', 'cyan')
  layout.log('{bold}{cyan-fg}   Welcome to NikCLI Structured Layout Demo{/cyan-fg}{/bold}', 'cyan')
  layout.log('{bold}{cyan-fg}═══════════════════════════════════════════════════════════{/cyan-fg}{/bold}\n', 'cyan')

  layout.log('{bold}This is a demonstration of the 3-section UI layout:{/bold}\n', 'white')

  layout.log('  {bold}{green-fg}Top Section:{/green-fg}{/bold}', 'white')
  layout.log('    • Fixed position at the top', 'grey')
  layout.log('    • Shows build status, directory, shortcuts, and version', 'grey')
  layout.log('    • Always visible, never scrolls\n', 'grey')

  layout.log('  {bold}{cyan-fg}Center Section:{/cyan-fg}{/bold}', 'white')
  layout.log('    • Scrollable area for logs and output', 'grey')
  layout.log('    • Auto-scrolls to show latest messages', 'grey')
  layout.log('    • Supports mouse wheel and keyboard scrolling', 'grey')
  layout.log('    • Use PageUp/PageDown, Home/End to navigate\n', 'grey')

  layout.log('  {bold}{yellow-fg}Bottom Section:{/yellow-fg}{/bold}', 'white')
  layout.log('    • Fixed position at the bottom', 'grey')
  layout.log('    • Shows status line and input prompt', 'grey')
  layout.log('    • Always visible and accessible\n', 'grey')

  layout.log('{bold}{magenta-fg}Try these commands:{/magenta-fg}{/bold}', 'white')
  layout.log('  • {cyan-fg}help{/cyan-fg}       - Show available commands', 'grey')
  layout.log('  • {cyan-fg}clear{/cyan-fg}      - Clear the logs', 'grey')
  layout.log('  • {cyan-fg}stream{/cyan-fg}     - Simulate streaming output', 'grey')
  layout.log('  • {cyan-fg}agents <n>{/cyan-fg} - Set number of active agents', 'grey')
  layout.log('  • {cyan-fg}plan{/cyan-fg}       - Toggle plan mode', 'grey')
  layout.log('  • {cyan-fg}exit{/cyan-fg}       - Exit the demo\n', 'grey')

  layout.log('{bold}{blue-fg}Keyboard shortcuts:{/blue-fg}{/bold}', 'white')
  layout.log('  • {grey-fg}Esc{/grey-fg}        - Clear input / Interrupt', 'grey')
  layout.log('  • {grey-fg}Tab{/grey-fg}        - Agents view', 'grey')
  layout.log('  • {grey-fg}Ctrl+P{/grey-fg}     - Command palette', 'grey')
  layout.log('  • {grey-fg}Ctrl+C{/grey-fg}     - Interrupt / Exit', 'grey')
  layout.log('  • {grey-fg}PgUp/PgDn{/grey-fg}  - Scroll logs\n', 'grey')

  layout.log('{bold}{yellow-fg}→ Type a message and press Enter to start!{/yellow-fg}{/bold}\n', 'yellow')
}

function showHelp(layout: any) {
  layout.log('\n{bold}{cyan-fg}Available Commands:{/cyan-fg}{/bold}\n', 'cyan')
  layout.log('  {bold}help{/bold}       - Show this help message', 'white')
  layout.log('  {bold}clear{/bold}      - Clear all logs from the center panel', 'white')
  layout.log('  {bold}stream{/bold}     - Simulate streaming AI output', 'white')
  layout.log('  {bold}agents <n>{/bold} - Set number of active agents (e.g., "agents 3")', 'white')
  layout.log('  {bold}plan{/bold}       - Toggle plan mode on/off', 'white')
  layout.log('  {bold}exit{/bold}       - Exit the demo gracefully', 'white')
  layout.log('  {bold}quit{/bold}       - Same as exit\n', 'white')
}

function simulateStreaming(layout: any) {
  layout.showSpinner('Simulating streaming output...')

  const messages = [
    'Analyzing your codebase...',
    'Found 127 files to review',
    'Checking for test coverage...',
    '',
    '{bold}Test Coverage Report:{/bold}',
    '  • Backend: {green-fg}87%{/green-fg} coverage',
    '  • Frontend: {yellow-fg}65%{/yellow-fg} coverage',
    '  • E2E Tests: {red-fg}42%{/red-fg} coverage',
    '',
    '{bold}Recommendations:{/bold}',
    '  1. Add more frontend unit tests',
    '  2. Improve E2E test coverage',
    '  3. Consider adding integration tests',
    '',
    'Analysis complete! ✓'
  ]

  let index = 0
  const interval = setInterval(() => {
    if (index < messages.length) {
      layout.log(messages[index])
      index++
    } else {
      clearInterval(interval)
      layout.showSuccess('Streaming simulation complete!')
    }
  }, 300)
}

// Run the demo
main().catch((error) => {
  console.error('Error running demo:', error)
  process.exit(1)
})
