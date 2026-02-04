/**
 * GET /api/automation/position/[symbol] - Get automation rules for a position
 * POST /api/automation/position/[symbol] - Quick setup automation for a position
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { getPositions, getLatestQuote } from '@/lib/alpaca';
import {
  getRulesForPosition,
  createOCORule,
  createStopLossRule,
  createTakeProfitRule,
} from '@/lib/automation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = apiHandler(async function GET(
  _request: NextRequest,
  context?: RouteContext
) {
  if (!context?.params) {
    return apiError('Missing route parameters', 400);
  }
  const params = await context.params;
  const symbol = params.symbol;
  if (!symbol) {
    return apiError('Symbol is required', 400);
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

  return apiSuccess({
    position: positionData,
    currentPrice,
    rules,
    rulesCount: rules.length,
    hasStopLoss: rules.some(r => r.ruleType === 'STOP_LOSS' || (r.ruleType === 'OCO' && r.triggerType.includes('LOSS'))),
    hasTakeProfit: rules.some(r => r.ruleType === 'TAKE_PROFIT' || (r.ruleType === 'OCO' && r.triggerType.includes('GAIN'))),
  });
});

export const POST = apiHandler(async function POST(
  request: NextRequest,
  context?: RouteContext
) {
  if (!context?.params) {
    return apiError('Missing route parameters', 400);
  }
  const params = await context.params;
  const symbol = params.symbol;
  if (!symbol) {
    return apiError('Symbol is required', 400);
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
    return apiError(`No position found for ${upperSymbol}`, 404);
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
        return apiError('Both stopLossAmount and takeProfitAmount required for OCO', 400);
      }
      const ocoResult = await createOCORule({
        symbol: upperSymbol,
        quantity: orderQuantity,
        entryPrice,
        stopLossPrice,
        takeProfitPrice,
      });
      return apiSuccess({
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
      });

    case 'stop_loss':
      if (!stopLossPrice) {
        return apiError('stopLossAmount required for stop loss', 400);
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
        return apiError('takeProfitAmount required for take profit', 400);
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
      return apiError(`Unknown setupType: ${setupType}. Use 'oco', 'stop_loss', 'take_profit', or 'both'`, 400);
  }

  return apiSuccess({
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
  });
});
