/**
 * Tests for Risk Engine
 */

// Mock Prisma before importing risk-engine
jest.mock('../../src/lib/db', () => ({
  prisma: {
    riskConfig: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    position: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    intent: {
      findMany: jest.fn(),
    },
  },
}));

// Mock regime module
jest.mock('../../src/lib/regime', () => ({
  getRegimeDetector: jest.fn(() => ({
    detect: jest.fn().mockResolvedValue({
      regime: 'TREND',
      confidence: 0.8,
      metrics: {},
    }),
  })),
  RegimeType: {
    TREND: 'TREND',
    CHOP: 'CHOP',
    VOL_EXPANSION: 'VOL_EXPANSION',
    UNTRADEABLE: 'UNTRADEABLE',
  },
}));

import { prisma } from '../../src/lib/db';
import {
  getRiskConfig,
  isKillSwitchActive,
  checkRegime,
  checkIntent,
  TradingIntent,
} from '../../src/lib/risk-engine';

describe('Risk Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRiskConfig', () => {
    it('should return config from database when available', async () => {
      const mockConfig = {
        id: 'test-id',
        maxPositionSize: 2000,
        maxOrderSize: 200,
        maxDailyLoss: 1500,
        allowedSymbols: ['AAPL', 'MSFT'],
        tradingEnabled: true,
        updatedAt: new Date(),
      };

      (prisma.riskConfig.findFirst as jest.Mock).mockResolvedValue(mockConfig);

      const config = await getRiskConfig();

      expect(config.maxPositionSize).toBe(2000);
      expect(config.maxOrderSize).toBe(200);
      expect(config.maxDailyLoss).toBe(1500);
      expect(config.allowedSymbols).toEqual(['AAPL', 'MSFT']);
      expect(config.tradingEnabled).toBe(true);
    });

    it('should return default config when database is empty', async () => {
      (prisma.riskConfig.findFirst as jest.Mock).mockResolvedValue(null);

      const config = await getRiskConfig();

      expect(config.maxPositionSize).toBe(1000);
      expect(config.maxOrderSize).toBe(100);
      expect(config.maxDailyLoss).toBe(1000);
      expect(config.tradingEnabled).toBe(false);
    });

    it('should return default config on database error', async () => {
      (prisma.riskConfig.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));

      const config = await getRiskConfig();

      expect(config.maxPositionSize).toBe(1000);
      expect(config.tradingEnabled).toBe(false);
    });
  });

  describe('isKillSwitchActive', () => {
    it('should return boolean', () => {
      const result = isKillSwitchActive();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('checkRegime', () => {
    it('should return regime check result with canTrade for TREND', async () => {
      const result = await checkRegime('AAPL');

      expect(result.regime).toBe('TREND');
      expect(result.canTrade).toBe(true);
      expect(result.sizeMultiplier).toBe(1.0);
    });

    it('should handle error and return conservative settings', async () => {
      const { getRegimeDetector } = require('../../src/lib/regime');
      getRegimeDetector.mockReturnValueOnce({
        detect: jest.fn().mockRejectedValue(new Error('API error')),
      });

      const result = await checkRegime('AAPL');

      expect(result.canTrade).toBe(true);
      expect(result.sizeMultiplier).toBe(0.5);
      expect(result.reason).toContain('Could not determine regime');
    });
  });

  describe('checkIntent', () => {
    beforeEach(() => {
      (prisma.riskConfig.findFirst as jest.Mock).mockResolvedValue({
        id: 'test-id',
        maxPositionSize: 1000,
        maxOrderSize: 100,
        maxDailyLoss: 1000,
        allowedSymbols: ['AAPL', 'MSFT', 'GOOGL'],
        tradingEnabled: true,
        updatedAt: new Date(),
      });
      (prisma.position.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.intent.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('should approve valid trading intent', async () => {
      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 50,
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(true);
      // 7 core checks (regime_size_adjustment only added when sizeMultiplier < 1.0)
      expect(result.checks.length).toBeGreaterThanOrEqual(7);
    });

    it('should reject when trading is disabled', async () => {
      (prisma.riskConfig.findFirst as jest.Mock).mockResolvedValue({
        id: 'test-id',
        maxPositionSize: 1000,
        maxOrderSize: 100,
        maxDailyLoss: 1000,
        allowedSymbols: ['AAPL'],
        tradingEnabled: false,
        updatedAt: new Date(),
      });

      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 50,
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should reject symbol not in allowed list', async () => {
      const intent: TradingIntent = {
        symbol: 'TSLA',
        side: 'buy',
        quantity: 50,
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(false);
      const symbolCheck = result.checks.find(c => c.name === 'symbol_allowed');
      expect(symbolCheck?.passed).toBe(false);
    });

    it('should reject order exceeding max size', async () => {
      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 150, // exceeds max 100
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(false);
      const orderSizeCheck = result.checks.find(c => c.name === 'order_size');
      expect(orderSizeCheck?.passed).toBe(false);
    });

    it('should reject position exceeding max size', async () => {
      (prisma.position.findUnique as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        symbol: 'AAPL',
        quantity: 950,
      });

      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100, // would make position 1050, exceeds 1000
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(false);
      const positionCheck = result.checks.find(c => c.name === 'position_size');
      expect(positionCheck?.passed).toBe(false);
    });

    it('should skip regime check when requested', async () => {
      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 50,
        orderType: 'market',
        strategy: 'test',
        skipRegimeCheck: true,
      };

      const result = await checkIntent(intent);

      const regimeCheck = result.checks.find(c => c.name === 'regime_check');
      expect(regimeCheck?.passed).toBe(true);
      expect(regimeCheck?.details).toContain('skipped');
    });

    it('should reject invalid order parameters (sanity check)', async () => {
      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: -10, // invalid
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      expect(result.approved).toBe(false);
      const sanityCheck = result.checks.find(c => c.name === 'sanity_check');
      expect(sanityCheck?.passed).toBe(false);
    });

    it('should handle sell side correctly for position sizing', async () => {
      (prisma.position.findUnique as jest.Mock).mockResolvedValue({
        id: 'pos-1',
        symbol: 'AAPL',
        quantity: 500, // long 500
      });

      const intent: TradingIntent = {
        symbol: 'AAPL',
        side: 'sell', // selling reduces position
        quantity: 100,
        orderType: 'market',
        strategy: 'test',
      };

      const result = await checkIntent(intent);

      // Selling 100 from 500 = 400, well within limits
      const positionCheck = result.checks.find(c => c.name === 'position_size');
      expect(positionCheck?.passed).toBe(true);
    });
  });
});

describe('Risk Check Details', () => {
  describe('Check structure', () => {
    it('should have name, passed, and optional details', () => {
      const check = {
        name: 'test_check',
        passed: true,
        details: 'Check passed successfully',
      };

      expect(check).toHaveProperty('name');
      expect(check).toHaveProperty('passed');
      expect(typeof check.passed).toBe('boolean');
    });
  });
});
