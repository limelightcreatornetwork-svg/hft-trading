/**
 * @fileoverview Enhanced Risk Engine with Layered Controls
 * 
 * Implements comprehensive risk management:
 * - Pre-trade checks (allowlist, size, exposure, liquidity)
 * - In-trade monitoring (loss limits, drawdown, anomalies)
 * - Automatic kill switch triggers
 * - Cancel/replace throttling
 * - Audit logging
 * 
 * @module core/risk-engine
 */

import { RiskDecision, SystemMode, KillSwitchMode, AuditEventType } from './types.js';
import { config } from '../libs/config.js';
import { logger } from '../libs/logger.js';

/**
 * Default risk parameters
 */
const DEFAULT_LIMITS = {
  // Position limits
  maxPositionNotional: 10000,    // Max per-symbol position
  maxGrossExposure: 50000,       // Total long + short notional
  maxNetExposure: 25000,         // Net long/short notional
  maxSectorExposure: 20000,      // Per-sector limit
  
  // Order limits
  maxOrderNotional: 5000,        // Single order max
  maxOrderQty: 1000,             // Single order max qty
  
  // Daily limits
  maxDailyLoss: 1000,            // Daily P&L floor
  maxDrawdown: 500,              // Max intraday drawdown from peak
  maxDailyTrades: 100,           // Trade count limit
  
  // Rate limits
  orderRateLimit: 10,            // Orders per minute
  cancelRateLimit: 20,           // Cancels per minute
  replaceRateLimit: 5,           // Replaces per minute
  
  // Quote checks
  maxSpreadBps: 30,              // Max spread to trade
  minQuoteSize: 100,             // Min quote size to trade
  maxSlippageBps: 20,            // Max acceptable slippage
  
  // Kill switch triggers
  maxConsecutiveRejects: 5,      // Rejects before halt
  maxRejectionRate: 0.5,         // Reject rate (50%) triggers concern
  max429sPerMinute: 3,           // Rate limit errors
  maxReconnectsPerHour: 10,      // WebSocket reconnects
  
  // Sizing
  riskPerTradePercent: 1,        // Risk 1% per trade
  maxLeverageRatio: 1.0,         // No leverage by default
};

/**
 * Enhanced Risk Engine
 */
export class RiskEngine {
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_LIMITS, ...limits };
    
    // State
    this.state = {
      mode: SystemMode.NORMAL,
      killSwitch: false,
      killSwitchMode: KillSwitchMode.BLOCK_NEW,
      killSwitchReason: null,
      killSwitchAt: null,
    };
    
    // Tracking
    this.dailyPnL = 0;
    this.intradayPeakPnL = 0;
    this.dailyTradeCount = 0;
    this.equity = 0; // Will be synced from account
    
    // Rate limiting
    this.orderTimestamps = [];
    this.cancelTimestamps = [];
    this.replaceTimestamps = [];
    
    // Anomaly detection
    this.rejectHistory = [];
    this.errorHistory = [];
    this.reconnectHistory = [];
    
    // Position tracking
    this.positions = new Map();
    this.positionNotionals = new Map();
    
    // Quote cache
    this.quotes = new Map();
    
    // Symbol states
    this.disabledSymbols = new Set();
    this.pausedStrategies = new Set();
    
    // Audit log
    this.auditLog = [];
    
    this.logger = logger;
  }

  /**
   * Evaluate trade intent against all risk checks
   * Returns approval/rejection with detailed reasoning
   */
  async evaluate(intent, quote = null) {
    const symbol = intent.symbol?.toUpperCase();
    const startTime = Date.now();
    const checks = [];
    
    // Store quote for later use
    if (quote) {
      this.quotes.set(symbol, { ...quote, timestamp: Date.now() });
    } else {
      quote = this.quotes.get(symbol);
    }
    
    // Run pre-trade checks in order of importance
    const checkFunctions = [
      () => this._checkKillSwitch(),
      () => this._checkSymbolEnabled(symbol),
      () => this._checkStrategyEnabled(intent.meta?.strategy),
      () => this._checkSymbolAllowlist(symbol),
      () => this._checkDailyLossLimit(),
      () => this._checkDrawdown(),
      () => this._checkOrderRate(),
      () => this._checkOrderNotional(intent, quote),
      () => this._checkPositionLimit(intent, quote),
      () => this._checkGrossExposure(intent, quote),
      () => this._checkNetExposure(intent, quote),
      () => this._checkSpreadLiquidity(intent, quote),
      () => this._checkDailyTradeCount(),
    ];
    
    for (const checkFn of checkFunctions) {
      const result = checkFn();
      checks.push(result);
      
      if (!result.passed) {
        const rejection = {
          status: RiskDecision.REJECTED,
          reason: result.reason,
          failedCheck: result.name,
          details: result.details,
          checks,
          evaluationMs: Date.now() - startTime,
        };
        
        this._logAudit(AuditEventType.RISK_CHECK_FAILED, {
          intent_id: intent.client_intent_id,
          symbol,
          failed_check: result.name,
          reason: result.reason,
        });
        
        // Track rejection for anomaly detection
        this._trackRejection(result);
        
        return rejection;
      }
    }
    
    // Calculate position sizing
    const sizing = this._calculatePositionSizing(intent, quote);
    
    // All checks passed
    const approval = {
      status: RiskDecision.APPROVED,
      checks,
      sizing,
      headroom: this._calculateHeadroom(intent, quote),
      evaluationMs: Date.now() - startTime,
    };
    
    this._logAudit(AuditEventType.RISK_CHECK_PASSED, {
      intent_id: intent.client_intent_id,
      symbol,
      checks_count: checks.length,
    });
    
    return approval;
  }

  // ============ Pre-Trade Checks ============

  _checkKillSwitch() {
    const passed = !this.state.killSwitch;
    return {
      name: 'kill_switch',
      passed,
      reason: passed ? null : `Kill switch active: ${this.state.killSwitchReason}`,
      details: passed ? null : {
        mode: this.state.killSwitchMode,
        activatedAt: this.state.killSwitchAt,
      },
    };
  }

  _checkSymbolEnabled(symbol) {
    const passed = !this.disabledSymbols.has(symbol);
    return {
      name: 'symbol_enabled',
      passed,
      reason: passed ? null : `Symbol ${symbol} is disabled`,
    };
  }

  _checkStrategyEnabled(strategy) {
    if (!strategy) return { name: 'strategy_enabled', passed: true };
    const passed = !this.pausedStrategies.has(strategy);
    return {
      name: 'strategy_enabled',
      passed,
      reason: passed ? null : `Strategy ${strategy} is paused`,
    };
  }

  _checkSymbolAllowlist(symbol) {
    const allowlist = config.risk?.symbolAllowlist || [];
    const passed = allowlist.length === 0 || allowlist.includes(symbol);
    return {
      name: 'symbol_allowlist',
      passed,
      reason: passed ? null : `Symbol ${symbol} not in allowlist`,
      details: { allowlist },
    };
  }

  _checkDailyLossLimit() {
    const passed = this.dailyPnL > -this.limits.maxDailyLoss;
    return {
      name: 'daily_loss_limit',
      passed,
      reason: passed ? null : `Daily loss limit ($${this.limits.maxDailyLoss}) exceeded`,
      details: { currentPnL: this.dailyPnL, limit: -this.limits.maxDailyLoss },
    };
  }

  _checkDrawdown() {
    const drawdown = this.intradayPeakPnL - this.dailyPnL;
    const passed = drawdown < this.limits.maxDrawdown;
    return {
      name: 'drawdown_limit',
      passed,
      reason: passed ? null : `Drawdown ($${drawdown.toFixed(2)}) exceeds limit ($${this.limits.maxDrawdown})`,
      details: { peak: this.intradayPeakPnL, current: this.dailyPnL, drawdown },
    };
  }

  _checkOrderRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.orderTimestamps = this.orderTimestamps.filter(t => t > oneMinuteAgo);
    
    const passed = this.orderTimestamps.length < this.limits.orderRateLimit;
    return {
      name: 'order_rate_limit',
      passed,
      reason: passed ? null : `Order rate limit (${this.limits.orderRateLimit}/min) exceeded`,
      details: { current: this.orderTimestamps.length, limit: this.limits.orderRateLimit },
    };
  }

  _checkOrderNotional(intent, quote) {
    const price = intent.limit_price || quote?.mid || quote?.last || 0;
    const notional = intent.qty * price;
    const passed = notional <= this.limits.maxOrderNotional;
    return {
      name: 'max_order_notional',
      passed,
      reason: passed ? null : `Order notional ($${notional.toFixed(2)}) exceeds limit ($${this.limits.maxOrderNotional})`,
      details: { notional, limit: this.limits.maxOrderNotional },
    };
  }

  _checkPositionLimit(intent, quote) {
    const symbol = intent.symbol?.toUpperCase();
    const price = intent.limit_price || quote?.mid || quote?.last || 0;
    const currentNotional = this.positionNotionals.get(symbol) || 0;
    const deltaNotional = intent.side === 'buy' ? intent.qty * price : -intent.qty * price;
    const newNotional = currentNotional + deltaNotional;
    
    // Check if this order reduces the position size
    const isReducingPosition = 
      (currentNotional > 0 && intent.side === 'sell') ||
      (currentNotional < 0 && intent.side === 'buy');
    
    // Always allow reducing positions, even if currently over limit
    // Only block if the new position would be larger than current AND exceed limit
    const passed = isReducingPosition 
      ? Math.abs(newNotional) <= Math.abs(currentNotional) || Math.abs(newNotional) <= this.limits.maxPositionNotional
      : Math.abs(newNotional) <= this.limits.maxPositionNotional;
    
    return {
      name: 'max_position',
      passed,
      reason: passed ? null : `Position would exceed limit`,
      details: {
        current: currentNotional,
        delta: deltaNotional,
        projected: newNotional,
        limit: this.limits.maxPositionNotional,
        isReducingPosition,
      },
    };
  }

  _checkGrossExposure(intent, quote) {
    const symbol = intent.symbol?.toUpperCase();
    const price = intent.limit_price || quote?.mid || quote?.last || 0;
    const orderNotional = intent.qty * price;
    
    let totalGross = 0;
    for (const notional of this.positionNotionals.values()) {
      totalGross += Math.abs(notional);
    }
    
    // Check if this order reduces an existing position
    const currentPositionNotional = this.positionNotionals.get(symbol) || 0;
    const isReducingPosition = 
      (currentPositionNotional > 0 && intent.side === 'sell') ||
      (currentPositionNotional < 0 && intent.side === 'buy');
    
    let projectedGross;
    if (isReducingPosition) {
      // Reducing position: gross exposure decreases or stays same
      const reducedNotional = Math.min(Math.abs(currentPositionNotional), orderNotional);
      projectedGross = totalGross - reducedNotional + Math.max(0, orderNotional - Math.abs(currentPositionNotional));
    } else {
      // Adding to position or opening new: gross exposure increases
      projectedGross = totalGross + orderNotional;
    }
    
    const passed = projectedGross <= this.limits.maxGrossExposure;
    
    return {
      name: 'gross_exposure',
      passed,
      reason: passed ? null : `Gross exposure would exceed limit`,
      details: {
        current: totalGross,
        projected: projectedGross,
        limit: this.limits.maxGrossExposure,
        isReducingPosition,
      },
    };
  }

  _checkNetExposure(intent, quote) {
    const price = intent.limit_price || quote?.mid || quote?.last || 0;
    const orderNotional = intent.side === 'buy' ? intent.qty * price : -intent.qty * price;
    
    let netExposure = 0;
    for (const notional of this.positionNotionals.values()) {
      netExposure += notional;
    }
    
    const projectedNet = netExposure + orderNotional;
    
    // Check if this order reduces net exposure
    const isReducingExposure = Math.abs(projectedNet) < Math.abs(netExposure);
    
    // Allow reducing exposure even if currently over limit
    const passed = isReducingExposure 
      ? true
      : Math.abs(projectedNet) <= this.limits.maxNetExposure;
    
    return {
      name: 'net_exposure',
      passed,
      reason: passed ? null : `Net exposure would exceed limit`,
      details: {
        current: netExposure,
        projected: projectedNet,
        limit: this.limits.maxNetExposure,
        isReducingExposure,
      },
    };
  }

  _checkSpreadLiquidity(intent, quote) {
    if (!quote || !quote.bid || !quote.ask) {
      return { name: 'spread_liquidity', passed: true, reason: null }; // Allow if no quote
    }
    
    const mid = (quote.bid + quote.ask) / 2;
    const spreadBps = ((quote.ask - quote.bid) / mid) * 10000;
    const quoteSize = Math.min(quote.bidSize || Infinity, quote.askSize || Infinity);
    
    const checks = [];
    
    // Spread check
    if (spreadBps > this.limits.maxSpreadBps) {
      checks.push(`spread ${spreadBps.toFixed(1)} bps > ${this.limits.maxSpreadBps} bps`);
    }
    
    // Quote size check
    if (quoteSize < this.limits.minQuoteSize) {
      checks.push(`quote size ${quoteSize} < ${this.limits.minQuoteSize}`);
    }
    
    const passed = checks.length === 0;
    return {
      name: 'spread_liquidity',
      passed,
      reason: passed ? null : `Liquidity check failed: ${checks.join(', ')}`,
      details: { spreadBps, quoteSize, checks },
    };
  }

  _checkDailyTradeCount() {
    const passed = this.dailyTradeCount < this.limits.maxDailyTrades;
    return {
      name: 'daily_trade_count',
      passed,
      reason: passed ? null : `Daily trade limit (${this.limits.maxDailyTrades}) reached`,
      details: { current: this.dailyTradeCount, limit: this.limits.maxDailyTrades },
    };
  }

  // ============ Position Sizing ============

  _calculatePositionSizing(intent, quote) {
    const price = intent.limit_price || quote?.mid || quote?.last || 100;
    const atr = quote?.atr || price * 0.02; // Default 2% ATR estimate
    
    // Risk-based sizing
    const riskDollars = this.equity * (this.limits.riskPerTradePercent / 100);
    const stopDistance = Math.max(atr, price * 0.01); // At least 1% stop
    const riskBasedQty = Math.floor(riskDollars / stopDistance);
    
    // Volatility scaling (reduce size in high vol)
    const volRatio = atr / (price * 0.02);
    const volAdjustment = 1 / Math.max(1, volRatio);
    
    // Liquidity scaling
    const quoteSize = Math.min(quote?.bidSize || 1000, quote?.askSize || 1000);
    const liquidityAdjustment = Math.min(1, quoteSize / (intent.qty * 2));
    
    const adjustedQty = Math.floor(riskBasedQty * volAdjustment * liquidityAdjustment);
    const recommendedQty = Math.min(adjustedQty, intent.qty);
    
    return {
      requestedQty: intent.qty,
      recommendedQty,
      riskBasedQty,
      adjustments: {
        volatility: volAdjustment,
        liquidity: liquidityAdjustment,
      },
      riskDollars,
      stopDistance,
    };
  }

  // ============ Headroom Calculation ============

  _calculateHeadroom(intent, quote) {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let totalGross = 0;
    let netExposure = 0;
    for (const notional of this.positionNotionals.values()) {
      totalGross += Math.abs(notional);
      netExposure += notional;
    }
    
    return {
      remainingDailyTrades: this.limits.maxDailyTrades - this.dailyTradeCount,
      remainingDailyLoss: this.limits.maxDailyLoss + this.dailyPnL,
      remainingDrawdown: this.limits.maxDrawdown - (this.intradayPeakPnL - this.dailyPnL),
      remainingGrossExposure: this.limits.maxGrossExposure - totalGross,
      remainingNetExposure: this.limits.maxNetExposure - Math.abs(netExposure),
      ordersThisMinute: this.orderTimestamps.filter(t => t > oneMinuteAgo).length,
      orderRateRemaining: this.limits.orderRateLimit - this.orderTimestamps.filter(t => t > oneMinuteAgo).length,
    };
  }

  // ============ Throttling ============

  /**
   * Check cancel rate limit
   */
  checkCancelRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.cancelTimestamps = this.cancelTimestamps.filter(t => t > oneMinuteAgo);
    return this.cancelTimestamps.length < this.limits.cancelRateLimit;
  }

  /**
   * Record a cancel
   */
  recordCancel() {
    this.cancelTimestamps.push(Date.now());
  }

  /**
   * Check replace/modify rate limit
   */
  checkReplaceRate() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    this.replaceTimestamps = this.replaceTimestamps.filter(t => t > oneMinuteAgo);
    return this.replaceTimestamps.length < this.limits.replaceRateLimit;
  }

  /**
   * Record a replace
   */
  recordReplace() {
    this.replaceTimestamps.push(Date.now());
  }

  /**
   * Record successful order submission
   */
  recordOrder() {
    this.orderTimestamps.push(Date.now());
    this.dailyTradeCount++;
  }

  // ============ Kill Switch ============

  /**
   * Enable kill switch
   */
  async activateKillSwitch(reason, mode = KillSwitchMode.BLOCK_NEW) {
    this.state.killSwitch = true;
    this.state.killSwitchMode = mode;
    this.state.killSwitchReason = reason;
    this.state.killSwitchAt = new Date();
    this.state.mode = SystemMode.HALTED;
    
    this.logger.error({ reason, mode }, 'KILL SWITCH ACTIVATED');
    
    this._logAudit(AuditEventType.KILL_SWITCH_TOGGLED, {
      enabled: true,
      reason,
      mode,
    });
    
    return { success: true, mode };
  }

  /**
   * Deactivate kill switch
   */
  async deactivateKillSwitch(confirmedBy = 'system') {
    const wasActive = this.state.killSwitch;
    
    this.state.killSwitch = false;
    this.state.killSwitchMode = null;
    this.state.killSwitchReason = null;
    this.state.killSwitchAt = null;
    this.state.mode = SystemMode.NORMAL;
    
    this.logger.warn({ confirmedBy }, 'Kill switch deactivated');
    
    if (wasActive) {
      this._logAudit(AuditEventType.KILL_SWITCH_TOGGLED, {
        enabled: false,
        confirmedBy,
      });
    }
    
    return { success: true };
  }

  // ============ Anomaly Detection ============

  /**
   * Track rejection for anomaly detection
   */
  _trackRejection(result) {
    const now = Date.now();
    this.rejectHistory.push({ timestamp: now, check: result.name, reason: result.reason });
    
    // Keep only last 5 minutes
    const fiveMinutesAgo = now - 300000;
    this.rejectHistory = this.rejectHistory.filter(r => r.timestamp > fiveMinutesAgo);
    
    // Check for consecutive rejects
    const recentRejects = this.rejectHistory.slice(-this.limits.maxConsecutiveRejects);
    if (recentRejects.length >= this.limits.maxConsecutiveRejects) {
      const timeDiff = now - recentRejects[0].timestamp;
      if (timeDiff < 60000) { // All within 1 minute
        this.activateKillSwitch(`${this.limits.maxConsecutiveRejects} consecutive rejections`, KillSwitchMode.BLOCK_NEW);
      }
    }
  }

  /**
   * Track error (429, connection issues)
   */
  trackError(errorType, details = {}) {
    const now = Date.now();
    this.errorHistory.push({ timestamp: now, type: errorType, details });
    
    // Clean old entries
    const oneMinuteAgo = now - 60000;
    this.errorHistory = this.errorHistory.filter(e => e.timestamp > oneMinuteAgo);
    
    // Check for 429 storm
    const recentErrors = this.errorHistory.filter(e => e.type === '429');
    if (recentErrors.length >= this.limits.max429sPerMinute) {
      this.activateKillSwitch('Rate limit (429) storm detected', KillSwitchMode.BLOCK_NEW);
    }
  }

  /**
   * Track WebSocket reconnection
   */
  trackReconnect() {
    const now = Date.now();
    this.reconnectHistory.push(now);
    
    // Clean old entries (1 hour)
    const oneHourAgo = now - 3600000;
    this.reconnectHistory = this.reconnectHistory.filter(t => t > oneHourAgo);
    
    // Check for excessive reconnects
    if (this.reconnectHistory.length >= this.limits.maxReconnectsPerHour) {
      this.activateKillSwitch('Excessive WebSocket reconnections', KillSwitchMode.BLOCK_NEW);
    }
  }

  // ============ Position Updates ============

  /**
   * Update position after fill
   */
  updatePosition(symbol, qty, side, price) {
    const upperSymbol = symbol.toUpperCase();
    const currentQty = this.positions.get(upperSymbol) || 0;
    const delta = side === 'buy' ? qty : -qty;
    const newQty = currentQty + delta;
    
    this.positions.set(upperSymbol, newQty);
    this.positionNotionals.set(upperSymbol, newQty * price);
  }

  /**
   * Sync positions from broker
   */
  syncPositions(brokerPositions) {
    this.positions.clear();
    this.positionNotionals.clear();
    
    for (const pos of brokerPositions) {
      const symbol = pos.symbol.toUpperCase();
      const qty = parseFloat(pos.qty);
      const marketValue = parseFloat(pos.market_value || 0);
      const avgPrice = qty !== 0 ? marketValue / qty : 0;
      
      this.positions.set(symbol, qty);
      this.positionNotionals.set(symbol, marketValue);
    }
  }

  /**
   * Update daily P&L
   */
  updateDailyPnL(pnl) {
    this.dailyPnL = pnl;
    
    // Track peak for drawdown
    if (pnl > this.intradayPeakPnL) {
      this.intradayPeakPnL = pnl;
    }
    
    // Auto-trigger kill switch on loss limit
    if (pnl <= -this.limits.maxDailyLoss) {
      this.activateKillSwitch('Daily loss limit breached', KillSwitchMode.BLOCK_NEW);
    }
  }

  /**
   * Update equity
   */
  updateEquity(equity) {
    this.equity = equity;
  }

  // ============ Symbol/Strategy Controls ============

  /**
   * Disable symbol
   */
  disableSymbol(symbol, reason = '') {
    const upper = symbol.toUpperCase();
    this.disabledSymbols.add(upper);
    this._logAudit(AuditEventType.SYMBOL_DISABLED, { symbol: upper, reason });
    this.logger.warn({ symbol: upper, reason }, 'Symbol disabled');
  }

  /**
   * Enable symbol
   */
  enableSymbol(symbol) {
    const upper = symbol.toUpperCase();
    this.disabledSymbols.delete(upper);
    this.logger.info({ symbol: upper }, 'Symbol enabled');
  }

  /**
   * Pause strategy
   */
  pauseStrategy(strategy) {
    this.pausedStrategies.add(strategy);
    this.logger.warn({ strategy }, 'Strategy paused');
  }

  /**
   * Resume strategy
   */
  resumeStrategy(strategy) {
    this.pausedStrategies.delete(strategy);
    this.logger.info({ strategy }, 'Strategy resumed');
  }

  // ============ State & Audit ============

  /**
   * Get current state
   */
  getState() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    let totalGross = 0;
    let netExposure = 0;
    for (const notional of this.positionNotionals.values()) {
      totalGross += Math.abs(notional);
      netExposure += notional;
    }
    
    return {
      mode: this.state.mode,
      killSwitch: this.state.killSwitch,
      killSwitchMode: this.state.killSwitchMode,
      killSwitchReason: this.state.killSwitchReason,
      
      dailyPnL: this.dailyPnL,
      intradayPeakPnL: this.intradayPeakPnL,
      drawdown: this.intradayPeakPnL - this.dailyPnL,
      dailyTradeCount: this.dailyTradeCount,
      equity: this.equity,
      
      grossExposure: totalGross,
      netExposure,
      positionCount: this.positions.size,
      
      ordersLastMinute: this.orderTimestamps.filter(t => t > oneMinuteAgo).length,
      cancelsLastMinute: this.cancelTimestamps.filter(t => t > oneMinuteAgo).length,
      replacesLastMinute: this.replaceTimestamps.filter(t => t > oneMinuteAgo).length,
      rejectsLast5Min: this.rejectHistory.length,
      
      disabledSymbols: Array.from(this.disabledSymbols),
      pausedStrategies: Array.from(this.pausedStrategies),
      
      limits: this.limits,
    };
  }

  /**
   * Log audit event
   */
  _logAudit(type, data) {
    const event = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date(),
      data,
    };
    
    this.auditLog.push(event);
    
    // Keep only last 10000 events
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-5000);
    }
  }

  /**
   * Get audit log
   */
  getAuditLog(limit = 100) {
    return this.auditLog.slice(-limit);
  }

  /**
   * Reset daily state (call at market open)
   */
  resetDaily() {
    this.dailyPnL = 0;
    this.intradayPeakPnL = 0;
    this.dailyTradeCount = 0;
    this.orderTimestamps = [];
    this.cancelTimestamps = [];
    this.replaceTimestamps = [];
    this.rejectHistory = [];
    
    this.logger.info('Daily risk state reset');
  }

  /**
   * Reset all state (for testing)
   */
  reset() {
    this.resetDaily();
    this.positions.clear();
    this.positionNotionals.clear();
    this.quotes.clear();
    this.disabledSymbols.clear();
    this.pausedStrategies.clear();
    this.auditLog = [];
    this.errorHistory = [];
    this.reconnectHistory = [];
    this.state = {
      mode: SystemMode.NORMAL,
      killSwitch: false,
      killSwitchMode: null,
      killSwitchReason: null,
      killSwitchAt: null,
    };
  }
}

// Export singleton
export const riskEngine = new RiskEngine();
