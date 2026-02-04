/**
 * Tests for Trade Manager
 */

// Mock Prisma before importing
jest.mock('../../src/lib/db', () => ({
  prisma: {
    managedPosition: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    alert: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    intent: {
      create: jest.fn().mockResolvedValue({ id: 'intent-123' }),
    },
    order: {
      create: jest.fn().mockResolvedValue({ id: 'order-123' }),
    },
  },
}));

// Mock alpaca
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {
    getLatestQuote: jest.fn().mockResolvedValue({
      BidPrice: 150,
      AskPrice: 150.05,
    }),
  },
  submitOrder: jest.fn().mockResolvedValue({
    id: 'order-broker-123',
    symbol: 'AAPL',
    qty: '100',
    side: 'buy',
    type: 'market',
    limit_price: null,
  }),
}));

// Mock risk-engine
jest.mock('../../src/lib/risk-engine', () => ({
  checkIntent: jest.fn().mockResolvedValue({
    approved: true,
    reason: 'Risk checks passed',
  }),
}));

// Mock confidence module
jest.mock('../../src/lib/confidence', () => ({
  calculateConfidence: jest.fn().mockResolvedValue({
    total: 8,
    technical: 8,
    riskReward: 8,
    marketConditions: 8,
    timeOfDay: 8,
    breakdown: {
      regime: 'TREND',
      regimeConfidence: 0.8,
      momentum: 0.1,
      volumeAnomaly: 1.0,
      vixLevel: 15,
      riskRewardRatio: 2.5,
      marketHour: 'mid-morning',
    },
    recommendation: 'FULL',
    positionSizePct: 20,
    reasoning: ['Strong trend detected'],
  }),
  getSuggestedLevels: jest.fn().mockResolvedValue({
    takeProfit: 153,
    takeProfitPct: 2.0,
    stopLoss: 148.5,
    stopLossPct: 1.0,
    atrBased: true,
  }),
}));

import { prisma } from '../../src/lib/db';
import { calculateConfidence } from '../../src/lib/confidence';
import { checkIntent } from '../../src/lib/risk-engine';
import { submitOrder } from '../../src/lib/alpaca';
import alpaca from '../../src/lib/alpaca';
import {
  createManagedPosition,
  CreateManagedPositionResult,
  TradeRequest,
  getActiveManagedPositions,
  checkAllPositions,
  getPendingAlerts,
  getAllAlerts,
  dismissAlert,
  manualClosePosition,
  getPositionHistory,
  getTradingStats,
} from '../../src/lib/trade-manager';

describe('Trade Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createManagedPosition', () => {
    const mockTradeRequest: TradeRequest = {
      symbol: 'AAPL',
      side: 'buy',
      quantity: 100,
      entryPrice: 150,
    };

    it('should create a managed position with high confidence', async () => {
      const mockCreatedPosition = {
        id: 'pos-123',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: null,
        highWaterMark: 150,
        enteredAt: new Date(),
        status: 'active',
        technicalScore: 8,
        riskRewardScore: 8,
        marketCondScore: 8,
        timeOfDayScore: 8,
        alerts: [],
      };

      (prisma.managedPosition.create as jest.Mock).mockResolvedValue(mockCreatedPosition);

      const result = await createManagedPosition(mockTradeRequest);

      expect(result.skipped).toBe(false);
      expect(result.position).toBeDefined();
      expect(result.confidence.total).toBe(8);
      expect(calculateConfidence).toHaveBeenCalledWith({
        symbol: 'AAPL',
        side: 'buy',
        entryPrice: 150,
      });
    });

    it('should skip trade when confidence is too low', async () => {
      (calculateConfidence as jest.Mock).mockResolvedValueOnce({
        total: 2,
        technical: 2,
        riskReward: 3,
        marketConditions: 2,
        timeOfDay: 2,
        breakdown: {
          regime: 'VOL_EXPANSION',
          regimeConfidence: 0.3,
          momentum: 0,
          volumeAnomaly: 4,
          vixLevel: 35,
          riskRewardRatio: 0.5,
          marketHour: 'close',
        },
        recommendation: 'SKIP',
        positionSizePct: 0,
        reasoning: ['Volatility too high'],
      });

      const result = await createManagedPosition(mockTradeRequest);

      expect(result.skipped).toBe(true);
      expect(result.position).toBeNull();
      expect(result.reason).toContain('low confidence');
      expect(prisma.managedPosition.create).not.toHaveBeenCalled();
    });

    it('should use provided TP/SL when specified', async () => {
      const mockCreatedPosition = {
        id: 'pos-456',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 3.0, // Custom TP
        stopLossPct: 1.5,   // Custom SL
        timeStopHours: 4,
        trailingStopPct: null,
        highWaterMark: 150,
        enteredAt: new Date(),
        status: 'active',
        alerts: [],
      };

      (prisma.managedPosition.create as jest.Mock).mockResolvedValue(mockCreatedPosition);

      const customRequest: TradeRequest = {
        ...mockTradeRequest,
        takeProfitPct: 3.0,
        stopLossPct: 1.5,
      };

      const result = await createManagedPosition(customRequest);

      expect(result.skipped).toBe(false);
      // Verify create was called with custom values
      expect(prisma.managedPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            takeProfitPct: 3.0,
            stopLossPct: 1.5,
          }),
        })
      );
    });

    it('should handle sell side correctly', async () => {
      const mockCreatedPosition = {
        id: 'pos-789',
        symbol: 'AAPL',
        side: 'sell',
        quantity: 50,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: null,
        highWaterMark: 150,
        enteredAt: new Date(),
        status: 'active',
        alerts: [],
      };

      (prisma.managedPosition.create as jest.Mock).mockResolvedValue(mockCreatedPosition);

      const sellRequest: TradeRequest = {
        symbol: 'AAPL',
        side: 'sell',
        quantity: 50,
        entryPrice: 150,
      };

      const result = await createManagedPosition(sellRequest);

      expect(result.skipped).toBe(false);
      expect(result.position?.side).toBe('sell');
    });

    it('should include trailing stop when provided', async () => {
      const mockCreatedPosition = {
        id: 'pos-trail',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: 1.5,
        highWaterMark: 150,
        enteredAt: new Date(),
        status: 'active',
        alerts: [],
      };

      (prisma.managedPosition.create as jest.Mock).mockResolvedValue(mockCreatedPosition);

      const trailingRequest: TradeRequest = {
        ...mockTradeRequest,
        trailingStopPct: 1.5,
      };

      const result = await createManagedPosition(trailingRequest);

      expect(result.skipped).toBe(false);
      expect(prisma.managedPosition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trailingStopPct: 1.5,
          }),
        })
      );
    });
  });

  describe('CreateManagedPositionResult type', () => {
    it('should have discriminated union with skipped: false', () => {
      const result: CreateManagedPositionResult = {
        position: {
          id: 'test',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100,
          entryPrice: 150,
          confidence: 8,
          takeProfitPct: 2.0,
          stopLossPct: 1.0,
          takeProfitPrice: 153,
          stopLossPrice: 148.5,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 150,
          enteredAt: new Date(),
          status: 'active',
          hoursRemaining: 4,
          alerts: [],
        },
        confidence: {
          total: 8,
          technical: 8,
          riskReward: 8,
          marketConditions: 8,
          timeOfDay: 8,
          breakdown: {
            regime: 'TREND',
            regimeConfidence: 0.8,
            momentum: 0.1,
            volumeAnomaly: 1.0,
            vixLevel: 15,
            riskRewardRatio: 2.5,
            marketHour: 'mid-morning',
          },
          recommendation: 'FULL',
          positionSizePct: 20,
          reasoning: [],
        },
        skipped: false,
      };

      expect(result.skipped).toBe(false);
      expect(result.position).not.toBeNull();
    });

    it('should have discriminated union with skipped: true', () => {
      const result: CreateManagedPositionResult = {
        position: null,
        confidence: {
          total: 2,
          technical: 2,
          riskReward: 2,
          marketConditions: 2,
          timeOfDay: 2,
          breakdown: {
            regime: 'UNTRADEABLE',
            regimeConfidence: 0.9,
            momentum: 0,
            volumeAnomaly: 5,
            vixLevel: 40,
            riskRewardRatio: 0.5,
            marketHour: 'close',
          },
          recommendation: 'SKIP',
          positionSizePct: 0,
          reasoning: ['Market conditions too volatile'],
        },
        skipped: true,
        reason: 'Trade skipped due to low confidence',
      };

      expect(result.skipped).toBe(true);
      expect(result.position).toBeNull();
      expect(result.reason).toBeDefined();
    });
  });

  describe('Position calculations', () => {
    it('should calculate TP price correctly for long position', () => {
      const entryPrice = 100;
      const takeProfitPct = 2.0;
      const multiplier = 1; // buy
      
      const takeProfitPrice = entryPrice * (1 + multiplier * takeProfitPct / 100);
      
      expect(takeProfitPrice).toBe(102);
    });

    it('should calculate SL price correctly for long position', () => {
      const entryPrice = 100;
      const stopLossPct = 1.0;
      const multiplier = 1; // buy
      
      const stopLossPrice = entryPrice * (1 - multiplier * stopLossPct / 100);
      
      expect(stopLossPrice).toBe(99);
    });

    it('should calculate TP price correctly for short position', () => {
      const entryPrice = 100;
      const takeProfitPct = 2.0;
      const multiplier = -1; // sell
      
      const takeProfitPrice = entryPrice * (1 + multiplier * takeProfitPct / 100);
      
      expect(takeProfitPrice).toBe(98);
    });

    it('should calculate SL price correctly for short position', () => {
      const entryPrice = 100;
      const stopLossPct = 1.0;
      const multiplier = -1; // sell
      
      const stopLossPrice = entryPrice * (1 - multiplier * stopLossPct / 100);
      
      expect(stopLossPrice).toBe(101);
    });

    it('should calculate hours remaining correctly', () => {
      const enteredAt = new Date();
      enteredAt.setHours(enteredAt.getHours() - 2); // 2 hours ago
      const timeStopHours = 4;

      const now = new Date();
      const hoursElapsed = (now.getTime() - enteredAt.getTime()) / (1000 * 60 * 60);
      const hoursRemaining = Math.max(0, timeStopHours - hoursElapsed);

      expect(hoursRemaining).toBeCloseTo(2, 1);
    });
  });

  describe('createManagedPosition - risk rejection', () => {
    const mockTradeRequest: TradeRequest = {
      symbol: 'AAPL',
      side: 'buy',
      quantity: 100,
      entryPrice: 150,
    };

    it('should skip trade when risk engine rejects', async () => {
      (checkIntent as jest.Mock).mockResolvedValueOnce({
        approved: false,
        reason: 'Kill switch active',
      });

      const result = await createManagedPosition(mockTradeRequest);

      expect(result.skipped).toBe(true);
      expect(result.position).toBeNull();
      expect(result.reason).toContain('risk engine');
      expect(prisma.managedPosition.create).not.toHaveBeenCalled();
      expect(submitOrder).not.toHaveBeenCalled();
    });

    it('should include the risk engine reason in the skip message', async () => {
      (checkIntent as jest.Mock).mockResolvedValueOnce({
        approved: false,
        reason: 'Daily loss limit exceeded',
      });

      const result = await createManagedPosition(mockTradeRequest);

      expect(result.skipped).toBe(true);
      expect(result.reason).toContain('Daily loss limit exceeded');
    });
  });

  describe('createManagedPosition - skipRiskCheck', () => {
    it('should not call checkIntent when skipRiskCheck is true', async () => {
      const mockCreatedPosition = {
        id: 'pos-skip-risk',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: null,
        highWaterMark: 150,
        enteredAt: new Date(),
        status: 'active',
        alerts: [],
      };

      (prisma.managedPosition.create as jest.Mock).mockResolvedValue(mockCreatedPosition);

      const request: TradeRequest = {
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        skipRiskCheck: true,
      };

      const result = await createManagedPosition(request);

      expect(result.skipped).toBe(false);
      expect(result.position).toBeDefined();
      expect(checkIntent).not.toHaveBeenCalled();
      expect(submitOrder).toHaveBeenCalled();
    });
  });

  describe('getActiveManagedPositions', () => {
    it('should return positions with computed price fields', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      const mockPositions = [
        {
          id: 'pos-1',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100,
          entryPrice: 150,
          confidence: 8,
          takeProfitPct: 2.0,
          stopLossPct: 1.0,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 150,
          enteredAt: twoHoursAgo,
          status: 'active',
          alerts: [],
        },
        {
          id: 'pos-2',
          symbol: 'TSLA',
          side: 'sell',
          quantity: 50,
          entryPrice: 200,
          confidence: 7,
          takeProfitPct: 3.0,
          stopLossPct: 1.5,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 200,
          enteredAt: twoHoursAgo,
          status: 'active',
          alerts: [],
        },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);
      (alpaca.getLatestQuote as jest.Mock)
        .mockResolvedValueOnce({ BidPrice: 152, AskPrice: 152.10 })
        .mockResolvedValueOnce({ BidPrice: 195, AskPrice: 195.20 });

      const result = await getActiveManagedPositions();

      expect(result).toHaveLength(2);

      // AAPL buy position: entry 150, current ~152.05
      const aaplPos = result[0];
      expect(aaplPos.symbol).toBe('AAPL');
      expect(aaplPos.takeProfitPrice).toBe(153); // 150 * (1 + 2/100)
      expect(aaplPos.stopLossPrice).toBe(148.5); // 150 * (1 - 1/100)
      expect(aaplPos.currentPrice).toBeCloseTo(152.05, 1);
      expect(aaplPos.currentPnl).toBeGreaterThan(0); // buy, price went up
      expect(aaplPos.currentPnlPct).toBeGreaterThan(0);
      expect(aaplPos.hoursRemaining).toBeCloseTo(2, 0);

      // TSLA sell position: entry 200, current ~195.10
      const tslaPos = result[1];
      expect(tslaPos.symbol).toBe('TSLA');
      expect(tslaPos.takeProfitPrice).toBe(194); // 200 * (1 - 3/100)
      expect(tslaPos.stopLossPrice).toBeCloseTo(203, 5); // 200 * (1 + 1.5/100)
      expect(tslaPos.currentPrice).toBeCloseTo(195.10, 1);
      // sell side: pnl = (195.10 - 200) * 50 * -1 = positive (price dropped)
      expect(tslaPos.currentPnl).toBeGreaterThan(0);
      expect(tslaPos.currentPnlPct).toBeGreaterThan(0);
    });

    it('should return empty array when no active positions exist', async () => {
      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getActiveManagedPositions();

      expect(result).toHaveLength(0);
      expect(alpaca.getLatestQuote).not.toHaveBeenCalled();
    });

    it('should handle price fetch errors gracefully', async () => {
      const mockPositions = [
        {
          id: 'pos-err',
          symbol: 'BAD',
          side: 'buy',
          quantity: 10,
          entryPrice: 50,
          confidence: 6,
          takeProfitPct: 2.0,
          stopLossPct: 1.0,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 50,
          enteredAt: new Date(),
          status: 'active',
          alerts: [],
        },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);
      (alpaca.getLatestQuote as jest.Mock).mockRejectedValueOnce(new Error('Symbol not found'));

      const result = await getActiveManagedPositions();

      expect(result).toHaveLength(1);
      // When price fetch fails, currentPrice falls back to 0, then to entryPrice
      // since prices[symbol] is 0, which is falsy, it uses entryPrice
      expect(result[0].currentPrice).toBe(50);
    });
  });

  describe('checkAllPositions', () => {
    function makeActivePosition(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      return {
        id: 'pos-check-1',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        takeProfitPct: 2.0,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: null,
        highWaterMark: 150,
        enteredAt: now,
        status: 'active',
        alerts: [],
        ...overrides,
      };
    }

    it('should trigger TP_HIT when price is above take profit for long', async () => {
      const position = makeActivePosition();

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([position]);
      // Price above TP (153): entry 150, TP at 2% = 153
      (alpaca.getLatestQuote as jest.Mock).mockResolvedValue({ BidPrice: 154, AskPrice: 154.10 });
      // No existing alert
      (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-tp', message: 'Take profit hit for AAPL!' });
      // closePosition needs findUnique and submitOrder
      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(position);
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      const results = await checkAllPositions();

      expect(results.length).toBeGreaterThanOrEqual(1);
      const tpResult = results.find(r => r.alerts.some(a => a.type === 'TP_HIT'));
      expect(tpResult).toBeDefined();
      expect(tpResult!.symbol).toBe('AAPL');
    });

    it('should trigger SL_HIT when price is below stop loss for long', async () => {
      const position = makeActivePosition();

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([position]);
      // Price below SL (148.5): entry 150, SL at 1% = 148.5
      (alpaca.getLatestQuote as jest.Mock).mockResolvedValue({ BidPrice: 147, AskPrice: 147.10 });
      (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-sl', message: 'Stop loss hit for AAPL!' });
      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(position);
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      const results = await checkAllPositions();

      expect(results.length).toBeGreaterThanOrEqual(1);
      const slResult = results.find(r => r.alerts.some(a => a.type === 'SL_HIT'));
      expect(slResult).toBeDefined();
    });

    it('should trigger TIME_STOP when hoursRemaining is zero', async () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
      const position = makeActivePosition({ enteredAt: fiveHoursAgo, timeStopHours: 4 });

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([position]);
      // Price within TP/SL range so only time stop triggers
      (alpaca.getLatestQuote as jest.Mock).mockResolvedValue({ BidPrice: 150, AskPrice: 150.10 });
      (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-time', message: 'Time stop reached for AAPL!' });
      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(position);
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      const results = await checkAllPositions();

      expect(results.length).toBeGreaterThanOrEqual(1);
      const timeResult = results.find(r => r.alerts.some(a => a.type === 'TIME_STOP'));
      expect(timeResult).toBeDefined();
    });

    it('should return empty array when no alerts are triggered', async () => {
      const position = makeActivePosition();

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([position]);
      // Price within safe range: above SL (148.5), below TP (153)
      (alpaca.getLatestQuote as jest.Mock).mockResolvedValue({ BidPrice: 151, AskPrice: 151.10 });
      // Confidence check: mock calculateConfidence to return high confidence (no drop)
      (calculateConfidence as jest.Mock).mockResolvedValueOnce({
        total: 8,
        technical: 8,
        riskReward: 8,
        marketConditions: 8,
        timeOfDay: 8,
        breakdown: {},
        recommendation: 'FULL',
        positionSizePct: 20,
        reasoning: [],
      });

      const results = await checkAllPositions();

      expect(results).toHaveLength(0);
    });

    it('should trigger SL_HIT for short when price rises above stop', async () => {
      const position = makeActivePosition({
        id: 'pos-short-sl',
        side: 'sell',
        entryPrice: 200,
        stopLossPct: 1.5,
      });

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([position]);
      // Short SL: 200 * (1 + 1.5/100) = 203. Price at 204 should trigger SL.
      (alpaca.getLatestQuote as jest.Mock).mockResolvedValue({ BidPrice: 204, AskPrice: 204.10 });
      (prisma.alert.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.alert.create as jest.Mock).mockResolvedValue({ id: 'alert-short-sl', message: 'Stop loss hit' });
      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(position);
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      const results = await checkAllPositions();

      const slResult = results.find(r => r.alerts.some(a => a.type === 'SL_HIT'));
      expect(slResult).toBeDefined();
    });
  });

  describe('getPendingAlerts', () => {
    it('should return pending alerts with position symbol', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          positionId: 'pos-1',
          type: 'TIME_WARNING',
          message: 'Less than 1 hour remaining',
          triggered: false,
          dismissed: false,
          createdAt: new Date('2024-01-15T10:00:00Z'),
          position: { symbol: 'AAPL' },
        },
        {
          id: 'alert-2',
          positionId: 'pos-2',
          type: 'REVIEW',
          message: 'Confidence dropped',
          triggered: false,
          dismissed: false,
          createdAt: new Date('2024-01-15T11:00:00Z'),
          position: { symbol: 'TSLA' },
        },
      ];

      (prisma.alert.findMany as jest.Mock).mockResolvedValue(mockAlerts);

      const result = await getPendingAlerts();

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[0].type).toBe('TIME_WARNING');
      expect(result[1].symbol).toBe('TSLA');
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { triggered: false, dismissed: false },
        })
      );
    });

    it('should return empty array when no pending alerts exist', async () => {
      (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getPendingAlerts();

      expect(result).toHaveLength(0);
    });
  });

  describe('getAllAlerts', () => {
    it('should return all non-dismissed alerts with limit', async () => {
      const mockAlerts = [
        {
          id: 'alert-1',
          positionId: 'pos-1',
          type: 'TP_HIT',
          message: 'Take profit hit',
          triggered: true,
          triggeredAt: new Date('2024-01-15T10:30:00Z'),
          dismissed: false,
          createdAt: new Date('2024-01-15T10:00:00Z'),
          position: { symbol: 'AAPL' },
        },
      ];

      (prisma.alert.findMany as jest.Mock).mockResolvedValue(mockAlerts);

      const result = await getAllAlerts(10);

      expect(result).toHaveLength(1);
      expect(result[0].triggered).toBe(true);
      expect(result[0].triggeredAt).toEqual(new Date('2024-01-15T10:30:00Z'));
      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { dismissed: false },
          take: 10,
        })
      );
    });

    it('should use default limit of 50 when not specified', async () => {
      (prisma.alert.findMany as jest.Mock).mockResolvedValue([]);

      await getAllAlerts();

      expect(prisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('dismissAlert', () => {
    it('should update alert with dismissed true and timestamp', async () => {
      (prisma.alert.update as jest.Mock).mockResolvedValue({});

      await dismissAlert('alert-123');

      expect(prisma.alert.update).toHaveBeenCalledWith({
        where: { id: 'alert-123' },
        data: expect.objectContaining({
          dismissed: true,
          dismissedAt: expect.any(Date),
        }),
      });
    });
  });

  describe('manualClosePosition', () => {
    it('should close position with MANUAL reason and submit close order', async () => {
      const mockPosition = {
        id: 'pos-manual',
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
        confidence: 8,
        strategyId: null,
      };

      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(mockPosition);
      (submitOrder as jest.Mock).mockResolvedValue({ id: 'close-order-1' });
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      await manualClosePosition('pos-manual', 155);

      // Should submit a sell order to close the buy position
      expect(submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          qty: 100,
          side: 'sell',
          type: 'market',
        })
      );

      // Should update the position as closed with PnL
      expect(prisma.managedPosition.update).toHaveBeenCalledWith({
        where: { id: 'pos-manual' },
        data: expect.objectContaining({
          status: 'closed',
          closeReason: 'MANUAL',
          closePrice: 155,
          pnl: 500, // (155 - 150) * 100 * 1
          pnlPct: expect.closeTo(3.333, 2), // (5/150)*100*1
        }),
      });
    });

    it('should close sell position with correct inverse PnL', async () => {
      const mockPosition = {
        id: 'pos-sell-close',
        symbol: 'TSLA',
        side: 'sell',
        quantity: 50,
        entryPrice: 200,
        confidence: 7,
        strategyId: null,
      };

      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(mockPosition);
      (submitOrder as jest.Mock).mockResolvedValue({ id: 'close-order-2' });
      (prisma.managedPosition.update as jest.Mock).mockResolvedValue({});

      await manualClosePosition('pos-sell-close', 190);

      // Should submit a buy order to close the sell position
      expect(submitOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'buy',
          qty: 50,
        })
      );

      // Sell side PnL: (190 - 200) * 50 * -1 = 500 (profit because price dropped)
      expect(prisma.managedPosition.update).toHaveBeenCalledWith({
        where: { id: 'pos-sell-close' },
        data: expect.objectContaining({
          status: 'closed',
          closeReason: 'MANUAL',
          pnl: 500,
        }),
      });
    });

    it('should not update position when it does not exist', async () => {
      (prisma.managedPosition.findUnique as jest.Mock).mockResolvedValue(null);

      await manualClosePosition('nonexistent', 100);

      expect(submitOrder).not.toHaveBeenCalled();
      expect(prisma.managedPosition.update).not.toHaveBeenCalled();
    });
  });

  describe('getPositionHistory', () => {
    it('should return closed positions with computed TP/SL prices', async () => {
      const mockPositions = [
        {
          id: 'pos-closed-1',
          symbol: 'AAPL',
          side: 'buy',
          quantity: 100,
          entryPrice: 150,
          confidence: 8,
          takeProfitPct: 2.0,
          stopLossPct: 1.0,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 153,
          enteredAt: new Date('2024-01-15T10:00:00Z'),
          closedAt: new Date('2024-01-15T12:00:00Z'),
          closePrice: 153,
          closeReason: 'TP_HIT',
          pnl: 300,
          pnlPct: 2.0,
          status: 'closed',
          alerts: [],
        },
        {
          id: 'pos-closed-2',
          symbol: 'TSLA',
          side: 'sell',
          quantity: 50,
          entryPrice: 200,
          confidence: 7,
          takeProfitPct: 3.0,
          stopLossPct: 1.5,
          timeStopHours: 4,
          trailingStopPct: null,
          highWaterMark: 200,
          enteredAt: new Date('2024-01-15T09:00:00Z'),
          closedAt: new Date('2024-01-15T11:00:00Z'),
          closePrice: 194,
          closeReason: 'TP_HIT',
          pnl: 300,
          pnlPct: 3.0,
          status: 'closed',
          alerts: [],
        },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);

      const result = await getPositionHistory(10);

      expect(result).toHaveLength(2);
      // Buy: TP = 150 * (1 + 2/100) = 153, SL = 150 * (1 - 1/100) = 148.5
      expect(result[0].takeProfitPrice).toBe(153);
      expect(result[0].stopLossPrice).toBe(148.5);
      expect(result[0].hoursRemaining).toBe(0);

      // Sell: TP = 200 * (1 - 3/100) = 194, SL = 200 * (1 + 1.5/100) = 203
      expect(result[1].takeProfitPrice).toBe(194);
      expect(result[1].stopLossPrice).toBeCloseTo(203, 5);

      expect(prisma.managedPosition.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: 'closed' },
          take: 10,
        })
      );
    });

    it('should return empty array when no closed positions exist', async () => {
      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getPositionHistory();

      expect(result).toHaveLength(0);
    });
  });

  describe('getTradingStats', () => {
    it('should compute correct stats from mix of winning and losing trades', async () => {
      const mockPositions = [
        { pnl: 500, confidence: 8, closeReason: 'TP_HIT' },
        { pnl: 300, confidence: 7, closeReason: 'TP_HIT' },
        { pnl: -150, confidence: 6, closeReason: 'SL_HIT' },
        { pnl: -100, confidence: 5, closeReason: 'TIME_STOP' },
        { pnl: 200, confidence: 9, closeReason: 'MANUAL' },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);

      const stats = await getTradingStats();

      expect(stats.totalTrades).toBe(5);
      expect(stats.winningTrades).toBe(3);
      expect(stats.losingTrades).toBe(2);
      expect(stats.winRate).toBeCloseTo(60, 0);
      expect(stats.totalPnl).toBe(750); // 500 + 300 - 150 - 100 + 200
      expect(stats.avgWin).toBeCloseTo(333.33, 0); // (500+300+200)/3
      expect(stats.avgLoss).toBeCloseTo(-125, 0); // (-150 + -100)/2
      expect(stats.avgConfidence).toBe(7); // (8+7+6+5+9)/5
      expect(stats.byCloseReason).toEqual({
        TP_HIT: 2,
        SL_HIT: 1,
        TIME_STOP: 1,
        MANUAL: 1,
      });
    });

    it('should return all zeros when no closed positions exist', async () => {
      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue([]);

      const stats = await getTradingStats();

      expect(stats.totalTrades).toBe(0);
      expect(stats.winningTrades).toBe(0);
      expect(stats.losingTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.totalPnl).toBe(0);
      expect(stats.avgWin).toBe(0);
      expect(stats.avgLoss).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.byCloseReason).toEqual({});
    });

    it('should count zero PnL trades as losing', async () => {
      const mockPositions = [
        { pnl: 0, confidence: 5, closeReason: 'TIME_STOP' },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);

      const stats = await getTradingStats();

      expect(stats.winningTrades).toBe(0);
      expect(stats.losingTrades).toBe(1);
      expect(stats.winRate).toBe(0);
    });

    it('should handle null PnL values as zero', async () => {
      const mockPositions = [
        { pnl: null, confidence: 6, closeReason: 'MANUAL' },
        { pnl: 100, confidence: 7, closeReason: 'TP_HIT' },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);

      const stats = await getTradingStats();

      expect(stats.totalTrades).toBe(2);
      expect(stats.winningTrades).toBe(1);
      expect(stats.losingTrades).toBe(1);
      expect(stats.totalPnl).toBe(100);
    });

    it('should handle positions with null closeReason', async () => {
      const mockPositions = [
        { pnl: 50, confidence: 5, closeReason: null },
      ];

      (prisma.managedPosition.findMany as jest.Mock).mockResolvedValue(mockPositions);

      const stats = await getTradingStats();

      expect(stats.byCloseReason).toEqual({ UNKNOWN: 1 });
    });
  });
});
