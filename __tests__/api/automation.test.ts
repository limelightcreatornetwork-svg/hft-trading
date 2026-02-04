/**
 * Tests for Automation API Routes
 *
 * Covers: rules, run, trailing-stop, and scaled-exits endpoints.
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

// Automation (rules)
const mockGetActiveRules = jest.fn();
const mockGetAllRules = jest.fn();
const mockCreateAutomationRule = jest.fn();
const mockCreateStopLossRule = jest.fn();
const mockCreateTakeProfitRule = jest.fn();
const mockCreateLimitOrderRule = jest.fn();
const mockCreateOCORule = jest.fn();
const mockCancelRule = jest.fn();
const mockToggleRule = jest.fn();
const mockMonitorAndExecute = jest.fn();

jest.mock('../../src/lib/automation', () => ({
  getActiveRules: mockGetActiveRules,
  getAllRules: mockGetAllRules,
  createAutomationRule: mockCreateAutomationRule,
  createStopLossRule: mockCreateStopLossRule,
  createTakeProfitRule: mockCreateTakeProfitRule,
  createLimitOrderRule: mockCreateLimitOrderRule,
  createOCORule: mockCreateOCORule,
  cancelRule: mockCancelRule,
  toggleRule: mockToggleRule,
  monitorAndExecute: mockMonitorAndExecute,
  TriggerType: {
    PRICE_ABOVE: 'PRICE_ABOVE',
    PRICE_BELOW: 'PRICE_BELOW',
  },
}));

// Alpaca (market open check)
const mockIsMarketOpen = jest.fn();
jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  isMarketOpen: mockIsMarketOpen,
}));

// Trailing stop
const mockCreateTrailingStop = jest.fn();
const mockGetActiveTrailingStops = jest.fn();
const mockGetTrailingStopHistory = jest.fn();
const mockMonitorTrailingStops = jest.fn();

jest.mock('../../src/lib/trailing-stop', () => ({
  createTrailingStop: mockCreateTrailingStop,
  getActiveTrailingStops: mockGetActiveTrailingStops,
  getTrailingStopHistory: mockGetTrailingStopHistory,
  monitorTrailingStops: mockMonitorTrailingStops,
}));

// Scaled exits
const mockCreateScaledExitPlan = jest.fn();
const mockGetActiveScaledExitPlans = jest.fn();
const mockMonitorScaledExits = jest.fn();
const mockScaledExitPresetConservative = jest.fn();
const mockScaledExitPresetBalanced = jest.fn();

jest.mock('../../src/lib/scaled-exits', () => ({
  createScaledExitPlan: mockCreateScaledExitPlan,
  getActiveScaledExitPlans: mockGetActiveScaledExitPlans,
  monitorScaledExits: mockMonitorScaledExits,
  ScaledExitPresets: {
    conservative: mockScaledExitPresetConservative,
    balanced: mockScaledExitPresetBalanced,
  },
}));

// Alerts
const mockMonitorAlerts = jest.fn();
jest.mock('../../src/lib/alert-system', () => ({
  monitorAlerts: mockMonitorAlerts,
}));

// Order queue
const mockProcessQueue = jest.fn();
const mockSyncOrderStatuses = jest.fn();
const mockGetStats = jest.fn();

jest.mock('../../src/lib/order-queue', () => ({
  orderQueue: {
    processQueue: mockProcessQueue,
    syncOrderStatuses: mockSyncOrderStatuses,
    getStats: mockGetStats,
  },
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import { GET as getRules, POST as postRules, DELETE as deleteRule, PATCH as patchRule } from '../../src/app/api/automation/rules/route';
import { GET as getRun, POST as postRun } from '../../src/app/api/automation/run/route';
import { GET as getTrailingStops, POST as postTrailingStop } from '../../src/app/api/automation/trailing-stop/route';
import { GET as getScaledExits, POST as postScaledExits } from '../../src/app/api/automation/scaled-exits/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

function makePost(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDelete(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'DELETE' });
}

function makePatch(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Automation API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Rules
  // =========================================================================

  describe('GET /api/automation/rules', () => {
    it('should return active rules by default', async () => {
      const mockRulesList = [
        { id: 'r1', symbol: 'AAPL', ruleType: 'STOP_LOSS', status: 'active' },
        { id: 'r2', symbol: 'TSLA', ruleType: 'TAKE_PROFIT', status: 'active' },
      ];
      mockGetActiveRules.mockResolvedValue(mockRulesList);

      const response = await getRules(makeGet('/api/automation/rules'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.rules).toHaveLength(2);
      expect(json.data.count).toBe(2);
      expect(mockGetActiveRules).toHaveBeenCalledWith(undefined);
    });

    it('should filter rules by symbol query parameter', async () => {
      const filteredRules = [
        { id: 'r1', symbol: 'AAPL', ruleType: 'STOP_LOSS', status: 'active' },
      ];
      mockGetActiveRules.mockResolvedValue(filteredRules);

      const response = await getRules(makeGet('/api/automation/rules?symbol=AAPL'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.rules).toHaveLength(1);
      expect(json.data.count).toBe(1);
      expect(mockGetActiveRules).toHaveBeenCalledWith('AAPL');
    });

    it('should return all rules when all=true', async () => {
      const allRules = [
        { id: 'r1', symbol: 'AAPL', status: 'active' },
        { id: 'r2', symbol: 'TSLA', status: 'cancelled' },
        { id: 'r3', symbol: 'GOOG', status: 'triggered' },
      ];
      mockGetAllRules.mockResolvedValue(allRules);

      const response = await getRules(makeGet('/api/automation/rules?all=true'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.rules).toHaveLength(3);
      expect(mockGetAllRules).toHaveBeenCalled();
      expect(mockGetActiveRules).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/automation/rules', () => {
    it('should create a STOP_LOSS rule', async () => {
      const createdRule = { id: 'r10', symbol: 'AAPL', ruleType: 'STOP_LOSS', status: 'active' };
      mockCreateStopLossRule.mockResolvedValue(createdRule);

      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'STOP_LOSS',
        symbol: 'AAPL',
        entryPrice: 150,
        stopLossAmount: 5,
        quantity: 10,
        isPercent: true,
        positionSide: 'long',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('r10');
      expect(mockCreateStopLossRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          entryPrice: 150,
          stopLossAmount: 5,
          quantity: 10,
          isPercent: true,
          positionSide: 'long',
        })
      );
    });

    it('should create a TAKE_PROFIT rule', async () => {
      const createdRule = { id: 'r11', symbol: 'MSFT', ruleType: 'TAKE_PROFIT', status: 'active' };
      mockCreateTakeProfitRule.mockResolvedValue(createdRule);

      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'TAKE_PROFIT',
        symbol: 'MSFT',
        entryPrice: 400,
        takeProfitAmount: 10,
        quantity: 5,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('r11');
      expect(mockCreateTakeProfitRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'MSFT',
          entryPrice: 400,
          takeProfitAmount: 10,
        })
      );
    });

    it('should create a LIMIT_ORDER rule', async () => {
      const createdRule = { id: 'r12', symbol: 'GOOG', ruleType: 'LIMIT_ORDER', status: 'active' };
      mockCreateLimitOrderRule.mockResolvedValue(createdRule);

      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'LIMIT_ORDER',
        symbol: 'GOOG',
        quantity: 3,
        targetPrice: 180,
        orderSide: 'buy',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('r12');
      expect(mockCreateLimitOrderRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'GOOG',
          quantity: 3,
          targetPrice: 180,
          orderSide: 'buy',
        })
      );
    });

    it('should create an OCO rule and return both legs with group id', async () => {
      const ocoResult = {
        stopLoss: { id: 'r20', ruleType: 'STOP_LOSS' },
        takeProfit: { id: 'r21', ruleType: 'TAKE_PROFIT' },
        ocoGroupId: 'oco-1',
      };
      mockCreateOCORule.mockResolvedValue(ocoResult);

      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'OCO',
        symbol: 'AAPL',
        quantity: 10,
        entryPrice: 150,
        stopLossPrice: 140,
        takeProfitPrice: 170,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.stopLoss.id).toBe('r20');
      expect(json.data.takeProfit.id).toBe('r21');
      expect(json.data.ocoGroupId).toBe('oco-1');
    });

    it('should create a CUSTOM rule', async () => {
      const createdRule = { id: 'r30', symbol: 'NVDA', ruleType: 'LIMIT_ORDER', status: 'active' };
      mockCreateAutomationRule.mockResolvedValue(createdRule);

      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'CUSTOM',
        symbol: 'NVDA',
        triggerType: 'PRICE_ABOVE',
        triggerValue: 900,
        orderSide: 'sell',
        orderType: 'market',
        quantity: 5,
        name: 'Sell NVDA above 900',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('r30');
      expect(mockCreateAutomationRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'NVDA',
          triggerType: 'PRICE_ABOVE',
          triggerValue: 900,
          name: 'Sell NVDA above 900',
        })
      );
    });

    it('should return 400 when ruleType is missing', async () => {
      const response = await postRules(makePost('/api/automation/rules', {
        symbol: 'AAPL',
        entryPrice: 150,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('ruleType is required');
    });

    it('should return 400 for STOP_LOSS missing required fields', async () => {
      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'STOP_LOSS',
        symbol: 'AAPL',
        // missing entryPrice and stopLossAmount
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('stopLossAmount');
    });

    it('should return 400 for TAKE_PROFIT missing required fields', async () => {
      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'TAKE_PROFIT',
        symbol: 'MSFT',
        // missing entryPrice and takeProfitAmount
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('takeProfitAmount');
    });

    it('should return 400 for unknown ruleType', async () => {
      const response = await postRules(makePost('/api/automation/rules', {
        ruleType: 'INVALID_TYPE',
        symbol: 'AAPL',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown ruleType');
    });
  });

  describe('DELETE /api/automation/rules', () => {
    it('should cancel a rule by id', async () => {
      mockCancelRule.mockResolvedValue(undefined);

      const response = await deleteRule(makeDelete('/api/automation/rules?id=r1'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('r1');
      expect(mockCancelRule).toHaveBeenCalledWith('r1');
    });

    it('should return 400 when rule id is missing', async () => {
      const response = await deleteRule(makeDelete('/api/automation/rules'));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Rule ID is required');
    });
  });

  describe('PATCH /api/automation/rules', () => {
    it('should enable a rule', async () => {
      mockToggleRule.mockResolvedValue(undefined);

      const response = await patchRule(makePatch('/api/automation/rules', {
        ruleId: 'r1',
        enabled: true,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('enabled');
      expect(mockToggleRule).toHaveBeenCalledWith('r1', true);
    });

    it('should disable a rule', async () => {
      mockToggleRule.mockResolvedValue(undefined);

      const response = await patchRule(makePatch('/api/automation/rules', {
        ruleId: 'r2',
        enabled: false,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('disabled');
      expect(mockToggleRule).toHaveBeenCalledWith('r2', false);
    });

    it('should return 400 when ruleId or enabled is missing', async () => {
      const response = await patchRule(makePatch('/api/automation/rules', {
        ruleId: 'r1',
        // missing enabled
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('ruleId and enabled are required');
    });
  });

  // =========================================================================
  // Run
  // =========================================================================

  describe('GET /api/automation/run', () => {
    it('should return automation status with market and queue info', async () => {
      mockIsMarketOpen.mockResolvedValue(true);
      mockGetStats.mockReturnValue({
        pending: 2,
        processing: 0,
        submitted: 5,
        failed: 1,
        total: 8,
      });

      const response = await getRun(makeGet('/api/automation/run'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.marketOpen).toBe(true);
      expect(json.data.orderQueue.pending).toBe(2);
      expect(json.data.hint).toBeDefined();
    });
  });

  describe('POST /api/automation/run', () => {
    const defaultServiceResults = {
      rules: { rulesChecked: 5, rulesTriggered: 1, errors: [], triggeredRules: [] },
      trailing: { stopsChecked: 3, stopsUpdated: 1, stopsTriggered: 0, errors: [], triggeredStops: [], updatedHighWaterMarks: [] },
      scaled: { plansChecked: 2, targetsTriggered: 0, trailingTriggered: 0, errors: [], executions: [] },
      alerts: { alertsChecked: 4, alertsTriggered: 1, errors: [], triggeredAlerts: [] },
      queue: { processed: 3, submitted: 2, failed: 0, errors: [] },
    };

    function setupServiceMocks(): void {
      mockIsMarketOpen.mockResolvedValue(true);
      mockMonitorAndExecute.mockResolvedValue(defaultServiceResults.rules);
      mockMonitorTrailingStops.mockResolvedValue(defaultServiceResults.trailing);
      mockMonitorScaledExits.mockResolvedValue(defaultServiceResults.scaled);
      mockMonitorAlerts.mockResolvedValue(defaultServiceResults.alerts);
      mockProcessQueue.mockResolvedValue(defaultServiceResults.queue);
      mockSyncOrderStatuses.mockResolvedValue(3);
    }

    it('should skip when market is closed and force is not set', async () => {
      mockIsMarketOpen.mockResolvedValue(false);

      const response = await postRun(makePost('/api/automation/run', {}));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(true);
      expect(json.data.marketOpen).toBe(false);
      expect(json.data.reason).toBe('Market is closed');
      expect(mockMonitorAndExecute).not.toHaveBeenCalled();
    });

    it('should run all services when market is open', async () => {
      setupServiceMocks();

      const response = await postRun(makePost('/api/automation/run', {}));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(false);
      expect(json.data.marketOpen).toBe(true);
      expect(json.data.results.rules.rulesChecked).toBe(5);
      expect(json.data.results.trailingStops.stopsChecked).toBe(3);
      expect(json.data.results.scaledExits.plansChecked).toBe(2);
      expect(json.data.results.alerts.alertsChecked).toBe(4);
      expect(json.data.results.orderQueue.processed).toBe(3);
      expect(json.data.results.orderSync).toBe(3);
      expect(json.data.totalTriggered).toBe(2); // 1 rule + 0 trailing + 0+0 scaled + 1 alert
      expect(json.data.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockMonitorAndExecute).toHaveBeenCalled();
      expect(mockMonitorTrailingStops).toHaveBeenCalled();
      expect(mockMonitorScaledExits).toHaveBeenCalled();
      expect(mockMonitorAlerts).toHaveBeenCalled();
      expect(mockProcessQueue).toHaveBeenCalled();
      expect(mockSyncOrderStatuses).toHaveBeenCalled();
    });

    it('should run all services when force=true even if market is closed', async () => {
      mockIsMarketOpen.mockResolvedValue(false);
      mockMonitorAndExecute.mockResolvedValue(defaultServiceResults.rules);
      mockMonitorTrailingStops.mockResolvedValue(defaultServiceResults.trailing);
      mockMonitorScaledExits.mockResolvedValue(defaultServiceResults.scaled);
      mockMonitorAlerts.mockResolvedValue(defaultServiceResults.alerts);
      mockProcessQueue.mockResolvedValue(defaultServiceResults.queue);
      mockSyncOrderStatuses.mockResolvedValue(0);

      const response = await postRun(makePost('/api/automation/run', { force: true }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(false);
      expect(json.data.marketOpen).toBe(false);
      expect(mockMonitorAndExecute).toHaveBeenCalled();
    });

    it('should run only specified services', async () => {
      setupServiceMocks();

      const response = await postRun(makePost('/api/automation/run', {
        services: ['rules', 'trailing'],
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.skipped).toBe(false);
      expect(mockMonitorAndExecute).toHaveBeenCalled();
      expect(mockMonitorTrailingStops).toHaveBeenCalled();
      expect(mockMonitorScaledExits).not.toHaveBeenCalled();
      expect(mockMonitorAlerts).not.toHaveBeenCalled();
      expect(mockProcessQueue).not.toHaveBeenCalled();
    });

    it('should collect errors from failing services without crashing', async () => {
      mockIsMarketOpen.mockResolvedValue(true);
      mockMonitorAndExecute.mockRejectedValue(new Error('Rules failed'));
      mockMonitorTrailingStops.mockResolvedValue(defaultServiceResults.trailing);
      mockMonitorScaledExits.mockResolvedValue(defaultServiceResults.scaled);
      mockMonitorAlerts.mockResolvedValue(defaultServiceResults.alerts);
      mockProcessQueue.mockResolvedValue(defaultServiceResults.queue);
      mockSyncOrderStatuses.mockResolvedValue(0);

      const response = await postRun(makePost('/api/automation/run', {}));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.totalErrors.length).toBeGreaterThan(0);
      expect(json.data.totalErrors[0]).toContain('Rules error');
    });
  });

  // =========================================================================
  // Trailing Stops
  // =========================================================================

  describe('GET /api/automation/trailing-stop', () => {
    it('should return active trailing stops', async () => {
      const mockStops = [
        { id: 'ts1', symbol: 'AAPL', entryPrice: 150, trailPercent: 3, status: 'active' },
        { id: 'ts2', symbol: 'TSLA', entryPrice: 250, trailPercent: 5, status: 'active' },
      ];
      mockGetActiveTrailingStops.mockResolvedValue(mockStops);

      const response = await getTrailingStops(makeGet('/api/automation/trailing-stop'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.stops).toHaveLength(2);
      expect(json.data.count).toBe(2);
      expect(mockGetActiveTrailingStops).toHaveBeenCalledWith(undefined);
    });

    it('should filter trailing stops by symbol', async () => {
      const filtered = [
        { id: 'ts1', symbol: 'AAPL', entryPrice: 150, trailPercent: 3, status: 'active' },
      ];
      mockGetActiveTrailingStops.mockResolvedValue(filtered);

      const response = await getTrailingStops(makeGet('/api/automation/trailing-stop?symbol=AAPL'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.stops).toHaveLength(1);
      expect(mockGetActiveTrailingStops).toHaveBeenCalledWith('AAPL');
    });

    it('should return trailing stop history when history=true', async () => {
      const historyData = [
        { id: 'ts1', symbol: 'AAPL', status: 'triggered', triggeredAt: '2026-01-15T10:00:00Z' },
      ];
      mockGetTrailingStopHistory.mockResolvedValue(historyData);

      const response = await getTrailingStops(makeGet('/api/automation/trailing-stop?history=true'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(mockGetTrailingStopHistory).toHaveBeenCalledWith(undefined);
      expect(mockGetActiveTrailingStops).not.toHaveBeenCalled();
    });

    it('should return history filtered by symbol', async () => {
      mockGetTrailingStopHistory.mockResolvedValue([]);

      const response = await getTrailingStops(
        makeGet('/api/automation/trailing-stop?history=true&symbol=TSLA')
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockGetTrailingStopHistory).toHaveBeenCalledWith('TSLA');
    });
  });

  describe('POST /api/automation/trailing-stop', () => {
    it('should create a trailing stop with trailPercent', async () => {
      const createdStop = {
        id: 'ts10',
        symbol: 'AAPL',
        entryPrice: 150,
        trailPercent: 3,
        enabled: true,
      };
      mockCreateTrailingStop.mockResolvedValue(createdStop);

      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        symbol: 'AAPL',
        entryPrice: 150,
        trailPercent: 3,
        quantity: 10,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('ts10');
      expect(mockCreateTrailingStop).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          entryPrice: 150,
          trailPercent: 3,
          quantity: 10,
          enabled: true,
        })
      );
    });

    it('should create a trailing stop with trailAmount', async () => {
      const createdStop = {
        id: 'ts11',
        symbol: 'MSFT',
        entryPrice: 400,
        trailAmount: 15,
        enabled: true,
      };
      mockCreateTrailingStop.mockResolvedValue(createdStop);

      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        symbol: 'MSFT',
        entryPrice: 400,
        trailAmount: 15,
        quantity: 5,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('ts11');
      expect(mockCreateTrailingStop).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'MSFT',
          entryPrice: 400,
          trailAmount: 15,
        })
      );
    });

    it('should create a trailing stop with activationPercent', async () => {
      const createdStop = {
        id: 'ts12',
        symbol: 'GOOG',
        entryPrice: 180,
        trailPercent: 2,
        activationPercent: 5,
        enabled: true,
      };
      mockCreateTrailingStop.mockResolvedValue(createdStop);

      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        symbol: 'GOOG',
        entryPrice: 180,
        trailPercent: 2,
        activationPercent: 5,
        quantity: 8,
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockCreateTrailingStop).toHaveBeenCalledWith(
        expect.objectContaining({
          activationPercent: 5,
        })
      );
    });

    it('should return 400 when symbol is missing', async () => {
      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        entryPrice: 150,
        trailPercent: 3,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Symbol and entryPrice are required');
    });

    it('should return 400 when entryPrice is missing', async () => {
      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        symbol: 'AAPL',
        trailPercent: 3,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Symbol and entryPrice are required');
    });

    it('should return 400 when neither trailPercent nor trailAmount is provided', async () => {
      const response = await postTrailingStop(makePost('/api/automation/trailing-stop', {
        symbol: 'AAPL',
        entryPrice: 150,
        quantity: 10,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('trailPercent or trailAmount');
    });
  });

  // =========================================================================
  // Scaled Exits
  // =========================================================================

  describe('GET /api/automation/scaled-exits', () => {
    it('should return active scaled exit plans', async () => {
      const mockPlans = [
        { id: 'se1', symbol: 'AAPL', entryPrice: 150, totalQuantity: 100, status: 'active' },
      ];
      mockGetActiveScaledExitPlans.mockReturnValue(mockPlans);

      const response = await getScaledExits(makeGet('/api/automation/scaled-exits'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.plans).toHaveLength(1);
      expect(json.data.count).toBe(1);
      expect(mockGetActiveScaledExitPlans).toHaveBeenCalledWith(undefined);
    });

    it('should filter scaled exit plans by symbol', async () => {
      mockGetActiveScaledExitPlans.mockReturnValue([]);

      const response = await getScaledExits(makeGet('/api/automation/scaled-exits?symbol=TSLA'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.count).toBe(0);
      expect(mockGetActiveScaledExitPlans).toHaveBeenCalledWith('TSLA');
    });
  });

  describe('POST /api/automation/scaled-exits', () => {
    it('should create a plan with a preset', async () => {
      const createdPlan = {
        id: 'se10',
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        targets: [
          { percent: 3, quantity: 50 },
          { percent: 5, quantity: 30 },
          { percent: 8, quantity: 20 },
        ],
      };
      mockScaledExitPresetConservative.mockResolvedValue(createdPlan);

      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        preset: 'conservative',
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('se10');
      expect(mockScaledExitPresetConservative).toHaveBeenCalledWith('AAPL', 150, 100);
      expect(mockCreateScaledExitPlan).not.toHaveBeenCalled();
    });

    it('should create a plan with custom targets', async () => {
      const customTargets = [
        { pricePercent: 5, quantityPercent: 50 },
        { pricePercent: 10, quantityPercent: 50 },
      ];
      const createdPlan = {
        id: 'se11',
        symbol: 'TSLA',
        entryPrice: 250,
        totalQuantity: 50,
        targets: customTargets,
      };
      mockCreateScaledExitPlan.mockResolvedValue(createdPlan);

      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'TSLA',
        entryPrice: 250,
        totalQuantity: 50,
        targets: customTargets,
      }));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('se11');
      expect(mockCreateScaledExitPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'TSLA',
          entryPrice: 250,
          totalQuantity: 50,
          targets: customTargets,
        })
      );
    });

    it('should create a plan with custom targets and trailing take profit', async () => {
      const trailingConfig = { activationPercent: 8, trailPercent: 2 };
      const createdPlan = { id: 'se12', symbol: 'GOOG', trailingTakeProfit: trailingConfig };
      mockCreateScaledExitPlan.mockResolvedValue(createdPlan);

      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'GOOG',
        entryPrice: 180,
        totalQuantity: 20,
        targets: [{ pricePercent: 5, quantityPercent: 100 }],
        trailingTakeProfit: trailingConfig,
      }));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockCreateScaledExitPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          trailingTakeProfit: trailingConfig,
        })
      );
    });

    it('should return 400 when symbol is missing', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        entryPrice: 150,
        totalQuantity: 100,
        preset: 'conservative',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Symbol, entryPrice, and totalQuantity are required');
    });

    it('should return 400 when entryPrice is missing', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        totalQuantity: 100,
        preset: 'conservative',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should return 400 when totalQuantity is missing', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        entryPrice: 150,
        preset: 'conservative',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });

    it('should return 400 for unknown preset', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        preset: 'unknown_preset',
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown preset');
    });

    it('should return 400 when no preset and no targets provided', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Targets are required');
    });

    it('should return 400 when targets array is empty', async () => {
      const response = await postScaledExits(makePost('/api/automation/scaled-exits', {
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        targets: [],
      }));
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Targets are required');
    });
  });
});
