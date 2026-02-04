/**
 * Tests for Alpaca Options utilities
 */

import {
  parseOptionSymbol,
  buildOptionSymbol,
  calculatePremium,
  getExpirationDates,
  canSellCoveredCall,
  canSellCashSecuredPut,
  getClosingSide,
  OptionContract,
} from '../../src/lib/alpaca-options';

describe('Alpaca Options Utilities', () => {
  describe('parseOptionSymbol', () => {
    it('should parse a valid call option symbol', () => {
      const result = parseOptionSymbol('AAPL240119C00150000');

      expect(result).toEqual({
        rootSymbol: 'AAPL',
        expirationDate: '2024-01-19',
        type: 'call',
        strikePrice: 150,
      });
    });

    it('should parse a valid put option symbol', () => {
      const result = parseOptionSymbol('TSLA240315P00200000');

      expect(result).toEqual({
        rootSymbol: 'TSLA',
        expirationDate: '2024-03-15',
        type: 'put',
        strikePrice: 200,
      });
    });

    it('should handle strike prices with decimals', () => {
      const result = parseOptionSymbol('SPY240119C00475500');

      expect(result).toEqual({
        rootSymbol: 'SPY',
        expirationDate: '2024-01-19',
        type: 'call',
        strikePrice: 475.5,
      });
    });

    it('should handle low strike prices', () => {
      const result = parseOptionSymbol('SNDL240119P00000500');

      expect(result).toEqual({
        rootSymbol: 'SNDL',
        expirationDate: '2024-01-19',
        type: 'put',
        strikePrice: 0.5,
      });
    });

    it('should return null for invalid symbol format', () => {
      expect(parseOptionSymbol('AAPL')).toBeNull();
      expect(parseOptionSymbol('')).toBeNull();
      expect(parseOptionSymbol('AAPL240119X00150000')).toBeNull(); // X is not C or P
      expect(parseOptionSymbol('aapl240119C00150000')).toBeNull(); // lowercase
    });

    it('should parse multi-character root symbols', () => {
      const result = parseOptionSymbol('GOOGL240119C00140000');

      expect(result).toEqual({
        rootSymbol: 'GOOGL',
        expirationDate: '2024-01-19',
        type: 'call',
        strikePrice: 140,
      });
    });
  });

  describe('buildOptionSymbol', () => {
    it('should build a call option symbol', () => {
      const symbol = buildOptionSymbol('AAPL', '2024-01-19', 'call', 150);
      expect(symbol).toBe('AAPL240119C00150000');
    });

    it('should build a put option symbol', () => {
      const symbol = buildOptionSymbol('TSLA', '2024-03-15', 'put', 200);
      expect(symbol).toBe('TSLA240315P00200000');
    });

    it('should handle decimal strike prices', () => {
      const symbol = buildOptionSymbol('SPY', '2024-01-19', 'call', 475.5);
      expect(symbol).toBe('SPY240119C00475500');
    });

    it('should uppercase the root symbol', () => {
      const symbol = buildOptionSymbol('aapl', '2024-01-19', 'call', 150);
      expect(symbol).toBe('AAPL240119C00150000');
    });

    it('should roundtrip with parseOptionSymbol', () => {
      const original = {
        rootSymbol: 'NVDA',
        expirationDate: '2024-06-21',
        type: 'call' as const,
        strikePrice: 500,
      };

      const symbol = buildOptionSymbol(
        original.rootSymbol,
        original.expirationDate,
        original.type,
        original.strikePrice
      );

      const parsed = parseOptionSymbol(symbol);
      expect(parsed).toEqual(original);
    });
  });

  describe('calculatePremium', () => {
    it('should calculate premium for standard contract', () => {
      const contract: OptionContract = {
        id: 'test',
        symbol: 'AAPL240119C00150000',
        name: 'AAPL Call',
        status: 'active',
        tradable: true,
        expiration_date: '2024-01-19',
        root_symbol: 'AAPL',
        underlying_symbol: 'AAPL',
        underlying_asset_id: 'asset-1',
        type: 'call',
        style: 'american',
        strike_price: '150',
        size: '100',
        open_interest: '1000',
        open_interest_date: '2024-01-01',
        close_price: '2.50',
        close_price_date: '2024-01-01',
      };

      // 2.50 * 100 * 1 = 250
      expect(calculatePremium(contract, 1)).toBe(250);
      // 2.50 * 100 * 5 = 1250
      expect(calculatePremium(contract, 5)).toBe(1250);
    });

    it('should handle zero close price', () => {
      const contract: OptionContract = {
        id: 'test',
        symbol: 'TEST',
        name: 'Test',
        status: 'active',
        tradable: true,
        expiration_date: '2024-01-19',
        root_symbol: 'TEST',
        underlying_symbol: 'TEST',
        underlying_asset_id: 'asset-1',
        type: 'call',
        style: 'american',
        strike_price: '100',
        size: '100',
        open_interest: '0',
        open_interest_date: '2024-01-01',
        close_price: '0',
        close_price_date: '2024-01-01',
      };

      expect(calculatePremium(contract, 1)).toBe(0);
    });

    it('should handle non-standard contract size', () => {
      const contract: OptionContract = {
        id: 'test',
        symbol: 'MINI',
        name: 'Mini Option',
        status: 'active',
        tradable: true,
        expiration_date: '2024-01-19',
        root_symbol: 'MINI',
        underlying_symbol: 'MINI',
        underlying_asset_id: 'asset-1',
        type: 'put',
        style: 'american',
        strike_price: '50',
        size: '10', // Mini option
        open_interest: '100',
        open_interest_date: '2024-01-01',
        close_price: '1.00',
        close_price_date: '2024-01-01',
      };

      // 1.00 * 10 * 2 = 20
      expect(calculatePremium(contract, 2)).toBe(20);
    });
  });

  describe('getExpirationDates', () => {
    it('should return array of dates', () => {
      const dates = getExpirationDates(4);

      expect(dates).toHaveLength(4);
      dates.forEach((date) => {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });

    it('should return Fridays', () => {
      const dates = getExpirationDates(4);

      dates.forEach((dateStr) => {
        const date = new Date(dateStr + 'T12:00:00Z');
        expect(date.getUTCDay()).toBe(5); // Friday
      });
    });

    it('should use default of 8 weeks', () => {
      const dates = getExpirationDates();
      expect(dates).toHaveLength(8);
    });

    it('should return dates in ascending order', () => {
      const dates = getExpirationDates(4);

      for (let i = 1; i < dates.length; i++) {
        expect(new Date(dates[i]).getTime()).toBeGreaterThan(
          new Date(dates[i - 1]).getTime()
        );
      }
    });
  });

  describe('canSellCoveredCall', () => {
    const positions = [
      { symbol: 'AAPL', qty: '200' },
      { symbol: 'TSLA', qty: '50' },
      { symbol: 'MSFT', qty: '100' },
    ];

    it('should allow when sufficient shares', () => {
      const result = canSellCoveredCall(positions, 'AAPL', 2);

      expect(result).toEqual({
        allowed: true,
        availableShares: 200,
      });
    });

    it('should allow exact share count', () => {
      const result = canSellCoveredCall(positions, 'MSFT', 1);

      expect(result).toEqual({
        allowed: true,
        availableShares: 100,
      });
    });

    it('should reject when insufficient shares', () => {
      const result = canSellCoveredCall(positions, 'TSLA', 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient shares');
      expect(result.reason).toContain('Need 100');
      expect(result.reason).toContain('have 50');
      expect(result.availableShares).toBe(50);
    });

    it('should reject when no position exists', () => {
      const result = canSellCoveredCall(positions, 'NVDA', 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient shares');
      expect(result.availableShares).toBe(0);
    });

    it('should handle multiple contracts requirement', () => {
      // 3 contracts = 300 shares needed, only have 200
      const result = canSellCoveredCall(positions, 'AAPL', 3);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Need 300');
    });
  });

  describe('canSellCashSecuredPut', () => {
    it('should allow when sufficient buying power', () => {
      const result = canSellCashSecuredPut(50000, 150, 2);

      // 150 * 100 * 2 = 30000 required
      expect(result).toEqual({
        allowed: true,
        requiredCash: 30000,
      });
    });

    it('should allow exact buying power', () => {
      const result = canSellCashSecuredPut(15000, 150, 1);

      expect(result).toEqual({
        allowed: true,
        requiredCash: 15000,
      });
    });

    it('should reject when insufficient buying power', () => {
      const result = canSellCashSecuredPut(10000, 150, 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Insufficient buying power');
      expect(result.reason).toContain('Need $15000.00');
      expect(result.reason).toContain('have $10000.00');
      expect(result.requiredCash).toBe(15000);
    });

    it('should handle low strike prices', () => {
      const result = canSellCashSecuredPut(1000, 5, 1);

      // 5 * 100 * 1 = 500 required
      expect(result).toEqual({
        allowed: true,
        requiredCash: 500,
      });
    });

    it('should handle multiple contracts', () => {
      // 200 * 100 * 5 = 100000 required
      const result = canSellCashSecuredPut(50000, 200, 5);

      expect(result.allowed).toBe(false);
      expect(result.requiredCash).toBe(100000);
    });
  });

  describe('getClosingSide', () => {
    it('should return sell for long positions', () => {
      expect(getClosingSide('long')).toBe('sell');
    });

    it('should return buy for short positions', () => {
      expect(getClosingSide('short')).toBe('buy');
    });
  });
});
