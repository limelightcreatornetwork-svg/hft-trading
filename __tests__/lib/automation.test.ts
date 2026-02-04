/**
 * Tests for Trading Bot Automation Service
 */

import {
  createAutomationRule,
  createOCORule,
  createStopLossRule,
  createTakeProfitRule,
  createLimitOrderRule,
  getActiveRules,
  monitorAndExecute,
  getAllRules,
  getRuleExecutions,
  cleanupSnapshots,
  cancelRule,
  toggleRule,
} from '@/lib/automation';

// Mock the dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    automationRule: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    automationExecution: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    positionSnapshot: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/alpaca', () => ({
  getLatestQuote: jest.fn(),
  getPositions: jest.fn(),
  submitOrder: jest.fn(),
  cancelOrder: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getLatestQuote, getPositions, submitOrder } from '@/lib/alpaca';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetLatestQuote = getLatestQuote as jest.Mock;
const mockGetPositions = getPositions as jest.Mock;
const mockSubmitOrder = submitOrder as jest.Mock;

describe('Automation Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAutomationRule', () => {
    it('should create a basic automation rule', async () => {
      const mockRule = {
        id: 'test-rule-1',
        symbol: 'AAPL',
        name: 'Test Rule',
        enabled: true,
        ruleType: 'LIMIT_ORDER',
        triggerType: 'PRICE_BELOW',
        triggerValue: 150,
        orderSide: 'buy',
        orderType: 'market',
        quantity: 10,
        limitPrice: null,
        ocoGroupId: null,
        positionId: null,
        entryPrice: null,
        status: 'active',
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createAutomationRule({
        symbol: 'AAPL',
        name: 'Test Rule',
        ruleType: 'LIMIT_ORDER',
        triggerType: 'PRICE_BELOW',
        triggerValue: 150,
        orderSide: 'buy',
        orderType: 'market',
        quantity: 10,
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.ruleType).toBe('LIMIT_ORDER');
      expect(result.status).toBe('active');
      expect(mockPrisma.automationRule.create).toHaveBeenCalled();
    });

    it('should reject rule with invalid trigger value', async () => {
      await expect(
        createAutomationRule({
          symbol: 'AAPL',
          name: 'Invalid Rule',
          ruleType: 'STOP_LOSS',
          triggerType: 'PERCENT_LOSS',
          triggerValue: -5, // Invalid negative value
          orderSide: 'sell',
          orderType: 'market',
        })
      ).rejects.toThrow('Trigger value must be positive');
    });

    it('should require entry price for percentage triggers', async () => {
      await expect(
        createAutomationRule({
          symbol: 'AAPL',
          name: 'Missing Entry',
          ruleType: 'STOP_LOSS',
          triggerType: 'PERCENT_LOSS',
          triggerValue: 5,
          orderSide: 'sell',
          orderType: 'market',
          // No entryPrice provided
        })
      ).rejects.toThrow('Entry price or position ID required');
    });
  });

  describe('createStopLossRule', () => {
    it('should create a percentage-based stop loss for long position', async () => {
      const mockRule = {
        id: 'sl-rule-1',
        symbol: 'TSLA',
        name: 'Stop Loss 5% - TSLA',
        enabled: true,
        ruleType: 'STOP_LOSS',
        triggerType: 'PERCENT_LOSS',
        triggerValue: 5,
        orderSide: 'sell',
        orderType: 'market',
        quantity: 10,
        limitPrice: null,
        ocoGroupId: null,
        positionId: null,
        entryPrice: 200,
        status: 'active',
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createStopLossRule({
        symbol: 'TSLA',
        quantity: 10,
        entryPrice: 200,
        stopLossAmount: 5,
        isPercent: true,
        positionSide: 'long',
      });

      expect(result.ruleType).toBe('STOP_LOSS');
      expect(result.triggerType).toBe('PERCENT_LOSS');
      expect(result.orderSide).toBe('sell');
    });

    it('should create a dollar-based stop loss', async () => {
      const mockRule = {
        id: 'sl-rule-2',
        symbol: 'GOOGL',
        name: 'Stop Loss $10 - GOOGL',
        enabled: true,
        ruleType: 'STOP_LOSS',
        triggerType: 'DOLLAR_LOSS',
        triggerValue: 140, // $150 - $10
        orderSide: 'sell',
        orderType: 'market',
        quantity: 5,
        limitPrice: null,
        ocoGroupId: null,
        positionId: null,
        entryPrice: 150,
        status: 'active',
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createStopLossRule({
        symbol: 'GOOGL',
        quantity: 5,
        entryPrice: 150,
        stopLossAmount: 10,
        isPercent: false,
        positionSide: 'long',
      });

      expect(result.ruleType).toBe('STOP_LOSS');
      expect(result.triggerType).toBe('DOLLAR_LOSS');
    });
  });

  describe('createTakeProfitRule', () => {
    it('should create a percentage-based take profit', async () => {
      const mockRule = {
        id: 'tp-rule-1',
        symbol: 'NVDA',
        name: 'Take Profit 10% - NVDA',
        enabled: true,
        ruleType: 'TAKE_PROFIT',
        triggerType: 'PERCENT_GAIN',
        triggerValue: 10,
        orderSide: 'sell',
        orderType: 'market',
        quantity: null,
        limitPrice: null,
        ocoGroupId: null,
        positionId: null,
        entryPrice: 500,
        status: 'active',
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createTakeProfitRule({
        symbol: 'NVDA',
        entryPrice: 500,
        takeProfitAmount: 10,
        isPercent: true,
        positionSide: 'long',
      });

      expect(result.ruleType).toBe('TAKE_PROFIT');
      expect(result.triggerType).toBe('PERCENT_GAIN');
    });
  });

  describe('createOCORule', () => {
    it('should create linked stop loss and take profit rules', async () => {
      const mockStopLoss = {
        id: 'oco-sl-1',
        symbol: 'META',
        name: 'OCO Stop Loss - META',
        ruleType: 'OCO',
        triggerType: 'PRICE_BELOW',
        triggerValue: 450,
        orderSide: 'sell',
        ocoGroupId: expect.stringContaining('oco_'),
        entryPrice: 500,
        status: 'active',
        enabled: true,
        orderType: 'market',
        quantity: 10,
        limitPrice: null,
        positionId: null,
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      const mockTakeProfit = {
        ...mockStopLoss,
        id: 'oco-tp-1',
        name: 'OCO Take Profit - META',
        triggerType: 'PRICE_ABOVE',
        triggerValue: 550,
      };

      (mockPrisma.automationRule.create as jest.Mock)
        .mockResolvedValueOnce(mockStopLoss)
        .mockResolvedValueOnce(mockTakeProfit);

      const result = await createOCORule({
        symbol: 'META',
        quantity: 10,
        entryPrice: 500,
        stopLossPrice: 450,
        takeProfitPrice: 550,
      });

      expect(result.stopLoss.ruleType).toBe('OCO');
      expect(result.takeProfit.ruleType).toBe('OCO');
      expect(result.ocoGroupId).toContain('oco_');
      expect(mockPrisma.automationRule.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('createLimitOrderRule', () => {
    it('should create a buy limit order rule', async () => {
      const mockRule = {
        id: 'limit-1',
        symbol: 'AMZN',
        name: 'Limit Order @ $180 - AMZN',
        ruleType: 'LIMIT_ORDER',
        triggerType: 'PRICE_BELOW',
        triggerValue: 180,
        orderSide: 'buy',
        orderType: 'market',
        quantity: 5,
        limitPrice: null,
        ocoGroupId: null,
        positionId: null,
        entryPrice: null,
        status: 'active',
        enabled: true,
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createLimitOrderRule({
        symbol: 'AMZN',
        quantity: 5,
        targetPrice: 180,
        orderSide: 'buy',
      });

      expect(result.ruleType).toBe('LIMIT_ORDER');
      expect(result.triggerType).toBe('PRICE_BELOW');
      expect(result.orderSide).toBe('buy');
    });

    it('should create a sell limit order rule', async () => {
      const mockRule = {
        id: 'limit-2',
        symbol: 'MSFT',
        name: 'Limit Order @ $450 - MSFT',
        ruleType: 'LIMIT_ORDER',
        triggerType: 'PRICE_ABOVE',
        triggerValue: 450,
        orderSide: 'sell',
        orderType: 'limit',
        quantity: 3,
        limitPrice: 450,
        ocoGroupId: null,
        positionId: null,
        entryPrice: null,
        status: 'active',
        enabled: true,
        triggeredAt: null,
        orderId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: null,
      };

      (mockPrisma.automationRule.create as jest.Mock).mockResolvedValue(mockRule);

      const result = await createLimitOrderRule({
        symbol: 'MSFT',
        quantity: 3,
        targetPrice: 450,
        orderSide: 'sell',
        limitPrice: 450,
      });

      expect(result.triggerType).toBe('PRICE_ABOVE');
      expect(result.orderSide).toBe('sell');
      expect(result.limitPrice).toBe(450);
    });
  });
});

describe('Trigger Logic', () => {
  // Test trigger checking logic
  describe('Price triggers', () => {
    it('should correctly identify PRICE_ABOVE trigger', () => {
      const rule = {
        triggerType: 'PRICE_ABOVE',
        triggerValue: 100,
        entryPrice: null,
        orderSide: 'sell',
      };
      
      // Price at 105 should trigger PRICE_ABOVE 100
      expect(105 >= rule.triggerValue).toBe(true);
      // Price at 95 should not trigger
      expect(95 >= rule.triggerValue).toBe(false);
    });

    it('should correctly identify PRICE_BELOW trigger', () => {
      const rule = {
        triggerType: 'PRICE_BELOW',
        triggerValue: 100,
        entryPrice: null,
        orderSide: 'buy',
      };
      
      // Price at 95 should trigger PRICE_BELOW 100
      expect(95 <= rule.triggerValue).toBe(true);
      // Price at 105 should not trigger
      expect(105 <= rule.triggerValue).toBe(false);
    });
  });

  describe('Percentage triggers', () => {
    it('should correctly calculate PERCENT_GAIN for long position', () => {
      const entryPrice = 100;
      const currentPrice = 110;
      const targetPercent = 10;
      
      const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      expect(gainPct).toBe(10);
      expect(gainPct >= targetPercent).toBe(true);
    });

    it('should correctly calculate PERCENT_LOSS for long position', () => {
      const entryPrice = 100;
      const currentPrice = 95;
      const targetPercent = 5;

      const lossPct = ((entryPrice - currentPrice) / entryPrice) * 100;
      expect(lossPct).toBe(5);
      expect(lossPct >= targetPercent).toBe(true);
    });
  });
});

// Helper to build a mock rule object with sensible defaults
function makeMockRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    symbol: 'AAPL',
    name: 'Test Rule',
    enabled: true,
    ruleType: 'LIMIT_ORDER',
    triggerType: 'PRICE_BELOW',
    triggerValue: 150,
    orderSide: 'buy',
    orderType: 'market',
    quantity: 10,
    limitPrice: null,
    ocoGroupId: null,
    positionId: null,
    entryPrice: null,
    status: 'active',
    triggeredAt: null,
    orderId: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    expiresAt: null,
    ...overrides,
  };
}

describe('getActiveRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return active rules with current prices and trigger distances', async () => {
    const rules = [
      makeMockRule({ id: 'r1', symbol: 'AAPL', triggerType: 'PRICE_BELOW', triggerValue: 140 }),
      makeMockRule({ id: 'r2', symbol: 'TSLA', triggerType: 'PRICE_ABOVE', triggerValue: 300 }),
    ];

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue(rules);
    mockGetLatestQuote
      .mockResolvedValueOnce({ bid: 149, ask: 151, last: 150 })   // AAPL mid=150
      .mockResolvedValueOnce({ bid: 279, ask: 281, last: 280 });  // TSLA mid=280

    const result = await getActiveRules();

    expect(result).toHaveLength(2);
    expect(result[0].currentPrice).toBe(150);
    expect(result[0].triggerPrice).toBe(140);
    expect(result[0].distanceToTrigger).toBe(10);
    expect(result[0].distanceToTriggerPct).toBeCloseTo((10 / 150) * 100);

    expect(result[1].currentPrice).toBe(280);
    expect(result[1].triggerPrice).toBe(300);
    expect(result[1].distanceToTrigger).toBe(20);
  });

  it('should handle rules when price fetch fails for a symbol', async () => {
    const rules = [makeMockRule({ id: 'r1', symbol: 'AAPL' })];
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue(rules);
    mockGetLatestQuote.mockRejectedValue(new Error('API down'));

    const result = await getActiveRules();

    expect(result).toHaveLength(1);
    expect(result[0].currentPrice).toBeUndefined();
    expect(result[0].distanceToTrigger).toBeUndefined();
  });

  it('should return empty array when table does not exist', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockRejectedValue(
      new Error('relation "AutomationRule" does not exist')
    );

    const result = await getActiveRules();
    expect(result).toEqual([]);
  });

  it('should rethrow non-table errors', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockRejectedValue(
      new Error('connection refused')
    );

    await expect(getActiveRules()).rejects.toThrow('connection refused');
  });

  it('should filter rules by symbol', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);

    await getActiveRules('aapl');

    expect(mockPrisma.automationRule.findMany).toHaveBeenCalledWith({
      where: { status: 'active', symbol: 'AAPL' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should deduplicate symbols when fetching prices', async () => {
    const rules = [
      makeMockRule({ id: 'r1', symbol: 'AAPL' }),
      makeMockRule({ id: 'r2', symbol: 'AAPL' }),
    ];
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue(rules);
    mockGetLatestQuote.mockResolvedValue({ bid: 149, ask: 151, last: 150 });

    await getActiveRules();

    expect(mockGetLatestQuote).toHaveBeenCalledTimes(1);
  });
});

describe('cancelRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set rule status to cancelled and disable it', async () => {
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});

    await cancelRule('rule-123');

    expect(mockPrisma.automationRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-123' },
      data: { status: 'cancelled', enabled: false },
    });
  });
});

describe('toggleRule', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should enable a rule', async () => {
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});

    await toggleRule('rule-123', true);

    expect(mockPrisma.automationRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-123' },
      data: { enabled: true },
    });
  });

  it('should disable a rule', async () => {
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});

    await toggleRule('rule-123', false);

    expect(mockPrisma.automationRule.update).toHaveBeenCalledWith({
      where: { id: 'rule-123' },
      data: { enabled: false },
    });
  });
});

describe('getRuleExecutions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return executions for a given rule', async () => {
    const mockExecutions = [
      {
        id: 'exec-1',
        ruleId: 'rule-1',
        triggerPrice: 148,
        executedPrice: 148.5,
        quantity: 10,
        orderId: 'order-abc',
        orderStatus: 'filled',
        errorMessage: null,
        createdAt: new Date('2025-01-15'),
      },
    ];

    (mockPrisma.automationExecution.findMany as jest.Mock).mockResolvedValue(mockExecutions);

    const result = await getRuleExecutions('rule-1');

    expect(result).toEqual(mockExecutions);
    expect(mockPrisma.automationExecution.findMany).toHaveBeenCalledWith({
      where: { ruleId: 'rule-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});

describe('getAllRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return all rules with calculated trigger prices', async () => {
    const rules = [
      makeMockRule({ id: 'r1', triggerType: 'PRICE_BELOW', triggerValue: 140 }),
      makeMockRule({ id: 'r2', triggerType: 'PERCENT_GAIN', triggerValue: 10, entryPrice: 100, status: 'triggered' }),
    ];
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue(rules);

    const result = await getAllRules();

    expect(result).toHaveLength(2);
    expect(result[0].triggerPrice).toBe(140);
    // PERCENT_GAIN with entry 100 and trigger 10% => 110
    expect(result[1].triggerPrice).toBeCloseTo(110);
    expect(result[0].currentPrice).toBeUndefined();
  });

  it('should respect the limit parameter', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);

    await getAllRules(25);

    expect(mockPrisma.automationRule.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  });

  it('should default limit to 100', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);

    await getAllRules();

    expect(mockPrisma.automationRule.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });

  it('should return empty array when table does not exist', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockRejectedValue(
      new Error('The table `public.AutomationRule` does not exist')
    );

    const result = await getAllRules();
    expect(result).toEqual([]);
  });

  it('should rethrow non-table errors', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockRejectedValue(
      new Error('timeout')
    );

    await expect(getAllRules()).rejects.toThrow('timeout');
  });
});

describe('cleanupSnapshots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delete snapshots older than the default 30 days', async () => {
    (mockPrisma.positionSnapshot.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });

    const result = await cleanupSnapshots();

    expect(result).toBe(42);
    const callArgs = (mockPrisma.positionSnapshot.deleteMany as jest.Mock).mock.calls[0][0];
    const cutoffDate = callArgs.where.timestamp.lt as Date;
    // The cutoff should be approximately 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    expect(Math.abs(cutoffDate.getTime() - thirtyDaysAgo.getTime())).toBeLessThan(5000);
  });

  it('should respect custom day parameter', async () => {
    (mockPrisma.positionSnapshot.deleteMany as jest.Mock).mockResolvedValue({ count: 5 });

    const result = await cleanupSnapshots(7);

    expect(result).toBe(5);
    const callArgs = (mockPrisma.positionSnapshot.deleteMany as jest.Mock).mock.calls[0][0];
    const cutoffDate = callArgs.where.timestamp.lt as Date;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    expect(Math.abs(cutoffDate.getTime() - sevenDaysAgo.getTime())).toBeLessThan(5000);
  });
});

describe('monitorAndExecute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return empty result when table does not exist', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockRejectedValue(
      new Error('relation "AutomationRule" does not exist')
    );

    const result = await monitorAndExecute();

    expect(result.rulesChecked).toBe(0);
    expect(result.rulesTriggered).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.triggeredRules).toEqual([]);
  });

  it('should return empty result when no active rules exist', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);
    mockGetPositions.mockResolvedValue([]);
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesChecked).toBe(0);
    expect(result.rulesTriggered).toBe(0);
  });

  it('should trigger and execute a PRICE_BELOW rule when price drops below trigger', async () => {
    const rule = makeMockRule({
      id: 'rule-buy',
      symbol: 'AAPL',
      triggerType: 'PRICE_BELOW',
      triggerValue: 150,
      orderSide: 'buy',
      orderType: 'market',
      quantity: 10,
      enabled: true,
      expiresAt: null,
    });

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([]);
    mockGetLatestQuote.mockResolvedValue({ bid: 144, ask: 146, last: 145 }); // mid=145, below 150
    mockSubmitOrder.mockResolvedValue({ id: 'order-001', status: 'accepted' });
    (mockPrisma.automationExecution.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesChecked).toBe(1);
    expect(result.rulesTriggered).toBe(1);
    expect(result.triggeredRules[0]).toMatchObject({
      ruleId: 'rule-buy',
      symbol: 'AAPL',
      orderId: 'order-001',
      status: 'accepted',
    });
    expect(mockSubmitOrder).toHaveBeenCalledWith({
      symbol: 'AAPL',
      qty: 10,
      side: 'buy',
      type: 'market',
      time_in_force: 'day',
      limit_price: undefined,
    });
  });

  it('should not trigger a rule when price is above trigger value for PRICE_BELOW', async () => {
    const rule = makeMockRule({
      triggerType: 'PRICE_BELOW',
      triggerValue: 150,
      quantity: 10,
    });

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([]);
    mockGetLatestQuote.mockResolvedValue({ bid: 154, ask: 156, last: 155 }); // mid=155, above 150
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesChecked).toBe(1);
    expect(result.rulesTriggered).toBe(0);
    expect(mockSubmitOrder).not.toHaveBeenCalled();
  });

  it('should cancel OCO group when one leg triggers', async () => {
    const rule = makeMockRule({
      id: 'oco-sl',
      symbol: 'AAPL',
      triggerType: 'PRICE_BELOW',
      triggerValue: 140,
      orderSide: 'sell',
      quantity: 10,
      ocoGroupId: 'oco_group_1',
    });

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([]);
    mockGetLatestQuote.mockResolvedValue({ bid: 134, ask: 136, last: 135 }); // mid=135, below 140
    mockSubmitOrder.mockResolvedValue({ id: 'order-oco', status: 'accepted' });
    (mockPrisma.automationExecution.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesTriggered).toBe(1);
    // Should call updateMany to cancel the OCO group
    expect(mockPrisma.automationRule.updateMany).toHaveBeenCalledWith({
      where: { ocoGroupId: 'oco_group_1', status: 'active' },
      data: { status: 'cancelled', enabled: false },
    });
  });

  it('should record error when rule execution fails', async () => {
    const rule = makeMockRule({
      id: 'rule-fail',
      symbol: 'AAPL',
      triggerType: 'PRICE_BELOW',
      triggerValue: 150,
      quantity: 10,
    });

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([]);
    mockGetLatestQuote.mockResolvedValue({ bid: 144, ask: 146, last: 145 }); // triggers
    mockSubmitOrder.mockRejectedValue(new Error('insufficient funds'));
    (mockPrisma.automationExecution.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesTriggered).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('rule-fail');
  });

  it('should skip rules when price is not available', async () => {
    const rule = makeMockRule({
      id: 'rule-no-price',
      symbol: 'AAPL',
      triggerType: 'PRICE_BELOW',
      triggerValue: 150,
      quantity: 10,
    });

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([]);
    mockGetLatestQuote.mockRejectedValue(new Error('API error'));
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    const result = await monitorAndExecute();

    expect(result.rulesChecked).toBe(1);
    expect(result.rulesTriggered).toBe(0);
    expect(mockSubmitOrder).not.toHaveBeenCalled();
  });

  it('should take position snapshots with current prices', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);
    const mockPosition = {
      symbol: 'AAPL',
      qty: '10',
      avg_entry_price: '145.00',
      current_price: '150.00',
      market_value: '1500.00',
      unrealized_pl: '50.00',
      unrealized_plpc: '0.0345',
    };
    mockGetPositions.mockResolvedValue([mockPosition]);
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    await monitorAndExecute();

    expect(mockPrisma.positionSnapshot.createMany).toHaveBeenCalledWith({
      data: [
        {
          symbol: 'AAPL',
          quantity: 10,
          avgEntryPrice: 145,
          currentPrice: 150,
          marketValue: 1500,
          unrealizedPL: 50,
          unrealizedPLPct: 3.45,
        },
      ],
    });
  });

  it('should use position quantity when rule has no quantity', async () => {
    const rule = makeMockRule({
      id: 'rule-no-qty',
      symbol: 'AAPL',
      triggerType: 'PRICE_BELOW',
      triggerValue: 150,
      orderSide: 'sell',
      quantity: null,
    });
    const mockPosition = {
      symbol: 'AAPL',
      qty: '25',
      avg_entry_price: '145.00',
      current_price: '140.00',
      market_value: '3500.00',
      unrealized_pl: '-125.00',
      unrealized_plpc: '-0.0345',
    };

    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([rule]);
    mockGetPositions.mockResolvedValue([mockPosition]);
    mockGetLatestQuote.mockResolvedValue({ bid: 144, ask: 146, last: 145 }); // mid=145, below 150
    mockSubmitOrder.mockResolvedValue({ id: 'order-pos', status: 'filled' });
    (mockPrisma.automationExecution.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 1 });

    const result = await monitorAndExecute();

    expect(result.rulesTriggered).toBe(1);
    expect(mockSubmitOrder).toHaveBeenCalledWith(
      expect.objectContaining({ qty: 25 })
    );
  });

  it('should expire outdated rules', async () => {
    (mockPrisma.automationRule.findMany as jest.Mock).mockResolvedValue([]);
    mockGetPositions.mockResolvedValue([]);
    (mockPrisma.automationRule.updateMany as jest.Mock).mockResolvedValue({ count: 2 });
    (mockPrisma.positionSnapshot.createMany as jest.Mock).mockResolvedValue({ count: 0 });

    await monitorAndExecute();

    // Should call updateMany to expire rules (separate from the OCO cancellation call)
    expect(mockPrisma.automationRule.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        expiresAt: { lt: expect.any(Date) },
      },
      data: { status: 'expired' },
    });
  });
});
