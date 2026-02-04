/**
 * Strategy Manager - CRUD operations for trading strategies
 *
 * Manages strategy lifecycle: create, read, update, delete,
 * enable/disable, and performance tracking.
 */

import { prisma } from './db';
import { createLogger } from './logger';

const log = createLogger('strategy-manager');

export interface StrategyInput {
  name: string;
  description?: string;
  type: string;
  symbols: string[];
  entryConditions: Record<string, unknown>;
  exitConditions: Record<string, unknown>;
  positionSizing: Record<string, unknown>;
  riskParams: Record<string, unknown>;
  allocatedCapital?: number;
  maxPositionSize?: number;
  riskPerTrade?: number;
}

export interface StrategyUpdate {
  name?: string;
  description?: string;
  type?: string;
  symbols?: string[];
  entryConditions?: Record<string, unknown>;
  exitConditions?: Record<string, unknown>;
  positionSizing?: Record<string, unknown>;
  riskParams?: Record<string, unknown>;
  allocatedCapital?: number;
  maxPositionSize?: number;
  riskPerTrade?: number;
  enabled?: boolean;
}

export interface StrategyRecord {
  id: string;
  name: string;
  description: string | null;
  type: string;
  symbols: string[];
  entryConditions: unknown;
  exitConditions: unknown;
  positionSizing: unknown;
  riskParams: unknown;
  isActive: boolean;
  backtestResults: unknown;
  allocatedCapital: number;
  maxPositionSize: number;
  riskPerTrade: number;
  enabled: boolean;
  totalPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new strategy
 */
export async function createStrategy(input: StrategyInput): Promise<StrategyRecord> {
  const strategy = await prisma.strategy.create({
    data: {
      name: input.name,
      description: input.description || null,
      type: input.type,
      symbols: input.symbols.map(s => s.toUpperCase()),
      entryConditions: input.entryConditions,
      exitConditions: input.exitConditions,
      positionSizing: input.positionSizing,
      riskParams: input.riskParams,
      allocatedCapital: input.allocatedCapital ?? 10000,
      maxPositionSize: input.maxPositionSize ?? 1000,
      riskPerTrade: input.riskPerTrade ?? 0.02,
      enabled: false,
    },
  });

  log.info('Strategy created', { id: strategy.id, name: strategy.name, type: strategy.type });
  return strategy as StrategyRecord;
}

/**
 * Update an existing strategy
 */
export async function updateStrategy(id: string, update: StrategyUpdate): Promise<StrategyRecord> {
  const data: Record<string, unknown> = {};

  if (update.name !== undefined) data.name = update.name;
  if (update.description !== undefined) data.description = update.description;
  if (update.type !== undefined) data.type = update.type;
  if (update.symbols !== undefined) data.symbols = update.symbols.map(s => s.toUpperCase());
  if (update.entryConditions !== undefined) data.entryConditions = update.entryConditions;
  if (update.exitConditions !== undefined) data.exitConditions = update.exitConditions;
  if (update.positionSizing !== undefined) data.positionSizing = update.positionSizing;
  if (update.riskParams !== undefined) data.riskParams = update.riskParams;
  if (update.allocatedCapital !== undefined) data.allocatedCapital = update.allocatedCapital;
  if (update.maxPositionSize !== undefined) data.maxPositionSize = update.maxPositionSize;
  if (update.riskPerTrade !== undefined) data.riskPerTrade = update.riskPerTrade;
  if (update.enabled !== undefined) data.enabled = update.enabled;

  const strategy = await prisma.strategy.update({
    where: { id },
    data,
  });

  log.info('Strategy updated', { id: strategy.id, name: strategy.name });
  return strategy as StrategyRecord;
}

/**
 * Delete a strategy
 */
export async function deleteStrategy(id: string): Promise<void> {
  await prisma.strategy.delete({ where: { id } });
  log.info('Strategy deleted', { id });
}

/**
 * Get a single strategy by ID
 */
export async function getStrategy(id: string): Promise<StrategyRecord | null> {
  const strategy = await prisma.strategy.findUnique({ where: { id } });
  return strategy as StrategyRecord | null;
}

/**
 * List all strategies with optional filtering
 */
export async function listStrategies(options?: {
  type?: string;
  enabled?: boolean;
}): Promise<StrategyRecord[]> {
  const where: Record<string, unknown> = {};
  if (options?.type) where.type = options.type;
  if (options?.enabled !== undefined) where.enabled = options.enabled;

  const strategies = await prisma.strategy.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return strategies as StrategyRecord[];
}

/**
 * Toggle strategy enabled state
 */
export async function toggleStrategyEnabled(id: string): Promise<StrategyRecord> {
  const strategy = await prisma.strategy.findUnique({ where: { id } });
  if (!strategy) {
    throw new Error(`Strategy not found: ${id}`);
  }

  const updated = await prisma.strategy.update({
    where: { id },
    data: { enabled: !strategy.enabled },
  });

  log.info('Strategy toggled', { id, enabled: updated.enabled });
  return updated as StrategyRecord;
}

/**
 * Update strategy performance metrics after a trade closes
 */
export async function updateStrategyPerformance(
  strategyId: string,
  pnl: number,
  isWin: boolean
): Promise<void> {
  const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
  if (!strategy) {
    log.warn('Strategy not found for performance update', { strategyId });
    return;
  }

  await prisma.strategy.update({
    where: { id: strategyId },
    data: {
      totalPnl: strategy.totalPnl + pnl,
      totalTrades: strategy.totalTrades + 1,
      winningTrades: isWin ? strategy.winningTrades + 1 : strategy.winningTrades,
      losingTrades: isWin ? strategy.losingTrades : strategy.losingTrades + 1,
    },
  });

  log.info('Strategy performance updated', { strategyId, pnl, isWin });
}
