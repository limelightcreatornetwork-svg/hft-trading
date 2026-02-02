/**
 * @fileoverview Options Trading Service
 *
 * Handles options-specific operations including:
 * - Fetching option chains
 * - Placing options orders
 * - Managing options positions
 *
 * @module options
 */

import { config } from '../libs/config.js';
import { logger } from '../libs/logger.js';
import { isValidOptionSymbol, parseOptionSymbol } from '../core/types.js';

/**
 * Alpaca API base URLs
 */
const ALPACA_TRADING_URL = config.alpaca.baseUrl;
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

/**
 * Make authenticated request to Alpaca API
 */
async function alpacaRequest(url, options = {}) {
  const headers = {
    'APCA-API-KEY-ID': config.alpaca.apiKey,
    'APCA-API-SECRET-KEY': config.alpaca.apiSecret,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    const error = new Error(errorData.message || `Alpaca API error: ${response.status}`);
    error.status = response.status;
    error.details = errorData;
    throw error;
  }

  return response.json();
}

/**
 * Options Trading Service
 */
export const optionsService = {
  /**
   * Get option contracts for a symbol
   * 
   * @param {Object} params - Query parameters
   * @param {string} params.underlying_symbols - Underlying symbol(s), comma-separated
   * @param {string} [params.expiration_date] - Specific expiration date (YYYY-MM-DD)
   * @param {string} [params.expiration_date_gte] - Min expiration date
   * @param {string} [params.expiration_date_lte] - Max expiration date
   * @param {string} [params.type] - "call" or "put"
   * @param {number} [params.strike_price_gte] - Min strike price
   * @param {number} [params.strike_price_lte] - Max strike price
   * @param {number} [params.limit] - Max results (default 100)
   * @param {string} [params.page_token] - Pagination token
   * @returns {Promise<Object>} Option contracts response
   */
  async getOptionChain(params = {}) {
    const queryParams = new URLSearchParams();
    
    // Required: underlying_symbols
    if (params.underlying_symbols) {
      queryParams.set('underlying_symbols', params.underlying_symbols.toUpperCase());
    }
    
    // Optional filters
    if (params.expiration_date) {
      queryParams.set('expiration_date', params.expiration_date);
    }
    if (params.expiration_date_gte) {
      queryParams.set('expiration_date_gte', params.expiration_date_gte);
    }
    if (params.expiration_date_lte) {
      queryParams.set('expiration_date_lte', params.expiration_date_lte);
    }
    if (params.type) {
      queryParams.set('type', params.type.toLowerCase());
    }
    if (params.strike_price_gte !== undefined) {
      queryParams.set('strike_price_gte', String(params.strike_price_gte));
    }
    if (params.strike_price_lte !== undefined) {
      queryParams.set('strike_price_lte', String(params.strike_price_lte));
    }
    if (params.limit) {
      queryParams.set('limit', String(Math.min(params.limit, 1000)));
    }
    if (params.page_token) {
      queryParams.set('page_token', params.page_token);
    }

    const url = `${ALPACA_TRADING_URL}/v2/options/contracts?${queryParams.toString()}`;
    
    logger.debug({ url, params }, 'Fetching option chain');
    
    try {
      const response = await alpacaRequest(url);
      
      logger.info({
        underlying: params.underlying_symbols,
        count: response.option_contracts?.length || 0,
      }, 'Option chain fetched');
      
      return {
        contracts: response.option_contracts || [],
        next_page_token: response.next_page_token,
      };
    } catch (error) {
      logger.error({ error: error.message, params }, 'Failed to fetch option chain');
      throw error;
    }
  },

  /**
   * Get a single option contract by symbol or ID
   */
  async getOptionContract(symbolOrId) {
    const url = `${ALPACA_TRADING_URL}/v2/options/contracts/${symbolOrId}`;
    
    try {
      const contract = await alpacaRequest(url);
      return contract;
    } catch (error) {
      logger.error({ error: error.message, symbolOrId }, 'Failed to fetch option contract');
      throw error;
    }
  },

  /**
   * Get latest quotes for option contracts
   */
  async getOptionQuotes(symbols) {
    const symbolList = Array.isArray(symbols) ? symbols.join(',') : symbols;
    const url = `${ALPACA_DATA_URL}/v1beta1/options/quotes/latest?symbols=${symbolList}`;
    
    try {
      const response = await alpacaRequest(url);
      return response.quotes || {};
    } catch (error) {
      logger.error({ error: error.message, symbols }, 'Failed to fetch option quotes');
      throw error;
    }
  },

  /**
   * Get options positions
   */
  async getOptionsPositions() {
    const url = `${ALPACA_TRADING_URL}/v2/positions`;
    
    try {
      const positions = await alpacaRequest(url);
      
      // Filter for options positions (asset_class === 'us_option')
      const optionsPositions = positions.filter(p => p.asset_class === 'us_option');
      
      logger.info({ count: optionsPositions.length }, 'Options positions fetched');
      
      return optionsPositions.map(pos => ({
        asset_id: pos.asset_id,
        symbol: pos.symbol,
        exchange: pos.exchange,
        asset_class: pos.asset_class,
        qty: parseFloat(pos.qty),
        qty_available: parseFloat(pos.qty_available),
        avg_entry_price: parseFloat(pos.avg_entry_price),
        market_value: parseFloat(pos.market_value),
        cost_basis: parseFloat(pos.cost_basis),
        unrealized_pl: parseFloat(pos.unrealized_pl),
        unrealized_plpc: parseFloat(pos.unrealized_plpc),
        current_price: parseFloat(pos.current_price),
        side: parseFloat(pos.qty) >= 0 ? 'long' : 'short',
        // Parse option details from symbol
        ...parseOptionSymbol(pos.symbol),
      }));
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch options positions');
      throw error;
    }
  },

  /**
   * Place an options order
   * 
   * @param {Object} order - Order request
   * @param {string} order.symbol - OCC option symbol
   * @param {number} order.qty - Number of contracts
   * @param {string} order.side - "buy" or "sell"
   * @param {string} order.type - "market", "limit", "stop", "stop_limit"
   * @param {number} [order.limit_price] - Limit price
   * @param {number} [order.stop_price] - Stop price
   * @param {string} [order.client_order_id] - Client order ID
   */
  async placeOptionsOrder(order) {
    // Validate option symbol
    if (!isValidOptionSymbol(order.symbol)) {
      throw new Error(`Invalid option symbol format: ${order.symbol}`);
    }

    // Options-specific validations per Alpaca requirements
    if (!Number.isInteger(order.qty) || order.qty < 1) {
      throw new Error('Options quantity must be a positive whole number');
    }

    if (!['buy', 'sell'].includes(order.side)) {
      throw new Error('Side must be "buy" or "sell"');
    }

    if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
      throw new Error('Type must be market, limit, stop, or stop_limit');
    }

    if (order.type === 'limit' || order.type === 'stop_limit') {
      if (!order.limit_price || order.limit_price <= 0) {
        throw new Error('Limit price is required for limit orders');
      }
    }

    if (order.type === 'stop' || order.type === 'stop_limit') {
      if (!order.stop_price || order.stop_price <= 0) {
        throw new Error('Stop price is required for stop orders');
      }
    }

    // Build order payload
    const payload = {
      symbol: order.symbol.toUpperCase(),
      qty: String(order.qty),
      side: order.side,
      type: order.type,
      time_in_force: 'day', // Options orders must be day orders
    };

    if (order.limit_price) {
      payload.limit_price = String(order.limit_price);
    }
    if (order.stop_price) {
      payload.stop_price = String(order.stop_price);
    }
    if (order.client_order_id) {
      payload.client_order_id = order.client_order_id;
    }

    const url = `${ALPACA_TRADING_URL}/v2/orders`;

    logger.info({ 
      symbol: payload.symbol, 
      qty: payload.qty, 
      side: payload.side,
      type: payload.type,
    }, 'Placing options order');

    try {
      const result = await alpacaRequest(url, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      logger.info({
        order_id: result.id,
        symbol: result.symbol,
        status: result.status,
      }, 'Options order placed');

      return {
        order_id: result.id,
        client_order_id: result.client_order_id,
        symbol: result.symbol,
        qty: parseInt(result.qty, 10),
        filled_qty: parseInt(result.filled_qty || '0', 10),
        side: result.side,
        type: result.type,
        time_in_force: result.time_in_force,
        limit_price: result.limit_price ? parseFloat(result.limit_price) : null,
        stop_price: result.stop_price ? parseFloat(result.stop_price) : null,
        status: result.status,
        created_at: result.created_at,
        submitted_at: result.submitted_at,
      };
    } catch (error) {
      logger.error({ 
        error: error.message, 
        details: error.details,
        order,
      }, 'Failed to place options order');
      throw error;
    }
  },

  /**
   * Cancel an options order
   */
  async cancelOptionsOrder(orderId) {
    const url = `${ALPACA_TRADING_URL}/v2/orders/${orderId}`;

    try {
      await alpacaRequest(url, { method: 'DELETE' });
      logger.info({ orderId }, 'Options order cancelled');
      return { success: true, order_id: orderId };
    } catch (error) {
      logger.error({ error: error.message, orderId }, 'Failed to cancel options order');
      throw error;
    }
  },

  /**
   * Get options orders
   */
  async getOptionsOrders(params = {}) {
    const queryParams = new URLSearchParams();
    
    if (params.status) {
      queryParams.set('status', params.status);
    }
    if (params.limit) {
      queryParams.set('limit', String(params.limit));
    }
    if (params.after) {
      queryParams.set('after', params.after);
    }
    if (params.until) {
      queryParams.set('until', params.until);
    }
    
    // Filter for options by asset class
    const url = `${ALPACA_TRADING_URL}/v2/orders?${queryParams.toString()}`;

    try {
      const orders = await alpacaRequest(url);
      
      // Filter for options orders
      const optionsOrders = orders.filter(o => isValidOptionSymbol(o.symbol));
      
      return optionsOrders.map(o => ({
        order_id: o.id,
        client_order_id: o.client_order_id,
        symbol: o.symbol,
        qty: parseInt(o.qty, 10),
        filled_qty: parseInt(o.filled_qty || '0', 10),
        side: o.side,
        type: o.type,
        time_in_force: o.time_in_force,
        limit_price: o.limit_price ? parseFloat(o.limit_price) : null,
        stop_price: o.stop_price ? parseFloat(o.stop_price) : null,
        filled_avg_price: o.filled_avg_price ? parseFloat(o.filled_avg_price) : null,
        status: o.status,
        created_at: o.created_at,
        submitted_at: o.submitted_at,
        filled_at: o.filled_at,
        ...parseOptionSymbol(o.symbol),
      }));
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch options orders');
      throw error;
    }
  },

  /**
   * Exercise an option position
   */
  async exerciseOption(symbolOrContractId) {
    const url = `${ALPACA_TRADING_URL}/v2/positions/${symbolOrContractId}/exercise`;

    try {
      await alpacaRequest(url, { method: 'POST' });
      logger.info({ symbolOrContractId }, 'Option exercised');
      return { success: true, symbol: symbolOrContractId };
    } catch (error) {
      logger.error({ error: error.message, symbolOrContractId }, 'Failed to exercise option');
      throw error;
    }
  },

  /**
   * Get account options trading level
   */
  async getAccountOptionsLevel() {
    const url = `${ALPACA_TRADING_URL}/v2/account`;

    try {
      const account = await alpacaRequest(url);
      return {
        options_approved_level: account.options_approved_level || 0,
        options_trading_level: account.options_trading_level || 0,
        buying_power: parseFloat(account.buying_power),
        options_buying_power: parseFloat(account.options_buying_power || account.buying_power),
        cash: parseFloat(account.cash),
        portfolio_value: parseFloat(account.portfolio_value),
      };
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to fetch account info');
      throw error;
    }
  },
};
