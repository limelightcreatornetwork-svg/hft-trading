/**
 * Tests for Health Check Endpoint
 */

import { NextRequest } from 'next/server';

// Mock prisma
jest.mock('../../src/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
  },
}));

// Mock api-auth to control authentication
jest.mock('../../src/lib/api-auth', () => ({
  authenticateRequest: jest.fn().mockReturnValue({ authenticated: true, clientId: 'test-client' }),
}));

// Mock circuit breakers
const mockTradingStats = {
  name: 'alpaca-trading',
  state: 'CLOSED' as const,
  consecutiveFailures: 0,
  totalSuccesses: 10,
  totalFailures: 0,
  lastFailureTime: 0,
  remainingCooldownMs: 0,
};
const mockMarketDataStats = {
  name: 'alpaca-market-data',
  state: 'CLOSED' as const,
  consecutiveFailures: 0,
  totalSuccesses: 20,
  totalFailures: 0,
  lastFailureTime: 0,
  remainingCooldownMs: 0,
};

jest.mock('../../src/lib/circuit-breaker', () => ({
  alpacaTradingCircuit: {
    getStats: jest.fn(() => mockTradingStats),
  },
  alpacaMarketDataCircuit: {
    getStats: jest.fn(() => mockMarketDataStats),
  },
}));

import { alpacaTradingCircuit, alpacaMarketDataCircuit } from '../../src/lib/circuit-breaker';

import { GET } from '../../src/app/api/health/route';
import { prisma } from '../../src/lib/db';
import { authenticateRequest } from '../../src/lib/api-auth';

// Helper to create mock NextRequest
function createMockRequest(url: string = 'http://localhost/api/health'): NextRequest {
  return new NextRequest(url);
}

describe('Health Check Endpoint', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      DATABASE_URL: 'postgres://localhost/test',
      ALPACA_API_KEY: 'test-key',
      ALPACA_API_SECRET: 'test-secret',
      NODE_ENV: 'test',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Public Response (no detail param)', () => {
    it('should return only status and timestamp for public requests', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.timestamp).toBeDefined();

      // Should NOT include sensitive details
      expect(data.data.checks).toBeUndefined();
      expect(data.data.uptime).toBeUndefined();
      expect(data.data.environment).toBeUndefined();
      expect(data.data.version).toBeUndefined();
    });

    it('should return unhealthy status when database fails', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.status).toBe('unhealthy');
      expect(response.status).toBe(503);

      // Still should not expose details
      expect(data.data.checks).toBeUndefined();
    });

    it('should return unhealthy when alpaca credentials missing', async () => {
      delete process.env.ALPACA_API_KEY;

      const request = createMockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.status).toBe('unhealthy');
      expect(data.data.checks).toBeUndefined();
    });
  });

  describe('Authenticated Response (with detail=true)', () => {
    it('should return full details when authenticated with detail=true', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.timestamp).toBeDefined();

      // Should include full details
      expect(data.data.checks).toBeDefined();
      expect(data.data.uptime).toBeGreaterThanOrEqual(0);
      expect(data.data.environment).toBe('test');
      expect(data.data.version).toBeDefined();
    });

    it('should include database check in detailed response', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const dbCheck = data.data.checks.find((c: { name: string }) => c.name === 'database');
      expect(dbCheck).toBeDefined();
      expect(dbCheck.status).toBe('pass');
    });

    it('should include alpaca config check in detailed response', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const alpacaCheck = data.data.checks.find((c: { name: string }) => c.name === 'alpaca_config');
      expect(alpacaCheck).toBeDefined();
      expect(alpacaCheck.status).toBe('pass');
    });

    it('should include memory check in detailed response', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const memoryCheck = data.data.checks.find((c: { name: string }) => c.name === 'memory');
      expect(memoryCheck).toBeDefined();
      expect(['pass', 'warn']).toContain(memoryCheck.status);
    });

    it('should include environment check in detailed response', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const envCheck = data.data.checks.find((c: { name: string }) => c.name === 'environment');
      expect(envCheck).toBeDefined();
      expect(envCheck.status).toBe('pass');
    });

    it('should include circuit breaker check when all circuits closed', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });
      (alpacaTradingCircuit.getStats as jest.Mock).mockReturnValue({ ...mockTradingStats, state: 'CLOSED' });
      (alpacaMarketDataCircuit.getStats as jest.Mock).mockReturnValue({ ...mockMarketDataStats, state: 'CLOSED' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const cbCheck = data.data.checks.find((c: { name: string }) => c.name === 'circuit_breakers');
      expect(cbCheck).toBeDefined();
      expect(cbCheck.status).toBe('pass');
      expect(cbCheck.message).toContain('CLOSED');
    });

    it('should warn when circuit breaker is HALF_OPEN', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });
      (alpacaTradingCircuit.getStats as jest.Mock).mockReturnValue({ ...mockTradingStats, state: 'HALF_OPEN' });
      (alpacaMarketDataCircuit.getStats as jest.Mock).mockReturnValue({ ...mockMarketDataStats, state: 'CLOSED' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const cbCheck = data.data.checks.find((c: { name: string }) => c.name === 'circuit_breakers');
      expect(cbCheck.status).toBe('warn');
      expect(cbCheck.message).toContain('HALF_OPEN');
    });

    it('should fail when circuit breaker is OPEN', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });
      (alpacaTradingCircuit.getStats as jest.Mock).mockReturnValue({ ...mockTradingStats, state: 'OPEN' });
      (alpacaMarketDataCircuit.getStats as jest.Mock).mockReturnValue({ ...mockMarketDataStats, state: 'CLOSED' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      const cbCheck = data.data.checks.find((c: { name: string }) => c.name === 'circuit_breakers');
      expect(cbCheck.status).toBe('fail');
      expect(data.data.status).toBe('degraded');
    });

    it('should degrade when both circuit breakers OPEN', async () => {
      (authenticateRequest as jest.Mock).mockReturnValue({ authenticated: true, clientId: 'test' });
      (alpacaTradingCircuit.getStats as jest.Mock).mockReturnValue({ ...mockTradingStats, state: 'OPEN' });
      (alpacaMarketDataCircuit.getStats as jest.Mock).mockReturnValue({ ...mockMarketDataStats, state: 'OPEN' });

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.status).toBe('degraded');
      const cbCheck = data.data.checks.find((c: { name: string }) => c.name === 'circuit_breakers');
      expect(cbCheck.message).toContain('Trading: OPEN');
      expect(cbCheck.message).toContain('Market Data: OPEN');
    });

    it('should return 401 when detail requested without auth', async () => {
      const mockAuthError = {
        authenticated: false,
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      };
      (authenticateRequest as jest.Mock).mockReturnValue(mockAuthError);

      const request = createMockRequest('http://localhost/api/health?detail=true');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('Status Codes', () => {
    it('should return 200 for healthy status', async () => {
      const request = createMockRequest();
      const response = await GET(request);
      expect(response.status).toBe(200);
    });

    it('should return 503 for unhealthy status', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('DB down'));

      const request = createMockRequest();
      const response = await GET(request);
      expect(response.status).toBe(503);
    });
  });
});
