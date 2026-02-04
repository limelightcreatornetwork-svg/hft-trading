/**
 * POST /api/alerts/check - Check all positions against TP/SL/time stops
 *
 * Returns list of triggered alerts
 */

import { NextRequest } from 'next/server';
import { checkAllPositions } from '@/lib/trade-manager';
import { apiHandler, apiSuccess } from '@/lib/api-helpers';

export const POST = apiHandler(async function POST() {
  const results = await checkAllPositions();

  const triggeredCount = results.reduce(
    (sum, r) => sum + r.alerts.filter(a => a.triggered).length,
    0
  );

  return apiSuccess({
    positionsChecked: results.length,
    triggeredAlerts: triggeredCount,
    results,
  });
});

export const GET = apiHandler(async function GET(_request: NextRequest) {
  const results = await checkAllPositions();

  const triggeredCount = results.reduce(
    (sum, r) => sum + r.alerts.filter(a => a.triggered).length,
    0
  );

  return apiSuccess({
    positionsChecked: results.length,
    triggeredAlerts: triggeredCount,
    results,
  });
});
