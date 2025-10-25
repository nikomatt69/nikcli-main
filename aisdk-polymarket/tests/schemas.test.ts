import { describe, it, expect } from 'vitest';
import {
  OrderArgsSchema,
  RiskConfigSchema,
  validateTickSize,
  validateRisk,
  roundToTickSize,
  calculateEdge,
  MarketSchema,
  OrderbookSchema,
} from '../src/polymarket/schemas.ts';

describe('Schemas', () => {
  describe('OrderArgsSchema', () => {
    it('should validate valid order args', () => {
      const validOrder = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 10,
        orderType: 'GTC' as const,
      };

      const result = OrderArgsSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    it('should reject invalid price (too low)', () => {
      const invalidOrder = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.005, // Below 0.01
        size: 10,
      };

      const result = OrderArgsSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should reject invalid price (too high)', () => {
      const invalidOrder = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.995, // Above 0.99
        size: 10,
      };

      const result = OrderArgsSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should reject negative size', () => {
      const invalidOrder = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: -5,
      };

      const result = OrderArgsSchema.safeParse(invalidOrder);
      expect(result.success).toBe(false);
    });

    it('should apply default orderType GTC', () => {
      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 10,
      };

      const result = OrderArgsSchema.parse(order);
      expect(result.orderType).toBe('GTC');
    });
  });

  describe('RiskConfigSchema', () => {
    it('should validate valid risk config', () => {
      const validConfig = {
        maxNotional: 1000,
        maxSizePerMarket: 100,
        maxSkew: 0.1,
        maxSpreadSlippage: 0.05,
        minEdge: 0.02,
      };

      const result = RiskConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const minimalConfig = {
        maxNotional: 1000,
        maxSizePerMarket: 100,
      };

      const result = RiskConfigSchema.parse(minimalConfig);
      expect(result.maxSkew).toBe(0.1);
      expect(result.maxSpreadSlippage).toBe(0.05);
      expect(result.minEdge).toBe(0.02);
    });
  });

  describe('MarketSchema', () => {
    it('should validate valid market', () => {
      const validMarket = {
        id: 'market-123',
        question: 'Will Bitcoin reach $100k?',
        description: 'Binary market',
        outcomes: [
          { name: 'YES', tokenId: '0x1', price: 0.65 },
          { name: 'NO', tokenId: '0x2', price: 0.35 },
        ],
        active: true,
      };

      const result = MarketSchema.safeParse(validMarket);
      expect(result.success).toBe(true);
    });
  });

  describe('OrderbookSchema', () => {
    it('should validate valid orderbook', () => {
      const validOrderbook = {
        tokenId: '0x123',
        bids: [
          { price: '0.55', size: '100' },
          { price: '0.54', size: '200' },
        ],
        asks: [
          { price: '0.56', size: '150' },
          { price: '0.57', size: '250' },
        ],
        timestamp: Date.now(),
      };

      const result = OrderbookSchema.safeParse(validOrderbook);
      expect(result.success).toBe(true);
    });
  });

  describe('validateTickSize', () => {
    it('should validate correct tick size', () => {
      expect(validateTickSize(0.50, 0.01)).toBe(true);
      expect(validateTickSize(0.55, 0.01)).toBe(true);
      expect(validateTickSize(0.33, 0.01)).toBe(true);
    });

    it('should reject invalid tick size', () => {
      expect(validateTickSize(0.555, 0.01)).toBe(false);
      expect(validateTickSize(0.333, 0.01)).toBe(false);
    });

    it('should handle different tick sizes', () => {
      expect(validateTickSize(0.50, 0.05)).toBe(true);
      expect(validateTickSize(0.55, 0.05)).toBe(true);
      expect(validateTickSize(0.52, 0.05)).toBe(false);
    });
  });

  describe('roundToTickSize', () => {
    it('should round to nearest tick', () => {
      expect(roundToTickSize(0.555, 0.01)).toBe(0.56);
      expect(roundToTickSize(0.554, 0.01)).toBe(0.55);
      expect(roundToTickSize(0.333, 0.01)).toBe(0.33);
    });

    it('should handle different tick sizes', () => {
      expect(roundToTickSize(0.52, 0.05)).toBe(0.50);
      expect(roundToTickSize(0.53, 0.05)).toBe(0.55);
    });
  });

  describe('validateRisk', () => {
    const riskConfig = {
      maxNotional: 1000,
      maxSizePerMarket: 100,
      maxSkew: 0.1,
      maxSpreadSlippage: 0.05,
      minEdge: 0.02,
    };

    it('should pass valid order', () => {
      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 10,
        orderType: 'GTC' as const,
      };

      const result = validateRisk(order, riskConfig);
      expect(result.valid).toBe(true);
    });

    it('should reject order exceeding max notional', () => {
      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 2000, // 2000 * 0.55 = 1100 > 1000
        orderType: 'GTC' as const,
      };

      const result = validateRisk(order, riskConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Notional');
    });

    it('should reject order exceeding max size', () => {
      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.10,
        size: 150, // > 100
        orderType: 'GTC' as const,
      };

      const result = validateRisk(order, riskConfig);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Size');
    });

    it('should check allowedMarkets whitelist', () => {
      const configWithWhitelist = {
        ...riskConfig,
        allowedMarkets: ['0x456'],
      };

      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 10,
        orderType: 'GTC' as const,
      };

      const result = validateRisk(order, configWithWhitelist);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in allowed list');
    });

    it('should check blockedMarkets blacklist', () => {
      const configWithBlacklist = {
        ...riskConfig,
        blockedMarkets: ['0x123'],
      };

      const order = {
        tokenId: '0x123',
        side: 'BUY' as const,
        price: 0.55,
        size: 10,
        orderType: 'GTC' as const,
      };

      const result = validateRisk(order, configWithBlacklist);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('blocked');
    });
  });

  describe('calculateEdge', () => {
    it('should calculate edge for BUY orders', () => {
      const edge = calculateEdge(0.50, 0.55, 'BUY');
      expect(edge).toBe(0.05); // Buying below market = positive edge
    });

    it('should calculate edge for SELL orders', () => {
      const edge = calculateEdge(0.60, 0.55, 'SELL');
      expect(edge).toBe(0.05); // Selling above market = positive edge
    });

    it('should return negative edge for bad prices', () => {
      const edge = calculateEdge(0.60, 0.55, 'BUY');
      expect(edge).toBe(-0.05); // Buying above market = negative edge
    });
  });
});
