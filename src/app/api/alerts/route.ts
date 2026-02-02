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

import { NextRequest, NextResponse } from 'next/server';
import { getAllAlerts, getPendingAlerts, dismissAlert } from '@/lib/trade-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const pendingOnly = searchParams.get('pending') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    
    if (pendingOnly) {
      const alerts = await getPendingAlerts();
      return NextResponse.json({
        alerts,
        count: alerts.length,
        pendingOnly: true,
      });
    }
    
    const alerts = await getAllAlerts(limit);
    return NextResponse.json({
      alerts,
      count: alerts.length,
      pendingOnly: false,
    });
    
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alerts', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alertId } = body;
    
    if (!alertId || typeof alertId !== 'string') {
      return NextResponse.json(
        { error: 'Alert ID is required' },
        { status: 400 }
      );
    }
    
    await dismissAlert(alertId);
    
    return NextResponse.json({
      success: true,
      message: 'Alert dismissed',
    });
    
  } catch (error) {
    console.error('Error dismissing alert:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss alert', details: String(error) },
      { status: 500 }
    );
  }
}
