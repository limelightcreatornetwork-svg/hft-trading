/**
 * POST /api/trade - Place a trade with confidence scoring
 *
 * Body:
 * {
 *   symbol: string
 *   side: 'buy' | 'sell'
 *   quantity: number
 *   entryPrice: number
 *   takeProfitPct?: number
 *   stopLossPct?: number
 *   timeStopHours?: number
 *   trailingStopPct?: number
 * }
 *
 * Returns:
 * - Position details with confidence score
 * - Whether trade was skipped due to low confidence
 */

import { NextRequest } from 'next/server';
import { createManagedPosition, TradeRequest } from '@/lib/trade-manager';
import { calculateConfidence, getSuggestedLevels } from '@/lib/confidence';
import { validateTradeRequest } from '@/lib/validation';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const validated = validateTradeRequest(body);
  if (!validated.valid) {
    return apiError(validated.error, 400);
  }

  const allowRiskBypass =
    process.env.NODE_ENV !== 'production' || process.env.HFT_ALLOW_RISK_BYPASS === 'true';
  const shouldSkipRiskCheck = allowRiskBypass && !!body.skipRiskCheck;
  const shouldSkipRegimeCheck = allowRiskBypass && !!body.skipRegimeCheck;

  const { symbol, side, quantity, entryPrice } = validated.value;

  const tradeRequest: TradeRequest = {
    symbol: symbol.toUpperCase(),
    side,
    quantity,
    entryPrice,
    takeProfitPct: validated.value.takeProfitPct,
    stopLossPct: validated.value.stopLossPct,
    timeStopHours: validated.value.timeStopHours,
    trailingStopPct: validated.value.trailingStopPct,
    skipRiskCheck: shouldSkipRiskCheck,
    skipRegimeCheck: shouldSkipRegimeCheck,
  };

  const result = await createManagedPosition(tradeRequest);

  if (result.skipped) {
    return apiSuccess({
      skipped: true,
      reason: result.reason,
      confidence: result.confidence,
    });
  }

  return apiSuccess({
    skipped: false,
    position: result.position,
    confidence: result.confidence,
  });
});

/**
 * GET /api/trade?symbol=XYZ&side=buy&entryPrice=100
 *
 * Preview confidence score without placing trade
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const side = searchParams.get('side') as 'buy' | 'sell';
  const entryPriceStr = searchParams.get('entryPrice');

  if (!symbol) {
    return apiError('Symbol is required', 400);
  }

  if (side && !['buy', 'sell'].includes(side)) {
    return apiError('Side must be "buy" or "sell"', 400);
  }

  const entryPrice = entryPriceStr ? parseFloat(entryPriceStr) : 100;

  const confidence = await calculateConfidence({
    symbol: symbol.toUpperCase(),
    side: side || 'buy',
    entryPrice,
  });

  const suggestedLevels = await getSuggestedLevels(
    symbol.toUpperCase(),
    entryPrice,
    side || 'buy'
  );

  return apiSuccess({
    symbol: symbol.toUpperCase(),
    side: side || 'buy',
    entryPrice,
    confidence,
    suggestedLevels,
  });
});
