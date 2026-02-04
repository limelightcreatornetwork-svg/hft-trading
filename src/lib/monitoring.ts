/**
 * Performance Monitoring System
 *
 * Tracks API latency, database query performance, and order execution metrics.
 * Uses buffered writes for efficient database operations.
 */

import { prisma } from './db';

// ============================================
// TYPES
// ============================================

export interface ApiLatencyEntry {
  endpoint: string;
  method: string;
  latencyMs: number;
  statusCode: number;
  timestamp?: Date;
}

export interface QueryMetricEntry {
  operation: string;
  model: string;
  latencyMs: number;
  details?: Record<string, unknown>;
}

export interface OrderExecutionUpdate {
  type: 'submitted' | 'filled' | 'cancelled' | 'rejected' | 'partialFill';
  fillTimeMs?: number; // For filled orders
}

export interface LatencyStats {
  endpoint: string;
  method: string;
  count: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
  errorCount: number;
}

export interface QueryStats {
  model: string;
  operation: string;
  count: number;
  avgLatencyMs: number;
  slowCount: number;
  maxLatencyMs: number;
}

export interface OrderMetrics {
  hourStart: Date;
  submitted: number;
  filled: number;
  cancelled: number;
  rejected: number;
  partialFills: number;
  avgFillTimeMs: number;
  fillRate: number;
}

// ============================================
// CONFIGURATION
// ============================================

const SLOW_QUERY_THRESHOLD_MS = 100;
const LATENCY_BUFFER_SIZE = 100;
const LATENCY_FLUSH_INTERVAL_MS = 5000;
const QUERY_BUFFER_SIZE = 50;
const QUERY_FLUSH_INTERVAL_MS = 5000;

// ============================================
// BUFFERED WRITES FOR API LATENCY
// ============================================

let latencyBuffer: ApiLatencyEntry[] = [];
let latencyFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isLatencyFlushing = false;

async function flushLatencyBuffer(): Promise<void> {
  if (isLatencyFlushing || latencyBuffer.length === 0) return;

  isLatencyFlushing = true;
  const entries = [...latencyBuffer];
  latencyBuffer = [];

  try {
    await prisma.apiLatencyMetric.createMany({
      data: entries.map((e) => ({
        endpoint: e.endpoint,
        method: e.method,
        latencyMs: e.latencyMs,
        statusCode: e.statusCode,
        timestamp: e.timestamp || new Date(),
      })),
    });
  } catch (error) {
    console.error('[MONITORING] Failed to flush latency metrics:', error);
    // Re-add to buffer if failed (with size limit)
    latencyBuffer = [...entries.slice(-LATENCY_BUFFER_SIZE / 2), ...latencyBuffer].slice(
      -LATENCY_BUFFER_SIZE
    );
  } finally {
    isLatencyFlushing = false;
  }
}

function scheduleLatencyFlush(): void {
  if (latencyFlushTimer) return;
  latencyFlushTimer = setTimeout(async () => {
    latencyFlushTimer = null;
    await flushLatencyBuffer();
  }, LATENCY_FLUSH_INTERVAL_MS);
}

/**
 * Record API latency metric
 */
export async function recordApiLatency(entry: ApiLatencyEntry): Promise<void> {
  latencyBuffer.push({
    ...entry,
    timestamp: entry.timestamp || new Date(),
  });

  if (latencyBuffer.length >= LATENCY_BUFFER_SIZE) {
    await flushLatencyBuffer();
  } else {
    scheduleLatencyFlush();
  }
}

// ============================================
// BUFFERED WRITES FOR QUERY METRICS
// ============================================

let queryBuffer: QueryMetricEntry[] = [];
let queryFlushTimer: ReturnType<typeof setTimeout> | null = null;
let isQueryFlushing = false;

async function flushQueryBuffer(): Promise<void> {
  if (isQueryFlushing || queryBuffer.length === 0) return;

  isQueryFlushing = true;
  const entries = [...queryBuffer];
  queryBuffer = [];

  try {
    await prisma.queryMetric.createMany({
      data: entries.map((e) => ({
        operation: e.operation,
        model: e.model,
        latencyMs: e.latencyMs,
        isSlow: e.latencyMs >= SLOW_QUERY_THRESHOLD_MS,
        details: e.details ? JSON.stringify(e.details) : null,
        timestamp: new Date(),
      })),
    });
  } catch (error) {
    console.error('[MONITORING] Failed to flush query metrics:', error);
    queryBuffer = [...entries.slice(-QUERY_BUFFER_SIZE / 2), ...queryBuffer].slice(
      -QUERY_BUFFER_SIZE
    );
  } finally {
    isQueryFlushing = false;
  }
}

function scheduleQueryFlush(): void {
  if (queryFlushTimer) return;
  queryFlushTimer = setTimeout(async () => {
    queryFlushTimer = null;
    await flushQueryBuffer();
  }, QUERY_FLUSH_INTERVAL_MS);
}

/**
 * Record database query metric
 */
export async function recordQueryMetric(entry: QueryMetricEntry): Promise<void> {
  queryBuffer.push(entry);

  if (queryBuffer.length >= QUERY_BUFFER_SIZE) {
    await flushQueryBuffer();
  } else {
    scheduleQueryFlush();
  }
}

/**
 * Helper to time a database operation and record metrics
 */
export async function timeQuery<T>(
  model: string,
  operation: string,
  fn: () => Promise<T>,
  details?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const latencyMs = Date.now() - start;
    await recordQueryMetric({ model, operation, latencyMs, details });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - start;
    await recordQueryMetric({
      model,
      operation,
      latencyMs,
      details: { ...details, error: true },
    });
    throw error;
  }
}

// ============================================
// ORDER EXECUTION METRICS
// ============================================

function getHourStart(date: Date = new Date()): Date {
  const hourStart = new Date(date);
  hourStart.setMinutes(0, 0, 0);
  return hourStart;
}

/**
 * Update order execution metrics
 */
export async function updateOrderMetrics(update: OrderExecutionUpdate): Promise<void> {
  const hourStart = getHourStart();

  try {
    // Use upsert to create or update hourly metrics
    const updateData: Record<string, unknown> = {};
    
    switch (update.type) {
      case 'submitted':
        updateData.submitted = { increment: 1 };
        break;
      case 'filled':
        updateData.filled = { increment: 1 };
        if (update.fillTimeMs !== undefined) {
          updateData.totalFillTimeMs = { increment: update.fillTimeMs };
        }
        break;
      case 'cancelled':
        updateData.cancelled = { increment: 1 };
        break;
      case 'rejected':
        updateData.rejected = { increment: 1 };
        break;
      case 'partialFill':
        updateData.partialFills = { increment: 1 };
        break;
    }

    await prisma.orderExecutionMetric.upsert({
      where: { hourStart },
      create: {
        hourStart,
        submitted: update.type === 'submitted' ? 1 : 0,
        filled: update.type === 'filled' ? 1 : 0,
        cancelled: update.type === 'cancelled' ? 1 : 0,
        rejected: update.type === 'rejected' ? 1 : 0,
        partialFills: update.type === 'partialFill' ? 1 : 0,
        totalFillTimeMs: update.fillTimeMs || 0,
      },
      update: updateData,
    });
  } catch (error) {
    console.error('[MONITORING] Failed to update order metrics:', error);
  }
}

// ============================================
// QUERY FUNCTIONS
// ============================================

export interface TimeRange {
  startTime?: Date;
  endTime?: Date;
}

export interface LatencyQueryOptions extends TimeRange {
  endpoint?: string;
  method?: string;
  limit?: number;
}

/**
 * Get API latency metrics
 */
export async function getApiLatencyMetrics(
  options: LatencyQueryOptions = {}
): Promise<ApiLatencyEntry[]> {
  const { startTime, endTime, endpoint, method, limit = 1000 } = options;

  const where: Record<string, unknown> = {};

  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) (where.timestamp as Record<string, unknown>).gte = startTime;
    if (endTime) (where.timestamp as Record<string, unknown>).lte = endTime;
  }

  if (endpoint) where.endpoint = endpoint;
  if (method) where.method = method;

  const metrics = await prisma.apiLatencyMetric.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return metrics.map((m) => ({
    endpoint: m.endpoint,
    method: m.method,
    latencyMs: m.latencyMs,
    statusCode: m.statusCode,
    timestamp: m.timestamp,
  }));
}

/**
 * Get aggregated latency statistics
 */
export async function getLatencyStats(options: TimeRange = {}): Promise<LatencyStats[]> {
  const { startTime, endTime } = options;

  const where: Record<string, unknown> = {};
  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) (where.timestamp as Record<string, unknown>).gte = startTime;
    if (endTime) (where.timestamp as Record<string, unknown>).lte = endTime;
  }

  // Get raw metrics for percentile calculation
  const metrics = await prisma.apiLatencyMetric.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 10000, // Limit for memory
  });

  // Group by endpoint + method
  const grouped = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const key = `${m.method}:${m.endpoint}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const stats: LatencyStats[] = [];
  for (const [key, entries] of grouped) {
    const [method, endpoint] = key.split(':');
    const latencies = entries.map((e) => e.latencyMs).sort((a, b) => a - b);
    const errorCount = entries.filter((e) => e.statusCode >= 400).length;

    stats.push({
      endpoint,
      method,
      count: entries.length,
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      minLatencyMs: latencies[0],
      maxLatencyMs: latencies[latencies.length - 1],
      p50LatencyMs: latencies[Math.floor(latencies.length * 0.5)] || 0,
      p95LatencyMs: latencies[Math.floor(latencies.length * 0.95)] || 0,
      p99LatencyMs: latencies[Math.floor(latencies.length * 0.99)] || 0,
      successRate: ((entries.length - errorCount) / entries.length) * 100,
      errorCount,
    });
  }

  return stats.sort((a, b) => b.count - a.count);
}

export interface QueryMetricQueryOptions extends TimeRange {
  model?: string;
  operation?: string;
  slowOnly?: boolean;
  limit?: number;
}

/**
 * Get database query metrics
 */
export async function getQueryMetrics(
  options: QueryMetricQueryOptions = {}
): Promise<QueryMetricEntry[]> {
  const { startTime, endTime, model, operation, slowOnly, limit = 1000 } = options;

  const where: Record<string, unknown> = {};

  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) (where.timestamp as Record<string, unknown>).gte = startTime;
    if (endTime) (where.timestamp as Record<string, unknown>).lte = endTime;
  }

  if (model) where.model = model;
  if (operation) where.operation = operation;
  if (slowOnly) where.isSlow = true;

  const metrics = await prisma.queryMetric.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return metrics.map((m) => ({
    operation: m.operation,
    model: m.model,
    latencyMs: m.latencyMs,
    details: m.details ? JSON.parse(m.details) : undefined,
  }));
}

/**
 * Get aggregated query statistics
 */
export async function getQueryStats(options: TimeRange = {}): Promise<QueryStats[]> {
  const { startTime, endTime } = options;

  const where: Record<string, unknown> = {};
  if (startTime || endTime) {
    where.timestamp = {};
    if (startTime) (where.timestamp as Record<string, unknown>).gte = startTime;
    if (endTime) (where.timestamp as Record<string, unknown>).lte = endTime;
  }

  const metrics = await prisma.queryMetric.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: 10000,
  });

  const grouped = new Map<string, typeof metrics>();
  for (const m of metrics) {
    const key = `${m.model}:${m.operation}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  const stats: QueryStats[] = [];
  for (const [key, entries] of grouped) {
    const [model, operation] = key.split(':');
    const latencies = entries.map((e) => e.latencyMs);
    const slowCount = entries.filter((e) => e.isSlow).length;

    stats.push({
      model,
      operation,
      count: entries.length,
      avgLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      slowCount,
      maxLatencyMs: Math.max(...latencies),
    });
  }

  return stats.sort((a, b) => b.count - a.count);
}

export interface OrderMetricsQueryOptions extends TimeRange {
  hours?: number; // Alternative to startTime/endTime: last N hours
}

/**
 * Get order execution metrics
 */
export async function getOrderExecutionMetrics(
  options: OrderMetricsQueryOptions = {}
): Promise<OrderMetrics[]> {
  let { startTime } = options;
  const { endTime, hours } = options;

  if (hours && !startTime) {
    startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  }

  const where: Record<string, unknown> = {};
  if (startTime || endTime) {
    where.hourStart = {};
    if (startTime) (where.hourStart as Record<string, unknown>).gte = startTime;
    if (endTime) (where.hourStart as Record<string, unknown>).lte = endTime;
  }

  const metrics = await prisma.orderExecutionMetric.findMany({
    where,
    orderBy: { hourStart: 'asc' },
  });

  return metrics.map((m) => {
    const total = m.submitted;
    const avgFillTimeMs = m.filled > 0 ? Math.round(m.totalFillTimeMs / m.filled) : 0;
    const fillRate = total > 0 ? (m.filled / total) * 100 : 0;

    return {
      hourStart: m.hourStart,
      submitted: m.submitted,
      filled: m.filled,
      cancelled: m.cancelled,
      rejected: m.rejected,
      partialFills: m.partialFills,
      avgFillTimeMs,
      fillRate: Math.round(fillRate * 100) / 100,
    };
  });
}

/**
 * Get order metrics summary for a time period
 */
export async function getOrderMetricsSummary(options: OrderMetricsQueryOptions = {}): Promise<{
  totalSubmitted: number;
  totalFilled: number;
  totalCancelled: number;
  totalRejected: number;
  avgFillTimeMs: number;
  fillRate: number;
  hourlyBreakdown: OrderMetrics[];
}> {
  const hourlyMetrics = await getOrderExecutionMetrics(options);

  const totals = hourlyMetrics.reduce(
    (acc, m) => ({
      submitted: acc.submitted + m.submitted,
      filled: acc.filled + m.filled,
      cancelled: acc.cancelled + m.cancelled,
      rejected: acc.rejected + m.rejected,
      totalFillTime: acc.totalFillTime + m.avgFillTimeMs * m.filled,
      fillCount: acc.fillCount + m.filled,
    }),
    { submitted: 0, filled: 0, cancelled: 0, rejected: 0, totalFillTime: 0, fillCount: 0 }
  );

  const avgFillTimeMs = totals.fillCount > 0 ? Math.round(totals.totalFillTime / totals.fillCount) : 0;
  const fillRate = totals.submitted > 0 ? (totals.filled / totals.submitted) * 100 : 0;

  return {
    totalSubmitted: totals.submitted,
    totalFilled: totals.filled,
    totalCancelled: totals.cancelled,
    totalRejected: totals.rejected,
    avgFillTimeMs,
    fillRate: Math.round(fillRate * 100) / 100,
    hourlyBreakdown: hourlyMetrics,
  };
}

// ============================================
// SYSTEM HEALTH
// ============================================

export interface SystemHealth {
  apiHealth: {
    avgLatencyMs: number;
    errorRate: number;
    requestsPerMinute: number;
  };
  dbHealth: {
    avgQueryTimeMs: number;
    slowQueryCount: number;
  };
  orderHealth: {
    fillRate: number;
    avgFillTimeMs: number;
    rejectionRate: number;
  };
  timestamp: Date;
}

/**
 * Get overall system health metrics
 */
export async function getSystemHealth(lastMinutes: number = 60): Promise<SystemHealth> {
  const startTime = new Date(Date.now() - lastMinutes * 60 * 1000);

  // API health
  const latencyStats = await getLatencyStats({ startTime });
  const totalRequests = latencyStats.reduce((acc, s) => acc + s.count, 0);
  const totalErrors = latencyStats.reduce((acc, s) => acc + s.errorCount, 0);
  const avgLatency =
    totalRequests > 0
      ? Math.round(
          latencyStats.reduce((acc, s) => acc + s.avgLatencyMs * s.count, 0) / totalRequests
        )
      : 0;

  // DB health
  const queryStats = await getQueryStats({ startTime });
  const totalQueries = queryStats.reduce((acc, s) => acc + s.count, 0);
  const totalSlowQueries = queryStats.reduce((acc, s) => acc + s.slowCount, 0);
  const avgQueryTime =
    totalQueries > 0
      ? Math.round(queryStats.reduce((acc, s) => acc + s.avgLatencyMs * s.count, 0) / totalQueries)
      : 0;

  // Order health
  const orderSummary = await getOrderMetricsSummary({ startTime });
  const rejectionRate =
    orderSummary.totalSubmitted > 0
      ? (orderSummary.totalRejected / orderSummary.totalSubmitted) * 100
      : 0;

  return {
    apiHealth: {
      avgLatencyMs: avgLatency,
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      requestsPerMinute: Math.round(totalRequests / lastMinutes),
    },
    dbHealth: {
      avgQueryTimeMs: avgQueryTime,
      slowQueryCount: totalSlowQueries,
    },
    orderHealth: {
      fillRate: orderSummary.fillRate,
      avgFillTimeMs: orderSummary.avgFillTimeMs,
      rejectionRate: Math.round(rejectionRate * 100) / 100,
    },
    timestamp: new Date(),
  };
}

// ============================================
// CLEANUP
// ============================================

/**
 * Flush all pending metrics (call on shutdown)
 */
export async function shutdownMonitoring(): Promise<void> {
  if (latencyFlushTimer) {
    clearTimeout(latencyFlushTimer);
    latencyFlushTimer = null;
  }
  if (queryFlushTimer) {
    clearTimeout(queryFlushTimer);
    queryFlushTimer = null;
  }

  await Promise.all([flushLatencyBuffer(), flushQueryBuffer()]);
}

/**
 * Clean up old metrics (run periodically)
 */
export async function cleanupOldMetrics(retentionDays: number = 7): Promise<{
  apiMetricsDeleted: number;
  queryMetricsDeleted: number;
  orderMetricsDeleted: number;
}> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const [apiResult, queryResult, orderResult] = await Promise.all([
    prisma.apiLatencyMetric.deleteMany({ where: { timestamp: { lt: cutoff } } }),
    prisma.queryMetric.deleteMany({ where: { timestamp: { lt: cutoff } } }),
    prisma.orderExecutionMetric.deleteMany({ where: { hourStart: { lt: cutoff } } }),
  ]);

  return {
    apiMetricsDeleted: apiResult.count,
    queryMetricsDeleted: queryResult.count,
    orderMetricsDeleted: orderResult.count,
  };
}

// ============================================
// TEST UTILITIES
// ============================================

/**
 * Reset buffers (for testing)
 */
export function _resetBuffers(): void {
  latencyBuffer = [];
  queryBuffer = [];
  if (latencyFlushTimer) {
    clearTimeout(latencyFlushTimer);
    latencyFlushTimer = null;
  }
  if (queryFlushTimer) {
    clearTimeout(queryFlushTimer);
    queryFlushTimer = null;
  }
}

/**
 * Get buffer state (for testing)
 */
export function _getBufferState(): { latencyCount: number; queryCount: number } {
  return {
    latencyCount: latencyBuffer.length,
    queryCount: queryBuffer.length,
  };
}
