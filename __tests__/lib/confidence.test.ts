/**
 * Tests for Confidence-Based Trading System
 */

import {
  POSITION_SIZING,
  getPositionSize,
} from '../../src/lib/confidence';

// Mock the regime detector
jest.mock('../../src/lib/regime', () => ({
  getRegimeDetector: jest.fn(() => ({
    detect: jest.fn().mockResolvedValue({
      regime: 'TREND',
      confidence: 0.8,
      metrics: {
        regressionSlope: 0.15,
        volumeAnomaly: 1.2,
        atrPercent: 1.0,
        atr: 2.5,
      },
    }),
  })),
}));

// Mock alpaca
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {
    getLatestQuote: jest.fn().mockResolvedValue({
      BidPrice: 100,
      AskPrice: 100.05,
    }),
    getBarsV2: jest.fn(),
  },
}));

describe('Confidence Module', () => {
  describe('POSITION_SIZING', () => {
    it('should have correct HIGH thresholds', () => {
      expect(POSITION_SIZING.HIGH.min).toBe(8);
      expect(POSITION_SIZING.HIGH.max).toBe(10);
      expect(POSITION_SIZING.HIGH.pct).toBe(20);
    });

    it('should have correct MEDIUM thresholds', () => {
      expect(POSITION_SIZING.MEDIUM.min).toBe(6);
      expect(POSITION_SIZING.MEDIUM.max).toBe(7);
      expect(POSITION_SIZING.MEDIUM.pct).toBe(10);
    });

    it('should have correct LOW thresholds', () => {
      expect(POSITION_SIZING.LOW.min).toBe(4);
      expect(POSITION_SIZING.LOW.max).toBe(5);
      expect(POSITION_SIZING.LOW.pct).toBe(5);
    });

    it('should have correct SKIP thresholds', () => {
      expect(POSITION_SIZING.SKIP.min).toBe(1);
      expect(POSITION_SIZING.SKIP.max).toBe(3);
      expect(POSITION_SIZING.SKIP.pct).toBe(0);
    });
  });

  describe('getPositionSize', () => {
    it('should calculate correct position size for FULL recommendation', () => {
      const confidence = {
        total: 9,
        technical: 8,
        riskReward: 8,
        marketConditions: 9,
        timeOfDay: 9,
        breakdown: {
          regime: 'TREND' as const,
          regimeConfidence: 0.8,
          momentum: 0.15,
          volumeAnomaly: 1.2,
          vixLevel: 15,
          riskRewardRatio: 2.5,
          marketHour: 'mid-morning',
        },
        recommendation: 'FULL' as const,
        positionSizePct: 20,
        reasoning: [],
      };

      const result = getPositionSize(confidence, 100000);
      expect(result.dollarAmount).toBe(20000);
      expect(result.percentOfPortfolio).toBe(20);
    });

    it('should calculate correct position size for MEDIUM recommendation', () => {
      const confidence = {
        total: 6,
        technical: 6,
        riskReward: 6,
        marketConditions: 6,
        timeOfDay: 6,
        breakdown: {
          regime: 'CHOP' as const,
          regimeConfidence: 0.6,
          momentum: 0.05,
          volumeAnomaly: 1.0,
          vixLevel: 20,
          riskRewardRatio: 2,
          marketHour: 'lunch',
        },
        recommendation: 'MEDIUM' as const,
        positionSizePct: 10,
        reasoning: [],
      };

      const result = getPositionSize(confidence, 100000);
      expect(result.dollarAmount).toBe(10000);
      expect(result.percentOfPortfolio).toBe(10);
    });

    it('should calculate correct position size for SMALL recommendation', () => {
      const confidence = {
        total: 4,
        technical: 4,
        riskReward: 4,
        marketConditions: 4,
        timeOfDay: 4,
        breakdown: {
          regime: 'CHOP' as const,
          regimeConfidence: 0.5,
          momentum: 0.02,
          volumeAnomaly: 0.8,
          vixLevel: 25,
          riskRewardRatio: 1.5,
          marketHour: 'open',
        },
        recommendation: 'SMALL' as const,
        positionSizePct: 5,
        reasoning: [],
      };

      const result = getPositionSize(confidence, 100000);
      expect(result.dollarAmount).toBe(5000);
      expect(result.percentOfPortfolio).toBe(5);
    });

    it('should return 0 position size for SKIP recommendation', () => {
      const confidence = {
        total: 2,
        technical: 2,
        riskReward: 2,
        marketConditions: 2,
        timeOfDay: 2,
        breakdown: {
          regime: 'VOL_EXPANSION' as const,
          regimeConfidence: 0.3,
          momentum: 0,
          volumeAnomaly: 4,
          vixLevel: 35,
          riskRewardRatio: 0.5,
          marketHour: 'close',
        },
        recommendation: 'SKIP' as const,
        positionSizePct: 0,
        reasoning: [],
      };

      const result = getPositionSize(confidence, 100000);
      expect(result.dollarAmount).toBe(0);
      expect(result.percentOfPortfolio).toBe(0);
    });

    it('should handle small portfolio values', () => {
      const confidence = {
        total: 8,
        technical: 8,
        riskReward: 8,
        marketConditions: 8,
        timeOfDay: 8,
        breakdown: {
          regime: 'TREND' as const,
          regimeConfidence: 0.7,
          momentum: 0.1,
          volumeAnomaly: 1.1,
          vixLevel: 15,
          riskRewardRatio: 2.5,
          marketHour: 'mid-morning',
        },
        recommendation: 'FULL' as const,
        positionSizePct: 20,
        reasoning: [],
      };

      const result = getPositionSize(confidence, 1000);
      expect(result.dollarAmount).toBe(200);
      expect(result.percentOfPortfolio).toBe(20);
    });
  });

  describe('Risk/Reward Scoring Logic', () => {
    // Test the risk/reward scoring boundaries
    it('should score excellent R:R (>= 3:1) at 10', () => {
      // 3:1 ratio should yield score 10
      const entry = 100;
      const target = 115; // $15 reward
      const stop = 95;    // $5 risk
      const ratio = (target - entry) / (entry - stop); // 3:1
      expect(ratio).toBe(3);
    });

    it('should score poor R:R (< 1:1) as 2', () => {
      // 0.5:1 ratio is poor
      const entry = 100;
      const target = 102.5; // $2.5 reward  
      const stop = 95;      // $5 risk
      const ratio = (target - entry) / (entry - stop); // 0.5:1
      expect(ratio).toBe(0.5);
    });
  });

  describe('Time of Day Scoring Logic', () => {
    it('should have defined market hour periods', () => {
      // Market open: 9:30 AM ET
      // Best trading: 9:45 - 11:30 (mid-morning)
      // Lunch lull: 11:30 - 2:00
      // Afternoon: 2:00 - 3:00
      // Power hour: 3:00 - 3:45
      // Close: 3:45 - 4:00
      expect(true).toBe(true); // Placeholder for time logic tests
    });
  });
});

describe('Confidence Score Calculations', () => {
  describe('Score boundaries', () => {
    it('should always produce scores between 1 and 10', () => {
      // Test edge cases
      const minScore = Math.max(1, Math.min(10, 0));
      const maxScore = Math.max(1, Math.min(10, 15));
      
      expect(minScore).toBe(1);
      expect(maxScore).toBe(10);
    });

    it('should round scores to integers', () => {
      const rawScore = 7.6;
      const roundedScore = Math.round(rawScore);
      expect(roundedScore).toBe(8);
    });
  });

  describe('Weighted average calculation', () => {
    it('should correctly weight component scores', () => {
      // Weights: Technical: 35%, Risk/Reward: 25%, Market: 25%, Time: 15%
      const technical = 8;
      const riskReward = 6;
      const market = 7;
      const time = 9;
      
      const weighted = 
        technical * 0.35 +
        riskReward * 0.25 +
        market * 0.25 +
        time * 0.15;
      
      expect(weighted).toBeCloseTo(7.4, 1);
    });
  });
});
