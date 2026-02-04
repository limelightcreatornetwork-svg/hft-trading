/**
 * Order Queue API Routes
 *
 * GET  - Get queue status and orders
 * POST - Add order(s) to queue or process queue
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  orderQueue,
  submitMarketOrder,
  submitLimitOrder,
  submitStopLossOrder,
  submitBracketOrder,
  cancelAllPendingOrders,
  QueuedOrderStatus,
} from '@/lib/order-queue';

interface BatchOrderInput {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force?: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  metadata?: Record<string, unknown>;
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const sync = searchParams.get('sync') === 'true';

  // Optionally sync with broker first
  if (sync) {
    await orderQueue.syncOrderStatuses();
  }

  const stats = orderQueue.getStats();

  let orders;
  if (status) {
    orders = orderQueue.getOrdersByStatus(status as QueuedOrderStatus);
  } else {
    orders = orderQueue.getAllOrders();
  }

  return apiSuccess({
    stats,
    orders: orders.map(o => ({
      id: o.id,
      symbol: o.order.symbol,
      qty: o.order.qty,
      side: o.order.side,
      type: o.order.type,
      limitPrice: o.order.limit_price,
      stopPrice: o.order.stop_price,
      priority: o.priority,
      status: o.status,
      brokerOrderId: o.brokerOrderId,
      retryCount: o.retryCount,
      maxRetries: o.maxRetries,
      lastError: o.lastError,
      filledQty: o.filledQty,
      avgFillPrice: o.avgFillPrice,
      createdAt: o.createdAt,
      submittedAt: o.submittedAt,
      completedAt: o.completedAt,
      metadata: o.metadata,
    })),
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();

  const { action, ...params } = body;

  switch (action) {
    case 'process': {
      // Process the queue
      const result = await orderQueue.processQueue();
      return apiSuccess(result);
    }

    case 'enqueue': {
      // Add a single order
      const { order, priority, maxRetries, retryDelayMs, metadata } = params;

      if (!order || !order.symbol || !order.qty || !order.side || !order.type) {
        return apiError('Order with symbol, qty, side, and type is required', 400);
      }

      const queuedOrder = await orderQueue.enqueue(
        {
          symbol: order.symbol,
          qty: order.qty,
          side: order.side,
          type: order.type,
          time_in_force: order.time_in_force || 'day',
          limit_price: order.limit_price,
          stop_price: order.stop_price,
        },
        { priority, maxRetries, retryDelayMs, metadata }
      );

      return apiSuccess(queuedOrder);
    }

    case 'batch': {
      // Add multiple orders
      const { orders } = params;

      if (!orders || !Array.isArray(orders) || orders.length === 0) {
        return apiError('Orders array is required', 400);
      }

      const queuedOrders = await orderQueue.enqueueBatch(
        orders.map((o: BatchOrderInput) => ({
          order: {
            symbol: o.symbol,
            qty: o.qty,
            side: o.side,
            type: o.type,
            time_in_force: o.time_in_force || 'day',
            limit_price: o.limit_price,
            stop_price: o.stop_price,
          },
          priority: o.priority,
          metadata: o.metadata,
        }))
      );

      return apiSuccess({
        count: queuedOrders.length,
        orders: queuedOrders,
      });
    }

    case 'market': {
      // Quick market order
      const { symbol, qty, side, priority } = params;

      if (!symbol || !qty || !side) {
        return apiError('symbol, qty, and side are required', 400);
      }

      const order = await submitMarketOrder(symbol, qty, side, priority);
      return apiSuccess(order);
    }

    case 'limit': {
      // Quick limit order
      const { symbol, qty, side, limitPrice, priority } = params;

      if (!symbol || !qty || !side || !limitPrice) {
        return apiError('symbol, qty, side, and limitPrice are required', 400);
      }

      const order = await submitLimitOrder(symbol, qty, side, limitPrice, priority);
      return apiSuccess(order);
    }

    case 'stop-loss': {
      // Quick stop-loss order
      const { symbol, qty, stopPrice } = params;

      if (!symbol || !qty || !stopPrice) {
        return apiError('symbol, qty, and stopPrice are required', 400);
      }

      const order = await submitStopLossOrder(symbol, qty, stopPrice);
      return apiSuccess(order);
    }

    case 'bracket': {
      // Bracket order (entry + SL + TP)
      const { symbol, qty, side, entryPrice, stopPrice, takeProfitPrice } = params;

      if (!symbol || !qty || !side || !entryPrice || !stopPrice || !takeProfitPrice) {
        return apiError('symbol, qty, side, entryPrice, stopPrice, and takeProfitPrice are required', 400);
      }

      const bracket = await submitBracketOrder(
        symbol,
        qty,
        side,
        entryPrice,
        stopPrice,
        takeProfitPrice
      );
      return apiSuccess(bracket);
    }

    case 'cancel-all': {
      // Cancel all pending orders
      const cancelled = await cancelAllPendingOrders();
      return apiSuccess({ cancelled });
    }

    case 'clear-completed': {
      // Clear completed orders from queue
      const cleared = orderQueue.clearCompleted();
      return apiSuccess({ cleared });
    }

    case 'sync': {
      // Sync statuses with broker
      const updated = await orderQueue.syncOrderStatuses();
      return apiSuccess({ updated });
    }

    default:
      return apiError(`Unknown action: ${action}. Valid: process, enqueue, batch, market, limit, stop-loss, bracket, cancel-all, clear-completed, sync`, 400);
  }
});
