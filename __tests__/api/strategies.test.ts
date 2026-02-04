/**
 * Tests for Strategy API Endpoints
 */

import { NextRequest } from 'next/server';

// Mock the auth middleware
jest.mock('../../src/lib/api-auth', () => ({
  withAuth: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

// Mock the strategy manager
jest.mock('../../src/lib/strategy-manager', () => ({
  listStrategies: jest.fn(),
  createStrategy: jest.fn(),
  getStrategy: jest.fn(),
  updateStrategy: jest.fn(),
  deleteStrategy: jest.fn(),
  toggleStrategyEnabled: jest.fn(),
}));

// Mock the strategy validation
jest.mock('../../src/lib/strategy-validation', () => ({
  validateStrategyInput: jest.fn(),
  validateStrategyUpdate: jest.fn(),
}));

// Mock the strategy executor
jest.mock('../../src/lib/strategy-executor', () => ({
  executeStrategies: jest.fn(),
  executeSingleStrategy: jest.fn(),
}));

import {
  listStrategies,
  createStrategy,
  getStrategy,
  updateStrategy,
  deleteStrategy,
  toggleStrategyEnabled,
} from '../../src/lib/strategy-manager';

import {
  validateStrategyInput,
  validateStrategyUpdate,
} from '../../src/lib/strategy-validation';

import {
  executeStrategies,
  executeSingleStrategy,
} from '../../src/lib/strategy-executor';

import { GET, POST } from '../../src/app/api/strategies/route';
import { GET as GET_BY_ID, PUT, DELETE, PATCH } from '../../src/app/api/strategies/[id]/route';
import { POST as EXECUTE_ALL } from '../../src/app/api/strategies/execute/route';
import { POST as EXECUTE_ONE } from '../../src/app/api/strategies/[id]/execute/route';

const MOCK_STRATEGY = {
  id: 'strategy-1',
  name: 'Momentum Alpha',
  description: 'A momentum-based strategy',
  type: 'momentum',
  symbols: ['AAPL', 'MSFT'],
  entryConditions: { rsiAbove: 70 },
  exitConditions: { rsiBelow: 30 },
  positionSizing: { method: 'fixed' },
  riskParams: { maxDrawdown: 0.1 },
  isActive: true,
  backtestResults: null,
  allocatedCapital: 10000,
  maxPositionSize: 1000,
  riskPerTrade: 0.02,
  enabled: true,
  totalPnl: 500,
  totalTrades: 20,
  winningTrades: 14,
  losingTrades: 6,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-15'),
};

const MOCK_STRATEGY_2 = {
  ...MOCK_STRATEGY,
  id: 'strategy-2',
  name: 'Mean Reversion Beta',
  type: 'meanReversion',
  enabled: false,
};

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('Strategy API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // GET /api/strategies
  // ---------------------------------------------------------------
  describe('GET /api/strategies', () => {
    it('should return all strategies', async () => {
      (listStrategies as jest.Mock).mockResolvedValue([MOCK_STRATEGY, MOCK_STRATEGY_2]);

      const request = new NextRequest('http://localhost/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.strategies).toHaveLength(2);
      expect(data.data.count).toBe(2);
      expect(listStrategies).toHaveBeenCalledWith({ type: undefined, enabled: undefined });
    });

    it('should filter by type query parameter', async () => {
      (listStrategies as jest.Mock).mockResolvedValue([MOCK_STRATEGY]);

      const request = new NextRequest('http://localhost/api/strategies?type=momentum');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.strategies).toHaveLength(1);
      expect(listStrategies).toHaveBeenCalledWith({ type: 'momentum', enabled: undefined });
    });

    it('should filter by enabled=true query parameter', async () => {
      (listStrategies as jest.Mock).mockResolvedValue([MOCK_STRATEGY]);

      const request = new NextRequest('http://localhost/api/strategies?enabled=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(listStrategies).toHaveBeenCalledWith({ type: undefined, enabled: true });
    });

    it('should filter by enabled=false query parameter', async () => {
      (listStrategies as jest.Mock).mockResolvedValue([MOCK_STRATEGY_2]);

      const request = new NextRequest('http://localhost/api/strategies?enabled=false');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(listStrategies).toHaveBeenCalledWith({ type: undefined, enabled: false });
    });

    it('should combine type and enabled filters', async () => {
      (listStrategies as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/strategies?type=breakout&enabled=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.strategies).toHaveLength(0);
      expect(data.data.count).toBe(0);
      expect(listStrategies).toHaveBeenCalledWith({ type: 'breakout', enabled: true });
    });

    it('should return 500 on unhandled error', async () => {
      (listStrategies as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/strategies');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // POST /api/strategies
  // ---------------------------------------------------------------
  describe('POST /api/strategies', () => {
    const validInput = {
      name: 'New Strategy',
      type: 'momentum',
      symbols: ['AAPL'],
      entryConditions: { rsiAbove: 70 },
      exitConditions: { rsiBelow: 30 },
      positionSizing: { method: 'fixed' },
      riskParams: { maxDrawdown: 0.1 },
    };

    it('should create a strategy with valid input', async () => {
      (validateStrategyInput as jest.Mock).mockReturnValue({ valid: true, value: validInput });
      (createStrategy as jest.Mock).mockResolvedValue({ ...MOCK_STRATEGY, ...validInput });

      const request = new NextRequest('http://localhost/api/strategies', {
        method: 'POST',
        body: JSON.stringify(validInput),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('New Strategy');
      expect(createStrategy).toHaveBeenCalledWith(validInput);
    });

    it('should return 400 on validation failure', async () => {
      (validateStrategyInput as jest.Mock).mockReturnValue({
        valid: false,
        error: 'name is required',
      });

      const request = new NextRequest('http://localhost/api/strategies', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('name is required');
      expect(createStrategy).not.toHaveBeenCalled();
    });

    it('should return 500 when createStrategy throws', async () => {
      (validateStrategyInput as jest.Mock).mockReturnValue({ valid: true, value: validInput });
      (createStrategy as jest.Mock).mockRejectedValue(new Error('DB write failed'));

      const request = new NextRequest('http://localhost/api/strategies', {
        method: 'POST',
        body: JSON.stringify(validInput),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // GET /api/strategies/[id]
  // ---------------------------------------------------------------
  describe('GET /api/strategies/[id]', () => {
    it('should return a strategy by id', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);

      const request = new NextRequest('http://localhost/api/strategies/strategy-1');
      const response = await GET_BY_ID(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('strategy-1');
      expect(data.data.name).toBe('Momentum Alpha');
      expect(getStrategy).toHaveBeenCalledWith('strategy-1');
    });

    it('should return 404 when strategy not found', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/strategies/nonexistent');
      const response = await GET_BY_ID(request, makeContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Strategy not found');
    });
  });

  // ---------------------------------------------------------------
  // PUT /api/strategies/[id]
  // ---------------------------------------------------------------
  describe('PUT /api/strategies/[id]', () => {
    const updatePayload = { name: 'Updated Name' };

    it('should update a strategy with valid input', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);
      (validateStrategyUpdate as jest.Mock).mockReturnValue({ valid: true, value: updatePayload });
      (updateStrategy as jest.Mock).mockResolvedValue({ ...MOCK_STRATEGY, name: 'Updated Name' });

      const request = new NextRequest('http://localhost/api/strategies/strategy-1', {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      const response = await PUT(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Updated Name');
      expect(updateStrategy).toHaveBeenCalledWith('strategy-1', updatePayload);
    });

    it('should return 404 when strategy does not exist', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/strategies/nonexistent', {
        method: 'PUT',
        body: JSON.stringify(updatePayload),
      });
      const response = await PUT(request, makeContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Strategy not found');
      expect(validateStrategyUpdate).not.toHaveBeenCalled();
      expect(updateStrategy).not.toHaveBeenCalled();
    });

    it('should return 400 on validation failure', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);
      (validateStrategyUpdate as jest.Mock).mockReturnValue({
        valid: false,
        error: 'At least one field must be provided for update',
      });

      const request = new NextRequest('http://localhost/api/strategies/strategy-1', {
        method: 'PUT',
        body: JSON.stringify({}),
      });
      const response = await PUT(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('At least one field must be provided for update');
      expect(updateStrategy).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid type in update', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);
      (validateStrategyUpdate as jest.Mock).mockReturnValue({
        valid: false,
        error: 'type must be one of: manual, momentum, meanReversion, breakout',
      });

      const request = new NextRequest('http://localhost/api/strategies/strategy-1', {
        method: 'PUT',
        body: JSON.stringify({ type: 'invalid' }),
      });
      const response = await PUT(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('type must be one of');
    });
  });

  // ---------------------------------------------------------------
  // DELETE /api/strategies/[id]
  // ---------------------------------------------------------------
  describe('DELETE /api/strategies/[id]', () => {
    it('should delete an existing strategy', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);
      (deleteStrategy as jest.Mock).mockResolvedValue(undefined);

      const request = new NextRequest('http://localhost/api/strategies/strategy-1', {
        method: 'DELETE',
      });
      const response = await DELETE(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.message).toBe('Strategy deleted');
      expect(deleteStrategy).toHaveBeenCalledWith('strategy-1');
    });

    it('should return 404 when strategy does not exist', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/strategies/nonexistent', {
        method: 'DELETE',
      });
      const response = await DELETE(request, makeContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Strategy not found');
      expect(deleteStrategy).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------
  // PATCH /api/strategies/[id]
  // ---------------------------------------------------------------
  describe('PATCH /api/strategies/[id]', () => {
    it('should toggle strategy enabled state', async () => {
      const toggled = { ...MOCK_STRATEGY, enabled: false };
      (getStrategy as jest.Mock).mockResolvedValue(MOCK_STRATEGY);
      (toggleStrategyEnabled as jest.Mock).mockResolvedValue(toggled);

      const request = new NextRequest('http://localhost/api/strategies/strategy-1', {
        method: 'PATCH',
      });
      const response = await PATCH(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.enabled).toBe(false);
      expect(toggleStrategyEnabled).toHaveBeenCalledWith('strategy-1');
    });

    it('should return 404 when strategy not found', async () => {
      (getStrategy as jest.Mock).mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/strategies/nonexistent', {
        method: 'PATCH',
      });
      const response = await PATCH(request, makeContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Strategy not found');
    });
  });

  // ---------------------------------------------------------------
  // POST /api/strategies/execute
  // ---------------------------------------------------------------
  describe('POST /api/strategies/execute', () => {
    const mockResults = [
      { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'AAPL', action: 'buy', confidence: 0.8, reason: 'RSI breakout', executed: true },
      { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'MSFT', action: 'hold', confidence: 0.3, reason: 'No signal', executed: false },
    ];

    it('should execute all enabled strategies and return results', async () => {
      (executeStrategies as jest.Mock).mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost/api/strategies/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ALL(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(2);
      expect(data.data.summary.total).toBe(2);
      expect(data.data.summary.executed).toBe(1);
      expect(data.data.summary.skipped).toBe(1);
      expect(executeStrategies).toHaveBeenCalled();
    });

    it('should return empty results when no strategies are enabled', async () => {
      (executeStrategies as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/strategies/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ALL(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(0);
      expect(data.data.summary.total).toBe(0);
      expect(data.data.summary.executed).toBe(0);
      expect(data.data.summary.skipped).toBe(0);
    });

    it('should return 500 on unhandled executor error', async () => {
      (executeStrategies as jest.Mock).mockRejectedValue(new Error('Market data unavailable'));

      const request = new NextRequest('http://localhost/api/strategies/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ALL(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  // ---------------------------------------------------------------
  // POST /api/strategies/[id]/execute
  // ---------------------------------------------------------------
  describe('POST /api/strategies/[id]/execute', () => {
    const singleResult = [
      { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'AAPL', action: 'buy', confidence: 0.85, reason: 'Strong momentum', executed: true },
    ];

    it('should execute a single strategy and return results', async () => {
      (executeSingleStrategy as jest.Mock).mockResolvedValue(singleResult);

      const request = new NextRequest('http://localhost/api/strategies/strategy-1/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ONE(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.results).toHaveLength(1);
      expect(data.data.summary.total).toBe(1);
      expect(data.data.summary.executed).toBe(1);
      expect(data.data.summary.skipped).toBe(0);
      expect(executeSingleStrategy).toHaveBeenCalledWith('strategy-1');
    });

    it('should return 400 when strategy not found', async () => {
      (executeSingleStrategy as jest.Mock).mockRejectedValue(
        new Error('Strategy not found: nonexistent')
      );

      const request = new NextRequest('http://localhost/api/strategies/nonexistent/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ONE(request, makeContext('nonexistent'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Strategy not found: nonexistent');
    });

    it('should return 400 when executing a manual strategy', async () => {
      (executeSingleStrategy as jest.Mock).mockRejectedValue(
        new Error('Cannot auto-execute manual strategies')
      );

      const request = new NextRequest('http://localhost/api/strategies/manual-1/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ONE(request, makeContext('manual-1'));
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot auto-execute manual strategies');
    });

    it('should return results with multiple symbols', async () => {
      const multiResults = [
        { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'AAPL', action: 'buy', confidence: 0.9, reason: 'Breakout', executed: true },
        { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'MSFT', action: 'hold', confidence: 0.2, reason: 'Low confidence', executed: false },
        { strategyId: 'strategy-1', strategyName: 'Momentum Alpha', symbol: 'GOOGL', action: 'sell', confidence: 0.7, reason: 'Reversal', executed: true },
      ];
      (executeSingleStrategy as jest.Mock).mockResolvedValue(multiResults);

      const request = new NextRequest('http://localhost/api/strategies/strategy-1/execute', {
        method: 'POST',
      });
      const response = await EXECUTE_ONE(request, makeContext('strategy-1'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.results).toHaveLength(3);
      expect(data.data.summary.total).toBe(3);
      expect(data.data.summary.executed).toBe(2);
      expect(data.data.summary.skipped).toBe(1);
    });
  });
});
