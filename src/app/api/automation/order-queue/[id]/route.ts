/**
 * Individual Order Queue API Routes
 *
 * GET    - Get a specific queued order
 * DELETE - Cancel a queued order
 */

import { NextRequest } from 'next/server';
import { orderQueue } from '@/lib/order-queue';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<Record<string, string>> };

export const GET = apiHandler(async function GET(
  _request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;

  const order = orderQueue.getOrder(id);

  if (!order) {
    return apiError('Order not found', 404);
  }

  return apiSuccess({
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
  });
});

export const DELETE = apiHandler(async function DELETE(
  _request: NextRequest,
  context?: RouteContext
) {
  const { id } = await context!.params;

  const result = await orderQueue.cancelOrder(id);

  if (!result) {
    return apiError('Could not cancel order (may already be completed)', 400);
  }

  return apiSuccess({ message: 'Order cancelled' });
});
