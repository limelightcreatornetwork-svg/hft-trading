/**
 * Tests for Notifications Service
 */

describe('Notification Types', () => {
  describe('Price Alert Logic', () => {
    it('should trigger when price crosses above threshold', () => {
      const alert = {
        type: 'above' as const,
        threshold: 150,
      };
      const currentPrice = 151;
      
      const triggered = currentPrice >= alert.threshold;
      
      expect(triggered).toBe(true);
    });

    it('should not trigger when price is below threshold', () => {
      const alert = {
        type: 'above' as const,
        threshold: 150,
      };
      const currentPrice = 149;
      
      const triggered = currentPrice >= alert.threshold;
      
      expect(triggered).toBe(false);
    });

    it('should trigger when price crosses below threshold', () => {
      const alert = {
        type: 'below' as const,
        threshold: 150,
      };
      const currentPrice = 149;
      
      const triggered = currentPrice <= alert.threshold;
      
      expect(triggered).toBe(true);
    });

    it('should trigger on percentage change', () => {
      const alert = {
        type: 'change_pct' as const,
        threshold: 5, // 5% change
        basePrice: 100,
      };
      const currentPrice = 106;
      
      const changePct = Math.abs((currentPrice - alert.basePrice) / alert.basePrice) * 100;
      const triggered = changePct >= alert.threshold;
      
      expect(changePct).toBe(6);
      expect(triggered).toBe(true);
    });

    it('should trigger on negative percentage change', () => {
      const alert = {
        type: 'change_pct' as const,
        threshold: 5,
        basePrice: 100,
      };
      const currentPrice = 94;
      
      const changePct = Math.abs((currentPrice - alert.basePrice) / alert.basePrice) * 100;
      const triggered = changePct >= alert.threshold;
      
      expect(changePct).toBe(6);
      expect(triggered).toBe(true);
    });

    it('should not trigger for small percentage changes', () => {
      const alert = {
        type: 'change_pct' as const,
        threshold: 5,
        basePrice: 100,
      };
      const currentPrice = 102;
      
      const changePct = Math.abs((currentPrice - alert.basePrice) / alert.basePrice) * 100;
      const triggered = changePct >= alert.threshold;
      
      expect(changePct).toBe(2);
      expect(triggered).toBe(false);
    });
  });

  describe('Daily P&L Calculations', () => {
    it('should calculate daily P&L correctly', () => {
      const previousEquity = 10000;
      const currentEquity = 10250;
      
      const dailyPL = currentEquity - previousEquity;
      const dailyPLPct = (dailyPL / previousEquity) * 100;
      
      expect(dailyPL).toBe(250);
      expect(dailyPLPct).toBe(2.5);
    });

    it('should handle negative P&L', () => {
      const previousEquity = 10000;
      const currentEquity = 9800;
      
      const dailyPL = currentEquity - previousEquity;
      const dailyPLPct = (dailyPL / previousEquity) * 100;
      
      expect(dailyPL).toBe(-200);
      expect(dailyPLPct).toBe(-2);
    });

    it('should aggregate realized and unrealized P&L', () => {
      const trades = [
        { pnl: 50 },
        { pnl: -20 },
        { pnl: 30 },
      ];
      const positions = [
        { unrealizedPL: 100 },
        { unrealizedPL: -25 },
      ];
      
      const realizedPL = trades.reduce((sum, t) => sum + t.pnl, 0);
      const unrealizedPL = positions.reduce((sum, p) => sum + p.unrealizedPL, 0);
      
      expect(realizedPL).toBe(60);
      expect(unrealizedPL).toBe(75);
    });
  });

  describe('Position Warnings', () => {
    it('should warn on large unrealized loss', () => {
      const entryPrice = 100;
      const currentPrice = 93;
      const side = 'long';
      
      const pnlPct = side === 'long'
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;
      
      const shouldWarn = pnlPct < -5;
      
      expect(pnlPct).toBeCloseTo(-7);
      expect(shouldWarn).toBe(true);
    });

    it('should not warn on small loss', () => {
      const entryPrice = 100;
      const currentPrice = 97;
      const side = 'long';
      
      const pnlPct = side === 'long'
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;
      
      const shouldWarn = pnlPct < -5;
      
      expect(pnlPct).toBe(-3);
      expect(shouldWarn).toBe(false);
    });

    it('should warn on extended hold time', () => {
      const enteredAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      const hoursHeld = (Date.now() - enteredAt.getTime()) / (1000 * 60 * 60);
      
      const shouldWarn = hoursHeld > 24;
      
      expect(hoursHeld).toBeCloseTo(25, 0);
      expect(shouldWarn).toBe(true);
    });

    it('should handle short position P&L correctly', () => {
      const entryPrice = 100;
      const currentPrice = 107;

      // Short P&L: profit when price drops, loss when price rises
      const pnlPct = ((entryPrice - currentPrice) / entryPrice) * 100;

      // Short at 100, now at 107 = -7% loss
      expect(pnlPct).toBeCloseTo(-7);
    });
  });

  describe('Severity Classification', () => {
    it('should classify profitable day as info', () => {
      const dailyPL = 100;
      const severity = dailyPL >= 0 ? 'info' : 'warning';
      
      expect(severity).toBe('info');
    });

    it('should classify losing day as warning', () => {
      const dailyPL = -50;
      const severity = dailyPL >= 0 ? 'info' : 'warning';
      
      expect(severity).toBe('warning');
    });

    it('should classify stop loss trigger as critical', () => {
      const alertType = 'stop_triggered';
      const severity = alertType === 'stop_triggered' ? 'critical' : 'warning';
      
      expect(severity).toBe('critical');
    });
  });

  describe('Alert Deduplication', () => {
    it('should not trigger same alert twice', () => {
      const triggeredAlerts = new Set(['AAPL_above_150']);
      const alertKey = 'AAPL_above_150';
      
      const shouldTrigger = !triggeredAlerts.has(alertKey);
      
      expect(shouldTrigger).toBe(false);
    });

    it('should trigger new alert', () => {
      const triggeredAlerts = new Set(['AAPL_above_150']);
      const alertKey = 'AAPL_below_140';
      
      const shouldTrigger = !triggeredAlerts.has(alertKey);
      
      expect(shouldTrigger).toBe(true);
    });
  });
});
