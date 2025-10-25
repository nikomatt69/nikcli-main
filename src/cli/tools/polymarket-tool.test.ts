import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { PolymarketTool } from './polymarket-tool'
import { PolymarketProvider } from '../onchain/polymarket-provider'
import chalk from 'chalk'

// Mock PolymarketProvider
vi.mock('../onchain/polymarket-provider')

describe('PolymarketTool', () => {
    let tool: PolymarketTool
    let mockProvider: any

    beforeEach(() => {
        // Set up environment
        process.env.POLYMARKET_PRIVATE_KEY = '0x0000000000000000000000000000000000000000000000000000000000000001'
        process.env.OPENAI_API_KEY = 'test-key'

        // Create mock provider
        mockProvider = {
            initialize: vi.fn().mockResolvedValue(undefined),
            getWalletInfo: vi.fn().mockReturnValue({
                address: '0x1234567890123456789012345678901234567890',
                chainId: 137,
                host: 'https://clob.polymarket.com',
            }),
            listMarkets: vi.fn().mockResolvedValue([
                { id: '1', question: 'Test Market', condition_id: 'cond1' },
            ]),
            getOrderBook: vi.fn().mockResolvedValue({
                bids: [{ price: '0.5', size: '100' }],
                asks: [{ price: '0.55', size: '100' }],
            }),
            getPriceQuote: vi.fn().mockResolvedValue({ price: 0.52, size: 100 }),
            getOpenOrders: vi.fn().mockResolvedValue([
                { id: 'order1', asset_id: 'token1', side: 'BUY', price: '0.5', size: '100' },
            ]),
            getTrades: vi.fn().mockResolvedValue([
                { id: 'trade1', asset_id: 'token1', side: 'BUY', price: '0.5', size: '100' },
            ]),
            getPositions: vi.fn().mockResolvedValue([
                { asset_id: 'token1', side: 'BUY', size: '100' },
            ]),
            placeOrder: vi.fn().mockResolvedValue({ id: 'neworder', status: 'pending' }),
            cancelOrder: vi.fn().mockResolvedValue(undefined),
            cancelAllOrders: vi.fn().mockResolvedValue(undefined),
            cleanup: vi.fn().mockResolvedValue(undefined),
        }

        vi.mocked(PolymarketProvider).mockImplementation(() => mockProvider)

        tool = new PolymarketTool('/test/workspace')
    })

    afterEach(() => {
        vi.clearAllMocks()
        delete process.env.POLYMARKET_PRIVATE_KEY
        delete process.env.OPENAI_API_KEY
    })

    describe('initialization', () => {
        it('should execute init action successfully', async () => {
            const result = await tool.execute('init')

            expect(result.success).toBe(true)
            expect(mockProvider.initialize).toHaveBeenCalled()
            expect(tool['isInitialized']).toBe(true)
        })

        it('should fail init when provider initialization fails', async () => {
            mockProvider.initialize.mockRejectedValueOnce(new Error('Init failed'))

            const result = await tool.execute('init')

            expect(result.success).toBe(false)
            expect(result.error).toContain('Initialization failed')
        })

        it('should fail init when CLOB client is not installed', async () => {
            vi.mocked(PolymarketProvider).mockImplementationOnce(() => {
                throw new Error('CLOB client not installed')
            })

            const tool2 = new PolymarketTool('/test/workspace')
            const result = await tool2.execute('init')

            expect(result.success).toBe(false)
        })
    })

    describe('markets', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should list markets', async () => {
            const result = await tool.execute('markets')

            expect(result.success).toBe(true)
            expect(result.data?.markets).toHaveLength(1)
            expect(mockProvider.listMarkets).toHaveBeenCalled()
        })

        it('should filter markets by search parameter', async () => {
            await tool.execute('markets', { search: 'election' })

            expect(mockProvider.listMarkets).toHaveBeenCalledWith(
                expect.objectContaining({ search: 'election' })
            )
        })

        it('should return error when not initialized', async () => {
            const tool2 = new PolymarketTool('/test/workspace')
            const result = await tool2.execute('markets')

            expect(result.success).toBe(false)
            expect(result.error).toContain('not initialized')
        })
    })

    describe('orders', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should list open orders', async () => {
            const result = await tool.execute('orders')

            expect(result.success).toBe(true)
            expect(result.data?.orders).toHaveLength(1)
            expect(mockProvider.getOpenOrders).toHaveBeenCalled()
        })

        it('should handle orders action case-insensitively', async () => {
            const result = await tool.execute('ORDERS')

            expect(result.success).toBe(true)
            expect(mockProvider.getOpenOrders).toHaveBeenCalled()
        })
    })

    describe('trades', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should list trades', async () => {
            const result = await tool.execute('trades')

            expect(result.success).toBe(true)
            expect(result.data?.trades).toHaveLength(1)
            expect(mockProvider.getTrades).toHaveBeenCalled()
        })
    })

    describe('positions', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should list positions', async () => {
            const result = await tool.execute('positions')

            expect(result.success).toBe(true)
            expect(result.data?.positions).toHaveLength(1)
            expect(mockProvider.getPositions).toHaveBeenCalled()
        })
    })

    describe('order book', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should get order book for token', async () => {
            const result = await tool.execute('book', { tokenID: 'token123' })

            expect(result.success).toBe(true)
            expect(result.data?.orderbook).toBeDefined()
            expect(mockProvider.getOrderBook).toHaveBeenCalledWith({ tokenID: 'token123' })
        })

        it('should fail without tokenID parameter', async () => {
            const result = await tool.execute('book', {})

            expect(result.success).toBe(false)
            expect(result.error).toContain('tokenID')
        })

        it('should accept tokenId as alias for tokenID', async () => {
            const result = await tool.execute('book', { tokenId: 'token456' })

            expect(result.success).toBe(true)
            expect(mockProvider.getOrderBook).toHaveBeenCalledWith({ tokenID: 'token456' })
        })
    })

    describe('price quote', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should get price quote', async () => {
            const result = await tool.execute('price', {
                tokenID: 'token123',
                side: 'BUY',
                amount: '100',
            })

            expect(result.success).toBe(true)
            expect(result.data?.quote).toBeDefined()
            expect(mockProvider.getPriceQuote).toHaveBeenCalled()
        })

        it('should fail without required parameters', async () => {
            let result = await tool.execute('price', { tokenID: 'token123' })
            expect(result.success).toBe(false)

            result = await tool.execute('price', { tokenID: 'token123', side: 'BUY' })
            expect(result.success).toBe(false)
        })
    })

    describe('place order', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should place order with confirmation', async () => {
            const result = await tool.execute('place-order', {
                tokenID: 'token123',
                side: 'BUY',
                price: '0.5',
                size: '100',
                confirm: true,
            })

            expect(result.success).toBe(true)
            expect(mockProvider.placeOrder).toHaveBeenCalled()
        })

        it('should fail without confirmation flag', async () => {
            const result = await tool.execute('place-order', {
                tokenID: 'token123',
                side: 'BUY',
                price: '0.5',
                size: '100',
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain('confirm')
        })

        it('should validate price range [0,1]', async () => {
            let result = await tool.execute('place-order', {
                tokenID: 'token123',
                side: 'BUY',
                price: '1.5',
                size: '100',
                confirm: true,
            })
            expect(result.success).toBe(false)

            result = await tool.execute('place-order', {
                tokenID: 'token123',
                side: 'BUY',
                price: '-0.1',
                size: '100',
                confirm: true,
            })
            expect(result.success).toBe(false)
        })

        it('should validate side is BUY or SELL', async () => {
            const result = await tool.execute('place-order', {
                tokenID: 'token123',
                side: 'INVALID',
                price: '0.5',
                size: '100',
                confirm: true,
            })

            expect(result.success).toBe(false)
            expect(result.error).toContain("'BUY' or 'SELL'")
        })
    })

    describe('cancel order', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should cancel order with confirmation', async () => {
            const result = await tool.execute('cancel-order', {
                orderID: 'order123',
                confirm: true,
            })

            expect(result.success).toBe(true)
            expect(mockProvider.cancelOrder).toHaveBeenCalledWith({ orderID: 'order123' })
        })

        it('should fail without confirmation flag', async () => {
            const result = await tool.execute('cancel-order', { orderID: 'order123' })

            expect(result.success).toBe(false)
            expect(result.error).toContain('confirm')
        })

        it('should fail without orderID', async () => {
            const result = await tool.execute('cancel-order', { confirm: true })

            expect(result.success).toBe(false)
            expect(result.error).toContain('orderID')
        })
    })

    describe('cancel all orders', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should cancel all orders with confirmation', async () => {
            const result = await tool.execute('cancel-all', { confirm: true })

            expect(result.success).toBe(true)
            expect(mockProvider.cancelAllOrders).toHaveBeenCalled()
        })

        it('should fail without confirmation flag', async () => {
            const result = await tool.execute('cancel-all', {})

            expect(result.success).toBe(false)
            expect(result.error).toContain('confirm')
        })
    })

    describe('wallet info', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should get wallet information', async () => {
            const result = await tool.execute('wallet')

            expect(result.success).toBe(true)
            expect(result.data?.address).toBeDefined()
            expect(result.data?.chainId).toBe(137)
        })
    })

    describe('status', () => {
        it('should return status when initialized', async () => {
            await tool.execute('init')
            const result = await tool.execute('status')

            expect(result.success).toBe(true)
            expect(result.data?.initialized).toBe(true)
        })

        it('should return not initialized status', async () => {
            const result = await tool.execute('status')

            expect(result.success).toBe(true)
            expect(result.data?.initialized).toBe(false)
        })
    })

    describe('reset', () => {
        beforeEach(async () => {
            await tool.execute('init')
        })

        it('should reset conversation history', async () => {
            const result = await tool.execute('reset')

            expect(result.success).toBe(true)
            expect(result.data?.currentLength).toBe(0)
        })
    })

    describe('error handling', () => {
        it('should handle execution errors gracefully', async () => {
            mockProvider.listMarkets.mockRejectedValueOnce(new Error('API error'))
            await tool.execute('init')

            const result = await tool.execute('markets')

            expect(result.success).toBe(false)
            expect(result.error).toContain('API error')
            expect(result.metadata?.executionTime).toBeGreaterThanOrEqual(0)
        })

        it('should include execution time in metadata', async () => {
            const result = await tool.execute('status')

            expect(result.metadata?.executionTime).toBeDefined()
            expect(typeof result.metadata?.executionTime).toBe('number')
        })
    })
})
