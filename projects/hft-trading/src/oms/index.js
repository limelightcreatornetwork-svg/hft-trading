/**
 * @fileoverview Order Management System (OMS)
 *
 * Handles order lifecycle management including:
 * - Order state machine
 * - Idempotent order submission
 * - Order reconciliation
 * - Fill tracking
 *
 * @module oms
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../libs/logger.js';
import { config } from '../libs/config.js';

/**
 * Order states
 */
const OrderState = {
  NEW: 'new',
  SUBMITTED: 'submitted',
  ACCEPTED: 'accepted',
  PARTIAL: 'partial_fill',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

/**
 * In-memory stores (replace with database in production)
 */
const intents = new Map();
const orders = new Map();
const positions = new Map();

/**
 * Order Management System
 */
export const oms = {
  /**
   * Get current account state
   */
  async getState() {
    // TODO: Fetch from Alpaca API
    return {
      mode: config.alpaca.paper ? 'paper' : 'live',
      balances: {
        buying_power: 0,
        cash: 0,
        portfolio_value: 0,
      },
      positions: Array.from(positions.entries()).map(([symbol, data]) => ({
        symbol,
        ...data,
      })),
      open_orders: Array.from(orders.values())
        .filter(o => !['filled', 'cancelled', 'rejected', 'expired'].includes(o.status)),
      risk_headroom: {
        // Will be populated by risk engine
      },
    };
  },

  /**
   * Get intent by client ID (for idempotency check)
   */
  async getIntentByClientId(clientIntentId) {
    return intents.get(clientIntentId) || null;
  },

  /**
   * Submit a trade intent
   */
  async submitIntent(intent, riskDecision) {
    const intentId = uuidv4();
    const clientOrderId = `oc_${intent.client_intent_id}`;

    // Store intent
    const intentRecord = {
      id: intentId,
      client_intent_id: intent.client_intent_id,
      symbol: intent.symbol.toUpperCase(),
      side: intent.side,
      qty: intent.qty,
      order_type: intent.type || 'limit',
      limit_price: intent.limit_price,
      time_in_force: intent.time_in_force || 'day',
      strategy: intent.meta?.strategy,
      reason: intent.meta?.reason,
      confidence: intent.meta?.confidence,
      status: 'pending',
      created_at: new Date(),
    };

    intents.set(intent.client_intent_id, intentRecord);

    // Create order
    const orderId = uuidv4();
    const orderRecord = {
      id: orderId,
      intent_id: intentId,
      client_order_id: clientOrderId,
      alpaca_order_id: null, // Will be set after submission
      symbol: intent.symbol.toUpperCase(),
      side: intent.side,
      qty: intent.qty,
      filled_qty: 0,
      order_type: intent.type || 'limit',
      limit_price: intent.limit_price,
      avg_fill_price: null,
      status: OrderState.NEW,
      created_at: new Date(),
    };

    orders.set(orderId, orderRecord);

    // TODO: Submit to Alpaca API
    // For now, simulate acceptance
    orderRecord.status = OrderState.SUBMITTED;
    intentRecord.status = 'submitted';
    intentRecord.order_id = orderId;

    logger.info({
      intentId,
      orderId,
      symbol: intent.symbol,
      side: intent.side,
      qty: intent.qty,
    }, 'Intent submitted');

    return {
      intent_id: intentId,
      order_id: orderId,
    };
  },

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    const order = orders.get(orderId);

    if (!order) {
      return { success: false, reason: 'Order not found' };
    }

    if (['filled', 'cancelled', 'rejected'].includes(order.status)) {
      return {
        success: true,
        message: 'Order already in terminal state',
        status: order.status,
      };
    }

    // TODO: Send cancel request to Alpaca
    order.status = OrderState.CANCELLED;
    order.cancelled_at = new Date();

    logger.info({ orderId, symbol: order.symbol }, 'Order cancelled');

    return { success: true, status: 'cancelled' };
  },

  /**
   * Get open orders
   */
  async getOpenOrders() {
    return Array.from(orders.values())
      .filter(o => !['filled', 'cancelled', 'rejected', 'expired'].includes(o.status));
  },

  /**
   * Handle order update from Alpaca WebSocket
   */
  handleOrderUpdate(update) {
    const order = Array.from(orders.values())
      .find(o => o.alpaca_order_id === update.order.id || o.client_order_id === update.order.client_order_id);

    if (!order) {
      logger.warn({ update }, 'Received update for unknown order');
      return;
    }

    const prevStatus = order.status;

    switch (update.event) {
      case 'new':
        order.status = OrderState.ACCEPTED;
        order.alpaca_order_id = update.order.id;
        break;

      case 'fill':
      case 'partial_fill':
        order.filled_qty = parseInt(update.order.filled_qty, 10);
        order.avg_fill_price = parseFloat(update.order.filled_avg_price);
        order.status = order.filled_qty >= order.qty ? OrderState.FILLED : OrderState.PARTIAL;
        
        if (update.event === 'fill') {
          order.filled_at = new Date();
        }
        break;

      case 'canceled':
        order.status = OrderState.CANCELLED;
        order.cancelled_at = new Date();
        break;

      case 'rejected':
        order.status = OrderState.REJECTED;
        break;

      case 'expired':
        order.status = OrderState.EXPIRED;
        break;
    }

    logger.info({
      orderId: order.id,
      event: update.event,
      prevStatus,
      newStatus: order.status,
      filledQty: order.filled_qty,
    }, 'Order state updated');
  },

  /**
   * Reconcile orders on startup
   */
  async reconcile() {
    logger.info('Starting order reconciliation...');
    
    // TODO: Fetch open orders from Alpaca
    // Compare with local state
    // Update discrepancies

    logger.info('Order reconciliation complete');
  },
};
