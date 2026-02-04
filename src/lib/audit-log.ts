/**
 * Audit Logging System
 *
 * Tracks all significant trading operations for:
 * - Security monitoring (unauthorized access attempts)
 * - Compliance (regulatory requirements)
 * - Debugging (trace issues back to source)
 *
 * Uses direct database writes for reliability - each audit entry is
 * immediately persisted to prevent data loss on crashes or restarts.
 */

import { prisma } from './db';

export type AuditAction =
  | 'ORDER_SUBMITTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_FILLED'
  | 'ORDER_REJECTED'
  | 'INTENT_CREATED'
  | 'INTENT_APPROVED'
  | 'INTENT_REJECTED'
  | 'KILL_SWITCH_ACTIVATED'
  | 'KILL_SWITCH_DEACTIVATED'
  | 'POSITION_OPENED'
  | 'POSITION_CLOSED'
  | 'RISK_CHECK_PASSED'
  | 'RISK_CHECK_FAILED'
  | 'AUTH_SUCCESS'
  | 'AUTH_FAILURE'
  | 'CONFIG_CHANGED';

export interface AuditEntry {
  action: AuditAction;
  userId?: string;
  clientId?: string;
  symbol?: string;
  orderId?: string;
  intentId?: string;
  positionId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Log an audit event
 *
 * Writes directly to the database for reliability.
 * Uses fire-and-forget pattern - call sites don't need to await.
 * On failure, logs to console as backup (audit data is never silently lost).
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  // Console log for immediate visibility in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`[AUDIT] ${entry.action}`, JSON.stringify(entry, null, 2));
  }

  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        userId: entry.userId,
        clientId: entry.clientId,
        symbol: entry.symbol,
        orderId: entry.orderId,
        intentId: entry.intentId,
        positionId: entry.positionId,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
      },
    });
  } catch (error) {
    // Log to console if database fails - never silently lose audit data
    console.error('[AUDIT] Failed to write to database:', error);
    console.log(`[AUDIT-BACKUP] ${entry.action}`, JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Query audit logs
 */
export async function queryAuditLogs(options: {
  action?: AuditAction;
  userId?: string;
  symbol?: string;
  orderId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}): Promise<
  {
    id: string;
    action: string;
    userId: string | null;
    clientId: string | null;
    symbol: string | null;
    orderId: string | null;
    intentId: string | null;
    positionId: string | null;
    details: string | null;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
  }[]
> {
  const where: Record<string, unknown> = {};

  if (options.action) where.action = options.action;
  if (options.userId) where.userId = options.userId;
  if (options.symbol) where.symbol = options.symbol;
  if (options.orderId) where.orderId = options.orderId;

  if (options.startDate || options.endDate) {
    where.createdAt = {};
    if (options.startDate) (where.createdAt as Record<string, Date>).gte = options.startDate;
    if (options.endDate) (where.createdAt as Record<string, Date>).lte = options.endDate;
  }

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: options.limit || 100,
  });
}

/**
 * Get recent activity summary
 */
export async function getActivitySummary(
  hours: number = 24
): Promise<{
  totalEvents: number;
  orderEvents: number;
  riskEvents: number;
  authEvents: number;
  topSymbols: { symbol: string; count: number }[];
}> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const [events, symbolCounts] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: { action: true },
    }),
    prisma.auditLog.groupBy({
      by: ['symbol'],
      where: {
        createdAt: { gte: since },
        symbol: { not: null },
      },
      _count: { symbol: true },
      orderBy: { _count: { symbol: 'desc' } },
      take: 5,
    }),
  ]);

  const counts = {
    totalEvents: 0,
    orderEvents: 0,
    riskEvents: 0,
    authEvents: 0,
  };

  events.forEach((e) => {
    counts.totalEvents += e._count.action;
    if (e.action.startsWith('ORDER_') || e.action.startsWith('INTENT_')) {
      counts.orderEvents += e._count.action;
    }
    if (e.action.startsWith('RISK_')) {
      counts.riskEvents += e._count.action;
    }
    if (e.action.startsWith('AUTH_')) {
      counts.authEvents += e._count.action;
    }
  });

  return {
    ...counts,
    topSymbols: symbolCounts
      .filter((s) => s.symbol)
      .map((s) => ({
        symbol: s.symbol!,
        count: s._count.symbol,
      })),
  };
}

/**
 * Helper functions for common audit events
 */
export const audit = {
  orderSubmitted: (orderId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'ORDER_SUBMITTED', orderId, symbol, details }),

  orderCancelled: (orderId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'ORDER_CANCELLED', orderId, symbol, details }),

  orderFilled: (orderId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'ORDER_FILLED', orderId, symbol, details }),

  orderRejected: (orderId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'ORDER_REJECTED', orderId, symbol, details }),

  intentCreated: (intentId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'INTENT_CREATED', intentId, symbol, details }),

  intentApproved: (intentId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'INTENT_APPROVED', intentId, symbol, details }),

  intentRejected: (intentId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'INTENT_REJECTED', intentId, symbol, details }),

  killSwitchActivated: (details?: Record<string, unknown>) =>
    logAudit({ action: 'KILL_SWITCH_ACTIVATED', details }),

  killSwitchDeactivated: (details?: Record<string, unknown>) =>
    logAudit({ action: 'KILL_SWITCH_DEACTIVATED', details }),

  positionOpened: (positionId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'POSITION_OPENED', positionId, symbol, details }),

  positionClosed: (positionId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'POSITION_CLOSED', positionId, symbol, details }),

  riskCheckPassed: (intentId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'RISK_CHECK_PASSED', intentId, symbol, details }),

  riskCheckFailed: (intentId: string, symbol: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'RISK_CHECK_FAILED', intentId, symbol, details }),

  authSuccess: (clientId: string, ipAddress?: string, userAgent?: string) =>
    logAudit({ action: 'AUTH_SUCCESS', clientId, ipAddress, userAgent }),

  authFailure: (ipAddress?: string, userAgent?: string, details?: Record<string, unknown>) =>
    logAudit({ action: 'AUTH_FAILURE', ipAddress, userAgent, details }),

  configChanged: (details: Record<string, unknown>) =>
    logAudit({ action: 'CONFIG_CHANGED', details }),
};

export default audit;
