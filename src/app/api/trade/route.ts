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

import { NextRequest, NextResponse } from 'next/server';
import { createManagedPosition, TradeRequest } from '@/lib/trade-manager';
import { calculateConfidence, getSuggestedLevels } from '@/lib/confidence';
import { validateTradeRequest } from '@/lib/validation';
import { withAuth } from '@/lib/api-auth';

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = validateTradeRequest(body);
    if (!validated.valid) {
      return NextResponse.json(
        { error: validated.error },
        { status: 400 }
      );
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
      return NextResponse.json({
        success: false,
        skipped: true,
        reason: result.reason,
        confidence: result.confidence,
      }, { status: 200 });
    }
    
    return NextResponse.json({
      success: true,
      skipped: false,
      position: result.position,
      confidence: result.confidence,
    });
    
  } catch (error) {
    console.error('Error creating trade:', error);
    return NextResponse.json(
      { error: 'Failed to create trade' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/trade?symbol=XYZ&side=buy&entryPrice=100
 *
 * Preview confidence score without placing trade
 */
export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const side = searchParams.get('side') as 'buy' | 'sell';
    const entryPriceStr = searchParams.get('entryPrice');

    if (!symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    if (side && !['buy', 'sell'].includes(side)) {
      return NextResponse.json(
        { error: 'Side must be "buy" or "sell"' },
        { status: 400 }
      );
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

    return NextResponse.json({
      symbol: symbol.toUpperCase(),
      side: side || 'buy',
      entryPrice,
      confidence,
      suggestedLevels,
    });

  } catch (error) {
    console.error('Error calculating confidence:', error);
    return NextResponse.json(
      { error: 'Failed to calculate confidence' },
      { status: 500 }
    );
  }
});
