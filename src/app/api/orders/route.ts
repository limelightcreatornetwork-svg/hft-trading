import { NextRequest, NextResponse } from 'next/server';
import { getOrders, submitOrder, cancelOrder } from '@/lib/alpaca';
import { checkIntent } from '@/lib/risk-engine';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { formatAlpacaOrder } from '@/lib/formatters';
import {
  validateSymbol,
  validateSide,
  validateOrderType,
  validatePositiveNumber,
  validateEnum,
} from '@/lib/validation';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = (searchParams.get('status') as 'open' | 'closed' | 'all') || 'open';

  const orders = await getOrders(status);
  const formattedOrders = orders.map(formatAlpacaOrder);

  return apiSuccess({
    orders: formattedOrders,
    count: formattedOrders.length,
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { timeInForce, limitPrice, stopPrice, skipRiskCheck, skipRegimeCheck } = body;
  const allowRiskBypass =
    process.env.NODE_ENV !== 'production' || process.env.HFT_ALLOW_RISK_BYPASS === 'true';
  const shouldSkipRiskCheck = allowRiskBypass && !!skipRiskCheck;
  const shouldSkipRegimeCheck = allowRiskBypass && !!skipRegimeCheck;

  // Validate required fields with proper type checking
  const symbolResult = validateSymbol(body.symbol);
  if (!symbolResult.valid) {
    return apiError(symbolResult.error, 400);
  }

  const sideResult = validateSide(body.side?.toLowerCase?.());
  if (!sideResult.valid) {
    return apiError(sideResult.error, 400);
  }

  const quantityResult = validatePositiveNumber(body.quantity, 'quantity', { integer: true });
  if (!quantityResult.valid) {
    return apiError(quantityResult.error, 400);
  }

  const typeResult = validateOrderType(body.type?.toLowerCase?.());
  if (!typeResult.valid) {
    return apiError(typeResult.error, 400);
  }

  // Validate limitPrice is required for limit orders
  if (typeResult.value === 'limit') {
    const limitPriceResult = validatePositiveNumber(limitPrice, 'limitPrice');
    if (!limitPriceResult.valid) {
      return apiError('limitPrice is required for limit orders', 400);
    }
  }

  // Validate timeInForce if provided
  if (timeInForce) {
    const tifResult = validateEnum(timeInForce, 'timeInForce', ['day', 'gtc', 'opg', 'ioc', 'fok'] as const);
    if (!tifResult.valid) {
      return apiError(tifResult.error, 400);
    }
  }

  const symbol = symbolResult.value;
  const side = sideResult.value;
  const quantity = quantityResult.value;
  const type = typeResult.value;

  // Run risk checks unless explicitly skipped
  if (!shouldSkipRiskCheck) {
    const riskResult = await checkIntent({
      symbol,
      side,
      quantity,
      orderType: type,
      limitPrice,
      strategy: 'manual',
      skipRegimeCheck: shouldSkipRegimeCheck || false,
    });

    if (!riskResult.approved) {
      return NextResponse.json({
        success: false,
        error: 'Order rejected by risk engine',
        reason: riskResult.reason,
        checks: riskResult.checks,
      }, { status: 403 });
    }
  }

  // Submit order to Alpaca
  const order = await submitOrder({
    symbol,
    qty: quantity,
    side,
    type,
    time_in_force: timeInForce || 'day',
    limit_price: limitPrice,
    stop_price: stopPrice,
  });

  return apiSuccess({
    id: order.id,
    clientOrderId: order.client_order_id,
    symbol: order.symbol,
    side: order.side,
    type: order.type,
    quantity: parseFloat(order.qty),
    status: order.status,
    submittedAt: order.submitted_at,
  });
});

export const DELETE = apiHandler(async function DELETE(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const orderId = searchParams.get('id');

  if (!orderId) {
    return apiError('Order ID required', 400);
  }

  await cancelOrder(orderId);

  return apiSuccess({ message: `Order ${orderId} cancelled` });
});
