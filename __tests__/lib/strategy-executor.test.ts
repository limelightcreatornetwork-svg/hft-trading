/**
 * Tests for Strategy Executor
 */

// Mock all external dependencies
jest.mock('../../src/lib/db', () => ({
  prisma: {
    strategy: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    managedPosition: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../src/lib/env', () => ({
  alpacaConfig: {
    apiKey: 'test-key',
    apiSecret: 'test-secret',
    isPaper: true,
    baseUrl: 'https://paper-api.alpaca.markets',
  },
}));

jest.mock('@alpacahq/alpaca-trade-api', () => {
  return jest.fn().mockImplementation(() => ({
    getBarsV2: jest.fn(),
    getLatestQuote: jest.fn(),
  }));
});

jest.mock('../../src/lib/regime', () => ({
  detectRegimeCached: jest.fn(),
}));

jest.mock('../../src/lib/trade-manager', () => ({
  createManagedPosition: jest.fn(),
}));

jest.mock('../../src/lib/strategy-manager', () => ({
  updateStrategyPerformance: jest.fn(),
}));

jest.mock('../../src/lib/logger', () => ({
  createLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(),
  }),
  serializeError: jest.fn((e) => ({ errorMessage: String(e) })),
}));

import { prisma } from '../../src/lib/db';
import { detectRegimeCached } from '../../src/lib/regime';
import { createManagedPosition } from '../../src/lib/trade-manager';
import { updateStrategyPerformance } from '../../src/lib/strategy-manager';
import {
  executeStrategies,
  executeSingleStrategy,
  onPositionClosed,
} from '../../src/lib/strategy-executor';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockDetectRegime = detectRegimeCached as jest.MockedFunction<typeof detectRegimeCached>;
const mockCreateManagedPosition = createManagedPosition as jest.MockedFunction<typeof createManagedPosition>;
const mockUpdatePerformance = updateStrategyPerformance as jest.MockedFunction<typeof updateStrategyPerformance>;

// Mock Alpaca getBarsV2 to return async iterable
function makeMockBars(count: number = 30) {
  const bars = Array.from({ length: count }, (_, i) => ({
    Timestamp: new Date(2025, 0, 1 + i).toISOString(),
    OpenPrice: 100 + i * 0.5,
    HighPrice: 101 + i * 0.5,
    LowPrice: 99 + i * 0.5,
    ClosePrice: 100 + i * 0.5,
    Volume: 1000000,
  }));

  return {
    [Symbol.asyncIterator]: async function* () {
      for (const bar of bars) {
        yield bar;
      }
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Alpaca = require('@alpacahq/alpaca-trade-api');
let mockGetBarsV2: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBarsV2 = jest.fn().mockReturnValue(makeMockBars());
  Alpaca.mockImplementation(() => ({
    getBarsV2: mockGetBarsV2,
  }));
});

const enabledStrategy = {
  id: 'strat_1',
  name: 'Momentum Test',
  type: 'momentum',
  symbols: ['AAPL'],
  enabled: true,
  allocatedCapital: 10000,
  maxPositionSize: 1000,
  riskPerTrade: 0.02,
  entryConditions: {},
  exitConditions: {},
  positionSizing: {},
  riskParams: {},
  isActive: false,
  backtestResults: null,
  totalPnl: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Strategy Executor', () => {
  describe('executeStrategies', () => {
    it('should return empty array when no strategies enabled', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([]);
      const results = await executeStrategies();
      expect(results).toEqual([]);
    });

    it('should skip manual strategies', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([
        { ...enabledStrategy, type: 'manual' },
      ]);
      const results = await executeStrategies();
      expect(results).toEqual([]);
    });

    it('should execute strategy for each symbol', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([
        { ...enabledStrategy, symbols: ['AAPL', 'MSFT'] },
      ]);
      mockDetectRegime.mockResolvedValue({
        regime: 'TREND',
        confidence: 0.8,
        metrics: {} as never,
        timestamp: new Date().toISOString(),
        symbol: 'AAPL',
        recommendation: 'TRADE',
      });
      mockCreateManagedPosition.mockResolvedValue({
        position: null,
        confidence: { total: 3 } as never,
        skipped: true,
        reason: 'Low confidence',
      });

      const results = await executeStrategies();
      expect(results.length).toBe(2);
    });

    it('should handle regime detection errors gracefully', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([enabledStrategy]);
      mockDetectRegime.mockRejectedValue(new Error('API down'));

      const results = await executeStrategies();
      expect(results.length).toBe(1);
      expect(results[0].error).toBeDefined();
      expect(results[0].executed).toBe(false);
    });

    it('should return hold when insufficient bars', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([enabledStrategy]);
      mockGetBarsV2.mockReturnValue(makeMockBars(5));
      mockDetectRegime.mockResolvedValue({
        regime: 'TREND',
        confidence: 0.8,
        metrics: {} as never,
        timestamp: new Date().toISOString(),
        symbol: 'AAPL',
        recommendation: 'TRADE',
      });

      // Need to re-require to pick up new mock
      jest.resetModules();
    });
  });

  describe('executeSingleStrategy', () => {
    it('should throw when strategy not found', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(executeSingleStrategy('nonexistent')).rejects.toThrow('Strategy not found');
    });

    it('should throw for manual strategies', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue({
        ...enabledStrategy,
        type: 'manual',
      });
      await expect(executeSingleStrategy('strat_1')).rejects.toThrow('Cannot auto-execute');
    });

    it('should execute strategy for all its symbols', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue({
        ...enabledStrategy,
        symbols: ['AAPL', 'TSLA'],
      });
      mockDetectRegime.mockResolvedValue({
        regime: 'CHOP',
        confidence: 0.6,
        metrics: {} as never,
        timestamp: new Date().toISOString(),
        symbol: 'AAPL',
        recommendation: 'TRADE',
      });

      const results = await executeSingleStrategy('strat_1');
      expect(results.length).toBe(2);
    });
  });

  describe('onPositionClosed', () => {
    it('should update strategy performance when position has strategyId', async () => {
      (mockPrisma.managedPosition.findUnique as jest.Mock).mockResolvedValue({
        strategyId: 'strat_1',
      });
      mockUpdatePerformance.mockResolvedValue(undefined);

      await onPositionClosed('pos_1', 150);

      expect(mockUpdatePerformance).toHaveBeenCalledWith('strat_1', 150, true);
    });

    it('should update as loss when pnl is negative', async () => {
      (mockPrisma.managedPosition.findUnique as jest.Mock).mockResolvedValue({
        strategyId: 'strat_1',
      });
      mockUpdatePerformance.mockResolvedValue(undefined);

      await onPositionClosed('pos_1', -75);

      expect(mockUpdatePerformance).toHaveBeenCalledWith('strat_1', -75, false);
    });

    it('should not update when no strategyId', async () => {
      (mockPrisma.managedPosition.findUnique as jest.Mock).mockResolvedValue({
        strategyId: null,
      });

      await onPositionClosed('pos_1', 100);

      expect(mockUpdatePerformance).not.toHaveBeenCalled();
    });

    it('should not update when position not found', async () => {
      (mockPrisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(null);

      await onPositionClosed('nonexistent', 100);

      expect(mockUpdatePerformance).not.toHaveBeenCalled();
    });
  });
});
