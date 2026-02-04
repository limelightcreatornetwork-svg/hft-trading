/**
 * GET /api/positions/managed - Get managed positions with TP/SL/confidence
 *
 * Query params:
 * - status: 'active' | 'closed' | 'all' (default: 'active')
 * - limit: number (default: 50)
 * - stats: 'true' to include trading stats
 *
 * POST /api/positions/managed - Close a position manually
 * Body: { positionId: string, closePrice: number }
 */

import { NextRequest } from 'next/server';
import {
  getActiveManagedPositions,
  getPositionHistory,
  manualClosePosition,
  getTradingStats,
} from '@/lib/trade-manager';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

export const GET = apiHandler(async function GET(request: NextRequest) {
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

  return apiSuccess(response);
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { positionId, closePrice } = body;

  if (!positionId || typeof positionId !== 'string') {
    return apiError('Position ID is required', 400);
  }

  if (!closePrice || typeof closePrice !== 'number' || closePrice <= 0) {
    return apiError('Close price must be a positive number', 400);
  }

  await manualClosePosition(positionId, closePrice);

  return apiSuccess({ message: 'Position closed manually' });
});
