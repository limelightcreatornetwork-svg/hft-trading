/**
 * Tests for Strategy Factory
 */

import {
  createStrategy,
  getAvailableStrategyTypes,
  registerStrategy,
} from '../../../src/lib/strategies/strategy-factory';
import { MomentumStrategy } from '../../../src/lib/strategies/momentum-strategy';
import { MeanReversionStrategy } from '../../../src/lib/strategies/mean-reversion-strategy';
import { BreakoutStrategy } from '../../../src/lib/strategies/breakout-strategy';
import type { TradingStrategy, StrategyContext, StrategySignal } from '../../../src/lib/strategies/types';

describe('Strategy Factory', () => {
  describe('createStrategy', () => {
    it('should create a momentum strategy', () => {
      const strategy = createStrategy('momentum');
      expect(strategy).toBeInstanceOf(MomentumStrategy);
      expect(strategy.type).toBe('momentum');
    });

    it('should create a mean reversion strategy', () => {
      const strategy = createStrategy('meanReversion');
      expect(strategy).toBeInstanceOf(MeanReversionStrategy);
      expect(strategy.type).toBe('meanReversion');
    });

    it('should create a breakout strategy', () => {
      const strategy = createStrategy('breakout');
      expect(strategy).toBeInstanceOf(BreakoutStrategy);
      expect(strategy.type).toBe('breakout');
    });

    it('should throw for unknown strategy type', () => {
      expect(() => createStrategy('unknown')).toThrow('Unknown strategy type: unknown');
    });

    it('should return new instances each time', () => {
      const s1 = createStrategy('momentum');
      const s2 = createStrategy('momentum');
      expect(s1).not.toBe(s2);
    });
  });

  describe('getAvailableStrategyTypes', () => {
    it('should return all built-in types', () => {
      const types = getAvailableStrategyTypes();
      expect(types).toContain('momentum');
      expect(types).toContain('meanReversion');
      expect(types).toContain('breakout');
    });

    it('should have at least 3 types', () => {
      expect(getAvailableStrategyTypes().length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('registerStrategy', () => {
    it('should register and create a custom strategy', () => {
      const customStrategy: TradingStrategy = {
        name: 'Custom',
        type: 'custom',
        description: 'A custom strategy',
        supportedRegimes: ['TREND'],
        evaluate: (_ctx: StrategyContext): StrategySignal => ({
          action: 'hold',
          confidence: 0,
          reason: 'Custom hold',
        }),
      };

      registerStrategy('custom', () => customStrategy);
      const strategy = createStrategy('custom');
      expect(strategy.name).toBe('Custom');
      expect(strategy.type).toBe('custom');
    });

    it('should override existing strategy type', () => {
      const overrideStrategy: TradingStrategy = {
        name: 'Override Momentum',
        type: 'momentum',
        description: 'Override',
        supportedRegimes: ['TREND'],
        evaluate: (_ctx: StrategyContext): StrategySignal => ({
          action: 'hold',
          confidence: 0,
          reason: 'Override',
        }),
      };

      registerStrategy('momentum', () => overrideStrategy);
      const strategy = createStrategy('momentum');
      expect(strategy.name).toBe('Override Momentum');

      // Restore original
      registerStrategy('momentum', () => new MomentumStrategy());
    });
  });
});
