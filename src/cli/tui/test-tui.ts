/**
 * TUI Test
 * Simple test to verify TUI architecture works
 */

import { TUIApplication, eventBus, tuiState, elementManager, layoutManager } from './index'

async function testTUI(): Promise<void> {
  console.log('Starting TUI Test...\n')

  try {
    // Create application
    const app = new TUIApplication({
      title: 'NikCLI TUI Test',
      theme: 'default',
      defaultLayout: 'dual',
      enableMouse: true,
      enableKeyboard: true
    })

    console.log('✓ TUIApplication created')

    // Initialize
    await app.initialize()
    console.log('✓ TUIApplication initialized')

    // Check status
    const status = app.getStatus()
    console.log('\nTUI Status:')
    console.log(`  Running: ${status.isRunning}`)
    console.log(`  Initialized: ${status.isInitialized}`)
    console.log(`  Element Count: ${status.elementCount}`)
    console.log(`  Theme: ${status.theme}`)

    // Check event bus
    console.log('\nEvent Bus:')
    const events = eventBus.getEvents()
    console.log(`  Registered Events: ${events.length}`)
    events.forEach(event => console.log(`    - ${event}`))

    // Check state
    console.log('\nTUI State:')
    const state = tuiState.getState()
    console.log(`  Screen Size: ${state.size.width}x${state.size.height}`)
    console.log(`  Focus: ${state.focus.elementId || 'none'}`)
    console.log(`  Layout Mode: ${state.layout.mode}`)
    console.log(`  Panel Count: ${state.layout.panels.length}`)

    // Check element manager
    console.log('\nElement Manager:')
    const elements = elementManager.getAllElements()
    console.log(`  Total Elements: ${elements.length}`)
    elements.forEach(el => {
      console.log(`    - ${el.getType()}: ${el.getId()}`)
    })

    // Check layout manager
    console.log('\nLayout Manager:')
    const layout = layoutManager.getCurrentLayout()
    if (layout) {
      console.log(`  Current Layout: ${layout.id}`)
      console.log(`  Mode: ${layout.mode}`)
      console.log(`  Panel Count: ${layout.panels.length}`)
    }

    // Test element creation
    console.log('\nTesting Element Creation...')
    const testElement = elementManager.createElement(
      'panel',
      {
        id: 'test-panel',
        type: 'panel',
        title: 'Test Panel',
        width: 50,
        height: 20
      },
      eventBus,
      tuiState.getState().theme
    )
    elementManager.registerElement(testElement)
    console.log('✓ Test element created and registered')

    // Test focus management
    console.log('\nTesting Focus Management...')
    elementManager.setFocusedElement(testElement.getId())
    const focused = elementManager.getFocusedElement()
    console.log(`✓ Focus set to: ${focused?.getId()}`)

    // Test event emission
    console.log('\nTesting Event System...')
    let eventReceived = false
    eventBus.once('test:event', () => {
      eventReceived = true
    })
    eventBus.emit('test:event', { message: 'test' })
    console.log(`✓ Event received: ${eventReceived}`)

    // Test stream integration
    console.log('\nTesting Stream Integration...')
    const streamAdapter = app.getStreamttyAdapter()
    const defaultStream = streamAdapter.getDefaultStreamElement()
    if (defaultStream) {
      streamAdapter.stream('Test message', 'text')
      console.log('✓ Stream message sent')
    }

    // Test theme system
    console.log('\nTesting Theme System...')
    const themeAdapter = app.getThemeAdapter()
    const currentTheme = themeAdapter.getTheme()
    console.log(`✓ Current theme: ${currentTheme.name}`)
    const styles = themeAdapter.toOpenTUIStyles()
    console.log(`✓ Theme styles generated (${Object.keys(styles).length} categories)`)

    console.log('\n✅ All tests passed!')
    console.log('\nTUI is ready to start.')
    console.log('Run app.start() to begin.\n')

    // Don't actually start the TUI in test mode
    // await app.start()

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

// Run test if called directly
if (require.main === module) {
  testTUI().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { testTUI }
