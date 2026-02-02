/**
 * Tests for Validation Utilities
 */

import {
  validateString,
  validateNumber,
  validatePositiveNumber,
  validateEnum,
  validateSymbol,
  validateSide,
  validateOrderType,
  validateTradeRequest,
} from '../../src/lib/validation';

describe('Validation Utilities', () => {
  describe('validateString', () => {
    it('should accept valid string', () => {
      const result = validateString('hello', 'field');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('hello');
    });

    it('should reject non-string', () => {
      const result = validateString(123, 'field');
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('must be a string');
    });

    it('should enforce minLength', () => {
      const result = validateString('ab', 'field', { minLength: 3 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('at least 3');
    });

    it('should enforce maxLength', () => {
      const result = validateString('toolong', 'field', { maxLength: 5 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('at most 5');
    });

    it('should enforce pattern', () => {
      const result = validateString('abc123', 'field', { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('invalid format');
    });
  });

  describe('validateNumber', () => {
    it('should accept valid number', () => {
      const result = validateNumber(42, 'field');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe(42);
    });

    it('should reject non-number', () => {
      const result = validateNumber('42', 'field');
      expect(result.valid).toBe(false);
    });

    it('should reject NaN', () => {
      const result = validateNumber(NaN, 'field');
      expect(result.valid).toBe(false);
    });

    it('should enforce min', () => {
      const result = validateNumber(5, 'field', { min: 10 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('at least 10');
    });

    it('should enforce max', () => {
      const result = validateNumber(15, 'field', { max: 10 });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('at most 10');
    });

    it('should enforce integer', () => {
      const result = validateNumber(3.14, 'field', { integer: true });
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('integer');
    });
  });

  describe('validatePositiveNumber', () => {
    it('should accept positive number', () => {
      const result = validatePositiveNumber(10, 'field');
      expect(result.valid).toBe(true);
    });

    it('should reject zero by default', () => {
      const result = validatePositiveNumber(0, 'field');
      expect(result.valid).toBe(false);
    });

    it('should allow zero when specified', () => {
      const result = validatePositiveNumber(0, 'field', { allowZero: true });
      expect(result.valid).toBe(true);
    });

    it('should reject negative numbers', () => {
      const result = validatePositiveNumber(-5, 'field');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEnum', () => {
    it('should accept valid enum value', () => {
      const result = validateEnum('buy', 'side', ['buy', 'sell'] as const);
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('buy');
    });

    it('should reject invalid enum value', () => {
      const result = validateEnum('invalid', 'side', ['buy', 'sell'] as const);
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.error).toContain('buy, sell');
    });
  });

  describe('validateSymbol', () => {
    it('should accept valid symbol', () => {
      const result = validateSymbol('AAPL');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('AAPL');
    });

    it('should uppercase symbols', () => {
      const result = validateSymbol('aapl');
      expect(result.valid).toBe(true);
      if (result.valid) expect(result.value).toBe('AAPL');
    });

    it('should accept symbols with dots', () => {
      const result = validateSymbol('BRK.B');
      expect(result.valid).toBe(true);
    });

    it('should reject empty symbol', () => {
      const result = validateSymbol('');
      expect(result.valid).toBe(false);
    });

    it('should reject too long symbol', () => {
      const result = validateSymbol('VERYLONGSYMBOL');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSide', () => {
    it('should accept buy', () => {
      const result = validateSide('buy');
      expect(result.valid).toBe(true);
    });

    it('should accept sell', () => {
      const result = validateSide('sell');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid side', () => {
      const result = validateSide('short');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateOrderType', () => {
    it('should accept market', () => {
      const result = validateOrderType('market');
      expect(result.valid).toBe(true);
    });

    it('should accept limit', () => {
      const result = validateOrderType('limit');
      expect(result.valid).toBe(true);
    });

    it('should reject invalid type', () => {
      const result = validateOrderType('stop');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateTradeRequest', () => {
    it('should accept valid trade request', () => {
      const result = validateTradeRequest({
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 150.50,
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value.symbol).toBe('AAPL');
        expect(result.value.side).toBe('buy');
        expect(result.value.quantity).toBe(100);
        expect(result.value.entryPrice).toBe(150.50);
      }
    });

    it('should accept optional fields', () => {
      const result = validateTradeRequest({
        symbol: 'MSFT',
        side: 'sell',
        quantity: 50,
        entryPrice: 300,
        takeProfitPct: 2.5,
        stopLossPct: 1.0,
        timeStopHours: 4,
        trailingStopPct: 1.5,
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.value.takeProfitPct).toBe(2.5);
        expect(result.value.stopLossPct).toBe(1.0);
        expect(result.value.timeStopHours).toBe(4);
        expect(result.value.trailingStopPct).toBe(1.5);
      }
    });

    it('should reject missing symbol', () => {
      const result = validateTradeRequest({
        side: 'buy',
        quantity: 100,
        entryPrice: 150,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject invalid side', () => {
      const result = validateTradeRequest({
        symbol: 'AAPL',
        side: 'long',
        quantity: 100,
        entryPrice: 150,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject negative quantity', () => {
      const result = validateTradeRequest({
        symbol: 'AAPL',
        side: 'buy',
        quantity: -10,
        entryPrice: 150,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject zero entry price', () => {
      const result = validateTradeRequest({
        symbol: 'AAPL',
        side: 'buy',
        quantity: 100,
        entryPrice: 0,
      });
      expect(result.valid).toBe(false);
    });

    it('should reject null body', () => {
      const result = validateTradeRequest(null);
      expect(result.valid).toBe(false);
    });

    it('should reject non-object body', () => {
      const result = validateTradeRequest('invalid');
      expect(result.valid).toBe(false);
    });
  });
});
