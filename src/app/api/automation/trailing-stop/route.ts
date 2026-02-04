/**
 * Trailing Stop API Routes
 *
 * GET  - List active trailing stops
 * POST - Create a new trailing stop
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  createTrailingStop,
  getActiveTrailingStops,
  getTrailingStopHistory,
} from '@/lib/trailing-stop';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const history = searchParams.get('history') === 'true';

  if (history) {
    const historyData = await getTrailingStopHistory(symbol || undefined);
    return apiSuccess(historyData);
  }

  const stops = await getActiveTrailingStops(symbol || undefined);

  return apiSuccess({
    count: stops.length,
    stops,
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
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
    return apiError('Symbol and entryPrice are required', 400);
  }

  if (!trailPercent && !trailAmount) {
    return apiError('Must specify either trailPercent or trailAmount', 400);
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

  return apiSuccess(stop);
});
