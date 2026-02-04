/**
 * Strategy Executor
 *
 * Runs enabled strategies against current market data, evaluates signals,
 * and submits trades via the trade manager.
 */

import alpaca from '@alpacahq/alpaca-trade-api';
import { alpacaConfig } from './env';
import { prisma } from './db';
import { createStrategy } from './strategies/strategy-factory';
import type { StrategyContext } from './strategies/types';
import { detectRegimeCached } from './regime';
import { createManagedPosition, type TradeRequest } from './trade-manager';
import { updateStrategyPerformance } from './strategy-manager';
import { createLogger, serializeError } from './logger';

const log = createLogger('strategy-executor');

const alpacaClient = new alpaca({
  keyId: alpacaConfig.apiKey,
  secretKey: alpacaConfig.apiSecret,
  paper: alpacaConfig.isPaper,
  baseUrl: alpacaConfig.baseUrl,
});

interface Bar {
  Timestamp: string;
  OpenPrice: number;
  HighPrice: number;
  LowPrice: number;
  ClosePrice: number;
  Volume: number;
}

export interface ExecutionResult {
  strategyId: string;
  strategyName: string;
  symbol: string;
  action: 'buy' | 'sell' | 'hold';
  confidence: number;
  reason: string;
  executed: boolean;
  positionId?: string;
  error?: string;
}

/**
 * Fetch historical bars for a symbol
 */
async function fetchBars(symbol: string, limit: number = 50): Promise<Bar[]> {
  const bars = await alpacaClient.getBarsV2(symbol, {
    timeframe: '5Min',
    limit,
    feed: 'iex',
  });

  const barArray: Bar[] = [];
  for await (const bar of bars) {
    barArray.push({
      Timestamp: bar.Timestamp,
      OpenPrice: bar.OpenPrice,
      HighPrice: bar.HighPrice,
      LowPrice: bar.LowPrice,
      ClosePrice: bar.ClosePrice,
      Volume: bar.Volume,
    });
  }
  return barArray;
}

/**
 * Build strategy context from market data
 */
function buildContext(
  symbol: string,
  bars: Bar[],
  regime: { regime: string; confidence: number }
): StrategyContext {
  const prices = bars.map(b => b.ClosePrice);
  const highs = bars.map(b => b.HighPrice);
  const lows = bars.map(b => b.LowPrice);
  const volumes = bars.map(b => b.Volume);
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;

  return {
    symbol,
    prices,
    highs,
    lows,
    volumes,
    currentPrice,
    regime: regime.regime as StrategyContext['regime'],
    regimeConfidence: regime.confidence,
  };
}

/**
 * Execute a single strategy against a single symbol
 */
async function executeStrategyForSymbol(
  strategyId: string,
  strategyName: string,
  strategyType: string,
  symbol: string,
  maxPositionSize: number,
  riskPerTrade: number,
): Promise<ExecutionResult> {
  try {
    const strategy = createStrategy(strategyType);

    // Fetch market data and regime in parallel
    const [bars, regimeResult] = await Promise.all([
      fetchBars(symbol),
      detectRegimeCached(symbol),
    ]);

    if (bars.length < 20) {
      return {
        strategyId,
        strategyName,
        symbol,
        action: 'hold',
        confidence: 0,
        reason: 'Insufficient bar data',
        executed: false,
      };
    }

    const context = buildContext(symbol, bars, regimeResult);
    const signal = strategy.evaluate(context);

    const result: ExecutionResult = {
      strategyId,
      strategyName,
      symbol,
      action: signal.action,
      confidence: signal.confidence,
      reason: signal.reason,
      executed: false,
    };

    if (signal.action === 'hold' || signal.confidence < 0.4) {
      return result;
    }

    // Calculate position size from capital allocation
    const quantity = Math.max(
      1,
      Math.floor(maxPositionSize * riskPerTrade / context.currentPrice)
    );

    const tradeRequest: TradeRequest = {
      symbol,
      side: signal.action,
      quantity,
      entryPrice: context.currentPrice,
      takeProfitPct: signal.suggestedTakeProfitPct,
      stopLossPct: signal.suggestedStopLossPct,
    };

    const tradeResult = await createManagedPosition(tradeRequest);

    if (tradeResult.skipped) {
      result.reason = `Signal: ${signal.reason}. Skipped: ${tradeResult.reason}`;
      return result;
    }

    // Link position to strategy
    if (tradeResult.position) {
      await prisma.managedPosition.update({
        where: { id: tradeResult.position.id },
        data: { strategyId },
      });
      result.executed = true;
      result.positionId = tradeResult.position.id;
    }

    return result;
  } catch (error) {
    log.error('Strategy execution failed', {
      strategyId,
      symbol,
      ...serializeError(error),
    });
    return {
      strategyId,
      strategyName,
      symbol,
      action: 'hold',
      confidence: 0,
      reason: `Error: ${error instanceof Error ? error.message : String(error)}`,
      executed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute all enabled strategies
 */
export async function executeStrategies(): Promise<ExecutionResult[]> {
  const strategies = await prisma.strategy.findMany({
    where: { enabled: true },
  });

  if (strategies.length === 0) {
    log.info('No enabled strategies to execute');
    return [];
  }

  const results: ExecutionResult[] = [];

  for (const strategy of strategies) {
    if (strategy.type === 'manual') continue;

    for (const symbol of strategy.symbols) {
      const result = await executeStrategyForSymbol(
        strategy.id,
        strategy.name,
        strategy.type,
        symbol,
        strategy.maxPositionSize,
        strategy.riskPerTrade,
      );
      results.push(result);
    }
  }

  log.info('Strategy execution complete', {
    total: results.length,
    executed: results.filter(r => r.executed).length,
  });

  return results;
}

/**
 * Execute a single strategy by ID
 */
export async function executeSingleStrategy(strategyId: string): Promise<ExecutionResult[]> {
  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
  if (!strategy) throw new Error(`Strategy not found: ${strategyId}`);
  if (strategy.type === 'manual') throw new Error('Cannot auto-execute manual strategies');

  const results: ExecutionResult[] = [];

  for (const symbol of strategy.symbols) {
    const result = await executeStrategyForSymbol(
      strategy.id,
      strategy.name,
      strategy.type,
      symbol,
      strategy.maxPositionSize,
      strategy.riskPerTrade,
    );
    results.push(result);
  }

  return results;
}

/**
 * Update strategy performance when a position closes.
 * Called from trade-manager closePosition.
 */
export async function onPositionClosed(
  positionId: string,
  pnl: number,
): Promise<void> {
  const position = await prisma.managedPosition.findUnique({
    where: { id: positionId },
    select: { strategyId: true },
  });

  if (position?.strategyId) {
    await updateStrategyPerformance(position.strategyId, pnl, pnl > 0);
  }
}
