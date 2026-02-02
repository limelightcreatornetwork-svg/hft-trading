-- HFT Trading Backend Database Schema
-- Run on first startup via Docker entrypoint

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Trade Intents (what the agent wants to do)
CREATE TABLE IF NOT EXISTS intents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_intent_id VARCHAR(255) UNIQUE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    qty INTEGER NOT NULL,
    order_type VARCHAR(20) NOT NULL,
    limit_price DECIMAL(12, 4),
    time_in_force VARCHAR(10) DEFAULT 'day',
    strategy VARCHAR(50),
    reason TEXT,
    confidence DECIMAL(5, 4),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk Decisions (whether we allowed it)
CREATE TABLE IF NOT EXISTS risk_decisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intent_id UUID REFERENCES intents(id),
    accepted BOOLEAN NOT NULL,
    reason VARCHAR(255),
    checks_snapshot JSONB,
    limits_snapshot JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders (what we sent to Alpaca)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    intent_id UUID REFERENCES intents(id),
    alpaca_order_id VARCHAR(255) UNIQUE,
    client_order_id VARCHAR(255) UNIQUE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL,
    qty INTEGER NOT NULL,
    filled_qty INTEGER DEFAULT 0,
    order_type VARCHAR(20) NOT NULL,
    limit_price DECIMAL(12, 4),
    avg_fill_price DECIMAL(12, 4),
    status VARCHAR(20) DEFAULT 'new',
    submitted_at TIMESTAMP WITH TIME ZONE,
    filled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Fills (execution reports)
CREATE TABLE IF NOT EXISTS fills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id),
    alpaca_trade_id VARCHAR(255),
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL,
    qty INTEGER NOT NULL,
    price DECIMAL(12, 4) NOT NULL,
    filled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Position Snapshots (periodic snapshots)
CREATE TABLE IF NOT EXISTS position_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(10) NOT NULL,
    qty INTEGER NOT NULL,
    avg_entry_price DECIMAL(12, 4),
    market_value DECIMAL(14, 2),
    unrealized_pl DECIMAL(14, 2),
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Account Snapshots
CREATE TABLE IF NOT EXISTS account_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buying_power DECIMAL(14, 2),
    cash DECIMAL(14, 2),
    portfolio_value DECIMAL(14, 2),
    equity DECIMAL(14, 2),
    daily_pnl DECIMAL(14, 2),
    snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk Config (configurable limits)
CREATE TABLE IF NOT EXISTS risk_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event Log (append-only audit trail)
CREATE TABLE IF NOT EXISTS event_log (
    id BIGSERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_intents_client_id ON intents(client_intent_id);
CREATE INDEX IF NOT EXISTS idx_intents_symbol ON intents(symbol);
CREATE INDEX IF NOT EXISTS idx_intents_created ON intents(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_alpaca_id ON orders(alpaca_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills(order_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);

-- Insert default risk config
INSERT INTO risk_config (key, value, description) VALUES
    ('max_position_size', '1000', 'Maximum position size in USD per symbol'),
    ('max_daily_loss', '500', 'Maximum daily loss before kill switch'),
    ('max_order_notional', '500', 'Maximum notional value per order'),
    ('max_daily_trades', '100', 'Maximum number of trades per day'),
    ('order_rate_limit', '10', 'Maximum orders per minute'),
    ('symbol_allowlist', 'AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA', 'Allowed symbols'),
    ('kill_switch', 'false', 'Global kill switch')
ON CONFLICT (key) DO NOTHING;
