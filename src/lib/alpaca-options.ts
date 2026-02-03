/**
 * Alpaca Options Trading API Functions
 * 
 * Supports Level 1 trading:
 * - Sell covered calls (requires underlying shares)
 * - Sell cash-secured puts (requires buying power)
 */

const ALPACA_BASE_URL = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets';

interface FetchOptions {
  method?: string;
  body?: unknown;
}

async function alpacaFetch<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Alpaca API error (${response.status}): ${error}`);
  }

  return response.json();
}

// ============ Types ============

export interface OptionContract {
  id: string;
  symbol: string;
  name: string;
  status: string;
  tradable: boolean;
  expiration_date: string;
  root_symbol: string;
  underlying_symbol: string;
  underlying_asset_id: string;
  type: 'call' | 'put';
  style: 'american' | 'european';
  strike_price: string;
  size: string;
  open_interest: string;
  open_interest_date: string;
  close_price: string;
  close_price_date: string;
}

export interface OptionsContractsResponse {
  option_contracts: OptionContract[];
  next_page_token?: string;
}

export interface OptionQuote {
  symbol: string;
  bid_price: number;
  bid_size: number;
  ask_price: number;
  ask_size: number;
  last_price: number;
  last_size: number;
  timestamp: string;
}

export interface OptionTrade {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange: string;
}

export interface OptionGreeks {
  symbol: string;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  implied_volatility: number;
}

export interface OptionSnapshot {
  symbol: string;
  latestQuote: OptionQuote | null;
  latestTrade: OptionTrade | null;
  greeks: OptionGreeks | null;
}

export interface OptionOrderRequest {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  time_in_force: 'day';
  limit_price?: number;
  stop_price?: number;
  client_order_id?: string;
}

export interface OptionOrderResponse {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
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
}

export interface OptionsChainParams {
  underlying_symbol: string;
  expiration_date?: string;
  expiration_date_gte?: string;
  expiration_date_lte?: string;
  strike_price_gte?: number;
  strike_price_lte?: number;
  type?: 'call' | 'put';
  limit?: number;
  page_token?: string;
}

// ============ Contract Functions ============

/**
 * Get options contracts for a given underlying symbol
 */
export async function getOptionsContracts(params: OptionsChainParams): Promise<OptionsContractsResponse> {
  const searchParams = new URLSearchParams();
  
  searchParams.set('underlying_symbols', params.underlying_symbol);
  
  if (params.expiration_date) {
    searchParams.set('expiration_date', params.expiration_date);
  }
  if (params.expiration_date_gte) {
    searchParams.set('expiration_date_gte', params.expiration_date_gte);
  }
  if (params.expiration_date_lte) {
    searchParams.set('expiration_date_lte', params.expiration_date_lte);
  }
  if (params.strike_price_gte !== undefined) {
    searchParams.set('strike_price_gte', params.strike_price_gte.toString());
  }
  if (params.strike_price_lte !== undefined) {
    searchParams.set('strike_price_lte', params.strike_price_lte.toString());
  }
  if (params.type) {
    searchParams.set('type', params.type);
  }
  if (params.limit) {
    searchParams.set('limit', params.limit.toString());
  }
  if (params.page_token) {
    searchParams.set('page_token', params.page_token);
  }

  return alpacaFetch<OptionsContractsResponse>(
    `${ALPACA_BASE_URL}/v2/options/contracts?${searchParams.toString()}`
  );
}

/**
 * Get a single option contract by symbol or ID
 */
export async function getOptionContract(symbolOrId: string): Promise<OptionContract> {
  return alpacaFetch<OptionContract>(
    `${ALPACA_BASE_URL}/v2/options/contracts/${symbolOrId}`
  );
}

// ============ Market Data Functions ============

/**
 * Get latest quote for option contracts
 */
export async function getOptionsQuotes(symbols: string[]): Promise<Record<string, OptionQuote>> {
  const searchParams = new URLSearchParams();
  searchParams.set('symbols', symbols.join(','));
  
  const response = await alpacaFetch<{ quotes: Record<string, OptionQuote> }>(
    `${ALPACA_DATA_URL}/v1beta1/options/quotes/latest?${searchParams.toString()}`
  );
  
  return response.quotes;
}

/**
 * Get latest trade for option contracts
 */
export async function getOptionsTrades(symbols: string[]): Promise<Record<string, OptionTrade>> {
  const searchParams = new URLSearchParams();
  searchParams.set('symbols', symbols.join(','));
  
  const response = await alpacaFetch<{ trades: Record<string, OptionTrade> }>(
    `${ALPACA_DATA_URL}/v1beta1/options/trades/latest?${searchParams.toString()}`
  );
  
  return response.trades;
}

/**
 * Get snapshots (quote + trade + greeks) for option contracts
 */
export async function getOptionsSnapshots(symbols: string[]): Promise<Record<string, OptionSnapshot>> {
  const searchParams = new URLSearchParams();
  searchParams.set('symbols', symbols.join(','));
  
  const response = await alpacaFetch<{ snapshots: Record<string, OptionSnapshot> }>(
    `${ALPACA_DATA_URL}/v1beta1/options/snapshots?${searchParams.toString()}`
  );
  
  return response.snapshots;
}

// ============ Order Functions ============

/**
 * Submit an options order
 * Note: For Level 1, only covered calls and cash-secured puts are allowed
 */
export async function submitOptionsOrder(order: OptionOrderRequest): Promise<OptionOrderResponse> {
  // Validate options-specific requirements
  if (order.time_in_force !== 'day') {
    throw new Error('Options orders must use time_in_force: day');
  }
  
  if (!Number.isInteger(order.qty)) {
    throw new Error('Options quantity must be a whole number');
  }

  return alpacaFetch(
    `${ALPACA_BASE_URL}/v2/orders`,
    {
      method: 'POST',
      body: {
        symbol: order.symbol,
        qty: order.qty.toString(),
        side: order.side,
        type: order.type,
        time_in_force: order.time_in_force,
        limit_price: order.limit_price?.toString(),
        stop_price: order.stop_price?.toString(),
        client_order_id: order.client_order_id,
      },
    }
  );
}

/**
 * Exercise an option position
 */
export async function exerciseOption(symbolOrContractId: string): Promise<void> {
  await alpacaFetch(
    `${ALPACA_BASE_URL}/v2/positions/${symbolOrContractId}/exercise`,
    { method: 'POST' }
  );
}

// ============ Utility Functions ============

/**
 * Parse option symbol to extract details
 * Format: AAPL240119C00100000
 * - Root symbol: AAPL
 * - Expiration: 240119 (YYMMDD)
 * - Type: C (call) or P (put)
 * - Strike: 00100000 (price * 1000)
 */
export function parseOptionSymbol(symbol: string): {
  rootSymbol: string;
  expirationDate: string;
  type: 'call' | 'put';
  strikePrice: number;
} | null {
  const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const [, rootSymbol, expDate, optionType, strikeStr] = match;
  
  const year = 2000 + parseInt(expDate.slice(0, 2));
  const month = expDate.slice(2, 4);
  const day = expDate.slice(4, 6);
  
  return {
    rootSymbol,
    expirationDate: `${year}-${month}-${day}`,
    type: optionType === 'C' ? 'call' : 'put',
    strikePrice: parseInt(strikeStr) / 1000,
  };
}

/**
 * Build option symbol from components
 */
export function buildOptionSymbol(
  rootSymbol: string,
  expirationDate: string, // YYYY-MM-DD
  type: 'call' | 'put',
  strikePrice: number
): string {
  const [year, month, day] = expirationDate.split('-');
  const expStr = year.slice(2) + month + day;
  const typeChar = type === 'call' ? 'C' : 'P';
  const strikeStr = (strikePrice * 1000).toString().padStart(8, '0');
  
  return `${rootSymbol.toUpperCase()}${expStr}${typeChar}${strikeStr}`;
}

/**
 * Calculate option premium from contract
 */
export function calculatePremium(contract: OptionContract, quantity: number): number {
  const contractSize = parseInt(contract.size) || 100;
  const price = parseFloat(contract.close_price) || 0;
  return price * contractSize * quantity;
}

/**
 * Get expiration dates for the next N weeks (Fridays in UTC)
 */
export function getExpirationDates(weeks: number = 8): string[] {
  const dates: string[] = [];
  const today = new Date();
  
  // Use UTC to avoid timezone issues
  const utcDay = today.getUTCDay();
  
  // Calculate days until next Friday (0=Sun, 5=Fri)
  // If today is Friday (5), go to next Friday (7 days)
  // If today is Sat (6), go to Friday in 6 days
  // If today is Sun (0), go to Friday in 5 days
  let daysUntilFriday = (5 - utcDay + 7) % 7;
  if (daysUntilFriday === 0) {
    daysUntilFriday = 7; // If today is Friday, go to next Friday
  }
  
  for (let i = 0; i < weeks; i++) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() + daysUntilFriday + (i * 7));
    // Format as YYYY-MM-DD using UTC
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
  }
  
  return dates;
}

/**
 * Check if user can sell covered call (has underlying shares)
 */
export function canSellCoveredCall(
  positions: Array<{ symbol: string; qty: string }>,
  underlyingSymbol: string,
  contracts: number
): { allowed: boolean; reason?: string; availableShares?: number } {
  const position = positions.find(p => p.symbol === underlyingSymbol);
  const sharesOwned = position ? parseInt(position.qty) : 0;
  const sharesRequired = contracts * 100;
  
  if (sharesOwned < sharesRequired) {
    return {
      allowed: false,
      reason: `Insufficient shares. Need ${sharesRequired}, have ${sharesOwned}`,
      availableShares: sharesOwned,
    };
  }
  
  return { allowed: true, availableShares: sharesOwned };
}

/**
 * Check if user can sell cash-secured put (has buying power)
 */
export function canSellCashSecuredPut(
  buyingPower: number,
  strikePrice: number,
  contracts: number
): { allowed: boolean; reason?: string; requiredCash?: number } {
  const requiredCash = strikePrice * 100 * contracts;
  
  if (buyingPower < requiredCash) {
    return {
      allowed: false,
      reason: `Insufficient buying power. Need $${requiredCash.toFixed(2)}, have $${buyingPower.toFixed(2)}`,
      requiredCash,
    };
  }
  
  return { allowed: true, requiredCash };
}
