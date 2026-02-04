/**
 * GET /api/alerts - Get pending and recent alerts
 *
 * Query params:
 * - pending: boolean (default: false) - Only show untriggered alerts
 * - limit: number (default: 50) - Max alerts to return
 *
 * POST /api/alerts - Dismiss an alert
 * Body: { alertId: string }
 */

import { NextRequest } from 'next/server';
import { getAllAlerts, getPendingAlerts, dismissAlert } from '@/lib/trade-manager';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { parseIntParam } from '@/lib/validation';

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pendingOnly = searchParams.get('pending') === 'true';
  const limit = parseIntParam(searchParams.get('limit'), 50);

  if (pendingOnly) {
    const alerts = await getPendingAlerts();
    return apiSuccess({
      alerts,
      count: alerts.length,
      pendingOnly: true,
    });
  }

  const alerts = await getAllAlerts(limit);
  return apiSuccess({
    alerts,
    count: alerts.length,
    pendingOnly: false,
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { alertId } = body;

  if (!alertId || typeof alertId !== 'string') {
    return apiError('Alert ID is required', 400);
  }

  await dismissAlert(alertId);

  return apiSuccess({ message: 'Alert dismissed' });
});
