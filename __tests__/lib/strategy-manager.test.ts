/**
 * Tests for Strategy Manager
 */

jest.mock('../../src/lib/db', () => ({
  prisma: {
    strategy: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
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
import {
  createStrategy,
  updateStrategy,
  deleteStrategy,
  getStrategy,
  listStrategies,
  toggleStrategyEnabled,
  updateStrategyPerformance,
} from '../../src/lib/strategy-manager';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const baseStrategy = {
  id: 'strat_1',
  name: 'Momentum Alpha',
  description: 'RSI-based momentum',
  type: 'momentum',
  symbols: ['AAPL', 'MSFT'],
  entryConditions: { indicators: ['RSI'] },
  exitConditions: { stopLoss: 2, takeProfit: 4 },
  positionSizing: { method: 'fixed', value: 500 },
  riskParams: { maxLoss: 0.02, maxPositions: 5 },
  isActive: false,
  backtestResults: null,
  allocatedCapital: 10000,
  maxPositionSize: 1000,
  riskPerTrade: 0.02,
  enabled: false,
  totalPnl: 0,
  totalTrades: 0,
  winningTrades: 0,
  losingTrades: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('Strategy Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStrategy', () => {
    it('should create a strategy with required fields', async () => {
      (mockPrisma.strategy.create as jest.Mock).mockResolvedValue(baseStrategy);

      const result = await createStrategy({
        name: 'Momentum Alpha',
        type: 'momentum',
        symbols: ['aapl', 'msft'],
        entryConditions: { indicators: ['RSI'] },
        exitConditions: { stopLoss: 2, takeProfit: 4 },
        positionSizing: { method: 'fixed', value: 500 },
        riskParams: { maxLoss: 0.02, maxPositions: 5 },
      });

      expect(result.id).toBe('strat_1');
      expect(result.name).toBe('Momentum Alpha');
      expect(mockPrisma.strategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Momentum Alpha',
          type: 'momentum',
          symbols: ['AAPL', 'MSFT'],
          enabled: false,
        }),
      });
    });

    it('should uppercase symbols', async () => {
      (mockPrisma.strategy.create as jest.Mock).mockResolvedValue(baseStrategy);

      await createStrategy({
        name: 'Test',
        type: 'momentum',
        symbols: ['aapl', 'goog'],
        entryConditions: {},
        exitConditions: {},
        positionSizing: {},
        riskParams: {},
      });

      expect(mockPrisma.strategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          symbols: ['AAPL', 'GOOG'],
        }),
      });
    });

    it('should use default values for optional fields', async () => {
      (mockPrisma.strategy.create as jest.Mock).mockResolvedValue(baseStrategy);

      await createStrategy({
        name: 'Test',
        type: 'manual',
        symbols: ['SPY'],
        entryConditions: {},
        exitConditions: {},
        positionSizing: {},
        riskParams: {},
      });

      expect(mockPrisma.strategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          allocatedCapital: 10000,
          maxPositionSize: 1000,
          riskPerTrade: 0.02,
        }),
      });
    });

    it('should accept custom allocatedCapital', async () => {
      (mockPrisma.strategy.create as jest.Mock).mockResolvedValue({
        ...baseStrategy,
        allocatedCapital: 50000,
      });

      await createStrategy({
        name: 'Big Strategy',
        type: 'breakout',
        symbols: ['TSLA'],
        entryConditions: {},
        exitConditions: {},
        positionSizing: {},
        riskParams: {},
        allocatedCapital: 50000,
      });

      expect(mockPrisma.strategy.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          allocatedCapital: 50000,
        }),
      });
    });
  });

  describe('updateStrategy', () => {
    it('should update only specified fields', async () => {
      const updated = { ...baseStrategy, name: 'Updated Name' };
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue(updated);

      const result = await updateStrategy('strat_1', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: { name: 'Updated Name' },
      });
    });

    it('should uppercase symbols on update', async () => {
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({
        ...baseStrategy,
        symbols: ['NVDA', 'AMD'],
      });

      await updateStrategy('strat_1', { symbols: ['nvda', 'amd'] });

      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: { symbols: ['NVDA', 'AMD'] },
      });
    });

    it('should update multiple fields at once', async () => {
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({
        ...baseStrategy,
        name: 'New Name',
        allocatedCapital: 25000,
        enabled: true,
      });

      await updateStrategy('strat_1', {
        name: 'New Name',
        allocatedCapital: 25000,
        enabled: true,
      });

      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: {
          name: 'New Name',
          allocatedCapital: 25000,
          enabled: true,
        },
      });
    });
  });

  describe('deleteStrategy', () => {
    it('should delete a strategy by ID', async () => {
      (mockPrisma.strategy.delete as jest.Mock).mockResolvedValue(baseStrategy);

      await deleteStrategy('strat_1');

      expect(mockPrisma.strategy.delete).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
      });
    });
  });

  describe('getStrategy', () => {
    it('should return a strategy when found', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(baseStrategy);

      const result = await getStrategy('strat_1');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('strat_1');
      expect(mockPrisma.strategy.findUnique).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
      });
    });

    it('should return null when strategy not found', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getStrategy('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listStrategies', () => {
    it('should list all strategies', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([baseStrategy]);

      const result = await listStrategies();

      expect(result).toHaveLength(1);
      expect(mockPrisma.strategy.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by type', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([baseStrategy]);

      await listStrategies({ type: 'momentum' });

      expect(mockPrisma.strategy.findMany).toHaveBeenCalledWith({
        where: { type: 'momentum' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by enabled', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([]);

      await listStrategies({ enabled: true });

      expect(mockPrisma.strategy.findMany).toHaveBeenCalledWith({
        where: { enabled: true },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should filter by both type and enabled', async () => {
      (mockPrisma.strategy.findMany as jest.Mock).mockResolvedValue([]);

      await listStrategies({ type: 'breakout', enabled: false });

      expect(mockPrisma.strategy.findMany).toHaveBeenCalledWith({
        where: { type: 'breakout', enabled: false },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('toggleStrategyEnabled', () => {
    it('should enable a disabled strategy', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue({ ...baseStrategy, enabled: false });
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({ ...baseStrategy, enabled: true });

      const result = await toggleStrategyEnabled('strat_1');

      expect(result.enabled).toBe(true);
      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: { enabled: true },
      });
    });

    it('should disable an enabled strategy', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue({ ...baseStrategy, enabled: true });
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({ ...baseStrategy, enabled: false });

      const result = await toggleStrategyEnabled('strat_1');

      expect(result.enabled).toBe(false);
      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: { enabled: false },
      });
    });

    it('should throw when strategy not found', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(toggleStrategyEnabled('nonexistent')).rejects.toThrow('Strategy not found');
    });
  });

  describe('updateStrategyPerformance', () => {
    it('should update performance on winning trade', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(baseStrategy);
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({});

      await updateStrategyPerformance('strat_1', 150, true);

      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: {
          totalPnl: 150,
          totalTrades: 1,
          winningTrades: 1,
          losingTrades: 0,
        },
      });
    });

    it('should update performance on losing trade', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(baseStrategy);
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({});

      await updateStrategyPerformance('strat_1', -75, false);

      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: {
          totalPnl: -75,
          totalTrades: 1,
          winningTrades: 0,
          losingTrades: 1,
        },
      });
    });

    it('should accumulate with existing performance', async () => {
      const existingPerf = { ...baseStrategy, totalPnl: 500, totalTrades: 10, winningTrades: 7, losingTrades: 3 };
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(existingPerf);
      (mockPrisma.strategy.update as jest.Mock).mockResolvedValue({});

      await updateStrategyPerformance('strat_1', 200, true);

      expect(mockPrisma.strategy.update).toHaveBeenCalledWith({
        where: { id: 'strat_1' },
        data: {
          totalPnl: 700,
          totalTrades: 11,
          winningTrades: 8,
          losingTrades: 3,
        },
      });
    });

    it('should silently return when strategy not found', async () => {
      (mockPrisma.strategy.findUnique as jest.Mock).mockResolvedValue(null);

      await updateStrategyPerformance('nonexistent', 100, true);

      expect(mockPrisma.strategy.update).not.toHaveBeenCalled();
    });
  });
});
