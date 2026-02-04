/**
 * Trailing Stop API Routes
 * 
 * GET  - List active trailing stops
 * POST - Create a new trailing stop
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  createTrailingStop,
  getActiveTrailingStops,
  monitorTrailingStops,
  getTrailingStopHistory,
} from '@/lib/trailing-stop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const history = searchParams.get('history') === 'true';

    if (history) {
      const historyData = await getTrailingStopHistory(symbol || undefined);
      return NextResponse.json({
        success: true,
        data: historyData,
      });
    }

    const stops = await getActiveTrailingStops(symbol || undefined);
    
    return NextResponse.json({
      success: true,
      data: {
        count: stops.length,
        stops,
      },
    });
  } catch (error) {
    console.error('GET trailing stops error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get trailing stops' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const {
      symbol,
      entryPrice,
      trailPercent,
      trailAmount,
      activationPercent,
      quantity,
      enabled = true,
    } = body;

    if (!symbol || !entryPrice) {
      return NextResponse.json(
        { success: false, error: 'Symbol and entryPrice are required' },
        { status: 400 }
      );
    }

    if (!trailPercent && !trailAmount) {
      return NextResponse.json(
        { success: false, error: 'Must specify either trailPercent or trailAmount' },
        { status: 400 }
      );
    }

    const stop = await createTrailingStop({
      symbol,
      entryPrice,
      trailPercent,
      trailAmount,
      activationPercent,
      quantity,
      enabled,
    });

    return NextResponse.json({
      success: true,
      data: stop,
    });
  } catch (error) {
    console.error('POST trailing stop error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create trailing stop' },
      { status: 500 }
    );
  }
});
