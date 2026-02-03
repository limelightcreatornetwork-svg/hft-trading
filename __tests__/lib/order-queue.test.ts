/**
 * Tests for Order Queue Service
 */

import {
  orderQueue,
  submitMarketOrder,
  submitLimitOrder,
  submitStopLossOrder,
  submitBracketOrder,
  cancelAllPendingOrders,
} from '@/lib/order-queue';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@/lib/alpaca', () => ({
  submitOrder: jest.fn(),
  getOrders: jest.fn(),
  cancelOrder: jest.fn(),
}));

import { prisma } from '@/lib/db';
import { submitOrder, getOrders, cancelOrder } from '@/lib/alpaca';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSubmitOrder = submitOrder as jest.Mock;
const mockGetOrders = getOrders as jest.Mock;
const mockCancelOrder = cancelOrder as jest.Mock;

describe('Order Queue Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the queue completely
    orderQueue.reset();
  });

  describe('orderQueue.enqueue', () => {
    it('should add an order to the queue', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const order = await orderQueue.enqueue({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      });

      expect(order.order.symbol).toBe('AAPL');
      expect(order.order.qty).toBe(10);
      expect(order.status).toBe('pending');
      expect(order.priority).toBe('normal');
    });

    it('should respect priority setting', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const highPriority = await orderQueue.enqueue(
        { symbol: 'TSLA', qty: 5, side: 'sell', type: 'market', time_in_force: 'day' },
        { priority: 'high' }
      );

      const criticalPriority = await orderQueue.enqueue(
        { symbol: 'NVDA', qty: 3, side: 'buy', type: 'market', time_in_force: 'day' },
        { priority: 'critical' }
      );

      expect(highPriority.priority).toBe('high');
      expect(criticalPriority.priority).toBe('critical');
    });

    it('should set retry configuration', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const order = await orderQueue.enqueue(
        { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' },
        { maxRetries: 5, retryDelayMs: 2000 }
      );

      expect(order.maxRetries).toBe(5);
      expect(order.retryDelayMs).toBe(2000);
    });

    it('should store metadata', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const order = await orderQueue.enqueue(
        { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' },
        { metadata: { strategy: 'momentum', signal: 'breakout' } }
      );

      expect(order.metadata).toEqual({ strategy: 'momentum', signal: 'breakout' });
    });
  });

  describe('orderQueue.enqueueBatch', () => {
    it('should add multiple orders at once', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const orders = await orderQueue.enqueueBatch([
        { order: { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' } },
        { order: { symbol: 'TSLA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' }, priority: 'high' },
        { order: { symbol: 'NVDA', qty: 3, side: 'sell', type: 'market', time_in_force: 'day' } },
      ]);

      expect(orders.length).toBe(3);
      expect(orders[1].priority).toBe('high');
    });
  });

  describe('orderQueue.processQueue', () => {
    it('should process orders in priority order', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockResolvedValue({ id: 'broker-1', status: 'accepted' });

      // Add orders with different priorities
      await orderQueue.enqueue(
        { symbol: 'LOW', qty: 1, side: 'buy', type: 'market', time_in_force: 'day' },
        { priority: 'low' }
      );
      await orderQueue.enqueue(
        { symbol: 'CRITICAL', qty: 1, side: 'buy', type: 'market', time_in_force: 'day' },
        { priority: 'critical' }
      );
      await orderQueue.enqueue(
        { symbol: 'HIGH', qty: 1, side: 'buy', type: 'market', time_in_force: 'day' },
        { priority: 'high' }
      );

      const result = await orderQueue.processQueue();

      expect(result.processed).toBe(3);
      expect(result.submitted).toBe(3);
      // Check order of submission (critical first, then high, then low)
      const calls = mockSubmitOrder.mock.calls;
      expect(calls[0][0].symbol).toBe('CRITICAL');
      expect(calls[1][0].symbol).toBe('HIGH');
      expect(calls[2][0].symbol).toBe('LOW');
    });

    it('should handle failed orders and retry', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      
      // Fail first two attempts, succeed on third
      mockSubmitOrder
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockRejectedValueOnce(new Error('Temporary network error'))
        .mockResolvedValueOnce({ id: 'broker-1', status: 'accepted' });

      await orderQueue.enqueue(
        { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' },
        { maxRetries: 3, retryDelayMs: 10 } // Short delay for tests
      );

      const result = await orderQueue.processQueue();

      expect(result.submitted).toBe(1);
      expect(mockSubmitOrder).toHaveBeenCalledTimes(3);
    });

    it('should fail permanently after max retries', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockRejectedValue(new Error('Persistent error'));

      await orderQueue.enqueue(
        { symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' },
        { maxRetries: 2, retryDelayMs: 10 }
      );

      const result = await orderQueue.processQueue();

      expect(result.failed).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(mockSubmitOrder).toHaveBeenCalledTimes(2);
    });

    it('should not retry non-retryable errors', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockRejectedValue(new Error('Insufficient buying power'));

      await orderQueue.enqueue(
        { symbol: 'AAPL', qty: 10000, side: 'buy', type: 'market', time_in_force: 'day' },
        { maxRetries: 3, retryDelayMs: 10 }
      );

      const result = await orderQueue.processQueue();

      expect(result.failed).toBe(1);
      // Should only try once for non-retryable errors
      expect(mockSubmitOrder).toHaveBeenCalledTimes(1);
    });
  });

  describe('orderQueue.cancelOrder', () => {
    it('should cancel a pending order', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});

      const order = await orderQueue.enqueue({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      });

      const result = await orderQueue.cancelOrder(order.id);

      expect(result).toBe(true);
      expect(orderQueue.getOrder(order.id)?.status).toBe('cancelled');
    });

    it('should cancel a submitted order with broker', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockResolvedValue({ id: 'broker-123', status: 'accepted' });
      mockCancelOrder.mockResolvedValue(true);

      const order = await orderQueue.enqueue({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      });

      await orderQueue.processQueue();

      const result = await orderQueue.cancelOrder(order.id);

      expect(result).toBe(true);
      expect(mockCancelOrder).toHaveBeenCalledWith('broker-123');
    });

    it('should throw for non-existent order', async () => {
      await expect(orderQueue.cancelOrder('non-existent'))
        .rejects.toThrow('Order not found in queue');
    });
  });

  describe('orderQueue.getStats', () => {
    it('should return correct statistics', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockResolvedValue({ id: 'broker-1', status: 'filled', filled_qty: '10' });

      await orderQueue.enqueue({ symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' });
      await orderQueue.enqueue({ symbol: 'TSLA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' });
      await orderQueue.processQueue();
      await orderQueue.enqueue({ symbol: 'NVDA', qty: 3, side: 'buy', type: 'market', time_in_force: 'day' });

      const stats = orderQueue.getStats();

      expect(stats.pending).toBe(1);
      expect(stats.filled).toBe(2);
      expect(stats.total).toBe(3);
    });
  });

  describe('orderQueue.syncOrderStatuses', () => {
    it('should update statuses from broker', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockResolvedValue({ id: 'broker-123', status: 'new' });

      const order = await orderQueue.enqueue({
        symbol: 'AAPL',
        qty: 10,
        side: 'buy',
        type: 'market',
        time_in_force: 'day',
      });

      await orderQueue.processQueue();

      // Mock broker returning filled status
      mockGetOrders.mockResolvedValue([
        { id: 'broker-123', status: 'filled', filled_qty: '10', filled_avg_price: '150.50' },
      ]);

      const updated = await orderQueue.syncOrderStatuses();

      expect(updated).toBe(1);
      const syncedOrder = orderQueue.getOrder(order.id);
      expect(syncedOrder?.status).toBe('filled');
      expect(syncedOrder?.filledQty).toBe(10);
      expect(syncedOrder?.avgFillPrice).toBe(150.50);
    });
  });

  describe('orderQueue.clearCompleted', () => {
    it('should clear completed orders', async () => {
      (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
      mockSubmitOrder.mockResolvedValue({ id: 'broker-1', status: 'filled' });

      await orderQueue.enqueue({ symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' });
      await orderQueue.processQueue();
      await orderQueue.enqueue({ symbol: 'TSLA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' });

      const cleared = orderQueue.clearCompleted();

      expect(cleared).toBe(1);
      expect(orderQueue.getAllOrders().length).toBe(1);
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orderQueue.reset();
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  describe('submitMarketOrder', () => {
    it('should create a market order with correct parameters', async () => {
      const order = await submitMarketOrder('AAPL', 10, 'buy', 'high');

      expect(order.order.symbol).toBe('AAPL');
      expect(order.order.qty).toBe(10);
      expect(order.order.side).toBe('buy');
      expect(order.order.type).toBe('market');
      expect(order.priority).toBe('high');
    });
  });

  describe('submitLimitOrder', () => {
    it('should create a limit order with correct parameters', async () => {
      const order = await submitLimitOrder('TSLA', 5, 'sell', 250.00);

      expect(order.order.symbol).toBe('TSLA');
      expect(order.order.qty).toBe(5);
      expect(order.order.side).toBe('sell');
      expect(order.order.type).toBe('limit');
      expect(order.order.limit_price).toBe(250.00);
    });
  });

  describe('submitStopLossOrder', () => {
    it('should create a stop-loss order with high priority', async () => {
      const order = await submitStopLossOrder('NVDA', 3, 550.00);

      expect(order.order.symbol).toBe('NVDA');
      expect(order.order.qty).toBe(3);
      expect(order.order.side).toBe('sell');
      expect(order.order.type).toBe('stop');
      expect(order.order.stop_price).toBe(550.00);
      expect(order.priority).toBe('high');
    });
  });

  describe('submitBracketOrder', () => {
    it('should create entry, stop-loss, and take-profit orders', async () => {
      const bracket = await submitBracketOrder(
        'META',
        10,
        'buy',
        500,  // entry
        480,  // stop loss
        550   // take profit
      );

      expect(bracket.entry.order.symbol).toBe('META');
      expect(bracket.entry.order.limit_price).toBe(500);
      expect(bracket.entry.priority).toBe('high');

      expect(bracket.stopLoss.order.stop_price).toBe(480);
      expect(bracket.stopLoss.order.side).toBe('sell');
      expect(bracket.stopLoss.metadata?.orderType).toBe('bracket_stop');

      expect(bracket.takeProfit.order.limit_price).toBe(550);
      expect(bracket.takeProfit.order.side).toBe('sell');
      expect(bracket.takeProfit.metadata?.orderType).toBe('bracket_tp');
    });
  });

  describe('cancelAllPendingOrders', () => {
    it('should cancel all pending orders', async () => {
      await orderQueue.enqueue({ symbol: 'AAPL', qty: 10, side: 'buy', type: 'market', time_in_force: 'day' });
      await orderQueue.enqueue({ symbol: 'TSLA', qty: 5, side: 'buy', type: 'market', time_in_force: 'day' });
      await orderQueue.enqueue({ symbol: 'NVDA', qty: 3, side: 'buy', type: 'market', time_in_force: 'day' });

      const cancelled = await cancelAllPendingOrders();

      expect(cancelled).toBe(3);
      expect(orderQueue.getOrdersByStatus('pending').length).toBe(0);
    });
  });
});

describe('Priority Sorting', () => {
  it('should order by priority weight correctly', () => {
    const priorities: Array<{ priority: string; weight: number }> = [
      { priority: 'critical', weight: 1000 },
      { priority: 'high', weight: 100 },
      { priority: 'normal', weight: 10 },
      { priority: 'low', weight: 1 },
    ];

    const sorted = priorities.sort((a, b) => b.weight - a.weight);

    expect(sorted[0].priority).toBe('critical');
    expect(sorted[1].priority).toBe('high');
    expect(sorted[2].priority).toBe('normal');
    expect(sorted[3].priority).toBe('low');
  });

  it('should order by creation time within same priority', () => {
    const orders = [
      { priority: 'normal', createdAt: new Date('2024-01-01T10:00:00') },
      { priority: 'normal', createdAt: new Date('2024-01-01T09:00:00') },
      { priority: 'normal', createdAt: new Date('2024-01-01T11:00:00') },
    ];

    const sorted = orders.sort((a, b) => 
      a.createdAt.getTime() - b.createdAt.getTime()
    );

    expect(sorted[0].createdAt.getHours()).toBe(9);
    expect(sorted[1].createdAt.getHours()).toBe(10);
    expect(sorted[2].createdAt.getHours()).toBe(11);
  });
});
