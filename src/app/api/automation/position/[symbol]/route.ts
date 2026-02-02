/**
 * GET /api/automation/position/[symbol] - Get automation rules for a position
 * POST /api/automation/position/[symbol] - Quick setup automation for a position
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { getPositions, getLatestQuote } from '@/lib/alpaca';
import { 
  getRulesForPosition, 
  createOCORule, 
  createStopLossRule, 
  createTakeProfitRule,
  cancelOCOGroup,
} from '@/lib/automation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = withAuth(async function GET(
  request: NextRequest,
  context?: RouteContext
) {
  try {
    if (!context?.params) {
      return NextResponse.json({ success: false, error: 'Missing route parameters' }, { status: 400 });
    }
    const params = await context.params;
    const symbol = params.symbol;
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }
    const upperSymbol = symbol.toUpperCase();

    // Get position from Alpaca
    const positions = await getPositions();
    const position = positions.find(p => p.symbol === upperSymbol);

    // Get current quote
    let currentPrice: number | null = null;
    try {
      const quote = await getLatestQuote(upperSymbol);
      currentPrice = (quote.bid + quote.ask) / 2 || quote.last;
    } catch {
      // Quote might fail for some symbols
    }

    // Get active rules for this position
    const rules = await getRulesForPosition(upperSymbol);

    const positionData = position ? {
      symbol: position.symbol,
      quantity: parseFloat(position.qty),
      side: parseFloat(position.qty) > 0 ? 'long' : 'short',
      avgEntryPrice: parseFloat(position.avg_entry_price),
      currentPrice: parseFloat(position.current_price),
      marketValue: parseFloat(position.market_value),
      unrealizedPL: parseFloat(position.unrealized_pl),
      unrealizedPLPercent: parseFloat(position.unrealized_plpc) * 100,
    } : null;

    return NextResponse.json({
      success: true,
      data: {
        position: positionData,
        currentPrice,
        rules,
        rulesCount: rules.length,
        hasStopLoss: rules.some(r => r.ruleType === 'STOP_LOSS' || (r.ruleType === 'OCO' && r.triggerType.includes('LOSS'))),
        hasTakeProfit: rules.some(r => r.ruleType === 'TAKE_PROFIT' || (r.ruleType === 'OCO' && r.triggerType.includes('GAIN'))),
      },
    });
  } catch (error) {
    console.error('Position automation GET error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch position automation' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(
  request: NextRequest,
  context?: RouteContext
) {
  try {
    if (!context?.params) {
      return NextResponse.json({ success: false, error: 'Missing route parameters' }, { status: 400 });
    }
    const params = await context.params;
    const symbol = params.symbol;
    if (!symbol) {
      return NextResponse.json({ success: false, error: 'Symbol is required' }, { status: 400 });
    }
    const upperSymbol = symbol.toUpperCase();
    const body = await request.json();
    const { 
      setupType, // 'oco', 'stop_loss', 'take_profit', 'both'
      stopLossAmount,
      takeProfitAmount,
      isPercent = true, // true = %, false = $
      quantity,
    } = body;

    // Get position from Alpaca
    const positions = await getPositions();
    const position = positions.find(p => p.symbol === upperSymbol);

    if (!position) {
      return NextResponse.json(
        { success: false, error: `No position found for ${upperSymbol}` },
        { status: 404 }
      );
    }

    const positionQty = Math.abs(parseFloat(position.qty));
    const entryPrice = parseFloat(position.avg_entry_price);
    const positionSide = parseFloat(position.qty) > 0 ? 'long' : 'short';
    const orderQuantity = quantity || positionQty;

    let stopLossPrice: number | undefined;
    let takeProfitPrice: number | undefined;

    // Calculate prices based on amount type
    if (stopLossAmount !== undefined) {
      if (isPercent) {
        stopLossPrice = positionSide === 'long'
          ? entryPrice * (1 - stopLossAmount / 100)
          : entryPrice * (1 + stopLossAmount / 100);
      } else {
        stopLossPrice = positionSide === 'long'
          ? entryPrice - stopLossAmount
          : entryPrice + stopLossAmount;
      }
    }

    if (takeProfitAmount !== undefined) {
      if (isPercent) {
        takeProfitPrice = positionSide === 'long'
          ? entryPrice * (1 + takeProfitAmount / 100)
          : entryPrice * (1 - takeProfitAmount / 100);
      } else {
        takeProfitPrice = positionSide === 'long'
          ? entryPrice + takeProfitAmount
          : entryPrice - takeProfitAmount;
      }
    }

    const results: { stopLoss?: unknown; takeProfit?: unknown; ocoGroupId?: string } = {};

    switch (setupType) {
      case 'oco':
        if (!stopLossPrice || !takeProfitPrice) {
          return NextResponse.json(
            { success: false, error: 'Both stopLossAmount and takeProfitAmount required for OCO' },
            { status: 400 }
          );
        }
        const ocoResult = await createOCORule({
          symbol: upperSymbol,
          quantity: orderQuantity,
          entryPrice,
          stopLossPrice,
          takeProfitPrice,
        });
        return NextResponse.json({
          success: true,
          data: {
            type: 'oco',
            stopLoss: ocoResult.stopLoss,
            takeProfit: ocoResult.takeProfit,
            ocoGroupId: ocoResult.ocoGroupId,
            position: {
              symbol: upperSymbol,
              entryPrice,
              quantity: orderQuantity,
              side: positionSide,
            },
          },
        });

      case 'stop_loss':
        if (!stopLossPrice) {
          return NextResponse.json(
            { success: false, error: 'stopLossAmount required for stop loss' },
            { status: 400 }
          );
        }
        results.stopLoss = await createStopLossRule({
          symbol: upperSymbol,
          quantity: orderQuantity,
          entryPrice,
          stopLossAmount,
          isPercent,
          positionSide: positionSide as 'long' | 'short',
        });
        break;

      case 'take_profit':
        if (!takeProfitPrice) {
          return NextResponse.json(
            { success: false, error: 'takeProfitAmount required for take profit' },
            { status: 400 }
          );
        }
        results.takeProfit = await createTakeProfitRule({
          symbol: upperSymbol,
          quantity: orderQuantity,
          entryPrice,
          takeProfitAmount,
          isPercent,
          positionSide: positionSide as 'long' | 'short',
        });
        break;

      case 'both':
        if (stopLossPrice) {
          results.stopLoss = await createStopLossRule({
            symbol: upperSymbol,
            quantity: orderQuantity,
            entryPrice,
            stopLossAmount,
            isPercent,
            positionSide: positionSide as 'long' | 'short',
          });
        }
        if (takeProfitPrice) {
          results.takeProfit = await createTakeProfitRule({
            symbol: upperSymbol,
            quantity: orderQuantity,
            entryPrice,
            takeProfitAmount,
            isPercent,
            positionSide: positionSide as 'long' | 'short',
          });
        }
        break;

      default:
        return NextResponse.json(
          { success: false, error: `Unknown setupType: ${setupType}. Use 'oco', 'stop_loss', 'take_profit', or 'both'` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: {
        type: setupType,
        ...results,
        position: {
          symbol: upperSymbol,
          entryPrice,
          quantity: orderQuantity,
          side: positionSide,
          stopLossPrice,
          takeProfitPrice,
        },
      },
    });
  } catch (error) {
    console.error('Position automation POST error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to setup position automation' },
      { status: 500 }
    );
  }
});
