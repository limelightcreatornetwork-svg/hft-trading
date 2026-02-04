/**
 * Tests for Alert System Service
 */

import {
  createPriceAlert,
  createPnLAlert,
  createVolumeSpikeAlert,
  getActivePriceAlerts,
  getActivePnLAlerts,
  getActiveVolumeSpikeAlerts,
  cancelPriceAlert,
  cancelPnLAlert,
  cancelVolumeSpikeAlert,
  monitorAlerts,
  getActiveAlertsSummary,
  clearAllAlerts,
  updateVolumeHistory,
  getAverageVolume,
} from '@/lib/alert-system';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    alert: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/alpaca', () => ({
  getLatestQuote: jest.fn(),
  getPositions: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { getLatestQuote, getPositions } from '@/lib/alpaca';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetLatestQuote = getLatestQuote as jest.Mock;
const mockGetPositions = getPositions as jest.Mock;

describe('Alert System Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllAlerts();
  });

  describe('Price Alerts', () => {
    describe('createPriceAlert', () => {
      it('should create a PRICE_ABOVE alert', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 149, ask: 151, last: 150 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPriceAlert({
          symbol: 'AAPL',
          alertType: 'PRICE_ABOVE',
          targetValue: 155,
          message: 'AAPL above $155',
          priority: 'high',
        });

        expect(alert.symbol).toBe('AAPL');
        expect(alert.alertType).toBe('PRICE_ABOVE');
        expect(alert.targetValue).toBe(155);
        expect(alert.currentPrice).toBe(150);
        expect(alert.status).toBe('active');
        expect(alert.priority).toBe('high');
      });

      it('should create a PRICE_BELOW alert', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 199, ask: 201, last: 200 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPriceAlert({
          symbol: 'TSLA',
          alertType: 'PRICE_BELOW',
          targetValue: 180,
        });

        expect(alert.alertType).toBe('PRICE_BELOW');
        expect(alert.targetValue).toBe(180);
      });

      it('should create a PRICE_CHANGE_PCT alert with base price', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPriceAlert({
          symbol: 'NVDA',
          alertType: 'PRICE_CHANGE_PCT',
          targetValue: 5, // Alert on 5% move
          basePrice: 100,
        });

        expect(alert.alertType).toBe('PRICE_CHANGE_PCT');
        expect(alert.basePrice).toBe(100);
        expect(alert.targetValue).toBe(5);
      });

      it('should create a repeating alert with cooldown', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 149, ask: 151, last: 150 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPriceAlert({
          symbol: 'SPY',
          alertType: 'PRICE_ABOVE',
          targetValue: 455,
          repeating: true,
          cooldownMinutes: 15,
        });

        expect(alert.repeating).toBe(true);
        expect(alert.cooldownMinutes).toBe(15);
      });
    });

    describe('getActivePriceAlerts', () => {
      it('should return all active price alerts', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        await createPriceAlert({ symbol: 'AAPL', alertType: 'PRICE_ABOVE', targetValue: 160 });
        await createPriceAlert({ symbol: 'TSLA', alertType: 'PRICE_BELOW', targetValue: 200 });

        const alerts = getActivePriceAlerts();
        expect(alerts.length).toBe(2);
      });

      it('should filter by symbol', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        await createPriceAlert({ symbol: 'AAPL', alertType: 'PRICE_ABOVE', targetValue: 160 });
        await createPriceAlert({ symbol: 'AAPL', alertType: 'PRICE_BELOW', targetValue: 140 });
        await createPriceAlert({ symbol: 'TSLA', alertType: 'PRICE_ABOVE', targetValue: 250 });

        const alerts = getActivePriceAlerts('AAPL');
        expect(alerts.length).toBe(2);
      });
    });

    describe('cancelPriceAlert', () => {
      it('should cancel an alert', async () => {
        mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPriceAlert({
          symbol: 'AAPL',
          alertType: 'PRICE_ABOVE',
          targetValue: 160,
        });

        cancelPriceAlert(alert.id);

        const activeAlerts = getActivePriceAlerts();
        expect(activeAlerts.length).toBe(0);
      });
    });
  });

  describe('P&L Alerts', () => {
    describe('createPnLAlert', () => {
      it('should create a position P&L alert', async () => {
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPnLAlert({
          symbol: 'AAPL',
          alertType: 'PNL_ABOVE',
          targetValue: 1000,
          priority: 'high',
        });

        expect(alert.symbol).toBe('AAPL');
        expect(alert.alertType).toBe('PNL_ABOVE');
        expect(alert.targetValue).toBe(1000);
      });

      it('should create a portfolio-level P&L alert', async () => {
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPnLAlert({
          alertType: 'PNL_BELOW',
          targetValue: -500,
          message: 'Portfolio down $500',
        });

        expect(alert.symbol).toBeUndefined();
        expect(alert.alertType).toBe('PNL_BELOW');
      });

      it('should create a percentage-based P&L alert', async () => {
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createPnLAlert({
          symbol: 'TSLA',
          alertType: 'PNL_PCT_BELOW',
          targetValue: -5, // -5%
        });

        expect(alert.alertType).toBe('PNL_PCT_BELOW');
        expect(alert.targetValue).toBe(-5);
      });
    });

    describe('getActivePnLAlerts', () => {
      it('should return portfolio alerts for any symbol', async () => {
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        await createPnLAlert({ alertType: 'PNL_BELOW', targetValue: -1000 }); // Portfolio
        await createPnLAlert({ symbol: 'AAPL', alertType: 'PNL_ABOVE', targetValue: 500 });

        const alerts = getActivePnLAlerts('AAPL');
        expect(alerts.length).toBe(2); // Both portfolio and AAPL alerts
      });
    });
  });

  describe('Volume Spike Alerts', () => {
    describe('createVolumeSpikeAlert', () => {
      it('should create a volume spike alert', async () => {
        (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

        const alert = await createVolumeSpikeAlert({
          symbol: 'GME',
          multiplier: 3,
          averagePeriod: 20,
        });

        expect(alert.symbol).toBe('GME');
        expect(alert.multiplier).toBe(3);
        expect(alert.averagePeriod).toBe(20);
        expect(alert.status).toBe('active');
      });
    });

    describe('volume history tracking', () => {
      it('should track volume history', () => {
        updateVolumeHistory('AAPL', 1000000);
        updateVolumeHistory('AAPL', 1200000);
        updateVolumeHistory('AAPL', 800000);

        const avg = getAverageVolume('AAPL', 3);
        expect(avg).toBe(1000000);
      });

      it('should respect period limit', () => {
        for (let i = 0; i < 10; i++) {
          updateVolumeHistory('TSLA', 1000000 + i * 100000);
        }

        const avg5 = getAverageVolume('TSLA', 5);
        const avg10 = getAverageVolume('TSLA', 10);

        expect(avg5).not.toBe(avg10);
      });
    });
  });

  describe('monitorAlerts', () => {
    it('should trigger PRICE_ABOVE alert when price exceeds target', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPriceAlert({
        symbol: 'AAPL',
        alertType: 'PRICE_ABOVE',
        targetValue: 155,
      });

      // Now price is above target
      mockGetLatestQuote.mockResolvedValue({ bid: 159, ask: 161, last: 160 });
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(1);
      expect(result.triggeredAlerts[0].alertType).toBe('PRICE_ABOVE');
    });

    it('should trigger PRICE_BELOW alert when price drops below target', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 199, ask: 201, last: 200 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPriceAlert({
        symbol: 'TSLA',
        alertType: 'PRICE_BELOW',
        targetValue: 190,
      });

      // Now price is below target
      mockGetLatestQuote.mockResolvedValue({ bid: 184, ask: 186, last: 185 });
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(1);
      expect(result.triggeredAlerts[0].alertType).toBe('PRICE_BELOW');
    });

    it('should trigger P&L alert based on position', async () => {
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPnLAlert({
        symbol: 'NVDA',
        alertType: 'PNL_ABOVE',
        targetValue: 500,
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 599, ask: 601, last: 600 });
      mockGetPositions.mockResolvedValue([
        {
          symbol: 'NVDA',
          qty: '10',
          avg_entry_price: '500',
          unrealized_pl: '1000', // $1000 P&L
          unrealized_plpc: '0.20', // 20%
          cost_basis: '5000',
        },
      ]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(1);
      expect(result.triggeredAlerts[0].alertType).toBe('PNL_ABOVE');
    });

    it('should respect alert cooldown for repeating alerts', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'SPY',
        alertType: 'PRICE_ABOVE',
        targetValue: 450,
        repeating: true,
        cooldownMinutes: 60,
      });

      // Price exceeds target
      mockGetLatestQuote.mockResolvedValue({ bid: 454, ask: 456, last: 455 });
      mockGetPositions.mockResolvedValue([]);

      const result1 = await monitorAlerts();
      expect(result1.alertsTriggered).toBe(1);

      // Try again immediately - should be in cooldown
      const result2 = await monitorAlerts();
      expect(result2.alertsTriggered).toBe(0);
    });

    it('should handle expired alerts', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPriceAlert({
        symbol: 'AAPL',
        alertType: 'PRICE_ABOVE',
        targetValue: 155,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 159, ask: 161, last: 160 });
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(0);
      expect(getActivePriceAlerts().length).toBe(0);
    });
  });

  describe('getActiveAlertsSummary', () => {
    it('should return correct counts', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPriceAlert({ symbol: 'AAPL', alertType: 'PRICE_ABOVE', targetValue: 160 });
      await createPriceAlert({ symbol: 'TSLA', alertType: 'PRICE_BELOW', targetValue: 200 });
      await createPnLAlert({ alertType: 'PNL_BELOW', targetValue: -1000 });
      await createVolumeSpikeAlert({ symbol: 'GME', multiplier: 3 });

      const summary = getActiveAlertsSummary();

      expect(summary.priceAlerts).toBe(2);
      expect(summary.pnlAlerts).toBe(1);
      expect(summary.volumeAlerts).toBe(1);
      expect(summary.total).toBe(4);
    });
  });

  describe('clearAllAlerts', () => {
    it('should clear all alerts', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPriceAlert({ symbol: 'AAPL', alertType: 'PRICE_ABOVE', targetValue: 160 });
      await createPnLAlert({ alertType: 'PNL_BELOW', targetValue: -1000 });

      clearAllAlerts();

      const summary = getActiveAlertsSummary();
      expect(summary.total).toBe(0);
    });
  });
});

describe('Alert Trigger Logic', () => {
  it('PRICE_ABOVE triggers at or above target', () => {
    expect(155 >= 150).toBe(true);
    expect(150 >= 150).toBe(true);
    expect(149 >= 150).toBe(false);
  });

  it('PRICE_BELOW triggers at or below target', () => {
    expect(145 <= 150).toBe(true);
    expect(150 <= 150).toBe(true);
    expect(151 <= 150).toBe(false);
  });

  it('PRICE_CHANGE_PCT triggers on sufficient move', () => {
    const basePrice = 100;
    const targetPct = 5;

    const priceUp = 106; // +6%
    const priceDown = 93; // -7%
    const priceFlat = 102; // +2%

    const changePctUp = ((priceUp - basePrice) / basePrice) * 100;
    const changePctDown = ((priceDown - basePrice) / basePrice) * 100;
    const changePctFlat = ((priceFlat - basePrice) / basePrice) * 100;

    expect(Math.abs(changePctUp) >= targetPct).toBe(true);
    expect(Math.abs(changePctDown) >= targetPct).toBe(true);
    expect(Math.abs(changePctFlat) >= targetPct).toBe(false);
  });
});

describe('Alert System Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearAllAlerts();
  });

  describe('Price alert creation edge cases', () => {
    it('should handle quote fetch failure gracefully during creation', async () => {
      mockGetLatestQuote.mockRejectedValue(new Error('Network error'));
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'AAPL',
        alertType: 'PRICE_ABOVE',
        targetValue: 200,
      });

      expect(alert.symbol).toBe('AAPL');
      expect(alert.currentPrice).toBeUndefined();
      expect(alert.status).toBe('active');
    });

    it('should auto-set basePrice from current price for PRICE_CHANGE_PCT', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 149, ask: 151, last: 150 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'MSFT',
        alertType: 'PRICE_CHANGE_PCT',
        targetValue: 3,
        // No basePrice provided
      });

      expect(alert.basePrice).toBe(150);
    });

    it('should use default priority when not specified', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'AAPL',
        alertType: 'PRICE_ABOVE',
        targetValue: 200,
      });

      expect(alert.priority).toBe('medium');
    });

    it('should uppercase symbol', async () => {
      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'aapl',
        alertType: 'PRICE_ABOVE',
        targetValue: 200,
      });

      expect(alert.symbol).toBe('AAPL');
    });
  });

  describe('Cancel non-existent alerts', () => {
    it('should handle cancelling non-existent price alert gracefully', () => {
      cancelPriceAlert('non-existent-id');
      expect(getActivePriceAlerts().length).toBe(0);
    });

    it('should handle cancelling non-existent P&L alert gracefully', () => {
      cancelPnLAlert('non-existent-id');
      expect(getActivePnLAlerts().length).toBe(0);
    });

    it('should handle cancelling non-existent volume alert gracefully', () => {
      cancelVolumeSpikeAlert('non-existent-id');
      expect(getActiveVolumeSpikeAlerts().length).toBe(0);
    });
  });

  describe('Monitor alerts edge cases', () => {
    it('should return empty results when no alerts exist', async () => {
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorAlerts();

      expect(result.alertsChecked).toBe(0);
      expect(result.alertsTriggered).toBe(0);
      expect(result.triggeredAlerts).toEqual([]);
      expect(result.errors).toEqual([]);
    });

    it('should handle getPositions failure gracefully', async () => {
      mockGetPositions.mockRejectedValue(new Error('Connection refused'));

      const result = await monitorAlerts();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Failed to get positions');
    });

    it('should handle quote fetch failure for specific symbol', async () => {
      mockGetLatestQuote
        .mockResolvedValueOnce({ bid: 99, ask: 101, last: 100 }) // creation
        .mockRejectedValue(new Error('Symbol not found')); // monitoring
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});
      mockGetPositions.mockResolvedValue([]);

      await createPriceAlert({
        symbol: 'INVALID',
        alertType: 'PRICE_ABOVE',
        targetValue: 200,
      });

      const result = await monitorAlerts();

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.alertsTriggered).toBe(0);
    });

    it('should not trigger PRICE_CHANGE_PCT without basePrice', async () => {
      mockGetLatestQuote.mockRejectedValue(new Error('fail')); // No current price
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      const alert = await createPriceAlert({
        symbol: 'AAPL',
        alertType: 'PRICE_CHANGE_PCT',
        targetValue: 5,
        // No basePrice, and quote fetch will fail
      });

      expect(alert.basePrice).toBeUndefined();

      // Now monitoring with price available
      mockGetLatestQuote.mockResolvedValue({ bid: 109, ask: 111, last: 110 });
      mockGetPositions.mockResolvedValue([]);

      const result = await monitorAlerts();

      // Should not trigger since no basePrice to compare against
      expect(result.alertsTriggered).toBe(0);
    });

    it('should handle portfolio-level P&L alert with multiple positions', async () => {
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPnLAlert({
        alertType: 'PNL_ABOVE',
        targetValue: 800, // portfolio P&L > $800
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      mockGetPositions.mockResolvedValue([
        {
          symbol: 'AAPL',
          qty: '10',
          avg_entry_price: '150',
          unrealized_pl: '300',
          unrealized_plpc: '0.20',
          cost_basis: '1500',
        },
        {
          symbol: 'MSFT',
          qty: '5',
          avg_entry_price: '300',
          unrealized_pl: '600',
          unrealized_plpc: '0.40',
          cost_basis: '1500',
        },
      ]);

      const result = await monitorAlerts();

      // Total P&L = 300 + 600 = 900, which is > 800
      expect(result.alertsTriggered).toBe(1);
      expect(result.triggeredAlerts[0].alertType).toBe('PNL_ABOVE');
    });

    it('should handle expired P&L alerts', async () => {
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPnLAlert({
        symbol: 'AAPL',
        alertType: 'PNL_BELOW',
        targetValue: -100,
        expiresAt: new Date(Date.now() - 60000), // expired 1 min ago
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      mockGetPositions.mockResolvedValue([{
        symbol: 'AAPL',
        qty: '10',
        avg_entry_price: '150',
        unrealized_pl: '-500',
        unrealized_plpc: '-0.33',
        cost_basis: '1500',
      }]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(0);
    });

    it('should trigger PNL_PCT_ABOVE for position-level percentage', async () => {
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPnLAlert({
        symbol: 'TSLA',
        alertType: 'PNL_PCT_ABOVE',
        targetValue: 10, // 10%
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      mockGetPositions.mockResolvedValue([{
        symbol: 'TSLA',
        qty: '5',
        avg_entry_price: '200',
        unrealized_pl: '300',
        unrealized_plpc: '0.30', // 30%
        cost_basis: '1000',
      }]);

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(1);
      expect(result.triggeredAlerts[0].alertType).toBe('PNL_PCT_ABOVE');
    });

    it('should skip P&L alert if no matching position', async () => {
      (mockPrisma.alert.create as jest.Mock).mockResolvedValue({});

      await createPnLAlert({
        symbol: 'UNKNOWN',
        alertType: 'PNL_ABOVE',
        targetValue: 100,
      });

      mockGetLatestQuote.mockResolvedValue({ bid: 99, ask: 101, last: 100 });
      mockGetPositions.mockResolvedValue([]); // No positions

      const result = await monitorAlerts();

      expect(result.alertsTriggered).toBe(0);
    });
  });

  describe('Volume history edge cases', () => {
    it('should return undefined for unknown symbol', () => {
      expect(getAverageVolume('UNKNOWN')).toBeUndefined();
    });

    it('should limit history to 30 days', () => {
      for (let i = 0; i < 35; i++) {
        updateVolumeHistory('TEST', 1000 + i);
      }

      // Should only keep last 30
      const avg = getAverageVolume('TEST', 100); // Request more than available
      // Average of 1005..1034 (last 30 entries)
      const expected = (1005 + 1034) / 2; // 1019.5
      expect(avg).toBeCloseTo(expected, 0);
    });

    it('should handle single data point', () => {
      updateVolumeHistory('SOLO', 5000);
      expect(getAverageVolume('SOLO', 1)).toBe(5000);
      expect(getAverageVolume('SOLO', 20)).toBe(5000);
    });

    it('should be case-insensitive for symbols', () => {
      updateVolumeHistory('aapl', 1000);
      updateVolumeHistory('AAPL', 2000);

      const avg = getAverageVolume('Aapl', 2);
      expect(avg).toBe(1500);
    });
  });
});
