/**
 * OMS State Machine Tests
 */

import {
  OrderManagementSystem,
  OrderState,
  OrderEvent,
  isValidTransition,
  isTerminalState,
  isActiveState,
  createOMS,
  getOMS,
  resetOMS,
  ManagedOrder,
} from '@/lib/oms-state-machine';

describe('OMS State Machine', () => {
  let oms: OrderManagementSystem;

  beforeEach(() => {
    oms = createOMS();
  });

  describe('State Validation Helpers', () => {
    describe('isValidTransition', () => {
      it('should allow CREATED → PENDING', () => {
        expect(isValidTransition(OrderState.CREATED, OrderState.PENDING)).toBe(true);
      });

      it('should allow PENDING → VALIDATING', () => {
        expect(isValidTransition(OrderState.PENDING, OrderState.VALIDATING)).toBe(true);
      });

      it('should allow SUBMITTED → FILLED', () => {
        expect(isValidTransition(OrderState.SUBMITTED, OrderState.FILLED)).toBe(true);
      });

      it('should allow SUBMITTED → PARTIAL', () => {
        expect(isValidTransition(OrderState.SUBMITTED, OrderState.PARTIAL)).toBe(true);
      });

      it('should allow PARTIAL → FILLED', () => {
        expect(isValidTransition(OrderState.PARTIAL, OrderState.FILLED)).toBe(true);
      });

      it('should reject FILLED → PENDING (terminal state)', () => {
        expect(isValidTransition(OrderState.FILLED, OrderState.PENDING)).toBe(false);
      });

      it('should reject CREATED → FILLED (skip states)', () => {
        expect(isValidTransition(OrderState.CREATED, OrderState.FILLED)).toBe(false);
      });
    });

    describe('isTerminalState', () => {
      it('should return true for FILLED', () => {
        expect(isTerminalState(OrderState.FILLED)).toBe(true);
      });

      it('should return true for CANCELLED', () => {
        expect(isTerminalState(OrderState.CANCELLED)).toBe(true);
      });

      it('should return true for REJECTED', () => {
        expect(isTerminalState(OrderState.REJECTED)).toBe(true);
      });

      it('should return true for EXPIRED', () => {
        expect(isTerminalState(OrderState.EXPIRED)).toBe(true);
      });

      it('should return true for FAILED', () => {
        expect(isTerminalState(OrderState.FAILED)).toBe(true);
      });

      it('should return false for SUBMITTED', () => {
        expect(isTerminalState(OrderState.SUBMITTED)).toBe(false);
      });
    });

    describe('isActiveState', () => {
      it('should return true for PENDING', () => {
        expect(isActiveState(OrderState.PENDING)).toBe(true);
      });

      it('should return true for SUBMITTED', () => {
        expect(isActiveState(OrderState.SUBMITTED)).toBe(true);
      });

      it('should return true for PARTIAL', () => {
        expect(isActiveState(OrderState.PARTIAL)).toBe(true);
      });

      it('should return false for FILLED', () => {
        expect(isActiveState(OrderState.FILLED)).toBe(false);
      });

      it('should return false for CANCELLED', () => {
        expect(isActiveState(OrderState.CANCELLED)).toBe(false);
      });
    });
  });

  describe('Order Creation', () => {
    it('should create an order with CREATED state', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      expect(order.state).toBe(OrderState.CREATED);
      expect(order.symbol).toBe('AAPL');
      expect(order.side).toBe('buy');
      expect(order.orderType).toBe('market');
      expect(order.quantity).toBe(100);
      expect(order.filledQuantity).toBe(0);
      expect(order.remainingQuantity).toBe(100);
    });

    it('should generate unique IDs', () => {
      const order1 = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      const order2 = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      expect(order1.id).not.toBe(order2.id);
      expect(order1.clientOrderId).not.toBe(order2.clientOrderId);
    });

    it('should uppercase symbol', () => {
      const order = oms.createOrder({
        symbol: 'aapl',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      expect(order.symbol).toBe('AAPL');
    });

    it('should include optional parameters', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'limit',
        quantity: 100,
        limitPrice: 150.00,
        timeInForce: 'gtc',
        strategy: 'momentum',
        tags: ['test', 'automated'],
      });

      expect(order.limitPrice).toBe(150.00);
      expect(order.timeInForce).toBe('gtc');
      expect(order.strategy).toBe('momentum');
      expect(order.tags).toEqual(['test', 'automated']);
    });
  });

  describe('State Transitions', () => {
    let order: ManagedOrder;

    beforeEach(() => {
      order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
    });

    it('should transition CREATED → PENDING on QUEUE event', () => {
      const updated = oms.transition(order.id, OrderEvent.QUEUE);
      expect(updated.state).toBe(OrderState.PENDING);
    });

    it('should transition through full lifecycle', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      expect(order.state).toBe(OrderState.PENDING);

      oms.transition(order.id, OrderEvent.VALIDATE);
      expect(order.state).toBe(OrderState.VALIDATING);

      oms.transition(order.id, OrderEvent.SUBMIT);
      expect(order.state).toBe(OrderState.SUBMITTING);

      oms.transition(order.id, OrderEvent.ACKNOWLEDGE, { brokerOrderId: 'broker-123' });
      expect(order.state).toBe(OrderState.SUBMITTED);
      expect(order.brokerOrderId).toBe('broker-123');

      oms.transition(order.id, OrderEvent.FILL);
      expect(order.state).toBe(OrderState.FILLED);
    });

    it('should track previous state', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.VALIDATE);

      expect(order.previousState).toBe(OrderState.PENDING);
      expect(order.state).toBe(OrderState.VALIDATING);
    });

    it('should record transition history', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.VALIDATE);

      expect(order.transitions.length).toBeGreaterThan(0);
      const lastTransition = order.transitions[order.transitions.length - 1];
      expect(lastTransition.from).toBe(OrderState.PENDING);
      expect(lastTransition.to).toBe(OrderState.VALIDATING);
    });

    it('should throw for invalid transition', () => {
      expect(() => {
        oms.transition(order.id, OrderEvent.FILL);
      }).toThrow();
    });

    it('should throw for non-existent order', () => {
      expect(() => {
        oms.transition('non-existent', OrderEvent.QUEUE);
      }).toThrow('Order not found');
    });

    it('should set submittedAt when reaching SUBMITTED', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);

      expect(order.submittedAt).toBeDefined();
    });

    it('should set completedAt for terminal states', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);
      oms.transition(order.id, OrderEvent.FILL);

      expect(order.completedAt).toBeDefined();
    });
  });

  describe('Fill Recording', () => {
    let order: ManagedOrder;

    beforeEach(() => {
      order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);
    });

    it('should record a partial fill', () => {
      oms.recordFill(order.id, { quantity: 50, price: 150.00 });

      expect(order.filledQuantity).toBe(50);
      expect(order.remainingQuantity).toBe(50);
      expect(order.avgFillPrice).toBe(150.00);
      expect(order.state).toBe(OrderState.PARTIAL);
    });

    it('should record a full fill', () => {
      oms.recordFill(order.id, { quantity: 100, price: 150.00 });

      expect(order.filledQuantity).toBe(100);
      expect(order.remainingQuantity).toBe(0);
      expect(order.state).toBe(OrderState.FILLED);
    });

    it('should calculate average fill price correctly', () => {
      oms.recordFill(order.id, { quantity: 50, price: 150.00 });
      oms.recordFill(order.id, { quantity: 50, price: 152.00 });

      expect(order.filledQuantity).toBe(100);
      expect(order.avgFillPrice).toBe(151.00);
      expect(order.state).toBe(OrderState.FILLED);
    });

    it('should track individual fills', () => {
      oms.recordFill(order.id, { quantity: 30, price: 149.00, fillId: 'fill-1' });
      oms.recordFill(order.id, { quantity: 70, price: 151.00, fillId: 'fill-2' });

      expect(order.fills.length).toBe(2);
      expect(order.fills[0].fillId).toBe('fill-1');
      expect(order.fills[1].fillId).toBe('fill-2');
    });

    it('should throw when filling in wrong state', () => {
      const newOrder = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      expect(() => {
        oms.recordFill(newOrder.id, { quantity: 50, price: 150.00 });
      }).toThrow();
    });
  });

  describe('Cancel and Reject', () => {
    let order: ManagedOrder;

    beforeEach(() => {
      order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
    });

    it('should cancel a pending order', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.cancel(order.id, 'User requested');

      expect(order.state).toBe(OrderState.CANCELLED);
    });

    it('should cancel a submitted order', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);
      oms.cancel(order.id);

      expect(order.state).toBe(OrderState.CANCELLED);
    });

    it('should cancel a partially filled order', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);
      oms.recordFill(order.id, { quantity: 50, price: 150.00 });
      oms.cancel(order.id);

      expect(order.state).toBe(OrderState.CANCELLED);
      expect(order.filledQuantity).toBe(50); // Fills preserved
    });

    it('should reject an order with reason', () => {
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.VALIDATE);
      oms.reject(order.id, 'Exceeds max position size');

      expect(order.state).toBe(OrderState.REJECTED);
      expect(order.rejectionReason).toBe('Exceeds max position size');
    });
  });

  describe('Order Lookup', () => {
    it('should get order by ID', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      const found = oms.getOrder(order.id);
      expect(found).toBe(order);
    });

    it('should get order by client ID', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      const found = oms.getOrderByClientId(order.clientOrderId);
      expect(found).toBe(order);
    });

    it('should get order by broker ID', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE, { brokerOrderId: 'broker-xyz' });

      const found = oms.getOrderByBrokerId('broker-xyz');
      expect(found).toBe(order);
    });

    it('should return undefined for non-existent order', () => {
      expect(oms.getOrder('non-existent')).toBeUndefined();
      expect(oms.getOrderByClientId('non-existent')).toBeUndefined();
      expect(oms.getOrderByBrokerId('non-existent')).toBeUndefined();
    });
  });

  describe('Order Filtering', () => {
    beforeEach(() => {
      // Create orders in different states
      const order1 = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.transition(order1.id, OrderEvent.QUEUE);
      oms.transition(order1.id, OrderEvent.SUBMIT);
      oms.transition(order1.id, OrderEvent.ACKNOWLEDGE);

      const order2 = oms.createOrder({
        symbol: 'MSFT',
        side: 'sell',
        orderType: 'limit',
        quantity: 50,
        limitPrice: 400,
      });
      oms.transition(order2.id, OrderEvent.QUEUE);
      oms.transition(order2.id, OrderEvent.SUBMIT);
      oms.transition(order2.id, OrderEvent.ACKNOWLEDGE);
      oms.transition(order2.id, OrderEvent.FILL);

      const order3 = oms.createOrder({
        symbol: 'AAPL',
        side: 'sell',
        orderType: 'market',
        quantity: 25,
      });
      oms.transition(order3.id, OrderEvent.QUEUE);
    });

    it('should get all orders', () => {
      expect(oms.getAllOrders().length).toBe(3);
    });

    it('should get orders by state', () => {
      expect(oms.getOrdersByState(OrderState.SUBMITTED).length).toBe(1);
      expect(oms.getOrdersByState(OrderState.FILLED).length).toBe(1);
      expect(oms.getOrdersByState(OrderState.PENDING).length).toBe(1);
    });

    it('should get active orders', () => {
      const active = oms.getActiveOrders();
      expect(active.length).toBe(2);
      expect(active.every(o => isActiveState(o.state))).toBe(true);
    });

    it('should get completed orders', () => {
      const completed = oms.getCompletedOrders();
      expect(completed.length).toBe(1);
      expect(completed.every(o => isTerminalState(o.state))).toBe(true);
    });

    it('should get orders by symbol', () => {
      const aaplOrders = oms.getOrdersBySymbol('AAPL');
      expect(aaplOrders.length).toBe(2);
      expect(aaplOrders.every(o => o.symbol === 'AAPL')).toBe(true);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      const order1 = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.transition(order1.id, OrderEvent.QUEUE);
      oms.transition(order1.id, OrderEvent.SUBMIT);
      oms.transition(order1.id, OrderEvent.ACKNOWLEDGE);
      oms.transition(order1.id, OrderEvent.FILL);

      const order2 = oms.createOrder({
        symbol: 'MSFT',
        side: 'buy',
        orderType: 'market',
        quantity: 50,
      });
      oms.transition(order2.id, OrderEvent.QUEUE);
      oms.transition(order2.id, OrderEvent.SUBMIT);
      oms.transition(order2.id, OrderEvent.ACKNOWLEDGE);

      const order3 = oms.createOrder({
        symbol: 'GOOGL',
        side: 'buy',
        orderType: 'market',
        quantity: 25,
      });
      oms.transition(order3.id, OrderEvent.QUEUE);
      oms.cancel(order3.id);
    });

    it('should return correct stats', () => {
      const stats = oms.getStats();

      expect(stats.total).toBe(3);
      expect(stats.active).toBe(1);
      expect(stats.completed).toBe(2);
      expect(stats.fillRate).toBe(0.5); // 1 filled out of 2 completed
    });

    it('should track counts by state', () => {
      const stats = oms.getStats();

      expect(stats.byState[OrderState.FILLED]).toBe(1);
      expect(stats.byState[OrderState.SUBMITTED]).toBe(1);
      expect(stats.byState[OrderState.CANCELLED]).toBe(1);
    });
  });

  describe('Pruning', () => {
    it('should prune old completed orders', async () => {
      const order1 = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.transition(order1.id, OrderEvent.QUEUE);
      oms.transition(order1.id, OrderEvent.SUBMIT);
      oms.transition(order1.id, OrderEvent.ACKNOWLEDGE);
      oms.transition(order1.id, OrderEvent.FILL);

      // Manually set completedAt to past
      order1.completedAt = new Date(Date.now() - 1000);

      const order2 = oms.createOrder({
        symbol: 'MSFT',
        side: 'buy',
        orderType: 'market',
        quantity: 50,
      });
      oms.transition(order2.id, OrderEvent.QUEUE);
      oms.transition(order2.id, OrderEvent.SUBMIT);
      oms.transition(order2.id, OrderEvent.ACKNOWLEDGE);
      oms.transition(order2.id, OrderEvent.FILL);

      const pruned = oms.pruneCompleted(500); // Prune orders older than 500ms

      expect(pruned).toBe(1);
      expect(oms.getOrder(order1.id)).toBeUndefined();
      expect(oms.getOrder(order2.id)).toBeDefined();
    });

    it('should not prune active orders', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);

      const pruned = oms.pruneCompleted(0);

      expect(pruned).toBe(0);
      expect(oms.getOrder(order.id)).toBeDefined();
    });
  });

  describe('Callbacks', () => {
    it('should call onStateChange callback', () => {
      const callback = jest.fn();
      const omsWithCallback = createOMS({ onStateChange: callback });

      const order = omsWithCallback.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      omsWithCallback.transition(order.id, OrderEvent.QUEUE);

      expect(callback).toHaveBeenCalled();
      const [calledOrder, transition] = callback.mock.calls[0];
      expect(calledOrder.id).toBe(order.id);
      expect(transition.to).toBe(OrderState.PENDING);
    });

    it('should call onFill callback', () => {
      const callback = jest.fn();
      const omsWithCallback = createOMS({ onFill: callback });

      const order = omsWithCallback.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      omsWithCallback.transition(order.id, OrderEvent.QUEUE);
      omsWithCallback.transition(order.id, OrderEvent.SUBMIT);
      omsWithCallback.transition(order.id, OrderEvent.ACKNOWLEDGE);
      omsWithCallback.recordFill(order.id, { quantity: 50, price: 150 });

      expect(callback).toHaveBeenCalled();
      const [calledOrder, fill] = callback.mock.calls[0];
      expect(calledOrder.id).toBe(order.id);
      expect(fill.quantity).toBe(50);
      expect(fill.price).toBe(150);
    });
  });

  describe('Singleton Pattern', () => {
    beforeEach(() => {
      resetOMS();
    });

    it('should return same instance from getOMS', () => {
      const oms1 = getOMS();
      const oms2 = getOMS();
      expect(oms1).toBe(oms2);
    });

    it('should reset singleton on resetOMS', () => {
      const oms1 = getOMS();
      oms1.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      resetOMS();
      const oms2 = getOMS();

      expect(oms2.getAllOrders().length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle orders with zero quantity gracefully', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 0,
      });

      expect(order.quantity).toBe(0);
      expect(order.remainingQuantity).toBe(0);
    });

    it('should handle validation bypass (PENDING → SUBMITTING)', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT); // Skip VALIDATE

      expect(order.state).toBe(OrderState.SUBMITTING);
    });

    it('should allow multiple partial fills', () => {
      const order = oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });

      oms.transition(order.id, OrderEvent.QUEUE);
      oms.transition(order.id, OrderEvent.SUBMIT);
      oms.transition(order.id, OrderEvent.ACKNOWLEDGE);

      oms.recordFill(order.id, { quantity: 25, price: 149 });
      expect(order.state).toBe(OrderState.PARTIAL);

      oms.recordFill(order.id, { quantity: 25, price: 150 });
      expect(order.state).toBe(OrderState.PARTIAL);

      oms.recordFill(order.id, { quantity: 50, price: 151 });
      expect(order.state).toBe(OrderState.FILLED);
      expect(order.fills.length).toBe(3);
    });

    it('should clear all orders', () => {
      oms.createOrder({
        symbol: 'AAPL',
        side: 'buy',
        orderType: 'market',
        quantity: 100,
      });
      oms.createOrder({
        symbol: 'MSFT',
        side: 'sell',
        orderType: 'limit',
        quantity: 50,
        limitPrice: 400,
      });

      oms.clear();

      expect(oms.getAllOrders().length).toBe(0);
    });
  });
});
