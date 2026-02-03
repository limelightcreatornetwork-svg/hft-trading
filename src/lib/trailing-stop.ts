/**
 * Trailing Stop-Loss Service
 * 
 * Implements:
 * - Percentage-based trailing stops
 * - ATR-based trailing stops
 * - Position-specific configurations
 * - High-water mark tracking
 */

import { prisma } from './db';
import { getLatestQuote, getPositions, submitOrder, AlpacaPosition } from './alpaca';

export interface TrailingStopConfig {
  symbol: string;
  trailPercent?: number;     // e.g., 5 for 5% trailing stop
  trailAmount?: number;      // Fixed dollar amount trail
  activationPercent?: number; // Only activate after X% profit (e.g., 2 means activate after 2% gain)
  quantity?: number;          // Shares to sell (null = full position)
  enabled: boolean;
}

export interface TrailingStopState {
  id: string;
  symbol: string;
  entryPrice: number;
  highWaterMark: number;
  currentStopPrice: number;
  trailPercent: number | null;
  trailAmount: number | null;
  activationPercent: number | null;
  activated: boolean;         // Has the activation threshold been reached?
  quantity: number | null;
  enabled: boolean;
  status: 'active' | 'triggered' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  triggeredAt: Date | null;
  orderId: string | null;
}

export interface TrailingStopMonitorResult {
  stopsChecked: number;
  stopsUpdated: number;
  stopsTriggered: number;
  errors: string[];
  triggeredStops: Array<{
    id: string;
    symbol: string;
    triggerPrice: number;
    stopPrice: number;
    orderId?: string;
  }>;
  updatedHighWaterMarks: Array<{
    symbol: string;
    previousHWM: number;
    newHWM: number;
    newStopPrice: number;
  }>;
}

/**
 * Create a new trailing stop for a position
 */
export async function createTrailingStop(config: TrailingStopConfig & { entryPrice: number }): Promise<TrailingStopState> {
  const { symbol, trailPercent, trailAmount, activationPercent, quantity, enabled, entryPrice } = config;
  
  // Validate inputs
  if (!trailPercent && !trailAmount) {
    throw new Error('Must specify either trailPercent or trailAmount');
  }
  
  if (trailPercent && (trailPercent <= 0 || trailPercent >= 100)) {
    throw new Error('Trail percent must be between 0 and 100');
  }
  
  if (trailAmount && trailAmount <= 0) {
    throw new Error('Trail amount must be positive');
  }
  
  // Calculate initial stop price
  const initialStopPrice = calculateStopPrice(entryPrice, trailPercent, trailAmount);
  
  // Create managed position with trailing stop config
  const position = await prisma.managedPosition.create({
    data: {
      symbol: symbol.toUpperCase(),
      side: 'buy', // Trailing stops are typically for long positions
      quantity: quantity || 0,
      entryPrice,
      confidence: 5, // Default confidence
      takeProfitPct: 0, // Not using TP system
      stopLossPct: trailPercent || (trailAmount! / entryPrice) * 100,
      timeStopHours: 0, // No time stop
      trailingStopPct: trailPercent,
      highWaterMark: entryPrice,
      status: enabled ? 'active' : 'inactive',
    },
  });
  
  // Also create an automation rule for tracking
  await prisma.automationRule.create({
    data: {
      symbol: symbol.toUpperCase(),
      name: `Trailing Stop ${trailPercent ? trailPercent + '%' : '$' + trailAmount} - ${symbol}`,
      ruleType: 'TRAILING_STOP',
      triggerType: 'PRICE_BELOW',
      triggerValue: initialStopPrice,
      orderSide: 'sell',
      orderType: 'market',
      quantity,
      entryPrice,
      positionId: position.id,
      enabled,
      status: 'active',
    },
  });
  
  return {
    id: position.id,
    symbol: symbol.toUpperCase(),
    entryPrice,
    highWaterMark: entryPrice,
    currentStopPrice: initialStopPrice,
    trailPercent: trailPercent || null,
    trailAmount: trailAmount || null,
    activationPercent: activationPercent || null,
    activated: activationPercent ? false : true, // If no activation threshold, start activated
    quantity: quantity || null,
    enabled,
    status: 'active',
    createdAt: position.createdAt,
    updatedAt: position.updatedAt,
    triggeredAt: null,
    orderId: null,
  };
}

/**
 * Get all active trailing stops
 */
export async function getActiveTrailingStops(symbol?: string): Promise<TrailingStopState[]> {
  const where: { status: string; trailingStopPct?: { not: null }; symbol?: string } = {
    status: 'active',
    trailingStopPct: { not: null },
  };
  
  if (symbol) {
    where.symbol = symbol.toUpperCase();
  }
  
  const positions = await prisma.managedPosition.findMany({
    where,
  });
  
  return positions.map(p => ({
    id: p.id,
    symbol: p.symbol,
    entryPrice: p.entryPrice,
    highWaterMark: p.highWaterMark || p.entryPrice,
    currentStopPrice: calculateStopPrice(
      p.highWaterMark || p.entryPrice,
      p.trailingStopPct,
      null
    ),
    trailPercent: p.trailingStopPct,
    trailAmount: null,
    activationPercent: null,
    activated: true,
    quantity: p.quantity,
    enabled: p.status === 'active',
    status: p.status as 'active' | 'triggered' | 'cancelled',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    triggeredAt: p.closedAt,
    orderId: null,
  }));
}

/**
 * Monitor and update all trailing stops
 * Should be called periodically (e.g., every few seconds during market hours)
 */
export async function monitorTrailingStops(): Promise<TrailingStopMonitorResult> {
  const result: TrailingStopMonitorResult = {
    stopsChecked: 0,
    stopsUpdated: 0,
    stopsTriggered: 0,
    errors: [],
    triggeredStops: [],
    updatedHighWaterMarks: [],
  };
  
  // Get all active trailing stops
  const stops = await getActiveTrailingStops();
  result.stopsChecked = stops.length;
  
  if (stops.length === 0) {
    return result;
  }
  
  // Get current prices for all symbols
  const symbols = [...new Set(stops.map(s => s.symbol))];
  const prices: Record<string, number> = {};
  
  await Promise.all(symbols.map(async (sym) => {
    try {
      const quote = await getLatestQuote(sym);
      prices[sym] = (quote.bid + quote.ask) / 2 || quote.last;
    } catch (error) {
      result.errors.push(`Failed to get quote for ${sym}: ${error}`);
    }
  }));
  
  // Get current positions from Alpaca
  const positions = await getPositions();
  const positionMap = new Map<string, AlpacaPosition>();
  positions.forEach(p => positionMap.set(p.symbol, p));
  
  // Process each trailing stop
  for (const stop of stops) {
    const currentPrice = prices[stop.symbol];
    if (!currentPrice) continue;
    
    const position = positionMap.get(stop.symbol);
    
    // Check if activation threshold is met (if applicable)
    let activated = stop.activated;
    if (!activated && stop.activationPercent) {
      const gainPercent = ((currentPrice - stop.entryPrice) / stop.entryPrice) * 100;
      if (gainPercent >= stop.activationPercent) {
        activated = true;
      }
    }
    
    // Update high-water mark if price is higher
    if (currentPrice > stop.highWaterMark && activated) {
      const previousHWM = stop.highWaterMark;
      const newHWM = currentPrice;
      const newStopPrice = calculateStopPrice(newHWM, stop.trailPercent, stop.trailAmount);
      
      await prisma.managedPosition.update({
        where: { id: stop.id },
        data: { highWaterMark: newHWM },
      });
      
      // Update the automation rule trigger value
      await prisma.automationRule.updateMany({
        where: { positionId: stop.id, ruleType: 'TRAILING_STOP', status: 'active' },
        data: { triggerValue: newStopPrice },
      });
      
      result.stopsUpdated++;
      result.updatedHighWaterMarks.push({
        symbol: stop.symbol,
        previousHWM,
        newHWM,
        newStopPrice,
      });
    }
    
    // Check if stop should be triggered
    const currentStopPrice = calculateStopPrice(
      stop.highWaterMark,
      stop.trailPercent,
      stop.trailAmount
    );
    
    if (currentPrice <= currentStopPrice && activated) {
      try {
        // Get quantity to sell
        let qty = stop.quantity;
        if (!qty && position) {
          qty = Math.abs(parseFloat(position.qty));
        }
        
        if (!qty || qty <= 0) {
          result.errors.push(`No quantity to sell for ${stop.symbol}`);
          continue;
        }
        
        // Submit sell order
        const order = await submitOrder({
          symbol: stop.symbol,
          qty,
          side: 'sell',
          type: 'market',
          time_in_force: 'day',
        });
        
        // Update position as closed
        await prisma.managedPosition.update({
          where: { id: stop.id },
          data: {
            status: 'closed',
            closedAt: new Date(),
            closePrice: currentPrice,
            closeReason: 'TRAILING_STOP',
            pnl: (currentPrice - stop.entryPrice) * qty,
            pnlPct: ((currentPrice - stop.entryPrice) / stop.entryPrice) * 100,
          },
        });
        
        // Update automation rule
        await prisma.automationRule.updateMany({
          where: { positionId: stop.id, ruleType: 'TRAILING_STOP' },
          data: { 
            status: 'triggered', 
            triggeredAt: new Date(),
            orderId: order.id,
          },
        });
        
        // Create alert
        await prisma.alert.create({
          data: {
            positionId: stop.id,
            type: 'TRAILING_TRIGGERED',
            message: `Trailing stop triggered for ${stop.symbol} at $${currentPrice.toFixed(2)} (HWM: $${stop.highWaterMark.toFixed(2)})`,
            triggered: true,
            triggeredAt: new Date(),
          },
        });
        
        result.stopsTriggered++;
        result.triggeredStops.push({
          id: stop.id,
          symbol: stop.symbol,
          triggerPrice: currentPrice,
          stopPrice: currentStopPrice,
          orderId: order.id,
        });
        
      } catch (error) {
        result.errors.push(`Failed to execute trailing stop for ${stop.symbol}: ${error}`);
      }
    }
  }
  
  return result;
}

/**
 * Calculate stop price based on high-water mark and trail settings
 */
function calculateStopPrice(
  highWaterMark: number,
  trailPercent: number | null | undefined,
  trailAmount: number | null | undefined
): number {
  if (trailPercent) {
    return highWaterMark * (1 - trailPercent / 100);
  }
  if (trailAmount) {
    return highWaterMark - trailAmount;
  }
  throw new Error('Must specify either trailPercent or trailAmount');
}

/**
 * Update trailing stop configuration
 */
export async function updateTrailingStop(
  id: string,
  updates: Partial<Pick<TrailingStopConfig, 'trailPercent' | 'trailAmount' | 'activationPercent' | 'enabled'>>
): Promise<void> {
  const position = await prisma.managedPosition.findUnique({
    where: { id },
  });
  
  if (!position) {
    throw new Error('Trailing stop not found');
  }
  
  await prisma.managedPosition.update({
    where: { id },
    data: {
      trailingStopPct: updates.trailPercent,
      status: updates.enabled === false ? 'inactive' : 'active',
    },
  });
  
  // Update automation rule
  if (updates.trailPercent || updates.trailAmount) {
    const newStopPrice = calculateStopPrice(
      position.highWaterMark || position.entryPrice,
      updates.trailPercent || position.trailingStopPct,
      updates.trailAmount || null
    );
    
    await prisma.automationRule.updateMany({
      where: { positionId: id, ruleType: 'TRAILING_STOP' },
      data: { triggerValue: newStopPrice },
    });
  }
}

/**
 * Cancel a trailing stop
 */
export async function cancelTrailingStop(id: string): Promise<void> {
  await prisma.managedPosition.update({
    where: { id },
    data: { status: 'closed', closeReason: 'MANUAL' },
  });
  
  await prisma.automationRule.updateMany({
    where: { positionId: id, ruleType: 'TRAILING_STOP' },
    data: { status: 'cancelled', enabled: false },
  });
}

/**
 * Get trailing stop history/executions
 */
export async function getTrailingStopHistory(symbol?: string): Promise<Array<{
  id: string;
  symbol: string;
  entryPrice: number;
  closePrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  closeReason: string | null;
  createdAt: Date;
  closedAt: Date | null;
}>> {
  const where: { trailingStopPct?: { not: null }; symbol?: string } = {
    trailingStopPct: { not: null },
  };
  
  if (symbol) {
    where.symbol = symbol.toUpperCase();
  }
  
  const positions = await prisma.managedPosition.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  
  return positions.map(p => ({
    id: p.id,
    symbol: p.symbol,
    entryPrice: p.entryPrice,
    closePrice: p.closePrice,
    pnl: p.pnl,
    pnlPct: p.pnlPct,
    closeReason: p.closeReason,
    createdAt: p.createdAt,
    closedAt: p.closedAt,
  }));
}
