/**
 * Web3 Integration Example
 *
 * This example shows Web3, blockchain, and Polymarket integration
 */

import { createNikCLI } from '@nikcli/enterprise-sdk';

async function main() {
  const nikcli = await createNikCLI();

  console.log('Running Web3 Integration Examples...\n');

  // Example 1: Initialize GOAT SDK
  console.log('--- GOAT SDK Initialization ---');
  const goatInit = await nikcli.web3.initGoat({
    provider: process.env.RPC_URL,
    privateKey: process.env.PRIVATE_KEY,
    network: 'mainnet',
  });

  if (goatInit.success) {
    console.log('GOAT SDK initialized');

    // Get wallet info
    const wallet = await nikcli.web3.getWallet();
    if (wallet.success) {
      console.log('Wallet address:', wallet.data.address);
      console.log('Network:', wallet.data.network);
    }

    // Get balance
    const balance = await nikcli.web3.getBalance('ETH');
    if (balance.success) {
      console.log('ETH Balance:', balance.data);
    }

    // Get USDC balance
    const usdcBalance = await nikcli.web3.getBalance('USDC');
    if (usdcBalance.success) {
      console.log('USDC Balance:', usdcBalance.data);
    }
  }

  // Example 2: Polymarket Integration
  console.log('\n--- Polymarket Markets ---');
  const markets = await nikcli.web3.listMarkets({ active: true });

  if (markets.success) {
    console.log(`Found ${markets.data.length} active markets`);

    // Show top 5 markets
    markets.data.slice(0, 5).forEach((market: any, i: number) => {
      console.log(`\n${i + 1}. ${market.question}`);
      console.log(`   Volume: $${market.volume.toLocaleString()}`);
      console.log(`   Ends: ${market.endDate}`);
    });

    // Analyze a market
    if (markets.data.length > 0) {
      console.log('\n--- Market Analysis ---');
      const analysis = await nikcli.web3.analyzeMarket(markets.data[0].id);
      if (analysis.success) {
        console.log('Market analysis:', analysis.data);
      }
    }
  }

  // Example 3: Polymarket Positions
  console.log('\n--- My Positions ---');
  const positions = await nikcli.web3.getPositions();
  if (positions.success) {
    if (positions.data.length > 0) {
      positions.data.forEach((pos: any, i: number) => {
        console.log(`${i + 1}. ${pos.marketId}`);
        console.log(`   Outcome: ${pos.outcome}`);
        console.log(`   Shares: ${pos.shares}`);
        console.log(`   Value: ${pos.value}`);
      });
    } else {
      console.log('No active positions');
    }
  }

  // Example 4: Coinbase Agent Kit
  console.log('\n--- Coinbase Agent Kit ---');
  const cbInit = await nikcli.web3.initCoinbase();
  if (cbInit.success) {
    console.log('Coinbase Agent Kit initialized');

    const cbWallet = await nikcli.web3.getCoinbaseWallet();
    if (cbWallet.success) {
      console.log('Coinbase wallet:', cbWallet.data.address);
    }
  }

  // Example 5: Smart Contract Interaction
  console.log('\n--- Smart Contract ---');
  const contractAddress = '0x...'; // Your contract address
  const contractABI = []; // Your contract ABI

  // Read from contract
  const contractData = await nikcli.web3.callContract(
    contractAddress,
    contractABI,
    'balanceOf',
    ['0x...']
  );

  if (contractData.success) {
    console.log('Contract balance:', contractData.data);
  }

  // Example 6: Web3 Toolchains
  console.log('\n--- Toolchains ---');
  const toolchains = await nikcli.web3.listToolchains();
  if (toolchains.success) {
    console.log('Available toolchains:');
    toolchains.data.forEach((tc: any, i: number) => {
      console.log(`${i + 1}. ${tc.name} - ${tc.description}`);
    });
  }

  // Example 7: Token Transfer (commented out for safety)
  /*
  console.log('\n--- Token Transfer ---');
  const transfer = await nikcli.web3.transfer({
    to: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    amount: '10.0',
    token: 'USDC',
  });

  if (transfer.success) {
    console.log('Transfer transaction:', transfer.data.hash);
  }
  */

  await nikcli.shutdown();
}

main().catch(console.error);
