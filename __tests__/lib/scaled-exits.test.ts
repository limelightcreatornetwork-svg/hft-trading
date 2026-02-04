/**
 * Tests for Scaled Exits Service
 */

import {
  createScaledExitPlan,
  getScaledExitPlan,
  monitorScaledExits,
  cancelScaledExitPlan,
  updateScaledExitPlan,
  ScaledExitPresets,
} from '@/lib/scaled-exits';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    automationRule: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    alert: {
      create: jest.fn(),
      findMany: jest.fn(),
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

describe('Scaled Exits Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createScaledExitPlan', () => {
    it('should create a basic scaled exit plan', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await createScaledExitPlan({
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        targets: [
          { targetPercent: 5, quantityPercent: 50 },
          { targetPercent: 10, quantityPercent: 50 },
        ],
      });

      expect(plan.symbol).toBe('AAPL');
      expect(plan.entryPrice).toBe(150);
      expect(plan.totalQuantity).toBe(100);
      expect(plan.remainingQuantity).toBe(100);
      expect(plan.targets.length).toBe(2);
      expect(plan.targets[0].targetPercent).toBe(5);
      expect(plan.targets[0].quantityPercent).toBe(50);
      expect(plan.status).toBe('active');
      expect(mockPrisma.automationRule.create).toHaveBeenCalledTimes(2);
    });

    it('should create plan with trailing take-profit', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await createScaledExitPlan({
        symbol: 'TSLA',
        entryPrice: 200,
        totalQuantity: 50,
        targets: [
          { targetPercent: 5, quantityPercent: 50 },
        ],
        trailingTakeProfit: {
          activationPercent: 10,
          trailPercent: 3,
        },
      });

      expect(plan.trailingTakeProfit).toBeDefined();
      expect(plan.trailingTakeProfit?.activationPercent).toBe(10);
      expect(plan.trailingTakeProfit?.trailPercent).toBe(3);
      expect(plan.trailingTakeProfit?.activated).toBe(false);
    });

    it('should reject targets exceeding 100%', async () => {
      await expect(
        createScaledExitPlan({
          symbol: 'AAPL',
          entryPrice: 150,
          totalQuantity: 100,
          targets: [
            { targetPercent: 5, quantityPercent: 60 },
            { targetPercent: 10, quantityPercent: 50 }, // Total = 110%
          ],
        })
      ).rejects.toThrow('Total target percentages cannot exceed 100%');
    });

    it('should reject targets not in ascending order', async () => {
      await expect(
        createScaledExitPlan({
          symbol: 'AAPL',
          entryPrice: 150,
          totalQuantity: 100,
          targets: [
            { targetPercent: 10, quantityPercent: 50 },
            { targetPercent: 5, quantityPercent: 50 }, // Not ascending
          ],
        })
      ).rejects.toThrow('Target percentages must be in ascending order');
    });

    it('should reject empty targets without trailing TP', async () => {
      await expect(
        createScaledExitPlan({
          symbol: 'AAPL',
          entryPrice: 150,
          totalQuantity: 100,
          targets: [],
        })
      ).rejects.toThrow('Must specify at least one target or trailing take-profit');
    });
  });

  describe('monitorScaledExits', () => {
    it('should trigger target when profit threshold is met', async () => {
      // First create a plan
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await createScaledExitPlan({
        symbol: 'AAPL',
        entryPrice: 100,
        totalQuantity: 100,
        targets: [
          { targetPercent: 5, quantityPercent: 50 },
          { targetPercent: 10, quantityPercent: 50 },
        ],
      });

      // Mock price at +6% (above first target of 5%)
      mockGetLatestQuote.mockResolvedValue({ bid: 105.5, ask: 106.5, last: 106 });
      mockGetPositions.mockResolvedValue([]);
      mockSubmitOrder.mockResolvedValue({ id: 'order-123', status: 'accepted' });
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await monitorScaledExits();

      expect(result.targetsTriggered).toBe(1);
      expect(result.executions[0].targetPercent).toBe(5);
      expect(result.executions[0].quantity).toBe(50);
      expect(mockSubmitOrder).toHaveBeenCalledWith(expect.objectContaining({
        symbol: 'AAPL',
        qty: 50,
        side: 'sell',
        type: 'market',
      }));

      // Check plan was updated
      const updatedPlan = getScaledExitPlan(plan.id);
      expect(updatedPlan?.targets[0].triggered).toBe(true);
      expect(updatedPlan?.remainingQuantity).toBe(50);
    });

    it('should activate and trigger trailing take-profit', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      // Create plan with trailing TP that activates at +15%
      const plan = await createScaledExitPlan({
        symbol: 'NVDA',
        entryPrice: 500,
        totalQuantity: 20,
        targets: [
          { targetPercent: 10, quantityPercent: 50 },
        ],
        trailingTakeProfit: {
          activationPercent: 15,
          trailPercent: 3,
        },
      });

      // First, trigger the 10% target
      mockGetLatestQuote.mockResolvedValue({ bid: 554, ask: 556, last: 555 }); // +11%
      mockGetPositions.mockResolvedValue([]);
      mockSubmitOrder.mockResolvedValue({ id: 'order-1', status: 'accepted' });
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      await monitorScaledExits();

      // Now price goes to +18%, activating trailing TP
      mockGetLatestQuote.mockResolvedValue({ bid: 589, ask: 591, last: 590 }); // +18%
      mockSubmitOrder.mockClear();

      await monitorScaledExits();

      // Trailing TP should be activated but not triggered yet
      const updatedPlan = getScaledExitPlan(plan.id);
      expect(updatedPlan?.trailingTakeProfit?.activated).toBe(true);
      expect(updatedPlan?.trailingTakeProfit?.highWaterMark).toBe(590);

      // Now price drops below trailing stop (590 * 0.97 = 572.3)
      mockGetLatestQuote.mockResolvedValue({ bid: 569, ask: 571, last: 570 });
      mockSubmitOrder.mockResolvedValue({ id: 'order-2', status: 'accepted' });

      const result = await monitorScaledExits();

      expect(result.trailingTriggered).toBeGreaterThanOrEqual(1);
      expect(mockSubmitOrder).toHaveBeenCalled();
    });
  });

  describe('cancelScaledExitPlan', () => {
    it('should cancel an active plan', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      const plan = await createScaledExitPlan({
        symbol: 'META',
        entryPrice: 500,
        totalQuantity: 30,
        targets: [
          { targetPercent: 5, quantityPercent: 50 },
          { targetPercent: 10, quantityPercent: 50 },
        ],
      });

      await cancelScaledExitPlan(plan.id);

      const cancelledPlan = getScaledExitPlan(plan.id);
      expect(cancelledPlan?.status).toBe('cancelled');
    });

    it('should throw for non-existent plan', async () => {
      await expect(cancelScaledExitPlan('non-existent-id'))
        .rejects.toThrow('Scaled exit plan not found');
    });
  });

  describe('updateScaledExitPlan', () => {
    it('should add new targets', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await createScaledExitPlan({
        symbol: 'GOOGL',
        entryPrice: 150,
        totalQuantity: 100,
        targets: [
          { targetPercent: 5, quantityPercent: 33 },
        ],
      });

      const updated = updateScaledExitPlan(plan.id, {
        addTargets: [{ targetPercent: 10, quantityPercent: 33 }],
      });

      expect(updated.targets.length).toBe(2);
      expect(updated.targets[1].targetPercent).toBe(10);
    });

    it('should update trailing config', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await createScaledExitPlan({
        symbol: 'AMZN',
        entryPrice: 180,
        totalQuantity: 50,
        targets: [{ targetPercent: 5, quantityPercent: 50 }],
        trailingTakeProfit: { activationPercent: 10, trailPercent: 3 },
      });

      const updated = updateScaledExitPlan(plan.id, {
        updateTrailing: { trailPercent: 5 },
      });

      expect(updated.trailingTakeProfit?.trailPercent).toBe(5);
    });
  });

  describe('ScaledExitPresets', () => {
    it('should create conservative preset', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await ScaledExitPresets.conservative('AAPL', 150, 100);

      expect(plan.targets.length).toBe(2);
      expect(plan.targets[0]).toEqual(expect.objectContaining({
        targetPercent: 3,
        quantityPercent: 50,
      }));
      expect(plan.targets[1]).toEqual(expect.objectContaining({
        targetPercent: 5,
        quantityPercent: 30,
      }));
      expect(plan.trailingTakeProfit).toEqual(expect.objectContaining({
        activationPercent: 8,
        trailPercent: 2,
      }));
    });

    it('should create balanced preset', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await ScaledExitPresets.balanced('TSLA', 200, 50);

      expect(plan.targets[0].targetPercent).toBe(5);
      expect(plan.targets[1].targetPercent).toBe(10);
      expect(plan.trailingTakeProfit?.activationPercent).toBe(15);
    });

    it('should create aggressive preset', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await ScaledExitPresets.aggressive('NVDA', 500, 20);

      expect(plan.targets[0].quantityPercent).toBe(25);
      expect(plan.trailingTakeProfit?.activationPercent).toBe(20);
      expect(plan.trailingTakeProfit?.trailPercent).toBe(5);
    });

    it('should create dayTrade preset without trailing', async () => {
      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue({});
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const plan = await ScaledExitPresets.dayTrade('SPY', 450, 100);

      expect(plan.targets[0].targetPercent).toBe(1);
      expect(plan.targets[1].targetPercent).toBe(2);
      expect(plan.trailingTakeProfit).toBeUndefined();
    });
  });
});

describe('Scaled Exit Calculations', () => {
  it('should calculate correct quantity for percentage', () => {
    const totalQuantity = 100;
    const percentages = [50, 30, 20];
    const quantities = percentages.map(p => Math.floor(totalQuantity * (p / 100)));
    
    expect(quantities).toEqual([50, 30, 20]);
    expect(quantities.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('should handle fractional quantities correctly', () => {
    const totalQuantity = 33;
    const percentage = 50;
    const quantity = Math.floor(totalQuantity * (percentage / 100));
    
    expect(quantity).toBe(16); // floor(16.5)
  });

  it('should calculate target prices correctly', () => {
    const entryPrice = 100;
    const targets = [5, 10, 15]; // percentages
    const targetPrices = targets.map(t => entryPrice * (1 + t / 100));
    
    expect(targetPrices[0]).toBeCloseTo(105);
    expect(targetPrices[1]).toBeCloseTo(110);
    expect(targetPrices[2]).toBeCloseTo(115);
  });
});
