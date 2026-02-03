/**
 * Tests for Trailing Stop Service
 */

import {
  createTrailingStop,
  getActiveTrailingStops,
  monitorTrailingStops,
  updateTrailingStop,
  cancelTrailingStop,
} from '@/lib/trailing-stop';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    managedPosition: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    automationRule: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    alert: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/alpaca', () => ({
  getLatestQuote: jest.fn(),
  getPositions: jest.fn(),
  submitOrder: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getLatestQuote, getPositions, submitOrder } from '@/lib/alpaca';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetLatestQuote = getLatestQuote as jest.Mock;
const mockGetPositions = getPositions as jest.Mock;
const mockSubmitOrder = submitOrder as jest.Mock;

describe('Trailing Stop Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTrailingStop', () => {
    it('should create a percentage-based trailing stop', async () => {
      const mockPosition = {
        id: 'ts-1',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 5,
        takeProfitPct: 0,
        stopLossPct: 5,
        timeStopHours: 0,
        trailingStopPct: 5,
        highWaterMark: 150,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockRule = {
        id: 'rule-1',
        symbol: 'AAPL',
        name: 'Trailing Stop 5% - AAPL',
        ruleType: 'TRAILING_STOP',
        triggerType: 'PRICE_BELOW',
        triggerValue: 142.5, // 150 * (1 - 0.05)
        orderSide: 'sell',
        orderType: 'market',
        enabled: true,
        status: 'active',
      };

      (mockPrisma.managedPosition.create as jest.Mock).mockResolvedValue(mockPosition);
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createTrailingStop({
        symbol: 'AAPL',
        trailPercent: 5,
        quantity: 100,
        enabled: true,
        entryPrice: 150,
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.trailPercent).toBe(5);
      expect(result.entryPrice).toBe(150);
      expect(result.highWaterMark).toBe(150);
      expect(result.currentStopPrice).toBeCloseTo(142.5);
      expect(mockPrisma.managedPosition.create).toHaveBeenCalled();
      expect(mockPrisma.automationRule.create).toHaveBeenCalled();
    });

    it('should reject invalid trail percent', async () => {
      await expect(
        createTrailingStop({
          symbol: 'AAPL',
          trailPercent: 150, // Invalid: >100%
          enabled: true,
          entryPrice: 100,
        })
      ).rejects.toThrow('Trail percent must be between 0 and 100');
    });

    it('should reject missing trail config', async () => {
      await expect(
        createTrailingStop({
          symbol: 'AAPL',
          enabled: true,
          entryPrice: 100,
        })
      ).rejects.toThrow('Must specify either trailPercent or trailAmount');
    });

    it('should create a dollar-based trailing stop', async () => {
      const mockPosition = {
        id: 'ts-2',
        symbol: 'TSLA',
        entryPrice: 200,
        highWaterMark: 200,
        trailingStopPct: 5, // 10/200 = 5%
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (mockPrisma.managedPosition.create as jest.Mock).mockResolvedValue(mockPosition);
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});

      const result = await createTrailingStop({
        symbol: 'TSLA',
        trailAmount: 10, // $10 trail
        quantity: 50,
        enabled: true,
        entryPrice: 200,
      });

      expect(result.symbol).toBe('TSLA');
      expect(result.currentStopPrice).toBe(190); // 200 - 10
    });
  });

  describe('monitorTrailingStops', () => {
    it('should update high-water mark when price increases', async () => {
      const activeStops = [{
        id: 'ts-1',
        symbol: 'AAPL',
        entryPrice: 150,
        highWaterMark: 155,
        trailingStopPct: 5,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      (mockPrisma.managedPosition.findMany as jest.Mock).mockResolvedValue(activeStops);
      mockGetLatestQuote.mockResolvedValue({ bid: 159, ask: 161, last: 160 });
      mockGetPositions.mockResolvedValue([
        { symbol: 'AAPL', qty: '100', avg_entry_price: '150' }
      ]);
      (mockPrisma.managedPosition.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await monitorTrailingStops();

      expect(result.stopsUpdated).toBe(1);
      expect(result.updatedHighWaterMarks[0].previousHWM).toBe(155);
      expect(result.updatedHighWaterMarks[0].newHWM).toBe(160);
      expect(result.updatedHighWaterMarks[0].newStopPrice).toBe(152); // 160 * 0.95
    });

    it('should trigger stop when price drops below stop price', async () => {
      const activeStops = [{
        id: 'ts-2',
        symbol: 'TSLA',
        entryPrice: 200,
        highWaterMark: 220,
        trailingStopPct: 5,
        status: 'active',
        quantity: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      (mockPrisma.managedPosition.findMany as jest.Mock).mockResolvedValue(activeStops);
      // Price at 208, stop price is 220 * 0.95 = 209, so should trigger
      mockGetLatestQuote.mockResolvedValue({ bid: 207, ask: 209, last: 208 });
      mockGetPositions.mockResolvedValue([
        { symbol: 'TSLA', qty: '50', avg_entry_price: '200' }
      ]);
      mockSubmitOrder.mockResolvedValue({ id: 'order-123', status: 'accepted' });
      (mockPrisma.managedPosition.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const result = await monitorTrailingStops();

      expect(result.stopsTriggered).toBe(1);
      expect(result.triggeredStops[0].symbol).toBe('TSLA');
      expect(mockSubmitOrder).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'TSLA',
        qty: 50,
        side: 'sell',
        type: 'market',
      }));
    });

    it('should not trigger if price is above stop', async () => {
      const activeStops = [{
        id: 'ts-3',
        symbol: 'NVDA',
        entryPrice: 500,
        highWaterMark: 550,
        trailingStopPct: 5,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      }];

      (mockPrisma.managedPosition.findMany as jest.Mock).mockResolvedValue(activeStops);
      // Price at 540, stop price is 550 * 0.95 = 522.5, so no trigger
      mockGetLatestQuote.mockResolvedValue({ bid: 539, ask: 541, last: 540 });
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorTrailingStops();

      expect(result.stopsTriggered).toBe(0);
      expect(mockSubmitOrder).not.toHaveBeenCalled();
    });
  });

  describe('updateTrailingStop', () => {
    it('should update trail percent', async () => {
      const existingPosition = {
        id: 'ts-1',
        symbol: 'AAPL',
        entryPrice: 150,
        highWaterMark: 160,
        trailingStopPct: 5,
      };

      (mockPrisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(existingPosition);
      (mockPrisma.managedPosition.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await updateTrailingStop('ts-1', { trailPercent: 3 });

      expect(mockPrisma.managedPosition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ts-1' },
          data: expect.objectContaining({ trailingStopPct: 3 }),
        })
      );
    });
  });

  describe('cancelTrailingStop', () => {
    it('should cancel a trailing stop', async () => {
      (mockPrisma.managedPosition.update as jest.Mock).mockResolvedValue({});
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await cancelTrailingStop('ts-1');

      expect(mockPrisma.managedPosition.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ts-1' },
          data: expect.objectContaining({ 
            status: 'closed',
            closeReason: 'MANUAL',
          }),
        })
      );
    });
  });
});

describe('Stop Price Calculations', () => {
  it('should calculate correct stop for 5% trail', () => {
    const hwm = 100;
    const trailPct = 5;
    const expected = 95; // 100 * (1 - 0.05)
    expect(hwm * (1 - trailPct / 100)).toBe(expected);
  });

  it('should calculate correct stop for 10% trail', () => {
    const hwm = 250;
    const trailPct = 10;
    const expected = 225; // 250 * (1 - 0.10)
    expect(hwm * (1 - trailPct / 100)).toBe(expected);
  });

  it('should calculate correct stop for dollar trail', () => {
    const hwm = 150;
    const trailAmount = 7.50;
    const expected = 142.50;
    expect(hwm - trailAmount).toBe(expected);
  });
});
