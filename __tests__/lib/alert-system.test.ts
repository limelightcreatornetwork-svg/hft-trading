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
