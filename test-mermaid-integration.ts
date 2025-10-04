#!/usr/bin/env ts-node

/**
 * Quick integration test for Mermaid rendering
 */

import { TerminalCapabilityDetector } from './src/cli/utils/terminal-capabilities'
import { getMermaidRenderingPreferences } from './src/cli/core/config-manager'
import { handleMermaidInfo } from './src/cli/chat/nik-cli-commands'

async function testMermaidIntegration() {
  console.log('🧪 Testing Mermaid Integration\n')

  // Test 1: Terminal Capabilities Detection
  console.log('Test 1: Terminal Capabilities Detection')
  const caps = TerminalCapabilityDetector.getCapabilities()
  console.log('✓ Terminal Type:', caps.terminalType)
  console.log('✓ Inline Images:', caps.supportsInlineImages ? 'Yes' : 'No')
  console.log('✓ mermaid-ascii:', caps.hasMermaidAsciiBinary ? 'Installed' : 'Not found')
  console.log('✓ Recommended Strategy:', TerminalCapabilityDetector.getRecommendedStrategy())

  // Test 2: Configuration Loading
  console.log('\nTest 2: Configuration Loading')
  const prefs = getMermaidRenderingPreferences()
  console.log('✓ Strategy:', prefs.strategy)
  console.log('✓ Cache Enabled:', prefs.enableCache)
  console.log('✓ Theme:', prefs.theme)
  console.log('✓ ASCII Padding:', `X:${prefs.asciiPaddingX} Y:${prefs.asciiPaddingY}`)

  // Test 3: Command Handler
  console.log('\nTest 3: /mermaid-info Command Handler')
  await handleMermaidInfo()

  console.log('\n✅ All integration tests passed!\n')
}

testMermaidIntegration().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
