/**
 * Tests for Automation API Routes: Alerts, Monitor, and Order Queue
 *
 * Covers:
 *   - /api/automation/alerts        (GET, POST)
 *   - /api/automation/monitor       (GET, POST)
 *   - /api/automation/order-queue   (GET, POST)
 *   - /api/automation/order-queue/[id] (GET, DELETE)
 */

import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks - declared before route imports so module resolution picks them up
// ---------------------------------------------------------------------------

jest.mock('../../src/lib/api-auth', () => ({
  withAuth: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

jest.mock('../../src/lib/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
  serializeError: jest.fn((e: unknown) => ({ message: String(e) })),
}));

// Alert system
const mockCreatePriceAlert = jest.fn();
const mockCreatePnLAlert = jest.fn();
const mockCreateVolumeSpikeAlert = jest.fn();
const mockGetActivePriceAlerts = jest.fn();
const mockGetActivePnLAlerts = jest.fn();
const mockGetActiveVolumeSpikeAlerts = jest.fn();
const mockGetActiveAlertsSummary = jest.fn();
const mockGetAlertHistory = jest.fn();

jest.mock('../../src/lib/alert-system', () => ({
  createPriceAlert: mockCreatePriceAlert,
  createPnLAlert: mockCreatePnLAlert,
  createVolumeSpikeAlert: mockCreateVolumeSpikeAlert,
  getActivePriceAlerts: mockGetActivePriceAlerts,
  getActivePnLAlerts: mockGetActivePnLAlerts,
  getActiveVolumeSpikeAlerts: mockGetActiveVolumeSpikeAlerts,
  getActiveAlertsSummary: mockGetActiveAlertsSummary,
  getAlertHistory: mockGetAlertHistory,
}));

// Automation (monitor)
const mockMonitorAndExecute = jest.fn();
const mockGetActiveRules = jest.fn();

jest.mock('../../src/lib/automation', () => ({
  monitorAndExecute: mockMonitorAndExecute,
  getActiveRules: mockGetActiveRules,
}));

// Alpaca
const mockIsMarketOpen = jest.fn();

jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  isMarketOpen: mockIsMarketOpen,
}));

// Order queue
const mockOrderQueue = {
  getStats: jest.fn(),
  getAllOrders: jest.fn(),
  getOrdersByStatus: jest.fn(),
  syncOrderStatuses: jest.fn(),
  processQueue: jest.fn(),
  enqueue: jest.fn(),
  enqueueBatch: jest.fn(),
  clearCompleted: jest.fn(),
  getOrder: jest.fn(),
  cancelOrder: jest.fn(),
};

const mockSubmitMarketOrder = jest.fn();
const mockSubmitLimitOrder = jest.fn();
const mockSubmitStopLossOrder = jest.fn();
const mockSubmitBracketOrder = jest.fn();
const mockCancelAllPendingOrders = jest.fn();

jest.mock('../../src/lib/order-queue', () => ({
  orderQueue: mockOrderQueue,
  submitMarketOrder: mockSubmitMarketOrder,
  submitLimitOrder: mockSubmitLimitOrder,
  submitStopLossOrder: mockSubmitStopLossOrder,
  submitBracketOrder: mockSubmitBracketOrder,
  cancelAllPendingOrders: mockCancelAllPendingOrders,
  QueuedOrderStatus: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    SUBMITTED: 'submitted',
    FILLED: 'filled',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  },
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import { GET, POST } from '../../src/app/api/automation/alerts/route';
import { GET as getMonitor, POST as postMonitor } from '../../src/app/api/automation/monitor/route';
import { GET as getQueue, POST as postQueue } from '../../src/app/api/automation/order-queue/route';
import { GET as getQueueOrder, DELETE as deleteQueueOrder } from '../../src/app/api/automation/order-queue/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createGetRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function createPostRequest(url: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function createDeleteRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Automation Alerts, Monitor, and Order Queue API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Alerts - GET
  // =========================================================================

  describe('GET /api/automation/alerts', () => {
    it('should return summary and all alert types by default', async () => {
      const summary = { totalActive: 5, priceAlerts: 2, pnlAlerts: 1, volumeAlerts: 2 };
      const priceAlerts = [{ id: 'pa1', symbol: 'AAPL', alertType: 'PRICE_ABOVE' }];
      const pnlAlerts = [{ id: 'pnl1', alertType: 'PNL_ABOVE' }];
      const volumeAlerts = [{ id: 'va1', symbol: 'TSLA' }];

      mockGetActiveAlertsSummary.mockReturnValue(summary);
      mockGetActivePriceAlerts.mockReturnValue(priceAlerts);
      mockGetActivePnLAlerts.mockReturnValue(pnlAlerts);
      mockGetActiveVolumeSpikeAlerts.mockReturnValue(volumeAlerts);

      const response = await GET(createGetRequest('http://localhost/api/automation/alerts'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.summary).toEqual(summary);
      expect(json.data.priceAlerts).toEqual(priceAlerts);
      expect(json.data.pnlAlerts).toEqual(pnlAlerts);
      expect(json.data.volumeAlerts).toEqual(volumeAlerts);
    });

    it('should filter to price alerts only when type=price', async () => {
      const summary = { totalActive: 2 };
      mockGetActiveAlertsSummary.mockReturnValue(summary);
      mockGetActivePriceAlerts.mockReturnValue([{ id: 'pa1' }]);

      const response = await GET(createGetRequest('http://localhost/api/automation/alerts?type=price'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.priceAlerts).toBeDefined();
      expect(json.data.pnlAlerts).toBeUndefined();
      expect(json.data.volumeAlerts).toBeUndefined();
      expect(mockGetActivePnLAlerts).not.toHaveBeenCalled();
      expect(mockGetActiveVolumeSpikeAlerts).not.toHaveBeenCalled();
    });

    it('should filter to pnl alerts only when type=pnl', async () => {
      mockGetActiveAlertsSummary.mockReturnValue({ totalActive: 1 });
      mockGetActivePnLAlerts.mockReturnValue([{ id: 'pnl1' }]);

      const response = await GET(createGetRequest('http://localhost/api/automation/alerts?type=pnl'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.pnlAlerts).toBeDefined();
      expect(json.data.priceAlerts).toBeUndefined();
      expect(json.data.volumeAlerts).toBeUndefined();
      expect(mockGetActivePriceAlerts).not.toHaveBeenCalled();
      expect(mockGetActiveVolumeSpikeAlerts).not.toHaveBeenCalled();
    });

    it('should filter to volume alerts only when type=volume', async () => {
      mockGetActiveAlertsSummary.mockReturnValue({ totalActive: 1 });
      mockGetActiveVolumeSpikeAlerts.mockReturnValue([{ id: 'va1' }]);

      const response = await GET(createGetRequest('http://localhost/api/automation/alerts?type=volume'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.volumeAlerts).toBeDefined();
      expect(json.data.priceAlerts).toBeUndefined();
      expect(json.data.pnlAlerts).toBeUndefined();
    });

    it('should pass symbol filter to alert getters', async () => {
      mockGetActiveAlertsSummary.mockReturnValue({ totalActive: 0 });
      mockGetActivePriceAlerts.mockReturnValue([]);
      mockGetActivePnLAlerts.mockReturnValue([]);
      mockGetActiveVolumeSpikeAlerts.mockReturnValue([]);

      await GET(createGetRequest('http://localhost/api/automation/alerts?symbol=AAPL'));

      expect(mockGetActivePriceAlerts).toHaveBeenCalledWith('AAPL');
      expect(mockGetActivePnLAlerts).toHaveBeenCalledWith('AAPL');
      expect(mockGetActiveVolumeSpikeAlerts).toHaveBeenCalledWith('AAPL');
    });

    it('should return alert history when history=true', async () => {
      const historyData = [
        { id: 'h1', symbol: 'AAPL', triggeredAt: '2026-01-15T10:00:00Z' },
        { id: 'h2', symbol: 'TSLA', triggeredAt: '2026-01-15T11:00:00Z' },
      ];
      mockGetAlertHistory.mockResolvedValue(historyData);

      const response = await GET(createGetRequest('http://localhost/api/automation/alerts?history=true'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.alerts).toEqual(historyData);
      expect(mockGetAlertHistory).toHaveBeenCalledWith({
        symbol: undefined,
        type: undefined,
        limit: 50,
      });
      expect(mockGetActiveAlertsSummary).not.toHaveBeenCalled();
    });

    it('should pass limit and filters to getAlertHistory', async () => {
      mockGetAlertHistory.mockResolvedValue([]);

      await GET(createGetRequest('http://localhost/api/automation/alerts?history=true&limit=10&symbol=MSFT&type=price'));

      expect(mockGetAlertHistory).toHaveBeenCalledWith({
        symbol: 'MSFT',
        type: 'price',
        limit: 10,
      });
    });

    it('should pass undefined symbol when no symbol query param is set', async () => {
      mockGetActiveAlertsSummary.mockReturnValue({});
      mockGetActivePriceAlerts.mockReturnValue([]);
      mockGetActivePnLAlerts.mockReturnValue([]);
      mockGetActiveVolumeSpikeAlerts.mockReturnValue([]);

      await GET(createGetRequest('http://localhost/api/automation/alerts'));

      expect(mockGetActivePriceAlerts).toHaveBeenCalledWith(undefined);
      expect(mockGetActivePnLAlerts).toHaveBeenCalledWith(undefined);
      expect(mockGetActiveVolumeSpikeAlerts).toHaveBeenCalledWith(undefined);
    });
  });

  // =========================================================================
  // Alerts - POST
  // =========================================================================

  describe('POST /api/automation/alerts', () => {
    it('should create a price alert', async () => {
      const createdAlert = { id: 'alert-1', alertType: 'PRICE_ABOVE', symbol: 'AAPL' };
      mockCreatePriceAlert.mockResolvedValue(createdAlert);

      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'price',
        symbol: 'AAPL',
        type: 'PRICE_ABOVE',
        targetValue: 200,
        basePrice: 190,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(createdAlert);
      expect(mockCreatePriceAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          alertType: 'PRICE_ABOVE',
          targetValue: 200,
          basePrice: 190,
        })
      );
    });

    it('should create a pnl alert', async () => {
      const createdAlert = { id: 'alert-2', alertType: 'PNL_ABOVE' };
      mockCreatePnLAlert.mockResolvedValue(createdAlert);

      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'pnl',
        type: 'PNL_ABOVE',
        targetValue: 1000,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(createdAlert);
      expect(mockCreatePnLAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          alertType: 'PNL_ABOVE',
          targetValue: 1000,
        })
      );
    });

    it('should create a pnl alert with optional symbol', async () => {
      mockCreatePnLAlert.mockResolvedValue({ id: 'alert-3' });

      await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'pnl',
        symbol: 'AAPL',
        type: 'PNL_PCT_ABOVE',
        targetValue: 5,
      }));

      expect(mockCreatePnLAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          alertType: 'PNL_PCT_ABOVE',
          targetValue: 5,
        })
      );
    });

    it('should create a volume spike alert', async () => {
      const createdAlert = { id: 'alert-4', symbol: 'TSLA', multiplier: 3 };
      mockCreateVolumeSpikeAlert.mockResolvedValue(createdAlert);

      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'volume',
        symbol: 'TSLA',
        multiplier: 3,
        averagePeriod: 20,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(createdAlert);
      expect(mockCreateVolumeSpikeAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'TSLA',
          multiplier: 3,
          averagePeriod: 20,
        })
      );
    });

    it('should return 400 when alertType is missing', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        symbol: 'AAPL',
        targetValue: 200,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('alertType is required');
    });

    it('should return 400 for price alert missing required fields', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'price',
        symbol: 'AAPL',
        // missing type and targetValue
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('symbol, type');
    });

    it('should return 400 for pnl alert missing type', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'pnl',
        targetValue: 1000,
        // missing type
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('type');
    });

    it('should return 400 for volume alert missing symbol', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'volume',
        multiplier: 3,
        // missing symbol
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('symbol and multiplier');
    });

    it('should return 400 for volume alert missing multiplier', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'volume',
        symbol: 'AAPL',
        // missing multiplier
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('symbol and multiplier');
    });

    it('should return 400 for unknown alertType', async () => {
      const response = await POST(createPostRequest('http://localhost/api/automation/alerts', {
        alertType: 'unknown',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown alertType');
    });
  });

  // =========================================================================
  // Monitor - GET
  // =========================================================================

  describe('GET /api/automation/monitor', () => {
    it('should return monitoring status with rules preview', async () => {
      mockIsMarketOpen.mockResolvedValue(true);
      const activeRules = [
        {
          id: 'r1',
          symbol: 'AAPL',
          ruleType: 'STOP_LOSS',
          triggerType: 'PRICE_BELOW',
          triggerValue: 140,
          currentPrice: 150,
          distanceToTriggerPct: 6.67,
        },
        {
          id: 'r2',
          symbol: 'TSLA',
          ruleType: 'TAKE_PROFIT',
          triggerType: 'PRICE_ABOVE',
          triggerValue: 300,
          currentPrice: 250,
          distanceToTriggerPct: 20.0,
        },
      ];
      mockGetActiveRules.mockResolvedValue(activeRules);

      const response = await getMonitor(createGetRequest('http://localhost/api/automation/monitor'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.marketOpen).toBe(true);
      expect(json.data.activeRulesCount).toBe(2);
      expect(json.data.rulesPreview).toHaveLength(2);
      expect(json.data.rulesPreview[0].id).toBe('r1');
      expect(json.data.rulesPreview[0].symbol).toBe('AAPL');
      expect(json.data.rulesPreview[0].distanceToTriggerPct).toBe('6.67%');
      expect(json.data.rulesPreview[1].distanceToTriggerPct).toBe('20.00%');
    });

    it('should limit rules preview to first 5 rules', async () => {
      mockIsMarketOpen.mockResolvedValue(false);
      const manyRules = Array.from({ length: 10 }, (_, i) => ({
        id: `r${i}`,
        symbol: `SYM${i}`,
        ruleType: 'STOP_LOSS',
        triggerType: 'PRICE_BELOW',
        triggerValue: 100,
        currentPrice: 110,
        distanceToTriggerPct: 10.0,
      }));
      mockGetActiveRules.mockResolvedValue(manyRules);

      const response = await getMonitor(createGetRequest('http://localhost/api/automation/monitor'));
      const json = await response.json();

      expect(json.data.activeRulesCount).toBe(10);
      expect(json.data.rulesPreview).toHaveLength(5);
    });

    it('should return null for lastMonitorRun and lastResult on first call', async () => {
      mockIsMarketOpen.mockResolvedValue(true);
      mockGetActiveRules.mockResolvedValue([]);

      const response = await getMonitor(createGetRequest('http://localhost/api/automation/monitor'));
      const json = await response.json();

      expect(json.data.lastMonitorRun).toBeNull();
      expect(json.data.lastResult).toBeNull();
    });
  });

  // =========================================================================
  // Monitor - POST
  // =========================================================================

  describe('POST /api/automation/monitor', () => {
    it('should skip when market is closed and force is not set', async () => {
      mockIsMarketOpen.mockResolvedValue(false);

      const response = await postMonitor(createPostRequest('http://localhost/api/automation/monitor', {}));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(true);
      expect(json.data.reason).toBe('Market is closed');
      expect(json.data.marketOpen).toBe(false);
      expect(mockMonitorAndExecute).not.toHaveBeenCalled();
    });

    it('should run monitor when market is open', async () => {
      mockIsMarketOpen.mockResolvedValue(true);
      const monitorResult = { rulesChecked: 5, triggered: 2, errors: [] };
      mockMonitorAndExecute.mockResolvedValue(monitorResult);

      const response = await postMonitor(createPostRequest('http://localhost/api/automation/monitor', {}));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.rulesChecked).toBe(5);
      expect(json.data.triggered).toBe(2);
      expect(json.data.marketOpen).toBe(true);
      expect(json.data.timestamp).toBeDefined();
      expect(mockMonitorAndExecute).toHaveBeenCalled();
    });

    it('should run monitor when force=true even if market is closed', async () => {
      mockIsMarketOpen.mockResolvedValue(false);
      const monitorResult = { rulesChecked: 3, triggered: 0, errors: [] };
      mockMonitorAndExecute.mockResolvedValue(monitorResult);

      const response = await postMonitor(createPostRequest('http://localhost/api/automation/monitor', { force: true }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.skipped).toBeUndefined();
      expect(json.data.rulesChecked).toBe(3);
      expect(json.data.marketOpen).toBe(false);
      expect(mockMonitorAndExecute).toHaveBeenCalled();
    });

    it('should handle empty body gracefully', async () => {
      mockIsMarketOpen.mockResolvedValue(false);

      const request = new NextRequest('http://localhost/api/automation/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const response = await postMonitor(request);
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(true);
    });
  });

  // =========================================================================
  // Order Queue - GET
  // =========================================================================

  describe('GET /api/automation/order-queue', () => {
    const mockStats = { pending: 2, processing: 0, submitted: 3, failed: 1, total: 6 };
    const mockOrders = [
      {
        id: 'oq-1',
        order: { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', limit_price: undefined, stop_price: undefined },
        priority: 'normal',
        status: 'pending',
        brokerOrderId: null,
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        filledQty: 0,
        avgFillPrice: null,
        createdAt: '2026-01-15T10:00:00Z',
        submittedAt: null,
        completedAt: null,
        metadata: {},
      },
    ];

    it('should return stats and all orders by default', async () => {
      mockOrderQueue.getStats.mockReturnValue(mockStats);
      mockOrderQueue.getAllOrders.mockReturnValue(mockOrders);

      const response = await getQueue(createGetRequest('http://localhost/api/automation/order-queue'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.stats).toEqual(mockStats);
      expect(json.data.orders).toHaveLength(1);
      expect(json.data.orders[0].id).toBe('oq-1');
      expect(json.data.orders[0].symbol).toBe('AAPL');
      expect(json.data.orders[0].qty).toBe(10);
      expect(json.data.orders[0].side).toBe('buy');
      expect(mockOrderQueue.getAllOrders).toHaveBeenCalled();
      expect(mockOrderQueue.getOrdersByStatus).not.toHaveBeenCalled();
    });

    it('should filter by status when provided', async () => {
      mockOrderQueue.getStats.mockReturnValue(mockStats);
      mockOrderQueue.getOrdersByStatus.mockReturnValue(mockOrders);

      const response = await getQueue(createGetRequest('http://localhost/api/automation/order-queue?status=pending'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockOrderQueue.getOrdersByStatus).toHaveBeenCalledWith('pending');
      expect(mockOrderQueue.getAllOrders).not.toHaveBeenCalled();
    });

    it('should sync order statuses when sync=true', async () => {
      mockOrderQueue.syncOrderStatuses.mockResolvedValue(2);
      mockOrderQueue.getStats.mockReturnValue(mockStats);
      mockOrderQueue.getAllOrders.mockReturnValue([]);

      await getQueue(createGetRequest('http://localhost/api/automation/order-queue?sync=true'));

      expect(mockOrderQueue.syncOrderStatuses).toHaveBeenCalled();
    });

    it('should not sync order statuses when sync is not set', async () => {
      mockOrderQueue.getStats.mockReturnValue(mockStats);
      mockOrderQueue.getAllOrders.mockReturnValue([]);

      await getQueue(createGetRequest('http://localhost/api/automation/order-queue'));

      expect(mockOrderQueue.syncOrderStatuses).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Order Queue - POST
  // =========================================================================

  describe('POST /api/automation/order-queue', () => {
    it('should process queue with action=process', async () => {
      const processResult = { processed: 3, submitted: 2, failed: 1, errors: [] };
      mockOrderQueue.processQueue.mockResolvedValue(processResult);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'process',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(processResult);
      expect(mockOrderQueue.processQueue).toHaveBeenCalled();
    });

    it('should enqueue a single order with action=enqueue', async () => {
      const queuedOrder = { id: 'oq-new', status: 'pending' };
      mockOrderQueue.enqueue.mockResolvedValue(queuedOrder);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'enqueue',
        order: { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market' },
        priority: 'high',
        maxRetries: 5,
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(queuedOrder);
      expect(mockOrderQueue.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' }),
        expect.objectContaining({ priority: 'high', maxRetries: 5 })
      );
    });

    it('should return 400 for enqueue with missing order fields', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'enqueue',
        order: { symbol: 'AAPL' },
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('symbol, qty, side, and type');
    });

    it('should return 400 for enqueue with no order', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'enqueue',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should batch enqueue orders with action=batch', async () => {
      const batchResult = [{ id: 'b1' }, { id: 'b2' }];
      mockOrderQueue.enqueueBatch.mockResolvedValue(batchResult);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'batch',
        orders: [
          { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market' },
          { symbol: 'TSLA', qty: 5, side: 'sell', type: 'limit', limit_price: 250 },
        ],
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.count).toBe(2);
      expect(json.data.orders).toEqual(batchResult);
      expect(mockOrderQueue.enqueueBatch).toHaveBeenCalled();
    });

    it('should return 400 for batch with empty orders array', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'batch',
        orders: [],
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Orders array is required');
    });

    it('should return 400 for batch with missing orders', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'batch',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should submit a market order with action=market', async () => {
      const marketOrder = { id: 'mo-1', status: 'pending' };
      mockSubmitMarketOrder.mockResolvedValue(marketOrder);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'market',
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        priority: 'high',
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(marketOrder);
      expect(mockSubmitMarketOrder).toHaveBeenCalledWith('AAPL', 10, 'buy', 'high');
    });

    it('should return 400 for market order missing required fields', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'market',
        symbol: 'AAPL',
        // missing qty and side
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('symbol, qty, and side');
    });

    it('should submit a limit order with action=limit', async () => {
      const limitOrder = { id: 'lo-1', status: 'pending' };
      mockSubmitLimitOrder.mockResolvedValue(limitOrder);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'limit',
        symbol: 'MSFT',
        qty: 5,
        side: 'buy',
        limitPrice: 400,
        priority: 'normal',
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(limitOrder);
      expect(mockSubmitLimitOrder).toHaveBeenCalledWith('MSFT', 5, 'buy', 400, 'normal');
    });

    it('should return 400 for limit order missing limitPrice', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'limit',
        symbol: 'MSFT',
        qty: 5,
        side: 'buy',
        // missing limitPrice
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('limitPrice');
    });

    it('should submit a stop-loss order with action=stop-loss', async () => {
      const stopOrder = { id: 'sl-1', status: 'pending' };
      mockSubmitStopLossOrder.mockResolvedValue(stopOrder);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'stop-loss',
        symbol: 'AAPL',
        qty: 10,
        stopPrice: 140,
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(stopOrder);
      expect(mockSubmitStopLossOrder).toHaveBeenCalledWith('AAPL', 10, 140);
    });

    it('should return 400 for stop-loss order missing stopPrice', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'stop-loss',
        symbol: 'AAPL',
        qty: 10,
        // missing stopPrice
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('stopPrice');
    });

    it('should submit a bracket order with action=bracket', async () => {
      const bracketResult = { entry: { id: 'e1' }, stopLoss: { id: 'sl1' }, takeProfit: { id: 'tp1' } };
      mockSubmitBracketOrder.mockResolvedValue(bracketResult);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'bracket',
        symbol: 'TSLA',
        qty: 5,
        side: 'buy',
        entryPrice: 250,
        stopPrice: 240,
        takeProfitPrice: 280,
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toEqual(bracketResult);
      expect(mockSubmitBracketOrder).toHaveBeenCalledWith('TSLA', 5, 'buy', 250, 240, 280);
    });

    it('should return 400 for bracket order missing fields', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'bracket',
        symbol: 'TSLA',
        qty: 5,
        side: 'buy',
        entryPrice: 250,
        // missing stopPrice and takeProfitPrice
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('stopPrice');
    });

    it('should cancel all pending orders with action=cancel-all', async () => {
      mockCancelAllPendingOrders.mockResolvedValue(3);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'cancel-all',
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.cancelled).toBe(3);
      expect(mockCancelAllPendingOrders).toHaveBeenCalled();
    });

    it('should clear completed orders with action=clear-completed', async () => {
      mockOrderQueue.clearCompleted.mockReturnValue(5);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'clear-completed',
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.cleared).toBe(5);
      expect(mockOrderQueue.clearCompleted).toHaveBeenCalled();
    });

    it('should sync order statuses with action=sync', async () => {
      mockOrderQueue.syncOrderStatuses.mockResolvedValue(4);

      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'sync',
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.updated).toBe(4);
      expect(mockOrderQueue.syncOrderStatuses).toHaveBeenCalled();
    });

    it('should return 400 for unknown action', async () => {
      const response = await postQueue(createPostRequest('http://localhost/api/automation/order-queue', {
        action: 'invalid-action',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown action');
    });
  });

  // =========================================================================
  // Order Queue - [id] GET
  // =========================================================================

  describe('GET /api/automation/order-queue/[id]', () => {
    it('should return order details for a valid id', async () => {
      const order = {
        id: 'order-1',
        order: { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', limit_price: undefined, stop_price: undefined },
        priority: 'normal',
        status: 'submitted',
        brokerOrderId: 'broker-123',
        retryCount: 0,
        maxRetries: 3,
        lastError: null,
        filledQty: 5,
        avgFillPrice: 150.25,
        createdAt: '2026-01-15T10:00:00Z',
        submittedAt: '2026-01-15T10:00:01Z',
        completedAt: null,
        metadata: { source: 'automation' },
      };
      mockOrderQueue.getOrder.mockReturnValue(order);

      const context = { params: Promise.resolve({ id: 'order-1' }) };
      const response = await getQueueOrder(
        createGetRequest('http://localhost/api/automation/order-queue/order-1'),
        context
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('order-1');
      expect(json.data.symbol).toBe('AAPL');
      expect(json.data.qty).toBe(10);
      expect(json.data.side).toBe('buy');
      expect(json.data.brokerOrderId).toBe('broker-123');
      expect(json.data.filledQty).toBe(5);
      expect(json.data.avgFillPrice).toBe(150.25);
      expect(json.data.metadata).toEqual({ source: 'automation' });
      expect(mockOrderQueue.getOrder).toHaveBeenCalledWith('order-1');
    });

    it('should return 404 when order is not found', async () => {
      mockOrderQueue.getOrder.mockReturnValue(null);

      const context = { params: Promise.resolve({ id: 'nonexistent' }) };
      const response = await getQueueOrder(
        createGetRequest('http://localhost/api/automation/order-queue/nonexistent'),
        context
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Order not found');
    });
  });

  // =========================================================================
  // Order Queue - [id] DELETE
  // =========================================================================

  describe('DELETE /api/automation/order-queue/[id]', () => {
    it('should cancel an order successfully', async () => {
      mockOrderQueue.cancelOrder.mockResolvedValue(true);

      const context = { params: Promise.resolve({ id: 'order-1' }) };
      const response = await deleteQueueOrder(
        createDeleteRequest('http://localhost/api/automation/order-queue/order-1'),
        context
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('cancelled');
      expect(mockOrderQueue.cancelOrder).toHaveBeenCalledWith('order-1');
    });

    it('should return 400 when order cannot be cancelled', async () => {
      mockOrderQueue.cancelOrder.mockResolvedValue(false);

      const context = { params: Promise.resolve({ id: 'order-2' }) };
      const response = await deleteQueueOrder(
        createDeleteRequest('http://localhost/api/automation/order-queue/order-2'),
        context
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Could not cancel order');
    });
  });
});
