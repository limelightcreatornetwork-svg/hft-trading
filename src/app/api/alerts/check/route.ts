/**
 * POST /api/alerts/check - Check all positions against TP/SL/time stops
 *
 * Returns list of triggered alerts
 */

import { NextResponse } from 'next/server';
import { checkAllPositions } from '@/lib/trade-manager';
import { withAuth } from '@/lib/api-auth';

export const POST = withAuth(async function POST() {
  try {
    const results = await checkAllPositions();

    const triggeredCount = results.reduce(
      (sum, r) => sum + r.alerts.filter(a => a.triggered).length,
      0
    );

    return NextResponse.json({
      success: true,
      positionsChecked: results.length,
      triggeredAlerts: triggeredCount,
      results,
    });

  } catch (error) {
    console.error('Error checking positions:', error);
    return NextResponse.json(
      { error: 'Failed to check positions' },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async function GET(_request) {
  // Also allow GET for convenience - call the POST logic
  const results = await checkAllPositions();

  const triggeredCount = results.reduce(
    (sum, r) => sum + r.alerts.filter(a => a.triggered).length,
    0
  );

  return NextResponse.json({
    success: true,
    positionsChecked: results.length,
    triggeredAlerts: triggeredCount,
    results,
  });
});
