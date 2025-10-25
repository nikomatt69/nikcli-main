import { openai } from '@ai-sdk/openai'
import type { CoreMessage } from 'ai'
import { generateText, streamText } from 'ai'
import chalk from 'chalk'
import { configManager } from '../core/config-manager'
import { logger } from '../utils/logger'
import { BaseTool, type ToolExecutionResult } from './base-tool'
import {
    PolymarketProvider,
    type PolymarketSide,
    type PolymarketTimeInForce,
} from '../onchain/polymarket-provider'

/**
 * PolymarketTool - Official Polymarket CLOB Integration as NikCLI Tool
 *
 * This tool provides access to Polymarket prediction markets through the standard
 * NikCLI tool interface. It uses the same architecture as the Coinbase AgentKit tool.
 *
 * Features:
 * - Market discovery and orderbook access
 * - Position and trade tracking
 * - Order placement with user confirmation
 * - Secure environment variable handling
 * - Audit logging for compliance
 * - Conversational AI interface for natural language trading operations
 */
export class PolymarketTool extends BaseTool {
    private provider: PolymarketProvider | null = null
    private isInitialized: boolean = false
    private conversationMessages: CoreMessage[] = []
    private toolHintInjected: boolean = false

    private agent: {
        tools?: any
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
     * @param action - The action to perform: 'init', 'markets', 'book', 'price', etc.
     * @param params - Parameters for the action
     */
    async execute(action: string, params: any = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now()

        logger.debug(`Polymarket tool action`, {
            action,
            hasParams: !!params && Object.keys(params).length > 0,
        })

        try {
            switch (action.toLowerCase()) {
                case 'init':
                case 'initialize':
                    return await this.initializeProvider(params)

                case 'markets':
                    return await this.handleMarkets(params)

                case 'book':
                case 'orderbook':
                    return await this.handleOrderBook(params)

                case 'price':
                case 'quote':
                    return await this.handlePrice(params)

                case 'orders':
                    return await this.handleOrders(params)

                case 'trades':
                    return await this.handleTrades(params)

                case 'positions':
                    return await this.handlePositions(params)

                case 'place-order':
                case 'place':
                    return await this.handlePlaceOrder(params)

                case 'cancel-order':
                case 'cancel':
                    return await this.handleCancelOrder(params)

                case 'cancel-all':
                    return await this.handleCancelAll(params)

                case 'wallet':
                case 'wallet-info':
                    return await this.getWalletInfo(params)

                case 'status':
                    return await this.getStatus(params)

                case 'reset':
                    return await this.resetConversation(params)

                default:
                    // Treat unknown actions as chat messages
                    logger.debug(`Polymarket tool chat fallback`, { action })
                    return await this.processChatMessage(action, params)
            }
        } catch (error: any) {
            logger.error(`Polymarket tool execution failed`, {
                action,
                error: error?.message,
                executionTime: Date.now() - startTime,
            })
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
     * Initialize the Polymarket CLOB provider
     */
    private async initializeProvider(params: any = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now()

        logger.info(`Polymarket tool initialization requested`)

        try {
            console.log(chalk.blue('🔗 Initializing Polymarket CLOB Provider...'))

            // Load Polymarket credentials from config if not in env
            try {
                if (!process.env.POLYMARKET_PRIVATE_KEY) {
                    const pkFromConfig =
                        configManager.getApiKey('polymarket_private_key') ||
                        configManager.getApiKey('polymarket-private-key')
                    if (pkFromConfig) process.env.POLYMARKET_PRIVATE_KEY = pkFromConfig
                }
            } catch {
                logger.debug(`Config manager unavailable for Polymarket keys`)
            }

            // Check if dependencies are installed
            const isInstalled = await PolymarketProvider.isInstalled()
            if (!isInstalled) {
                const error =
                    'Polymarket CLOB client not installed. Run: npm install @polymarket/clob-client'
                logger.error(`Polymarket CLOB client not installed`, { reason: 'package not found' })
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
                logger.error(`Polymarket environment validation failed`, {
                    error: envError.message,
                })
                console.log(chalk.yellow(`⚠️ ${envError.message}`))
                console.log(chalk.gray('Required environment variables:'))
                console.log(chalk.gray('- POLYMARKET_PRIVATE_KEY'))
                console.log(chalk.gray('- POLYMARKET_CHAIN_ID (optional, defaults to 137)'))
                console.log(chalk.gray('- POLYMARKET_HOST (optional)'))

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

            // Initialize provider
            logger.debug(`Creating Polymarket provider instance`)
            this.provider = new PolymarketProvider()
            await this.provider.initialize({
                privateKey: params.privateKey,
                chainId: params.chainId,
                host: params.host,
                funderAddress: params.funderAddress,
            })

            // Create AI agent configuration (like Coinbase)
            const systemPrompt = this.getSystemPrompt()
            const model = openai(process.env.OPENAI_API_KEY ? 'gpt-4o-mini' : 'gpt-3.5-turbo')

            this.agent = {
                system: systemPrompt,
                model,
                maxSteps: 10,
            }

            this.isInitialized = true

            // Get wallet info
            const walletInfo = this.provider!.getWalletInfo()

            logger.info(`Polymarket tool initialized successfully`, {
                address: walletInfo.address,
                chainId: walletInfo.chainId,
            })

            console.log(chalk.green('✓ Polymarket provider initialized successfully'))
            console.log(chalk.blue(`🔗 Wallet: ${walletInfo.address}`))
            console.log(chalk.blue(`🌐 Chain: Polygon (${walletInfo.chainId})`))
            console.log(chalk.blue(`🏪 Host: ${walletInfo.host}`))

            return {
                success: true,
                data: {
                    initialized: true,
                    walletInfo,
                    message: 'Polymarket provider ready for trading operations',
                },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket tool initialization failed`, {
                error: error?.message,
                executionTime: Date.now() - startTime,
            })
            console.log(chalk.red(`❌ Initialization failed: ${error.message}`))

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
     * Process chat message using the AI agent
     */
    private async processChatMessage(message: string, options: any = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now()

        if (!this.isInitialized || !this.agent) {
            return {
                success: false,
                data: null,
                error: 'Polymarket tool not initialized. Use action "init" first.',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: { message, options },
                },
            }
        }

        try {
            logger.debug(`Polymarket chat message processing`, { message })
            console.log(chalk.blue(`🔌 Processing: ${message}`))

            // Add system hint to encourage tool usage
            if (!this.toolHintInjected) {
                this.conversationMessages.push({
                    role: 'system',
                    content:
                        'Always use your available Polymarket trading actions to perform operations rather than replying only with text. If the request involves market data, positions, or trading, use the appropriate tool actions and return concise, actionable results.',
                })
                this.toolHintInjected = true
            }

            // Add user message
            this.conversationMessages.push({
                role: 'user',
                content: message,
            })

            const useStreaming = options?.stream !== false
            let finalText = ''
            let toolCalls: any[] = []
            let toolResults: any[] = []

            if (useStreaming) {
                const result = await streamText({
                    ...this.agent,
                    messages: this.conversationMessages,
                } as any)

                const { textStream } = result as any
                // Stream tokens to stdout as they arrive
                for await (const delta of textStream) {
                    process.stdout.write(String(delta))
                    finalText += String(delta)
                }

                // Try to read tool calls/results if exposed
                try {
                    toolCalls = Array.isArray((result as any).toolCalls) ? (result as any).toolCalls : []
                    toolResults = Array.isArray((result as any).toolResults) ? (result as any).toolResults : []
                } catch { /* ignore */ }
                // Newline after stream
                console.log()
            } else {
                const result = await generateText({
                    ...this.agent,
                    messages: this.conversationMessages,
                })
                finalText = result.text
                toolCalls = result.toolCalls
                toolResults = result.toolResults
            }

            // Add assistant response to history
            this.conversationMessages.push({
                role: 'assistant',
                content: finalText,
            })

            // Keep conversation manageable (last 20 messages)
            if (this.conversationMessages.length > 20) {
                this.conversationMessages = this.conversationMessages.slice(-20)
            }

            let toolsUsed: string[] = []
            try {
                if (Array.isArray(toolCalls)) {
                    toolsUsed = toolCalls
                        .map((c: any) => c?.toolName || c?.tool || c?.name)
                        .filter(Boolean)
                        .map((s: string) => String(s))
                }
            } catch { }

            const toolsUsedNames = toolsUsed && toolsUsed.length > 0 ? ` [${toolsUsed.join(', ')}]` : ''
            const numToolCalls = Array.isArray(toolCalls) ? toolCalls.length : 0
            console.log(chalk.green(`✓ Response generated (${numToolCalls} tool calls)${toolsUsedNames}`))

            logger.debug(`Polymarket chat response generated`, {
                toolCalls: numToolCalls,
                toolsUsed,
            })

            return {
                success: true,
                data: {
                    response: finalText,
                    toolCalls: numToolCalls,
                    toolResults: Array.isArray(toolResults) ? toolResults.length : 0,
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
            logger.error(`Polymarket chat processing failed`, {
                error: error?.message,
            })
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
     * Handle markets action
     */
    private async handleMarkets(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket markets handler`, {
            search: params.search,
            active: params.active,
            limit: params.limit || 20,
        })

        try {
            const markets = await this.provider!.listMarkets({
                search: params.search,
                active: params.active !== false,
                closed: params.closed,
                limit: params.limit || 20,
                offset: params.offset,
            })

            logger.debug(`Polymarket markets retrieved`, { count: markets.length })

            return {
                success: true,
                data: { markets },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket markets handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle orderbook action
     */
    private async handleOrderBook(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket orderbook handler`, {
            tokenID: params.tokenID || params.tokenId,
        })

        if (!params.tokenID && !params.tokenId) {
            return {
                success: false,
                data: null,
                error: 'tokenID or tokenId is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            const book = await this.provider!.getOrderBook({
                tokenID: params.tokenID || params.tokenId,
            })

            logger.debug(`Polymarket orderbook retrieved`)

            return {
                success: true,
                data: { orderbook: book },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket orderbook handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle price quote action
     */
    private async handlePrice(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket price handler`, {
            tokenID: params.tokenID || params.tokenId,
            side: params.side,
            amount: params.amount || params.size,
        })

        if (!params.tokenID && !params.tokenId) {
            return {
                success: false,
                data: null,
                error: 'tokenID or tokenId is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!params.side) {
            return {
                success: false,
                data: null,
                error: "side is required ('BUY' or 'SELL')",
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!params.amount && !params.size) {
            return {
                success: false,
                data: null,
                error: 'amount or size is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            const quote = await this.provider!.getPriceQuote({
                tokenID: params.tokenID || params.tokenId,
                side: String(params.side).toUpperCase() as PolymarketSide,
                amount: String(params.amount || params.size),
            })

            logger.debug(`Polymarket price quote calculated`)

            return {
                success: true,
                data: { quote },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket price handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle orders action
     */
    private async handleOrders(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket orders handler`)

        try {
            const orders = await this.provider!.getOpenOrders()

            logger.debug(`Polymarket orders retrieved`, { count: orders.length })

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
            logger.error(`Polymarket orders handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle trades action
     */
    private async handleTrades(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket trades handler`)

        try {
            const trades = await this.provider!.getTrades()

            logger.debug(`Polymarket trades retrieved`, { count: trades.length })

            return {
                success: true,
                data: { trades },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket trades handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle positions action
     */
    private async handlePositions(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        logger.debug(`Polymarket positions handler`)

        try {
            const positions = await this.provider!.getPositions()

            logger.debug(`Polymarket positions retrieved`, { count: positions.length })

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
            logger.error(`Polymarket positions handler failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle place order action with confirmation
     */
    private async handlePlaceOrder(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        const tokenID = String(params.tokenID || params.tokenId || '')
        const side = String(params.side || '').toUpperCase() as PolymarketSide
        const price = String(params.price || '')
        const size = String(params.size || params.amount || '')
        const tif = String(params.tif || 'GTC').toUpperCase() as PolymarketTimeInForce
        const confirm = Boolean(params.confirm)

        logger.info(`Polymarket place order handler`, {
            tokenID,
            side,
            price,
            size,
            tif,
            confirm,
        })

        // Validation
        if (!tokenID) {
            return {
                success: false,
                data: null,
                error: 'tokenID or tokenId is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!['BUY', 'SELL'].includes(side)) {
            return {
                success: false,
                data: null,
                error: "side must be 'BUY' or 'SELL'",
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!price) {
            return {
                success: false,
                data: null,
                error: 'price is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!size) {
            return {
                success: false,
                data: null,
                error: 'size or amount is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!confirm) {
            return {
                success: false,
                data: null,
                error: 'confirm: true is required for order placement',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            // Confirmation hook
            const confirmHook = async () => {
                return await this.confirmOrder({ tokenID, side, price, size, tif })
            }

            const order = await this.provider!.placeOrder({
                tokenID,
                price,
                size,
                side,
                tif,
                feeRateBps: params.feeRateBps,
                nonce: params.nonce,
                expiration: params.expiration,
                confirmHook,
            })

            logger.info(`Polymarket order placed`, { orderId: order.id })

            return {
                success: true,
                data: { order },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket place order failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle cancel order action
     */
    private async handleCancelOrder(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        const confirm = Boolean(params.confirm)

        logger.info(`Polymarket cancel order handler`, {
            orderID: params.orderID || params.orderId,
            confirm,
        })

        if (!confirm) {
            return {
                success: false,
                data: null,
                error: 'confirm: true is required to cancel orders',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        if (!params.orderID && !params.orderId) {
            return {
                success: false,
                data: null,
                error: 'orderID or orderId is required',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            await this.provider!.cancelOrder({
                orderID: params.orderID || params.orderId,
            })

            logger.info(`Polymarket order cancelled`)

            return {
                success: true,
                data: { cancelled: true },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket cancel order failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Handle cancel all orders action
     */
    private async handleCancelAll(params: any): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        this.requireInit()

        const confirm = Boolean(params.confirm)

        logger.info(`Polymarket cancel all orders handler`, { confirm })

        if (!confirm) {
            return {
                success: false,
                data: null,
                error: 'confirm: true is required to cancel all orders',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            await this.provider!.cancelAllOrders()

            logger.info(`Polymarket all orders cancelled`)

            return {
                success: true,
                data: { cancelled: true },
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        } catch (error: any) {
            logger.error(`Polymarket cancel all failed`, { error: error?.message })
            throw error
        }
    }

    /**
     * Get wallet information
     */
    private async getWalletInfo(params: any = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now()

        if (!this.isInitialized || !this.provider) {
            return {
                success: false,
                data: null,
                error: 'Polymarket tool not initialized. Use action "init" first.',
                metadata: {
                    executionTime: Date.now() - startTime,
                    toolName: this.name,
                    parameters: params,
                },
            }
        }

        try {
            const walletInfo = this.provider!.getWalletInfo()

            return {
                success: true,
                data: {
                    ...walletInfo,
                    message: `Wallet: ${walletInfo.address} on Polygon (${walletInfo.chainId})`,
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
                error: `Failed to get wallet info: ${error.message}`,
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

        return {
            success: true,
            data: {
                initialized: this.isInitialized,
                conversationLength: this.conversationMessages.length,
                agentConfigured: !!this.agent,
                providerConnected: !!this.provider,
                wallet: this.provider?.getWalletInfo(),
                message: this.isInitialized
                    ? 'Polymarket tool is ready for trading operations'
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
     * Reset conversation history
     */
    private async resetConversation(params: any = {}): Promise<ToolExecutionResult> {
        const startTime = Date.now()
        const previousLength = this.conversationMessages.length

        this.conversationMessages = []
        this.toolHintInjected = false

        logger.debug(`Polymarket conversation reset`, {
            previousLength,
        })

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

    /**
     * Confirm order with user
     */
    private async confirmOrder(details: {
        tokenID: string
        side: PolymarketSide
        price: string
        size: string
        tif: PolymarketTimeInForce
    }): Promise<boolean> {
        const summaryLines = [
            '📊 Polymarket Order Confirmation',
            `Token: ${details.tokenID}`,
            `Side: ${details.side}`,
            `Price: ${details.price}`,
            `Size: ${details.size}`,
            `TIF: ${details.tif}`,
            '',
            'Proceed with order? (Yes/No)',
        ]
        const promptMsg = summaryLines.join('\n')

        // Auto-approve if environment variable is set
        const approveViaEnv = process.env.NIKCLI_AUTO_APPROVE === 'true'
        if (approveViaEnv) {
            logger.debug(`Polymarket order auto-approved via env`)
            return true
        }

        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const inquirer = require('inquirer')
            const { confirmed } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'confirmed',
                    message: promptMsg,
                    choices: [
                        { name: 'Yes, place order', value: true },
                        { name: 'No, cancel', value: false },
                    ],
                    default: 1,
                },
            ])
            return confirmed
        } catch {
            // Fallback to stdin
            process.stdout.write(`\n${promptMsg}\n> `)
            return await new Promise<boolean>((resolve) => {
                const onData = (buf: Buffer) => {
                    const ans = String(buf.toString('utf8')).trim().toLowerCase()
                    process.stdin.off('data', onData)
                    resolve(ans === 'y' || ans === 'yes')
                }
                process.stdin.on('data', onData)
            })
        }
    }

    /**
     * Get system prompt for AI agent
     */
    private getSystemPrompt(): string {
        return `
You are a helpful Polymarket trading assistant integrated with the Polymarket CLOB.

You are empowered to interact with Polymarket prediction markets using your tools:
- List and search markets
- Get orderbooks and price quotes
- View positions, trades, and orders
- Place and cancel orders (with user confirmation)

Before executing trading operations, always explain what you're about to do and ensure the user
has provided all required parameters. For order placement, you MUST require explicit confirmation.

If someone asks you to do something you can't do with your currently available tools, you must say so,
and explain the limitations clearly.

Be concise and helpful with your responses. Focus on actionable trading information.
`.trim()
    }

    /**
     * Ensure provider is initialized
     */
    private requireInit(): void {
        if (!this.isInitialized || !this.provider) {
            logger.error(`Polymarket tool not initialized`, {
                reason: 'must call init action first',
            })
            throw new Error('Polymarket tool not initialized. Use action "init" first.')
        }
    }
}

// Tool configuration and usage examples
export const polymarketToolConfig = {
    name: 'polymarket',
    description: 'Official Polymarket CLOB integration for prediction market trading',
    category: 'blockchain',
    requiredEnv: ['POLYMARKET_PRIVATE_KEY'],
    optionalEnv: ['POLYMARKET_CHAIN_ID', 'POLYMARKET_HOST', 'POLYMARKET_SIGNATURE_TYPE', 'OPENAI_API_KEY'],
    actions: [
        'init - Initialize Polymarket CLOB provider',
        'markets - List prediction markets',
        'book - Get order book for a token',
        'price - Get price quote',
        'orders - List open orders',
        'trades - List trade history',
        'positions - List current positions',
        'place-order - Place an order (requires confirm=true)',
        'cancel-order - Cancel an order (requires confirm=true)',
        'cancel-all - Cancel all orders (requires confirm=true)',
        'wallet-info - Get wallet information',
        'status - Get tool status',
        'reset - Reset conversation history',
    ],
    examples: [
        'secureTools.execute("polymarket", "init")',
        'secureTools.execute("polymarket", "markets", { search: "election" })',
        'secureTools.execute("polymarket", "book", { tokenID: "..." })',
        'secureTools.execute("polymarket", "place-order", { tokenID: "...", side: "BUY", price: "0.55", size: "100", confirm: true })',
    ],
}

export type PolymarketToolAction =
    | 'init'
    | 'initialize'
    | 'markets'
    | 'book'
    | 'orderbook'
    | 'price'
    | 'quote'
    | 'orders'
    | 'trades'
    | 'positions'
    | 'place-order'
    | 'place'
    | 'cancel-order'
    | 'cancel'
    | 'cancel-all'
    | 'wallet'
    | 'wallet-info'
    | 'status'
    | 'reset'
