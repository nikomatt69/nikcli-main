/**
 * Example: Live trading with real-time WebSocket streams
 *
 * This example demonstrates:
 * 1. Finding live events you can bet on RIGHT NOW
 * 2. Real-time orderbook updates via WebSocket
 * 3. Live trade stream monitoring
 * 4. AI agent with live trading tools
 * 5. Automatic event detection (sports, news, politics)
 *
 * Perfect for:
 * - Live sports betting
 * - Breaking news events
 * - Real-time market monitoring
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  createCdpWallet,
  createPolymarketClient,
  createGammaClient,
  createWebSocketClient,
  createLiveEventsManager,
  polymarketTools,
  logger,
  LogLevel,
} from '../src/index.ts';
import { liveTools } from '../src/ai/live-tools.ts';

async function main() {
  console.log('🔴 LIVE Trading Example - Real-time Polymarket Betting\n');

  // Setup logger
  logger.setLevel(LogLevel.INFO);

  try {
    // 1. Setup CDP Wallet
    console.log('1️⃣  Setting up CDP wallet...');
    const wallet = await createCdpWallet({ network: 'polygon' });
    const account = await wallet.getOrCreateEvmAccount();
    console.log(`   ✅ Wallet: ${account.address}\n`);

    // 2. Create CLOB client
    console.log('2️⃣  Creating Polymarket client...');
    const clobClient = createPolymarketClient({
      signer: {
        type: 'cdp',
        signTypedData: wallet.signTypedData.bind(wallet),
        address: account.address,
      },
    });
    console.log('   ✅ CLOB client ready\n');

    // 3. Create Gamma client
    const gammaClient = createGammaClient();

    // 4. Create WebSocket client
    console.log('3️⃣  Connecting to WebSocket...');
    const wsClient = createWebSocketClient({
      autoReconnect: true,
      pingInterval: 30000,
    });

    wsClient.on('connected', () => {
      console.log('   ✅ WebSocket connected\n');
    });

    wsClient.on('disconnected', () => {
      console.log('   ⚠️  WebSocket disconnected\n');
    });

    wsClient.on('error', (error) => {
      console.error('   ❌ WebSocket error:', error);
    });

    await wsClient.connect();

    // 5. Create live events manager
    console.log('4️⃣  Creating live events manager...');
    const liveManager = createLiveEventsManager(gammaClient, clobClient);
    console.log('   ✅ Live manager ready\n');

    // 6. Find live events
    console.log('5️⃣  Finding live events...\n');
    const liveEvents = await liveManager.findLiveEvents({
      minVolume: 10000,
      minLiquidity: 1000,
      maxSpread: 0.05,
      endingWithinHours: 24,
    });

    console.log(`   Found ${liveEvents.length} live events:\n`);

    liveEvents.slice(0, 5).forEach((event, i) => {
      console.log(`   ${i + 1}. ${event.question}`);
      console.log(`      Category: ${event.category} | Score: ${event.bettingScore}/100`);
      console.log(`      Live: ${event.isLive ? '🔴 YES' : '⚪ NO'} | Volume: $${event.volume?.toLocaleString()}`);
      console.log(`      Spread: ${(event.spread * 100).toFixed(2)}% | Closes in: ${event.hoursToClose.toFixed(1)}h`);
      console.log();
    });

    // 7. Find live sports
    console.log('6️⃣  Finding live sports events...\n');
    const liveSports = await liveManager.findLiveSports();
    console.log(`   Found ${liveSports.length} live sports events\n`);

    // 8. Monitor a live event (if available)
    if (liveEvents.length > 0) {
      const topEvent = liveEvents[0];
      const yesToken = topEvent.outcomes.find((o) => o.name === 'YES');

      if (yesToken) {
        console.log('7️⃣  Monitoring top event for 30 seconds...');
        console.log(`   Event: ${topEvent.question}`);
        console.log(`   Token: ${yesToken.tokenId}\n`);

        // Subscribe to orderbook
        wsClient.subscribeOrderbook(yesToken.tokenId);

        // Subscribe to trades
        wsClient.subscribeTrades(yesToken.tokenId);

        let orderbookCount = 0;
        let tradeCount = 0;

        wsClient.on('orderbook', (update) => {
          if (update.tokenId === yesToken.tokenId) {
            orderbookCount++;
            console.log(
              `   📊 Orderbook update #${orderbookCount}: ` +
                `Best bid: ${update.bids[0]?.price || 'N/A'} | ` +
                `Best ask: ${update.asks[0]?.price || 'N/A'}`
            );
          }
        });

        wsClient.on('trade', (trade) => {
          if (trade.tokenId === yesToken.tokenId) {
            tradeCount++;
            console.log(
              `   💰 Trade #${tradeCount}: ${trade.side} ${trade.size} @ $${trade.price}`
            );
          }
        });

        // Monitor for 30 seconds
        await new Promise((resolve) => setTimeout(resolve, 30000));

        console.log(`\n   ✅ Monitoring complete:`);
        console.log(`      Orderbook updates: ${orderbookCount}`);
        console.log(`      Trades: ${tradeCount}\n`);

        // Cleanup
        wsClient.unsubscribe(JSON.stringify({ type: 'orderbook', tokenId: yesToken.tokenId }));
        wsClient.unsubscribe(JSON.stringify({ type: 'trades', tokenId: yesToken.tokenId }));
      }
    }

    // 9. AI Agent with live tools
    console.log('8️⃣  Running AI agent with live trading tools...\n');

    const tools = {
      ...polymarketTools({
        clobClient,
        gammaClient,
        debug: false,
      }),
      ...liveTools({
        wsClient,
        liveManager,
        debug: false,
      }),
    };

    const result = await generateText({
      model: openai('gpt-4-turbo-preview'),
      tools,
      maxSteps: 5,
      system: `You are a live trading assistant for Polymarket.

Your goal: Find the BEST live betting opportunities RIGHT NOW.

Steps:
1. Use find_live_events to find events happening now
2. Focus on events with:
   - High betting score (>70)
   - Good liquidity (>$5k)
   - Tight spread (<3%)
   - Actually live (isLive = true)
3. For the top event, get its orderbook
4. Explain why it's a good opportunity

Be concise and focus on actionable insights.`,
      prompt: 'Find me the top 3 live betting opportunities right now and analyze the best one.',
    });

    console.log('   🤖 AI Agent Response:\n');
    console.log(result.text);
    console.log();

    // 10. Show tool usage
    if (result.steps && result.steps.length > 0) {
      console.log('\n9️⃣  Tool Usage Summary:\n');
      let toolCount = 0;
      result.steps.forEach((step, i) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((toolCall) => {
            toolCount++;
            console.log(`   ${toolCount}. ${toolCall.toolName}`);
          });
        }
      });
      console.log();
    }

    // Cleanup
    console.log('🔟 Cleaning up...');
    wsClient.disconnect();
    console.log('   ✅ WebSocket disconnected\n');

    console.log('✨ Live trading example completed!\n');
    console.log('💡 Key features demonstrated:');
    console.log('   ✅ Live event detection');
    console.log('   ✅ Real-time WebSocket streams');
    console.log('   ✅ Orderbook monitoring');
    console.log('   ✅ Trade stream');
    console.log('   ✅ AI agent with live tools');
    console.log('   ✅ Automated opportunity detection\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Received SIGINT, shutting down...');
  process.exit(0);
});

main();
