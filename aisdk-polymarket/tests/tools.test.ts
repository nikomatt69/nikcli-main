import { describe, it, expect } from 'vitest';
import { polymarketTools } from '../src/ai/tools.ts';
import { PolymarketClient } from '../src/polymarket/clob-client.ts';
import { GammaClient } from '../src/polymarket/gamma.ts';

describe('AI Tools', () => {
  const mockSigner = {
    type: 'cdp' as const,
    address: '0x123',
    signTypedData: async () => ({ signature: '0xsig' }),
  };

  const clobClient = new PolymarketClient({
    signer: mockSigner,
  });

  const gammaClient = new GammaClient();

  const tools = polymarketTools({
    clobClient,
    gammaClient,
    debug: false,
  });

  describe('Tool Structure', () => {
    it('should export all required tools', () => {
      expect(tools).toHaveProperty('search_markets');
      expect(tools).toHaveProperty('orderbook');
      expect(tools).toHaveProperty('order_place');
      expect(tools).toHaveProperty('order_cancel');
      expect(tools).toHaveProperty('order_status');
      expect(tools).toHaveProperty('portfolio');
      expect(tools).toHaveProperty('market_details');
    });

    it('should have valid tool descriptions', () => {
      expect(tools.search_markets.description).toBeTruthy();
      expect(tools.orderbook.description).toBeTruthy();
      expect(tools.order_place.description).toBeTruthy();
    });

    it('should have zod schemas for parameters', () => {
      expect(tools.search_markets.parameters).toBeDefined();
      expect(tools.orderbook.parameters).toBeDefined();
      expect(tools.order_place.parameters).toBeDefined();
    });
  });

  describe('search_markets tool', () => {
    it('should validate parameters', () => {
      const validParams = {
        query: 'Bitcoin',
        limit: 5,
      };

      const result = tools.search_markets.parameters.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid limit', () => {
      const invalidParams = {
        query: 'Bitcoin',
        limit: -5,
      };

      const result = tools.search_markets.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('order_place tool', () => {
    it('should validate order parameters', () => {
      const validParams = {
        tokenId: '0x123',
        side: 'BUY',
        price: 0.55,
        size: 10,
      };

      const result = tools.order_place.parameters.safeParse(validParams);
      expect(result.success).toBe(true);
    });

    it('should reject invalid price', () => {
      const invalidParams = {
        tokenId: '0x123',
        side: 'BUY',
        price: 1.5, // > 0.99
        size: 10,
      };

      const result = tools.order_place.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });

    it('should reject invalid side', () => {
      const invalidParams = {
        tokenId: '0x123',
        side: 'INVALID',
        price: 0.55,
        size: 10,
      };

      const result = tools.order_place.parameters.safeParse(invalidParams);
      expect(result.success).toBe(false);
    });
  });

  describe('order_cancel tool', () => {
    it('should accept orderId or orderHash', () => {
      const withOrderId = {
        orderId: 'order-123',
      };

      const withOrderHash = {
        orderHash: '0xhash',
      };

      expect(tools.order_cancel.parameters.safeParse(withOrderId).success).toBe(true);
      expect(tools.order_cancel.parameters.safeParse(withOrderHash).success).toBe(true);
    });
  });

  describe('portfolio tool', () => {
    it('should accept optional owner', () => {
      const withOwner = {
        owner: '0x456',
      };

      const withoutOwner = {};

      expect(tools.portfolio.parameters.safeParse(withOwner).success).toBe(true);
      expect(tools.portfolio.parameters.safeParse(withoutOwner).success).toBe(true);
    });
  });
});
