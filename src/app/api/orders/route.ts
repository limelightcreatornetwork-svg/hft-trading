import { NextRequest, NextResponse } from 'next/server';
import { getOrders, submitOrder, cancelOrder } from '@/lib/alpaca';
import { checkIntent } from '@/lib/risk-engine';
import { withAuth } from '@/lib/api-auth';
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

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') as 'open' | 'closed' | 'all') || 'open';
    
    const orders = await getOrders(status);
    
    const formattedOrders = orders.map(formatAlpacaOrder);

    return NextResponse.json({
      success: true,
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
      },
    });
  } catch (error) {
    console.error('Orders GET API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch orders'
      },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { timeInForce, limitPrice, stopPrice, skipRiskCheck, skipRegimeCheck } = body;

    // Validate required fields with proper type checking
    const symbolResult = validateSymbol(body.symbol);
    if (!symbolResult.valid) {
      return NextResponse.json(
        { success: false, error: symbolResult.error },
        { status: 400 }
      );
    }

    const sideResult = validateSide(body.side?.toLowerCase?.());
    if (!sideResult.valid) {
      return NextResponse.json(
        { success: false, error: sideResult.error },
        { status: 400 }
      );
    }

    const quantityResult = validatePositiveNumber(body.quantity, 'quantity', { integer: true });
    if (!quantityResult.valid) {
      return NextResponse.json(
        { success: false, error: quantityResult.error },
        { status: 400 }
      );
    }

    const typeResult = validateOrderType(body.type?.toLowerCase?.());
    if (!typeResult.valid) {
      return NextResponse.json(
        { success: false, error: typeResult.error },
        { status: 400 }
      );
    }

    // Validate limitPrice is required for limit orders
    if (typeResult.value === 'limit') {
      const limitPriceResult = validatePositiveNumber(limitPrice, 'limitPrice');
      if (!limitPriceResult.valid) {
        return NextResponse.json(
          { success: false, error: 'limitPrice is required for limit orders' },
          { status: 400 }
        );
      }
    }

    // Validate timeInForce if provided
    if (timeInForce) {
      const tifResult = validateEnum(timeInForce, 'timeInForce', ['day', 'gtc', 'opg', 'ioc', 'fok'] as const);
      if (!tifResult.valid) {
        return NextResponse.json(
          { success: false, error: tifResult.error },
          { status: 400 }
        );
      }
    }

    const symbol = symbolResult.value;
    const side = sideResult.value;
    const quantity = quantityResult.value;
    const type = typeResult.value;

    // Run risk checks unless explicitly skipped
    if (!skipRiskCheck) {
      const riskResult = await checkIntent({
        symbol,
        side,
        quantity,
        orderType: type,
        limitPrice,
        strategy: 'manual',
        skipRegimeCheck: skipRegimeCheck || false,
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

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        clientOrderId: order.client_order_id,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: parseFloat(order.qty),
        status: order.status,
        submittedAt: order.submitted_at,
      },
    });
  } catch (error) {
    console.error('Orders POST API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to submit order'
      },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID required' },
        { status: 400 }
      );
    }

    await cancelOrder(orderId);

    return NextResponse.json({
      success: true,
      message: `Order ${orderId} cancelled`,
    });
  } catch (error) {
    console.error('Orders DELETE API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to cancel order'
      },
      { status: 500 }
    );
  }
});
