/**
 * @fileoverview Tests for OMS State Machine
 * @module tests/core/oms-state-machine
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { OMSStateMachine } from '../../src/core/oms-state-machine.js';
import { OrderState, IntentStatus } from '../../src/core/types.js';

// Noop logger for tests
const noopLogger = {
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
};

describe('OMSStateMachine', () => {
  let oms;

  beforeEach(() => {
    oms = new OMSStateMachine({
      logger: noopLogger,
    });
  });

  afterEach(() => {
    oms.reset();
  });

  describe('Intent Creation', () => {
    test('creates new intent with unique ID', () => {
      const result = oms.createIntent({
        client_intent_id: 'test-intent-001',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
        type: 'limit',
        limit_price: 150.00,
        meta: { strategy: 'momentum_scalp', reason: 'breakout' },
      });

      expect(result.isNew).toBe(true);
      expect(result.intent).toBeDefined();
      expect(result.intent.id).toBeDefined();
      expect(result.intent.client_intent_id).toBe('test-intent-001');
      expect(result.intent.symbol).toBe('AAPL');
      expect(result.intent.side).toBe('buy');
      expect(result.intent.qty).toBe(100);
      expect(result.intent.status).toBe(IntentStatus.PENDING);
    });

    test('returns existing intent for duplicate client_intent_id (idempotency)', () => {
      const first = oms.createIntent({
        client_intent_id: 'test-intent-002',
        symbol: 'AAPL',
        side: 'buy',
        qty: 100,
      });

      const second = oms.createIntent({
        client_intent_id: 'test-intent-002',
        symbol: 'MSFT', // Different symbol
        side: 'sell',
        qty: 200,
      });

      expect(second.isNew).toBe(false);
      expect(second.intent.id).toBe(first.intent.id);
      expect(second.intent.symbol).toBe('AAPL'); // Original symbol preserved
      expect(oms.getStats().idempotentHits).toBe(1);
    });

    test('normalizes symbol to uppercase', () => {
      const result = oms.createIntent({
        client_intent_id: 'test-intent-003',
        symbol: 'aapl',
        side: 'buy',
        qty: 50,
      });

      expect(result.intent.symbol).toBe('AAPL');
    });
  });

  describe('Intent Acceptance', () => {
    test('accepts intent and creates order', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'accept-test-001',
        symbol: 'TSLA',
        side: 'buy',
        qty: 50,
        limit_price: 200.00,
      });

      const riskDecision = { accepted: true, checks: [] };
      const result = oms.acceptIntent(intent.id, riskDecision);

      expect(result.isNew).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.order.status).toBe(OrderState.NEW);
      expect(result.order.intent_id).toBe(intent.id);
      expect(result.order.symbol).toBe('TSLA');
      expect(result.intent.status).toBe(IntentStatus.ACCEPTED);
    });

    test('throws for non-existent intent', () => {
      expect(() => {
        oms.acceptIntent('non-existent-id', {});
      }).toThrow('Intent not found');
    });

    test('throws for already processed intent', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'accept-test-002',
        symbol: 'NVDA',
        side: 'sell',
        qty: 25,
      });

      oms.acceptIntent(intent.id, {});

      expect(() => {
        oms.acceptIntent(intent.id, {});
      }).toThrow('not pending');
    });
  });

  describe('Intent Rejection', () => {
    test('rejects pending intent', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'reject-test-001',
        symbol: 'AAPL',
        side: 'buy',
        qty: 10000, // Large order
      });

      const result = oms.rejectIntent(intent.id, 'exceeds_position_limit', { maxAllowed: 1000 });

      expect(result.changed).toBe(true);
      expect(result.intent.status).toBe(IntentStatus.REJECTED);
      expect(result.intent.risk_decision.reason).toBe('exceeds_position_limit');
      expect(oms.getStats().rejectedIntents).toBe(1);
    });

    test('no-op for already rejected intent', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'reject-test-002',
        symbol: 'MSFT',
        side: 'buy',
        qty: 100,
      });

      oms.rejectIntent(intent.id, 'first_rejection');
      const result = oms.rejectIntent(intent.id, 'second_rejection');

      expect(result.changed).toBe(false);
      expect(result.intent.risk_decision.reason).toBe('first_rejection');
    });
  });

  describe('Order State Transitions', () => {
    let order;

    beforeEach(() => {
      const { intent } = oms.createIntent({
        client_intent_id: 'transition-test-001',
        symbol: 'SPY',
        side: 'buy',
        qty: 100,
        limit_price: 450.00,
      });
      const result = oms.acceptIntent(intent.id, {});
      order = result.order;
    });

    test('transitions from NEW to SUBMITTED', () => {
      const result = oms.transitionOrder(order.id, OrderState.SUBMITTED);

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.SUBMITTED);
      expect(result.previousState).toBe(OrderState.NEW);
      expect(result.order.submitted_at).toBeDefined();
    });

    test('transitions from SUBMITTED to ACCEPTED', () => {
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      const result = oms.transitionOrder(order.id, OrderState.ACCEPTED, {
        broker_order_id: 'alpaca-123',
      });

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.ACCEPTED);
      expect(result.order.broker_order_id).toBe('alpaca-123');
      expect(result.order.accepted_at).toBeDefined();
    });

    test('transitions from ACCEPTED to PARTIAL with fill', () => {
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.ACCEPTED);

      const result = oms.transitionOrder(order.id, OrderState.PARTIAL, {
        fill: { qty: 50, price: 449.95 },
      });

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.PARTIAL);
      expect(result.order.filled_qty).toBe(50);
      expect(result.order.remaining_qty).toBe(50);
      expect(result.order.avg_fill_price).toBe(449.95);
      expect(result.order.fills.length).toBe(1);
    });

    test('transitions from PARTIAL to FILLED', () => {
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.ACCEPTED);
      oms.transitionOrder(order.id, OrderState.PARTIAL, {
        fill: { qty: 50, price: 449.95 },
      });

      const result = oms.transitionOrder(order.id, OrderState.FILLED, {
        fill: { qty: 50, price: 450.05 },
      });

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.FILLED);
      expect(result.order.filled_qty).toBe(100);
      expect(result.order.remaining_qty).toBe(0);
      expect(result.order.avg_fill_price).toBe(450.00); // (50*449.95 + 50*450.05) / 100
      expect(result.order.filled_at).toBeDefined();
    });

    test('rejects invalid state transition', () => {
      // Can't go directly from NEW to FILLED
      const result = oms.transitionOrder(order.id, OrderState.FILLED);

      expect(result.changed).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(oms.getStats().invalidTransitions).toBe(1);
    });

    test('idempotent for same state', () => {
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      const result = oms.transitionOrder(order.id, OrderState.SUBMITTED);

      expect(result.changed).toBe(false);
      expect(result.order.status).toBe(OrderState.SUBMITTED);
    });

    test('rejects transition from terminal state', () => {
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.REJECTED, { reason: 'insufficient_funds' });

      const result = oms.transitionOrder(order.id, OrderState.ACCEPTED);

      expect(result.changed).toBe(false);
      expect(result.error).toContain('terminal state');
    });
  });

  describe('Position Tracking', () => {
    test('updates position after buy fill', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'position-test-001',
        symbol: 'QQQ',
        side: 'buy',
        qty: 100,
        limit_price: 400.00,
      });

      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.ACCEPTED);
      oms.transitionOrder(order.id, OrderState.FILLED, {
        fill: { qty: 100, price: 399.50 },
      });

      const position = oms.getPosition('QQQ');
      expect(position).not.toBeNull();
      expect(position.qty).toBe(100);
      expect(position.avg_entry_price).toBeCloseTo(399.50, 2);
    });

    test('updates position after sell fill', () => {
      // First buy
      const { intent: buyIntent } = oms.createIntent({
        client_intent_id: 'position-test-002a',
        symbol: 'IWM',
        side: 'buy',
        qty: 200,
        limit_price: 200.00,
      });
      const { order: buyOrder } = oms.acceptIntent(buyIntent.id, {});
      oms.transitionOrder(buyOrder.id, OrderState.SUBMITTED);
      oms.transitionOrder(buyOrder.id, OrderState.ACCEPTED);
      oms.transitionOrder(buyOrder.id, OrderState.FILLED, {
        fill: { qty: 200, price: 199.00 },
      });

      // Then sell
      const { intent: sellIntent } = oms.createIntent({
        client_intent_id: 'position-test-002b',
        symbol: 'IWM',
        side: 'sell',
        qty: 100,
        limit_price: 205.00,
      });
      const { order: sellOrder } = oms.acceptIntent(sellIntent.id, {});
      oms.transitionOrder(sellOrder.id, OrderState.SUBMITTED);
      oms.transitionOrder(sellOrder.id, OrderState.ACCEPTED);
      oms.transitionOrder(sellOrder.id, OrderState.FILLED, {
        fill: { qty: 100, price: 205.00 },
      });

      const position = oms.getPosition('IWM');
      expect(position.qty).toBe(100);
      expect(position.realized_pnl).toBeCloseTo(600, 2); // (205 - 199) * 100
    });
  });

  describe('Broker Update Handling', () => {
    test('handles broker new event', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'broker-test-001',
        symbol: 'AMZN',
        side: 'buy',
        qty: 10,
      });
      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);

      const result = oms.handleBrokerUpdate({
        event: 'new',
        order: {
          id: 'broker-order-123',
          client_order_id: order.client_order_id,
          status: 'new',
        },
      });

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.ACCEPTED);
      expect(result.order.broker_order_id).toBe('broker-order-123');
    });

    test('handles broker fill event', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'broker-test-002',
        symbol: 'GOOG',
        side: 'buy',
        qty: 5,
      });
      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.ACCEPTED, { broker_order_id: 'broker-456' });

      const result = oms.handleBrokerUpdate({
        event: 'fill',
        order: {
          id: 'broker-456',
          client_order_id: order.client_order_id,
          filled_qty: '5',
          filled_avg_price: '140.25',
          updated_at: new Date().toISOString(),
        },
      });

      expect(result.changed).toBe(true);
      expect(result.order.status).toBe(OrderState.FILLED);
      expect(result.order.filled_qty).toBe(5);
    });

    test('handles unknown order gracefully', () => {
      const result = oms.handleBrokerUpdate({
        event: 'fill',
        order: {
          id: 'unknown-order',
          client_order_id: 'unknown-client-id',
        },
      });

      expect(result.handled).toBe(false);
      expect(result.reason).toBe('Order not found');
    });
  });

  describe('Reconciliation', () => {
    test('identifies missing orders on broker', async () => {
      // Create local order
      const { intent } = oms.createIntent({
        client_intent_id: 'recon-test-001',
        symbol: 'META',
        side: 'buy',
        qty: 20,
      });
      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);

      // Reconcile with empty broker orders
      const result = await oms.reconcile([], []);

      expect(result.success).toBe(true);
      expect(result.discrepancies.length).toBeGreaterThan(0);
      expect(result.discrepancies.some(d => d.type === 'missing_on_broker')).toBe(true);
    });

    test('identifies status mismatches', async () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'recon-test-002',
        symbol: 'NFLX',
        side: 'buy',
        qty: 15,
      });
      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);
      oms.transitionOrder(order.id, OrderState.ACCEPTED, { broker_order_id: 'broker-789' });

      // Broker says it's filled but we think it's accepted
      const brokerOrders = [{
        id: 'broker-789',
        client_order_id: order.client_order_id,
        status: 'filled',
        filled_qty: '15',
        filled_avg_price: '600.00',
      }];

      const result = await oms.reconcile(brokerOrders, []);

      expect(result.discrepancies.some(d => d.type === 'status_mismatch')).toBe(true);
      // Order should be updated to match broker
      expect(oms.getOrder(order.id).status).toBe(OrderState.FILLED);
    });

    test('syncs positions from broker', async () => {
      const brokerPositions = [
        { symbol: 'AAPL', qty: '100', market_value: '15000', avg_entry_price: '150' },
        { symbol: 'MSFT', qty: '50', market_value: '20000', avg_entry_price: '400' },
      ];

      const result = await oms.reconcile([], brokerPositions);

      expect(result.discrepancies.some(d => d.type === 'position_missing_locally')).toBe(true);
      expect(oms.getPosition('AAPL')).not.toBeNull();
      expect(oms.getPosition('MSFT')).not.toBeNull();
    });
  });

  describe('Statistics', () => {
    test('tracks order statistics correctly', () => {
      // Create and process several intents
      for (let i = 0; i < 3; i++) {
        const { intent } = oms.createIntent({
          client_intent_id: `stats-test-${i}`,
          symbol: 'AAPL',
          side: 'buy',
          qty: 10,
        });
        
        if (i < 2) {
          oms.acceptIntent(intent.id, {});
        } else {
          oms.rejectIntent(intent.id, 'test_rejection');
        }
      }

      const stats = oms.getStats();
      expect(stats.totalIntents).toBe(3);
      expect(stats.acceptedIntents).toBe(2);
      expect(stats.rejectedIntents).toBe(1);
      expect(stats.totalOrders).toBe(2);
    });
  });

  describe('Event Log', () => {
    test('logs intent and order events', () => {
      const { intent } = oms.createIntent({
        client_intent_id: 'event-test-001',
        symbol: 'TSLA',
        side: 'buy',
        qty: 5,
      });

      const { order } = oms.acceptIntent(intent.id, {});
      oms.transitionOrder(order.id, OrderState.SUBMITTED);

      const events = oms.getRecentEvents(10);
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.some(e => e.type === 'INTENT_CREATED')).toBe(true);
      expect(events.some(e => e.type === 'INTENT_ACCEPTED')).toBe(true);
      expect(events.some(e => e.type === 'ORDER_STATE_CHANGED')).toBe(true);
    });
  });
});
