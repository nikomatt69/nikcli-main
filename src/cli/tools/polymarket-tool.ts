import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { generateText } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { PolymarketProvider } from '../onchain/polymarket-provider'
import { BaseTool, type ToolExecutionResult } from './base-tool'

/**
 * PolymarketTool - Official Polymarket Integration as NikCLI Tool
 *
 * This tool provides access to Polymarket's prediction markets through
 * the standard NikCLI tool interface. It uses real CLOB API for trading
 * and GOAT SDK for AI-powered market analysis.
 *
 * Features:
 * - Real-time market data and search
 * - Production betting with user confirmation
 * - AI-powered market analysis and insights
 * - Portfolio and position management
 * - Natural language betting interface
 * - Secure credential handling
 */
export class PolymarketTool extends BaseTool {
  private polymarketProvider: PolymarketProvider | null = null
  private isInitialized: boolean = false
  private conversationMessages: CoreMessage[] = []

  // Polymarket agent configuration (simplified, following Coinbase pattern)
  private agent: {
    tools: any
    system: string
    model: any
    maxSteps: number
  } | null = null

  constructor(workingDirectory: string) {
    super('polymarket', workingDirectory)
  }

  /**
   * Execute Polymarket operations
   *
   * @param action - The action to perform: 'init', 'chat', 'bet', 'markets', etc.
   * @param params - Parameters for the action
   */
  async execute(action: string, params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      switch (action.toLowerCase()) {
        case 'init':
        case 'initialize':
          return await this.initializePolymarket(params)

        case 'chat':
        case 'message':
        case 'analyze':
          return await this.processChatMessage(params.message || params, params.options)

        case 'bet':
        case 'place-bet':
          return await this.placeBet(params)

        case 'markets':
        case 'search-markets':
          return await this.searchMarkets(params)

        case 'trending':
        case 'trending-markets':
          return await this.getTrendingMarkets(params)

        case 'sports':
        case 'sports-markets':
          return await this.getSportsMarkets(params)

        case 'prices':
        case 'market-prices':
          return await this.getMarketPrices(params)

        case 'market-info':
        case 'market':
          return await this.getMarketInfo(params)

        case 'positions':
        case 'portfolio':
          return await this.getPositions(params)

        case 'orders':
          return await this.getOrders(params)

        case 'cancel-order':
          return await this.cancelOrder(params)

        case 'status':
          return await this.getStatus(params)

        case 'diagnose':
        case 'diagnostic':
          return await this.diagnoseSetup(params)

        case 'reset':
          return await this.resetConversation(params)

        default:
          // Treat unknown actions as chat messages
          return await this.processChatMessage(action, params)
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Polymarket tool failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { action, params },
        },
      }
    }
  }

  /**
   * Initialize Polymarket provider
   */
  private async initializePolymarket(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      console.log(chalk.blue('🎯 Initializing Polymarket Integration...'))

      // Load Polymarket credentials from config if not in env
      try {
        if (!process.env.POLYMARKET_API_KEY) {
          const apiKey = configManager.getApiKey('polymarket_api_key') || configManager.getApiKey('polymarket-api-key')
          if (apiKey) process.env.POLYMARKET_API_KEY = apiKey
        }
        if (!process.env.POLYMARKET_SECRET) {
          const secret = configManager.getApiKey('polymarket_secret') || configManager.getApiKey('polymarket-secret')
          if (secret) process.env.POLYMARKET_SECRET = secret
        }
        if (!process.env.POLYMARKET_PASSPHRASE) {
          const passphrase =
            configManager.getApiKey('polymarket_passphrase') || configManager.getApiKey('polymarket-passphrase')
          if (passphrase) process.env.POLYMARKET_PASSPHRASE = passphrase
        }
        if (!process.env.POLYMARKET_PRIVATE_KEY) {
          const privateKey =
            configManager.getApiKey('polymarket_private_key') || configManager.getApiKey('polymarket-private-key')
          if (privateKey) process.env.POLYMARKET_PRIVATE_KEY = privateKey
        }
      } catch {}

      // Check if dependencies are installed
      const isInstalled = await PolymarketProvider.isInstalled()
      if (!isInstalled) {
        const error =
          'Polymarket dependencies not installed. Run: pnpm add @polymarket/clob-client @goat-sdk/plugin-polymarket @goat-sdk/adapters-vercel-ai'
        console.log(chalk.red(`❌ ${error}`))
        return {
          success: false,
          data: null,
          error,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Validate environment variables
      try {
        PolymarketProvider.validateEnvironment()
      } catch (envError: any) {
        console.log(chalk.yellow(`⚠️ ${envError.message}`))
        console.log(chalk.gray('Required environment variables:'))
        console.log(chalk.gray('- POLYMARKET_API_KEY'))
        console.log(chalk.gray('- POLYMARKET_SECRET'))
        console.log(chalk.gray('- POLYMARKET_PASSPHRASE'))
        console.log(chalk.gray('- POLYMARKET_PRIVATE_KEY'))
        console.log(chalk.gray('- POLYMARKET_FUNDER_ADDRESS (optional for proxy wallets)'))

        return {
          success: false,
          data: null,
          error: envError.message,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      // Initialize Polymarket provider
      this.polymarketProvider = new PolymarketProvider({ testnet: params.testnet })
      await this.polymarketProvider.initialize({
        testnet: params.testnet,
        funderAddress: params.funderAddress,
      })

      // Simple agent configuration following Coinbase pattern
      const tools = this.polymarketProvider.getTools()
      const systemPrompt = this.polymarketProvider.getSystemPrompt()
      const model = openai('gpt-4-turbo')

      this.agent = {
        tools,
        system: systemPrompt,
        model,
        maxSteps: 10,
      }

      console.log(chalk.blue(`🔧 Tools loaded: ${Object.keys(tools).length} tools`))
      console.log(chalk.gray(`Available tools: ${Object.keys(tools).join(', ')}`))

      this.isInitialized = true

      // Get provider status
      const status = this.polymarketProvider.getStatus()

      console.log(chalk.green('✅ Polymarket integration initialized successfully'))
      console.log(chalk.blue(`🌐 Network: ${status.chain}`))
      console.log(chalk.blue(`🔗 Host: ${status.host}`))
      console.log(chalk.blue(`🤖 AI Tools: ${Object.keys(tools).length} available`))

      if (status.chain !== 'polygon') {
        console.log(chalk.yellow('💰 Using testnet - no real money'))
      } else {
        console.log(chalk.red('⚠️ MAINNET - Real money trading enabled'))
      }

      return {
        success: true,
        data: {
          initialized: true,
          status,
          toolsAvailable: Object.keys(tools).length,
          message: 'Polymarket ready for prediction market operations',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Polymarket initialization failed: ${error.message}`))

      return {
        success: false,
        data: null,
        error: `Initialization failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Process a chat message using AI agent with Polymarket tools
   */
  private async processChatMessage(message: string, options: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    // Auto-initialize if not already initialized
    if (!this.isInitialized || !this.agent) {
      console.log(chalk.blue('🎯 Auto-initializing Polymarket...'))
      try {
        const initResult = await this.initializePolymarket()
        if (!initResult.success) {
          return initResult
        }
      } catch (error: any) {
        console.log(chalk.red(`❌ Auto-initialization failed: ${error.message}`))
        return {
          success: false,
          data: null,
          error: `Auto-initialization failed: ${error.message}`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: { message, options },
          },
        }
      }
    }

    // Additional safety check: ensure agent is properly configured
    if (!this.agent || !this.agent.model || !this.agent.tools) {
      console.log(chalk.red('❌ Polymarket agent not properly configured'))
      return {
        success: false,
        data: null,
        error: 'Polymarket agent not properly configured. Check your credentials and initialization.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    }

    try {
      console.log(chalk.blue(`🎯 Processing: ${message}`))

      // Ensure agent is properly initialized before using
      if (!this.agent) {
        throw new Error('Agent not initialized after auto-init')
      }

      // Smart workflow: Enhanced message with context for GOAT SDK tools
      let enhancedMessage = message

      // Always force tool usage for market queries
      if (/show|search|find|trending|markets|bet|football|sports|politics|crypto/i.test(String(message))) {
        enhancedMessage = `${message}

IMPORTANT: You MUST use the available GOAT SDK tools to get real-time data. Do not provide any market information without first calling the appropriate tools.

Required actions:
1. If searching for markets: Call get_polymarket_events with relevant search terms
2. If showing specific market: Call get_polymarket_market_info with the market ID
3. If discussing betting: Call get_polymarket_market_info for current prices
4. NEVER invent or hallucinate market data

AVAILABLE TOOLS: get_polymarket_events, get_polymarket_market_info, create_order_on_polymarket`
      }

      try {
        if (/https?:\/\/[^\s]*polymarket\.com\//i.test(String(message))) {
          const intent = this.extractBetIntent(String(message))
          const parsed = this.parsePolymarketUrlFromText(String(message))

          // Enhance the message with parsed context for GOAT SDK
          enhancedMessage = `${message}

Context for execution:
- URL parsed: tokenId=${parsed.tokenId}, marketId=${parsed.marketId}, slug=${parsed.slug}
- Intent: side=${intent.side}, amount=${intent.amount}, outcome=${intent.outcome}
- Smart workflow: Use getMarket() first to resolve market data, then execute bet

MANDATORY: Use tools to get real market data before proceeding.`
        }
      } catch {}

      // Add enhanced message to conversation for better GOAT SDK tool usage
      this.conversationMessages.push({
        role: 'user',
        content: enhancedMessage,
      })

      // Prune conversation to respect model input token limits
      const prunedMessages = compactMessages(this.conversationMessages, {
        keepSystem: true,
        maxMessages: 6,
        maxCharsPerMessage: 4000,
      })

      // Generate response using Polymarket AI configuration with explicit tools
      let result: any
      try {
        result = await generateText({
          model: this.agent.model,
          tools: this.agent.tools,
          system: this.agent.system,
          messages: prunedMessages,
          temperature: 1,
          maxSteps: this.agent.maxSteps,
        })
      } catch (aiError: any) {
        console.log(chalk.red(`❌ AI generation failed: ${aiError.message}`))
        return {
          success: false,
          data: null,
          error: `AI processing failed: ${aiError.message}. This might be due to missing Polymarket credentials or invalid market data.`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: { message, options },
          },
        }
      }

      const { text, toolCalls, toolResults } = result || { text: '', toolCalls: [], toolResults: [] }

      // Debug tool usage
      if (toolCalls && toolCalls.length > 0) {
        console.log(chalk.green(`🔧 Tools called: ${toolCalls.length}`))
        toolCalls.forEach((call: any, i: number) => {
          console.log(chalk.gray(`  ${i + 1}. ${call?.toolName || call?.name || 'unknown'}`))
        })
      } else {
        console.log(chalk.yellow(`⚠️ No tools were called - AI may be hallucinating data!`))

        // Fallback: If AI didn't use tools for market queries, try GOAT SDK first, then Gamma API
        if (/show|search|find|trending|markets|football|sports|politics|crypto/i.test(String(message))) {
          console.log(chalk.blue(`🔄 Forcing GOAT SDK tool usage as fallback...`))
          try {
            let markets: any[] = []
            let searchType = 'general'

            // Determine search type and use appropriate Gamma API method
            if (/sports|football|soccer|basketball|tennis/i.test(String(message))) {
              const sport = this.extractSearchTerms(String(message))
              markets = await this.polymarketProvider!.getSportsMarkets(sport, 10)
              searchType = 'sports'
            } else if (/trending|popular|hot/i.test(String(message))) {
              const category = this.extractSearchTerms(String(message))
              markets = await this.polymarketProvider!.getTrendingMarkets({ limit: 10, category })
              searchType = 'trending'
            } else {
              // Fallback to category search or general search
              const searchTerms = this.extractSearchTerms(String(message))
              if (/politics|crypto|science|entertainment/i.test(searchTerms)) {
                markets = await this.polymarketProvider!.searchMarketsByCategory(searchTerms, 10)
                searchType = 'category'
              } else {
                markets = await this.polymarketProvider!.getMarkets({ query: searchTerms, limit: 10 })
                searchType = 'search'
              }
            }

            if (markets && markets.length > 0) {
              let marketSummary = `\n\n🔍 Real-time Polymarket data via Gamma API (${markets.length} ${searchType} markets found):\n\n`

              markets.forEach((market: any, i: number) => {
                marketSummary += `${i + 1}. **${market.title || market.question}**\n`
                marketSummary += `   - Market ID: ${market.id || market.market_id}\n`

                // Show token prices if available
                if (market.tokens && Array.isArray(market.tokens)) {
                  market.tokens.forEach((token: any) => {
                    const name = token.name || token.outcome || 'Unknown'
                    const price = token.price || token.last_price || 'N/A'
                    marketSummary += `   - ${name}: $${price}\n`
                  })
                }

                if (market.volume) marketSummary += `   - Volume: $${market.volume}\n`
                if (market.liquidity) marketSummary += `   - Liquidity: $${market.liquidity}\n`
                if (market.endDate || market.end_date)
                  marketSummary += `   - End Date: ${market.endDate || market.end_date}\n`

                // Add tags if available
                if (market.tags && Array.isArray(market.tags)) {
                  marketSummary += `   - Tags: ${market.tags.join(', ')}\n`
                }

                marketSummary += '\n'
              })

              marketSummary += `\n📊 Data source: Polymarket Gamma API (${searchType} endpoint)\n`
              marketSummary += `⏰ Retrieved at: ${new Date().toISOString()}\n`

              // Append real data to AI response
              return {
                success: true,
                data: {
                  response: text + marketSummary,
                  toolCalls: 0,
                  toolResults: 0,
                  toolsUsed: [`fallback-gamma-${searchType}`],
                  conversationLength: this.conversationMessages.length,
                  fallbackUsed: true,
                  searchType,
                  marketsFound: markets.length,
                },
                metadata: {
                  executionTime: Date.now() - startTime,
                  toolName: this.name,
                  parameters: { message, options },
                },
              }
            } else {
              console.log(chalk.yellow(`📭 No markets found for query: ${message}`))
            }
          } catch (error) {
            console.log(chalk.red(`❌ Fallback Gamma API search failed: ${error}`))
          }
        }
      }

      // Add assistant response to conversation
      this.conversationMessages.push({
        role: 'assistant',
        content: text,
      })

      // Keep conversation history manageable (last 8 messages)
      if (this.conversationMessages.length > 8) {
        this.conversationMessages = this.conversationMessages.slice(-8)
      }

      // Extract tool names if available
      let toolsUsed: string[] = []
      try {
        if (Array.isArray(toolCalls)) {
          toolsUsed = toolCalls
            .map((c: any) => c?.toolName || c?.tool || c?.name)
            .filter(Boolean)
            .map((s: string) => String(s))
        }
      } catch {}

      const toolsUsedNames = toolsUsed && toolsUsed.length > 0 ? ` [${toolsUsed.join(', ')}]` : ''
      console.log(chalk.green(`✅ Response generated (${toolCalls.length} tool calls)${toolsUsedNames}`))

      return {
        success: true,
        data: {
          response: text,
          toolCalls: toolCalls.length,
          toolResults: toolResults.length,
          toolsUsed,
          conversationLength: this.conversationMessages.length,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    } catch (error: any) {
      console.log(chalk.red(`❌ Chat processing failed: ${error.message}`))

      return {
        success: false,
        data: null,
        error: `Chat processing failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: { message, options },
        },
      }
    }
  }

  /**
   * Place a bet with user confirmation
   */
  private async placeBet(params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized. Use action "init" first.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
    try {
      // Accept both structured params and free-form text (message/url)
      let tokenId: string | undefined = params.tokenId || params.token
      let marketId: string | undefined = params.marketId
      let side: string | undefined = params.side || params.outcome
      let amount: number | string | undefined = params.amount || params.value
      let desiredOutcome: 'YES' | 'NO' | undefined

      const freeText: string | undefined =
        typeof params === 'string' ? params : params.message || params.text || params.url || params.query || undefined

      if (freeText) {
        const intent = this.extractBetIntent(freeText)
        tokenId = tokenId || intent.tokenId
        marketId = marketId || intent.marketId
        side = side || intent.side
        amount = amount || intent.amount
        desiredOutcome = intent.outcome

        // Parse any URL in text for marketId/tokenId/slug
        const parsed = this.parsePolymarketUrlFromText(freeText)
        tokenId = tokenId || parsed.tokenId
        marketId = marketId || parsed.marketId

        // If a non-hex/invalid tokenId was parsed (e.g., UI tid), discard it
        if (tokenId && !isLikelyTokenId(String(tokenId))) {
          tokenId = undefined
        }

        // If we still don't have a valid tokenId, resolve via provider using marketId or slug
        if (!tokenId) {
          const slug = parsed.slug
          let resolved = await this.resolveMarketAndToken({ marketId, slug, outcome: desiredOutcome })

          // If no slug found, force AI to search using tools
          if (!resolved && freeText) {
            console.log(chalk.blue(`🔍 No URL found, forcing AI tool search for: "${freeText}"`))
            return await this.forceAIToolSearch(
              freeText,
              desiredOutcome,
              side,
              typeof amount === 'string' ? parseFloat(amount) : amount
            )
          }

          tokenId = resolved?.tokenId || tokenId
          marketId = resolved?.marketId || marketId
        }
      }

      // Defaults if missing
      side = (side || 'BUY').toString().toUpperCase()
      desiredOutcome = desiredOutcome || (side === 'SELL' ? 'NO' : 'YES')
      amount = typeof amount === 'string' ? parseFloat(amount) : amount

      // If we still don't have a tokenId, offer interactive resolution before bailing
      if (!tokenId) {
        const doInteractive = params.interactive !== false
        let inquirer: any
        if (doInteractive) {
          try {
            inquirer = require('inquirer')
          } catch {}
        }

        if (inquirer) {
          const { action } = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'Token not resolved. How do you want to proceed?',
              choices: [
                { name: 'Paste tokenId', value: 'token' },
                { name: 'Paste market URL (I will resolve token YES/NO)', value: 'url' },
                { name: 'Cancel', value: 'cancel' },
              ],
            },
          ])

          if (action === 'cancel') {
            await this.resetConversation()
            return {
              success: true,
              data: { cancelled: true, message: 'Operation cancelled' },
              metadata: {
                executionTime: Date.now() - startTime,
                toolName: this.name,
                parameters: params,
              },
            }
          }

          if (action === 'token') {
            const { pasted } = await inquirer.prompt([
              { type: 'input', name: 'pasted', message: 'Enter tokenId (0x...)' },
            ])
            if (pasted && typeof pasted === 'string' && pasted.trim()) {
              tokenId = pasted.trim()
            }
          } else if (action === 'url') {
            const { pastedUrl, outcomeChoice } = await inquirer.prompt([
              { type: 'input', name: 'pastedUrl', message: 'Enter Polymarket event/market URL' },
              { type: 'list', name: 'outcomeChoice', message: 'Outcome', choices: ['YES', 'NO'], default: 'YES' },
            ])
            const parsed = this.parsePolymarketUrlFromText(String(pastedUrl || ''))
            const slug = parsed.slug
            if (slug) {
              const resolved = await this.resolveMarketAndToken({ slug, outcome: outcomeChoice })
              marketId = resolved?.marketId || marketId
              tokenId = resolved?.tokenId || tokenId
              desiredOutcome = (outcomeChoice as any) || desiredOutcome
              side = desiredOutcome === 'NO' ? 'SELL' : 'BUY'
            }
          }
        }

        if (!tokenId) {
          return {
            success: false,
            data: null,
            error: 'Could not resolve tokenId. Provide tokenId or a valid event/market URL so I can resolve it.',
            metadata: {
              executionTime: Date.now() - startTime,
              toolName: this.name,
              parameters: params,
            },
          }
        }
      }

      // Interactive confirmation via inquirer (fallback to chat if unavailable)
      const doInteractive = params.interactive !== false
      if (doInteractive) {
        let inquirer: any
        try {
          inquirer = require('inquirer')
        } catch {}

        if (inquirer) {
          const summary = {
            tokenId,
            side,
            amount: amount ?? '?',
            orderType: params.orderType || 'MARKET',
            marketId: marketId || 'unknown',
          }

          console.log(chalk.blue('\n📄 Bet Summary'))
          console.log(chalk.gray('─'.repeat(40)))
          console.log(chalk.white(`Market: ${summary.marketId}`))
          console.log(chalk.white(`Token:  ${summary.tokenId}`))
          console.log(chalk.white(`Side:   ${summary.side}`))
          console.log(chalk.white(`Amount: ${summary.amount} USDC`))
          console.log(chalk.white(`Type:   ${summary.orderType}`))

          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Proceed with this bet?',
              default: false,
            },
          ])

          if (!confirm) {
            // Clean up and return to prompt
            await this.resetConversation()
            return {
              success: true,
              data: { cancelled: true, message: 'Bet cancelled by user' },
              metadata: {
                executionTime: Date.now() - startTime,
                toolName: this.name,
                parameters: params,
              },
            }
          }

          // Execute MARKET order directly using provider
          const result = await this.polymarketProvider!.placeBet({
            tokenId,
            side: side as 'BUY' | 'SELL',
            amount: Number(amount ?? 0),
            orderType: (params.orderType || 'MARKET') as 'MARKET' | 'LIMIT',
            ...(params.price ? { price: Number(params.price) } : {}),
          })

          return {
            success: true,
            data: { placed: true, result, tokenId, side, amount },
            metadata: {
              executionTime: Date.now() - startTime,
              toolName: this.name,
              parameters: params,
            },
          }
        }
      }

      // Fallback: go through AI/tool confirmation path if interactive prompt is unavailable
      const price = params.price ? ` at price ${params.price}` : ''
      const safeAmount = amount ?? '?'
      const betMessage = `Place a ${side} bet of ${safeAmount} USDC on token ${tokenId}${price}. Execute the bet with confirmation.`
      return await this.processChatMessage(betMessage, { isBet: true })
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to prepare bet: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Search prediction markets
   */
  private async searchMarkets(params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    // Auto-initialize if not already initialized
    if (!this.isInitialized || !this.polymarketProvider) {
      console.log(chalk.blue('🎯 Auto-initializing Polymarket for search...'))
      try {
        const initResult = await this.initializePolymarket()
        if (!initResult.success) {
          return initResult
        }
      } catch (error: any) {
        return {
          success: false,
          data: null,
          error: `Auto-initialization failed: ${error.message}`,
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }
    }

    try {
      const query = params.query || params.search || params
      const limit = params.limit || 10

      // Ensure provider is available after auto-init
      if (!this.polymarketProvider) {
        throw new Error('Polymarket provider not initialized after auto-init')
      }

      const markets = await this.polymarketProvider.getMarkets({ query, limit })

      return {
        success: true,
        data: {
          markets,
          count: markets.length,
          query,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to search markets: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get trending markets using Gamma API
   */
  private async getTrendingMarkets(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const limit = params.limit || 10
      const category = params.category || params.tag

      const markets = await this.polymarketProvider.getTrendingMarkets({ limit, category })

      return {
        success: true,
        data: {
          markets,
          count: markets.length,
          category: category || 'all',
          source: 'gamma-api',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get trending markets: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get sports markets using Gamma API
   */
  private async getSportsMarkets(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const sport = params.sport || params.query || params
      const limit = params.limit || 10

      const markets = await this.polymarketProvider.getSportsMarkets(sport, limit)

      return {
        success: true,
        data: {
          markets,
          count: markets.length,
          sport: sport || 'all',
          source: 'gamma-api-sports',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get sports markets: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get real-time market prices using Gamma API
   */
  private async getMarketPrices(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      let marketIds: string[] = []

      if (params.marketIds) {
        marketIds = Array.isArray(params.marketIds) ? params.marketIds : [params.marketIds]
      } else if (params.markets) {
        marketIds = Array.isArray(params.markets) ? params.markets : [params.markets]
      } else if (typeof params === 'string') {
        marketIds = [params]
      }

      if (marketIds.length === 0) {
        return {
          success: false,
          data: null,
          error: 'No market IDs provided for price lookup',
          metadata: {
            executionTime: Date.now() - startTime,
            toolName: this.name,
            parameters: params,
          },
        }
      }

      const prices = await this.polymarketProvider.getMarketPrices(marketIds)

      return {
        success: true,
        data: {
          prices,
          marketCount: Object.keys(prices).length,
          source: 'gamma-api-prices',
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get market prices: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get detailed market information
   */
  private async getMarketInfo(params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const marketId = params.marketId || params.id || params
      const market = await this.polymarketProvider.getMarket(marketId)

      return {
        success: true,
        data: { market },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get market info: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get user positions
   */
  private async getPositions(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const positions = await this.polymarketProvider.getPositions()

      return {
        success: true,
        data: { positions },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get positions: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get user orders
   */
  private async getOrders(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const orders = await this.polymarketProvider.getOrders({ marketId: params.marketId })

      return {
        success: true,
        data: { orders },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to get orders: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Cancel an order
   */
  private async cancelOrder(params: any): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    if (!this.isInitialized || !this.polymarketProvider) {
      return {
        success: false,
        data: null,
        error: 'Polymarket not initialized.',
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }

    try {
      const orderId = params.orderId || params.id || params
      if (!orderId) {
        throw new Error('Order ID required')
      }

      const result = await this.polymarketProvider.cancelOrder(orderId)

      return {
        success: true,
        data: { result, orderId },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Failed to cancel order: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Get tool status
   */
  private async getStatus(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    const providerStatus = this.polymarketProvider?.getStatus()

    return {
      success: true,
      data: {
        initialized: this.isInitialized,
        conversationLength: this.conversationMessages.length,
        agentConfigured: !!this.agent,
        providerStatus,
        message: this.isInitialized
          ? 'Polymarket tool is ready for prediction market operations'
          : 'Polymarket tool not initialized. Use action "init" first.',
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }

  /**
   * Diagnose setup and configuration issues
   */
  private async diagnoseSetup(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()

    try {
      const diagnosis = await PolymarketProvider.diagnoseSetup()

      return {
        success: true,
        data: {
          diagnosis,
          summary: {
            dependencies: diagnosis.dependencies ? '✅ Installed' : '❌ Missing',
            credentials: diagnosis.credentials ? '✅ Valid' : '❌ Invalid',
            issues: diagnosis.issues.length,
            recommendations: diagnosis.recommendations.length,
          },
          message:
            diagnosis.issues.length === 0
              ? 'Polymarket setup is correctly configured'
              : `Found ${diagnosis.issues.length} issue(s) that need attention`,
        },
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    } catch (error: any) {
      return {
        success: false,
        data: null,
        error: `Diagnosis failed: ${error.message}`,
        metadata: {
          executionTime: Date.now() - startTime,
          toolName: this.name,
          parameters: params,
        },
      }
    }
  }

  /**
   * Reset conversation history (simplified)
   */
  private async resetConversation(params: any = {}): Promise<ToolExecutionResult> {
    const startTime = Date.now()
    const previousLength = this.conversationMessages.length

    this.conversationMessages = []

    return {
      success: true,
      data: {
        previousLength,
        currentLength: 0,
        message: 'Conversation history reset',
      },
      metadata: {
        executionTime: Date.now() - startTime,
        toolName: this.name,
        parameters: params,
      },
    }
  }

  // ===== Polymarket parsing and resolution helpers (as class methods) =====
  private getFirstUrl(text: string): string | undefined {
    try {
      const m = text.match(/https?:\/\/[^\s]+/i)
      return m ? m[0] : undefined
    } catch {
      return undefined
    }
  }

  private parsePolymarketUrl(input: string): { tokenId?: string; marketId?: string; slug?: string } {
    try {
      const url = new URL(input)
      const out: { tokenId?: string; marketId?: string; slug?: string } = {}

      // Check for token ID in query parameters (tid, tokenId, token)
      const tokenIdParam =
        url.searchParams.get('tid') || url.searchParams.get('tokenId') || url.searchParams.get('token')
      if (tokenIdParam) out.tokenId = tokenIdParam

      // Check for market ID in query parameters
      const marketIdParam = url.searchParams.get('marketId')
      if (marketIdParam) out.marketId = marketIdParam

      const parts = url.pathname.split('/').filter(Boolean)

      // Parse /market/{marketId} URLs
      const marketIdx = parts.findIndex((p) => p.toLowerCase() === 'market')
      if (!out.marketId && marketIdx >= 0 && parts[marketIdx + 1]) {
        out.marketId = parts[marketIdx + 1]
      }

      // Parse /event/{slug} URLs
      const eventIdx = parts.findIndex((p) => p.toLowerCase() === 'event')
      if (eventIdx >= 0 && parts[eventIdx + 1]) {
        out.slug = parts.slice(eventIdx + 1).join('/')
      }

      return out
    } catch {
      return {}
    }
  }

  private parsePolymarketUrlFromText(text: string): { tokenId?: string; marketId?: string; slug?: string } {
    const url = this.getFirstUrl(text)
    if (!url) return {}
    return this.parsePolymarketUrl(url)
  }

  private extractBetIntent(text: string): {
    tokenId?: string
    marketId?: string
    side?: string
    amount?: number
    outcome?: 'YES' | 'NO'
  } {
    const upper = text.toUpperCase()
    const side = upper.includes('SELL') ? 'SELL' : 'BUY'
    const outcome = upper.includes('NO') ? 'NO' : 'YES'
    const amtMatch = upper.match(/(\d+[\.,]?\d*)\s*USDC/) || upper.match(/USDC\s*(\d+[\.,]?\d*)/)
    const amount = amtMatch ? parseFloat(amtMatch[1].replace(',', '.')) : undefined

    const linkParsed = this.parsePolymarketUrlFromText(text)
    return {
      tokenId: linkParsed.tokenId,
      marketId: linkParsed.marketId,
      side,
      amount,
      outcome: outcome as 'YES' | 'NO',
    }
  }

  private extractSearchTerms(text: string): string {
    // Extract meaningful search terms from user query
    const cleanText = text
      .replace(/show me|find|search|trending|markets|bets/gi, '')
      .replace(/\b(now|current|latest|today)\b/gi, '')
      .trim()

    // If we have specific terms, use them, otherwise use broader categories
    if (cleanText.length > 3) {
      return cleanText
    }

    // Fallback to detected categories
    if (/football|soccer|sports/i.test(text)) return 'football'
    if (/politics|election|trump|biden/i.test(text)) return 'politics'
    if (/crypto|bitcoin|ethereum/i.test(text)) return 'crypto'
    if (/ai|artificial intelligence/i.test(text)) return 'AI'

    return 'trending' // Default fallback
  }

  /**
   * Search for market by text description
   */
  private async searchMarketByDescription(
    description: string,
    outcome: 'YES' | 'NO' = 'YES'
  ): Promise<{ marketId?: string; tokenId?: string } | undefined> {
    if (!this.polymarketProvider) return undefined

    try {
      console.log(chalk.blue(`🔍 Searching markets by description: "${description}"`))

      // Extract key search terms from description
      const searchTerms = this.extractBetSearchTerms(description)
      console.log(chalk.gray(`  → Search terms: "${searchTerms}"`))

      // Search using multiple methods
      let markets: any[] = []

      // First try category-based search for better relevance
      const category = this.detectCategory(description)
      if (category) {
        try {
          markets = await this.polymarketProvider.searchMarketsByCategory(category, 10)
          console.log(chalk.gray(`  → Category search (${category}) found ${markets.length} markets`))
        } catch (error) {
          console.log(chalk.yellow(`  ⚠️ Category search failed: ${error}`))
        }
      }

      // If no category results, try trending markets in that category
      if (markets.length === 0 && category) {
        try {
          markets = await this.polymarketProvider.getTrendingMarkets({ limit: 10, category })
          console.log(chalk.gray(`  → Trending search (${category}) found ${markets.length} markets`))
        } catch (error) {
          console.log(chalk.yellow(`  ⚠️ Trending search failed: ${error}`))
        }
      }

      // Fallback to general search only if category searches failed
      if (markets.length === 0) {
        try {
          markets = await this.polymarketProvider.getMarkets({ query: searchTerms, limit: 5 })
          console.log(chalk.gray(`  → General search found ${markets.length} markets`))
        } catch (error) {
          console.log(chalk.yellow(`  ⚠️ General search failed: ${error}`))
        }
      }

      if (markets.length === 0) {
        console.log(chalk.yellow(`  📭 No markets found for description`))
        return undefined
      }

      // Find best match using fuzzy matching
      const bestMatch = this.findBestMarketMatch(markets, description)
      if (!bestMatch) {
        console.log(chalk.yellow(`  ❓ No good match found among ${markets.length} markets`))
        return undefined
      }

      const marketId = bestMatch.id || bestMatch.market_id
      console.log(chalk.green(`  ✅ Best match: "${bestMatch.title}" (ID: ${marketId})`))

      // Try to get token directly from the search result first
      let tokenId = findYesNoTokenId(bestMatch, outcome)

      if (tokenId) {
        console.log(chalk.green(`  ✅ Token found in search result: ${tokenId} for ${outcome}`))
        return { marketId, tokenId }
      }

      // If not found in search result, try to get full market details via Gamma API
      try {
        console.log(chalk.gray(`  → Fetching full market details via Gamma API...`))
        const gammaUrl = `https://gamma-api.polymarket.com/markets/${marketId}`
        const market = await this.polymarketProvider!.fetchJson(gammaUrl)

        if (market) {
          tokenId = findYesNoTokenId(market, outcome)
          if (tokenId) {
            console.log(chalk.green(`  ✅ Token resolved via Gamma: ${tokenId} for ${outcome}`))
            return { marketId, tokenId }
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`  ⚠️ Gamma API fetch failed: ${error}`))
      }

      // Final fallback: try CLOB API (may fail with 403)
      try {
        console.log(chalk.gray(`  → Trying CLOB API as last resort...`))
        const market = await this.polymarketProvider.getMarket(marketId)
        tokenId = findYesNoTokenId(market, outcome)

        if (tokenId) {
          console.log(chalk.green(`  ✅ Token resolved via CLOB: ${tokenId} for ${outcome}`))
          return { marketId, tokenId }
        }
      } catch (error) {
        console.log(chalk.red(`  ❌ CLOB API failed (likely 403): ${error}`))
      }

      console.log(chalk.yellow(`  ⚠️ Could not resolve ${outcome} token for market ${marketId}`))
      return { marketId }
    } catch (error) {
      console.log(chalk.red(`❌ Market search by description failed: ${error}`))
      return undefined
    }
  }

  /**
   * Extract search terms optimized for betting descriptions
   */
  private extractBetSearchTerms(text: string): string {
    // Remove betting-specific terms and amounts
    const cleanText = text
      .replace(/\b\d+\s*usdc?\b/gi, '') // Remove amounts like "1USDC"
      .replace(/\b(yes|no|buy|sell)\b/gi, '') // Remove bet direction
      .replace(/\b(bet|betting|place|until|end|before|after)\b/gi, '') // Remove bet terms
      .replace(/[,;]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()

    return cleanText
  }

  /**
   * Detect category from description
   */
  private detectCategory(text: string): string | undefined {
    const _lower = text.toLowerCase()

    if (/nato|russia|war|military|conflict|ukraine/i.test(text)) return 'politics'
    if (/trump|biden|election|president|congress|senate/i.test(text)) return 'politics'
    if (/football|soccer|basketball|tennis|sports|nfl|nba/i.test(text)) return 'sports'
    if (/bitcoin|ethereum|crypto|btc|eth|defi/i.test(text)) return 'crypto'
    if (/ai|artificial intelligence|chatgpt|openai/i.test(text)) return 'science'

    return undefined
  }

  /**
   * Find best matching market using fuzzy string matching
   */
  private findBestMarketMatch(markets: any[], description: string): any | undefined {
    if (markets.length === 0) return undefined
    if (markets.length === 1) return markets[0]

    const searchTerms = this.extractBetSearchTerms(description).toLowerCase()
    let bestMatch = markets[0]
    let bestScore = 0

    for (const market of markets) {
      const title = (market.title || market.question || '').toLowerCase()
      const score = this.calculateMatchScore(searchTerms, title)

      console.log(chalk.gray(`    → "${market.title}": score ${score}`))

      if (score > bestScore) {
        bestScore = score
        bestMatch = market
      }
    }

    // Only return if we have a decent match (at least 30% similarity)
    return bestScore > 0.3 ? bestMatch : undefined
  }

  /**
   * Calculate similarity score between search terms and market title
   */
  private calculateMatchScore(searchTerms: string, title: string): number {
    const searchWords = searchTerms.split(/\s+/).filter((w) => w.length > 2)
    const titleWords = title.split(/\s+/)

    if (searchWords.length === 0) return 0

    let matches = 0
    for (const searchWord of searchWords) {
      for (const titleWord of titleWords) {
        if (titleWord.includes(searchWord) || searchWord.includes(titleWord)) {
          matches++
          break
        }
      }
    }

    return matches / searchWords.length
  }

  /**
   * Force AI to search for markets using tools instead of manual search
   */
  private async forceAIToolSearch(
    description: string,
    outcome: 'YES' | 'NO' = 'YES',
    side?: string,
    amount?: number
  ): Promise<ToolExecutionResult> {
    console.log(chalk.blue(`🤖 Forcing AI to search for real markets: "${description}"`))

    // Create a very specific prompt that forces tool usage with GOAT SDK tools
    const searchPrompt = `URGENT: I need to find a REAL, CURRENT Polymarket prediction market for: "${description}"

MANDATORY REQUIREMENTS:
1. You MUST use get_polymarket_events tool to search for current markets related to: ${description}
2. You MUST find markets that are ACTIVE and OPEN for betting
3. You MUST provide the exact marketId and tokenId for ${outcome} outcome
4. DO NOT make up or hallucinate any market data
5. If no exact match exists, find the closest related REAL market

AVAILABLE TOOLS (USE THESE):
- get_polymarket_events: Search for prediction markets
- get_polymarket_market_info: Get detailed market information
- create_order_on_polymarket: Place bets (after finding market)

Search terms to use: ${this.extractBetSearchTerms(description)}
Desired outcome: ${outcome}
${amount ? `Bet amount: ${amount} USDC` : ''}
${side ? `Bet side: ${side}` : ''}

EXECUTE NOW: 
1. Call get_polymarket_events with search terms related to "${description}"
2. Find the best matching market
3. Call get_polymarket_market_info for detailed market data
4. Provide marketId and tokenId for betting

START WITH: get_polymarket_events`

    try {
      // Force the AI to process this search request
      const result = await this.processChatMessage(searchPrompt, { forcedSearch: true })

      if (result.success) {
        // Check if the AI actually used tools
        if (result.data?.toolsUsed && result.data.toolsUsed.length > 0) {
          console.log(chalk.green(`✅ AI used tools: ${result.data.toolsUsed.join(', ')}`))

          // Try to extract market info from the AI response
          const marketInfo = this.extractMarketInfoFromAIResponse(result.data.response)
          if (marketInfo.marketId && marketInfo.tokenId) {
            console.log(chalk.green(`✅ AI found market: ${marketInfo.marketId}, token: ${marketInfo.tokenId}`))

            // Return the betting result directly
            return {
              success: true,
              data: {
                aiSearched: true,
                marketId: marketInfo.marketId,
                tokenId: marketInfo.tokenId,
                outcome,
                response: result.data.response,
                message: `AI found and analyzed real market data for: ${description}`,
              },
              metadata: result.metadata,
            }
          }
        }

        // If AI didn't use tools or find specific market, return the analysis
        return {
          success: true,
          data: {
            aiSearched: true,
            response: result.data.response,
            toolsUsed: result.data?.toolsUsed || [],
            message: `AI analysis for: ${description}`,
            needsManualReview: true,
          },
          metadata: result.metadata,
        }
      }

      return result
    } catch (error: any) {
      console.log(chalk.red(`❌ Forced AI search failed: ${error.message}`))
      return {
        success: false,
        data: null,
        error: `AI search failed: ${error.message}`,
        metadata: {
          executionTime: Date.now(),
          toolName: this.name,
          parameters: { description, outcome, side, amount },
        },
      }
    }
  }

  /**
   * Extract market ID and token ID from AI response
   */
  private extractMarketInfoFromAIResponse(response: string): { marketId?: string; tokenId?: string } {
    const marketIdMatch = response.match(/market\s*id[:\s]*([a-zA-Z0-9-_]+)/i)
    const tokenIdMatch = response.match(/token\s*id[:\s]*(0x[a-fA-F0-9]+)/i)

    return {
      marketId: marketIdMatch?.[1],
      tokenId: tokenIdMatch?.[1],
    }
  }

  private async resolveMarketAndToken(opts: {
    marketId?: string
    slug?: string
    outcome?: 'YES' | 'NO'
  }): Promise<{ marketId?: string; tokenId?: string } | undefined> {
    if (!this.polymarketProvider) return undefined

    console.log(chalk.blue(`🔍 Resolving market and token for: ${JSON.stringify(opts)}`))

    let marketId = opts.marketId
    let tokenId: string | undefined

    // Step 1: Resolve marketId if we have a slug
    if (!marketId && opts.slug) {
      console.log(chalk.gray(`  → Resolving slug: ${opts.slug}`))

      // Try Gamma API slug resolution first (most reliable)
      try {
        const resolved = await this.polymarketProvider.resolveFromSlug(opts.slug, opts.outcome || 'YES')
        if (resolved?.marketId && resolved?.tokenId) {
          console.log(
            chalk.green(`  ✅ Gamma API resolved: marketId=${resolved.marketId}, tokenId=${resolved.tokenId}`)
          )
          return { marketId: resolved.marketId, tokenId: resolved.tokenId }
        }
      } catch (error) {
        console.log(chalk.yellow(`  ⚠️ Gamma API resolution failed: ${error}`))
      }

      // Fallback: Search markets by slug/query
      try {
        const results = await this.polymarketProvider.getMarkets({ query: opts.slug, limit: 5 })
        if (Array.isArray(results) && results.length > 0) {
          // Try to find exact slug match first
          let match = results.find((r: any) => r.slug === opts.slug)
          if (!match) {
            // Fallback to partial match or first result
            match = results.find((r: any) => r.slug && String(r.slug).includes(opts.slug!)) || results[0]
          }

          if (match) {
            marketId = match.id || match.market_id
            console.log(chalk.green(`  ✅ Market search resolved: marketId=${marketId}, title="${match.title}"`))
          }
        }
      } catch (error) {
        console.log(chalk.yellow(`  ⚠️ Market search failed: ${error}`))
      }
    }

    // Step 2: Get full market details and extract tokenId
    if (marketId) {
      try {
        console.log(chalk.gray(`  → Fetching market details for: ${marketId}`))
        const market = await this.polymarketProvider.getMarket(marketId)

        if (market) {
          tokenId = findYesNoTokenId(market, opts.outcome || 'YES')
          console.log(chalk.green(`  ✅ Token resolved: ${tokenId} for outcome ${opts.outcome || 'YES'}`))

          // Log market structure for debugging
          console.log(
            chalk.gray(
              `  → Market structure: ${JSON.stringify({
                id: market.id || market.market_id,
                title: market.title || market.question,
                tokens: market.tokens?.length || 0,
                outcomes: market.outcomes?.length || 0,
                outcomeTokens: market.outcomeTokens?.length || 0,
              })}`
            )
          )
        }
      } catch (error) {
        console.log(chalk.red(`  ❌ Failed to fetch market details: ${error}`))
      }
    }

    const result = { marketId, tokenId }
    console.log(chalk.blue(`🔍 Final resolution: ${JSON.stringify(result)}`))

    return marketId ? result : undefined
  }
}

// Helpers: compact and clip messages to avoid token overflow
function compactMessages(
  messages: CoreMessage[],
  options: { keepSystem?: boolean; maxMessages?: number; maxCharsPerMessage?: number }
): CoreMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return []
  const keepSystem = options.keepSystem ?? true
  const maxMessages = options.maxMessages ?? 6
  const maxCharsPerMessage = options.maxCharsPerMessage ?? 4000

  const out: CoreMessage[] = []
  let startIdx = 0
  let systemPushed = false

  if (keepSystem && messages[0]?.role === 'system') {
    out.push(messages[0])
    startIdx = 1
    systemPushed = true
  }

  const tail = messages.slice(startIdx).slice(-maxMessages)
  for (const msg of tail) {
    const text = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    const clipped = text.length > maxCharsPerMessage ? text.slice(-maxCharsPerMessage) : text
    if (msg.role === 'tool') {
      // Collapse tool messages into assistant text to avoid schema mismatches
      out.push({ role: 'assistant', content: clipped })
    } else {
      out.push({ role: msg.role, content: clipped })
    }
  }

  // Ensure we don't exceed total messages including system
  if (systemPushed && out.length > maxMessages + 1) {
    return [out[0], ...out.slice(out.length - maxMessages)]
  }
  if (!systemPushed && out.length > maxMessages) {
    return out.slice(out.length - maxMessages)
  }
  return out
}

// ===== Polymarket parsing and resolution helpers =====

// Class methods
export interface ResolvedMarketToken {
  marketId?: string
  tokenId?: string
}

// Instance helpers via class methods already declared above

function findYesNoTokenId(market: any, outcome: 'YES' | 'NO'): string | undefined {
  try {
    const yesKeys = ['YES', 'Y', 'TRUE', '1', 'WIN', 'WILL HAPPEN', 'HAPPEN']
    const noKeys = ['NO', 'N', 'FALSE', '0', 'LOSE', 'WILL NOT HAPPEN', 'NOT HAPPEN', "WON'T HAPPEN"]
    const desired = outcome === 'YES' ? yesKeys : noKeys

    console.log(
      chalk.gray(
        `    → Looking for ${outcome} token in market with ${JSON.stringify({
          tokens: market?.tokens?.length || 0,
          outcomes: market?.outcomes?.length || 0,
          outcomeTokens: market?.outcomeTokens?.length || 0,
        })}`
      )
    )

    // Helper function to extract token ID from various field names
    const getTokenId = (obj: any): string | undefined => {
      return obj?.token_id || obj?.tokenId || obj?.id || obj?.address
    }

    // Helper function to match outcome names
    const matchesOutcome = (name: string): boolean => {
      const upperName = String(name || '')
        .toUpperCase()
        .trim()
      return desired.some((key) => upperName.includes(key) || key.includes(upperName))
    }

    // Search in tokens array
    if (Array.isArray(market?.tokens)) {
      console.log(chalk.gray(`    → Searching ${market.tokens.length} tokens`))
      for (const t of market.tokens) {
        const names = [t?.name, t?.outcome, t?.label, t?.symbol].filter(Boolean)
        for (const name of names) {
          if (matchesOutcome(String(name))) {
            const tokenId = getTokenId(t)
            if (tokenId) {
              console.log(chalk.green(`    ✅ Found ${outcome} token: ${tokenId} (name: "${name}")`))
              return tokenId
            }
          }
        }
      }
    }

    // Search in outcomes array
    if (Array.isArray(market?.outcomes)) {
      console.log(chalk.gray(`    → Searching ${market.outcomes.length} outcomes`))
      for (const o of market.outcomes) {
        const names = [o?.name, o?.outcome, o?.label, o?.title].filter(Boolean)
        for (const name of names) {
          if (matchesOutcome(String(name))) {
            const tokenId = getTokenId(o)
            if (tokenId) {
              console.log(chalk.green(`    ✅ Found ${outcome} token: ${tokenId} (name: "${name}")`))
              return tokenId
            }
          }
        }
      }
    }

    // Search in outcomeTokens array
    if (Array.isArray(market?.outcomeTokens)) {
      console.log(chalk.gray(`    → Searching ${market.outcomeTokens.length} outcomeTokens`))
      for (const t of market.outcomeTokens) {
        const names = [t?.label, t?.name, t?.outcome, t?.symbol].filter(Boolean)
        for (const name of names) {
          if (matchesOutcome(String(name))) {
            const tokenId = getTokenId(t)
            if (tokenId) {
              console.log(chalk.green(`    ✅ Found ${outcome} token: ${tokenId} (name: "${name}")`))
              return tokenId
            }
          }
        }
      }
    }

    // If binary market, try positional matching (index 0 = YES, index 1 = NO)
    const tokenArrays = [market?.tokens, market?.outcomes, market?.outcomeTokens].filter(Array.isArray)
    for (const arr of tokenArrays) {
      if (arr.length === 2) {
        const targetIndex = outcome === 'YES' ? 0 : 1
        const token = arr[targetIndex]
        const tokenId = getTokenId(token)
        if (tokenId) {
          console.log(chalk.green(`    ✅ Found ${outcome} token by position: ${tokenId} (index ${targetIndex})`))
          return tokenId
        }
      }
    }

    console.log(chalk.yellow(`    ⚠️ No ${outcome} token found in market`))
  } catch (error) {
    console.log(chalk.red(`    ❌ Error finding token: ${error}`))
  }
  return undefined
}

// Basic validator to distinguish real Polymarket token IDs (hex/0x) from UI tids
function isLikelyTokenId(value: string): boolean {
  try {
    const v = String(value).trim()
    if (!v) return false
    if (/^0x[a-fA-F0-9]{40,}$/.test(v)) return true
    if (/^[a-fA-F0-9]{40,}$/.test(v)) return true
  } catch {}
  return false
}

// Tool configuration and usage examples
export const polymarketToolConfig = {
  name: 'polymarket',
  description: 'Official Polymarket integration for prediction market trading',
  category: 'trading',
  requiredEnv: ['POLYMARKET_API_KEY', 'POLYMARKET_SECRET', 'POLYMARKET_PASSPHRASE', 'POLYMARKET_PRIVATE_KEY'],
  optionalEnv: ['POLYMARKET_FUNDER_ADDRESS', 'OPENAI_API_KEY'],
  actions: [
    'init - Initialize Polymarket with credentials',
    'chat <message> - Send natural language prediction market requests',
    'bet <params> - Place bets with confirmation',
    'markets <query> - Search prediction markets',
    'market-info <id> - Get detailed market information',
    'positions - Get current betting positions',
    'orders - Get active orders',
    'cancel-order <id> - Cancel an order',
    'status - Get tool status',
    'reset - Reset conversation history',
  ],
  examples: [
    'secureTools.execute("polymarket", "init")',
    'secureTools.execute("polymarket", "chat", { message: "Show me markets about AI" })',
    'secureTools.execute("polymarket", "bet", { tokenId: "123", side: "BUY", amount: 10 })',
    'secureTools.execute("polymarket", "markets", { query: "bitcoin price", limit: 5 })',
  ],
}

export type PolymarketToolAction =
  | 'init'
  | 'initialize'
  | 'chat'
  | 'message'
  | 'analyze'
  | 'bet'
  | 'place-bet'
  | 'markets'
  | 'search-markets'
  | 'market-info'
  | 'market'
  | 'positions'
  | 'portfolio'
  | 'orders'
  | 'cancel-order'
  | 'status'
  | 'reset'
