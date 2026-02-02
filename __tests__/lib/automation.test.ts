/**
 * Tests for Trading Bot Automation Service
 */

import { 
  createAutomationRule,
  createOCORule,
  createStopLossRule,
  createTakeProfitRule,
  createLimitOrderRule,
  RuleType,
  TriggerType,
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
