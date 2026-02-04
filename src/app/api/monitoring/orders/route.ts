import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  getOrderExecutionMetrics,
  getOrderMetricsSummary,
} from '@/lib/monitoring';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/monitoring/orders
 *
 * Query parameters:
 * - startTime: ISO date string (optional)
 * - endTime: ISO date string (optional)
 * - hours: Number of hours to look back (default: 24)
 * - summary: If 'true', return summary with hourly breakdown
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const startTimeParam = searchParams.get('startTime');
  const endTimeParam = searchParams.get('endTime');
  const hoursParam = searchParams.get('hours');
  const summary = searchParams.get('summary') !== 'false'; // Default true

  // Parse time range
  let startTime: Date | undefined;
  let endTime: Date | undefined;
  let hours: number | undefined;

  if (hoursParam) {
    hours = parseInt(hoursParam, 10);
    if (isNaN(hours) || hours <= 0) {
      return apiError('Invalid hours parameter', 400);
    }
  } else if (startTimeParam) {
    startTime = new Date(startTimeParam);
    if (isNaN(startTime.getTime())) {
      return apiError('Invalid startTime format', 400);
    }
    if (endTimeParam) {
      endTime = new Date(endTimeParam);
      if (isNaN(endTime.getTime())) {
        return apiError('Invalid endTime format', 400);
      }
    }
  } else {
    // Default to last 24 hours
    hours = 24;
  }

  if (summary) {
    const orderSummary = await getOrderMetricsSummary({ startTime, endTime, hours });

    return apiSuccess({
      totalSubmitted: orderSummary.totalSubmitted,
      totalFilled: orderSummary.totalFilled,
      totalCancelled: orderSummary.totalCancelled,
      totalRejected: orderSummary.totalRejected,
      avgFillTimeMs: orderSummary.avgFillTimeMs,
      fillRate: orderSummary.fillRate,
      hourlyBreakdown: orderSummary.hourlyBreakdown.map((h) => ({
        hour: h.hourStart.toISOString(),
        submitted: h.submitted,
        filled: h.filled,
        cancelled: h.cancelled,
        rejected: h.rejected,
        partialFills: h.partialFills,
        avgFillTimeMs: h.avgFillTimeMs,
        fillRate: h.fillRate,
      })),
      timeRange: {
        startTime: startTime?.toISOString() || null,
        endTime: endTime?.toISOString() || null,
        hours: hours || null,
      },
    });
  }

  const metrics = await getOrderExecutionMetrics({ startTime, endTime, hours });

  return apiSuccess({
    metrics: metrics.map((m) => ({
      hour: m.hourStart.toISOString(),
      submitted: m.submitted,
      filled: m.filled,
      cancelled: m.cancelled,
      rejected: m.rejected,
      partialFills: m.partialFills,
      avgFillTimeMs: m.avgFillTimeMs,
      fillRate: m.fillRate,
    })),
    count: metrics.length,
    timeRange: {
      startTime: startTime?.toISOString() || null,
      endTime: endTime?.toISOString() || null,
      hours: hours || null,
    },
  });
});
