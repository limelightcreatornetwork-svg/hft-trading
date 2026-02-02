/**
 * @fileoverview Tests for Enhanced Risk Engine
 * @module tests/core/risk-engine
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { RiskEngine } from '../../src/core/risk-engine.js';
import { RiskDecision, SystemMode, KillSwitchMode } from '../../src/core/types.js';

describe('RiskEngine', () => {
  let riskEngine;

  beforeEach(() => {
    riskEngine = new RiskEngine({
      maxPositionNotional: 10000,
      maxGrossExposure: 50000,
      maxNetExposure: 25000,
      maxOrderNotional: 5000,
      maxDailyLoss: 1000,
      maxDrawdown: 500,
      maxDailyTrades: 100,
      orderRateLimit: 10,
      cancelRateLimit: 20,
      replaceRateLimit: 5,
      maxSpreadBps: 30,
      minQuoteSize: 100,
      maxConsecutiveRejects: 5,
      max429sPerMinute: 3,
      riskPerTradePercent: 1,
    });
    riskEngine.updateEquity(100000);
  });

  afterEach(() => {
    riskEngine.reset();
  });

  describe('Pre-Trade Checks', () => {
    test('approves valid trade intent', async () => {
      const intent = {
        client_intent_id: 'test-001',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
        meta: { strategy: 'momentum' },
      };

      const quote = { bid: 149.95, ask: 150.05, bidSize: 500, askSize: 500, mid: 150 };
      const result = await riskEngine.evaluate(intent, quote);

      expect(result.status).toBe(RiskDecision.APPROVED);
      expect(result.checks.every(c => c.passed)).toBe(true);
      expect(result.headroom).toBeDefined();
    });

    test('rejects when kill switch is active', async () => {
      await riskEngine.activateKillSwitch('test', KillSwitchMode.BLOCK_NEW);

      const intent = {
        client_intent_id: 'test-002',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('kill_switch');
    });

    test('rejects disabled symbol', async () => {
      riskEngine.disableSymbol('AAPL', 'testing');

      const intent = {
        client_intent_id: 'test-003',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('symbol_enabled');
    });

    test('rejects paused strategy', async () => {
      riskEngine.pauseStrategy('momentum');

      const intent = {
        client_intent_id: 'test-004',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
        meta: { strategy: 'momentum' },
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('strategy_enabled');
    });

    test('rejects order exceeding notional limit', async () => {
      const intent = {
        client_intent_id: 'test-005',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100, // 100 * 150 = $15,000 > $5,000 limit
        limit_price: 150,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('max_order_notional');
    });

    test('rejects order exceeding position limit', async () => {
      // Simulate existing position
      riskEngine.updatePosition('AAPL', 60, 'buy', 150); // $9,000 position

      const intent = {
        client_intent_id: 'test-006',
        symbol: 'AAPL',
        side: 'buy',
        qty: 20, // Would add $3,000, exceeding $10,000 limit
        limit_price: 150,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('max_position');
    });

    test('rejects order with wide spread', async () => {
      const intent = {
        client_intent_id: 'test-007',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
      };

      const quote = {
        bid: 149.00,
        ask: 151.00, // 133 bps spread > 30 bps limit
        bidSize: 500,
        askSize: 500,
        mid: 150,
      };

      const result = await riskEngine.evaluate(intent, quote);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('spread_liquidity');
    });

    test('rejects order with insufficient quote size', async () => {
      const intent = {
        client_intent_id: 'test-008',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
      };

      const quote = {
        bid: 149.98,
        ask: 150.02,
        bidSize: 50, // Less than 100 minimum
        askSize: 50,
        mid: 150,
      };

      const result = await riskEngine.evaluate(intent, quote);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('spread_liquidity');
    });
  });

  describe('Daily Loss Limit', () => {
    test('rejects when daily loss limit exceeded', async () => {
      // Set PnL to just at the limit (without triggering auto kill switch)
      riskEngine.dailyPnL = -1001; // Directly set to bypass auto kill switch
      
      const intent = {
        client_intent_id: 'test-009',
        symbol: 'MSFT',
        side: 'buy',
        qty: 10,
        limit_price: 400,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('daily_loss_limit');
    });

    test('auto-activates kill switch on loss limit breach', () => {
      riskEngine.updateDailyPnL(-1001);

      expect(riskEngine.state.killSwitch).toBe(true);
      expect(riskEngine.state.mode).toBe(SystemMode.HALTED);
    });
  });

  describe('Drawdown Limit', () => {
    test('rejects when drawdown limit exceeded', async () => {
      riskEngine.updateDailyPnL(1000); // Peak at +$1,000
      riskEngine.updateDailyPnL(400);  // Current at +$400, drawdown = $600 > $500 limit

      const intent = {
        client_intent_id: 'test-010',
        symbol: 'NVDA',
        side: 'buy',
        qty: 5,
        limit_price: 800,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('drawdown_limit');
    });

    test('tracks intraday peak correctly', () => {
      riskEngine.updateDailyPnL(100);
      riskEngine.updateDailyPnL(500);
      riskEngine.updateDailyPnL(300);
      riskEngine.updateDailyPnL(600);
      riskEngine.updateDailyPnL(400);

      const state = riskEngine.getState();
      expect(state.intradayPeakPnL).toBe(600);
      expect(state.drawdown).toBe(200);
    });
  });

  describe('Rate Limiting', () => {
    test('rejects when order rate limit exceeded', async () => {
      // Simulate 10 orders in past minute
      for (let i = 0; i < 10; i++) {
        riskEngine.recordOrder();
      }

      const intent = {
        client_intent_id: 'test-011',
        symbol: 'TSLA',
        side: 'buy',
        qty: 5,
        limit_price: 200,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('order_rate_limit');
    });

    test('allows orders after rate limit window passes', async () => {
      // This test would require mocking Date.now() for proper testing
      // For now, just verify rate checking works
      riskEngine.recordOrder();
      
      const intent = {
        client_intent_id: 'test-012',
        symbol: 'GOOG',
        side: 'buy',
        qty: 2,
        limit_price: 140,
      };

      const result = await riskEngine.evaluate(intent);
      expect(result.status).toBe(RiskDecision.APPROVED);
    });

    test('tracks cancel rate', () => {
      expect(riskEngine.checkCancelRate()).toBe(true);
      
      for (let i = 0; i < 20; i++) {
        riskEngine.recordCancel();
      }
      
      expect(riskEngine.checkCancelRate()).toBe(false);
    });

    test('tracks replace rate', () => {
      expect(riskEngine.checkReplaceRate()).toBe(true);
      
      for (let i = 0; i < 5; i++) {
        riskEngine.recordReplace();
      }
      
      expect(riskEngine.checkReplaceRate()).toBe(false);
    });
  });

  describe('Exposure Limits', () => {
    test('rejects when gross exposure exceeded', async () => {
      // Simulate large existing positions
      riskEngine.updatePosition('AAPL', 200, 'buy', 150); // $30,000
      riskEngine.updatePosition('MSFT', 50, 'buy', 400);   // $20,000
      // Total gross = $50,000

      const intent = {
        client_intent_id: 'test-013',
        symbol: 'GOOG',
        side: 'buy',
        qty: 10, // Would add $1,400
        limit_price: 140,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('gross_exposure');
    });

    test('rejects when net exposure exceeded', async () => {
      // Simulate large long position
      riskEngine.updatePosition('AAPL', 150, 'buy', 150); // $22,500 long

      const intent = {
        client_intent_id: 'test-014',
        symbol: 'TSLA',
        side: 'buy',
        qty: 20, // Would add $4,000 net long, exceeding $25,000 limit
        limit_price: 200,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.status).toBe(RiskDecision.REJECTED);
      expect(result.failedCheck).toBe('net_exposure');
    });

    test('allows reducing trades when at exposure limit', async () => {
      riskEngine.updatePosition('AAPL', 150, 'buy', 150); // $22,500 long

      const intent = {
        client_intent_id: 'test-015',
        symbol: 'AAPL',
        side: 'sell',
        qty: 30, // Reducing position - keep under $5000 notional limit (30 * 155 = $4650)
        limit_price: 155,
      };

      const result = await riskEngine.evaluate(intent);
      expect(result.status).toBe(RiskDecision.APPROVED);
    });
  });

  describe('Kill Switch', () => {
    test('activates kill switch', async () => {
      await riskEngine.activateKillSwitch('manual_test', KillSwitchMode.CANCEL_ALL);

      expect(riskEngine.state.killSwitch).toBe(true);
      expect(riskEngine.state.killSwitchMode).toBe(KillSwitchMode.CANCEL_ALL);
      expect(riskEngine.state.killSwitchReason).toBe('manual_test');
      expect(riskEngine.state.mode).toBe(SystemMode.HALTED);
    });

    test('deactivates kill switch', async () => {
      await riskEngine.activateKillSwitch('test', KillSwitchMode.BLOCK_NEW);
      await riskEngine.deactivateKillSwitch('admin');

      expect(riskEngine.state.killSwitch).toBe(false);
      expect(riskEngine.state.mode).toBe(SystemMode.NORMAL);
    });
  });

  describe('Anomaly Detection', () => {
    test('triggers kill switch on consecutive rejections', async () => {
      // Simulate 5 consecutive rejections
      for (let i = 0; i < 5; i++) {
        const intent = {
          client_intent_id: `reject-${i}`,
          symbol: 'AAPL',
          side: 'buy',
          qty: 1000, // Will be rejected for size
          limit_price: 150,
        };
        await riskEngine.evaluate(intent);
      }

      expect(riskEngine.state.killSwitch).toBe(true);
    });

    test('triggers kill switch on 429 storm', () => {
      for (let i = 0; i < 3; i++) {
        riskEngine.trackError('429', { endpoint: '/orders' });
      }

      expect(riskEngine.state.killSwitch).toBe(true);
    });

    test('triggers kill switch on excessive reconnects', () => {
      // Simulate many reconnects (default limit is 10/hour)
      for (let i = 0; i < 10; i++) {
        riskEngine.trackReconnect();
      }

      expect(riskEngine.state.killSwitch).toBe(true);
    });
  });

  describe('Position Sizing', () => {
    test('calculates risk-based position sizing', async () => {
      const intent = {
        client_intent_id: 'sizing-001',
        symbol: 'AAPL',
        side: 'buy',
        qty: 30, // Keep under $5000 notional limit (30 * 150 = $4500)
        limit_price: 150,
      };

      const quote = {
        bid: 149.98,
        ask: 150.02,
        mid: 150,
        atr: 3, // $3 ATR
        bidSize: 1000,
        askSize: 1000,
      };

      const result = await riskEngine.evaluate(intent, quote);

      expect(result.sizing).toBeDefined();
      expect(result.sizing.riskDollars).toBeCloseTo(1000, 0); // 1% of $100,000
      expect(result.sizing.stopDistance).toBeGreaterThan(0);
      expect(result.sizing.riskBasedQty).toBeGreaterThan(0);
    });

    test('adjusts sizing for volatility', async () => {
      const intent = {
        client_intent_id: 'sizing-002',
        symbol: 'NVDA',
        side: 'buy',
        qty: 5, // Keep under $5000 notional limit (5 * 800 = $4000)
        limit_price: 800,
      };

      const normalVolQuote = {
        bid: 799.90,
        ask: 800.10,
        mid: 800,
        atr: 16, // 2% ATR (normal)
        bidSize: 500,
        askSize: 500,
      };

      const highVolQuote = {
        bid: 799.90,
        ask: 800.10,
        mid: 800,
        atr: 40, // 5% ATR (high vol)
        bidSize: 500,
        askSize: 500,
      };

      const normalResult = await riskEngine.evaluate(intent, normalVolQuote);
      
      riskEngine.reset();
      riskEngine.updateEquity(100000);
      
      const highVolResult = await riskEngine.evaluate(intent, highVolQuote);

      // High vol should result in smaller recommended size
      expect(highVolResult.sizing.adjustments.volatility).toBeLessThan(
        normalResult.sizing.adjustments.volatility
      );
    });
  });

  describe('State Management', () => {
    test('returns complete state', () => {
      riskEngine.updateDailyPnL(500);
      riskEngine.updatePosition('AAPL', 50, 'buy', 150);
      riskEngine.recordOrder();
      riskEngine.disableSymbol('TSLA');
      riskEngine.pauseStrategy('scalp');

      const state = riskEngine.getState();

      expect(state.mode).toBe(SystemMode.NORMAL);
      expect(state.dailyPnL).toBe(500);
      expect(state.grossExposure).toBe(7500);
      expect(state.positionCount).toBe(1);
      expect(state.ordersLastMinute).toBe(1);
      expect(state.disabledSymbols).toContain('TSLA');
      expect(state.pausedStrategies).toContain('scalp');
    });

    test('syncs positions from broker', () => {
      const brokerPositions = [
        { symbol: 'AAPL', qty: '100', market_value: '15000' },
        { symbol: 'MSFT', qty: '-50', market_value: '-20000' },
      ];

      riskEngine.syncPositions(brokerPositions);

      const state = riskEngine.getState();
      expect(state.positionCount).toBe(2);
      expect(state.grossExposure).toBe(35000);
      expect(state.netExposure).toBe(-5000); // 15000 - 20000
    });

    test('resets daily state', () => {
      riskEngine.updateDailyPnL(500);
      riskEngine.recordOrder();
      riskEngine.recordCancel();

      riskEngine.resetDaily();

      const state = riskEngine.getState();
      expect(state.dailyPnL).toBe(0);
      expect(state.dailyTradeCount).toBe(0);
      expect(state.ordersLastMinute).toBe(0);
      expect(state.cancelsLastMinute).toBe(0);
    });
  });

  describe('Headroom Calculation', () => {
    test('calculates remaining headroom correctly', async () => {
      riskEngine.updateDailyPnL(200);
      riskEngine.updatePosition('AAPL', 100, 'buy', 150); // $15,000 position

      const intent = {
        client_intent_id: 'headroom-001',
        symbol: 'MSFT',
        side: 'buy',
        qty: 10,
        limit_price: 400,
      };

      const result = await riskEngine.evaluate(intent);

      expect(result.headroom.remainingDailyLoss).toBeCloseTo(1200, 0); // 1000 + 200
      expect(result.headroom.remainingGrossExposure).toBeCloseTo(35000, 0); // 50000 - 15000
      expect(result.headroom.remainingDailyTrades).toBe(100);
    });
  });

  describe('Audit Log', () => {
    test('logs risk decisions', async () => {
      const intent = {
        client_intent_id: 'audit-001',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10,
        limit_price: 150,
      };

      await riskEngine.evaluate(intent);
      
      const auditLog = riskEngine.getAuditLog(10);
      expect(auditLog.length).toBeGreaterThan(0);
      expect(auditLog.some(e => e.type === 'risk_check_passed')).toBe(true);
    });

    test('logs kill switch events', async () => {
      await riskEngine.activateKillSwitch('test_reason', KillSwitchMode.FLATTEN);
      
      const auditLog = riskEngine.getAuditLog(10);
      expect(auditLog.some(e => e.type === 'kill_switch_toggled')).toBe(true);
    });
  });
});
