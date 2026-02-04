/**
 * Tests for Strategy Validation
 */

import {
  validateStrategyInput,
  validateStrategyUpdate,
} from '../../src/lib/strategy-validation';

const validInput = {
  name: 'Momentum Alpha',
  type: 'momentum',
  symbols: ['AAPL', 'MSFT'],
  entryConditions: { indicators: ['RSI'], thresholds: [30] },
  exitConditions: { stopLoss: 2, takeProfit: 4 },
  positionSizing: { method: 'fixed', value: 500 },
  riskParams: { maxLoss: 0.02, maxPositions: 5 },
};

describe('Strategy Validation', () => {
  describe('validateStrategyInput', () => {
    it('should accept a valid strategy input', () => {
      const result = validateStrategyInput(validInput);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value.name).toBe('Momentum Alpha');
        expect(result.value.type).toBe('momentum');
        expect(result.value.symbols).toEqual(['AAPL', 'MSFT']);
      }
    });

    it('should reject null body', () => {
      const result = validateStrategyInput(null);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('object');
    });

    it('should reject non-object body', () => {
      const result = validateStrategyInput('invalid');
      expect(result.valid).toBe(false);
    });

    it('should reject missing name', () => {
      const { name, ...rest } = validInput;
      const result = validateStrategyInput(rest);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('name');
    });

    it('should reject empty name', () => {
      const result = validateStrategyInput({ ...validInput, name: '' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('name');
    });

    it('should reject name over 100 chars', () => {
      const result = validateStrategyInput({ ...validInput, name: 'x'.repeat(101) });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('name');
    });

    it('should reject invalid type', () => {
      const result = validateStrategyInput({ ...validInput, type: 'invalid' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('type');
    });

    it('should accept all valid types', () => {
      for (const type of ['manual', 'momentum', 'meanReversion', 'breakout']) {
        const result = validateStrategyInput({ ...validInput, type });
        expect(result.valid).toBe(true);
      }
    });

    it('should reject empty symbols array', () => {
      const result = validateStrategyInput({ ...validInput, symbols: [] });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('symbols');
    });

    it('should reject non-array symbols', () => {
      const result = validateStrategyInput({ ...validInput, symbols: 'AAPL' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('symbols');
    });

    it('should reject invalid symbols in array', () => {
      const result = validateStrategyInput({ ...validInput, symbols: ['AAPL', ''] });
      expect(result.valid).toBe(false);
    });

    it('should uppercase symbols', () => {
      const result = validateStrategyInput({ ...validInput, symbols: ['aapl', 'msft'] });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value.symbols).toEqual(['AAPL', 'MSFT']);
      }
    });

    it('should reject non-object entryConditions', () => {
      const result = validateStrategyInput({ ...validInput, entryConditions: 'invalid' });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('entryConditions');
    });

    it('should reject array as entryConditions', () => {
      const result = validateStrategyInput({ ...validInput, entryConditions: [1, 2] });
      expect(result.valid).toBe(false);
    });

    it('should reject non-object exitConditions', () => {
      const result = validateStrategyInput({ ...validInput, exitConditions: null });
      expect(result.valid).toBe(false);
    });

    it('should reject non-object positionSizing', () => {
      const result = validateStrategyInput({ ...validInput, positionSizing: 42 });
      expect(result.valid).toBe(false);
    });

    it('should reject non-object riskParams', () => {
      const result = validateStrategyInput({ ...validInput, riskParams: true });
      expect(result.valid).toBe(false);
    });

    it('should accept optional description', () => {
      const result = validateStrategyInput({ ...validInput, description: 'A test strategy' });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.description).toBe('A test strategy');
    });

    it('should reject description over 500 chars', () => {
      const result = validateStrategyInput({ ...validInput, description: 'x'.repeat(501) });
      expect(result.valid).toBe(false);
    });

    it('should accept optional allocatedCapital', () => {
      const result = validateStrategyInput({ ...validInput, allocatedCapital: 50000 });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.allocatedCapital).toBe(50000);
    });

    it('should reject negative allocatedCapital', () => {
      const result = validateStrategyInput({ ...validInput, allocatedCapital: -100 });
      expect(result.valid).toBe(false);
    });

    it('should accept optional maxPositionSize', () => {
      const result = validateStrategyInput({ ...validInput, maxPositionSize: 2000 });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.maxPositionSize).toBe(2000);
    });

    it('should accept optional riskPerTrade', () => {
      const result = validateStrategyInput({ ...validInput, riskPerTrade: 0.05 });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.riskPerTrade).toBe(0.05);
    });

    it('should reject riskPerTrade over 1', () => {
      const result = validateStrategyInput({ ...validInput, riskPerTrade: 1.5 });
      expect(result.valid).toBe(false);
    });

    it('should reject riskPerTrade below 0.001', () => {
      const result = validateStrategyInput({ ...validInput, riskPerTrade: 0.0001 });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateStrategyUpdate', () => {
    it('should accept a partial update', () => {
      const result = validateStrategyUpdate({ name: 'Updated Name' });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.name).toBe('Updated Name');
    });

    it('should reject null body', () => {
      const result = validateStrategyUpdate(null);
      expect(result.valid).toBe(false);
    });

    it('should reject empty update (no fields)', () => {
      const result = validateStrategyUpdate({});
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('At least one field');
    });

    it('should validate name on update', () => {
      const result = validateStrategyUpdate({ name: '' });
      expect(result.valid).toBe(false);
    });

    it('should validate type on update', () => {
      const result = validateStrategyUpdate({ type: 'invalid' });
      expect(result.valid).toBe(false);
    });

    it('should validate symbols on update', () => {
      const result = validateStrategyUpdate({ symbols: [] });
      expect(result.valid).toBe(false);
    });

    it('should validate allocatedCapital on update', () => {
      const result = validateStrategyUpdate({ allocatedCapital: -1 });
      expect(result.valid).toBe(false);
    });

    it('should accept enabled boolean', () => {
      const result = validateStrategyUpdate({ enabled: true });
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value.enabled).toBe(true);
    });

    it('should reject non-boolean enabled', () => {
      const result = validateStrategyUpdate({ enabled: 'true' });
      expect(result.valid).toBe(false);
    });

    it('should accept multiple fields', () => {
      const result = validateStrategyUpdate({
        name: 'New Name',
        type: 'breakout',
        allocatedCapital: 25000,
        enabled: true,
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value.name).toBe('New Name');
        expect(result.value.type).toBe('breakout');
        expect(result.value.allocatedCapital).toBe(25000);
        expect(result.value.enabled).toBe(true);
      }
    });

    it('should validate riskPerTrade range on update', () => {
      const result = validateStrategyUpdate({ riskPerTrade: 2 });
      expect(result.valid).toBe(false);
    });

    it('should accept valid riskPerTrade on update', () => {
      const result = validateStrategyUpdate({ riskPerTrade: 0.05 });
      expect(result.valid).toBe(true);
    });

    it('should validate entryConditions on update', () => {
      const result = validateStrategyUpdate({ entryConditions: 'not-object' });
      expect(result.valid).toBe(false);
    });

    it('should accept valid entryConditions on update', () => {
      const result = validateStrategyUpdate({ entryConditions: { rsi: 30 } });
      expect(result.valid).toBe(true);
    });
  });
});
