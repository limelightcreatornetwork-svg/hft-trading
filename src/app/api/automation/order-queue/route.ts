/**
 * Order Queue API Routes
 * 
 * GET  - Get queue status and orders
 * POST - Add order(s) to queue or process queue
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  orderQueue,
  submitMarketOrder,
  submitLimitOrder,
  submitStopLossOrder,
  submitBracketOrder,
  cancelAllPendingOrders,
} from '@/lib/order-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
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
      orders = orderQueue.getOrdersByStatus(status as any);
    } else {
      orders = orderQueue.getAllOrders();
    }
    
    return NextResponse.json({
      success: true,
      data: {
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
      },
    });
  } catch (error) {
    console.error('GET order queue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to get order queue' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { action, ...params } = body;

    switch (action) {
      case 'process': {
        // Process the queue
        const result = await orderQueue.processQueue();
        return NextResponse.json({
          success: true,
          data: result,
        });
      }

      case 'enqueue': {
        // Add a single order
        const { order, priority, maxRetries, retryDelayMs, metadata } = params;
        
        if (!order || !order.symbol || !order.qty || !order.side || !order.type) {
          return NextResponse.json(
            { success: false, error: 'Order with symbol, qty, side, and type is required' },
            { status: 400 }
          );
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

        return NextResponse.json({
          success: true,
          data: queuedOrder,
        });
      }

      case 'batch': {
        // Add multiple orders
        const { orders } = params;
        
        if (!orders || !Array.isArray(orders) || orders.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Orders array is required' },
            { status: 400 }
          );
        }

        const queuedOrders = await orderQueue.enqueueBatch(
          orders.map((o: any) => ({
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

        return NextResponse.json({
          success: true,
          data: {
            count: queuedOrders.length,
            orders: queuedOrders,
          },
        });
      }

      case 'market': {
        // Quick market order
        const { symbol, qty, side, priority } = params;
        
        if (!symbol || !qty || !side) {
          return NextResponse.json(
            { success: false, error: 'symbol, qty, and side are required' },
            { status: 400 }
          );
        }

        const order = await submitMarketOrder(symbol, qty, side, priority);
        return NextResponse.json({
          success: true,
          data: order,
        });
      }

      case 'limit': {
        // Quick limit order
        const { symbol, qty, side, limitPrice, priority } = params;
        
        if (!symbol || !qty || !side || !limitPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, qty, side, and limitPrice are required' },
            { status: 400 }
          );
        }

        const order = await submitLimitOrder(symbol, qty, side, limitPrice, priority);
        return NextResponse.json({
          success: true,
          data: order,
        });
      }

      case 'stop-loss': {
        // Quick stop-loss order
        const { symbol, qty, stopPrice } = params;
        
        if (!symbol || !qty || !stopPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, qty, and stopPrice are required' },
            { status: 400 }
          );
        }

        const order = await submitStopLossOrder(symbol, qty, stopPrice);
        return NextResponse.json({
          success: true,
          data: order,
        });
      }

      case 'bracket': {
        // Bracket order (entry + SL + TP)
        const { symbol, qty, side, entryPrice, stopPrice, takeProfitPrice } = params;
        
        if (!symbol || !qty || !side || !entryPrice || !stopPrice || !takeProfitPrice) {
          return NextResponse.json(
            { success: false, error: 'symbol, qty, side, entryPrice, stopPrice, and takeProfitPrice are required' },
            { status: 400 }
          );
        }

        const bracket = await submitBracketOrder(
          symbol,
          qty,
          side,
          entryPrice,
          stopPrice,
          takeProfitPrice
        );
        return NextResponse.json({
          success: true,
          data: bracket,
        });
      }

      case 'cancel-all': {
        // Cancel all pending orders
        const cancelled = await cancelAllPendingOrders();
        return NextResponse.json({
          success: true,
          data: { cancelled },
        });
      }

      case 'clear-completed': {
        // Clear completed orders from queue
        const cleared = orderQueue.clearCompleted();
        return NextResponse.json({
          success: true,
          data: { cleared },
        });
      }

      case 'sync': {
        // Sync statuses with broker
        const updated = await orderQueue.syncOrderStatuses();
        return NextResponse.json({
          success: true,
          data: { updated },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}. Valid: process, enqueue, batch, market, limit, stop-loss, bracket, cancel-all, clear-completed, sync` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('POST order queue error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to process order queue action' },
      { status: 500 }
    );
  }
});
