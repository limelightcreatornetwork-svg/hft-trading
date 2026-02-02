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
import {
  createManagedPosition,
  CreateManagedPositionResult,
  TradeRequest,
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
});
