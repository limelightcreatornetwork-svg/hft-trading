/**
 * Jest setup file
 * Sets up test environment and global mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.ALPACA_API_KEY = 'test_key';
process.env.ALPACA_API_SECRET = 'test_secret';
process.env.ALPACA_PAPER = 'true';
process.env.MAX_POSITION_SIZE = '10000';
process.env.MAX_DAILY_LOSS = '1000';
process.env.MAX_ORDER_NOTIONAL = '5000';
process.env.MAX_DAILY_TRADES = '100';
process.env.ORDER_RATE_LIMIT = '20';
process.env.SYMBOL_ALLOWLIST = 'AAPL,MSFT,GOOGL,TSLA,NVDA,SPY,QQQ,AMZN,META,NFLX,GOOG,IWM';
