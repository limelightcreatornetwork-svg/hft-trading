import { NextRequest, NextResponse } from 'next/server';
import { getOrders, submitOrder, cancelOrder } from '@/lib/alpaca';
import { checkIntent } from '@/lib/risk-engine';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = (searchParams.get('status') as 'open' | 'closed' | 'all') || 'open';
    
    const orders = await getOrders(status);
    
    const formattedOrders = orders.map(order => ({
      id: order.id,
      clientOrderId: order.client_order_id,
      symbol: order.symbol,
      assetClass: order.asset_class,
      quantity: parseFloat(order.qty),
      filledQuantity: parseFloat(order.filled_qty),
      type: order.type,
      side: order.side,
      timeInForce: order.time_in_force,
      limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
      stopPrice: order.stop_price ? parseFloat(order.stop_price) : null,
      filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
      status: order.status,
      extendedHours: order.extended_hours,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      submittedAt: order.submitted_at,
      filledAt: order.filled_at,
      canceledAt: order.canceled_at,
    }));

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
        error: error instanceof Error ? error.message : 'Failed to fetch orders' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, quantity, side, type, timeInForce, limitPrice, stopPrice, skipRiskCheck } = body;

    // Validate required fields
    if (!symbol || !quantity || !side || !type) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, quantity, side, type' },
        { status: 400 }
      );
    }

    // Run risk checks unless explicitly skipped
    if (!skipRiskCheck) {
      const riskResult = await checkIntent({
        symbol,
        side,
        quantity,
        orderType: type === 'limit' ? 'limit' : 'market',
        limitPrice,
        strategy: 'manual',
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
      symbol: symbol.toUpperCase(),
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
        error: error instanceof Error ? error.message : 'Failed to submit order' 
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
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
        error: error instanceof Error ? error.message : 'Failed to cancel order' 
      },
      { status: 500 }
    );
  }
}
