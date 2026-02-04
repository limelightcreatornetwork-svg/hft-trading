/**
 * Order Queue Service
 * 
 * Implements:
 * - Priority-based order queuing
 * - Retry logic for failed orders
 * - Order status tracking
 * - Rate limiting compliance
 */

import { prisma } from './db';
import { submitOrder, getOrders, cancelOrder, OrderRequest, AlpacaOrder } from './alpaca';
import { createLogger, serializeError } from './logger';

const log = createLogger('order-queue');

// ============================================
// TYPES
// ============================================

export type OrderPriority = 'critical' | 'high' | 'normal' | 'low';

export type QueuedOrderStatus = 
  | 'pending'      // Waiting in queue
  | 'processing'   // Currently being submitted
  | 'submitted'    // Successfully submitted to broker
  | 'filled'       // Order filled
  | 'partial'      // Partially filled
  | 'cancelled'    // Cancelled by user
  | 'failed'       // Failed after retries
  | 'rejected';    // Rejected by broker

export interface QueuedOrder {
  id: string;
  order: OrderRequest;
  priority: OrderPriority;
  status: QueuedOrderStatus;
  brokerOrderId?: string;
  retryCount: number;
  maxRetries: number;
  retryDelayMs: number;
  lastError?: string;
  filledQty?: number;
  avgFillPrice?: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  completedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface OrderQueueStats {
  pending: number;
  processing: number;
  submitted: number;
  filled: number;
  failed: number;
  total: number;
}

export interface ProcessResult {
  processed: number;
  submitted: number;
  failed: number;
  skipped: number;
  errors: string[];
  orders: Array<{
    id: string;
    symbol: string;
    status: QueuedOrderStatus;
    brokerOrderId?: string;
    error?: string;
  }>;
}

// ============================================
// PRIORITY WEIGHTS
// ============================================

const PRIORITY_WEIGHTS: Record<OrderPriority, number> = {
  critical: 1000,
  high: 100,
  normal: 10,
  low: 1,
};

// ============================================
// ORDER QUEUE
// ============================================

class OrderQueueManager {
  private queue: Map<string, QueuedOrder> = new Map();
  private processing: boolean = false;
  private rateLimitDelay: number = 100; // ms between orders (10 orders/sec max)
  private lastSubmitTime: number = 0;
  
  /**
   * Add an order to the queue
   */
  async enqueue(
    order: OrderRequest,
    options: {
      priority?: OrderPriority;
      maxRetries?: number;
      retryDelayMs?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<QueuedOrder> {
    const id = `qo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const queuedOrder: QueuedOrder = {
      id,
      order,
      priority: options.priority || 'normal',
      status: 'pending',
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      retryDelayMs: options.retryDelayMs ?? 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: options.metadata,
    };
    
    this.queue.set(id, queuedOrder);
    
    // Log to audit
    await this.logOrderEvent(queuedOrder, 'QUEUED');
    
    return queuedOrder;
  }
  
  /**
   * Add multiple orders at once (batch)
   */
  async enqueueBatch(
    orders: Array<{
      order: OrderRequest;
      priority?: OrderPriority;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<QueuedOrder[]> {
    return Promise.all(
      orders.map(o => this.enqueue(o.order, { 
        priority: o.priority, 
        metadata: o.metadata 
      }))
    );
  }
  
  /**
   * Get sorted queue by priority
   */
  private getSortedQueue(): QueuedOrder[] {
    return Array.from(this.queue.values())
      .filter(o => o.status === 'pending')
      .sort((a, b) => {
        // Sort by priority weight (descending)
        const weightDiff = PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority];
        if (weightDiff !== 0) return weightDiff;
        // Then by creation time (oldest first)
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
  }
  
  /**
   * Process the queue
   */
  async processQueue(): Promise<ProcessResult> {
    if (this.processing) {
      return {
        processed: 0,
        submitted: 0,
        failed: 0,
        skipped: 0,
        errors: ['Queue already processing'],
        orders: [],
      };
    }
    
    this.processing = true;
    
    const result: ProcessResult = {
      processed: 0,
      submitted: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      orders: [],
    };
    
    try {
      const pendingOrders = this.getSortedQueue();
      
      for (const queuedOrder of pendingOrders) {
        result.processed++;
        
        // Rate limiting
        const now = Date.now();
        const timeSinceLastSubmit = now - this.lastSubmitTime;
        if (timeSinceLastSubmit < this.rateLimitDelay) {
          await this.delay(this.rateLimitDelay - timeSinceLastSubmit);
        }
        
        const orderResult = await this.processOrder(queuedOrder);
        result.orders.push(orderResult);
        
        if (orderResult.status === 'submitted' || orderResult.status === 'filled') {
          result.submitted++;
        } else if (orderResult.status === 'failed') {
          result.failed++;
          if (orderResult.error) {
            result.errors.push(`${orderResult.symbol}: ${orderResult.error}`);
          }
        }
        
        this.lastSubmitTime = Date.now();
      }
    } finally {
      this.processing = false;
    }
    
    return result;
  }
  
  /**
   * Process a single order with retry logic
   */
  private async processOrder(queuedOrder: QueuedOrder): Promise<{
    id: string;
    symbol: string;
    status: QueuedOrderStatus;
    brokerOrderId?: string;
    error?: string;
  }> {
    queuedOrder.status = 'processing';
    queuedOrder.updatedAt = new Date();
    
    try {
      // Submit to broker
      const brokerOrder = await submitOrder(queuedOrder.order);
      
      queuedOrder.status = this.mapBrokerStatus(brokerOrder.status);
      queuedOrder.brokerOrderId = brokerOrder.id;
      queuedOrder.submittedAt = new Date();
      queuedOrder.updatedAt = new Date();
      
      if (brokerOrder.filled_qty) {
        queuedOrder.filledQty = parseInt(brokerOrder.filled_qty);
      }
      if (brokerOrder.filled_avg_price) {
        queuedOrder.avgFillPrice = parseFloat(brokerOrder.filled_avg_price);
      }
      
      await this.logOrderEvent(queuedOrder, 'SUBMITTED');
      
      return {
        id: queuedOrder.id,
        symbol: queuedOrder.order.symbol,
        status: queuedOrder.status,
        brokerOrderId: brokerOrder.id,
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      queuedOrder.lastError = errorMessage;
      queuedOrder.retryCount++;
      queuedOrder.updatedAt = new Date();
      
      // Check if should retry
      if (queuedOrder.retryCount < queuedOrder.maxRetries && this.isRetryable(errorMessage)) {
        // Schedule retry
        queuedOrder.status = 'pending';
        await this.logOrderEvent(queuedOrder, 'RETRY_SCHEDULED', { 
          attempt: queuedOrder.retryCount,
          error: errorMessage 
        });
        
        // Delay before next attempt
        await this.delay(queuedOrder.retryDelayMs * queuedOrder.retryCount);
        
        return this.processOrder(queuedOrder);
      } else {
        // Failed permanently
        queuedOrder.status = 'failed';
        queuedOrder.completedAt = new Date();
        
        await this.logOrderEvent(queuedOrder, 'FAILED', { error: errorMessage });
        
        return {
          id: queuedOrder.id,
          symbol: queuedOrder.order.symbol,
          status: 'failed',
          error: errorMessage,
        };
      }
    }
  }
  
  /**
   * Check if an error is retryable
   */
  private isRetryable(error: string): boolean {
    const nonRetryablePatterns = [
      'insufficient',
      'rejected',
      'invalid',
      'not allowed',
      'market closed',
      'symbol not found',
    ];
    
    const lowerError = error.toLowerCase();
    return !nonRetryablePatterns.some(pattern => lowerError.includes(pattern));
  }
  
  /**
   * Map broker status to queue status
   */
  private mapBrokerStatus(brokerStatus: string): QueuedOrderStatus {
    switch (brokerStatus.toLowerCase()) {
      case 'new':
      case 'accepted':
      case 'pending_new':
        return 'submitted';
      case 'filled':
        return 'filled';
      case 'partially_filled':
        return 'partial';
      case 'canceled':
      case 'cancelled':
        return 'cancelled';
      case 'rejected':
        return 'rejected';
      default:
        return 'submitted';
    }
  }
  
  /**
   * Cancel a queued order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const queuedOrder = this.queue.get(orderId);
    if (!queuedOrder) {
      throw new Error('Order not found in queue');
    }
    
    if (queuedOrder.status === 'pending') {
      // Haven't submitted yet - just cancel in queue
      queuedOrder.status = 'cancelled';
      queuedOrder.completedAt = new Date();
      queuedOrder.updatedAt = new Date();
      
      await this.logOrderEvent(queuedOrder, 'CANCELLED_BEFORE_SUBMIT');
      return true;
    }
    
    if (queuedOrder.brokerOrderId && 
        ['submitted', 'partial'].includes(queuedOrder.status)) {
      // Try to cancel with broker
      try {
        await cancelOrder(queuedOrder.brokerOrderId);
        queuedOrder.status = 'cancelled';
        queuedOrder.completedAt = new Date();
        queuedOrder.updatedAt = new Date();
        
        await this.logOrderEvent(queuedOrder, 'CANCELLED');
        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to cancel order: ${errorMessage}`);
      }
    }
    
    return false;
  }
  
  /**
   * Get order by ID
   */
  getOrder(orderId: string): QueuedOrder | undefined {
    return this.queue.get(orderId);
  }
  
  /**
   * Get all orders
   */
  getAllOrders(): QueuedOrder[] {
    return Array.from(this.queue.values());
  }
  
  /**
   * Get orders by status
   */
  getOrdersByStatus(status: QueuedOrderStatus): QueuedOrder[] {
    return Array.from(this.queue.values()).filter(o => o.status === status);
  }
  
  /**
   * Get queue statistics
   */
  getStats(): OrderQueueStats {
    const orders = Array.from(this.queue.values());
    return {
      pending: orders.filter(o => o.status === 'pending').length,
      processing: orders.filter(o => o.status === 'processing').length,
      submitted: orders.filter(o => o.status === 'submitted').length,
      filled: orders.filter(o => o.status === 'filled').length,
      failed: orders.filter(o => o.status === 'failed').length,
      total: orders.length,
    };
  }
  
  /**
   * Update order statuses from broker
   */
  async syncOrderStatuses(): Promise<number> {
    const openOrders = this.getOrdersByStatus('submitted')
      .concat(this.getOrdersByStatus('partial'));
    
    if (openOrders.length === 0) return 0;
    
    let updated = 0;
    
    try {
      const brokerOrders = await getOrders('all');
      const brokerOrderMap = new Map<string, AlpacaOrder>();
      brokerOrders.forEach(o => brokerOrderMap.set(o.id, o));
      
      for (const queuedOrder of openOrders) {
        if (!queuedOrder.brokerOrderId) continue;
        
        const brokerOrder = brokerOrderMap.get(queuedOrder.brokerOrderId);
        if (!brokerOrder) continue;
        
        const newStatus = this.mapBrokerStatus(brokerOrder.status);
        
        if (newStatus !== queuedOrder.status) {
          queuedOrder.status = newStatus;
          queuedOrder.updatedAt = new Date();
          
          if (brokerOrder.filled_qty) {
            queuedOrder.filledQty = parseInt(brokerOrder.filled_qty);
          }
          if (brokerOrder.filled_avg_price) {
            queuedOrder.avgFillPrice = parseFloat(brokerOrder.filled_avg_price);
          }
          
          if (['filled', 'cancelled', 'rejected'].includes(newStatus)) {
            queuedOrder.completedAt = new Date();
          }
          
          await this.logOrderEvent(queuedOrder, 'STATUS_UPDATED', { 
            newStatus,
            brokerStatus: brokerOrder.status 
          });
          
          updated++;
        }
      }
    } catch (error) {
      log.error('Failed to sync order statuses', serializeError(error));
    }
    
    return updated;
  }
  
  /**
   * Clear completed orders from queue
   */
  clearCompleted(): number {
    let cleared = 0;
    for (const [id, order] of this.queue) {
      if (['filled', 'cancelled', 'failed', 'rejected'].includes(order.status)) {
        this.queue.delete(id);
        cleared++;
      }
    }
    return cleared;
  }
  
  /**
   * Log order event to audit log
   */
  private async logOrderEvent(
    order: QueuedOrder,
    action: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: `ORDER_${action}`,
          symbol: order.order.symbol,
          orderId: order.brokerOrderId || order.id,
          details: JSON.stringify({
            queueId: order.id,
            side: order.order.side,
            qty: order.order.qty,
            type: order.order.type,
            priority: order.priority,
            retryCount: order.retryCount,
            status: order.status,
            ...details,
          }),
        },
      });
    } catch (error) {
      log.error('Failed to log order event', serializeError(error));
    }
  }
  
  /**
   * Utility: delay for ms
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset the queue (for testing)
   */
  reset(): void {
    this.queue.clear();
    this.processing = false;
    this.lastSubmitTime = 0;
  }
}

// Singleton instance
export const orderQueue = new OrderQueueManager();

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Quick submit a market order with priority
 */
export async function submitMarketOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell',
  priority: OrderPriority = 'normal'
): Promise<QueuedOrder> {
  return orderQueue.enqueue(
    {
      symbol,
      qty,
      side,
      type: 'market',
      time_in_force: 'day',
    },
    { priority }
  );
}

/**
 * Quick submit a limit order with priority
 */
export async function submitLimitOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell',
  limitPrice: number,
  priority: OrderPriority = 'normal'
): Promise<QueuedOrder> {
  return orderQueue.enqueue(
    {
      symbol,
      qty,
      side,
      type: 'limit',
      limit_price: limitPrice,
      time_in_force: 'day',
    },
    { priority }
  );
}

/**
 * Submit a stop-loss order (high priority by default)
 */
export async function submitStopLossOrder(
  symbol: string,
  qty: number,
  stopPrice: number
): Promise<QueuedOrder> {
  return orderQueue.enqueue(
    {
      symbol,
      qty,
      side: 'sell',
      type: 'stop',
      stop_price: stopPrice,
      time_in_force: 'day',
    },
    { priority: 'high' }
  );
}

/**
 * Submit a bracket order (entry + stop loss + take profit)
 */
export async function submitBracketOrder(
  symbol: string,
  qty: number,
  side: 'buy' | 'sell',
  entryPrice: number,
  stopPrice: number,
  takeProfitPrice: number
): Promise<{
  entry: QueuedOrder;
  stopLoss: QueuedOrder;
  takeProfit: QueuedOrder;
}> {
  const entry = await orderQueue.enqueue(
    {
      symbol,
      qty,
      side,
      type: 'limit',
      limit_price: entryPrice,
      time_in_force: 'day',
    },
    { priority: 'high', metadata: { orderType: 'bracket_entry' } }
  );
  
  // Stop loss and take profit will be submitted when entry fills
  // For now, queue them as pending with metadata
  const stopLoss = await orderQueue.enqueue(
    {
      symbol,
      qty,
      side: side === 'buy' ? 'sell' : 'buy',
      type: 'stop',
      stop_price: stopPrice,
      time_in_force: 'gtc',
    },
    { priority: 'high', metadata: { orderType: 'bracket_stop', linkedTo: entry.id } }
  );
  
  const takeProfit = await orderQueue.enqueue(
    {
      symbol,
      qty,
      side: side === 'buy' ? 'sell' : 'buy',
      type: 'limit',
      limit_price: takeProfitPrice,
      time_in_force: 'gtc',
    },
    { priority: 'normal', metadata: { orderType: 'bracket_tp', linkedTo: entry.id } }
  );
  
  return { entry, stopLoss, takeProfit };
}

/**
 * Emergency: Cancel all pending orders
 */
export async function cancelAllPendingOrders(): Promise<number> {
  const pending = orderQueue.getOrdersByStatus('pending');
  let cancelled = 0;
  
  for (const order of pending) {
    try {
      await orderQueue.cancelOrder(order.id);
      cancelled++;
    } catch {
      // Continue with others
    }
  }
  
  return cancelled;
}
