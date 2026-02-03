-- =====================================================
-- HFT Trading Performance Indexes Migration
-- Created: 2026-02-03
-- Purpose: Add database indexes to optimize common query patterns
--          for high-frequency trading operations
-- =====================================================

-- =====================================================
-- INTENT TABLE INDEXES
-- Used for tracking trading intents/signals
-- =====================================================

-- Filter intents by symbol (common lookup pattern)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Intent_symbol_idx" ON "Intent"("symbol");

-- Filter intents by status (pending, approved, rejected, executed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Intent_status_idx" ON "Intent"("status");

-- Time-based queries for intent history and reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Intent_createdAt_idx" ON "Intent"("createdAt");

-- Filter by trading strategy for performance analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Intent_strategy_idx" ON "Intent"("strategy");

-- Composite: Filter by symbol AND status (e.g., "all pending AAPL intents")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Intent_symbol_status_idx" ON "Intent"("symbol", "status");

-- =====================================================
-- RISK CHECK TABLE INDEXES
-- Stores risk check results for each intent
-- =====================================================

-- FK lookup: Get all risk checks for an intent
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskCheck_intentId_idx" ON "RiskCheck"("intentId");

-- Filter by specific risk check type (e.g., "position_limit", "daily_loss")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskCheck_checkName_idx" ON "RiskCheck"("checkName");

-- Filter by pass/fail status for compliance reporting
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskCheck_passed_idx" ON "RiskCheck"("passed");

-- Time-based queries for risk check history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RiskCheck_createdAt_idx" ON "RiskCheck"("createdAt");

-- =====================================================
-- ORDER TABLE INDEXES
-- Critical for HFT: Orders must be quickly queryable
-- =====================================================

-- FK lookup: Get all orders for an intent
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_intentId_idx" ON "Order"("intentId");

-- Filter orders by symbol (very frequent in HFT)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_symbol_idx" ON "Order"("symbol");

-- Filter by order status (pending, filled, cancelled, etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_status_idx" ON "Order"("status");

-- Time-based queries for order history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");

-- Filter by buy/sell side
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_side_idx" ON "Order"("side");

-- Composite: Orders by symbol and status (e.g., "all active AAPL orders")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_symbol_status_idx" ON "Order"("symbol", "status");

-- Composite: Recent orders by symbol (e.g., "last 100 AAPL orders")
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Order_symbol_createdAt_idx" ON "Order"("symbol", "createdAt");

-- =====================================================
-- FILL TABLE INDEXES
-- Trade execution records
-- =====================================================

-- FK lookup: Get all fills for an order
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Fill_orderId_idx" ON "Fill"("orderId");

-- Time-based queries for fill history and VWAP calculations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Fill_timestamp_idx" ON "Fill"("timestamp");

-- =====================================================
-- POSITION TABLE INDEXES
-- Current portfolio positions
-- =====================================================

-- Track recently updated positions
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Position_updatedAt_idx" ON "Position"("updatedAt");

-- =====================================================
-- OPTIONS CONTRACT TABLE INDEXES
-- Options contract definitions
-- =====================================================

-- Filter options by underlying stock
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsContract_underlying_idx" ON "OptionsContract"("underlying");

-- Filter by expiration date (critical for options trading)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsContract_expiration_idx" ON "OptionsContract"("expiration");

-- Filter by contract type (calls vs puts)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsContract_contractType_idx" ON "OptionsContract"("contractType");

-- Composite: Find options chain by underlying and expiration
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsContract_underlying_expiration_idx" ON "OptionsContract"("underlying", "expiration");

-- =====================================================
-- OPTIONS INTENT TABLE INDEXES
-- =====================================================

-- Filter by underlying symbol
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsIntent_underlying_idx" ON "OptionsIntent"("underlying");

-- Filter by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsIntent_status_idx" ON "OptionsIntent"("status");

-- Time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsIntent_createdAt_idx" ON "OptionsIntent"("createdAt");

-- Filter by strategy
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsIntent_strategy_idx" ON "OptionsIntent"("strategy");

-- =====================================================
-- OPTIONS RISK CHECK TABLE INDEXES
-- =====================================================

-- FK lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsRiskCheck_intentId_idx" ON "OptionsRiskCheck"("intentId");

-- Filter by pass/fail
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsRiskCheck_passed_idx" ON "OptionsRiskCheck"("passed");

-- =====================================================
-- OPTIONS ORDER TABLE INDEXES
-- =====================================================

-- FK lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsOrder_intentId_idx" ON "OptionsOrder"("intentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsOrder_contractId_idx" ON "OptionsOrder"("contractId");

-- Filter by status
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsOrder_status_idx" ON "OptionsOrder"("status");

-- Time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsOrder_createdAt_idx" ON "OptionsOrder"("createdAt");

-- =====================================================
-- OPTIONS FILL TABLE INDEXES
-- =====================================================

-- FK lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsFill_orderId_idx" ON "OptionsFill"("orderId");

-- Time-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsFill_timestamp_idx" ON "OptionsFill"("timestamp");

-- =====================================================
-- OPTIONS GREEKS SNAPSHOT TABLE INDEXES
-- Historical Greeks tracking
-- =====================================================

-- FK lookup: Get Greeks history for a position
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsGreeksSnapshot_positionId_idx" ON "OptionsGreeksSnapshot"("positionId");

-- Time-based queries for Greeks history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OptionsGreeksSnapshot_timestamp_idx" ON "OptionsGreeksSnapshot"("timestamp");

-- =====================================================
-- PORTFOLIO GREEKS TABLE INDEXES
-- Portfolio-level Greeks snapshots
-- =====================================================

-- Time-based queries for portfolio Greeks history
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PortfolioGreeks_timestamp_idx" ON "PortfolioGreeks"("timestamp");

-- =====================================================
-- STRATEGY TABLE INDEXES
-- Trading strategy configurations
-- =====================================================

-- Filter active strategies
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Strategy_isActive_idx" ON "Strategy"("isActive");

-- Filter by strategy type
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Strategy_type_idx" ON "Strategy"("type");

-- Lookup by name
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Strategy_name_idx" ON "Strategy"("name");

-- =====================================================
-- WATCHLIST TABLE INDEXES
-- =====================================================

-- Lookup by name
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Watchlist_name_idx" ON "Watchlist"("name");

-- =====================================================
-- NOTE: The following tables already have indexes
-- defined in the Prisma schema. Listing for reference:
-- 
-- ManagedPosition: symbol, status, enteredAt
-- Alert: positionId, triggered, type
-- NewsItem: publishedAt, symbols
-- TechnicalData: symbol (+ unique constraint)
-- AutomationRule: symbol, status, ruleType, ocoGroupId
-- AutomationExecution: ruleId, createdAt
-- PositionSnapshot: symbol, timestamp
-- AuditLog: action, userId, symbol, createdAt
-- =====================================================

-- =====================================================
-- ANALYZE TABLES
-- Update statistics after index creation
-- =====================================================

ANALYZE "Intent";
ANALYZE "RiskCheck";
ANALYZE "Order";
ANALYZE "Fill";
ANALYZE "Position";
ANALYZE "OptionsContract";
ANALYZE "OptionsIntent";
ANALYZE "OptionsRiskCheck";
ANALYZE "OptionsOrder";
ANALYZE "OptionsFill";
ANALYZE "OptionsGreeksSnapshot";
ANALYZE "PortfolioGreeks";
ANALYZE "Strategy";
ANALYZE "Watchlist";
