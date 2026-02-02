/**
 * @fileoverview OMS State Machine with full idempotency support
 * 
 * Implements a robust order state machine with:
 * - Strict state transition validation
 * - Idempotency via client_order_id
 * - Reconciliation support
 * - Event sourcing foundation
 * 
 * @module core/oms-state-machine
 */

import { v4 as uuidv4 } from 'uuid';
import {
  OrderState,
  TerminalStates,
  ValidTransitions,
  IntentStatus,
  createEventId,
  createCorrelationId,
} from './types.js';
import { logger } from '../libs/logger.js';

/**
 * OMS State Machine
 * Manages order lifecycle with idempotency guarantees
 */
export class OMSStateMachine {
  constructor(options = {}) {
    // In-memory stores (replace with database in production)
    this.intents = new Map();
    this.orders = new Map();
    this.ordersByClientId = new Map();
    this.intentsByClientId = new Map();
    this.positions = new Map();
    
    // Event log for audit/replay
    this.eventLog = [];
    
    // Callbacks for external integration
    this.onStateChange = options.onStateChange || (() => {});
    this.onFill = options.onFill || (() => {});
    this.onEvent = options.onEvent || (() => {});
    
    // Statistics
    this.stats = {
      totalIntents: 0,
      acceptedIntents: 0,
      rejectedIntents: 0,
      totalOrders: 0,
      filledOrders: 0,
      canceledOrders: 0,
      rejectedOrders: 0,
      idempotentHits: 0,
      stateTransitions: 0,
      invalidTransitions: 0,
    };
    
    this.logger = options.logger || logger;
  }

  /**
   * Check if intent already exists (idempotency)
   */
  getIntentByClientId(clientIntentId) {
    return this.intentsByClientId.get(clientIntentId) || null;
  }

  /**
   * Check if order exists by client order ID
   */
  getOrderByClientId(clientOrderId) {
    return this.ordersByClientId.get(clientOrderId) || null;
  }

  /**
   * Get order by internal ID
   */
  getOrder(orderId) {
    return this.orders.get(orderId) || null;
  }

  /**
   * Create a new intent (idempotent)
   * Returns existing intent if client_intent_id already exists
   */
  createIntent(params) {
    const { client_intent_id } = params;
    
    // Idempotency check
    const existing = this.getIntentByClientId(client_intent_id);
    if (existing) {
      this.stats.idempotentHits++;
      this.logger.debug({ client_intent_id }, 'Idempotent hit: intent already exists');
      return {
        isNew: false,
        intent: existing,
      };
    }
    
    const intentId = uuidv4();
    const correlationId = createCorrelationId();
    const now = new Date();
    
    const intent = {
      id: intentId,
      client_intent_id,
      correlation_id: correlationId,
      symbol: params.symbol?.toUpperCase(),
      side: params.side,
      qty: params.qty,
      order_type: params.type || 'limit',
      limit_price: params.limit_price,
      stop_price: params.stop_price,
      time_in_force: params.time_in_force || 'day',
      extended_hours: params.extended_hours || false,
      strategy: params.meta?.strategy,
      reason: params.meta?.reason,
      confidence: params.meta?.confidence,
      tags: params.meta?.tags || [],
      status: IntentStatus.PENDING,
      order_id: null,
      created_at: now,
      updated_at: now,
      risk_decision: null,
      execution_result: null,
    };
    
    this.intents.set(intentId, intent);
    this.intentsByClientId.set(client_intent_id, intent);
    this.stats.totalIntents++;
    
    this._logEvent({
      type: 'INTENT_CREATED',
      intent_id: intentId,
      client_intent_id,
      correlation_id: correlationId,
      data: { symbol: intent.symbol, side: intent.side, qty: intent.qty },
    });
    
    return {
      isNew: true,
      intent,
    };
  }

  /**
   * Accept an intent and create an order
   */
  acceptIntent(intentId, riskDecision) {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }
    
    if (intent.status !== IntentStatus.PENDING) {
      throw new Error(`Intent ${intentId} is not pending (status: ${intent.status})`);
    }
    
    // Generate client_order_id for broker submission
    const clientOrderId = `oc_${intent.client_intent_id}`;
    
    // Check for existing order with this client ID
    const existingOrder = this.getOrderByClientId(clientOrderId);
    if (existingOrder) {
      this.stats.idempotentHits++;
      return {
        isNew: false,
        order: existingOrder,
        intent,
      };
    }
    
    const orderId = uuidv4();
    const now = new Date();
    
    const order = {
      id: orderId,
      intent_id: intentId,
      client_order_id: clientOrderId,
      broker_order_id: null, // Set after broker acknowledgment
      symbol: intent.symbol,
      side: intent.side,
      qty: intent.qty,
      filled_qty: 0,
      remaining_qty: intent.qty,
      order_type: intent.order_type,
      limit_price: intent.limit_price,
      stop_price: intent.stop_price,
      time_in_force: intent.time_in_force,
      extended_hours: intent.extended_hours,
      avg_fill_price: null,
      last_fill_price: null,
      status: OrderState.NEW,
      status_history: [
        { status: OrderState.NEW, timestamp: now, reason: 'Created from intent' },
      ],
      risk_decision: riskDecision,
      created_at: now,
      updated_at: now,
      submitted_at: null,
      accepted_at: null,
      filled_at: null,
      canceled_at: null,
      correlation_id: intent.correlation_id,
      fills: [],
      error: null,
    };
    
    this.orders.set(orderId, order);
    this.ordersByClientId.set(clientOrderId, order);
    
    // Update intent
    intent.status = IntentStatus.ACCEPTED;
    intent.order_id = orderId;
    intent.risk_decision = riskDecision;
    intent.updated_at = now;
    
    this.stats.acceptedIntents++;
    this.stats.totalOrders++;
    
    this._logEvent({
      type: 'INTENT_ACCEPTED',
      intent_id: intentId,
      order_id: orderId,
      correlation_id: intent.correlation_id,
      data: { risk_decision: riskDecision },
    });
    
    return {
      isNew: true,
      order,
      intent,
    };
  }

  /**
   * Reject an intent
   */
  rejectIntent(intentId, reason, details = null) {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent not found: ${intentId}`);
    }
    
    if (intent.status !== IntentStatus.PENDING) {
      return { changed: false, intent };
    }
    
    intent.status = IntentStatus.REJECTED;
    intent.risk_decision = { accepted: false, reason, details };
    intent.updated_at = new Date();
    
    this.stats.rejectedIntents++;
    
    this._logEvent({
      type: 'INTENT_REJECTED',
      intent_id: intentId,
      correlation_id: intent.correlation_id,
      data: { reason, details },
    });
    
    return { changed: true, intent };
  }

  /**
   * Transition order to new state
   * Validates the transition is allowed
   */
  transitionOrder(orderId, newState, data = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    const currentState = order.status;
    
    // Check if already in this state (idempotent)
    if (currentState === newState) {
      return { changed: false, order };
    }
    
    // Check if in terminal state
    if (TerminalStates.has(currentState)) {
      this.logger.warn({
        orderId,
        currentState,
        newState,
      }, 'Attempted transition from terminal state');
      this.stats.invalidTransitions++;
      return { changed: false, order, error: 'Order in terminal state' };
    }
    
    // Validate transition
    const allowedTransitions = ValidTransitions[currentState] || [];
    if (!allowedTransitions.includes(newState)) {
      this.logger.warn({
        orderId,
        currentState,
        newState,
        allowed: allowedTransitions,
      }, 'Invalid state transition');
      this.stats.invalidTransitions++;
      return { changed: false, order, error: `Invalid transition: ${currentState} -> ${newState}` };
    }
    
    // Perform transition
    const now = new Date();
    const previousState = order.status;
    
    order.status = newState;
    order.updated_at = now;
    order.status_history.push({
      status: newState,
      timestamp: now,
      reason: data.reason || null,
      data: data,
    });
    
    // Handle state-specific updates
    switch (newState) {
      case OrderState.SUBMITTED:
        order.submitted_at = now;
        break;
        
      case OrderState.ACCEPTED:
        order.accepted_at = now;
        if (data.broker_order_id) {
          order.broker_order_id = data.broker_order_id;
        }
        break;
        
      case OrderState.PARTIAL:
      case OrderState.FILLED:
        if (data.fill) {
          this._processFill(order, data.fill);
        }
        if (newState === OrderState.FILLED) {
          order.filled_at = now;
          this.stats.filledOrders++;
        }
        break;
        
      case OrderState.CANCELED:
        order.canceled_at = now;
        this.stats.canceledOrders++;
        break;
        
      case OrderState.REJECTED:
        order.error = data.error || data.reason || 'Rejected';
        this.stats.rejectedOrders++;
        break;
    }
    
    this.stats.stateTransitions++;
    
    this._logEvent({
      type: 'ORDER_STATE_CHANGED',
      order_id: orderId,
      correlation_id: order.correlation_id,
      data: {
        previous_state: previousState,
        new_state: newState,
        ...data,
      },
    });
    
    // Invoke callback
    this.onStateChange(order, previousState, newState, data);
    
    return { changed: true, order, previousState };
  }

  /**
   * Process a fill event
   */
  _processFill(order, fill) {
    const fillRecord = {
      id: fill.id || uuidv4(),
      qty: fill.qty,
      price: fill.price,
      timestamp: fill.timestamp || new Date(),
      commission: fill.commission || 0,
      liquidity: fill.liquidity || 'unknown',
    };
    
    order.fills.push(fillRecord);
    order.filled_qty += fill.qty;
    order.remaining_qty = order.qty - order.filled_qty;
    order.last_fill_price = fill.price;
    
    // Calculate average fill price
    const totalCost = order.fills.reduce((sum, f) => sum + f.qty * f.price, 0);
    order.avg_fill_price = totalCost / order.filled_qty;
    
    // Update position
    this._updatePosition(order.symbol, fill.qty, order.side, fill.price);
    
    // Invoke fill callback
    this.onFill(order, fillRecord);
  }

  /**
   * Update position after fill
   */
  _updatePosition(symbol, qty, side, price) {
    const position = this.positions.get(symbol) || {
      symbol,
      qty: 0,
      avg_entry_price: 0,
      cost_basis: 0,
      market_value: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      last_updated: null,
    };
    
    const signedQty = side === 'buy' ? qty : -qty;
    const newQty = position.qty + signedQty;
    
    // Calculate new average price and cost basis
    if (side === 'buy' && position.qty >= 0) {
      // Adding to long or opening long
      const totalCost = position.cost_basis + (qty * price);
      position.qty = newQty;
      position.cost_basis = totalCost;
      position.avg_entry_price = newQty > 0 ? totalCost / newQty : 0;
    } else if (side === 'sell' && position.qty <= 0) {
      // Adding to short or opening short
      const totalCost = position.cost_basis - (qty * price);
      position.qty = newQty;
      position.cost_basis = totalCost;
      position.avg_entry_price = newQty < 0 ? Math.abs(totalCost / newQty) : 0;
    } else {
      // Reducing or closing position
      const pnl = position.qty > 0
        ? qty * (price - position.avg_entry_price)
        : qty * (position.avg_entry_price - price);
      position.realized_pnl += pnl;
      position.qty = newQty;
      
      if (Math.abs(newQty) < 0.0001) {
        // Position closed
        position.cost_basis = 0;
        position.avg_entry_price = 0;
      }
    }
    
    position.last_updated = new Date();
    this.positions.set(symbol, position);
  }

  /**
   * Handle broker order update (from WebSocket)
   */
  handleBrokerUpdate(update) {
    const { event, order: brokerOrder } = update;
    
    // Find order by broker ID or client ID
    let order = null;
    for (const o of this.orders.values()) {
      if (o.broker_order_id === brokerOrder.id || 
          o.client_order_id === brokerOrder.client_order_id) {
        order = o;
        break;
      }
    }
    
    if (!order) {
      this.logger.warn({ update }, 'Received update for unknown order');
      return { handled: false, reason: 'Order not found' };
    }
    
    // Map broker event to state
    const eventStateMap = {
      new: OrderState.ACCEPTED,
      accepted: OrderState.ACCEPTED,
      fill: OrderState.FILLED,
      partial_fill: OrderState.PARTIAL,
      canceled: OrderState.CANCELED,
      rejected: OrderState.REJECTED,
      expired: OrderState.EXPIRED,
      replaced: OrderState.REPLACED,
      pending_cancel: OrderState.PENDING_CANCEL,
      pending_replace: OrderState.PENDING_REPLACE,
    };
    
    const newState = eventStateMap[event];
    if (!newState) {
      this.logger.warn({ event }, 'Unknown broker event');
      return { handled: false, reason: 'Unknown event' };
    }
    
    // Build transition data
    const data = {
      broker_order_id: brokerOrder.id,
      reason: event,
    };
    
    // Handle fills
    if (event === 'fill' || event === 'partial_fill') {
      data.fill = {
        qty: parseInt(brokerOrder.filled_qty, 10) - order.filled_qty,
        price: parseFloat(brokerOrder.filled_avg_price),
        timestamp: new Date(brokerOrder.filled_at || brokerOrder.updated_at),
      };
    }
    
    return this.transitionOrder(order.id, newState, data);
  }

  /**
   * Get all open orders
   */
  getOpenOrders() {
    return Array.from(this.orders.values())
      .filter(o => !TerminalStates.has(o.status));
  }

  /**
   * Get orders for a symbol
   */
  getOrdersBySymbol(symbol) {
    return Array.from(this.orders.values())
      .filter(o => o.symbol === symbol.toUpperCase());
  }

  /**
   * Get position for symbol
   */
  getPosition(symbol) {
    return this.positions.get(symbol.toUpperCase()) || null;
  }

  /**
   * Get all positions
   */
  getAllPositions() {
    return Array.from(this.positions.values());
  }

  /**
   * Reconcile orders with broker state
   */
  async reconcile(brokerOrders, brokerPositions) {
    const discrepancies = [];
    const now = new Date();
    
    this._logEvent({
      type: 'RECONCILIATION_STARTED',
      data: {
        local_orders: this.orders.size,
        broker_orders: brokerOrders.length,
        local_positions: this.positions.size,
        broker_positions: brokerPositions.length,
      },
    });
    
    // Index broker orders by ID
    const brokerOrderMap = new Map();
    for (const bo of brokerOrders) {
      brokerOrderMap.set(bo.id, bo);
      brokerOrderMap.set(bo.client_order_id, bo);
    }
    
    // Check each local order
    for (const order of this.orders.values()) {
      if (TerminalStates.has(order.status)) continue;
      
      const brokerOrder = brokerOrderMap.get(order.broker_order_id) ||
                         brokerOrderMap.get(order.client_order_id);
      
      if (!brokerOrder) {
        // Order exists locally but not on broker
        discrepancies.push({
          type: 'missing_on_broker',
          order_id: order.id,
          client_order_id: order.client_order_id,
          local_status: order.status,
        });
        
        // Mark as rejected/expired if we think it was submitted
        if (order.status === OrderState.SUBMITTED) {
          this.transitionOrder(order.id, OrderState.REJECTED, {
            reason: 'reconciliation_missing',
          });
        }
      } else {
        // Compare states
        const brokerState = this._mapBrokerStatus(brokerOrder.status);
        if (order.status !== brokerState) {
          discrepancies.push({
            type: 'status_mismatch',
            order_id: order.id,
            local_status: order.status,
            broker_status: brokerState,
          });
          
          // Update to broker state
          this.transitionOrder(order.id, brokerState, {
            reason: 'reconciliation',
            broker_order: brokerOrder,
          });
        }
        
        // Check filled qty
        const brokerFilledQty = parseInt(brokerOrder.filled_qty || 0, 10);
        if (order.filled_qty !== brokerFilledQty) {
          discrepancies.push({
            type: 'filled_qty_mismatch',
            order_id: order.id,
            local_filled: order.filled_qty,
            broker_filled: brokerFilledQty,
          });
        }
      }
    }
    
    // Check for orders on broker but not locally
    for (const brokerOrder of brokerOrders) {
      if (!brokerOrder.client_order_id?.startsWith('oc_')) continue; // Skip non-system orders
      
      const localOrder = this.getOrderByClientId(brokerOrder.client_order_id);
      if (!localOrder) {
        discrepancies.push({
          type: 'missing_locally',
          broker_order_id: brokerOrder.id,
          client_order_id: brokerOrder.client_order_id,
          broker_status: brokerOrder.status,
        });
        
        // Optionally create local record
        // (depends on whether we want to manage it)
      }
    }
    
    // Reconcile positions
    const brokerPosMap = new Map(brokerPositions.map(p => [p.symbol, p]));
    
    for (const [symbol, localPos] of this.positions) {
      const brokerPos = brokerPosMap.get(symbol);
      if (!brokerPos) {
        if (localPos.qty !== 0) {
          discrepancies.push({
            type: 'position_missing_on_broker',
            symbol,
            local_qty: localPos.qty,
          });
        }
      } else {
        const brokerQty = parseFloat(brokerPos.qty);
        if (Math.abs(localPos.qty - brokerQty) > 0.01) {
          discrepancies.push({
            type: 'position_qty_mismatch',
            symbol,
            local_qty: localPos.qty,
            broker_qty: brokerQty,
          });
          
          // Update local position
          localPos.qty = brokerQty;
          localPos.market_value = parseFloat(brokerPos.market_value || 0);
          localPos.last_updated = now;
        }
      }
    }
    
    // Add broker positions we don't have locally
    for (const brokerPos of brokerPositions) {
      if (!this.positions.has(brokerPos.symbol)) {
        discrepancies.push({
          type: 'position_missing_locally',
          symbol: brokerPos.symbol,
          broker_qty: parseFloat(brokerPos.qty),
        });
        
        this.positions.set(brokerPos.symbol, {
          symbol: brokerPos.symbol,
          qty: parseFloat(brokerPos.qty),
          avg_entry_price: parseFloat(brokerPos.avg_entry_price || 0),
          cost_basis: parseFloat(brokerPos.cost_basis || 0),
          market_value: parseFloat(brokerPos.market_value || 0),
          unrealized_pnl: parseFloat(brokerPos.unrealized_pl || 0),
          realized_pnl: 0,
          last_updated: now,
        });
      }
    }
    
    this._logEvent({
      type: 'RECONCILIATION_COMPLETED',
      data: {
        discrepancies_found: discrepancies.length,
        discrepancies,
      },
    });
    
    return {
      success: true,
      discrepancies,
      timestamp: now,
    };
  }

  /**
   * Map broker status string to our state enum
   */
  _mapBrokerStatus(brokerStatus) {
    const statusMap = {
      new: OrderState.ACCEPTED,
      accepted: OrderState.ACCEPTED,
      pending_new: OrderState.SUBMITTED,
      partially_filled: OrderState.PARTIAL,
      filled: OrderState.FILLED,
      done_for_day: OrderState.EXPIRED,
      canceled: OrderState.CANCELED,
      expired: OrderState.EXPIRED,
      replaced: OrderState.REPLACED,
      pending_cancel: OrderState.PENDING_CANCEL,
      pending_replace: OrderState.PENDING_REPLACE,
      rejected: OrderState.REJECTED,
    };
    return statusMap[brokerStatus?.toLowerCase()] || OrderState.ACCEPTED;
  }

  /**
   * Log event for audit trail
   */
  _logEvent(event) {
    const fullEvent = {
      id: createEventId(),
      timestamp: new Date(),
      ...event,
    };
    
    this.eventLog.push(fullEvent);
    this.onEvent(fullEvent);
    
    // Keep only last 10000 events in memory
    if (this.eventLog.length > 10000) {
      this.eventLog = this.eventLog.slice(-5000);
    }
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100) {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset state (for testing)
   */
  reset() {
    this.intents.clear();
    this.orders.clear();
    this.ordersByClientId.clear();
    this.intentsByClientId.clear();
    this.positions.clear();
    this.eventLog = [];
    this.stats = {
      totalIntents: 0,
      acceptedIntents: 0,
      rejectedIntents: 0,
      totalOrders: 0,
      filledOrders: 0,
      canceledOrders: 0,
      rejectedOrders: 0,
      idempotentHits: 0,
      stateTransitions: 0,
      invalidTransitions: 0,
    };
  }
}

// Export singleton for default use
export const omsStateMachine = new OMSStateMachine();
