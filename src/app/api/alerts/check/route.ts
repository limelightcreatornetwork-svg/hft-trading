/**
 * POST /api/alerts/check - Check all positions against TP/SL/time stops
 * 
 * Returns list of triggered alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAllPositions } from '@/lib/trade-manager';

export async function POST(request: NextRequest) {
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
      { error: 'Failed to check positions', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Also allow GET for convenience
  return POST(request);
}
