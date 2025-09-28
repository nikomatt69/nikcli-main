#!/usr/bin/env node

/**
 * Test GOAT SDK Polymarket Integration
 * This script tests the basic GOAT SDK setup for Polymarket
 */

async function testGoatSDKPolymarket() {
  console.log('🎯 Testing GOAT SDK Polymarket Integration...\n')

  // Test 1: Check dependencies
  console.log('1. Checking GOAT SDK dependencies...')
  try {
    const goatAdapter = require('@goat-sdk/adapter-vercel-ai')
    const polymarketPlugin = require('@goat-sdk/plugin-polymarket')
    const walletViem = require('@goat-sdk/wallet-viem')
    const viem = require('viem')
    
    console.log('✅ Dependencies loaded:')
    console.log('  - GOAT Adapter Vercel AI:', !!goatAdapter.getOnChainTools)
    console.log('  - Polymarket Plugin:', !!polymarketPlugin.polymarket)
    console.log('  - Wallet Viem:', !!walletViem.ViemEVMWalletClient)
    console.log('  - Viem:', !!viem.createWalletClient)
  } catch (error) {
    console.log('❌ Dependencies error:', error.message)
    return false
  }

  // Test 2: Check environment variables (without exposing them)
  console.log('\n2. Checking environment variables...')
  const requiredEnvs = [
    'POLYMARKET_API_KEY',
    'POLYMARKET_SECRET', 
    'POLYMARKET_PASSPHRASE',
    'POLYMARKET_PRIVATE_KEY'
  ]
  
  let allEnvsPresent = true
  for (const env of requiredEnvs) {
    const isPresent = !!process.env[env]
    console.log(`  - ${env}: ${isPresent ? '✅ Present' : '❌ Missing'}`)
    if (!isPresent) allEnvsPresent = false
  }

  if (!allEnvsPresent) {
    console.log('\n❌ Missing required environment variables')
    console.log('Set them in .env file or environment')
    return false
  }

  // Test 3: Try to create plugin instance
  console.log('\n3. Testing plugin creation...')
  try {
    const { polymarket } = require('@goat-sdk/plugin-polymarket')
    const plugin = polymarket({
      credentials: {
        key: process.env.POLYMARKET_API_KEY,
        secret: process.env.POLYMARKET_SECRET,
        passphrase: process.env.POLYMARKET_PASSPHRASE,
      }
    })
    console.log('✅ Polymarket plugin created successfully')
    console.log('  Plugin type:', typeof plugin)
  } catch (error) {
    console.log('❌ Plugin creation error:', error.message)
    return false
  }

  // Test 4: Try wallet creation (without connecting)
  console.log('\n4. Testing wallet creation...')
  try {
    const { ViemEVMWalletClient } = require('@goat-sdk/wallet-viem')
    const { createWalletClient, http } = require('viem')
    const { privateKeyToAccount } = require('viem/accounts')
    const { polygon } = require('viem/chains')
    
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY
    const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
    
    const account = privateKeyToAccount(formattedPrivateKey)
    const viemWalletClient = createWalletClient({
      account: account,
      transport: http(),
      chain: polygon,
    })
    
    const goatWalletClient = new ViemEVMWalletClient(viemWalletClient)
    console.log('✅ Wallet client created successfully')
    console.log('  Address:', account.address)
  } catch (error) {
    console.log('❌ Wallet creation error:', error.message)
    return false
  }

  console.log('\n🎉 All basic tests passed!')
  console.log('\nNext steps:')
  console.log('1. Test the full integration via CLI: /web3 polymarket init')
  console.log('2. Try market search: /web3 polymarket "show me trending markets"')
  console.log('3. Test betting functionality with small amounts')
  
  return true
}

// Run the test
testGoatSDKPolymarket()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(error => {
    console.error('Test failed with error:', error)
    process.exit(1)
  })