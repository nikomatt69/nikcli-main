/**
 * Example: AI-powered Polymarket trading agent
 *
 * This example demonstrates:
 * 1. Setting up the full stack (CDP wallet + Polymarket client + AI tools)
 * 2. Using AI SDK's generateText with Polymarket tools
 * 3. Multi-step tool calling (search → analyze → place order)
 * 4. Risk management and validation
 *
 * Prerequisites:
 * - CDP_API_KEY and CDP_API_SECRET
 * - OPENAI_API_KEY (or ANTHROPIC_API_KEY, etc.)
 * - Funded wallet with USDC on Polygon
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { setupPolymarket } from '../src/index.ts';

/**
 * Trading agent system prompt
 */
const SYSTEM_PROMPT = `You are a professional Polymarket trading agent. Your role is to:

1. Research markets based on user queries
2. Analyze orderbook depth and liquidity
3. Execute trades only when there is sufficient edge and liquidity
4. Never exceed risk limits (max $100 per order, max 5% slippage)
5. Always confirm trade parameters before execution

Risk Management Rules:
- Maximum notional per order: $100
- Minimum edge required: 2% (order price at least 2% better than mid-price)
- Maximum spread slippage: 5%
- Only trade in active, liquid markets (volume > $10k)

When placing orders:
1. Search for the market
2. Get the orderbook
3. Calculate mid-price and check edge
4. Verify liquidity (at least $50 on each side)
5. Place order only if all checks pass
6. Report the order ID and confirmation

Always explain your reasoning before taking actions.`;

/**
 * Main trading agent
 */
async function main() {
  console.log('🤖 AI-Powered Polymarket Trading Agent\n');

  try {
    // 1. Setup full stack
    console.log('1️⃣  Initializing trading stack...');
    const { wallet, account, tools } = await setupPolymarket({
      network: 'polygon',
      debug: true,
    });

    console.log(`   ✅ Wallet: ${account.address}`);
    console.log(`   ✅ Tools: ${Object.keys(tools).length} tools ready`);
    console.log();

    // 2. Define trading task
    const tradingTask = process.argv[2] || 'Find the top Bitcoin market and show me the orderbook';

    console.log('2️⃣  Trading Task:');
    console.log(`   "${tradingTask}"\n`);

    // 3. Execute with AI
    console.log('3️⃣  Executing with AI agent...\n');

    const result = await generateText({
      model: openai('gpt-4-turbo-preview'),
      system: SYSTEM_PROMPT,
      prompt: tradingTask,
      tools,
      maxSteps: 10, // Allow multiple tool calls
    });

    console.log('\n📊 Agent Response:\n');
    console.log(result.text);
    console.log();

    // 4. Show tool calls
    if (result.steps && result.steps.length > 0) {
      console.log('🔧 Tool Calls:\n');
      result.steps.forEach((step, i) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((toolCall) => {
            console.log(`   ${i + 1}. ${toolCall.toolName}`);
            console.log(`      Args:`, JSON.stringify(toolCall.args, null, 2));
            if (step.toolResults) {
              const toolResult = step.toolResults.find(
                (r) => r.toolCallId === toolCall.toolCallId
              );
              if (toolResult) {
                console.log(`      Result:`, JSON.stringify(toolResult.result, null, 2));
              }
            }
            console.log();
          });
        }
      });
    }

    // 5. Token usage
    console.log('📈 Usage:');
    console.log(`   Prompt tokens: ${result.usage.promptTokens}`);
    console.log(`   Completion tokens: ${result.usage.completionTokens}`);
    console.log(`   Total tokens: ${result.usage.totalTokens}`);
    console.log();

    console.log('✨ Agent execution completed!');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Advanced example: Trading with risk checks
 */
async function advancedTradingExample() {
  console.log('🔥 Advanced Trading Example\n');

  const { tools } = await setupPolymarket({
    network: 'polygon',
    debug: true,
  });

  const result = await generateText({
    model: openai('gpt-4-turbo-preview'),
    system: SYSTEM_PROMPT,
    prompt: `Find a Bitcoin market with good liquidity.
    Analyze the orderbook and place a small BUY order at a price with at least 2% edge.
    Order size should be 1 share.
    Explain your reasoning at each step.`,
    tools,
    maxSteps: 10,
  });

  console.log('\n📊 Result:\n', result.text);
}

/**
 * Multi-market analysis example
 */
async function multiMarketAnalysis() {
  console.log('📊 Multi-Market Analysis Example\n');

  const { tools } = await setupPolymarket({
    network: 'polygon',
    debug: true,
  });

  const result = await generateText({
    model: openai('gpt-4-turbo-preview'),
    system: SYSTEM_PROMPT,
    prompt: `Compare the top 3 Bitcoin markets.
    For each, show:
    1. Current YES price
    2. 24h volume
    3. Liquidity (orderbook depth)
    4. Your assessment of which is best to trade

    Do NOT place any orders, just analyze.`,
    tools,
    maxSteps: 20,
  });

  console.log('\n📊 Analysis:\n', result.text);
}

// Run main example
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export examples for testing
export { advancedTradingExample, multiMarketAnalysis };
