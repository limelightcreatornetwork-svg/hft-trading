/**
 * @fileoverview Configuration management
 * @module libs/config
 */

import 'dotenv/config';

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Alpaca
  alpaca: {
    apiKey: process.env.ALPACA_API_KEY,
    apiSecret: process.env.ALPACA_API_SECRET,
    paper: process.env.ALPACA_PAPER !== 'false',
    baseUrl: process.env.ALPACA_PAPER !== 'false'
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets',
    dataUrl: 'wss://stream.data.alpaca.markets/v2',
    tradingUrl: process.env.ALPACA_PAPER !== 'false'
      ? 'wss://paper-api.alpaca.markets/stream'
      : 'wss://api.alpaca.markets/stream',
  },

  // Database
  database: {
    url: process.env.DATABASE_URL || 'postgres://trading:trading@localhost:5432/trading',
  },

  // Redis
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // Risk Limits
  risk: {
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '1000'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '500'),
    maxOrderNotional: parseFloat(process.env.MAX_ORDER_NOTIONAL || '500'),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '100', 10),
    orderRateLimit: parseInt(process.env.ORDER_RATE_LIMIT || '10', 10),
    symbolAllowlist: (process.env.SYMBOL_ALLOWLIST || 'AAPL,MSFT,GOOGL').split(','),
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

// Validate required config
export function validateConfig() {
  const errors = [];

  if (!config.alpaca.apiKey) {
    errors.push('ALPACA_API_KEY is required');
  }
  if (!config.alpaca.apiSecret) {
    errors.push('ALPACA_API_SECRET is required');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    if (config.nodeEnv === 'production') {
      process.exit(1);
    }
  }

  return errors;
}
