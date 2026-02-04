/**
 * Tests for Performance Monitoring System
 */

// Mock prisma before imports
jest.mock('../../src/lib/db', () => ({
  prisma: {
    apiLatencyMetric: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    queryMetric: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    orderExecutionMetric: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

import { prisma } from '../../src/lib/db';
import {
  recordApiLatency,
  recordQueryMetric,
  timeQuery,
  updateOrderMetrics,
  getApiLatencyMetrics,
  getLatencyStats,
  getQueryMetrics,
  getQueryStats,
  getOrderExecutionMetrics,
  getOrderMetricsSummary,
  getSystemHealth,
  shutdownMonitoring,
  cleanupOldMetrics,
  _resetBuffers,
  _getBufferState,
} from '../../src/lib/monitoring';

describe('Performance Monitoring System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetBuffers();
  });

  afterEach(async () => {
    await shutdownMonitoring();
  });

  describe('recordApiLatency', () => {
    it('should add entry to buffer', async () => {
      await recordApiLatency({
        endpoint: '/api/orders',
        method: 'GET',
        latencyMs: 50,
        statusCode: 200,
      });

      const state = _getBufferState();
      expect(state.latencyCount).toBe(1);
    });

    it('should flush buffer when full', async () => {
      // Fill buffer to trigger flush
      for (let i = 0; i < 100; i++) {
        await recordApiLatency({
          endpoint: `/api/test${i}`,
          method: 'GET',
          latencyMs: i,
          statusCode: 200,
        });
      }

      expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalled();
    });

    it('should record with correct timestamp', async () => {
      const timestamp = new Date('2026-01-15T10:00:00Z');
      await recordApiLatency({
        endpoint: '/api/health',
        method: 'GET',
        latencyMs: 25,
        statusCode: 200,
        timestamp,
      });

      await shutdownMonitoring();

      expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            endpoint: '/api/health',
            method: 'GET',
            latencyMs: 25,
            statusCode: 200,
            timestamp,
          }),
        ]),
      });
    });

    it('should handle multiple entries efficiently', async () => {
      await recordApiLatency({ endpoint: '/api/a', method: 'GET', latencyMs: 10, statusCode: 200 });
      await recordApiLatency({ endpoint: '/api/b', method: 'POST', latencyMs: 20, statusCode: 201 });
      await recordApiLatency({ endpoint: '/api/c', method: 'PUT', latencyMs: 30, statusCode: 200 });

      await shutdownMonitoring();

      expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalledTimes(1);
      const callArg = (prisma.apiLatencyMetric.createMany as jest.Mock).mock.calls[0][0];
      expect(callArg.data.length).toBe(3);
    });
  });

  describe('recordQueryMetric', () => {
    it('should add entry to buffer', async () => {
      await recordQueryMetric({
        operation: 'findMany',
        model: 'Order',
        latencyMs: 45,
      });

      const state = _getBufferState();
      expect(state.queryCount).toBe(1);
    });

    it('should mark slow queries', async () => {
      await recordQueryMetric({
        operation: 'findMany',
        model: 'Position',
        latencyMs: 150, // > 100ms threshold
      });

      await shutdownMonitoring();

      expect(prisma.queryMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            operation: 'findMany',
            model: 'Position',
            latencyMs: 150,
            isSlow: true,
          }),
        ]),
      });
    });

    it('should not mark fast queries as slow', async () => {
      await recordQueryMetric({
        operation: 'findUnique',
        model: 'RiskConfig',
        latencyMs: 50, // < 100ms threshold
      });

      await shutdownMonitoring();

      expect(prisma.queryMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            isSlow: false,
          }),
        ]),
      });
    });

    it('should include details when provided', async () => {
      await recordQueryMetric({
        operation: 'create',
        model: 'Intent',
        latencyMs: 75,
        details: { symbol: 'AAPL', quantity: 100 },
      });

      await shutdownMonitoring();

      expect(prisma.queryMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            details: expect.stringContaining('AAPL'),
          }),
        ]),
      });
    });
  });

  describe('timeQuery', () => {
    it('should time a successful query', async () => {
      const result = await timeQuery('Order', 'findMany', async () => {
        return ['order1', 'order2'];
      });

      expect(result).toEqual(['order1', 'order2']);

      const state = _getBufferState();
      expect(state.queryCount).toBe(1);
    });

    it('should record error queries', async () => {
      await expect(
        timeQuery('Order', 'create', async () => {
          throw new Error('DB connection failed');
        })
      ).rejects.toThrow('DB connection failed');

      const state = _getBufferState();
      expect(state.queryCount).toBe(1);
    });

    it('should pass through details', async () => {
      await timeQuery(
        'Position',
        'update',
        async () => ({ id: '123' }),
        { symbol: 'MSFT' }
      );

      await shutdownMonitoring();

      expect(prisma.queryMetric.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            model: 'Position',
            operation: 'update',
            details: expect.stringContaining('MSFT'),
          }),
        ]),
      });
    });
  });

  describe('updateOrderMetrics', () => {
    it('should update submitted count', async () => {
      await updateOrderMetrics({ type: 'submitted' });

      expect(prisma.orderExecutionMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ submitted: 1 }),
          update: expect.objectContaining({ submitted: { increment: 1 } }),
        })
      );
    });

    it('should update filled count with fill time', async () => {
      await updateOrderMetrics({ type: 'filled', fillTimeMs: 250 });

      expect(prisma.orderExecutionMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ filled: 1, totalFillTimeMs: 250 }),
          update: expect.objectContaining({
            filled: { increment: 1 },
            totalFillTimeMs: { increment: 250 },
          }),
        })
      );
    });

    it('should update cancelled count', async () => {
      await updateOrderMetrics({ type: 'cancelled' });

      expect(prisma.orderExecutionMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ cancelled: 1 }),
          update: expect.objectContaining({ cancelled: { increment: 1 } }),
        })
      );
    });

    it('should update rejected count', async () => {
      await updateOrderMetrics({ type: 'rejected' });

      expect(prisma.orderExecutionMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ rejected: 1 }),
          update: expect.objectContaining({ rejected: { increment: 1 } }),
        })
      );
    });

    it('should update partial fill count', async () => {
      await updateOrderMetrics({ type: 'partialFill' });

      expect(prisma.orderExecutionMetric.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ partialFills: 1 }),
          update: expect.objectContaining({ partialFills: { increment: 1 } }),
        })
      );
    });
  });

  describe('getApiLatencyMetrics', () => {
    it('should fetch metrics with no filters', async () => {
      await getApiLatencyMetrics();

      expect(prisma.apiLatencyMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000,
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('should apply time range filters', async () => {
      const startTime = new Date('2026-01-01');
      const endTime = new Date('2026-01-31');

      await getApiLatencyMetrics({ startTime, endTime });

      expect(prisma.apiLatencyMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            timestamp: { gte: startTime, lte: endTime },
          }),
        })
      );
    });

    it('should filter by endpoint', async () => {
      await getApiLatencyMetrics({ endpoint: '/api/orders' });

      expect(prisma.apiLatencyMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            endpoint: '/api/orders',
          }),
        })
      );
    });

    it('should filter by method', async () => {
      await getApiLatencyMetrics({ method: 'POST' });

      expect(prisma.apiLatencyMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            method: 'POST',
          }),
        })
      );
    });

    it('should respect limit', async () => {
      await getApiLatencyMetrics({ limit: 50 });

      expect(prisma.apiLatencyMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });
  });

  describe('getLatencyStats', () => {
    it('should aggregate metrics correctly', async () => {
      (prisma.apiLatencyMetric.findMany as jest.Mock).mockResolvedValueOnce([
        { endpoint: '/api/orders', method: 'GET', latencyMs: 50, statusCode: 200 },
        { endpoint: '/api/orders', method: 'GET', latencyMs: 100, statusCode: 200 },
        { endpoint: '/api/orders', method: 'GET', latencyMs: 150, statusCode: 500 },
        { endpoint: '/api/health', method: 'GET', latencyMs: 25, statusCode: 200 },
      ]);

      const stats = await getLatencyStats();

      expect(stats).toHaveLength(2);
      
      const ordersStats = stats.find(s => s.endpoint === '/api/orders');
      expect(ordersStats).toBeDefined();
      expect(ordersStats?.count).toBe(3);
      expect(ordersStats?.avgLatencyMs).toBe(100);
      expect(ordersStats?.errorCount).toBe(1);
      expect(ordersStats?.successRate).toBeCloseTo(66.67, 0);
    });

    it('should calculate percentiles', async () => {
      const latencies = Array.from({ length: 100 }, (_, i) => ({
        endpoint: '/api/test',
        method: 'GET',
        latencyMs: i + 1,
        statusCode: 200,
      }));

      (prisma.apiLatencyMetric.findMany as jest.Mock).mockResolvedValueOnce(latencies);

      const stats = await getLatencyStats();

      expect(stats).toHaveLength(1);
      // With 100 values [1-100], p50 is at index 50 = value 51
      expect(stats[0].p50LatencyMs).toBe(51);
      expect(stats[0].p95LatencyMs).toBe(96);
      expect(stats[0].p99LatencyMs).toBe(100);
    });
  });

  describe('getQueryMetrics', () => {
    it('should fetch metrics with no filters', async () => {
      await getQueryMetrics();

      expect(prisma.queryMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 1000,
          orderBy: { timestamp: 'desc' },
        })
      );
    });

    it('should filter slow queries only', async () => {
      await getQueryMetrics({ slowOnly: true });

      expect(prisma.queryMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isSlow: true,
          }),
        })
      );
    });

    it('should filter by model', async () => {
      await getQueryMetrics({ model: 'Order' });

      expect(prisma.queryMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            model: 'Order',
          }),
        })
      );
    });

    it('should filter by operation', async () => {
      await getQueryMetrics({ operation: 'findMany' });

      expect(prisma.queryMetric.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            operation: 'findMany',
          }),
        })
      );
    });
  });

  describe('getQueryStats', () => {
    it('should aggregate query metrics', async () => {
      (prisma.queryMetric.findMany as jest.Mock).mockResolvedValueOnce([
        { model: 'Order', operation: 'findMany', latencyMs: 50, isSlow: false },
        { model: 'Order', operation: 'findMany', latencyMs: 150, isSlow: true },
        { model: 'Position', operation: 'update', latencyMs: 30, isSlow: false },
      ]);

      const stats = await getQueryStats();

      expect(stats).toHaveLength(2);

      const orderStats = stats.find(s => s.model === 'Order');
      expect(orderStats?.count).toBe(2);
      expect(orderStats?.slowCount).toBe(1);
      expect(orderStats?.avgLatencyMs).toBe(100);
      expect(orderStats?.maxLatencyMs).toBe(150);
    });
  });

  describe('getOrderExecutionMetrics', () => {
    it('should fetch order metrics by hours', async () => {
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([
        {
          hourStart: new Date('2026-01-15T10:00:00Z'),
          submitted: 100,
          filled: 80,
          cancelled: 10,
          rejected: 5,
          partialFills: 3,
          totalFillTimeMs: 24000,
        },
      ]);

      const metrics = await getOrderExecutionMetrics({ hours: 24 });

      expect(metrics).toHaveLength(1);
      expect(metrics[0].submitted).toBe(100);
      expect(metrics[0].filled).toBe(80);
      expect(metrics[0].fillRate).toBe(80);
      expect(metrics[0].avgFillTimeMs).toBe(300);
    });

    it('should calculate fill rate correctly', async () => {
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([
        {
          hourStart: new Date(),
          submitted: 50,
          filled: 45,
          cancelled: 3,
          rejected: 2,
          partialFills: 0,
          totalFillTimeMs: 9000,
        },
      ]);

      const metrics = await getOrderExecutionMetrics({ hours: 1 });

      expect(metrics[0].fillRate).toBe(90);
    });

    it('should handle zero submitted orders', async () => {
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([
        {
          hourStart: new Date(),
          submitted: 0,
          filled: 0,
          cancelled: 0,
          rejected: 0,
          partialFills: 0,
          totalFillTimeMs: 0,
        },
      ]);

      const metrics = await getOrderExecutionMetrics({ hours: 1 });

      expect(metrics[0].fillRate).toBe(0);
      expect(metrics[0].avgFillTimeMs).toBe(0);
    });
  });

  describe('getOrderMetricsSummary', () => {
    it('should aggregate hourly metrics', async () => {
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([
        {
          hourStart: new Date('2026-01-15T10:00:00Z'),
          submitted: 50,
          filled: 40,
          cancelled: 5,
          rejected: 3,
          partialFills: 2,
          totalFillTimeMs: 8000,
        },
        {
          hourStart: new Date('2026-01-15T11:00:00Z'),
          submitted: 60,
          filled: 55,
          cancelled: 3,
          rejected: 1,
          partialFills: 1,
          totalFillTimeMs: 11000,
        },
      ]);

      const summary = await getOrderMetricsSummary({ hours: 24 });

      expect(summary.totalSubmitted).toBe(110);
      expect(summary.totalFilled).toBe(95);
      expect(summary.totalCancelled).toBe(8);
      expect(summary.totalRejected).toBe(4);
      expect(summary.hourlyBreakdown).toHaveLength(2);
    });
  });

  describe('getSystemHealth', () => {
    it('should return combined health metrics', async () => {
      // Mock API latency metrics
      (prisma.apiLatencyMetric.findMany as jest.Mock).mockResolvedValueOnce([
        { endpoint: '/api/test', method: 'GET', latencyMs: 100, statusCode: 200 },
        { endpoint: '/api/test', method: 'GET', latencyMs: 200, statusCode: 500 },
      ]);

      // Mock query metrics
      (prisma.queryMetric.findMany as jest.Mock).mockResolvedValueOnce([
        { model: 'Order', operation: 'findMany', latencyMs: 50, isSlow: false },
        { model: 'Order', operation: 'findMany', latencyMs: 150, isSlow: true },
      ]);

      // Mock order metrics
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([
        {
          hourStart: new Date(),
          submitted: 100,
          filled: 90,
          cancelled: 5,
          rejected: 3,
          partialFills: 2,
          totalFillTimeMs: 18000,
        },
      ]);

      const health = await getSystemHealth(60);

      expect(health.apiHealth).toBeDefined();
      expect(health.apiHealth.avgLatencyMs).toBe(150);
      expect(health.apiHealth.errorRate).toBe(50);

      expect(health.dbHealth).toBeDefined();
      expect(health.dbHealth.slowQueryCount).toBe(1);

      expect(health.orderHealth).toBeDefined();
      expect(health.orderHealth.fillRate).toBe(90);
    });

    it('should handle empty metrics', async () => {
      (prisma.apiLatencyMetric.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.queryMetric.findMany as jest.Mock).mockResolvedValueOnce([]);
      (prisma.orderExecutionMetric.findMany as jest.Mock).mockResolvedValueOnce([]);

      const health = await getSystemHealth(60);

      expect(health.apiHealth.avgLatencyMs).toBe(0);
      expect(health.apiHealth.errorRate).toBe(0);
      expect(health.dbHealth.avgQueryTimeMs).toBe(0);
      expect(health.orderHealth.fillRate).toBe(0);
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should delete old metrics', async () => {
      (prisma.apiLatencyMetric.deleteMany as jest.Mock).mockResolvedValue({ count: 100 });
      (prisma.queryMetric.deleteMany as jest.Mock).mockResolvedValue({ count: 50 });
      (prisma.orderExecutionMetric.deleteMany as jest.Mock).mockResolvedValue({ count: 24 });

      const result = await cleanupOldMetrics(7);

      expect(result.apiMetricsDeleted).toBe(100);
      expect(result.queryMetricsDeleted).toBe(50);
      expect(result.orderMetricsDeleted).toBe(24);

      // Verify retention period
      expect(prisma.apiLatencyMetric.deleteMany).toHaveBeenCalledWith({
        where: {
          timestamp: { lt: expect.any(Date) },
        },
      });
    });

    it('should use default retention of 7 days', async () => {
      await cleanupOldMetrics();

      const call = (prisma.apiLatencyMetric.deleteMany as jest.Mock).mock.calls[0][0];
      const cutoffDate = call.where.timestamp.lt;
      const expectedCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Allow 1 second tolerance
      expect(Math.abs(cutoffDate.getTime() - expectedCutoff.getTime())).toBeLessThan(1000);
    });
  });

  describe('shutdownMonitoring', () => {
    it('should flush all pending metrics', async () => {
      await recordApiLatency({ endpoint: '/api/a', method: 'GET', latencyMs: 10, statusCode: 200 });
      await recordQueryMetric({ operation: 'findMany', model: 'Order', latencyMs: 50 });

      await shutdownMonitoring();

      expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalled();
      expect(prisma.queryMetric.createMany).toHaveBeenCalled();
    });

    it('should clear buffers after flush', async () => {
      await recordApiLatency({ endpoint: '/api/test', method: 'GET', latencyMs: 10, statusCode: 200 });
      await shutdownMonitoring();

      const state = _getBufferState();
      expect(state.latencyCount).toBe(0);
      expect(state.queryCount).toBe(0);
    });
  });

  describe('buffer behavior', () => {
    it('should batch multiple entries', async () => {
      for (let i = 0; i < 10; i++) {
        await recordApiLatency({
          endpoint: `/api/endpoint${i}`,
          method: 'GET',
          latencyMs: i * 10,
          statusCode: 200,
        });
      }

      await shutdownMonitoring();

      expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalledTimes(1);
      const callArg = (prisma.apiLatencyMetric.createMany as jest.Mock).mock.calls[0][0];
      expect(callArg.data.length).toBe(10);
    });

    it('should handle database errors gracefully', async () => {
      (prisma.apiLatencyMetric.createMany as jest.Mock).mockRejectedValueOnce(
        new Error('DB connection failed')
      );

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await recordApiLatency({ endpoint: '/api/test', method: 'GET', latencyMs: 10, statusCode: 200 });
      await shutdownMonitoring();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to flush latency metrics')
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('API Latency Tracking edge cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetBuffers();
  });

  afterEach(async () => {
    await shutdownMonitoring();
  });

  it('should handle concurrent writes', async () => {
    const promises = Array.from({ length: 50 }, (_, i) =>
      recordApiLatency({
        endpoint: `/api/concurrent${i}`,
        method: 'GET',
        latencyMs: i,
        statusCode: 200,
      })
    );

    await Promise.all(promises);
    await shutdownMonitoring();

    // Should have flushed without errors
    expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalled();
  });

  it('should handle very large latency values', async () => {
    await recordApiLatency({
      endpoint: '/api/slow',
      method: 'GET',
      latencyMs: 30000, // 30 seconds
      statusCode: 504,
    });

    await shutdownMonitoring();

    expect(prisma.apiLatencyMetric.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          latencyMs: 30000,
        }),
      ]),
    });
  });

  it('should handle all HTTP methods', async () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];

    for (const method of methods) {
      await recordApiLatency({
        endpoint: '/api/test',
        method,
        latencyMs: 50,
        statusCode: 200,
      });
    }

    await shutdownMonitoring();

    const callArg = (prisma.apiLatencyMetric.createMany as jest.Mock).mock.calls[0][0];
    expect(callArg.data.length).toBe(7);
  });

  it('should handle all status code ranges', async () => {
    const statusCodes = [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503];

    for (const statusCode of statusCodes) {
      await recordApiLatency({
        endpoint: '/api/test',
        method: 'GET',
        latencyMs: 50,
        statusCode,
      });
    }

    await shutdownMonitoring();

    const callArg = (prisma.apiLatencyMetric.createMany as jest.Mock).mock.calls[0][0];
    expect(callArg.data.length).toBe(11);
  });
});
