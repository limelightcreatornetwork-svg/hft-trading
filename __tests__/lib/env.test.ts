/**
 * Tests for Environment Variable Utilities
 */

import {
  getRequiredEnv,
  getOptionalEnv,
  getBooleanEnv,
  getNumericEnv,
  validateEnvironment,
} from '../../src/lib/env';

describe('Environment Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getRequiredEnv', () => {
    it('should return value when env var exists', () => {
      process.env.TEST_VAR = 'test_value';
      expect(getRequiredEnv('TEST_VAR')).toBe('test_value');
    });

    it('should throw error when env var is missing', () => {
      delete process.env.MISSING_VAR;
      expect(() => getRequiredEnv('MISSING_VAR')).toThrow(
        'Missing required environment variable: MISSING_VAR'
      );
    });

    it('should throw error when env var is empty string', () => {
      process.env.EMPTY_VAR = '';
      expect(() => getRequiredEnv('EMPTY_VAR')).toThrow(
        'Missing required environment variable: EMPTY_VAR'
      );
    });
  });

  describe('getOptionalEnv', () => {
    it('should return value when env var exists', () => {
      process.env.OPT_VAR = 'optional_value';
      expect(getOptionalEnv('OPT_VAR', 'default')).toBe('optional_value');
    });

    it('should return default when env var is missing', () => {
      delete process.env.OPT_VAR;
      expect(getOptionalEnv('OPT_VAR', 'default_val')).toBe('default_val');
    });

    it('should return default when env var is empty', () => {
      process.env.OPT_VAR = '';
      expect(getOptionalEnv('OPT_VAR', 'fallback')).toBe('fallback');
    });
  });

  describe('getBooleanEnv', () => {
    it('should return true for "true"', () => {
      process.env.BOOL_VAR = 'true';
      expect(getBooleanEnv('BOOL_VAR')).toBe(true);
    });

    it('should return true for "TRUE" (case insensitive)', () => {
      process.env.BOOL_VAR = 'TRUE';
      expect(getBooleanEnv('BOOL_VAR')).toBe(true);
    });

    it('should return true for "1"', () => {
      process.env.BOOL_VAR = '1';
      expect(getBooleanEnv('BOOL_VAR')).toBe(true);
    });

    it('should return false for "false"', () => {
      process.env.BOOL_VAR = 'false';
      expect(getBooleanEnv('BOOL_VAR')).toBe(false);
    });

    it('should return false for any other value', () => {
      process.env.BOOL_VAR = 'yes';
      expect(getBooleanEnv('BOOL_VAR')).toBe(false);
    });

    it('should return default when missing', () => {
      delete process.env.BOOL_VAR;
      expect(getBooleanEnv('BOOL_VAR', true)).toBe(true);
      expect(getBooleanEnv('BOOL_VAR', false)).toBe(false);
    });
  });

  describe('getNumericEnv', () => {
    it('should parse integer values', () => {
      process.env.NUM_VAR = '42';
      expect(getNumericEnv('NUM_VAR', 0)).toBe(42);
    });

    it('should parse float values', () => {
      process.env.NUM_VAR = '3.14';
      expect(getNumericEnv('NUM_VAR', 0)).toBeCloseTo(3.14);
    });

    it('should return default for missing var', () => {
      delete process.env.NUM_VAR;
      expect(getNumericEnv('NUM_VAR', 100)).toBe(100);
    });

    it('should return default for invalid number', () => {
      process.env.NUM_VAR = 'not_a_number';
      // Logger uses 'error' level in test env; set LOG_LEVEL to 'warn' so warn messages emit
      const origLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';
      // Re-require logger to pick up new log level
      jest.resetModules();
      const { getNumericEnv: getNumericEnvFresh } = require('../../src/lib/env');
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      expect(getNumericEnvFresh('NUM_VAR', 50)).toBe(50);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid numeric')
      );

      consoleSpy.mockRestore();
      if (origLogLevel === undefined) {
        delete process.env.LOG_LEVEL;
      } else {
        process.env.LOG_LEVEL = origLogLevel;
      }
    });
  });

  describe('validateEnvironment', () => {
    it('should return valid when all required vars exist', () => {
      process.env.ALPACA_API_KEY = 'key123';
      process.env.ALPACA_API_SECRET = 'secret456';
      
      const result = validateEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return invalid with missing vars listed', () => {
      delete process.env.ALPACA_API_KEY;
      delete process.env.ALPACA_API_SECRET;
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.missing).toContain('ALPACA_API_KEY');
      expect(result.missing).toContain('ALPACA_API_SECRET');
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should return partial missing when some vars exist', () => {
      process.env.ALPACA_API_KEY = 'key123';
      delete process.env.ALPACA_API_SECRET;
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = validateEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.missing).toHaveLength(1);
      expect(result.missing).toContain('ALPACA_API_SECRET');
      
      consoleSpy.mockRestore();
    });
  });
});
