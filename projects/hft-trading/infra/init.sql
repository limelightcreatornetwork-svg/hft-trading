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

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- Optimized for HFT query patterns
-- =====================================================

-- Intent table indexes
CREATE INDEX IF NOT EXISTS idx_intents_client_id ON intents(client_intent_id);
CREATE INDEX IF NOT EXISTS idx_intents_symbol ON intents(symbol);
CREATE INDEX IF NOT EXISTS idx_intents_created ON intents(created_at);
CREATE INDEX IF NOT EXISTS idx_intents_status ON intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_strategy ON intents(strategy);
-- Composite: symbol + status for filtered queries
CREATE INDEX IF NOT EXISTS idx_intents_symbol_status ON intents(symbol, status);
-- Composite: symbol + created_at for recent intents by symbol
CREATE INDEX IF NOT EXISTS idx_intents_symbol_created ON intents(symbol, created_at DESC);

-- Risk decisions indexes
CREATE INDEX IF NOT EXISTS idx_risk_decisions_intent_id ON risk_decisions(intent_id);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_accepted ON risk_decisions(accepted);
CREATE INDEX IF NOT EXISTS idx_risk_decisions_created ON risk_decisions(created_at);

-- Order table indexes (critical for HFT)
CREATE INDEX IF NOT EXISTS idx_orders_alpaca_id ON orders(alpaca_order_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_intent_id ON orders(intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_side ON orders(side);
-- Composite: symbol + status for active orders lookup
CREATE INDEX IF NOT EXISTS idx_orders_symbol_status ON orders(symbol, status);
-- Composite: symbol + created_at for recent orders by symbol
CREATE INDEX IF NOT EXISTS idx_orders_symbol_created ON orders(symbol, created_at DESC);
-- Composite: status + created_at for recent active orders
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

-- Fill table indexes
CREATE INDEX IF NOT EXISTS idx_fills_order_id ON fills(order_id);
CREATE INDEX IF NOT EXISTS idx_fills_symbol ON fills(symbol);
CREATE INDEX IF NOT EXISTS idx_fills_filled_at ON fills(filled_at);
-- Composite: symbol + filled_at for recent fills by symbol
CREATE INDEX IF NOT EXISTS idx_fills_symbol_filled ON fills(symbol, filled_at DESC);

-- Position snapshots indexes
CREATE INDEX IF NOT EXISTS idx_position_snapshots_symbol ON position_snapshots(symbol);
CREATE INDEX IF NOT EXISTS idx_position_snapshots_at ON position_snapshots(snapshot_at);
-- Composite: symbol + time for historical lookups
CREATE INDEX IF NOT EXISTS idx_position_snapshots_symbol_time ON position_snapshots(symbol, snapshot_at DESC);

-- Account snapshots indexes
CREATE INDEX IF NOT EXISTS idx_account_snapshots_at ON account_snapshots(snapshot_at);

-- Event log indexes (audit trail)
CREATE INDEX IF NOT EXISTS idx_event_log_type ON event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_created ON event_log(created_at);
-- Composite: type + created_at for filtered audit queries
CREATE INDEX IF NOT EXISTS idx_event_log_type_created ON event_log(event_type, created_at DESC);
-- Partial index: only recent events (last 7 days) for fast queries
-- CREATE INDEX IF NOT EXISTS idx_event_log_recent ON event_log(created_at DESC) WHERE created_at > NOW() - INTERVAL '7 days';

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
