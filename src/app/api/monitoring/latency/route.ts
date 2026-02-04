import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getApiLatencyMetrics,
  getLatencyStats,
} from '@/lib/monitoring';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/monitoring/latency
 *
 * Query parameters:
 * - startTime: ISO date string (optional)
 * - endTime: ISO date string (optional)
 * - hours: Number of hours to look back (alternative to startTime/endTime)
 * - endpoint: Filter by endpoint (optional)
 * - method: Filter by HTTP method (optional)
 * - aggregated: If 'true', return aggregated stats instead of raw metrics
 * - limit: Max results for raw metrics (default 1000)
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get('startTime');
  const endTimeParam = searchParams.get('endTime');
  const hoursParam = searchParams.get('hours');
  const endpoint = searchParams.get('endpoint') || undefined;
  const method = searchParams.get('method') || undefined;
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
    const stats = await getLatencyStats({ startTime, endTime });
    return apiSuccess({
      stats,
      timeRange: {
        startTime: startTime?.toISOString() || null,
        endTime: endTime?.toISOString() || null,
      },
    });
  }

  const metrics = await getApiLatencyMetrics({
    startTime,
    endTime,
    endpoint,
    method,
    limit,
  });

  return apiSuccess({
    metrics,
    count: metrics.length,
    timeRange: {
      startTime: startTime?.toISOString() || null,
      endTime: endTime?.toISOString() || null,
    },
  });
});
