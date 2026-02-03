/**
 * Individual Order Queue API Routes
 * 
 * GET    - Get a specific queued order
 * DELETE - Cancel a queued order
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { orderQueue } from '@/lib/order-queue';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = withAuth(async function GET(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;

    const order = orderQueue.getOrder(id);
    
    if (!order) {
      return NextResponse.json(
        { success: false, error: 'Order not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: order.id,
        symbol: order.order.symbol,
        qty: order.order.qty,
        side: order.order.side,
        type: order.order.type,
        limitPrice: order.order.limit_price,
        stopPrice: order.order.stop_price,
        priority: order.priority,
        status: order.status,
        brokerOrderId: order.brokerOrderId,
        retryCount: order.retryCount,
        maxRetries: order.maxRetries,
        lastError: order.lastError,
        filledQty: order.filledQty,
        avgFillPrice: order.avgFillPrice,
        createdAt: order.createdAt,
        submittedAt: order.submittedAt,
        completedAt: order.completedAt,
        metadata: order.metadata,
      },
    });
  } catch (error) {
    console.error('GET queued order error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get queued order' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuth(async function DELETE(
  request: NextRequest,
  context: RouteParams
) {
  try {
    const { id } = await context.params;

    const result = await orderQueue.cancelOrder(id);

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Could not cancel order (may already be completed)' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Order cancelled',
    });
  } catch (error) {
    console.error('DELETE queued order error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to cancel queued order' },
      { status: 500 }
    );
  }
});
