/**
 * @fileoverview Risk Engine - Pre-trade and intraday risk checks
 *
 * Enforces hard limits on trading activity to prevent runaway losses
 * or excessive position sizes. This is the safety layer between
 * the agent and the broker.
 *
 * @module libs/risk
 */

import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Risk engine state
 */
let state = {
  mode: 'NORMAL', // NORMAL | DEGRADED | HALTED
  killSwitch: false,
  killSwitchMode: 'block_new',
  dailyPnL: 0,
  dailyTradeCount: 0,
  lastMinuteOrders: [],
  positions: new Map(),
  lastUpdated: new Date(),
};

/**
 * Pre-trade risk checks
 */
const checks = {
  /**
   * Check if symbol is in allowlist
   */
  symbolAllowlist: (intent) => {
    const allowed = config.risk.symbolAllowlist.includes(intent.symbol.toUpperCase());
    return {
      name: 'symbol_allowlist',
      passed: allowed,
      reason: allowed ? null : `Symbol ${intent.symbol} not in allowlist`,
    };
  },

  /**
   * Check order notional value
   */
  maxOrderNotional: (intent, quote) => {
    const notional = intent.qty * (intent.limit_price || quote?.price || 0);
    const passed = notional <= config.risk.maxOrderNotional;
    return {
      name: 'max_order_notional',
      passed,
      reason: passed ? null : `Order notional $${notional} exceeds limit $${config.risk.maxOrderNotional}`,
    };
  },

  /**
   * Check position size limit
   */
  maxPositionSize: (intent) => {
    const currentPosition = state.positions.get(intent.symbol) || 0;
    const newPosition = intent.side === 'buy'
      ? currentPosition + intent.qty
      : currentPosition - intent.qty;
    
    // For now, use qty as proxy for notional (will improve with live quotes)
    const passed = Math.abs(newPosition) * 100 <= config.risk.maxPositionSize; // Assume $100/share avg
    return {
      name: 'max_position_size',
      passed,
      reason: passed ? null : `Position would exceed limit`,
    };
  },

  /**
   * Check daily trade count
   */
  maxDailyTrades: () => {
    const passed = state.dailyTradeCount < config.risk.maxDailyTrades;
    return {
      name: 'max_daily_trades',
      passed,
      reason: passed ? null : `Daily trade limit (${config.risk.maxDailyTrades}) reached`,
    };
  },

  /**
   * Check daily loss limit
   */
  dailyLossLimit: () => {
    const passed = state.dailyPnL > -config.risk.maxDailyLoss;
    return {
      name: 'daily_loss_limit',
      passed,
      reason: passed ? null : `Daily loss limit ($${config.risk.maxDailyLoss}) exceeded`,
    };
  },

  /**
   * Check order rate limit (orders per minute)
   */
  orderRateLimit: () => {
    const oneMinuteAgo = Date.now() - 60000;
    state.lastMinuteOrders = state.lastMinuteOrders.filter(t => t > oneMinuteAgo);
    const passed = state.lastMinuteOrders.length < config.risk.orderRateLimit;
    return {
      name: 'order_rate_limit',
      passed,
      reason: passed ? null : `Order rate limit (${config.risk.orderRateLimit}/min) exceeded`,
    };
  },

  /**
   * Check kill switch
   */
  killSwitch: () => {
    const passed = !state.killSwitch;
    return {
      name: 'kill_switch',
      passed,
      reason: passed ? null : 'Kill switch is enabled',
    };
  },
};

/**
 * Risk Engine
 */
export const riskEngine = {
  /**
   * Evaluate a trade intent against all risk checks
   *
   * @param {Object} intent - Trade intent
   * @param {Object} quote - Current market quote (optional)
   * @returns {Object} Risk decision
   */
  async evaluate(intent, quote = null) {
    const results = [];

    // Run all checks
    for (const [name, checkFn] of Object.entries(checks)) {
      const result = checkFn(intent, quote);
      results.push(result);

      if (!result.passed) {
        logger.warn({ intent, check: name, reason: result.reason }, 'Risk check failed');
        return {
          accepted: false,
          reason: result.reason,
          failed_check: name,
          details: result.reason,
          checks: results,
        };
      }
    }

    // All checks passed - record order timestamp for rate limiting
    state.lastMinuteOrders.push(Date.now());

    // Calculate headroom
    const headroom = {
      remaining_daily_trades: config.risk.maxDailyTrades - state.dailyTradeCount,
      remaining_daily_loss: config.risk.maxDailyLoss + state.dailyPnL,
      orders_this_minute: state.lastMinuteOrders.length,
    };

    return {
      accepted: true,
      checks: results,
      headroom,
    };
  },

  /**
   * Set kill switch state
   */
  async setKillSwitch(enabled, mode = 'block_new') {
    state.killSwitch = enabled;
    state.killSwitchMode = mode;
    state.mode = enabled ? 'HALTED' : 'NORMAL';

    logger.warn({ enabled, mode }, 'Kill switch state changed');

    return { killSwitch: enabled, mode };
  },

  /**
   * Get current risk state
   */
  async getState() {
    return {
      mode: state.mode,
      killSwitch: state.killSwitch,
      killSwitchMode: state.killSwitchMode,
      dailyPnL: state.dailyPnL,
      dailyTradeCount: state.dailyTradeCount,
      ordersLastMinute: state.lastMinuteOrders.length,
      limits: {
        maxPositionSize: config.risk.maxPositionSize,
        maxDailyLoss: config.risk.maxDailyLoss,
        maxOrderNotional: config.risk.maxOrderNotional,
        maxDailyTrades: config.risk.maxDailyTrades,
        orderRateLimit: config.risk.orderRateLimit,
        symbolAllowlist: config.risk.symbolAllowlist,
      },
      lastUpdated: state.lastUpdated,
    };
  },

  /**
   * Update position (called after fills)
   */
  updatePosition(symbol, qty, side) {
    const current = state.positions.get(symbol) || 0;
    const delta = side === 'buy' ? qty : -qty;
    state.positions.set(symbol, current + delta);
    state.dailyTradeCount++;
    state.lastUpdated = new Date();
  },

  /**
   * Update daily PnL (called periodically or after trades)
   */
  updateDailyPnL(pnl) {
    state.dailyPnL = pnl;
    state.lastUpdated = new Date();

    // Check if we've hit the loss limit
    if (pnl <= -config.risk.maxDailyLoss) {
      logger.error({ pnl, limit: config.risk.maxDailyLoss }, 'Daily loss limit reached - enabling kill switch');
      this.setKillSwitch(true, 'block_new');
    }
  },

  /**
   * Reset daily state (call at market open)
   */
  resetDaily() {
    state.dailyPnL = 0;
    state.dailyTradeCount = 0;
    state.lastMinuteOrders = [];
    state.lastUpdated = new Date();
    logger.info('Daily risk state reset');
  },
};
