/**
 * Tests for Dynamic Automation Routes and Utility Endpoints
 *
 * Covers:
 * - /api/automation/position/[symbol]  (GET, POST)
 * - /api/automation/trailing-stop/[id] (PATCH, DELETE)
 * - /api/automation/scaled-exits/[id]  (GET, PATCH, DELETE)
 * - /api/alerts/check                  (GET, POST)
 * - /api/stats                         (GET)
 * - /api/portfolio                     (GET)
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

// Alpaca
const mockGetPositions = jest.fn();
const mockGetLatestQuote = jest.fn();
const mockGetAccount = jest.fn();

jest.mock('../../src/lib/alpaca', () => ({
  __esModule: true,
  default: {},
  getPositions: mockGetPositions,
  getLatestQuote: mockGetLatestQuote,
  getAccount: mockGetAccount,
}));

// Automation
const mockGetRulesForPosition = jest.fn();
const mockCreateOCORule = jest.fn();
const mockCreateStopLossRule = jest.fn();
const mockCreateTakeProfitRule = jest.fn();

jest.mock('../../src/lib/automation', () => ({
  getRulesForPosition: mockGetRulesForPosition,
  createOCORule: mockCreateOCORule,
  createStopLossRule: mockCreateStopLossRule,
  createTakeProfitRule: mockCreateTakeProfitRule,
}));

// Trailing stop
const mockUpdateTrailingStop = jest.fn();
const mockCancelTrailingStop = jest.fn();

jest.mock('../../src/lib/trailing-stop', () => ({
  updateTrailingStop: mockUpdateTrailingStop,
  cancelTrailingStop: mockCancelTrailingStop,
}));

// Scaled exits
const mockGetScaledExitPlan = jest.fn();
const mockUpdateScaledExitPlan = jest.fn();
const mockCancelScaledExitPlan = jest.fn();
const mockGetScaledExitHistory = jest.fn();

jest.mock('../../src/lib/scaled-exits', () => ({
  getScaledExitPlan: mockGetScaledExitPlan,
  updateScaledExitPlan: mockUpdateScaledExitPlan,
  cancelScaledExitPlan: mockCancelScaledExitPlan,
  getScaledExitHistory: mockGetScaledExitHistory,
}));

// Trade manager
const mockCheckAllPositions = jest.fn();
const mockGetTradingStats = jest.fn();

jest.mock('../../src/lib/trade-manager', () => ({
  checkAllPositions: mockCheckAllPositions,
  getTradingStats: mockGetTradingStats,
}));

// Portfolio optimizer
const mockGetPortfolioSummary = jest.fn();
const mockCalculatePortfolioKelly = jest.fn();
const mockCalculateRiskParityWeights = jest.fn();
const mockCalculateSectorAllocation = jest.fn();
const mockCalculateAssetClassAllocation = jest.fn();
const mockCalculateRiskMetrics = jest.fn();
const mockBuildCorrelationMatrix = jest.fn();
const mockGenerateRebalanceSuggestions = jest.fn();
const mockGenerateEqualWeightTargets = jest.fn();
const mockAnalyzeDiversification = jest.fn();

jest.mock('../../src/lib/portfolio-optimizer', () => ({
  getPortfolioSummary: mockGetPortfolioSummary,
  calculatePortfolioKelly: mockCalculatePortfolioKelly,
  calculateRiskParityWeights: mockCalculateRiskParityWeights,
  calculateSectorAllocation: mockCalculateSectorAllocation,
  calculateAssetClassAllocation: mockCalculateAssetClassAllocation,
  calculateRiskMetrics: mockCalculateRiskMetrics,
  buildCorrelationMatrix: mockBuildCorrelationMatrix,
  generateRebalanceSuggestions: mockGenerateRebalanceSuggestions,
  generateEqualWeightTargets: mockGenerateEqualWeightTargets,
  analyzeDiversification: mockAnalyzeDiversification,
}));

// ---------------------------------------------------------------------------
// Route imports (after mocks)
// ---------------------------------------------------------------------------

import {
  GET as getPosition,
  POST as postPosition,
} from '../../src/app/api/automation/position/[symbol]/route';
import {
  PATCH as patchTrailingStop,
  DELETE as deleteTrailingStop,
} from '../../src/app/api/automation/trailing-stop/[id]/route';
import {
  GET as getScaledExit,
  PATCH as patchScaledExit,
  DELETE as deleteScaledExit,
} from '../../src/app/api/automation/scaled-exits/[id]/route';
import {
  GET as getAlertsCheck,
  POST as postAlertsCheck,
} from '../../src/app/api/alerts/check/route';
import { GET as getStats } from '../../src/app/api/stats/route';
import { GET as getPortfolio } from '../../src/app/api/portfolio/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContext(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

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

function makePatch(path: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeDelete(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Shared mock data
// ---------------------------------------------------------------------------

const MOCK_POSITION = {
  symbol: 'AAPL',
  qty: '100',
  avg_entry_price: '150.00',
  current_price: '155.00',
  market_value: '15500',
  unrealized_pl: '500',
  unrealized_plpc: '0.0333',
};

const MOCK_QUOTE = { bid: 154.5, ask: 155.5, last: 155.0 };

const MOCK_ALERT_RESULTS = [
  {
    symbol: 'AAPL',
    alerts: [
      { type: 'takeProfit', triggered: true, message: 'Take profit triggered' },
      { type: 'stopLoss', triggered: false, message: 'Stop loss not triggered' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dynamic Automation Routes and Utility Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // /api/automation/position/[symbol]
  // =========================================================================

  describe('GET /api/automation/position/[symbol]', () => {
    it('should return position data with rules and quote', async () => {
      mockGetPositions.mockResolvedValue([MOCK_POSITION]);
      mockGetLatestQuote.mockResolvedValue(MOCK_QUOTE);
      mockGetRulesForPosition.mockResolvedValue([
        { id: 'r1', ruleType: 'STOP_LOSS', triggerType: 'PRICE_BELOW' },
      ]);

      const response = await getPosition(
        makeGet('/api/automation/position/aapl'),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.position.symbol).toBe('AAPL');
      expect(json.data.position.quantity).toBe(100);
      expect(json.data.position.side).toBe('long');
      expect(json.data.position.avgEntryPrice).toBe(150);
      expect(json.data.position.unrealizedPLPercent).toBeCloseTo(3.33, 0);
      expect(json.data.currentPrice).toBe(155);
      expect(json.data.rulesCount).toBe(1);
      expect(json.data.hasStopLoss).toBe(true);
      expect(json.data.hasTakeProfit).toBe(false);
      expect(mockGetPositions).toHaveBeenCalled();
      expect(mockGetLatestQuote).toHaveBeenCalledWith('AAPL');
      expect(mockGetRulesForPosition).toHaveBeenCalledWith('AAPL');
    });

    it('should return null position when symbol not found in positions', async () => {
      mockGetPositions.mockResolvedValue([]);
      mockGetLatestQuote.mockResolvedValue(MOCK_QUOTE);
      mockGetRulesForPosition.mockResolvedValue([]);

      const response = await getPosition(
        makeGet('/api/automation/position/MSFT'),
        makeContext({ symbol: 'MSFT' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.position).toBeNull();
      expect(json.data.rulesCount).toBe(0);
    });

    it('should handle quote failure silently', async () => {
      mockGetPositions.mockResolvedValue([MOCK_POSITION]);
      mockGetLatestQuote.mockRejectedValue(new Error('Quote unavailable'));
      mockGetRulesForPosition.mockResolvedValue([]);

      const response = await getPosition(
        makeGet('/api/automation/position/aapl'),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.currentPrice).toBeNull();
      expect(json.data.position).toBeDefined();
    });

    it('should detect hasTakeProfit from TAKE_PROFIT rule type', async () => {
      mockGetPositions.mockResolvedValue([MOCK_POSITION]);
      mockGetLatestQuote.mockResolvedValue(MOCK_QUOTE);
      mockGetRulesForPosition.mockResolvedValue([
        { id: 'r1', ruleType: 'TAKE_PROFIT', triggerType: 'PRICE_ABOVE' },
      ]);

      const response = await getPosition(
        makeGet('/api/automation/position/aapl'),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(json.data.hasTakeProfit).toBe(true);
      expect(json.data.hasStopLoss).toBe(false);
    });

    it('should detect hasStopLoss and hasTakeProfit from OCO rules', async () => {
      mockGetPositions.mockResolvedValue([MOCK_POSITION]);
      mockGetLatestQuote.mockResolvedValue(MOCK_QUOTE);
      mockGetRulesForPosition.mockResolvedValue([
        { id: 'r1', ruleType: 'OCO', triggerType: 'LOSS_BELOW' },
        { id: 'r2', ruleType: 'OCO', triggerType: 'GAIN_ABOVE' },
      ]);

      const response = await getPosition(
        makeGet('/api/automation/position/aapl'),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(json.data.hasStopLoss).toBe(true);
      expect(json.data.hasTakeProfit).toBe(true);
    });

    it('should return 400 when context params are missing', async () => {
      const response = await getPosition(
        makeGet('/api/automation/position/aapl'),
        undefined,
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Missing route parameters');
    });
  });

  describe('POST /api/automation/position/[symbol]', () => {
    beforeEach(() => {
      mockGetPositions.mockResolvedValue([MOCK_POSITION]);
    });

    it('should create an OCO rule with percentage amounts', async () => {
      const ocoResult = {
        stopLoss: { id: 'sl-1' },
        takeProfit: { id: 'tp-1' },
        ocoGroupId: 'oco-grp-1',
      };
      mockCreateOCORule.mockResolvedValue(ocoResult);

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'oco',
          stopLossAmount: 5,
          takeProfitAmount: 10,
          isPercent: true,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.type).toBe('oco');
      expect(json.data.ocoGroupId).toBe('oco-grp-1');
      expect(json.data.position.symbol).toBe('AAPL');
      expect(json.data.position.side).toBe('long');
      expect(mockCreateOCORule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          quantity: 100,
          entryPrice: 150,
          stopLossPrice: 150 * (1 - 5 / 100),
          takeProfitPrice: 150 * (1 + 10 / 100),
        }),
      );
    });

    it('should create a stop_loss rule with percentage amount', async () => {
      mockCreateStopLossRule.mockResolvedValue({ id: 'sl-2' });

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'stop_loss',
          stopLossAmount: 5,
          isPercent: true,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.type).toBe('stop_loss');
      expect(json.data.stopLoss).toEqual({ id: 'sl-2' });
      expect(json.data.position.stopLossPrice).toBeCloseTo(142.5);
      expect(mockCreateStopLossRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          stopLossAmount: 5,
          isPercent: true,
          positionSide: 'long',
        }),
      );
    });

    it('should create a take_profit rule with dollar amount', async () => {
      mockCreateTakeProfitRule.mockResolvedValue({ id: 'tp-2' });

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'take_profit',
          takeProfitAmount: 20,
          isPercent: false,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.type).toBe('take_profit');
      expect(json.data.position.takeProfitPrice).toBe(170);
      expect(mockCreateTakeProfitRule).toHaveBeenCalledWith(
        expect.objectContaining({
          symbol: 'AAPL',
          takeProfitAmount: 20,
          isPercent: false,
          positionSide: 'long',
        }),
      );
    });

    it('should create both stop_loss and take_profit with "both" setupType', async () => {
      mockCreateStopLossRule.mockResolvedValue({ id: 'sl-3' });
      mockCreateTakeProfitRule.mockResolvedValue({ id: 'tp-3' });

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'both',
          stopLossAmount: 5,
          takeProfitAmount: 10,
          isPercent: true,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.type).toBe('both');
      expect(json.data.stopLoss).toEqual({ id: 'sl-3' });
      expect(json.data.takeProfit).toEqual({ id: 'tp-3' });
      expect(mockCreateStopLossRule).toHaveBeenCalled();
      expect(mockCreateTakeProfitRule).toHaveBeenCalled();
    });

    it('should create only stop_loss when "both" and only stopLossAmount provided', async () => {
      mockCreateStopLossRule.mockResolvedValue({ id: 'sl-4' });

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'both',
          stopLossAmount: 5,
          isPercent: true,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.stopLoss).toEqual({ id: 'sl-4' });
      expect(json.data.takeProfit).toBeUndefined();
      expect(mockCreateStopLossRule).toHaveBeenCalled();
      expect(mockCreateTakeProfitRule).not.toHaveBeenCalled();
    });

    it('should return 404 when no position found', async () => {
      mockGetPositions.mockResolvedValue([]);

      const response = await postPosition(
        makePost('/api/automation/position/UNKNOWN', {
          setupType: 'stop_loss',
          stopLossAmount: 5,
        }),
        makeContext({ symbol: 'UNKNOWN' }),
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('No position found');
    });

    it('should return 400 for OCO when stopLossAmount is missing', async () => {
      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'oco',
          takeProfitAmount: 10,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Both stopLossAmount and takeProfitAmount required');
    });

    it('should return 400 for stop_loss when stopLossAmount is missing', async () => {
      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'stop_loss',
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('stopLossAmount required');
    });

    it('should return 400 for take_profit when takeProfitAmount is missing', async () => {
      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'take_profit',
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('takeProfitAmount required');
    });

    it('should return 400 for unknown setupType', async () => {
      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'invalid',
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error).toContain('Unknown setupType');
    });

    it('should use custom quantity when provided', async () => {
      mockCreateStopLossRule.mockResolvedValue({ id: 'sl-5' });

      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'stop_loss',
          stopLossAmount: 5,
          isPercent: true,
          quantity: 50,
        }),
        makeContext({ symbol: 'aapl' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.position.quantity).toBe(50);
      expect(mockCreateStopLossRule).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 50 }),
      );
    });

    it('should return 400 when context params are missing', async () => {
      const response = await postPosition(
        makePost('/api/automation/position/aapl', {
          setupType: 'stop_loss',
          stopLossAmount: 5,
        }),
        undefined,
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
    });
  });

  // =========================================================================
  // /api/automation/trailing-stop/[id]
  // =========================================================================

  describe('PATCH /api/automation/trailing-stop/[id]', () => {
    it('should update trailing stop with new trailPercent', async () => {
      mockUpdateTrailingStop.mockResolvedValue(undefined);

      const response = await patchTrailingStop(
        makePatch('/api/automation/trailing-stop/ts-1', {
          trailPercent: 4,
        }),
        makeContext({ id: 'ts-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('updated');
      expect(mockUpdateTrailingStop).toHaveBeenCalledWith('ts-1', {
        trailPercent: 4,
        trailAmount: undefined,
        activationPercent: undefined,
        enabled: undefined,
      });
    });

    it('should update trailing stop enabled state', async () => {
      mockUpdateTrailingStop.mockResolvedValue(undefined);

      const response = await patchTrailingStop(
        makePatch('/api/automation/trailing-stop/ts-1', {
          enabled: false,
        }),
        makeContext({ id: 'ts-1' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockUpdateTrailingStop).toHaveBeenCalledWith('ts-1', {
        trailPercent: undefined,
        trailAmount: undefined,
        activationPercent: undefined,
        enabled: false,
      });
    });

    it('should update trailing stop with multiple fields', async () => {
      mockUpdateTrailingStop.mockResolvedValue(undefined);

      const response = await patchTrailingStop(
        makePatch('/api/automation/trailing-stop/ts-2', {
          trailPercent: 3,
          activationPercent: 5,
          enabled: true,
        }),
        makeContext({ id: 'ts-2' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockUpdateTrailingStop).toHaveBeenCalledWith('ts-2', {
        trailPercent: 3,
        trailAmount: undefined,
        activationPercent: 5,
        enabled: true,
      });
    });
  });

  describe('DELETE /api/automation/trailing-stop/[id]', () => {
    it('should cancel a trailing stop', async () => {
      mockCancelTrailingStop.mockResolvedValue(undefined);

      const response = await deleteTrailingStop(
        makeDelete('/api/automation/trailing-stop/ts-1'),
        makeContext({ id: 'ts-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('cancelled');
      expect(mockCancelTrailingStop).toHaveBeenCalledWith('ts-1');
    });
  });

  // =========================================================================
  // /api/automation/scaled-exits/[id]
  // =========================================================================

  describe('GET /api/automation/scaled-exits/[id]', () => {
    it('should return a scaled exit plan when found', async () => {
      const mockPlan = {
        id: 'se-1',
        symbol: 'AAPL',
        entryPrice: 150,
        totalQuantity: 100,
        status: 'active',
      };
      mockGetScaledExitPlan.mockReturnValue(mockPlan);

      const response = await getScaledExit(
        makeGet('/api/automation/scaled-exits/se-1'),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('se-1');
      expect(json.data.symbol).toBe('AAPL');
      expect(mockGetScaledExitPlan).toHaveBeenCalledWith('se-1');
    });

    it('should return 404 when plan is not found', async () => {
      mockGetScaledExitPlan.mockReturnValue(null);

      const response = await getScaledExit(
        makeGet('/api/automation/scaled-exits/nonexistent'),
        makeContext({ id: 'nonexistent' }),
      );
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error).toContain('not found');
    });

    it('should return history when ?history=true', async () => {
      const historyData = [
        { event: 'target_hit', timestamp: '2026-01-15T10:00:00Z' },
        { event: 'trailing_adjusted', timestamp: '2026-01-15T11:00:00Z' },
      ];
      mockGetScaledExitHistory.mockResolvedValue(historyData);

      const response = await getScaledExit(
        makeGet('/api/automation/scaled-exits/se-1?history=true'),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(2);
      expect(mockGetScaledExitHistory).toHaveBeenCalledWith('se-1');
      expect(mockGetScaledExitPlan).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/automation/scaled-exits/[id]', () => {
    it('should update a scaled exit plan with addTargets', async () => {
      const updatedPlan = { id: 'se-1', targets: [{ percent: 5, quantity: 30 }] };
      mockUpdateScaledExitPlan.mockReturnValue(updatedPlan);

      const response = await patchScaledExit(
        makePatch('/api/automation/scaled-exits/se-1', {
          addTargets: [{ pricePercent: 5, quantityPercent: 30 }],
        }),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('se-1');
      expect(mockUpdateScaledExitPlan).toHaveBeenCalledWith('se-1', {
        addTargets: [{ pricePercent: 5, quantityPercent: 30 }],
        removeTargetPercent: undefined,
        updateTrailing: undefined,
      });
    });

    it('should update a scaled exit plan with removeTargetPercent', async () => {
      const updatedPlan = { id: 'se-1', targets: [] };
      mockUpdateScaledExitPlan.mockReturnValue(updatedPlan);

      const response = await patchScaledExit(
        makePatch('/api/automation/scaled-exits/se-1', {
          removeTargetPercent: 5,
        }),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockUpdateScaledExitPlan).toHaveBeenCalledWith('se-1', {
        addTargets: undefined,
        removeTargetPercent: 5,
        updateTrailing: undefined,
      });
    });

    it('should update a scaled exit plan with updateTrailing', async () => {
      const updatedPlan = { id: 'se-1', trailingTakeProfit: { trailPercent: 2 } };
      mockUpdateScaledExitPlan.mockReturnValue(updatedPlan);

      const response = await patchScaledExit(
        makePatch('/api/automation/scaled-exits/se-1', {
          updateTrailing: { trailPercent: 2, activationPercent: 8 },
        }),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(mockUpdateScaledExitPlan).toHaveBeenCalledWith('se-1', {
        addTargets: undefined,
        removeTargetPercent: undefined,
        updateTrailing: { trailPercent: 2, activationPercent: 8 },
      });
    });
  });

  describe('DELETE /api/automation/scaled-exits/[id]', () => {
    it('should cancel a scaled exit plan', async () => {
      mockCancelScaledExitPlan.mockResolvedValue(undefined);

      const response = await deleteScaledExit(
        makeDelete('/api/automation/scaled-exits/se-1'),
        makeContext({ id: 'se-1' }),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toContain('cancelled');
      expect(mockCancelScaledExitPlan).toHaveBeenCalledWith('se-1');
    });
  });

  // =========================================================================
  // /api/alerts/check
  // =========================================================================

  describe('GET /api/alerts/check', () => {
    it('should check all positions and return alert summary', async () => {
      mockCheckAllPositions.mockResolvedValue(MOCK_ALERT_RESULTS);

      const response = await getAlertsCheck(makeGet('/api/alerts/check'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.positionsChecked).toBe(1);
      expect(json.data.triggeredAlerts).toBe(1);
      expect(json.data.results).toHaveLength(1);
      expect(mockCheckAllPositions).toHaveBeenCalled();
    });

    it('should return zero counts when no positions', async () => {
      mockCheckAllPositions.mockResolvedValue([]);

      const response = await getAlertsCheck(makeGet('/api/alerts/check'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.positionsChecked).toBe(0);
      expect(json.data.triggeredAlerts).toBe(0);
      expect(json.data.results).toHaveLength(0);
    });
  });

  describe('POST /api/alerts/check', () => {
    it('should check all positions and return alert summary', async () => {
      mockCheckAllPositions.mockResolvedValue(MOCK_ALERT_RESULTS);

      const response = await postAlertsCheck(
        makePost('/api/alerts/check', {}),
      );
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.positionsChecked).toBe(1);
      expect(json.data.triggeredAlerts).toBe(1);
      expect(json.data.results).toHaveLength(1);
      expect(mockCheckAllPositions).toHaveBeenCalled();
    });

    it('should count multiple triggered alerts correctly', async () => {
      const multipleTriggered = [
        {
          symbol: 'AAPL',
          alerts: [
            { type: 'takeProfit', triggered: true },
            { type: 'stopLoss', triggered: true },
          ],
        },
        {
          symbol: 'TSLA',
          alerts: [
            { type: 'takeProfit', triggered: false },
            { type: 'timeStop', triggered: true },
          ],
        },
      ];
      mockCheckAllPositions.mockResolvedValue(multipleTriggered);

      const response = await postAlertsCheck(
        makePost('/api/alerts/check', {}),
      );
      const json = await response.json();

      expect(json.data.positionsChecked).toBe(2);
      expect(json.data.triggeredAlerts).toBe(3);
    });
  });

  // =========================================================================
  // /api/stats
  // =========================================================================

  describe('GET /api/stats', () => {
    it('should return trading stats', async () => {
      const mockStatsData = {
        totalTrades: 42,
        winRate: 0.65,
        profitFactor: 2.1,
        averageWin: 350,
        averageLoss: -120,
      };
      mockGetTradingStats.mockResolvedValue(mockStatsData);

      const response = await getStats(makeGet('/api/stats'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.stats).toEqual(mockStatsData);
      expect(json.data.stats.totalTrades).toBe(42);
      expect(json.data.stats.winRate).toBe(0.65);
      expect(mockGetTradingStats).toHaveBeenCalled();
    });

    it('should return empty stats when no trades exist', async () => {
      const emptyStats = {
        totalTrades: 0,
        winRate: 0,
        profitFactor: 0,
        averageWin: 0,
        averageLoss: 0,
      };
      mockGetTradingStats.mockResolvedValue(emptyStats);

      const response = await getStats(makeGet('/api/stats'));
      const json = await response.json();

      expect(json.success).toBe(true);
      expect(json.data.stats.totalTrades).toBe(0);
    });
  });

  // =========================================================================
  // /api/portfolio
  // =========================================================================

  describe('GET /api/portfolio', () => {
    it('should return early with message when no positions', async () => {
      mockGetAccount.mockResolvedValue({ cash: '10000' });
      mockGetPortfolioSummary.mockResolvedValue({
        positions: [],
        totalValue: 10000,
      });

      const response = await getPortfolio(makeGet('/api/portfolio'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.message).toBe('No positions in portfolio');
      expect(json.data.portfolio.positions).toHaveLength(0);
      expect(mockCalculateSectorAllocation).not.toHaveBeenCalled();
      expect(mockCalculateRiskParityWeights).not.toHaveBeenCalled();
    });

    it('should return full portfolio analysis when positions exist', async () => {
      const mockPositions = [
        {
          symbol: 'AAPL',
          sector: 'Technology',
          currentPrice: 155,
          quantity: 100,
          marketValue: 15500,
          weight: 0.62,
          unrealizedPL: 500,
          unrealizedPLPercent: 3.33,
        },
      ];
      mockGetAccount.mockResolvedValue({ cash: '10000' });
      mockGetPortfolioSummary.mockResolvedValue({
        positions: mockPositions,
        totalValue: 25000,
      });
      mockCalculateSectorAllocation.mockReturnValue({
        Technology: { weight: 0.62, value: 15500 },
      });
      mockCalculateAssetClassAllocation.mockReturnValue({
        Equity: { weight: 1, value: 15500 },
      });
      mockCalculateRiskParityWeights.mockReturnValue([
        { symbol: 'AAPL', currentWeight: 0.62, targetWeight: 1.0 },
      ]);
      mockCalculatePortfolioKelly.mockReturnValue([
        { symbol: 'AAPL', kellyFraction: 0.15 },
      ]);
      mockGenerateEqualWeightTargets.mockReturnValue(
        new Map([['AAPL', 1.0]]),
      );
      mockGenerateRebalanceSuggestions.mockReturnValue([
        { symbol: 'AAPL', action: 'hold', shares: 0 },
      ]);
      mockBuildCorrelationMatrix.mockReturnValue({
        symbols: ['AAPL'],
        matrix: [[1.0]],
        highCorrelations: [],
      });
      mockCalculateRiskMetrics.mockReturnValue({
        sharpeRatio: 1.5,
        sortino: 2.1,
        maxDrawdownPercent: 8.5,
        maxDrawdown: 2125,
        valueAtRisk: 625,
        valueAtRiskPercent: 2.5,
        volatility: 15.2,
        beta: 1.1,
        calmarRatio: 1.8,
      });
      mockAnalyzeDiversification.mockReturnValue({
        score: 0.45,
        rating: 'low',
        suggestions: ['Consider adding more sectors'],
      });

      const response = await getPortfolio(makeGet('/api/portfolio'));
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.portfolio.positions).toHaveLength(1);
      expect(json.data.sectorAllocation).toBeDefined();
      expect(json.data.assetClassAllocation).toBeDefined();
      expect(json.data.riskParityWeights).toBeDefined();
      expect(json.data.kellyAllocations).toBeDefined();
      expect(json.data.rebalanceSuggestions).toBeDefined();
      expect(json.data.correlationMatrix).toBeDefined();
      expect(json.data.correlationMatrix.symbols).toEqual(['AAPL']);
      expect(json.data.riskMetrics).toBeDefined();
      expect(json.data.riskMetrics.sharpeRatio).toBe(1.5);
      expect(json.data.diversification).toBeDefined();

      expect(mockGetAccount).toHaveBeenCalled();
      expect(mockGetPortfolioSummary).toHaveBeenCalledWith(10000);
      expect(mockCalculateSectorAllocation).toHaveBeenCalledWith(mockPositions);
      expect(mockCalculateAssetClassAllocation).toHaveBeenCalledWith(mockPositions);
      expect(mockCalculateRiskParityWeights).toHaveBeenCalled();
      expect(mockCalculatePortfolioKelly).toHaveBeenCalledWith(mockPositions, 25000);
      expect(mockBuildCorrelationMatrix).toHaveBeenCalled();
      expect(mockCalculateRiskMetrics).toHaveBeenCalled();
      expect(mockAnalyzeDiversification).toHaveBeenCalled();
    });

    it('should round risk metrics to two decimal places', async () => {
      const mockPositions = [
        { symbol: 'AAPL', sector: 'Technology', quantity: 100 },
      ];
      mockGetAccount.mockResolvedValue({ cash: '10000' });
      mockGetPortfolioSummary.mockResolvedValue({
        positions: mockPositions,
        totalValue: 25000,
      });
      mockCalculateSectorAllocation.mockReturnValue({});
      mockCalculateAssetClassAllocation.mockReturnValue({});
      mockCalculateRiskParityWeights.mockReturnValue([]);
      mockCalculatePortfolioKelly.mockReturnValue([]);
      mockGenerateEqualWeightTargets.mockReturnValue(new Map());
      mockGenerateRebalanceSuggestions.mockReturnValue([]);
      mockBuildCorrelationMatrix.mockReturnValue({
        symbols: ['AAPL'],
        matrix: [[1.0]],
        highCorrelations: [],
      });
      mockCalculateRiskMetrics.mockReturnValue({
        sharpeRatio: 1.5678,
        sortino: 2.1234,
        maxDrawdownPercent: 8.5678,
        maxDrawdown: 2125.999,
        valueAtRisk: 625.123,
        valueAtRiskPercent: 2.5678,
        volatility: 15.2345,
        beta: 1.1234,
        calmarRatio: 1.8765,
      });
      mockAnalyzeDiversification.mockReturnValue({ score: 0.5 });

      const response = await getPortfolio(makeGet('/api/portfolio'));
      const json = await response.json();

      expect(json.data.riskMetrics.sharpeRatio).toBe(1.57);
      expect(json.data.riskMetrics.sortino).toBe(2.12);
      expect(json.data.riskMetrics.maxDrawdownPercent).toBe(8.57);
      expect(json.data.riskMetrics.volatility).toBe(15.23);
      expect(json.data.riskMetrics.beta).toBe(1.12);
      expect(json.data.riskMetrics.calmarRatio).toBe(1.88);
    });
  });
});
