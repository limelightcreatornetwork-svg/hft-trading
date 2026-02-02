/**
 * Tests for Audit Logging System
 */

// Mock prisma before imports
jest.mock('../../src/lib/db', () => ({
  prisma: {
    auditLog: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
    },
  },
}));

import { prisma } from '../../src/lib/db';
import {
  logAudit,
  queryAuditLogs,
  getActivitySummary,
  audit,
  shutdownAuditLog,
} from '../../src/lib/audit-log';

describe('Audit Logging System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear any pending flushes
    jest.clearAllTimers();
  });

  afterEach(async () => {
    // Ensure buffer is flushed after each test
    await shutdownAuditLog();
  });

  describe('logAudit', () => {
    it('should add entry to buffer', async () => {
      await logAudit({
        action: 'ORDER_SUBMITTED',
        symbol: 'AAPL',
        orderId: 'order-123',
      });

      // Force flush
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalled();
    });

    it('should include all provided fields', async () => {
      await logAudit({
        action: 'INTENT_CREATED',
        userId: 'user-1',
        clientId: 'client-1',
        symbol: 'MSFT',
        orderId: 'order-456',
        intentId: 'intent-789',
        positionId: 'pos-123',
        details: { quantity: 100, side: 'buy' },
        ipAddress: '127.0.0.1',
        userAgent: 'TestAgent/1.0',
      });

      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'INTENT_CREATED',
            userId: 'user-1',
            clientId: 'client-1',
            symbol: 'MSFT',
            orderId: 'order-456',
            intentId: 'intent-789',
            positionId: 'pos-123',
            details: expect.stringContaining('quantity'),
            ipAddress: '127.0.0.1',
            userAgent: 'TestAgent/1.0',
          }),
        ]),
      });
    });
  });

  describe('audit helpers', () => {
    it('should log order submitted', async () => {
      await audit.orderSubmitted('order-1', 'AAPL', { quantity: 100 });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'ORDER_SUBMITTED',
            orderId: 'order-1',
            symbol: 'AAPL',
          }),
        ]),
      });
    });

    it('should log order cancelled', async () => {
      await audit.orderCancelled('order-2', 'GOOGL');
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'ORDER_CANCELLED',
            orderId: 'order-2',
            symbol: 'GOOGL',
          }),
        ]),
      });
    });

    it('should log kill switch activated', async () => {
      await audit.killSwitchActivated({ cancelledOrders: 5 });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'KILL_SWITCH_ACTIVATED',
            details: expect.stringContaining('cancelledOrders'),
          }),
        ]),
      });
    });

    it('should log kill switch deactivated', async () => {
      await audit.killSwitchDeactivated();
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'KILL_SWITCH_DEACTIVATED',
          }),
        ]),
      });
    });

    it('should log position opened', async () => {
      await audit.positionOpened('pos-1', 'TSLA', { confidence: 8 });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'POSITION_OPENED',
            positionId: 'pos-1',
            symbol: 'TSLA',
          }),
        ]),
      });
    });

    it('should log position closed', async () => {
      await audit.positionClosed('pos-2', 'META', { reason: 'TP_HIT', pnl: 150 });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'POSITION_CLOSED',
            positionId: 'pos-2',
            symbol: 'META',
          }),
        ]),
      });
    });

    it('should log risk check passed', async () => {
      await audit.riskCheckPassed('intent-1', 'NVDA');
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'RISK_CHECK_PASSED',
            intentId: 'intent-1',
            symbol: 'NVDA',
          }),
        ]),
      });
    });

    it('should log risk check failed', async () => {
      await audit.riskCheckFailed('intent-2', 'AMD', { reason: 'exceeds_position_limit' });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'RISK_CHECK_FAILED',
            intentId: 'intent-2',
            symbol: 'AMD',
          }),
        ]),
      });
    });

    it('should log auth success', async () => {
      await audit.authSuccess('client-123', '192.168.1.1', 'Mozilla/5.0');
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'AUTH_SUCCESS',
            clientId: 'client-123',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
          }),
        ]),
      });
    });

    it('should log auth failure', async () => {
      await audit.authFailure('10.0.0.1', 'curl/7.0', { reason: 'invalid_api_key' });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'AUTH_FAILURE',
            ipAddress: '10.0.0.1',
            userAgent: 'curl/7.0',
          }),
        ]),
      });
    });

    it('should log config changed', async () => {
      await audit.configChanged({ field: 'maxPositionSize', oldValue: 1000, newValue: 2000 });
      await shutdownAuditLog();

      expect(prisma.auditLog.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            action: 'CONFIG_CHANGED',
          }),
        ]),
      });
    });
  });

  describe('queryAuditLogs', () => {
    it('should query with action filter', async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: '1',
          action: 'ORDER_SUBMITTED',
          symbol: 'AAPL',
          createdAt: new Date(),
        },
      ]);

      const result = await queryAuditLogs({ action: 'ORDER_SUBMITTED' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'ORDER_SUBMITTED' }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('should query with symbol filter', async () => {
      await queryAuditLogs({ symbol: 'TSLA' });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ symbol: 'TSLA' }),
        })
      );
    });

    it('should query with date range', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      await queryAuditLogs({ startDate, endDate });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: startDate, lte: endDate },
          }),
        })
      );
    });

    it('should respect limit', async () => {
      await queryAuditLogs({ limit: 50 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        })
      );
    });

    it('should use default limit of 100', async () => {
      await queryAuditLogs({});

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
        })
      );
    });
  });

  describe('getActivitySummary', () => {
    it('should aggregate events correctly', async () => {
      (prisma.auditLog.groupBy as jest.Mock)
        .mockResolvedValueOnce([
          { action: 'ORDER_SUBMITTED', _count: { action: 10 } },
          { action: 'ORDER_CANCELLED', _count: { action: 3 } },
          { action: 'RISK_CHECK_PASSED', _count: { action: 15 } },
          { action: 'AUTH_SUCCESS', _count: { action: 5 } },
        ])
        .mockResolvedValueOnce([
          { symbol: 'AAPL', _count: { symbol: 8 } },
          { symbol: 'MSFT', _count: { symbol: 5 } },
        ]);

      const summary = await getActivitySummary(24);

      expect(summary.totalEvents).toBe(33);
      expect(summary.orderEvents).toBe(13); // ORDER_SUBMITTED + ORDER_CANCELLED
      expect(summary.riskEvents).toBe(15);
      expect(summary.authEvents).toBe(5);
      expect(summary.topSymbols).toHaveLength(2);
      expect(summary.topSymbols[0]).toEqual({ symbol: 'AAPL', count: 8 });
    });

    it('should handle empty results', async () => {
      (prisma.auditLog.groupBy as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const summary = await getActivitySummary();

      expect(summary.totalEvents).toBe(0);
      expect(summary.orderEvents).toBe(0);
      expect(summary.riskEvents).toBe(0);
      expect(summary.authEvents).toBe(0);
      expect(summary.topSymbols).toHaveLength(0);
    });
  });

  describe('buffer behavior', () => {
    it('should batch multiple entries together', async () => {
      // Log multiple events
      await audit.orderSubmitted('order-1', 'AAPL');
      await audit.orderSubmitted('order-2', 'MSFT');
      await audit.orderSubmitted('order-3', 'GOOGL');

      // Force flush
      await shutdownAuditLog();

      // Should be called once with all entries
      expect(prisma.auditLog.createMany).toHaveBeenCalledTimes(1);
      const callArg = (prisma.auditLog.createMany as jest.Mock).mock.calls[0][0];
      expect(callArg.data.length).toBe(3);
    });

    it('should handle database errors gracefully', async () => {
      (prisma.auditLog.createMany as jest.Mock).mockRejectedValueOnce(new Error('DB connection failed'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await audit.orderSubmitted('order-1', 'AAPL');
      await shutdownAuditLog();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[AUDIT] Failed to flush'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});

describe('AuditAction types', () => {
  it('should have all expected action types', () => {
    // All actions should be supported by the audit helper object
    expect(audit.orderSubmitted).toBeDefined();
    expect(audit.orderCancelled).toBeDefined();
    expect(audit.orderFilled).toBeDefined();
    expect(audit.orderRejected).toBeDefined();
    expect(audit.intentCreated).toBeDefined();
    expect(audit.intentApproved).toBeDefined();
    expect(audit.intentRejected).toBeDefined();
    expect(audit.killSwitchActivated).toBeDefined();
    expect(audit.killSwitchDeactivated).toBeDefined();
    expect(audit.positionOpened).toBeDefined();
    expect(audit.positionClosed).toBeDefined();
    expect(audit.riskCheckPassed).toBeDefined();
    expect(audit.riskCheckFailed).toBeDefined();
    expect(audit.authSuccess).toBeDefined();
    expect(audit.authFailure).toBeDefined();
    expect(audit.configChanged).toBeDefined();
  });
});
