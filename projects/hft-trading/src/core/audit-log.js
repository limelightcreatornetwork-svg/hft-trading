/**
 * @fileoverview Audit Log and Config Versioning System
 * 
 * Provides comprehensive audit trail for:
 * - All trading actions and decisions
 * - Configuration changes with versioning
 * - Risk events and kill switch activations
 * - User actions for compliance
 * 
 * @module core/audit-log
 */

import { v4 as uuidv4 } from 'uuid';
import { AuditEventType } from './types.js';
import { logger } from '../libs/logger.js';

/**
 * Audit Log System
 */
export class AuditLog {
  constructor(options = {}) {
    // In-memory log (replace with database in production)
    this.events = [];
    
    // Config version history
    this.configVersions = [];
    this.currentConfigVersion = 0;
    
    // Options
    this.maxEventsInMemory = options.maxEventsInMemory || 50000;
    this.persistFn = options.persistFn || null; // Optional async persist function
    
    // Statistics
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
    };
    
    this.logger = options.logger || logger;
  }

  /**
   * Log an audit event
   */
  async log(type, data, metadata = {}) {
    const event = {
      id: uuidv4(),
      type,
      timestamp: new Date().toISOString(),
      epochMs: Date.now(),
      data,
      metadata: {
        session: metadata.session || 'default',
        user: metadata.user || 'system',
        source: metadata.source || 'api',
        correlationId: metadata.correlationId || null,
        ...metadata,
      },
    };
    
    // Add to in-memory log
    this.events.push(event);
    this.stats.totalEvents++;
    this.stats.eventsByType[type] = (this.stats.eventsByType[type] || 0) + 1;
    
    // Trim if exceeds max
    if (this.events.length > this.maxEventsInMemory) {
      this.events = this.events.slice(-Math.floor(this.maxEventsInMemory / 2));
    }
    
    // Persist if function provided
    if (this.persistFn) {
      try {
        await this.persistFn(event);
      } catch (error) {
        this.logger.error({ error: error.message, eventId: event.id }, 'Failed to persist audit event');
      }
    }
    
    // Log important events
    if (this._isImportantEvent(type)) {
      this.logger.info({ type, eventId: event.id, data }, 'Audit event logged');
    }
    
    return event;
  }

  /**
   * Check if event type is important (should be logged)
   */
  _isImportantEvent(type) {
    const importantTypes = [
      AuditEventType.KILL_SWITCH_TOGGLED,
      AuditEventType.CONFIG_CHANGED,
      AuditEventType.SYMBOL_DISABLED,
      AuditEventType.RECONCILIATION_DISCREPANCY,
    ];
    return importantTypes.includes(type);
  }

  /**
   * Log intent creation
   */
  async logIntentCreated(intent, metadata = {}) {
    return this.log(AuditEventType.INTENT_CREATED, {
      intentId: intent.id,
      clientIntentId: intent.client_intent_id,
      symbol: intent.symbol,
      side: intent.side,
      qty: intent.qty,
      type: intent.order_type,
      price: intent.limit_price,
      strategy: intent.strategy,
    }, metadata);
  }

  /**
   * Log intent acceptance/rejection
   */
  async logIntentDecision(intent, decision, metadata = {}) {
    const type = decision.accepted
      ? AuditEventType.INTENT_ACCEPTED
      : AuditEventType.INTENT_REJECTED;
    
    return this.log(type, {
      intentId: intent.id,
      clientIntentId: intent.client_intent_id,
      decision: decision.accepted ? 'accepted' : 'rejected',
      reason: decision.reason,
      failedCheck: decision.failedCheck,
      orderId: decision.orderId,
    }, metadata);
  }

  /**
   * Log order state change
   */
  async logOrderUpdate(order, previousState, newState, metadata = {}) {
    return this.log(AuditEventType.ORDER_UPDATED, {
      orderId: order.id,
      clientOrderId: order.client_order_id,
      brokerOrderId: order.broker_order_id,
      symbol: order.symbol,
      side: order.side,
      qty: order.qty,
      filledQty: order.filled_qty,
      previousState,
      newState,
      avgFillPrice: order.avg_fill_price,
    }, { correlationId: order.correlation_id, ...metadata });
  }

  /**
   * Log order fill
   */
  async logFill(order, fill, metadata = {}) {
    return this.log(AuditEventType.ORDER_FILLED, {
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      fillQty: fill.qty,
      fillPrice: fill.price,
      totalFilled: order.filled_qty,
      remainingQty: order.remaining_qty,
      avgFillPrice: order.avg_fill_price,
      commission: fill.commission,
    }, { correlationId: order.correlation_id, ...metadata });
  }

  /**
   * Log risk check result
   */
  async logRiskCheck(intent, decision, metadata = {}) {
    const type = decision.status === 'approved'
      ? AuditEventType.RISK_CHECK_PASSED
      : AuditEventType.RISK_CHECK_FAILED;
    
    return this.log(type, {
      intentId: intent.client_intent_id,
      symbol: intent.symbol,
      decision: decision.status,
      failedCheck: decision.failedCheck,
      reason: decision.reason,
      checksRun: decision.checks?.length || 0,
      evaluationMs: decision.evaluationMs,
    }, metadata);
  }

  /**
   * Log kill switch activation/deactivation
   */
  async logKillSwitch(enabled, reason, mode, metadata = {}) {
    return this.log(AuditEventType.KILL_SWITCH_TOGGLED, {
      enabled,
      reason,
      mode,
      timestamp: new Date().toISOString(),
    }, { source: 'risk_engine', ...metadata });
  }

  /**
   * Log regime change
   */
  async logRegimeChange(symbol, previousRegime, newRegime, metadata = {}) {
    return this.log(AuditEventType.REGIME_CHANGED, {
      symbol,
      previousRegime,
      newRegime,
      timestamp: new Date().toISOString(),
    }, metadata);
  }

  /**
   * Log symbol disable/enable
   */
  async logSymbolDisabled(symbol, disabled, reason, metadata = {}) {
    return this.log(AuditEventType.SYMBOL_DISABLED, {
      symbol,
      disabled,
      reason,
      timestamp: new Date().toISOString(),
    }, metadata);
  }

  /**
   * Log reconciliation event
   */
  async logReconciliation(type, data, metadata = {}) {
    const eventType = type === 'discrepancy'
      ? AuditEventType.RECONCILIATION_DISCREPANCY
      : type === 'completed'
        ? AuditEventType.RECONCILIATION_COMPLETED
        : AuditEventType.RECONCILIATION_STARTED;
    
    return this.log(eventType, data, metadata);
  }

  // ============ Config Versioning ============

  /**
   * Save a new config version
   */
  async saveConfigVersion(config, metadata = {}) {
    const version = {
      version: ++this.currentConfigVersion,
      timestamp: new Date().toISOString(),
      config: JSON.parse(JSON.stringify(config)), // Deep clone
      metadata: {
        user: metadata.user || 'system',
        reason: metadata.reason || 'Configuration update',
        ...metadata,
      },
      hash: this._hashConfig(config),
    };
    
    this.configVersions.push(version);
    
    // Log the config change
    await this.log(AuditEventType.CONFIG_CHANGED, {
      version: version.version,
      previousVersion: version.version - 1,
      changedFields: metadata.changedFields || [],
      reason: metadata.reason,
    }, metadata);
    
    this.logger.info({
      version: version.version,
      reason: metadata.reason,
    }, 'Config version saved');
    
    return version;
  }

  /**
   * Get config by version
   */
  getConfigVersion(version) {
    return this.configVersions.find(v => v.version === version) || null;
  }

  /**
   * Get current config version
   */
  getCurrentConfigVersion() {
    return this.configVersions[this.configVersions.length - 1] || null;
  }

  /**
   * Get config version history
   */
  getConfigHistory(limit = 10) {
    return this.configVersions.slice(-limit);
  }

  /**
   * Diff two config versions
   */
  diffConfigVersions(version1, version2) {
    const config1 = this.getConfigVersion(version1);
    const config2 = this.getConfigVersion(version2);
    
    if (!config1 || !config2) {
      return null;
    }
    
    const changes = [];
    this._diffObjects(config1.config, config2.config, '', changes);
    
    return {
      version1,
      version2,
      changes,
      timestamp1: config1.timestamp,
      timestamp2: config2.timestamp,
    };
  }

  /**
   * Recursively diff objects
   */
  _diffObjects(obj1, obj2, path, changes) {
    const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
    
    for (const key of keys) {
      const fullPath = path ? `${path}.${key}` : key;
      const val1 = obj1?.[key];
      const val2 = obj2?.[key];
      
      if (val1 === undefined && val2 !== undefined) {
        changes.push({ path: fullPath, type: 'added', newValue: val2 });
      } else if (val1 !== undefined && val2 === undefined) {
        changes.push({ path: fullPath, type: 'removed', oldValue: val1 });
      } else if (typeof val1 === 'object' && typeof val2 === 'object' && val1 !== null && val2 !== null) {
        if (Array.isArray(val1) && Array.isArray(val2)) {
          if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            changes.push({ path: fullPath, type: 'changed', oldValue: val1, newValue: val2 });
          }
        } else {
          this._diffObjects(val1, val2, fullPath, changes);
        }
      } else if (val1 !== val2) {
        changes.push({ path: fullPath, type: 'changed', oldValue: val1, newValue: val2 });
      }
    }
  }

  /**
   * Simple hash for config comparison
   */
  _hashConfig(config) {
    const str = JSON.stringify(config);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  // ============ Query Methods ============

  /**
   * Query events by type
   */
  queryByType(type, limit = 100) {
    return this.events
      .filter(e => e.type === type)
      .slice(-limit);
  }

  /**
   * Query events by time range
   */
  queryByTimeRange(startMs, endMs, limit = 1000) {
    return this.events
      .filter(e => e.epochMs >= startMs && e.epochMs <= endMs)
      .slice(-limit);
  }

  /**
   * Query events by correlation ID
   */
  queryByCorrelationId(correlationId) {
    return this.events.filter(e => e.metadata.correlationId === correlationId);
  }

  /**
   * Query events by symbol
   */
  queryBySymbol(symbol, limit = 100) {
    const upper = symbol.toUpperCase();
    return this.events
      .filter(e => e.data?.symbol?.toUpperCase() === upper)
      .slice(-limit);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100) {
    return this.events.slice(-limit);
  }

  /**
   * Get events since timestamp
   */
  getEventsSince(epochMs) {
    return this.events.filter(e => e.epochMs > epochMs);
  }

  /**
   * Get statistics
   */
  getStats() {
    const last24h = Date.now() - 86400000;
    const last1h = Date.now() - 3600000;
    
    return {
      totalEvents: this.stats.totalEvents,
      eventsInMemory: this.events.length,
      eventsByType: { ...this.stats.eventsByType },
      eventsLast24h: this.events.filter(e => e.epochMs > last24h).length,
      eventsLast1h: this.events.filter(e => e.epochMs > last1h).length,
      configVersions: this.configVersions.length,
      currentConfigVersion: this.currentConfigVersion,
    };
  }

  /**
   * Export events for compliance/backup
   */
  export(startMs = 0, endMs = Date.now()) {
    const events = this.queryByTimeRange(startMs, endMs, Infinity);
    return {
      exportedAt: new Date().toISOString(),
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      eventCount: events.length,
      events,
      configVersions: this.configVersions,
    };
  }

  /**
   * Clear old events (keep last N)
   */
  prune(keepLast = 10000) {
    const removed = this.events.length - keepLast;
    if (removed > 0) {
      this.events = this.events.slice(-keepLast);
      this.logger.info({ removed, remaining: this.events.length }, 'Pruned audit log');
    }
    return { removed, remaining: this.events.length };
  }

  /**
   * Reset (for testing)
   */
  reset() {
    this.events = [];
    this.configVersions = [];
    this.currentConfigVersion = 0;
    this.stats = {
      totalEvents: 0,
      eventsByType: {},
    };
  }
}

// Export singleton
export const auditLog = new AuditLog();
