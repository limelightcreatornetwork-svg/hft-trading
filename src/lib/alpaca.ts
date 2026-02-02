import Alpaca from '@alpacahq/alpaca-trade-api';
import { alpacaConfig } from './env';

// Initialize Alpaca client with validated environment variables
const alpaca = new Alpaca({
  keyId: alpacaConfig.apiKey,
  secretKey: alpacaConfig.apiSecret,
  paper: alpacaConfig.isPaper,
  baseUrl: alpacaConfig.baseUrl,
});

export interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  qty: string;
  avg_entry_price: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  qty: string;
  filled_qty: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  filled_avg_price: string | null;
  status: string;
  extended_hours: boolean;
  legs: null;
  trail_price: null;
  trail_percent: null;
}

export interface OrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day' | 'gtc' | 'opg' | 'cls' | 'ioc' | 'fok';
  limit_price?: number;
  stop_price?: number;
  extended_hours?: boolean;
  client_order_id?: string;
}

/**
 * Get account information
 */
export async function getAccount(): Promise<AlpacaAccount> {
  try {
    const account = await alpaca.getAccount();
    return account as AlpacaAccount;
  } catch (error) {
    console.error('Error fetching account:', error);
    throw error;
  }
}

/**
 * Get all positions
 */
export async function getPositions(): Promise<AlpacaPosition[]> {
  try {
    const positions = await alpaca.getPositions();
    return positions as AlpacaPosition[];
  } catch (error) {
    console.error('Error fetching positions:', error);
    throw error;
  }
}

/**
 * Get all open orders
 */
export async function getOrders(status: 'open' | 'closed' | 'all' = 'open'): Promise<AlpacaOrder[]> {
  try {
    const orders = await alpaca.getOrders({
      status,
      limit: 100,
      until: undefined,
      after: undefined,
      direction: undefined,
      nested: undefined,
      symbols: undefined,
    } as Parameters<typeof alpaca.getOrders>[0]);
    return orders as AlpacaOrder[];
  } catch (error) {
    console.error('Error fetching orders:', error);
    throw error;
  }
}

/**
 * Submit a new order
 */
export async function submitOrder(order: OrderRequest): Promise<AlpacaOrder> {
  try {
    const submittedOrder = await alpaca.createOrder({
      symbol: order.symbol,
      qty: order.qty,
      side: order.side,
      type: order.type,
      time_in_force: order.time_in_force,
      limit_price: order.limit_price,
      stop_price: order.stop_price,
      extended_hours: order.extended_hours,
      client_order_id: order.client_order_id,
    });
    return submittedOrder as AlpacaOrder;
  } catch (error) {
    console.error('Error submitting order:', error);
    throw error;
  }
}

/**
 * Cancel an order by ID
 */
export async function cancelOrder(orderId: string): Promise<boolean> {
  try {
    await alpaca.cancelOrder(orderId);
    return true;
  } catch (error) {
    console.error('Error canceling order:', error);
    throw error;
  }
}

/**
 * Cancel all open orders
 */
export async function cancelAllOrders(): Promise<{ cancelled: number }> {
  try {
    const orders = await alpaca.cancelAllOrders();
    return { cancelled: Array.isArray(orders) ? orders.length : 0 };
  } catch (error) {
    console.error('Error canceling all orders:', error);
    throw error;
  }
}

/**
 * Get latest quote for a symbol
 */
export async function getLatestQuote(symbol: string): Promise<{ bid: number; ask: number; last: number }> {
  try {
    const quote = await alpaca.getLatestQuote(symbol);
    const bidPrice = quote.BidPrice ?? 0;
    const askPrice = quote.AskPrice ?? 0;
    return {
      bid: typeof bidPrice === 'number' ? bidPrice : parseFloat(String(bidPrice)),
      ask: typeof askPrice === 'number' ? askPrice : parseFloat(String(askPrice)),
      last: typeof askPrice === 'number' ? askPrice : parseFloat(String(askPrice)),
    };
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw error;
  }
}

/**
 * Check if market is open
 */
export async function isMarketOpen(): Promise<boolean> {
  try {
    const clock = await alpaca.getClock();
    return clock.is_open;
  } catch (error) {
    console.error('Error checking market status:', error);
    return false;
  }
}

export default alpaca;
