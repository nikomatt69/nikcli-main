/**
 * Example: Place an order on Polymarket using CDP wallet
 *
 * This example demonstrates:
 * 1. Setting up a CDP wallet
 * 2. Creating a Polymarket CLOB client
 * 3. Searching for a market
 * 4. Fetching the orderbook
 * 5. Placing a limit order
 *
 * Prerequisites:
 * - CDP_API_KEY and CDP_API_SECRET environment variables
 * - Funded wallet with USDC on Polygon
 */

import 'dotenv/config';
import {
  createCdpWallet,
  createPolymarketClient,
  createGammaClient,
} from '../src/index.ts';

async function main() {
  console.log('🚀 Polymarket Order Placement Example\n');

  try {
    // 1. Setup CDP Wallet
    console.log('1️⃣  Setting up CDP wallet...');
    const wallet = await createCdpWallet({
      network: 'polygon',
    });

    const account = await wallet.getOrCreateEvmAccount();
    console.log(`   ✅ Wallet initialized: ${account.address}`);
    console.log(`   📝 Wallet ID: ${wallet.getWalletId()}`);
    console.log(`   💡 Save this wallet ID to CDP_WALLET_ID env variable\n`);

    // 2. Create Gamma client for market search
    console.log('2️⃣  Searching for markets...');
    const gammaClient = createGammaClient();

    const markets = await gammaClient.searchMarkets({
      query: 'Bitcoin',
      limit: 3,
      active: true,
    });

    console.log(`   ✅ Found ${markets.length} markets:\n`);
    markets.forEach((market, i) => {
      console.log(`   ${i + 1}. ${market.question}`);
      console.log(`      ID: ${market.id}`);
      market.outcomes.forEach((outcome) => {
        console.log(`      ${outcome.name}: ${outcome.tokenId} @ $${outcome.price.toFixed(2)}`);
      });
      console.log();
    });

    // 3. Select first market and get orderbook
    const selectedMarket = markets[0];
    const yesToken = selectedMarket.outcomes.find((o) => o.name === 'YES');

    if (!yesToken) {
      throw new Error('No YES token found');
    }

    console.log('3️⃣  Fetching orderbook...');
    const clobClient = createPolymarketClient({
      signer: {
        type: 'cdp',
        signTypedData: wallet.signTypedData.bind(wallet),
        address: account.address,
      },
    });

    const orderbook = await clobClient.getOrderbook(yesToken.tokenId);
    console.log(`   ✅ Orderbook for ${yesToken.name} (${yesToken.tokenId}):\n`);
    console.log('   Best Bid:', orderbook.bids[0]);
    console.log('   Best Ask:', orderbook.asks[0]);
    console.log();

    // 4. Place a limit order
    console.log('4️⃣  Placing limit order...');

    // Calculate a conservative bid price (below current best bid)
    const bestBidPrice = parseFloat(orderbook.bids[0]?.price || '0.50');
    const orderPrice = Math.max(0.01, bestBidPrice - 0.05); // 5 cents below best bid
    const orderSize = 1; // Minimum size

    console.log(`   📊 Order details:`);
    console.log(`      Token: ${yesToken.tokenId}`);
    console.log(`      Side: BUY`);
    console.log(`      Price: $${orderPrice.toFixed(2)}`);
    console.log(`      Size: ${orderSize} shares`);
    console.log(`      Type: GTC (Good Till Cancel)`);
    console.log();

    const order = await clobClient.placeOrder({
      tokenId: yesToken.tokenId,
      side: 'BUY',
      price: orderPrice,
      size: orderSize,
      orderType: 'GTC',
    });

    console.log('   ✅ Order placed successfully!\n');
    console.log(`   Order ID: ${order.orderId}`);
    console.log(`   Status: ${order.status}`);
    console.log(`   Timestamp: ${new Date(order.timestamp).toISOString()}`);
    console.log();

    // 5. Get active orders
    console.log('5️⃣  Fetching active orders...');
    const activeOrders = await clobClient.getActiveOrders();
    console.log(`   ✅ Active orders: ${activeOrders.length}\n`);

    activeOrders.slice(0, 5).forEach((o, i) => {
      console.log(`   ${i + 1}. ${o.side} ${o.size} @ $${o.price.toFixed(2)}`);
      console.log(`      Order ID: ${o.orderId}`);
      console.log(`      Status: ${o.status}`);
      console.log(`      Filled: ${o.filled}/${o.size}`);
      console.log();
    });

    console.log('✨ Example completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   - Monitor your order status');
    console.log('   - Cancel the order if needed using order_cancel tool');
    console.log('   - Try the agent-trader.ts example for AI-powered trading');
  } catch (error) {
    console.error('\n❌ Error:', error);
    console.error('\n💡 Common issues:');
    console.error('   - Missing CDP_API_KEY or CDP_API_SECRET');
    console.error('   - Insufficient USDC balance on Polygon');
    console.error('   - Invalid tick size (price must be multiple of 0.01)');
    console.error('   - Order size below minimum (usually 1 share)');
    process.exit(1);
  }
}

main();
