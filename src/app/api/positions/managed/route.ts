/**
 * GET /api/positions/managed - Get managed positions with TP/SL/confidence
 *
 * Query params:
 * - status: 'active' | 'closed' | 'all' (default: 'active')
 * - limit: number (default: 50)
 *
 * POST /api/positions/managed - Close a position manually
 * Body: { positionId: string, closePrice: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getActiveManagedPositions,
  getPositionHistory,
  manualClosePosition,
  getTradingStats,
} from '@/lib/trade-manager';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'active';
    const limit = parseInt(searchParams.get('limit') || '50');
    const includeStats = searchParams.get('stats') === 'true';
    
    let positions;
    
    if (status === 'active') {
      positions = await getActiveManagedPositions();
    } else if (status === 'closed') {
      positions = await getPositionHistory(limit);
    } else {
      // All positions
      const active = await getActiveManagedPositions();
      const closed = await getPositionHistory(limit);
      positions = [...active, ...closed];
    }
    
    const response: {
      positions: typeof positions;
      count: number;
      status: string;
      stats?: Awaited<ReturnType<typeof getTradingStats>>;
    } = {
      positions,
      count: positions.length,
      status,
    };

    if (includeStats) {
      response.stats = await getTradingStats();
    }

    return NextResponse.json(response);
    
  } catch (error) {
    console.error('Error fetching managed positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { positionId, closePrice } = body;
    
    if (!positionId || typeof positionId !== 'string') {
      return NextResponse.json(
        { error: 'Position ID is required' },
        { status: 400 }
      );
    }
    
    if (!closePrice || typeof closePrice !== 'number' || closePrice <= 0) {
      return NextResponse.json(
        { error: 'Close price must be a positive number' },
        { status: 400 }
      );
    }
    
    await manualClosePosition(positionId, closePrice);
    
    return NextResponse.json({
      success: true,
      message: 'Position closed manually',
    });
    
  } catch (error) {
    console.error('Error closing position:', error);
    return NextResponse.json(
      { error: 'Failed to close position' },
      { status: 500 }
    );
  }
});
