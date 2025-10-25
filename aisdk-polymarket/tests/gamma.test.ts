import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GammaClient } from '../src/polymarket/gamma.ts';

describe('GammaClient', () => {
  let client: GammaClient;

  beforeEach(() => {
    client = new GammaClient({
      apiUrl: 'https://test-gamma.polymarket.com',
      dataApiUrl: 'https://test-data.polymarket.com',
    });
  });

  describe('searchMarkets', () => {
    it('should search markets with query', async () => {
      const mockResponse = [
        {
          id: 'market-1',
          question: 'Will Bitcoin reach $100k?',
          tokens: [
            { outcome: 'YES', token_id: '0x1', price: '0.65' },
            { outcome: 'NO', token_id: '0x2', price: '0.35' },
          ],
          volume: '100000',
          liquidity: '50000',
          active: true,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const markets = await client.searchMarkets({ query: 'Bitcoin', limit: 5 });

      expect(markets).toHaveLength(1);
      expect(markets[0].question).toBe('Will Bitcoin reach $100k?');
      expect(markets[0].outcomes).toHaveLength(2);
      expect(markets[0].outcomes[0].name).toBe('YES');
    });

    it('should handle API errors', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });

      await expect(client.searchMarkets({ query: 'Bitcoin' })).rejects.toThrow(
        'Failed to search markets'
      );
    });

    it('should build correct query parameters', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      await client.searchMarkets({
        query: 'Bitcoin',
        limit: 10,
        offset: 5,
        active: true,
        tag: 'crypto',
      });

      const callArgs = (global.fetch as any).mock.calls[0][0];
      expect(callArgs).toContain('query=Bitcoin');
      expect(callArgs).toContain('limit=10');
      expect(callArgs).toContain('offset=5');
      expect(callArgs).toContain('active=true');
      expect(callArgs).toContain('tag=crypto');
    });
  });

  describe('getMarket', () => {
    it('should fetch market by ID', async () => {
      const mockResponse = {
        id: 'market-1',
        question: 'Will Bitcoin reach $100k?',
        tokens: [
          { outcome: 'YES', token_id: '0x1', price: '0.65' },
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const market = await client.getMarket('market-1');

      expect(market).not.toBeNull();
      expect(market?.id).toBe('market-1');
    });

    it('should return null for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const market = await client.getMarket('non-existent');
      expect(market).toBeNull();
    });
  });

  describe('transformMarket', () => {
    it('should handle different response formats', async () => {
      // Test with outcomes array
      const mockWithOutcomes = {
        id: 'market-1',
        question: 'Test?',
        outcomes: ['YES', 'NO'],
        token_ids: ['0x1', '0x2'],
        prices: ['0.6', '0.4'],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockWithOutcomes],
      });

      const markets = await client.searchMarkets({});
      expect(markets[0].outcomes).toHaveLength(2);
      expect(markets[0].outcomes[0].price).toBe(0.6);
    });

    it('should handle default YES/NO binary markets', async () => {
      const mockBinary = {
        id: 'market-1',
        question: 'Test?',
        yes_token_id: '0x1',
        no_token_id: '0x2',
        yes_price: '0.7',
        no_price: '0.3',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [mockBinary],
      });

      const markets = await client.searchMarkets({});
      expect(markets[0].outcomes).toHaveLength(2);
      expect(markets[0].outcomes[0].name).toBe('YES');
      expect(markets[0].outcomes[1].name).toBe('NO');
    });
  });

  describe('findBestMatch', () => {
    it('should return first search result', async () => {
      const mockResponse = [
        { id: 'market-1', question: 'Best match', tokens: [] },
        { id: 'market-2', question: 'Second match', tokens: [] },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const match = await client.findBestMatch('query');
      expect(match?.id).toBe('market-1');
    });

    it('should return null if no results', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      });

      const match = await client.findBestMatch('query');
      expect(match).toBeNull();
    });
  });
});
