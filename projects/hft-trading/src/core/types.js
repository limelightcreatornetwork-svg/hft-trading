/**
 * @fileoverview Core type definitions and enums
 * @module core/types
 */

/**
 * Order states following standard trading lifecycle
 */
export const OrderState = {
  NEW: 'new',                    // Created locally, not yet sent
  SUBMITTED: 'submitted',        // Sent to broker, awaiting acknowledgment
  ACCEPTED: 'accepted',          // Broker acknowledged, in book
  PARTIAL: 'partial_fill',       // Partially filled
  FILLED: 'filled',              // Completely filled
  CANCELED: 'canceled',          // Canceled (by user or system)
  REJECTED: 'rejected',          // Rejected by broker
  EXPIRED: 'expired',            // Time-in-force expired
  PENDING_CANCEL: 'pending_cancel', // Cancel requested
  PENDING_REPLACE: 'pending_replace', // Replace/modify requested
  REPLACED: 'replaced',          // Order was replaced
};

/**
 * Terminal states (no further transitions)
 */
export const TerminalStates = new Set([
  OrderState.FILLED,
  OrderState.CANCELED,
  OrderState.REJECTED,
  OrderState.EXPIRED,
  OrderState.REPLACED,
]);

/**
 * Valid state transitions
 */
export const ValidTransitions = {
  [OrderState.NEW]: [OrderState.SUBMITTED, OrderState.REJECTED],
  [OrderState.SUBMITTED]: [OrderState.ACCEPTED, OrderState.REJECTED, OrderState.CANCELED],
  [OrderState.ACCEPTED]: [
    OrderState.PARTIAL,
    OrderState.FILLED,
    OrderState.CANCELED,
    OrderState.PENDING_CANCEL,
    OrderState.PENDING_REPLACE,
    OrderState.EXPIRED,
  ],
  [OrderState.PARTIAL]: [
    OrderState.FILLED,
    OrderState.CANCELED,
    OrderState.PENDING_CANCEL,
    OrderState.EXPIRED,
  ],
  [OrderState.PENDING_CANCEL]: [OrderState.CANCELED, OrderState.FILLED, OrderState.REJECTED],
  [OrderState.PENDING_REPLACE]: [OrderState.REPLACED, OrderState.ACCEPTED, OrderState.REJECTED, OrderState.CANCELED],
};

/**
 * Market regime types
 */
export const Regime = {
  CHOP: 'chop',                  // Sideways, mean-reverting
  TREND: 'trend',                // Directional momentum
  VOL_EXPANSION: 'vol_expansion', // Volatility breakout
  UNTRADEABLE: 'untradeable',    // Halts, stale data, extreme conditions
};

/**
 * Risk decision status
 */
export const RiskDecision = {
  APPROVED: 'approved',
  REJECTED: 'rejected',
  THROTTLED: 'throttled',
};

/**
 * System operational modes
 */
export const SystemMode = {
  NORMAL: 'normal',              // All systems operational
  DEGRADED: 'degraded',          // Some issues, reduced capacity
  HALTED: 'halted',              // Kill switch active
  MAINTENANCE: 'maintenance',     // Manual intervention required
};

/**
 * Kill switch modes
 */
export const KillSwitchMode = {
  BLOCK_NEW: 'block_new',        // Block new orders only
  CANCEL_ALL: 'cancel_all',      // Cancel all open orders
  FLATTEN: 'flatten',            // Cancel and close all positions
};

/**
 * Intent status
 */
export const IntentStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
  FAILED: 'failed',
};

/**
 * Audit event types
 */
export const AuditEventType = {
  INTENT_CREATED: 'intent_created',
  INTENT_ACCEPTED: 'intent_accepted',
  INTENT_REJECTED: 'intent_rejected',
  ORDER_CREATED: 'order_created',
  ORDER_SUBMITTED: 'order_submitted',
  ORDER_UPDATED: 'order_updated',
  ORDER_FILLED: 'order_filled',
  ORDER_CANCELED: 'order_canceled',
  RISK_CHECK_PASSED: 'risk_check_passed',
  RISK_CHECK_FAILED: 'risk_check_failed',
  KILL_SWITCH_TOGGLED: 'kill_switch_toggled',
  CONFIG_CHANGED: 'config_changed',
  REGIME_CHANGED: 'regime_changed',
  SYMBOL_DISABLED: 'symbol_disabled',
  RECONCILIATION_STARTED: 'reconciliation_started',
  RECONCILIATION_COMPLETED: 'reconciliation_completed',
  RECONCILIATION_DISCREPANCY: 'reconciliation_discrepancy',
};

/**
 * Order side
 */
export const Side = {
  BUY: 'buy',
  SELL: 'sell',
};

/**
 * Order type
 */
export const OrderType = {
  MARKET: 'market',
  LIMIT: 'limit',
  STOP: 'stop',
  STOP_LIMIT: 'stop_limit',
  TRAILING_STOP: 'trailing_stop',
};

/**
 * Time in force
 */
export const TimeInForce = {
  DAY: 'day',
  GTC: 'gtc',
  IOC: 'ioc',
  FOK: 'fok',
  OPG: 'opg',
  CLS: 'cls',
};

/**
 * Create a unique correlation ID for tracing order lifecycle
 * @returns {string} Unique correlation ID in format corr_<timestamp>_<random>
 */
export function createCorrelationId() {
  return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a unique event ID for audit logging
 * @returns {string} Unique event ID in format evt_<timestamp>_<random>
 */
export function createEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// =============================================================================
// OPTIONS TRADING TYPES
// =============================================================================

/**
 * Options contract type
 */
export const OptionType = {
  CALL: 'call',
  PUT: 'put',
};

/**
 * Options contract style
 */
export const OptionStyle = {
  AMERICAN: 'american',
  EUROPEAN: 'european',
};

/**
 * Options contract status
 */
export const OptionContractStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
};

/**
 * Options trading levels
 */
export const OptionsLevel = {
  DISABLED: 0,          // Options trading is disabled
  COVERED: 1,           // Covered calls and cash-secured puts
  BASIC: 2,             // Level 1 + buying calls and puts
  SPREADS: 3,           // Level 1,2 + buying spreads
};

/**
 * @typedef {Object} OptionContract
 * @property {string} id - Unique contract ID
 * @property {string} symbol - OCC symbol (e.g., AAPL240119C00100000)
 * @property {string} name - Human-readable name (e.g., AAPL Jan 19 2024 100 Call)
 * @property {string} status - Contract status (active/inactive)
 * @property {boolean} tradable - Whether contract is tradable
 * @property {string} expiration_date - Expiration date (YYYY-MM-DD)
 * @property {string} root_symbol - Root symbol (e.g., AAPL)
 * @property {string} underlying_symbol - Underlying asset symbol
 * @property {string} underlying_asset_id - Underlying asset UUID
 * @property {string} type - call or put
 * @property {string} style - american or european
 * @property {string} strike_price - Strike price as string
 * @property {string} size - Contract multiplier (typically "100")
 * @property {string} open_interest - Open interest
 * @property {string} open_interest_date - Date of open interest data
 * @property {string} close_price - Last close price
 * @property {string} close_price_date - Date of close price
 */

/**
 * @typedef {Object} OptionGreeks
 * @property {number} delta - Rate of change of option price with respect to underlying
 * @property {number} gamma - Rate of change of delta
 * @property {number} theta - Time decay
 * @property {number} vega - Sensitivity to volatility
 * @property {number} rho - Sensitivity to interest rate
 * @property {number} implied_volatility - Implied volatility
 */

/**
 * @typedef {Object} OptionQuote
 * @property {string} symbol - OCC symbol
 * @property {number} bid - Best bid price
 * @property {number} bid_size - Bid size
 * @property {number} ask - Best ask price
 * @property {number} ask_size - Ask size
 * @property {number} last - Last trade price
 * @property {number} volume - Trading volume
 * @property {string} timestamp - Quote timestamp
 * @property {OptionGreeks} greeks - Option greeks
 */

/**
 * @typedef {Object} OptionPosition
 * @property {string} asset_id - Contract ID
 * @property {string} symbol - OCC symbol
 * @property {string} exchange - Exchange
 * @property {string} asset_class - "us_option"
 * @property {number} qty - Position quantity (contracts)
 * @property {number} qty_available - Available to trade
 * @property {number} avg_entry_price - Average entry price
 * @property {number} market_value - Current market value
 * @property {number} cost_basis - Cost basis
 * @property {number} unrealized_pl - Unrealized P&L
 * @property {number} unrealized_plpc - Unrealized P&L percentage
 * @property {string} side - "long" or "short"
 */

/**
 * @typedef {Object} OptionOrderRequest
 * @property {string} symbol - OCC symbol for the option contract
 * @property {number} qty - Number of contracts
 * @property {string} side - "buy" or "sell"
 * @property {string} type - "market", "limit", "stop", "stop_limit"
 * @property {string} time_in_force - Must be "day" for options
 * @property {number} [limit_price] - Limit price (required for limit orders)
 * @property {number} [stop_price] - Stop price (required for stop orders)
 * @property {string} [client_order_id] - Client-specified order ID
 */

/**
 * Validate option symbol format (OCC format)
 * Format: SYMBOL + YYMMDD + C/P + Strike (8 digits with implied decimal)
 * Example: AAPL240119C00100000 = AAPL Jan 19, 2024 $100 Call
 */
export function isValidOptionSymbol(symbol) {
  // OCC symbol regex: 1-6 char root + 6 digit date + C/P + 8 digit strike
  const occRegex = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
  return occRegex.test(symbol);
}

/**
 * Parse an OCC option symbol
 */
export function parseOptionSymbol(symbol) {
  if (!isValidOptionSymbol(symbol)) {
    return null;
  }

  // Find where the date starts (first digit after letters)
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const [, underlying, dateStr, typeChar, strikeStr] = match;
  
  const year = 2000 + parseInt(dateStr.slice(0, 2), 10);
  const month = parseInt(dateStr.slice(2, 4), 10);
  const day = parseInt(dateStr.slice(4, 6), 10);
  
  // Strike has 5 integer digits + 3 decimal digits
  const strike = parseInt(strikeStr, 10) / 1000;

  return {
    underlying,
    expiration: new Date(year, month - 1, day),
    expirationStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    type: typeChar === 'C' ? OptionType.CALL : OptionType.PUT,
    strike,
    symbol,
  };
}

/**
 * Build an OCC option symbol
 */
export function buildOptionSymbol(underlying, expiration, type, strike) {
  const date = new Date(expiration);
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const typeChar = type === OptionType.CALL ? 'C' : 'P';
  const strikeStr = String(Math.round(strike * 1000)).padStart(8, '0');
  
  return `${underlying.toUpperCase()}${yy}${mm}${dd}${typeChar}${strikeStr}`;
}
