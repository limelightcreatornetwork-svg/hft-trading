/**
 * Tests for Alpaca API Response Formatters
 *
 * Tests the conversion of raw Alpaca API responses (snake_case, string values)
 * to formatted objects (camelCase, proper numeric types).
 */

import {
  formatAlpacaPosition,
  formatAlpacaOrder,
  formatAlpacaAccount,
  FormattedPosition,
  FormattedOrder,
  FormattedAccount,
} from '@/lib/formatters';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createRawPosition = (overrides = {}) => ({
  symbol: 'AAPL',
  asset_id: 'asset-123',
  exchange: 'NASDAQ',
  asset_class: 'us_equity',
  qty: '10',
  side: 'long',
  avg_entry_price: '150.25',
  current_price: '155.50',
  market_value: '1555.00',
  cost_basis: '1502.50',
  unrealized_pl: '52.50',
  unrealized_plpc: '0.0349',
  unrealized_intraday_pl: '15.00',
  unrealized_intraday_plpc: '0.0097',
  lastday_price: '154.00',
  change_today: '0.0097',
  ...overrides,
});

const createRawOrder = (overrides = {}) => ({
  id: 'order-123',
  client_order_id: 'client-456',
  symbol: 'AAPL',
  asset_class: 'us_equity',
  qty: '10',
  filled_qty: '5',
  type: 'limit',
  side: 'buy',
  time_in_force: 'day',
  limit_price: '150.00',
  stop_price: null,
  filled_avg_price: '149.75',
  status: 'partially_filled',
  extended_hours: false,
  created_at: '2026-02-04T10:00:00Z',
  updated_at: '2026-02-04T10:05:00Z',
  submitted_at: '2026-02-04T10:00:00Z',
  filled_at: null,
  canceled_at: null,
  ...overrides,
});

const createRawAccount = (overrides = {}) => ({
  id: 'account-789',
  status: 'ACTIVE',
  currency: 'USD',
  buying_power: '10000.00',
  cash: '5000.00',
  portfolio_value: '15000.00',
  equity: '15500.00',
  last_equity: '15000.00',
  long_market_value: '10500.00',
  short_market_value: '0',
  initial_margin: '5000.00',
  maintenance_margin: '3000.00',
  daytrade_count: 2,
  pattern_day_trader: false,
  ...overrides,
});

// =============================================================================
// POSITION FORMATTER TESTS
// =============================================================================

describe('formatAlpacaPosition', () => {
  it('should convert snake_case to camelCase', () => {
    const raw = createRawPosition();
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.assetId).toBe('asset-123');
    expect(formatted.assetClass).toBe('us_equity');
    expect(formatted.avgEntryPrice).toBe(150.25);
    expect(formatted.currentPrice).toBe(155.50);
    expect(formatted.marketValue).toBe(1555.00);
    expect(formatted.costBasis).toBe(1502.50);
    expect(formatted.unrealizedPL).toBe(52.50);
    expect(formatted.unrealizedIntradayPL).toBe(15.00);
    expect(formatted.lastdayPrice).toBe(154.00);
  });

  it('should convert string numbers to proper numeric types', () => {
    const raw = createRawPosition();
    const formatted = formatAlpacaPosition(raw);

    expect(typeof formatted.quantity).toBe('number');
    expect(typeof formatted.avgEntryPrice).toBe('number');
    expect(typeof formatted.currentPrice).toBe('number');
    expect(typeof formatted.marketValue).toBe('number');
    expect(typeof formatted.costBasis).toBe('number');
    expect(typeof formatted.unrealizedPL).toBe('number');
    expect(typeof formatted.lastdayPrice).toBe('number');
  });

  it('should convert percentages to proper format (multiply by 100)', () => {
    const raw = createRawPosition({
      unrealized_plpc: '0.0349',
      unrealized_intraday_plpc: '0.0097',
      change_today: '0.015',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.unrealizedPLPercent).toBeCloseTo(3.49, 2);
    expect(formatted.unrealizedIntradayPLPercent).toBeCloseTo(0.97, 2);
    expect(formatted.changeToday).toBeCloseTo(1.5, 2);
  });

  it('should preserve string fields correctly', () => {
    const raw = createRawPosition();
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.symbol).toBe('AAPL');
    expect(formatted.exchange).toBe('NASDAQ');
    expect(formatted.side).toBe('long');
  });

  it('should handle negative unrealized P/L', () => {
    const raw = createRawPosition({
      unrealized_pl: '-50.00',
      unrealized_plpc: '-0.0333',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.unrealizedPL).toBe(-50.00);
    expect(formatted.unrealizedPLPercent).toBeCloseTo(-3.33, 2);
  });

  it('should handle zero values', () => {
    const raw = createRawPosition({
      unrealized_pl: '0',
      unrealized_plpc: '0',
      change_today: '0',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.unrealizedPL).toBe(0);
    expect(formatted.unrealizedPLPercent).toBe(0);
    expect(formatted.changeToday).toBe(0);
  });

  it('should handle short positions', () => {
    const raw = createRawPosition({
      side: 'short',
      qty: '-10',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.side).toBe('short');
    expect(formatted.quantity).toBe(-10);
  });

  it('should handle fractional quantities', () => {
    const raw = createRawPosition({
      qty: '0.5',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.quantity).toBe(0.5);
  });

  it('should handle high precision prices', () => {
    const raw = createRawPosition({
      avg_entry_price: '150.123456',
      current_price: '155.987654',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.avgEntryPrice).toBeCloseTo(150.123456, 6);
    expect(formatted.currentPrice).toBeCloseTo(155.987654, 6);
  });

  it('should handle large market values', () => {
    const raw = createRawPosition({
      market_value: '1000000.00',
      cost_basis: '950000.00',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.marketValue).toBe(1000000);
    expect(formatted.costBasis).toBe(950000);
  });
});

// =============================================================================
// ORDER FORMATTER TESTS
// =============================================================================

describe('formatAlpacaOrder', () => {
  it('should convert snake_case to camelCase', () => {
    const raw = createRawOrder();
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.clientOrderId).toBe('client-456');
    expect(formatted.assetClass).toBe('us_equity');
    expect(formatted.filledQuantity).toBe(5);
    expect(formatted.timeInForce).toBe('day');
    expect(formatted.limitPrice).toBe(150.00);
    expect(formatted.filledAvgPrice).toBe(149.75);
    expect(formatted.extendedHours).toBe(false);
    expect(formatted.createdAt).toBe('2026-02-04T10:00:00Z');
    expect(formatted.updatedAt).toBe('2026-02-04T10:05:00Z');
    expect(formatted.submittedAt).toBe('2026-02-04T10:00:00Z');
  });

  it('should convert string numbers to proper numeric types', () => {
    const raw = createRawOrder();
    const formatted = formatAlpacaOrder(raw);

    expect(typeof formatted.quantity).toBe('number');
    expect(typeof formatted.filledQuantity).toBe('number');
    expect(typeof formatted.limitPrice).toBe('number');
  });

  it('should handle null optional fields', () => {
    const raw = createRawOrder({
      stop_price: null,
      filled_at: null,
      canceled_at: null,
    });
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.stopPrice).toBeNull();
    expect(formatted.filledAt).toBeNull();
    expect(formatted.canceledAt).toBeNull();
  });

  it('should handle undefined optional fields as null', () => {
    const raw = createRawOrder();
    delete (raw as Record<string, unknown>).limit_price;
    (raw as Record<string, unknown>).limit_price = undefined;
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.limitPrice).toBeNull();
  });

  it('should preserve order ID fields', () => {
    const raw = createRawOrder();
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.id).toBe('order-123');
    expect(formatted.clientOrderId).toBe('client-456');
  });

  it('should handle different order types', () => {
    const marketOrder = formatAlpacaOrder(createRawOrder({ type: 'market', limit_price: null }));
    const limitOrder = formatAlpacaOrder(createRawOrder({ type: 'limit', limit_price: '150.00' }));
    const stopOrder = formatAlpacaOrder(createRawOrder({ type: 'stop', stop_price: '140.00', limit_price: null }));
    const stopLimitOrder = formatAlpacaOrder(createRawOrder({
      type: 'stop_limit',
      stop_price: '145.00',
      limit_price: '144.00',
    }));

    expect(marketOrder.type).toBe('market');
    expect(marketOrder.limitPrice).toBeNull();
    
    expect(limitOrder.type).toBe('limit');
    expect(limitOrder.limitPrice).toBe(150.00);
    
    expect(stopOrder.type).toBe('stop');
    expect(stopOrder.stopPrice).toBe(140.00);
    
    expect(stopLimitOrder.type).toBe('stop_limit');
    expect(stopLimitOrder.stopPrice).toBe(145.00);
    expect(stopLimitOrder.limitPrice).toBe(144.00);
  });

  it('should handle different order sides', () => {
    const buyOrder = formatAlpacaOrder(createRawOrder({ side: 'buy' }));
    const sellOrder = formatAlpacaOrder(createRawOrder({ side: 'sell' }));

    expect(buyOrder.side).toBe('buy');
    expect(sellOrder.side).toBe('sell');
  });

  it('should handle different order statuses', () => {
    const statuses = ['new', 'accepted', 'pending_new', 'partially_filled', 'filled', 'canceled', 'rejected', 'expired'];

    for (const status of statuses) {
      const formatted = formatAlpacaOrder(createRawOrder({ status }));
      expect(formatted.status).toBe(status);
    }
  });

  it('should handle different time_in_force values', () => {
    const tifs = ['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'];

    for (const tif of tifs) {
      const formatted = formatAlpacaOrder(createRawOrder({ time_in_force: tif }));
      expect(formatted.timeInForce).toBe(tif);
    }
  });

  it('should handle extended hours orders', () => {
    const extendedHoursOrder = formatAlpacaOrder(createRawOrder({ extended_hours: true }));
    const regularOrder = formatAlpacaOrder(createRawOrder({ extended_hours: false }));

    expect(extendedHoursOrder.extendedHours).toBe(true);
    expect(regularOrder.extendedHours).toBe(false);
  });

  it('should handle filled orders', () => {
    const raw = createRawOrder({
      status: 'filled',
      filled_qty: '10',
      filled_avg_price: '149.50',
      filled_at: '2026-02-04T10:10:00Z',
    });
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.status).toBe('filled');
    expect(formatted.filledQuantity).toBe(10);
    expect(formatted.filledAvgPrice).toBe(149.50);
    expect(formatted.filledAt).toBe('2026-02-04T10:10:00Z');
  });

  it('should handle canceled orders', () => {
    const raw = createRawOrder({
      status: 'canceled',
      canceled_at: '2026-02-04T10:15:00Z',
    });
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.status).toBe('canceled');
    expect(formatted.canceledAt).toBe('2026-02-04T10:15:00Z');
  });

  it('should handle zero filled quantity', () => {
    const raw = createRawOrder({
      filled_qty: '0',
      filled_avg_price: null,
    });
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.filledQuantity).toBe(0);
    expect(formatted.filledAvgPrice).toBeNull();
  });

  it('should handle fractional share orders', () => {
    const raw = createRawOrder({
      qty: '0.5',
      filled_qty: '0.25',
    });
    const formatted = formatAlpacaOrder(raw);

    expect(formatted.quantity).toBe(0.5);
    expect(formatted.filledQuantity).toBe(0.25);
  });
});

// =============================================================================
// ACCOUNT FORMATTER TESTS
// =============================================================================

describe('formatAlpacaAccount', () => {
  it('should convert snake_case to camelCase', () => {
    const raw = createRawAccount();
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.buyingPower).toBe(10000);
    expect(formatted.portfolioValue).toBe(15000);
    expect(formatted.lastEquity).toBe(15000);
    expect(formatted.longMarketValue).toBe(10500);
    expect(formatted.shortMarketValue).toBe(0);
    expect(formatted.initialMargin).toBe(5000);
    expect(formatted.maintenanceMargin).toBe(3000);
    expect(formatted.daytradeCount).toBe(2);
    expect(formatted.patternDayTrader).toBe(false);
  });

  it('should convert string numbers to proper numeric types', () => {
    const raw = createRawAccount();
    const formatted = formatAlpacaAccount(raw);

    expect(typeof formatted.buyingPower).toBe('number');
    expect(typeof formatted.cash).toBe('number');
    expect(typeof formatted.portfolioValue).toBe('number');
    expect(typeof formatted.equity).toBe('number');
    expect(typeof formatted.lastEquity).toBe('number');
    expect(typeof formatted.longMarketValue).toBe('number');
    expect(typeof formatted.shortMarketValue).toBe('number');
    expect(typeof formatted.initialMargin).toBe('number');
    expect(typeof formatted.maintenanceMargin).toBe('number');
  });

  it('should preserve string fields correctly', () => {
    const raw = createRawAccount();
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.id).toBe('account-789');
    expect(formatted.status).toBe('ACTIVE');
    expect(formatted.currency).toBe('USD');
  });

  it('should preserve boolean and number fields', () => {
    const raw = createRawAccount({
      daytrade_count: 3,
      pattern_day_trader: true,
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.daytradeCount).toBe(3);
    expect(formatted.patternDayTrader).toBe(true);
  });

  it('should calculate daily P/L correctly (positive)', () => {
    const raw = createRawAccount({
      equity: '15500.00',
      last_equity: '15000.00',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.dailyPL).toBe(500);
    expect(formatted.dailyPLPercent).toBeCloseTo(3.33, 1);
  });

  it('should calculate daily P/L correctly (negative)', () => {
    const raw = createRawAccount({
      equity: '14500.00',
      last_equity: '15000.00',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.dailyPL).toBe(-500);
    expect(formatted.dailyPLPercent).toBeCloseTo(-3.33, 1);
  });

  it('should calculate daily P/L correctly (zero change)', () => {
    const raw = createRawAccount({
      equity: '15000.00',
      last_equity: '15000.00',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.dailyPL).toBe(0);
    expect(formatted.dailyPLPercent).toBe(0);
  });

  it('should handle zero last equity (avoid division by zero)', () => {
    const raw = createRawAccount({
      equity: '15000.00',
      last_equity: '0',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.dailyPL).toBe(15000);
    expect(formatted.dailyPLPercent).toBe(0);
  });

  it('should handle different account statuses', () => {
    const statuses = ['ACTIVE', 'INACTIVE', 'ONBOARDING', 'DISABLED'];

    for (const status of statuses) {
      const formatted = formatAlpacaAccount(createRawAccount({ status }));
      expect(formatted.status).toBe(status);
    }
  });

  it('should handle accounts with short positions', () => {
    const raw = createRawAccount({
      short_market_value: '5000.00',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.shortMarketValue).toBe(5000);
  });

  it('should handle large account values', () => {
    const raw = createRawAccount({
      buying_power: '1000000.00',
      cash: '500000.00',
      portfolio_value: '1500000.00',
      equity: '1500000.00',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.buyingPower).toBe(1000000);
    expect(formatted.cash).toBe(500000);
    expect(formatted.portfolioValue).toBe(1500000);
    expect(formatted.equity).toBe(1500000);
  });

  it('should handle small/fractional values', () => {
    const raw = createRawAccount({
      buying_power: '0.50',
      cash: '0.25',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.buyingPower).toBe(0.5);
    expect(formatted.cash).toBe(0.25);
  });

  it('should handle PDT flagged accounts', () => {
    const raw = createRawAccount({
      pattern_day_trader: true,
      daytrade_count: 4,
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.patternDayTrader).toBe(true);
    expect(formatted.daytradeCount).toBe(4);
  });

  it('should handle zero daytrade count', () => {
    const raw = createRawAccount({
      daytrade_count: 0,
      pattern_day_trader: false,
    });
    const formatted = formatAlpacaAccount(raw);

    expect(formatted.daytradeCount).toBe(0);
    expect(formatted.patternDayTrader).toBe(false);
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe('formatters edge cases', () => {
  it('should handle NaN values gracefully in positions', () => {
    const raw = createRawPosition({
      qty: 'invalid',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(Number.isNaN(formatted.quantity)).toBe(true);
  });

  it('should handle NaN values gracefully in orders', () => {
    const raw = createRawOrder({
      qty: 'invalid',
    });
    const formatted = formatAlpacaOrder(raw);

    expect(Number.isNaN(formatted.quantity)).toBe(true);
  });

  it('should handle NaN values gracefully in accounts', () => {
    const raw = createRawAccount({
      buying_power: 'invalid',
    });
    const formatted = formatAlpacaAccount(raw);

    expect(Number.isNaN(formatted.buyingPower)).toBe(true);
  });

  it('should handle empty string values', () => {
    const raw = createRawPosition({
      qty: '',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(Number.isNaN(formatted.quantity)).toBe(true);
  });

  it('should handle whitespace in numeric strings', () => {
    const raw = createRawPosition({
      qty: ' 10 ',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.quantity).toBe(10);
  });

  it('should handle scientific notation', () => {
    const raw = createRawPosition({
      market_value: '1e6',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.marketValue).toBe(1000000);
  });

  it('should handle very small percentages', () => {
    const raw = createRawPosition({
      unrealized_plpc: '0.0001',
      change_today: '0.00005',
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.unrealizedPLPercent).toBeCloseTo(0.01, 4);
    expect(formatted.changeToday).toBeCloseTo(0.005, 4);
  });

  it('should handle negative prices (theoretical)', () => {
    const raw = createRawPosition({
      current_price: '-10.00', // edge case
    });
    const formatted = formatAlpacaPosition(raw);

    expect(formatted.currentPrice).toBe(-10);
  });
});

// =============================================================================
// TYPE SAFETY TESTS
// =============================================================================

describe('type safety', () => {
  it('FormattedPosition should have correct shape', () => {
    const formatted: FormattedPosition = formatAlpacaPosition(createRawPosition());

    expect('symbol' in formatted).toBe(true);
    expect('assetId' in formatted).toBe(true);
    expect('exchange' in formatted).toBe(true);
    expect('assetClass' in formatted).toBe(true);
    expect('quantity' in formatted).toBe(true);
    expect('side' in formatted).toBe(true);
    expect('avgEntryPrice' in formatted).toBe(true);
    expect('currentPrice' in formatted).toBe(true);
    expect('marketValue' in formatted).toBe(true);
    expect('costBasis' in formatted).toBe(true);
    expect('unrealizedPL' in formatted).toBe(true);
    expect('unrealizedPLPercent' in formatted).toBe(true);
    expect('unrealizedIntradayPL' in formatted).toBe(true);
    expect('unrealizedIntradayPLPercent' in formatted).toBe(true);
    expect('lastdayPrice' in formatted).toBe(true);
    expect('changeToday' in formatted).toBe(true);
  });

  it('FormattedOrder should have correct shape', () => {
    const formatted: FormattedOrder = formatAlpacaOrder(createRawOrder());

    expect('id' in formatted).toBe(true);
    expect('clientOrderId' in formatted).toBe(true);
    expect('symbol' in formatted).toBe(true);
    expect('assetClass' in formatted).toBe(true);
    expect('quantity' in formatted).toBe(true);
    expect('filledQuantity' in formatted).toBe(true);
    expect('type' in formatted).toBe(true);
    expect('side' in formatted).toBe(true);
    expect('timeInForce' in formatted).toBe(true);
    expect('limitPrice' in formatted).toBe(true);
    expect('stopPrice' in formatted).toBe(true);
    expect('filledAvgPrice' in formatted).toBe(true);
    expect('status' in formatted).toBe(true);
    expect('extendedHours' in formatted).toBe(true);
    expect('createdAt' in formatted).toBe(true);
    expect('updatedAt' in formatted).toBe(true);
    expect('submittedAt' in formatted).toBe(true);
    expect('filledAt' in formatted).toBe(true);
    expect('canceledAt' in formatted).toBe(true);
  });

  it('FormattedAccount should have correct shape', () => {
    const formatted: FormattedAccount = formatAlpacaAccount(createRawAccount());

    expect('id' in formatted).toBe(true);
    expect('status' in formatted).toBe(true);
    expect('currency' in formatted).toBe(true);
    expect('buyingPower' in formatted).toBe(true);
    expect('cash' in formatted).toBe(true);
    expect('portfolioValue' in formatted).toBe(true);
    expect('equity' in formatted).toBe(true);
    expect('lastEquity' in formatted).toBe(true);
    expect('longMarketValue' in formatted).toBe(true);
    expect('shortMarketValue' in formatted).toBe(true);
    expect('initialMargin' in formatted).toBe(true);
    expect('maintenanceMargin' in formatted).toBe(true);
    expect('daytradeCount' in formatted).toBe(true);
    expect('patternDayTrader' in formatted).toBe(true);
    expect('dailyPL' in formatted).toBe(true);
    expect('dailyPLPercent' in formatted).toBe(true);
  });
});
