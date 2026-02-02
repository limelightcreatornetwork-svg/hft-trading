/**
 * Tests for Health Check Endpoint
 */

// Mock prisma
jest.mock('../../src/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
  },
}));

import { GET } from '../../src/app/api/health/route';
import { prisma } from '../../src/lib/db';

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

  describe('GET /api/health', () => {
    it('should return healthy status when all checks pass', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('healthy');
      expect(data.checks).toBeDefined();
      expect(data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include database check', async () => {
      const response = await GET();
      const data = await response.json();

      const dbCheck = data.checks.find((c: { name: string }) => c.name === 'database');
      expect(dbCheck).toBeDefined();
      expect(dbCheck.status).toBe('pass');
    });

    it('should include alpaca config check', async () => {
      const response = await GET();
      const data = await response.json();

      const alpacaCheck = data.checks.find((c: { name: string }) => c.name === 'alpaca_config');
      expect(alpacaCheck).toBeDefined();
      expect(alpacaCheck.status).toBe('pass');
    });

    it('should include memory check', async () => {
      const response = await GET();
      const data = await response.json();

      const memoryCheck = data.checks.find((c: { name: string }) => c.name === 'memory');
      expect(memoryCheck).toBeDefined();
      expect(['pass', 'warn']).toContain(memoryCheck.status);
    });

    it('should include environment check', async () => {
      const response = await GET();
      const data = await response.json();

      const envCheck = data.checks.find((c: { name: string }) => c.name === 'environment');
      expect(envCheck).toBeDefined();
      expect(envCheck.status).toBe('pass');
    });

    it('should return unhealthy when database fails', async () => {
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Connection failed'));

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('unhealthy');
      expect(response.status).toBe(503);

      const dbCheck = data.checks.find((c: { name: string }) => c.name === 'database');
      expect(dbCheck.status).toBe('fail');
    });

    it('should return unhealthy when alpaca credentials missing', async () => {
      delete process.env.ALPACA_API_KEY;

      const response = await GET();
      const data = await response.json();

      expect(data.status).toBe('unhealthy');

      const alpacaCheck = data.checks.find((c: { name: string }) => c.name === 'alpaca_config');
      expect(alpacaCheck.status).toBe('fail');
    });

    it('should include timestamp in response', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include version and environment', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.version).toBeDefined();
      expect(data.environment).toBe('test');
    });
  });
});
