import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getQueryMetrics,
  getQueryStats,
} from '@/lib/monitoring';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/monitoring/queries
 *
 * Query parameters:
 * - startTime: ISO date string (optional)
 * - endTime: ISO date string (optional)
 * - hours: Number of hours to look back (alternative to startTime/endTime)
 * - model: Filter by database model (optional)
 * - operation: Filter by operation type (optional)
 * - slowOnly: If 'true', only return slow queries (>100ms)
 * - aggregated: If 'true', return aggregated stats instead of raw metrics
 * - limit: Max results for raw metrics (default 1000)
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get('startTime');
  const endTimeParam = searchParams.get('endTime');
  const hoursParam = searchParams.get('hours');
  const model = searchParams.get('model') || undefined;
  const operation = searchParams.get('operation') || undefined;
  const slowOnly = searchParams.get('slowOnly') === 'true';
  const aggregated = searchParams.get('aggregated') === 'true';
  const limitParam = searchParams.get('limit');

  // Parse time range
  let startTime: Date | undefined;
  let endTime: Date | undefined;

  if (hoursParam) {
    const hours = parseInt(hoursParam, 10);
    if (isNaN(hours) || hours <= 0) {
      return apiError('Invalid hours parameter', 400);
    }
    startTime = new Date(Date.now() - hours * 60 * 60 * 1000);
  } else {
    if (startTimeParam) {
      startTime = new Date(startTimeParam);
      if (isNaN(startTime.getTime())) {
        return apiError('Invalid startTime format', 400);
      }
    }
    if (endTimeParam) {
      endTime = new Date(endTimeParam);
      if (isNaN(endTime.getTime())) {
        return apiError('Invalid endTime format', 400);
      }
    }
  }

  const limit = limitParam ? parseInt(limitParam, 10) : 1000;

  if (aggregated) {
    const stats = await getQueryStats({ startTime, endTime });

    // Calculate totals
    const totalQueries = stats.reduce((acc, s) => acc + s.count, 0);
    const totalSlowQueries = stats.reduce((acc, s) => acc + s.slowCount, 0);

    return apiSuccess({
      stats,
      summary: {
        totalQueries,
        totalSlowQueries,
        slowQueryRate: totalQueries > 0
          ? Math.round((totalSlowQueries / totalQueries) * 10000) / 100
          : 0,
      },
      timeRange: {
        startTime: startTime?.toISOString() || null,
        endTime: endTime?.toISOString() || null,
      },
    });
  }

  const metrics = await getQueryMetrics({
    startTime,
    endTime,
    model,
    operation,
    slowOnly,
    limit,
  });

  // Count slow queries
  const slowQueryCount = metrics.filter((m) => m.latencyMs >= 100).length;

  return apiSuccess({
    metrics,
    count: metrics.length,
    slowQueryCount,
    slowQueryThresholdMs: 100,
    timeRange: {
      startTime: startTime?.toISOString() || null,
      endTime: endTime?.toISOString() || null,
    },
  });
});
