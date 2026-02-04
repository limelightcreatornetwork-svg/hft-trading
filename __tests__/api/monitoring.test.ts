/**
 * Tests for Monitoring API Endpoints
 */

import { NextRequest } from 'next/server';

// Mock the auth middleware
jest.mock('../../src/lib/api-auth', () => ({
  withAuth: <T extends (...args: unknown[]) => unknown>(handler: T) => handler,
}));

// Mock the monitoring module
jest.mock('../../src/lib/monitoring', () => ({
  getApiLatencyMetrics: jest.fn(),
  getLatencyStats: jest.fn(),
  getQueryMetrics: jest.fn(),
  getQueryStats: jest.fn(),
  getOrderExecutionMetrics: jest.fn(),
  getOrderMetricsSummary: jest.fn(),
  getSystemHealth: jest.fn(),
}));

import {
  getApiLatencyMetrics,
  getLatencyStats,
  getQueryMetrics,
  getQueryStats,
  getOrderExecutionMetrics,
  getOrderMetricsSummary,
  getSystemHealth,
} from '../../src/lib/monitoring';

import { GET as getLatency } from '../../src/app/api/monitoring/latency/route';
import { GET as getQueries } from '../../src/app/api/monitoring/queries/route';
import { GET as getOrders } from '../../src/app/api/monitoring/orders/route';
import { GET as getHealth } from '../../src/app/api/monitoring/health/route';

describe('Monitoring API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/monitoring/latency', () => {
    it('should return raw metrics by default', async () => {
      const mockMetrics = [
        { endpoint: '/api/orders', method: 'GET', latencyMs: 50, statusCode: 200, timestamp: new Date() },
        { endpoint: '/api/health', method: 'GET', latencyMs: 25, statusCode: 200, timestamp: new Date() },
      ];

      (getApiLatencyMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const request = new NextRequest('http://localhost/api/monitoring/latency');
      const response = await getLatency(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.metrics).toHaveLength(2);
      expect(data.data.count).toBe(2);
    });

    it('should return aggregated stats when aggregated=true', async () => {
      const mockStats = [
        { endpoint: '/api/orders', method: 'GET', count: 100, avgLatencyMs: 50, p50LatencyMs: 45, p95LatencyMs: 90, p99LatencyMs: 120, successRate: 99.5, errorCount: 0 },
      ];

      (getLatencyStats as jest.Mock).mockResolvedValue(mockStats);

      const request = new NextRequest('http://localhost/api/monitoring/latency?aggregated=true');
      const response = await getLatency(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.stats).toHaveLength(1);
      expect(data.data.stats[0].endpoint).toBe('/api/orders');
    });

    it('should filter by hours parameter', async () => {
      (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/latency?hours=6');
      await getLatency(request);

      expect(getApiLatencyMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: expect.any(Date),
        })
      );
    });

    it('should filter by startTime and endTime', async () => {
      (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

      const startTime = '2026-01-15T00:00:00Z';
      const endTime = '2026-01-15T23:59:59Z';

      const request = new NextRequest(
        `http://localhost/api/monitoring/latency?startTime=${startTime}&endTime=${endTime}`
      );
      await getLatency(request);

      expect(getApiLatencyMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          startTime: new Date(startTime),
          endTime: new Date(endTime),
        })
      );
    });

    it('should filter by endpoint', async () => {
      (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/latency?endpoint=/api/orders');
      await getLatency(request);

      expect(getApiLatencyMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/orders',
        })
      );
    });

    it('should filter by method', async () => {
      (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/latency?method=POST');
      await getLatency(request);

      expect(getApiLatencyMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should respect limit parameter', async () => {
      (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/latency?limit=50');
      await getLatency(request);

      expect(getApiLatencyMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      );
    });

    it('should return 400 for invalid hours', async () => {
      const request = new NextRequest('http://localhost/api/monitoring/latency?hours=invalid');
      const response = await getLatency(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should return 400 for invalid startTime', async () => {
      const request = new NextRequest('http://localhost/api/monitoring/latency?startTime=invalid');
      const response = await getLatency(request);

      expect(response.status).toBe(400);
    });

    it('should handle errors gracefully', async () => {
      (getApiLatencyMetrics as jest.Mock).mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/monitoring/latency');
      const response = await getLatency(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('GET /api/monitoring/queries', () => {
    it('should return raw query metrics by default', async () => {
      const mockMetrics = [
        { operation: 'findMany', model: 'Order', latencyMs: 45, details: null },
        { operation: 'create', model: 'Intent', latencyMs: 80, details: null },
      ];

      (getQueryMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const request = new NextRequest('http://localhost/api/monitoring/queries');
      const response = await getQueries(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.metrics).toHaveLength(2);
      expect(data.data.slowQueryThresholdMs).toBe(100);
    });

    it('should return aggregated stats when aggregated=true', async () => {
      const mockStats = [
        { model: 'Order', operation: 'findMany', count: 500, avgLatencyMs: 40, slowCount: 5, maxLatencyMs: 250 },
      ];

      (getQueryStats as jest.Mock).mockResolvedValue(mockStats);

      const request = new NextRequest('http://localhost/api/monitoring/queries?aggregated=true');
      const response = await getQueries(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.stats).toHaveLength(1);
      expect(data.data.summary).toBeDefined();
      expect(data.data.summary.totalQueries).toBe(500);
      expect(data.data.summary.totalSlowQueries).toBe(5);
    });

    it('should filter slow queries only', async () => {
      (getQueryMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/queries?slowOnly=true');
      await getQueries(request);

      expect(getQueryMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          slowOnly: true,
        })
      );
    });

    it('should filter by model', async () => {
      (getQueryMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/queries?model=Order');
      await getQueries(request);

      expect(getQueryMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'Order',
        })
      );
    });

    it('should filter by operation', async () => {
      (getQueryMetrics as jest.Mock).mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/monitoring/queries?operation=findMany');
      await getQueries(request);

      expect(getQueryMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'findMany',
        })
      );
    });

    it('should count slow queries in response', async () => {
      const mockMetrics = [
        { operation: 'findMany', model: 'Order', latencyMs: 45 },
        { operation: 'findMany', model: 'Order', latencyMs: 150 }, // slow
        { operation: 'create', model: 'Intent', latencyMs: 200 }, // slow
      ];

      (getQueryMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const request = new NextRequest('http://localhost/api/monitoring/queries');
      const response = await getQueries(request);
      const data = await response.json();

      expect(data.data.slowQueryCount).toBe(2);
    });
  });

  describe('GET /api/monitoring/orders', () => {
    it('should return order summary by default', async () => {
      const mockSummary = {
        totalSubmitted: 100,
        totalFilled: 90,
        totalCancelled: 5,
        totalRejected: 3,
        avgFillTimeMs: 250,
        fillRate: 90,
        hourlyBreakdown: [
          { hourStart: new Date(), submitted: 50, filled: 45, cancelled: 3, rejected: 1, partialFills: 1, avgFillTimeMs: 200, fillRate: 90 },
        ],
      };

      (getOrderMetricsSummary as jest.Mock).mockResolvedValue(mockSummary);

      const request = new NextRequest('http://localhost/api/monitoring/orders');
      const response = await getOrders(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.totalSubmitted).toBe(100);
      expect(data.data.fillRate).toBe(90);
      expect(data.data.hourlyBreakdown).toHaveLength(1);
    });

    it('should return raw metrics when summary=false', async () => {
      const mockMetrics = [
        { hourStart: new Date(), submitted: 50, filled: 45, cancelled: 3, rejected: 1, partialFills: 1, avgFillTimeMs: 200, fillRate: 90 },
      ];

      (getOrderExecutionMetrics as jest.Mock).mockResolvedValue(mockMetrics);

      const request = new NextRequest('http://localhost/api/monitoring/orders?summary=false');
      const response = await getOrders(request);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.metrics).toHaveLength(1);
    });

    it('should filter by hours parameter', async () => {
      (getOrderMetricsSummary as jest.Mock).mockResolvedValue({
        totalSubmitted: 0, totalFilled: 0, totalCancelled: 0, totalRejected: 0,
        avgFillTimeMs: 0, fillRate: 0, hourlyBreakdown: [],
      });

      const request = new NextRequest('http://localhost/api/monitoring/orders?hours=12');
      await getOrders(request);

      expect(getOrderMetricsSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          hours: 12,
        })
      );
    });

    it('should default to 24 hours', async () => {
      (getOrderMetricsSummary as jest.Mock).mockResolvedValue({
        totalSubmitted: 0, totalFilled: 0, totalCancelled: 0, totalRejected: 0,
        avgFillTimeMs: 0, fillRate: 0, hourlyBreakdown: [],
      });

      const request = new NextRequest('http://localhost/api/monitoring/orders');
      await getOrders(request);

      expect(getOrderMetricsSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          hours: 24,
        })
      );
    });

    it('should return 400 for invalid hours', async () => {
      const request = new NextRequest('http://localhost/api/monitoring/orders?hours=invalid');
      const response = await getOrders(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/monitoring/health', () => {
    it('should return system health status', async () => {
      const mockHealth = {
        apiHealth: { avgLatencyMs: 50, errorRate: 0.5, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
        timestamp: new Date(),
      };

      (getSystemHealth as jest.Mock).mockResolvedValue(mockHealth);

      const request = new NextRequest('http://localhost/api/monitoring/health');
      const response = await getHealth(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.api).toBeDefined();
      expect(data.data.database).toBeDefined();
      expect(data.data.orders).toBeDefined();
    });

    it('should return degraded status on high error rate', async () => {
      const mockHealth = {
        apiHealth: { avgLatencyMs: 50, errorRate: 15, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
        timestamp: new Date(),
      };

      (getSystemHealth as jest.Mock).mockResolvedValue(mockHealth);

      const request = new NextRequest('http://localhost/api/monitoring/health');
      const response = await getHealth(request);
      const data = await response.json();

      expect(data.data.status).toBe('degraded');
    });

    it('should return unhealthy status on very high error rate', async () => {
      const mockHealth = {
        apiHealth: { avgLatencyMs: 50, errorRate: 30, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
        timestamp: new Date(),
      };

      (getSystemHealth as jest.Mock).mockResolvedValue(mockHealth);

      const request = new NextRequest('http://localhost/api/monitoring/health');
      const response = await getHealth(request);
      const data = await response.json();

      expect(data.data.status).toBe('unhealthy');
    });

    it('should return degraded status on high latency', async () => {
      const mockHealth = {
        apiHealth: { avgLatencyMs: 3000, errorRate: 0, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
        timestamp: new Date(),
      };

      (getSystemHealth as jest.Mock).mockResolvedValue(mockHealth);

      const request = new NextRequest('http://localhost/api/monitoring/health');
      const response = await getHealth(request);
      const data = await response.json();

      expect(data.data.status).toBe('degraded');
    });

    it('should return degraded status on high rejection rate', async () => {
      const mockHealth = {
        apiHealth: { avgLatencyMs: 50, errorRate: 0, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 80, avgFillTimeMs: 200, rejectionRate: 15 },
        timestamp: new Date(),
      };

      (getSystemHealth as jest.Mock).mockResolvedValue(mockHealth);

      const request = new NextRequest('http://localhost/api/monitoring/health');
      const response = await getHealth(request);
      const data = await response.json();

      expect(data.data.status).toBe('degraded');
    });

    it('should accept custom minutes parameter', async () => {
      (getSystemHealth as jest.Mock).mockResolvedValue({
        apiHealth: { avgLatencyMs: 50, errorRate: 0, requestsPerMinute: 100 },
        dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
        orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
        timestamp: new Date(),
      });

      const request = new NextRequest('http://localhost/api/monitoring/health?minutes=30');
      const response = await getHealth(request);
      const data = await response.json();

      expect(getSystemHealth).toHaveBeenCalledWith(30);
      expect(data.data.lookbackMinutes).toBe(30);
    });

    it('should return 400 for invalid minutes', async () => {
      const request = new NextRequest('http://localhost/api/monitoring/health?minutes=invalid');
      const response = await getHealth(request);

      expect(response.status).toBe(400);
    });
  });
});

describe('API Response Format', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include timeRange in latency response', async () => {
    (getApiLatencyMetrics as jest.Mock).mockResolvedValue([]);

    const request = new NextRequest('http://localhost/api/monitoring/latency?hours=6');
    const response = await getLatency(request);
    const data = await response.json();

    expect(data.data.timeRange).toBeDefined();
    expect(data.data.timeRange.startTime).toBeDefined();
  });

  it('should include timestamp in health response', async () => {
    (getSystemHealth as jest.Mock).mockResolvedValue({
      apiHealth: { avgLatencyMs: 50, errorRate: 0, requestsPerMinute: 100 },
      dbHealth: { avgQueryTimeMs: 30, slowQueryCount: 2 },
      orderHealth: { fillRate: 95, avgFillTimeMs: 200, rejectionRate: 1 },
      timestamp: new Date(),
    });

    const request = new NextRequest('http://localhost/api/monitoring/health');
    const response = await getHealth(request);
    const data = await response.json();

    expect(data.data.timestamp).toBeDefined();
  });

  it('should format hourly breakdown correctly', async () => {
    const hourStart = new Date('2026-01-15T10:00:00Z');
    (getOrderMetricsSummary as jest.Mock).mockResolvedValue({
      totalSubmitted: 50,
      totalFilled: 45,
      totalCancelled: 3,
      totalRejected: 1,
      avgFillTimeMs: 200,
      fillRate: 90,
      hourlyBreakdown: [
        { hourStart, submitted: 50, filled: 45, cancelled: 3, rejected: 1, partialFills: 1, avgFillTimeMs: 200, fillRate: 90 },
      ],
    });

    const request = new NextRequest('http://localhost/api/monitoring/orders');
    const response = await getOrders(request);
    const data = await response.json();

    expect(data.data.hourlyBreakdown[0].hour).toBe(hourStart.toISOString());
  });
});
