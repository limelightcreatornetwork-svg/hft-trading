/**
 * OMS State Machine (HFT-003)
 * 
 * Formal state machine for order lifecycle tracking.
 * 
 * States:
 *   CREATED → PENDING → SUBMITTED → [PARTIAL|FILLED|CANCELLED|REJECTED|EXPIRED]
 * 
 * Transitions are explicit and validated.
 */

// ============================================
// TYPES
// ============================================

export enum OrderState {
  CREATED = 'CREATED',           // Order object created locally
  PENDING = 'PENDING',           // Queued for submission
  VALIDATING = 'VALIDATING',     // Risk checks in progress
  SUBMITTING = 'SUBMITTING',     // Being sent to broker
  SUBMITTED = 'SUBMITTED',       // Acknowledged by broker (pending fill)
  PARTIAL = 'PARTIAL',           // Partially filled
  FILLED = 'FILLED',             // Fully filled (terminal)
  CANCELLED = 'CANCELLED',       // Cancelled (terminal)
  REJECTED = 'REJECTED',         // Rejected by risk or broker (terminal)
  EXPIRED = 'EXPIRED',           // Order expired (terminal)
  FAILED = 'FAILED',             // System failure (terminal)
}

export enum OrderEvent {
  QUEUE = 'QUEUE',
  VALIDATE = 'VALIDATE',
  SUBMIT = 'SUBMIT',
  ACKNOWLEDGE = 'ACKNOWLEDGE',
  PARTIAL_FILL = 'PARTIAL_FILL',
  FILL = 'FILL',
  CANCEL = 'CANCEL',
  REJECT = 'REJECT',
  EXPIRE = 'EXPIRE',
  FAIL = 'FAIL',
}

export interface OrderTransition {
  event: OrderEvent;
  from: OrderState;
  to: OrderState;
  timestamp: Date;
  details?: string;
  metadata?: Record<string, unknown>;
}

export interface OrderFill {
  quantity: number;
  price: number;
  timestamp: Date;
  fillId?: string;
}

export interface ManagedOrder {
  id: string;
  clientOrderId: string;
  brokerOrderId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: 'day' | 'gtc' | 'ioc' | 'fok';
  
  // State tracking
  state: OrderState;
  previousState?: OrderState;
  transitions: OrderTransition[];
  
  // Fill tracking
  filledQuantity: number;
  remainingQuantity: number;
  avgFillPrice?: number;
  fills: OrderFill[];
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  completedAt?: Date;
  
  // Risk/validation
  riskCheckPassed?: boolean;
  rejectionReason?: string;
  
  // Metadata
  strategy?: string;
  parentOrderId?: string;
  tags?: string[];
}

// ============================================
// STATE MACHINE
// ============================================

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<OrderState, OrderState[]> = {
  [OrderState.CREATED]: [OrderState.PENDING, OrderState.REJECTED, OrderState.FAILED],
  [OrderState.PENDING]: [OrderState.VALIDATING, OrderState.SUBMITTING, OrderState.CANCELLED, OrderState.REJECTED, OrderState.FAILED],
  [OrderState.VALIDATING]: [OrderState.SUBMITTING, OrderState.REJECTED, OrderState.FAILED],
  [OrderState.SUBMITTING]: [OrderState.SUBMITTED, OrderState.REJECTED, OrderState.FAILED],
  [OrderState.SUBMITTED]: [OrderState.PARTIAL, OrderState.FILLED, OrderState.CANCELLED, OrderState.EXPIRED, OrderState.FAILED],
  [OrderState.PARTIAL]: [OrderState.FILLED, OrderState.CANCELLED, OrderState.EXPIRED, OrderState.FAILED],
  [OrderState.FILLED]: [],      // Terminal
  [OrderState.CANCELLED]: [],   // Terminal
  [OrderState.REJECTED]: [],    // Terminal
  [OrderState.EXPIRED]: [],     // Terminal
  [OrderState.FAILED]: [],      // Terminal
};

/**
 * Terminal states
 */
export const TERMINAL_STATES: OrderState[] = [
  OrderState.FILLED,
  OrderState.CANCELLED,
  OrderState.REJECTED,
  OrderState.EXPIRED,
  OrderState.FAILED,
];

/**
 * Active states (order is live)
 */
export const ACTIVE_STATES: OrderState[] = [
  OrderState.PENDING,
  OrderState.VALIDATING,
  OrderState.SUBMITTING,
  OrderState.SUBMITTED,
  OrderState.PARTIAL,
];

/**
 * Check if a state transition is valid
 */
export function isValidTransition(from: OrderState, to: OrderState): boolean {
  const validNext = VALID_TRANSITIONS[from];
  return validNext?.includes(to) ?? false;
}

/**
 * Check if state is terminal
 */
export function isTerminalState(state: OrderState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Check if state is active
 */
export function isActiveState(state: OrderState): boolean {
  return ACTIVE_STATES.includes(state);
}

// ============================================
// ORDER MANAGER
// ============================================

export type StateChangeCallback = (order: ManagedOrder, transition: OrderTransition) => void;
export type FillCallback = (order: ManagedOrder, fill: OrderFill) => void;

export interface OMSConfig {
  validateTransitions: boolean;
  trackHistory: boolean;
  maxHistoryLength: number;
  onStateChange?: StateChangeCallback;
  onFill?: FillCallback;
}

const DEFAULT_OMS_CONFIG: OMSConfig = {
  validateTransitions: true,
  trackHistory: true,
  maxHistoryLength: 100,
};

export class OrderManagementSystem {
  private orders: Map<string, ManagedOrder> = new Map();
  private clientIdIndex: Map<string, string> = new Map();
  private brokerIdIndex: Map<string, string> = new Map();
  private config: OMSConfig;
  
  constructor(config: Partial<OMSConfig> = {}) {
    this.config = { ...DEFAULT_OMS_CONFIG, ...config };
  }
  
  /**
   * Create a new order
   */
  createOrder(params: {
    symbol: string;
    side: 'buy' | 'sell';
    orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
    quantity: number;
    limitPrice?: number;
    stopPrice?: number;
    timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
    strategy?: string;
    parentOrderId?: string;
    tags?: string[];
  }): ManagedOrder {
    const id = this.generateId();
    const clientOrderId = this.generateClientOrderId();
    const now = new Date();
    
    const order: ManagedOrder = {
      id,
      clientOrderId,
      symbol: params.symbol.toUpperCase(),
      side: params.side,
      orderType: params.orderType,
      quantity: params.quantity,
      limitPrice: params.limitPrice,
      stopPrice: params.stopPrice,
      timeInForce: params.timeInForce || 'day',
      
      state: OrderState.CREATED,
      transitions: [],
      
      filledQuantity: 0,
      remainingQuantity: params.quantity,
      fills: [],
      
      createdAt: now,
      updatedAt: now,
      
      strategy: params.strategy,
      parentOrderId: params.parentOrderId,
      tags: params.tags,
    };
    
    this.orders.set(id, order);
    this.clientIdIndex.set(clientOrderId, id);
    
    // Record initial transition
    this.recordTransition(order, {
      event: OrderEvent.QUEUE,
      from: OrderState.CREATED,
      to: OrderState.CREATED,
      timestamp: now,
      details: 'Order created',
    });
    
    return order;
  }
  
  /**
   * Transition order to a new state
   */
  transition(
    orderId: string,
    event: OrderEvent,
    options: {
      details?: string;
      metadata?: Record<string, unknown>;
      brokerOrderId?: string;
      rejectionReason?: string;
    } = {}
  ): ManagedOrder {
    const order = this.getOrder(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    const newState = this.getNextState(order.state, event);
    
    if (this.config.validateTransitions && !isValidTransition(order.state, newState)) {
      throw new Error(
        `Invalid transition: ${order.state} → ${newState} (event: ${event})`
      );
    }
    
    const transition: OrderTransition = {
      event,
      from: order.state,
      to: newState,
      timestamp: new Date(),
      details: options.details,
      metadata: options.metadata,
    };
    
    // Update order
    order.previousState = order.state;
    order.state = newState;
    order.updatedAt = transition.timestamp;
    
    if (options.brokerOrderId) {
      order.brokerOrderId = options.brokerOrderId;
      this.brokerIdIndex.set(options.brokerOrderId, order.id);
    }
    
    if (options.rejectionReason) {
      order.rejectionReason = options.rejectionReason;
    }
    
    // Update timestamps for specific states
    if (newState === OrderState.SUBMITTED && !order.submittedAt) {
      order.submittedAt = transition.timestamp;
    }
    
    if (isTerminalState(newState) && !order.completedAt) {
      order.completedAt = transition.timestamp;
    }
    
    // Record transition
    this.recordTransition(order, transition);
    
    // Callback
    if (this.config.onStateChange) {
      this.config.onStateChange(order, transition);
    }
    
    return order;
  }
  
  /**
   * Record a fill
   */
  recordFill(
    orderId: string,
    fill: {
      quantity: number;
      price: number;
      timestamp?: Date;
      fillId?: string;
    }
  ): ManagedOrder {
    const order = this.getOrder(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }
    
    if (!isActiveState(order.state) && order.state !== OrderState.PARTIAL) {
      throw new Error(`Cannot record fill for order in state: ${order.state}`);
    }
    
    const orderFill: OrderFill = {
      quantity: fill.quantity,
      price: fill.price,
      timestamp: fill.timestamp || new Date(),
      fillId: fill.fillId,
    };
    
    // Update fill tracking
    order.fills.push(orderFill);
    order.filledQuantity += fill.quantity;
    order.remainingQuantity = order.quantity - order.filledQuantity;
    
    // Calculate average fill price
    const totalValue = order.fills.reduce((sum, f) => sum + f.quantity * f.price, 0);
    order.avgFillPrice = totalValue / order.filledQuantity;
    
    order.updatedAt = orderFill.timestamp;
    
    // Auto-transition based on fill
    if (order.remainingQuantity <= 0) {
      this.transition(orderId, OrderEvent.FILL, {
        details: `Fully filled at avg price ${order.avgFillPrice.toFixed(2)}`,
      });
    } else if (order.state !== OrderState.PARTIAL) {
      this.transition(orderId, OrderEvent.PARTIAL_FILL, {
        details: `Partial fill: ${order.filledQuantity}/${order.quantity}`,
      });
    }
    
    // Callback
    if (this.config.onFill) {
      this.config.onFill(order, orderFill);
    }
    
    return order;
  }
  
  /**
   * Cancel an order
   */
  cancel(orderId: string, reason?: string): ManagedOrder {
    return this.transition(orderId, OrderEvent.CANCEL, {
      details: reason || 'User cancelled',
    });
  }
  
  /**
   * Reject an order
   */
  reject(orderId: string, reason: string): ManagedOrder {
    return this.transition(orderId, OrderEvent.REJECT, {
      details: reason,
      rejectionReason: reason,
    });
  }
  
  /**
   * Get order by internal ID
   */
  getOrder(orderId: string): ManagedOrder | undefined {
    return this.orders.get(orderId);
  }
  
  /**
   * Get order by client order ID
   */
  getOrderByClientId(clientOrderId: string): ManagedOrder | undefined {
    const id = this.clientIdIndex.get(clientOrderId);
    return id ? this.orders.get(id) : undefined;
  }
  
  /**
   * Get order by broker order ID
   */
  getOrderByBrokerId(brokerOrderId: string): ManagedOrder | undefined {
    const id = this.brokerIdIndex.get(brokerOrderId);
    return id ? this.orders.get(id) : undefined;
  }
  
  /**
   * Get all orders
   */
  getAllOrders(): ManagedOrder[] {
    return Array.from(this.orders.values());
  }
  
  /**
   * Get orders by state
   */
  getOrdersByState(state: OrderState): ManagedOrder[] {
    return this.getAllOrders().filter(o => o.state === state);
  }
  
  /**
   * Get active orders
   */
  getActiveOrders(): ManagedOrder[] {
    return this.getAllOrders().filter(o => isActiveState(o.state));
  }
  
  /**
   * Get completed orders
   */
  getCompletedOrders(): ManagedOrder[] {
    return this.getAllOrders().filter(o => isTerminalState(o.state));
  }
  
  /**
   * Get orders by symbol
   */
  getOrdersBySymbol(symbol: string): ManagedOrder[] {
    const normalizedSymbol = symbol.toUpperCase();
    return this.getAllOrders().filter(o => o.symbol === normalizedSymbol);
  }
  
  /**
   * Get order statistics
   */
  getStats(): {
    total: number;
    byState: Record<OrderState, number>;
    active: number;
    completed: number;
    fillRate: number;
  } {
    const orders = this.getAllOrders();
    const byState = {} as Record<OrderState, number>;
    
    for (const state of Object.values(OrderState)) {
      byState[state] = orders.filter(o => o.state === state).length;
    }
    
    const completed = orders.filter(o => isTerminalState(o.state)).length;
    const filled = byState[OrderState.FILLED] || 0;
    
    return {
      total: orders.length,
      byState,
      active: orders.filter(o => isActiveState(o.state)).length,
      completed,
      fillRate: completed > 0 ? filled / completed : 0,
    };
  }
  
  /**
   * Remove completed orders older than specified age
   */
  pruneCompleted(maxAgeMs: number): number {
    const cutoff = new Date(Date.now() - maxAgeMs);
    let pruned = 0;
    
    for (const [id, order] of this.orders.entries()) {
      if (isTerminalState(order.state) && order.completedAt && order.completedAt < cutoff) {
        this.orders.delete(id);
        this.clientIdIndex.delete(order.clientOrderId);
        if (order.brokerOrderId) {
          this.brokerIdIndex.delete(order.brokerOrderId);
        }
        pruned++;
      }
    }
    
    return pruned;
  }
  
  /**
   * Clear all orders (for testing)
   */
  clear(): void {
    this.orders.clear();
    this.clientIdIndex.clear();
    this.brokerIdIndex.clear();
  }
  
  // ============================================
  // PRIVATE METHODS
  // ============================================
  
  private generateId(): string {
    return `ord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateClientOrderId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }
  
  private getNextState(currentState: OrderState, event: OrderEvent): OrderState {
    const transitions: Record<OrderEvent, Partial<Record<OrderState, OrderState>>> = {
      [OrderEvent.QUEUE]: {
        [OrderState.CREATED]: OrderState.PENDING,
      },
      [OrderEvent.VALIDATE]: {
        [OrderState.PENDING]: OrderState.VALIDATING,
      },
      [OrderEvent.SUBMIT]: {
        [OrderState.VALIDATING]: OrderState.SUBMITTING,
        [OrderState.PENDING]: OrderState.SUBMITTING, // Skip validation if already validated
      },
      [OrderEvent.ACKNOWLEDGE]: {
        [OrderState.SUBMITTING]: OrderState.SUBMITTED,
      },
      [OrderEvent.PARTIAL_FILL]: {
        [OrderState.SUBMITTED]: OrderState.PARTIAL,
        [OrderState.PARTIAL]: OrderState.PARTIAL, // Can stay in partial
      },
      [OrderEvent.FILL]: {
        [OrderState.SUBMITTED]: OrderState.FILLED,
        [OrderState.PARTIAL]: OrderState.FILLED,
      },
      [OrderEvent.CANCEL]: {
        [OrderState.PENDING]: OrderState.CANCELLED,
        [OrderState.VALIDATING]: OrderState.CANCELLED,
        [OrderState.SUBMITTING]: OrderState.CANCELLED,
        [OrderState.SUBMITTED]: OrderState.CANCELLED,
        [OrderState.PARTIAL]: OrderState.CANCELLED,
      },
      [OrderEvent.REJECT]: {
        [OrderState.CREATED]: OrderState.REJECTED,
        [OrderState.PENDING]: OrderState.REJECTED,
        [OrderState.VALIDATING]: OrderState.REJECTED,
        [OrderState.SUBMITTING]: OrderState.REJECTED,
      },
      [OrderEvent.EXPIRE]: {
        [OrderState.SUBMITTED]: OrderState.EXPIRED,
        [OrderState.PARTIAL]: OrderState.EXPIRED,
      },
      [OrderEvent.FAIL]: {
        [OrderState.CREATED]: OrderState.FAILED,
        [OrderState.PENDING]: OrderState.FAILED,
        [OrderState.VALIDATING]: OrderState.FAILED,
        [OrderState.SUBMITTING]: OrderState.FAILED,
        [OrderState.SUBMITTED]: OrderState.FAILED,
        [OrderState.PARTIAL]: OrderState.FAILED,
      },
    };
    
    const nextState = transitions[event]?.[currentState];
    if (!nextState) {
      throw new Error(`No transition defined for event ${event} in state ${currentState}`);
    }
    
    return nextState;
  }
  
  private recordTransition(order: ManagedOrder, transition: OrderTransition): void {
    if (!this.config.trackHistory) return;
    
    order.transitions.push(transition);
    
    // Trim history if needed
    if (order.transitions.length > this.config.maxHistoryLength) {
      order.transitions = order.transitions.slice(-this.config.maxHistoryLength);
    }
  }
}

// ============================================
// FACTORY
// ============================================

let defaultOMS: OrderManagementSystem | null = null;

/**
 * Get the default OMS instance
 */
export function getOMS(): OrderManagementSystem {
  if (!defaultOMS) {
    defaultOMS = new OrderManagementSystem();
  }
  return defaultOMS;
}

/**
 * Create a new OMS instance
 */
export function createOMS(config?: Partial<OMSConfig>): OrderManagementSystem {
  return new OrderManagementSystem(config);
}

/**
 * Reset the default OMS (for testing)
 */
export function resetOMS(): void {
  defaultOMS = null;
}

export default OrderManagementSystem;
