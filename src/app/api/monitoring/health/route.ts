import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { getSystemHealth } from '@/lib/monitoring';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/monitoring/health
 *
 * Query parameters:
 * - minutes: Number of minutes to look back (default: 60)
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const minutesParam = searchParams.get('minutes');

  let minutes = 60;
  if (minutesParam) {
    minutes = parseInt(minutesParam, 10);
    if (isNaN(minutes) || minutes <= 0) {
      return apiError('Invalid minutes parameter', 400);
    }
  }

  const health = await getSystemHealth(minutes);

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check for degraded/unhealthy conditions
  if (health.apiHealth.errorRate > 10 || health.apiHealth.avgLatencyMs > 2000) {
    status = 'degraded';
  }
  if (health.apiHealth.errorRate > 25 || health.apiHealth.avgLatencyMs > 5000) {
    status = 'unhealthy';
  }
  if (health.orderHealth.rejectionRate > 10) {
    status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }
  if (health.orderHealth.rejectionRate > 25) {
    status = 'unhealthy';
  }

  return apiSuccess({
    status,
    api: {
      avgLatencyMs: health.apiHealth.avgLatencyMs,
      errorRate: Math.round(health.apiHealth.errorRate * 100) / 100,
      requestsPerMinute: health.apiHealth.requestsPerMinute,
    },
    database: {
      avgQueryTimeMs: health.dbHealth.avgQueryTimeMs,
      slowQueryCount: health.dbHealth.slowQueryCount,
    },
    orders: {
      fillRate: health.orderHealth.fillRate,
      avgFillTimeMs: health.orderHealth.avgFillTimeMs,
      rejectionRate: health.orderHealth.rejectionRate,
    },
    lookbackMinutes: minutes,
    timestamp: health.timestamp.toISOString(),
  });
});
