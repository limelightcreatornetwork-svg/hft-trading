/**
 * Shared Alpaca API Response Formatters
 *
 * Typed formatter functions that convert raw Alpaca API responses
 * (which use snake_case string fields) into camelCase objects with
 * proper numeric types.
 */

// =============================================================================
// POSITION FORMATTER
// =============================================================================

export interface FormattedPosition {
  symbol: string;
  assetId: string;
  exchange: string;
  assetClass: string;
  quantity: number;
  side: string;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
  unrealizedIntradayPL: number;
  unrealizedIntradayPLPercent: number;
  lastdayPrice: number;
  changeToday: number;
}

export function formatAlpacaPosition(pos: any): FormattedPosition {
  return {
    symbol: pos.symbol,
    assetId: pos.asset_id,
    exchange: pos.exchange,
    assetClass: pos.asset_class,
    quantity: parseFloat(pos.qty),
    side: pos.side,
    avgEntryPrice: parseFloat(pos.avg_entry_price),
    currentPrice: parseFloat(pos.current_price),
    marketValue: parseFloat(pos.market_value),
    costBasis: parseFloat(pos.cost_basis),
    unrealizedPL: parseFloat(pos.unrealized_pl),
    unrealizedPLPercent: parseFloat(pos.unrealized_plpc) * 100,
    unrealizedIntradayPL: parseFloat(pos.unrealized_intraday_pl),
    unrealizedIntradayPLPercent: parseFloat(pos.unrealized_intraday_plpc) * 100,
    lastdayPrice: parseFloat(pos.lastday_price),
    changeToday: parseFloat(pos.change_today) * 100,
  };
}

// =============================================================================
// ORDER FORMATTER
// =============================================================================

export interface FormattedOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  assetClass: string;
  quantity: number;
  filledQuantity: number;
  type: string;
  side: string;
  timeInForce: string;
  limitPrice: number | null;
  stopPrice: number | null;
  filledAvgPrice: number | null;
  status: string;
  extendedHours: boolean;
  createdAt: string;
  updatedAt: string;
  submittedAt: string;
  filledAt: string | null;
  canceledAt: string | null;
}

export function formatAlpacaOrder(order: any): FormattedOrder {
  return {
    id: order.id,
    clientOrderId: order.client_order_id,
    symbol: order.symbol,
    assetClass: order.asset_class,
    quantity: parseFloat(order.qty),
    filledQuantity: parseFloat(order.filled_qty),
    type: order.type,
    side: order.side,
    timeInForce: order.time_in_force,
    limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
    stopPrice: order.stop_price ? parseFloat(order.stop_price) : null,
    filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
    status: order.status,
    extendedHours: order.extended_hours,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    submittedAt: order.submitted_at,
    filledAt: order.filled_at,
    canceledAt: order.canceled_at,
  };
}

// =============================================================================
// ACCOUNT FORMATTER
// =============================================================================

export interface FormattedAccount {
  id: string;
  status: string;
  currency: string;
  buyingPower: number;
  cash: number;
  portfolioValue: number;
  equity: number;
  lastEquity: number;
  longMarketValue: number;
  shortMarketValue: number;
  initialMargin: number;
  maintenanceMargin: number;
  daytradeCount: number;
  patternDayTrader: boolean;
  dailyPL: number;
  dailyPLPercent: number;
}

export function formatAlpacaAccount(account: any): FormattedAccount {
  const equity = parseFloat(account.equity);
  const lastEquity = parseFloat(account.last_equity);
  const dailyPL = equity - lastEquity;
  const dailyPLPercent = lastEquity > 0 ? (dailyPL / lastEquity) * 100 : 0;

  return {
    id: account.id,
    status: account.status,
    currency: account.currency,
    buyingPower: parseFloat(account.buying_power),
    cash: parseFloat(account.cash),
    portfolioValue: parseFloat(account.portfolio_value),
    equity,
    lastEquity,
    longMarketValue: parseFloat(account.long_market_value),
    shortMarketValue: parseFloat(account.short_market_value),
    initialMargin: parseFloat(account.initial_margin),
    maintenanceMargin: parseFloat(account.maintenance_margin),
    daytradeCount: account.daytrade_count,
    patternDayTrader: account.pattern_day_trader,
    dailyPL,
    dailyPLPercent,
  };
}
