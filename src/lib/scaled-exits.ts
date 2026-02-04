/**
 * Scaled Exit Service
 * 
 * Implements:
 * - Multiple take-profit targets with different quantities
 * - Percentage-based exit levels
 * - Trailing take-profit for runners
 * - Position-specific exit plans
 */

import { prisma } from './db';
import { getLatestQuote, getPositions, submitOrder, AlpacaPosition } from './alpaca';

export interface ExitTarget {
  targetPercent: number;     // Profit % at which to exit (e.g., 5 for +5%)
  quantityPercent: number;   // % of position to exit (e.g., 50 for 50% of position)
  triggered: boolean;        // Has this target been hit?
  orderId?: string;          // Order ID when triggered
  triggeredAt?: Date;
  fillPrice?: number;
}

export interface ScaledExitPlan {
  id: string;
  symbol: string;
  entryPrice: number;
  totalQuantity: number;
  remainingQuantity: number;
  targets: ExitTarget[];
  trailingTakeProfit?: {
    activationPercent: number;   // Activate trailing after X% profit
    trailPercent: number;        // Trail by X%
    highWaterMark: number;
    activated: boolean;
  };
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScaledExitRequest {
  symbol: string;
  entryPrice: number;
  totalQuantity: number;
  targets: Array<{
    targetPercent: number;
    quantityPercent: number;
  }>;
  trailingTakeProfit?: {
    activationPercent: number;
    trailPercent: number;
  };
}

export interface ScaledExitMonitorResult {
  plansChecked: number;
  targetsTriggered: number;
  trailingTriggered: number;
  errors: string[];
  executions: Array<{
    planId: string;
    symbol: string;
    targetPercent: number;
    quantity: number;
    price: number;
    orderId?: string;
  }>;
}

// In-memory store for scaled exit plans (in production, use a database table)
const scaledExitPlans: Map<string, ScaledExitPlan> = new Map();

/**
 * Create a scaled exit plan for a position
 * 
 * Example: Sell 50% at +5%, 25% at +10%, 25% with trailing stop after +15%
 * 
 * targets: [
 *   { targetPercent: 5, quantityPercent: 50 },
 *   { targetPercent: 10, quantityPercent: 25 }
 * ]
 * trailingTakeProfit: { activationPercent: 15, trailPercent: 3 }
 */
export async function createScaledExitPlan(request: CreateScaledExitRequest): Promise<ScaledExitPlan> {
  const { symbol, entryPrice, totalQuantity, targets, trailingTakeProfit } = request;
  
  // Validate inputs
  if (targets.length === 0 && !trailingTakeProfit) {
    throw new Error('Must specify at least one target or trailing take-profit');
  }
  
  // Validate total quantity percentages
  const totalPercent = targets.reduce((sum, t) => sum + t.quantityPercent, 0);
  if (trailingTakeProfit) {
    // If trailing TP, remaining percent is for trailing
    if (totalPercent >= 100) {
      throw new Error('Total target percentages must be less than 100% when using trailing take-profit');
    }
  } else {
    // Without trailing, should sum to 100% or less
    if (totalPercent > 100) {
      throw new Error('Total target percentages cannot exceed 100%');
    }
  }
  
  // Validate target percentages are in ascending order
  for (let i = 1; i < targets.length; i++) {
    if (targets[i].targetPercent <= targets[i - 1].targetPercent) {
      throw new Error('Target percentages must be in ascending order');
    }
  }
  
  // Create the plan
  const planId = `sep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const plan: ScaledExitPlan = {
    id: planId,
    symbol: symbol.toUpperCase(),
    entryPrice,
    totalQuantity,
    remainingQuantity: totalQuantity,
    targets: targets.map(t => ({
      targetPercent: t.targetPercent,
      quantityPercent: t.quantityPercent,
      triggered: false,
    })),
    trailingTakeProfit: trailingTakeProfit ? {
      activationPercent: trailingTakeProfit.activationPercent,
      trailPercent: trailingTakeProfit.trailPercent,
      highWaterMark: entryPrice,
      activated: false,
    } : undefined,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  // Store the plan
  scaledExitPlans.set(planId, plan);
  
  // Create automation rules for each target
  for (const target of targets) {
    const quantity = Math.floor(totalQuantity * (target.quantityPercent / 100));
    
    await prisma.automationRule.create({
      data: {
        symbol: symbol.toUpperCase(),
        name: `Scaled Exit +${target.targetPercent}% - ${symbol}`,
        ruleType: 'TAKE_PROFIT',
        triggerType: 'PERCENT_GAIN',
        triggerValue: target.targetPercent,
        orderSide: 'sell',
        orderType: 'market',
        quantity,
        entryPrice,
        positionId: planId,
        enabled: true,
        status: 'active',
      },
    });
  }
  
  // Create alert for the plan
  await prisma.alert.create({
    data: {
      positionId: planId,
      type: 'SCALED_EXIT_CREATED',
      message: `Scaled exit plan created for ${symbol}: ${targets.length} targets${trailingTakeProfit ? ' + trailing TP' : ''}`,
      triggered: false,
    },
  });
  
  return plan;
}

/**
 * Get all active scaled exit plans
 */
export function getActiveScaledExitPlans(symbol?: string): ScaledExitPlan[] {
  const plans = Array.from(scaledExitPlans.values()).filter(p => p.status === 'active');
  if (symbol) {
    return plans.filter(p => p.symbol === symbol.toUpperCase());
  }
  return plans;
}

/**
 * Get a specific scaled exit plan
 */
export function getScaledExitPlan(planId: string): ScaledExitPlan | undefined {
  return scaledExitPlans.get(planId);
}

/**
 * Monitor and execute scaled exits
 * Should be called periodically (e.g., every few seconds during market hours)
 */
export async function monitorScaledExits(): Promise<ScaledExitMonitorResult> {
  const result: ScaledExitMonitorResult = {
    plansChecked: 0,
    targetsTriggered: 0,
    trailingTriggered: 0,
    errors: [],
    executions: [],
  };
  
  const activePlans = getActiveScaledExitPlans();
  result.plansChecked = activePlans.length;
  
  if (activePlans.length === 0) {
    return result;
  }
  
  // Get current prices for all symbols
  const symbols = [...new Set(activePlans.map(p => p.symbol))];
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
  
  // Process each plan
  for (const plan of activePlans) {
    const currentPrice = prices[plan.symbol];
    if (!currentPrice) continue;
    
    // Note: position could be used for validation but is kept for future enhancement
    const _position = positionMap.get(plan.symbol);
    const currentProfitPct = ((currentPrice - plan.entryPrice) / plan.entryPrice) * 100;
    
    // Check each untriggered target
    for (const target of plan.targets) {
      if (target.triggered) continue;
      
      if (currentProfitPct >= target.targetPercent) {
        // Target hit! Execute the exit
        try {
          const quantity = Math.floor(plan.totalQuantity * (target.quantityPercent / 100));
          
          if (quantity > 0 && quantity <= plan.remainingQuantity) {
            const order = await submitOrder({
              symbol: plan.symbol,
              qty: quantity,
              side: 'sell',
              type: 'market',
              time_in_force: 'day',
            });
            
            target.triggered = true;
            target.orderId = order.id;
            target.triggeredAt = new Date();
            target.fillPrice = currentPrice;
            plan.remainingQuantity -= quantity;
            plan.updatedAt = new Date();
            
            result.targetsTriggered++;
            result.executions.push({
              planId: plan.id,
              symbol: plan.symbol,
              targetPercent: target.targetPercent,
              quantity,
              price: currentPrice,
              orderId: order.id,
            });
            
            // Create alert
            await prisma.alert.create({
              data: {
                positionId: plan.id,
                type: 'SCALED_EXIT_TRIGGERED',
                message: `Scaled exit triggered: Sold ${quantity} ${plan.symbol} at $${currentPrice.toFixed(2)} (+${target.targetPercent}% target)`,
                triggered: true,
                triggeredAt: new Date(),
              },
            });
            
            // Update automation rule
            await prisma.automationRule.updateMany({
              where: {
                positionId: plan.id,
                triggerValue: target.targetPercent,
                status: 'active',
              },
              data: {
                status: 'triggered',
                triggeredAt: new Date(),
                orderId: order.id,
              },
            });
          }
        } catch (error) {
          result.errors.push(`Failed to execute scaled exit for ${plan.symbol} at +${target.targetPercent}%: ${error}`);
        }
      }
    }
    
    // Check trailing take-profit
    if (plan.trailingTakeProfit && plan.remainingQuantity > 0) {
      const ttp = plan.trailingTakeProfit;
      
      // Check if should activate
      if (!ttp.activated && currentProfitPct >= ttp.activationPercent) {
        ttp.activated = true;
        ttp.highWaterMark = currentPrice;
        
        await prisma.alert.create({
          data: {
            positionId: plan.id,
            type: 'TRAILING_TP_ACTIVATED',
            message: `Trailing take-profit activated for ${plan.symbol} at $${currentPrice.toFixed(2)} (+${currentProfitPct.toFixed(2)}%)`,
            triggered: true,
            triggeredAt: new Date(),
          },
        });
      }
      
      if (ttp.activated) {
        // Update high-water mark
        if (currentPrice > ttp.highWaterMark) {
          ttp.highWaterMark = currentPrice;
        }
        
        // Calculate trailing stop price
        const trailingStopPrice = ttp.highWaterMark * (1 - ttp.trailPercent / 100);
        
        // Check if trailing stop triggered
        if (currentPrice <= trailingStopPrice) {
          try {
            const order = await submitOrder({
              symbol: plan.symbol,
              qty: plan.remainingQuantity,
              side: 'sell',
              type: 'market',
              time_in_force: 'day',
            });
            
            result.trailingTriggered++;
            result.executions.push({
              planId: plan.id,
              symbol: plan.symbol,
              targetPercent: -1, // Indicates trailing stop
              quantity: plan.remainingQuantity,
              price: currentPrice,
              orderId: order.id,
            });
            
            plan.remainingQuantity = 0;
            plan.status = 'completed';
            plan.updatedAt = new Date();
            
            await prisma.alert.create({
              data: {
                positionId: plan.id,
                type: 'TRAILING_TP_TRIGGERED',
                message: `Trailing take-profit triggered for ${plan.symbol}: Sold remaining position at $${currentPrice.toFixed(2)} (HWM: $${ttp.highWaterMark.toFixed(2)})`,
                triggered: true,
                triggeredAt: new Date(),
              },
            });
          } catch (error) {
            result.errors.push(`Failed to execute trailing TP for ${plan.symbol}: ${error}`);
          }
        }
      }
    }
    
    // Check if plan is completed (all targets triggered and no remaining quantity)
    if (plan.remainingQuantity === 0) {
      plan.status = 'completed';
    }
  }
  
  return result;
}

/**
 * Cancel a scaled exit plan
 */
export async function cancelScaledExitPlan(planId: string): Promise<void> {
  const plan = scaledExitPlans.get(planId);
  if (!plan) {
    throw new Error('Scaled exit plan not found');
  }
  
  plan.status = 'cancelled';
  plan.updatedAt = new Date();
  
  // Cancel associated automation rules
  await prisma.automationRule.updateMany({
    where: { positionId: planId, status: 'active' },
    data: { status: 'cancelled', enabled: false },
  });
  
  await prisma.alert.create({
    data: {
      positionId: planId,
      type: 'SCALED_EXIT_CANCELLED',
      message: `Scaled exit plan cancelled for ${plan.symbol}`,
      triggered: false,
    },
  });
}

/**
 * Update a scaled exit plan (add/modify targets)
 */
export function updateScaledExitPlan(
  planId: string,
  updates: {
    addTargets?: Array<{ targetPercent: number; quantityPercent: number }>;
    removeTargetPercent?: number;
    updateTrailing?: { activationPercent?: number; trailPercent?: number };
  }
): ScaledExitPlan {
  const plan = scaledExitPlans.get(planId);
  if (!plan) {
    throw new Error('Scaled exit plan not found');
  }
  
  if (plan.status !== 'active') {
    throw new Error('Cannot update a completed or cancelled plan');
  }
  
  // Add new targets
  if (updates.addTargets) {
    for (const newTarget of updates.addTargets) {
      plan.targets.push({
        targetPercent: newTarget.targetPercent,
        quantityPercent: newTarget.quantityPercent,
        triggered: false,
      });
    }
    // Re-sort targets by targetPercent
    plan.targets.sort((a, b) => a.targetPercent - b.targetPercent);
  }
  
  // Remove a target
  if (updates.removeTargetPercent !== undefined) {
    plan.targets = plan.targets.filter(t => t.targetPercent !== updates.removeTargetPercent || t.triggered);
  }
  
  // Update trailing config
  if (updates.updateTrailing && plan.trailingTakeProfit) {
    if (updates.updateTrailing.activationPercent !== undefined) {
      plan.trailingTakeProfit.activationPercent = updates.updateTrailing.activationPercent;
    }
    if (updates.updateTrailing.trailPercent !== undefined) {
      plan.trailingTakeProfit.trailPercent = updates.updateTrailing.trailPercent;
    }
  }
  
  plan.updatedAt = new Date();
  return plan;
}

/**
 * Get execution history for a plan
 */
export async function getScaledExitHistory(planId: string): Promise<Array<{
  id: string;
  type: string;
  message: string;
  triggeredAt: Date | null;
}>> {
  const alerts = await prisma.alert.findMany({
    where: { positionId: planId },
    orderBy: { createdAt: 'desc' },
  });
  
  return alerts.map(a => ({
    id: a.id,
    type: a.type,
    message: a.message,
    triggeredAt: a.triggeredAt,
  }));
}

/**
 * Create preset scaled exit plans
 */
export const ScaledExitPresets = {
  /**
   * Conservative: Quick partial profits, small runner
   * 50% at +3%, 30% at +5%, 20% trailing after +8%
   */
  conservative: (symbol: string, entryPrice: number, totalQuantity: number) =>
    createScaledExitPlan({
      symbol,
      entryPrice,
      totalQuantity,
      targets: [
        { targetPercent: 3, quantityPercent: 50 },
        { targetPercent: 5, quantityPercent: 30 },
      ],
      trailingTakeProfit: { activationPercent: 8, trailPercent: 2 },
    }),
  
  /**
   * Balanced: Equal portions at different levels
   * 33% at +5%, 33% at +10%, 34% trailing after +15%
   */
  balanced: (symbol: string, entryPrice: number, totalQuantity: number) =>
    createScaledExitPlan({
      symbol,
      entryPrice,
      totalQuantity,
      targets: [
        { targetPercent: 5, quantityPercent: 33 },
        { targetPercent: 10, quantityPercent: 33 },
      ],
      trailingTakeProfit: { activationPercent: 15, trailPercent: 3 },
    }),
  
  /**
   * Aggressive: Let winners run
   * 25% at +5%, 25% at +10%, 50% trailing after +20%
   */
  aggressive: (symbol: string, entryPrice: number, totalQuantity: number) =>
    createScaledExitPlan({
      symbol,
      entryPrice,
      totalQuantity,
      targets: [
        { targetPercent: 5, quantityPercent: 25 },
        { targetPercent: 10, quantityPercent: 25 },
      ],
      trailingTakeProfit: { activationPercent: 20, trailPercent: 5 },
    }),
  
  /**
   * Day Trade: Quick exits, no runners
   * 50% at +1%, 50% at +2%
   */
  dayTrade: (symbol: string, entryPrice: number, totalQuantity: number) =>
    createScaledExitPlan({
      symbol,
      entryPrice,
      totalQuantity,
      targets: [
        { targetPercent: 1, quantityPercent: 50 },
        { targetPercent: 2, quantityPercent: 50 },
      ],
    }),
};
