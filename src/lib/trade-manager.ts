/**
 * Trade Manager - Handles TP/SL/Time Stops and Alerts
 * 
 * Manages:
 * - Take profit and stop loss monitoring
 * - Time-based stop outs
 * - Trailing stops
 * - Alert generation and checking
 */

import { prisma } from './db';
import alpaca, { submitOrder } from './alpaca';
import { calculateConfidence, getSuggestedLevels, ConfidenceScore } from './confidence';
import { checkIntent } from './risk-engine';
import { createLogger, serializeError } from './logger';

const log = createLogger('trade-manager');

export interface TradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  takeProfitPct?: number;   // Override default
  stopLossPct?: number;     // Override default
  timeStopHours?: number;   // Override default (4 hours)
  trailingStopPct?: number; // Optional trailing stop
  skipRiskCheck?: boolean;
  skipRegimeCheck?: boolean;
}

export interface ManagedPositionWithAlerts {
  id: string;
  symbol: string;
  side: string;
  quantity: number;
  entryPrice: number;
  confidence: number;
  takeProfitPct: number;
  stopLossPct: number;
  takeProfitPrice: number;
  stopLossPrice: number;
  timeStopHours: number;
  trailingStopPct: number | null;
  highWaterMark: number | null;
  enteredAt: Date;
  status: string;
  hoursRemaining: number;
  currentPrice?: number;
  currentPnl?: number;
  currentPnlPct?: number;
  alerts: {
    id: string;
    type: string;
    message: string;
    triggered: boolean;
    triggeredAt: Date | null;
  }[];
}

export interface AlertCheckResult {
  positionId: string;
  symbol: string;
  alerts: {
    type: string;
    message: string;
    triggered: boolean;
  }[];
}

// Default time stop (hours)
const DEFAULT_TIME_STOP_HOURS = 4;

/**
 * Result type for createManagedPosition - uses discriminated union for type safety
 */
export type CreateManagedPositionResult = 
  | {
      position: ManagedPositionWithAlerts;
      confidence: ConfidenceScore;
      skipped: false;
      reason?: never;
    }
  | {
      position: null;
      confidence: ConfidenceScore;
      skipped: true;
      reason: string;
    };

/**
 * Create a managed position with confidence scoring
 */
export async function createManagedPosition(request: TradeRequest): Promise<CreateManagedPositionResult> {
  // Calculate confidence score
  const confidence = await calculateConfidence({
    symbol: request.symbol,
    side: request.side,
    entryPrice: request.entryPrice,
  });
  
  // Skip if confidence is too low
  if (confidence.recommendation === 'SKIP') {
    return {
      position: null,
      confidence,
      skipped: true,
      reason: `Trade skipped due to low confidence (${confidence.total}/10): ${confidence.reasoning.join(', ')}`,
    };
  }
  
  // Get suggested TP/SL levels if not provided
  const suggestedLevels = await getSuggestedLevels(request.symbol, request.entryPrice, request.side);
  
  const takeProfitPct = request.takeProfitPct ?? suggestedLevels.takeProfitPct;
  const stopLossPct = request.stopLossPct ?? suggestedLevels.stopLossPct;
  const timeStopHours = request.timeStopHours ?? DEFAULT_TIME_STOP_HOURS;

  // Run risk checks unless explicitly skipped
  if (!request.skipRiskCheck) {
    const riskResult = await checkIntent({
      symbol: request.symbol.toUpperCase(),
      side: request.side,
      quantity: request.quantity,
      orderType: 'market',
      limitPrice: undefined,
      strategy: 'managed',
      skipRegimeCheck: request.skipRegimeCheck || false,
    });

    if (!riskResult.approved) {
      return {
        position: null,
        confidence,
        skipped: true,
        reason: `Trade rejected by risk engine: ${riskResult.reason || 'Unknown reason'}`,
      };
    }
  }

  // Submit the actual order to broker (market order by default)
  const order = await submitOrder({
    symbol: request.symbol.toUpperCase(),
    qty: request.quantity,
    side: request.side,
    type: 'market',
    time_in_force: 'day',
  });

  // Record intent + order for strategy attribution
  const intent = await prisma.intent.create({
    data: {
      symbol: request.symbol.toUpperCase(),
      side: request.side.toUpperCase(),
      quantity: request.quantity,
      orderType: 'MARKET',
      strategy: 'managed',
      status: 'EXECUTED',
    },
  });

  await prisma.order.create({
    data: {
      intentId: intent.id,
      brokerOrderId: order.id,
      symbol: order.symbol,
      side: order.side.toUpperCase(),
      quantity: parseInt(order.qty, 10),
      orderType: order.type.toUpperCase(),
      limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
      status: 'SUBMITTED',
    },
  });
  
  // Create the managed position
  const position = await prisma.managedPosition.create({
    data: {
      symbol: request.symbol.toUpperCase(),
      side: request.side,
      quantity: request.quantity,
      entryPrice: request.entryPrice,
      confidence: confidence.total,
      takeProfitPct,
      stopLossPct,
      timeStopHours,
      trailingStopPct: request.trailingStopPct || null,
      highWaterMark: request.entryPrice,
      status: 'active',
      // Store confidence breakdown
      technicalScore: confidence.technical,
      riskRewardScore: confidence.riskReward,
      marketCondScore: confidence.marketConditions,
      timeOfDayScore: confidence.timeOfDay,
    },
    include: {
      alerts: true,
    },
  });
  
  // Calculate derived values
  const multiplier = request.side === 'buy' ? 1 : -1;
  const takeProfitPrice = request.entryPrice * (1 + multiplier * takeProfitPct / 100);
  const stopLossPrice = request.entryPrice * (1 - multiplier * stopLossPct / 100);
  const hoursRemaining = timeStopHours;
  
  return {
    position: {
      ...position,
      takeProfitPrice,
      stopLossPrice,
      hoursRemaining,
    },
    confidence,
    skipped: false,
  };
}

/**
 * Get all active managed positions with current status
 */
export async function getActiveManagedPositions(): Promise<ManagedPositionWithAlerts[]> {
  const positions = await prisma.managedPosition.findMany({
    where: { status: 'active' },
    include: { alerts: true },
    orderBy: { enteredAt: 'desc' },
  });
  
  // Fetch current prices for all symbols in parallel
  const symbols = [...new Set(positions.map(p => p.symbol))];
  const prices: Record<string, number> = {};
  
  const pricePromises = symbols.map(async (symbol) => {
    try {
      const quote = await alpaca.getLatestQuote(symbol);
      return { symbol, price: (quote.BidPrice + quote.AskPrice) / 2 || quote.AskPrice || 0 };
    } catch (error) {
      log.error('Error fetching price', { symbol, ...serializeError(error) });
      return { symbol, price: 0 };
    }
  });
  
  const priceResults = await Promise.all(pricePromises);
  priceResults.forEach(({ symbol, price }) => {
    prices[symbol] = price;
  });
  
  return positions.map(p => {
    const multiplier = p.side === 'buy' ? 1 : -1;
    const takeProfitPrice = p.entryPrice * (1 + multiplier * p.takeProfitPct / 100);
    const stopLossPrice = p.entryPrice * (1 - multiplier * p.stopLossPct / 100);
    
    const now = new Date();
    const hoursElapsed = (now.getTime() - p.enteredAt.getTime()) / (1000 * 60 * 60);
    const hoursRemaining = Math.max(0, p.timeStopHours - hoursElapsed);
    
    const currentPrice = prices[p.symbol] || p.entryPrice;
    const priceDiff = currentPrice - p.entryPrice;
    const currentPnl = priceDiff * p.quantity * multiplier;
    const currentPnlPct = (priceDiff / p.entryPrice) * 100 * multiplier;
    
    return {
      ...p,
      takeProfitPrice,
      stopLossPrice,
      hoursRemaining,
      currentPrice,
      currentPnl,
      currentPnlPct,
    };
  });
}

/**
 * Check all active positions for TP/SL/time stop triggers
 */
export async function checkAllPositions(): Promise<AlertCheckResult[]> {
  const positions = await getActiveManagedPositions();
  const results: AlertCheckResult[] = [];
  
  for (const position of positions) {
    const alerts = await checkPosition(position);
    if (alerts.length > 0) {
      results.push({
        positionId: position.id,
        symbol: position.symbol,
        alerts,
      });
    }
  }
  
  return results;
}

/** Alert entry returned by individual check functions */
interface CheckAlert {
  type: string;
  message: string;
  triggered: boolean;
}

/**
 * Check whether the take-profit level has been hit.
 */
async function checkTakeProfit(
  position: ManagedPositionWithAlerts,
  currentPrice: number,
  multiplier: number
): Promise<{ hit: boolean; alert?: CheckAlert }> {
  const tpHit = multiplier === 1
    ? currentPrice >= position.takeProfitPrice
    : currentPrice <= position.takeProfitPrice;

  if (!tpHit) return { hit: false };

  const alert = await createOrUpdateAlert(position.id, 'TP_HIT',
    `Take profit hit for ${position.symbol}! Price: $${currentPrice.toFixed(2)}, Target: $${position.takeProfitPrice.toFixed(2)}`);
  if (alert) {
    await closePosition(position.id, currentPrice, 'TP_HIT');
    return { hit: true, alert: { type: 'TP_HIT', message: alert.message, triggered: true } };
  }
  return { hit: true };
}

/**
 * Check whether the stop-loss level has been hit.
 */
async function checkStopLoss(
  position: ManagedPositionWithAlerts,
  currentPrice: number,
  multiplier: number
): Promise<{ hit: boolean; alert?: CheckAlert }> {
  const slHit = multiplier === 1
    ? currentPrice <= position.stopLossPrice
    : currentPrice >= position.stopLossPrice;

  if (!slHit) return { hit: false };

  const alert = await createOrUpdateAlert(position.id, 'SL_HIT',
    `Stop loss hit for ${position.symbol}! Price: $${currentPrice.toFixed(2)}, Stop: $${position.stopLossPrice.toFixed(2)}`);
  if (alert) {
    await closePosition(position.id, currentPrice, 'SL_HIT');
    return { hit: true, alert: { type: 'SL_HIT', message: alert.message, triggered: true } };
  }
  return { hit: true };
}

/**
 * Check whether the trailing stop has been triggered.
 * Also updates the high water mark when the price moves favorably.
 */
async function checkTrailingStop(
  position: ManagedPositionWithAlerts,
  currentPrice: number,
  multiplier: number
): Promise<{ hit: boolean; alert?: CheckAlert }> {
  if (!position.trailingStopPct || !position.highWaterMark) {
    return { hit: false };
  }

  const trailingStopPrice = position.highWaterMark * (1 - multiplier * position.trailingStopPct / 100);

  // Update high water mark if price moved favorably
  if ((multiplier === 1 && currentPrice > position.highWaterMark) ||
      (multiplier === -1 && currentPrice < position.highWaterMark)) {
    await prisma.managedPosition.update({
      where: { id: position.id },
      data: { highWaterMark: currentPrice },
    });
  }

  const trailingHit = multiplier === 1
    ? currentPrice <= trailingStopPrice
    : currentPrice >= trailingStopPrice;

  if (!trailingHit) return { hit: false };

  const alert = await createOrUpdateAlert(position.id, 'TRAILING_TRIGGERED',
    `Trailing stop triggered for ${position.symbol}! Price: $${currentPrice.toFixed(2)}, Trailing Stop: $${trailingStopPrice.toFixed(2)}`);
  if (alert) {
    await closePosition(position.id, currentPrice, 'TRAILING_STOP');
    return { hit: true, alert: { type: 'TRAILING_TRIGGERED', message: alert.message, triggered: true } };
  }
  return { hit: true };
}

/**
 * Check whether the time-based stop has been reached, or issue a warning
 * when less than 1 hour remains.
 */
async function checkTimeStop(
  position: ManagedPositionWithAlerts,
  currentPrice: number
): Promise<CheckAlert | null> {
  if (position.hoursRemaining <= 0) {
    const alert = await createOrUpdateAlert(position.id, 'TIME_STOP',
      `Time stop reached for ${position.symbol}! Position held for ${position.timeStopHours} hours without hitting TP or SL.`);
    if (alert) {
      await closePosition(position.id, currentPrice, 'TIME_STOP');
      return { type: 'TIME_STOP', message: alert.message, triggered: true };
    }
  } else if (position.hoursRemaining <= 1) {
    // Warning: less than 1 hour remaining
    const existingWarning = position.alerts.find(a => a.type === 'TIME_WARNING' && !a.triggered);
    if (!existingWarning) {
      await createOrUpdateAlert(position.id, 'TIME_WARNING',
        `Time stop warning for ${position.symbol}! ${position.hoursRemaining.toFixed(1)} hours remaining.`, false);
      return {
        type: 'TIME_WARNING',
        message: `Less than 1 hour until time stop for ${position.symbol}`,
        triggered: false,
      };
    }
  }
  return null;
}

/**
 * Check whether confidence has dropped significantly since position entry.
 */
async function checkConfidenceDrop(
  position: ManagedPositionWithAlerts
): Promise<CheckAlert | null> {
  const newConfidence = await calculateConfidence({
    symbol: position.symbol,
    side: position.side as 'buy' | 'sell',
    entryPrice: position.entryPrice,
  });

  if (newConfidence.total <= 3 && position.confidence >= 6) {
    const alert = await createOrUpdateAlert(position.id, 'REVIEW',
      `Market conditions changed for ${position.symbol}! Confidence dropped from ${position.confidence} to ${newConfidence.total}. Review position.`);
    if (alert) {
      return { type: 'REVIEW', message: alert.message, triggered: false };
    }
  }
  return null;
}

/**
 * Check a single position for triggers
 */
async function checkPosition(position: ManagedPositionWithAlerts): Promise<{
  type: string;
  message: string;
  triggered: boolean;
}[]> {
  const alerts: CheckAlert[] = [];
  const currentPrice = position.currentPrice || position.entryPrice;
  const multiplier = position.side === 'buy' ? 1 : -1;

  // Check Take Profit
  const tp = await checkTakeProfit(position, currentPrice, multiplier);
  if (tp.alert) alerts.push(tp.alert);

  // Check Stop Loss (skip if TP already hit)
  let slHit = false;
  if (!tp.hit) {
    const sl = await checkStopLoss(position, currentPrice, multiplier);
    slHit = sl.hit;
    if (sl.alert) alerts.push(sl.alert);
  }

  // Check Trailing Stop (skip if TP or SL already hit)
  if (!tp.hit && !slHit) {
    const trailing = await checkTrailingStop(position, currentPrice, multiplier);
    if (trailing.alert) alerts.push(trailing.alert);
  }

  // Check Time Stop (skip if TP or SL already hit)
  if (!tp.hit && !slHit) {
    const timeAlert = await checkTimeStop(position, currentPrice);
    if (timeAlert) alerts.push(timeAlert);
  }

  // Check for confidence drop
  const confidenceAlert = await checkConfidenceDrop(position);
  if (confidenceAlert) alerts.push(confidenceAlert);

  return alerts;
}

/**
 * Create or update an alert
 */
async function createOrUpdateAlert(
  positionId: string, 
  type: string, 
  message: string,
  triggered: boolean = true
): Promise<{ id: string; message: string } | null> {
  // Check if alert already exists and was triggered
  const existingAlert = await prisma.alert.findFirst({
    where: { 
      positionId, 
      type,
      triggered: true,
    },
  });
  
  if (existingAlert) {
    return null; // Already triggered this type of alert
  }
  
  const alert = await prisma.alert.create({
    data: {
      positionId,
      type,
      message,
      triggered,
      triggeredAt: triggered ? new Date() : null,
    },
  });
  
  return alert;
}

/**
 * Close a position
 */
async function closePosition(positionId: string, closePrice: number, reason: string): Promise<void> {
  const position = await prisma.managedPosition.findUnique({
    where: { id: positionId },
  });
  
  if (!position) return;

  // Submit close order to broker before marking closed in DB
  try {
    const closeSide = position.side === 'buy' ? 'sell' : 'buy';
    await submitOrder({
      symbol: position.symbol,
      qty: Math.abs(position.quantity),
      side: closeSide,
      type: 'market',
      time_in_force: 'day',
    });
  } catch (error) {
    log.error('Failed to submit close order', { symbol: position.symbol, ...serializeError(error) });
    return;
  }
  
  const multiplier = position.side === 'buy' ? 1 : -1;
  const priceDiff = closePrice - position.entryPrice;
  const pnl = priceDiff * position.quantity * multiplier;
  const pnlPct = (priceDiff / position.entryPrice) * 100 * multiplier;
  
  await prisma.managedPosition.update({
    where: { id: positionId },
    data: {
      status: 'closed',
      closedAt: new Date(),
      closePrice,
      closeReason: reason,
      pnl,
      pnlPct,
    },
  });

  // Update strategy performance if this position is linked to a strategy
  if (position.strategyId) {
    try {
      const { updateStrategyPerformance } = await import('./strategy-manager');
      await updateStrategyPerformance(position.strategyId, pnl, pnl > 0);
    } catch (error) {
      log.error('Failed to update strategy performance', { strategyId: position.strategyId, ...serializeError(error) });
    }
  }
}

/**
 * Get pending (untriggered) alerts
 */
export async function getPendingAlerts(): Promise<{
  id: string;
  positionId: string;
  symbol: string;
  type: string;
  message: string;
  createdAt: Date;
}[]> {
  const alerts = await prisma.alert.findMany({
    where: { 
      triggered: false,
      dismissed: false,
    },
    include: {
      position: {
        select: { symbol: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  return alerts.map(a => ({
    id: a.id,
    positionId: a.positionId,
    symbol: a.position.symbol,
    type: a.type,
    message: a.message,
    createdAt: a.createdAt,
  }));
}

/**
 * Get all alerts (including triggered)
 */
export async function getAllAlerts(limit: number = 50): Promise<{
  id: string;
  positionId: string;
  symbol: string;
  type: string;
  message: string;
  triggered: boolean;
  triggeredAt: Date | null;
  createdAt: Date;
}[]> {
  const alerts = await prisma.alert.findMany({
    where: { dismissed: false },
    include: {
      position: {
        select: { symbol: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  
  return alerts.map(a => ({
    id: a.id,
    positionId: a.positionId,
    symbol: a.position.symbol,
    type: a.type,
    message: a.message,
    triggered: a.triggered,
    triggeredAt: a.triggeredAt,
    createdAt: a.createdAt,
  }));
}

/**
 * Dismiss an alert
 */
export async function dismissAlert(alertId: string): Promise<void> {
  await prisma.alert.update({
    where: { id: alertId },
    data: { 
      dismissed: true,
      dismissedAt: new Date(),
    },
  });
}

/**
 * Manually close a position
 */
export async function manualClosePosition(positionId: string, closePrice: number): Promise<void> {
  await closePosition(positionId, closePrice, 'MANUAL');
}

/**
 * Get position history (closed positions)
 */
export async function getPositionHistory(limit: number = 50): Promise<ManagedPositionWithAlerts[]> {
  const positions = await prisma.managedPosition.findMany({
    where: { status: 'closed' },
    include: { alerts: true },
    orderBy: { closedAt: 'desc' },
    take: limit,
  });
  
  return positions.map(p => {
    const multiplier = p.side === 'buy' ? 1 : -1;
    const takeProfitPrice = p.entryPrice * (1 + multiplier * p.takeProfitPct / 100);
    const stopLossPrice = p.entryPrice * (1 - multiplier * p.stopLossPct / 100);
    
    return {
      ...p,
      takeProfitPrice,
      stopLossPrice,
      hoursRemaining: 0,
    };
  });
}

/**
 * Get trading statistics
 */
export async function getTradingStats(): Promise<{
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  avgWin: number;
  avgLoss: number;
  avgConfidence: number;
  byCloseReason: Record<string, number>;
}> {
  const closedPositions = await prisma.managedPosition.findMany({
    where: { status: 'closed' },
    select: {
      pnl: true,
      confidence: true,
      closeReason: true,
    },
  });
  
  const winningTrades = closedPositions.filter(p => (p.pnl || 0) > 0);
  const losingTrades = closedPositions.filter(p => (p.pnl || 0) <= 0);
  
  const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, p) => sum + (p.pnl || 0), 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? losingTrades.reduce((sum, p) => sum + (p.pnl || 0), 0) / losingTrades.length
    : 0;
  const avgConfidence = closedPositions.length > 0
    ? closedPositions.reduce((sum, p) => sum + p.confidence, 0) / closedPositions.length
    : 0;
  
  const byCloseReason: Record<string, number> = {};
  closedPositions.forEach(p => {
    const reason = p.closeReason || 'UNKNOWN';
    byCloseReason[reason] = (byCloseReason[reason] || 0) + 1;
  });
  
  return {
    totalTrades: closedPositions.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: closedPositions.length > 0 
      ? (winningTrades.length / closedPositions.length) * 100 
      : 0,
    totalPnl,
    avgWin,
    avgLoss,
    avgConfidence,
    byCloseReason,
  };
}
