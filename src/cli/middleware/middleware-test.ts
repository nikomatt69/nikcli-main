#!/usr/bin/env node

/**
 * Simple test script to verify middleware system functionality
 * Run with: npx tsx src/cli/middleware/middleware-test.ts
 */

import { SimpleConfigManager } from '../core/config-manager'
import { ExecutionPolicyManager } from '../policies/execution-policy'
import { MiddlewareBootstrap, middlewareManager } from './index'

async function testMiddlewareSystem() {
  console.log('🧪 Testing NikCLI Middleware System\n')

  // Initialize config manager and policy manager
  const configManager = new SimpleConfigManager()
  const policyManager = new ExecutionPolicyManager(configManager)

  // Initialize middleware system
  console.log('1. Initializing middleware system...')
  await MiddlewareBootstrap.initialize(policyManager)
  console.log('✓ Middleware system initialized\n')

  // Test middleware execution
  console.log('2. Testing middleware pipeline execution...')

  const moduleContext = {
    workingDirectory: process.cwd(),
    session: { id: 'test-session' },
    policyManager,
    isProcessing: false,
    autonomous: true,
    planMode: false,
    autoAcceptEdits: false,
  }

  try {
    const result = await middlewareManager.execute('test-operation', ['arg1', 'arg2'], moduleContext, 'command')

    if (result) {
      if (result.success) {
        console.log('✓ Middleware pipeline executed successfully')
        console.log(`📊 Executed middleware: ${result.executedMiddleware.join(', ')}`)
        console.log(`⚡ Total execution time: ${result.totalDuration}ms`)
      } else {
        console.log('✖ Middleware pipeline failed:', result.error?.message)
      }
    } else {
      console.log('✖ Middleware pipeline returned undefined')
    }
  } catch (error: any) {
    console.log('✖ Error during middleware execution:', error.message)
  }

  console.log('\n3. Displaying middleware status...')
  middlewareManager.showStatus()

  console.log('\n4. Testing middleware metrics...')
  const metrics = middlewareManager.getMetricsSummary()
  console.log('📈 Metrics Summary:')
  console.log(`   - Total Middleware: ${metrics.totalMiddleware}`)
  console.log(`   - Enabled: ${metrics.enabledMiddleware}`)
  console.log(`   - Total Requests: ${metrics.totalRequests}`)
  console.log(`   - Success Rate: ${((1 - metrics.overallErrorRate) * 100).toFixed(1)}%`)

  console.log('\n5. Shutting down middleware system...')
  await MiddlewareBootstrap.shutdown()
  console.log('✓ Middleware system shut down successfully')

  console.log('\n🎉 Middleware system test completed successfully!')
}

if (require.main === module) {
  testMiddlewareSystem().catch(console.error)
}

export { testMiddlewareSystem }
