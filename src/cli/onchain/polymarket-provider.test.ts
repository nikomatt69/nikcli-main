import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { PolymarketProvider } from './polymarket-provider'
import axios from 'axios'

// Mock axios
vi.mock('axios')
const mockedAxios = axios as any

// Mock @polymarket/clob-client
let mockClobClient: any = null
vi.mock('@polymarket/clob-client', () => ({
    ClobClient: vi.fn((host, chainId, signer, sigType, funderAddr) => mockClobClient),
}))

describe('PolymarketProvider', () => {
    let provider: PolymarketProvider
    let mockAccount: LocalAccount
    const testPrivateKey = '0x0000000000000000000000000000000000000000000000000000000000000001'
    const testAddress = '0x0000000000000000000000000000000000000001'

    beforeEach(() => {
        // Set up environment
        process.env.POLYMARKET_PRIVATE_KEY = testPrivateKey
        process.env.POLYMARKET_CHAIN_ID = '137'
        process.env.POLYMARKET_HOST = 'https://clob.polymarket.com'

        // Create mock CLOB client
        mockClobClient = {
            getMarkets: vi.fn().mockResolvedValue([{ id: '1', question: 'Test Market' }]),
        }

        // Create provider instance
        provider = new PolymarketProvider()
    })

    afterEach(() => {
        vi.clearAllMocks()
        delete process.env.POLYMARKET_PRIVATE_KEY
        delete process.env.POLYMARKET_CHAIN_ID
        delete process.env.POLYMARKET_HOST
        delete process.env.POLYMARKET_L2_AUTH
    })

    describe('initialization', () => {
        it('should initialize successfully with valid config', async () => {
            await provider.initialize()
            expect(provider['initialized']).toBe(true)
        })

        it('should throw error when POLYMARKET_PRIVATE_KEY is missing', async () => {
            delete process.env.POLYMARKET_PRIVATE_KEY
            const newProvider = new PolymarketProvider()
            await expect(newProvider.initialize()).rejects.toThrow('POLYMARKET_PRIVATE_KEY')
        })

        it('should perform health check on markets', async () => {
            await provider.initialize()
            expect(mockClobClient.getMarkets).toHaveBeenCalled()
        })

        it('should create signer adapter with required methods', async () => {
            await provider.initialize()
            const signerAdapter = (mockClobClient as any).constructor.mock.calls[0][2]
            expect(signerAdapter).toHaveProperty('getAddress')
            expect(signerAdapter).toHaveProperty('_signTypedData')
            expect(signerAdapter).toHaveProperty('signTypedData')
        })
    })

    describe('getOpenOrders', () => {
        beforeEach(async () => {
            await provider.initialize()
        })

        it('should call SDK method if available', async () => {
            const mockOrders = [
                { id: '1', asset_id: 'token1', side: 'BUY', price: '0.5', size: '100' },
            ]
            mockClobClient.getOrders = vi.fn().mockResolvedValue(mockOrders)

            const orders = await provider.getOpenOrders()

            expect(mockClobClient.getOrders).toHaveBeenCalled()
            expect(orders).toEqual(mockOrders)
        })

        it('should fall back to REST when SDK method is not available', async () => {
            const mockRestOrders = [
                { id: '2', asset_id: 'token2', side: 'SELL', price: '0.6', size: '50' },
            ]
            mockClobClient.getOrders = undefined

            mockedAxios.get.mockResolvedValueOnce({ data: mockRestOrders })

            const orders = await provider.getOpenOrders()

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://clob.polymarket.com/orders',
                expect.objectContaining({
                    params: expect.objectContaining({ maker: testAddress }),
                })
            )
            expect(orders).toEqual(mockRestOrders)
        })

        it('should return empty array on REST failure', async () => {
            mockClobClient.getOrders = undefined
            mockedAxios.get.mockRejectedValueOnce(new Error('Network error'))

            const orders = await provider.getOpenOrders()

            expect(orders).toEqual([])
        })

        it('should retry on network errors', async () => {
            let callCount = 0
            mockClobClient.getOrders = vi.fn(async () => {
                callCount++
                if (callCount < 2) throw new Error('Network error')
                return [{ id: '3', asset_id: 'token3', side: 'BUY', price: '0.7', size: '200' }]
            })

            const orders = await provider.getOpenOrders()

            expect(mockClobClient.getOrders).toHaveBeenCalledTimes(2)
            expect(orders).toHaveLength(1)
        })

        it('should throw error when not initialized', async () => {
            const newProvider = new PolymarketProvider()
            await expect(newProvider.getOpenOrders()).rejects.toThrow('not initialized')
        })
    })

    describe('getTrades', () => {
        beforeEach(async () => {
            await provider.initialize()
        })

        it('should call SDK method if available', async () => {
            const mockTrades = [
                { id: '1', taker_order_id: 'order1', market: 'market1', asset_id: 'token1', side: 'BUY', size: '100', price: '0.5' },
            ]
            mockClobClient.getTrades = vi.fn().mockResolvedValue(mockTrades)

            const trades = await provider.getTrades()

            expect(mockClobClient.getTrades).toHaveBeenCalled()
            expect(trades).toEqual(mockTrades)
        })

        it('should fall back to REST /data/trades endpoint', async () => {
            const mockRestTrades = [
                { id: '2', taker_order_id: 'order2', market: 'market2', asset_id: 'token2', side: 'SELL', size: '50', price: '0.6' },
            ]
            mockClobClient.getTrades = undefined

            mockedAxios.get.mockResolvedValueOnce({ data: mockRestTrades })

            const trades = await provider.getTrades()

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://clob.polymarket.com/data/trades',
                expect.objectContaining({
                    params: expect.objectContaining({ maker: testAddress, limit: 100 }),
                })
            )
            expect(trades).toEqual(mockRestTrades)
        })

        it('should return empty array on REST failure', async () => {
            mockClobClient.getTrades = undefined
            mockedAxios.get.mockRejectedValueOnce(new Error('API error'))

            const trades = await provider.getTrades()

            expect(trades).toEqual([])
        })
    })

    describe('getPositions', () => {
        beforeEach(async () => {
            await provider.initialize()
        })

        it('should call SDK method if available', async () => {
            const mockPositions = [
                { asset_id: 'token1', side: 'BUY', size: '100' },
            ]
            mockClobClient.getPositions = vi.fn().mockResolvedValue(mockPositions)

            const positions = await provider.getPositions()

            expect(mockClobClient.getPositions).toHaveBeenCalled()
            expect(positions).toEqual(mockPositions)
        })

        it('should fall back to REST /data/positions endpoint', async () => {
            const mockRestPositions = [
                { asset_id: 'token2', side: 'SELL', size: '50' },
            ]
            mockClobClient.getPositions = undefined

            mockedAxios.get.mockResolvedValueOnce({ data: mockRestPositions })

            const positions = await provider.getPositions()

            expect(mockedAxios.get).toHaveBeenCalledWith(
                'https://clob.polymarket.com/data/positions',
                expect.objectContaining({
                    params: expect.objectContaining({ maker: testAddress }),
                })
            )
            expect(positions).toEqual(mockRestPositions)
        })

        it('should return empty array on REST failure', async () => {
            mockClobClient.getPositions = undefined
            mockedAxios.get.mockRejectedValueOnce(new Error('Connection error'))

            const positions = await provider.getPositions()

            expect(positions).toEqual([])
        })
    })

    describe('cancelAllOrders', () => {
        beforeEach(async () => {
            await provider.initialize()
        })

        it('should call SDK cancelAll method if available', async () => {
            mockClobClient.cancelAll = vi.fn().mockResolvedValue(undefined)

            await provider.cancelAllOrders()

            expect(mockClobClient.cancelAll).toHaveBeenCalled()
        })

        it('should fall back to canceling individual orders', async () => {
            mockClobClient.cancelAll = undefined
            mockClobClient.getOrders = vi.fn().mockResolvedValue([
                { id: '1', asset_id: 'token1', side: 'BUY', price: '0.5', size: '100' },
                { id: '2', asset_id: 'token2', side: 'SELL', price: '0.6', size: '50' },
            ])
            mockClobClient.cancelOrder = vi.fn().mockResolvedValue(undefined)

            await provider.cancelAllOrders()

            expect(mockClobClient.cancelOrder).toHaveBeenCalledTimes(2)
        })

        it('should throw error when not initialized', async () => {
            const newProvider = new PolymarketProvider()
            await expect(newProvider.cancelAllOrders()).rejects.toThrow('not initialized')
        })
    })

    describe('signer adapter', () => {
        it('should provide getAddress method', async () => {
            await provider.initialize()
            const signerAdapter = (mockClobClient as any).constructor.mock.calls[0][2]
            const address = await signerAdapter.getAddress()
            expect(address).toBeDefined()
            expect(typeof address).toBe('string')
        })

        it('should provide signTypedData method', async () => {
            await provider.initialize()
            const signerAdapter = (mockClobClient as any).constructor.mock.calls[0][2]
            expect(typeof signerAdapter.signTypedData).toBe('function')
        })

        it('should provide _signTypedData method', async () => {
            await provider.initialize()
            const signerAdapter = (mockClobClient as any).constructor.mock.calls[0][2]
            expect(typeof signerAdapter._signTypedData).toBe('function')
        })
    })

    describe('REST headers', () => {
        beforeEach(async () => {
            await provider.initialize()
        })

        it('should include Content-Type header', async () => {
            mockClobClient.getOrders = undefined
            mockedAxios.get.mockResolvedValueOnce({ data: [] })

            await provider.getOpenOrders()

            const call = mockedAxios.get.mock.calls[0][1]
            expect(call.headers['Content-Type']).toBe('application/json')
        })

        it('should include X-POLY-SIGNATURE when L2_AUTH is enabled', async () => {
            process.env.POLYMARKET_L2_AUTH = 'true'

            mockClobClient.getOrders = undefined
            mockedAxios.get.mockResolvedValueOnce({ data: [] })

            // Need to reinitialize after setting env var
            const newProvider = new PolymarketProvider()
            await newProvider.initialize()
            await newProvider.getOpenOrders()

            const call = mockedAxios.get.mock.calls[0][1]
            expect(call.headers['X-POLY-SIGNATURE']).toBeDefined()
        })
    })

    describe('cleanup', () => {
        it('should clear resources on cleanup', async () => {
            await provider.initialize()
            await provider.cleanup()

            expect(provider['initialized']).toBe(false)
            expect(provider['client']).toBeNull()
            expect(provider['account']).toBeNull()
        })
    })
})
