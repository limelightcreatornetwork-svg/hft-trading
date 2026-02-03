# Database Indexes for HFT Trading

This document describes the database indexes added for performance optimization in the HFT Trading system.

## Overview

High-frequency trading requires fast database queries for:
- Real-time order lookups
- Position monitoring
- Risk checks
- Historical analysis

The indexes added optimize these common query patterns while balancing write performance.

## Index Categories

### 1. Trading Intent Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `Intent_symbol_idx` | `symbol` | Filter intents by trading symbol |
| `Intent_status_idx` | `status` | Filter by status (PENDING, APPROVED, etc.) |
| `Intent_createdAt_idx` | `createdAt` | Time-based queries |
| `Intent_strategy_idx` | `strategy` | Filter by trading strategy |
| `Intent_symbol_status_idx` | `symbol, status` | Composite: "all pending AAPL intents" |

### 2. Order Indexes (Critical for HFT)

| Index | Columns | Purpose |
|-------|---------|---------|
| `Order_symbol_idx` | `symbol` | Filter orders by symbol |
| `Order_status_idx` | `status` | Filter by order status |
| `Order_createdAt_idx` | `createdAt` | Time-based queries |
| `Order_symbol_status_idx` | `symbol, status` | "All active AAPL orders" |
| `Order_symbol_createdAt_idx` | `symbol, createdAt` | "Last 100 AAPL orders" |

### 3. Options Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `OptionsContract_underlying_idx` | `underlying` | Filter by underlying stock |
| `OptionsContract_expiration_idx` | `expiration` | Filter by expiry date |
| `OptionsContract_underlying_expiration_idx` | `underlying, expiration` | Options chain lookup |

### 4. Risk & Audit Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `RiskCheck_intentId_idx` | `intentId` | FK lookup |
| `RiskCheck_passed_idx` | `passed` | Compliance reporting |
| `AuditLog_action_idx` | `action` | Filter by action type |
| `AuditLog_createdAt_idx` | `createdAt` | Time-based audit queries |

## Applying Indexes

### Method 1: Prisma Migration (Recommended)

```bash
# Generate Prisma migration from schema changes
npx prisma migrate dev --name add_performance_indexes

# Or apply directly in production
npx prisma migrate deploy
```

### Method 2: Direct SQL

Run the migration file directly:

```bash
# Using psql
psql $DATABASE_URL -f prisma/migrations/20260203_add_performance_indexes.sql

# Or using Prisma's db execute
npx prisma db execute --file prisma/migrations/20260203_add_performance_indexes.sql
```

### Method 3: Backend Init Script

The backend's `init.sql` (in `projects/hft-trading/infra/`) already includes indexes for the Python backend tables. These are applied automatically on first startup.

## Performance Considerations

### Index Write Overhead

Each index slightly increases INSERT/UPDATE time. For HFT:
- Keep indexes targeted to actual query patterns
- Avoid over-indexing rarely queried columns
- Monitor index usage with `pg_stat_user_indexes`

### Concurrent Index Creation

The migration uses `CREATE INDEX CONCURRENTLY` to avoid locking tables during index creation. This is safe for production use.

### Monitoring Index Usage

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find unused indexes (candidates for removal)
SELECT
  schemaname || '.' || relname AS table,
  indexrelname AS index,
  pg_size_pretty(pg_relation_size(i.indexrelid)) AS index_size,
  idx_scan as index_scans
FROM pg_stat_user_indexes ui
JOIN pg_index i ON ui.indexrelid = i.indexrelid
WHERE NOT indisunique
  AND idx_scan < 50
ORDER BY pg_relation_size(i.indexrelid) DESC;
```

## Files Modified

1. **`prisma/schema.prisma`** - Added `@@index` declarations to models
2. **`prisma/migrations/20260203_add_performance_indexes.sql`** - Standalone SQL migration
3. **`projects/hft-trading/infra/init.sql`** - Backend initialization indexes

## Future Optimizations

Consider these additional optimizations based on query patterns:

1. **Partial Indexes** - Index only relevant rows:
   ```sql
   CREATE INDEX idx_orders_active ON "Order"(symbol, createdAt)
   WHERE status IN ('PENDING', 'SUBMITTED', 'PARTIALLY_FILLED');
   ```

2. **BRIN Indexes** - For time-series data:
   ```sql
   CREATE INDEX idx_fills_timestamp_brin ON "Fill"
   USING BRIN (timestamp) WITH (pages_per_range = 128);
   ```

3. **GIN Indexes** - For array columns (like `symbols` in Watchlist):
   ```sql
   CREATE INDEX idx_watchlist_symbols ON "Watchlist" USING GIN (symbols);
   ```
