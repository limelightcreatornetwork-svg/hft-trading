/**
 * Trading Bot Automation Service
 * 
 * Handles:
 * - Automated limit order placement based on price targets
 * - Stop-loss automation (configurable % or dollar amount)
 * - Take-profit automation
 * - OCO (one-cancels-other) order support
 * - Position monitoring and trigger execution
 */

import { prisma } from './db';
import { submitOrder, getLatestQuote, getPositions, cancelOrder, AlpacaPosition } from './alpaca';

// Rule types
export type RuleType = 'LIMIT_ORDER' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'OCO' | 'TRAILING_STOP';

// Trigger types
export type TriggerType = 
  | 'PRICE_ABOVE' 
  | 'PRICE_BELOW' 
  | 'PERCENT_GAIN' 
  | 'PERCENT_LOSS' 
  | 'DOLLAR_GAIN' 
  | 'DOLLAR_LOSS';

// Rule status
export type RuleStatus = 'active' | 'triggered' | 'cancelled' | 'expired';

export interface CreateRuleRequest {
  symbol: string;
  name: string;
  ruleType: RuleType;
  triggerType: TriggerType;
  triggerValue: number;
  orderSide: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity?: number;
  limitPrice?: number;
  ocoGroupId?: string;
  positionId?: string;
  entryPrice?: number;
  expiresAt?: Date;
}

export interface AutomationRuleWithStatus {
  id: string;
  symbol: string;
  name: string;
  enabled: boolean;
  ruleType: string;
  triggerType: string;
  triggerValue: number;
  currentPrice?: number;
  triggerPrice?: number;
  distanceToTrigger?: number;
  distanceToTriggerPct?: number;
  orderSide: string;
  orderType: string;
  quantity: number | null;
  limitPrice: number | null;
  ocoGroupId: string | null;
  positionId: string | null;
  entryPrice: number | null;
  status: string;
  triggeredAt: Date | null;
  orderId: string | null;
  createdAt: Date;
  expiresAt: Date | null;
}

export interface MonitoringResult {
  rulesChecked: number;
  rulesTriggered: number;
  errors: string[];
  triggeredRules: Array<{
    ruleId: string;
    symbol: string;
    triggerType: string;
    triggerPrice: number;
    orderId?: string;
    status: string;
  }>;
}

/**
 * Create a new automation rule
 */
export async function createAutomationRule(request: CreateRuleRequest): Promise<AutomationRuleWithStatus> {
  // Validate trigger makes sense
  validateTrigger(request);
  
  const rule = await prisma.automationRule.create({
    data: {
      symbol: request.symbol.toUpperCase(),
      name: request.name,
      ruleType: request.ruleType,
      triggerType: request.triggerType,
      triggerValue: request.triggerValue,
      orderSide: request.orderSide,
      orderType: request.orderType,
      quantity: request.quantity || null,
      limitPrice: request.limitPrice || null,
      ocoGroupId: request.ocoGroupId || null,
      positionId: request.positionId || null,
      entryPrice: request.entryPrice || null,
      expiresAt: request.expiresAt || null,
      status: 'active',
      enabled: true,
    },
  });

  return {
    ...rule,
    currentPrice: undefined,
    triggerPrice: undefined,
    distanceToTrigger: undefined,
    distanceToTriggerPct: undefined,
  };
}

/**
 * Create an OCO (One-Cancels-Other) rule pair
 * Creates both stop-loss and take-profit that cancel each other when one triggers
 */
export async function createOCORule(params: {
  symbol: string;
  quantity: number;
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  usePercent?: boolean;
  stopLossPct?: number;
  takeProfitPct?: number;
}): Promise<{ stopLoss: AutomationRuleWithStatus; takeProfit: AutomationRuleWithStatus; ocoGroupId: string }> {
  const ocoGroupId = `oco_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Determine if selling (long position) or buying (short position)
  const isLongPosition = params.takeProfitPrice > params.entryPrice;
  const orderSide = isLongPosition ? 'sell' : 'buy';
  
  // Create stop loss rule
  const stopLoss = await createAutomationRule({
    symbol: params.symbol,
    name: `OCO Stop Loss - ${params.symbol}`,
    ruleType: 'OCO',
    triggerType: isLongPosition ? 'PRICE_BELOW' : 'PRICE_ABOVE',
    triggerValue: params.stopLossPrice,
    orderSide: orderSide as 'buy' | 'sell',
    orderType: 'market',
    quantity: params.quantity,
    ocoGroupId,
    entryPrice: params.entryPrice,
  });

  // Create take profit rule
  const takeProfit = await createAutomationRule({
    symbol: params.symbol,
    name: `OCO Take Profit - ${params.symbol}`,
    ruleType: 'OCO',
    triggerType: isLongPosition ? 'PRICE_ABOVE' : 'PRICE_BELOW',
    triggerValue: params.takeProfitPrice,
    orderSide: orderSide as 'buy' | 'sell',
    orderType: 'market',
    quantity: params.quantity,
    ocoGroupId,
    entryPrice: params.entryPrice,
  });

  return { stopLoss, takeProfit, ocoGroupId };
}

/**
 * Create a stop-loss rule (configurable by % or $)
 */
export async function createStopLossRule(params: {
  symbol: string;
  quantity?: number;
  entryPrice: number;
  stopLossAmount: number;
  isPercent: boolean; // true = %, false = $
  positionSide: 'long' | 'short';
}): Promise<AutomationRuleWithStatus> {
  const { symbol, quantity, entryPrice, stopLossAmount, isPercent, positionSide } = params;
  
  let triggerPrice: number;
  let triggerType: TriggerType;
  
  if (positionSide === 'long') {
    // Long position: stop loss triggers when price drops
    if (isPercent) {
      triggerPrice = entryPrice * (1 - stopLossAmount / 100);
      triggerType = 'PERCENT_LOSS';
    } else {
      triggerPrice = entryPrice - stopLossAmount;
      triggerType = 'DOLLAR_LOSS';
    }
  } else {
    // Short position: stop loss triggers when price rises
    if (isPercent) {
      triggerPrice = entryPrice * (1 + stopLossAmount / 100);
      triggerType = 'PERCENT_LOSS';
    } else {
      triggerPrice = entryPrice + stopLossAmount;
      triggerType = 'DOLLAR_LOSS';
    }
  }
  
  return createAutomationRule({
    symbol,
    name: `Stop Loss ${isPercent ? stopLossAmount + '%' : '$' + stopLossAmount} - ${symbol}`,
    ruleType: 'STOP_LOSS',
    triggerType,
    triggerValue: isPercent ? stopLossAmount : triggerPrice,
    orderSide: positionSide === 'long' ? 'sell' : 'buy',
    orderType: 'market',
    quantity,
    entryPrice,
  });
}

/**
 * Create a take-profit rule (configurable by % or $)
 */
export async function createTakeProfitRule(params: {
  symbol: string;
  quantity?: number;
  entryPrice: number;
  takeProfitAmount: number;
  isPercent: boolean;
  positionSide: 'long' | 'short';
}): Promise<AutomationRuleWithStatus> {
  const { symbol, quantity, entryPrice, takeProfitAmount, isPercent, positionSide } = params;
  
  let triggerPrice: number;
  let triggerType: TriggerType;
  
  if (positionSide === 'long') {
    if (isPercent) {
      triggerPrice = entryPrice * (1 + takeProfitAmount / 100);
      triggerType = 'PERCENT_GAIN';
    } else {
      triggerPrice = entryPrice + takeProfitAmount;
      triggerType = 'DOLLAR_GAIN';
    }
  } else {
    if (isPercent) {
      triggerPrice = entryPrice * (1 - takeProfitAmount / 100);
      triggerType = 'PERCENT_GAIN';
    } else {
      triggerPrice = entryPrice - takeProfitAmount;
      triggerType = 'DOLLAR_GAIN';
    }
  }
  
  return createAutomationRule({
    symbol,
    name: `Take Profit ${isPercent ? takeProfitAmount + '%' : '$' + takeProfitAmount} - ${symbol}`,
    ruleType: 'TAKE_PROFIT',
    triggerType,
    triggerValue: isPercent ? takeProfitAmount : triggerPrice,
    orderSide: positionSide === 'long' ? 'sell' : 'buy',
    orderType: 'market',
    quantity,
    entryPrice,
  });
}

/**
 * Create a limit order rule (triggers at price target)
 */
export async function createLimitOrderRule(params: {
  symbol: string;
  quantity: number;
  targetPrice: number;
  orderSide: 'buy' | 'sell';
  limitPrice?: number; // If not provided, uses market order at trigger
}): Promise<AutomationRuleWithStatus> {
  const triggerType: TriggerType = params.orderSide === 'buy' ? 'PRICE_BELOW' : 'PRICE_ABOVE';
  
  return createAutomationRule({
    symbol: params.symbol,
    name: `Limit Order @ $${params.targetPrice} - ${params.symbol}`,
    ruleType: 'LIMIT_ORDER',
    triggerType,
    triggerValue: params.targetPrice,
    orderSide: params.orderSide,
    orderType: params.limitPrice ? 'limit' : 'market',
    quantity: params.quantity,
    limitPrice: params.limitPrice,
  });
}

/**
 * Get all active automation rules with current status
 */
export async function getActiveRules(symbol?: string): Promise<AutomationRuleWithStatus[]> {
  const where: { status: string; symbol?: string } = { status: 'active' };
  if (symbol) where.symbol = symbol.toUpperCase();
  
  const rules = await prisma.automationRule.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  // Fetch current prices for all symbols
  const symbols = [...new Set(rules.map(r => r.symbol))];
  const prices: Record<string, number> = {};
  
  await Promise.all(symbols.map(async (sym) => {
    try {
      const quote = await getLatestQuote(sym);
      prices[sym] = (quote.bid + quote.ask) / 2 || quote.last;
    } catch {
      console.error(`Failed to get quote for ${sym}`);
    }
  }));

  return rules.map(rule => {
    const currentPrice = prices[rule.symbol];
    const triggerPrice = calculateTriggerPrice(rule, currentPrice);
    const distanceToTrigger = currentPrice && triggerPrice 
      ? Math.abs(currentPrice - triggerPrice)
      : undefined;
    const distanceToTriggerPct = currentPrice && triggerPrice
      ? (distanceToTrigger! / currentPrice) * 100
      : undefined;

    return {
      ...rule,
      currentPrice,
      triggerPrice,
      distanceToTrigger,
      distanceToTriggerPct,
    };
  });
}

/**
 * Get rules for a specific position/symbol
 */
export async function getRulesForPosition(symbol: string): Promise<AutomationRuleWithStatus[]> {
  return getActiveRules(symbol);
}

/**
 * Cancel an automation rule
 */
export async function cancelRule(ruleId: string): Promise<void> {
  await prisma.automationRule.update({
    where: { id: ruleId },
    data: { status: 'cancelled', enabled: false },
  });
}

/**
 * Cancel all rules in an OCO group
 */
export async function cancelOCOGroup(ocoGroupId: string): Promise<number> {
  const result = await prisma.automationRule.updateMany({
    where: { ocoGroupId, status: 'active' },
    data: { status: 'cancelled', enabled: false },
  });
  return result.count;
}

/**
 * Toggle rule enabled status
 */
export async function toggleRule(ruleId: string, enabled: boolean): Promise<void> {
  await prisma.automationRule.update({
    where: { id: ruleId },
    data: { enabled },
  });
}

/**
 * Monitor positions and check for triggered rules
 * This should be called periodically (e.g., every few seconds during market hours)
 */
export async function monitorAndExecute(): Promise<MonitoringResult> {
  const result: MonitoringResult = {
    rulesChecked: 0,
    rulesTriggered: 0,
    errors: [],
    triggeredRules: [],
  };

  // Get all active and enabled rules
  const rules = await prisma.automationRule.findMany({
    where: { 
      status: 'active', 
      enabled: true,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  result.rulesChecked = rules.length;

  // Get current positions from Alpaca
  const positions = await getPositions();
  const positionMap = new Map<string, AlpacaPosition>();
  positions.forEach(p => positionMap.set(p.symbol, p));

  // Get current prices
  const symbols = [...new Set(rules.map(r => r.symbol))];
  const prices: Record<string, number> = {};
  
  await Promise.all(symbols.map(async (sym) => {
    try {
      const quote = await getLatestQuote(sym);
      prices[sym] = (quote.bid + quote.ask) / 2 || quote.last;
    } catch (error) {
      result.errors.push(`Failed to get quote for ${sym}: ${error}`);
    }
  }));

  // Check each rule
  for (const rule of rules) {
    const currentPrice = prices[rule.symbol];
    if (!currentPrice) continue;

    const shouldTrigger = checkTrigger(rule, currentPrice, positionMap.get(rule.symbol));
    
    if (shouldTrigger) {
      try {
        const execution = await executeRule(rule, currentPrice, positionMap.get(rule.symbol));
        result.rulesTriggered++;
        result.triggeredRules.push({
          ruleId: rule.id,
          symbol: rule.symbol,
          triggerType: rule.triggerType,
          triggerPrice: currentPrice,
          orderId: execution.orderId || undefined,
          status: execution.orderStatus,
        });

        // If this is an OCO rule, cancel the other leg
        if (rule.ocoGroupId) {
          await cancelOCOGroup(rule.ocoGroupId);
        }
      } catch (error) {
        result.errors.push(`Failed to execute rule ${rule.id}: ${error}`);
      }
    }
  }

  // Check for expired rules
  await prisma.automationRule.updateMany({
    where: {
      status: 'active',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'expired' },
  });

  // Take position snapshots for history
  await takePositionSnapshots(positions, prices);

  return result;
}

/**
 * Check if a rule should trigger
 */
function checkTrigger(
  rule: { triggerType: string; triggerValue: number; entryPrice: number | null; orderSide: string },
  currentPrice: number,
  position?: AlpacaPosition
): boolean {
  const entryPrice = rule.entryPrice || (position ? parseFloat(position.avg_entry_price) : null);
  
  switch (rule.triggerType) {
    case 'PRICE_ABOVE':
      return currentPrice >= rule.triggerValue;
    
    case 'PRICE_BELOW':
      return currentPrice <= rule.triggerValue;
    
    case 'PERCENT_GAIN':
      if (!entryPrice) return false;
      const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      // For long: gain when price goes up; for short: gain when price goes down
      return rule.orderSide === 'sell' 
        ? gainPct >= rule.triggerValue  // Long position gain
        : gainPct <= -rule.triggerValue; // Short position gain (price dropped)
    
    case 'PERCENT_LOSS':
      if (!entryPrice) return false;
      const lossPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      return rule.orderSide === 'sell'
        ? lossPct <= -rule.triggerValue  // Long position loss
        : lossPct >= rule.triggerValue;  // Short position loss
    
    case 'DOLLAR_GAIN':
      if (!entryPrice) return false;
      const dollarGain = currentPrice - entryPrice;
      return rule.orderSide === 'sell'
        ? dollarGain >= rule.triggerValue
        : dollarGain <= -rule.triggerValue;
    
    case 'DOLLAR_LOSS':
      if (!entryPrice) return false;
      const dollarLoss = entryPrice - currentPrice;
      return rule.orderSide === 'sell'
        ? dollarLoss >= rule.triggerValue
        : dollarLoss <= -rule.triggerValue;
    
    default:
      return false;
  }
}

/**
 * Execute a triggered rule
 */
async function executeRule(
  rule: {
    id: string;
    symbol: string;
    orderSide: string;
    orderType: string;
    quantity: number | null;
    limitPrice: number | null;
  },
  triggerPrice: number,
  position?: AlpacaPosition
): Promise<{ orderId: string | null; orderStatus: string }> {
  // Determine quantity - use rule quantity or full position
  let quantity = rule.quantity;
  if (!quantity && position) {
    quantity = Math.abs(parseFloat(position.qty));
  }
  
  if (!quantity || quantity <= 0) {
    // Log execution but mark as failed due to no quantity
    await prisma.automationExecution.create({
      data: {
        ruleId: rule.id,
        triggerPrice,
        quantity: 0,
        orderStatus: 'failed',
        errorMessage: 'No quantity specified and no position found',
      },
    });
    
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { status: 'triggered', triggeredAt: new Date() },
    });
    
    return { orderId: null, orderStatus: 'failed' };
  }

  try {
    // Submit order to Alpaca
    const order = await submitOrder({
      symbol: rule.symbol,
      qty: quantity,
      side: rule.orderSide as 'buy' | 'sell',
      type: rule.orderType as 'market' | 'limit' | 'stop' | 'stop_limit',
      time_in_force: 'day',
      limit_price: rule.limitPrice || undefined,
    });

    // Log execution
    await prisma.automationExecution.create({
      data: {
        ruleId: rule.id,
        triggerPrice,
        quantity,
        orderId: order.id,
        orderStatus: order.status,
      },
    });

    // Update rule status
    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { 
        status: 'triggered', 
        triggeredAt: new Date(),
        orderId: order.id,
      },
    });

    return { orderId: order.id, orderStatus: order.status };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    await prisma.automationExecution.create({
      data: {
        ruleId: rule.id,
        triggerPrice,
        quantity,
        orderStatus: 'failed',
        errorMessage: errorMsg,
      },
    });

    await prisma.automationRule.update({
      where: { id: rule.id },
      data: { status: 'triggered', triggeredAt: new Date() },
    });

    throw error;
  }
}

/**
 * Calculate the trigger price for display
 */
function calculateTriggerPrice(
  rule: { triggerType: string; triggerValue: number; entryPrice: number | null },
  currentPrice?: number
): number | undefined {
  switch (rule.triggerType) {
    case 'PRICE_ABOVE':
    case 'PRICE_BELOW':
      return rule.triggerValue;
    
    case 'PERCENT_GAIN':
      return rule.entryPrice ? rule.entryPrice * (1 + rule.triggerValue / 100) : undefined;
    
    case 'PERCENT_LOSS':
      return rule.entryPrice ? rule.entryPrice * (1 - rule.triggerValue / 100) : undefined;
    
    case 'DOLLAR_GAIN':
      return rule.entryPrice ? rule.entryPrice + rule.triggerValue : undefined;
    
    case 'DOLLAR_LOSS':
      return rule.entryPrice ? rule.entryPrice - rule.triggerValue : undefined;
    
    default:
      return undefined;
  }
}

/**
 * Validate trigger configuration
 */
function validateTrigger(request: CreateRuleRequest): void {
  if (request.triggerValue <= 0) {
    throw new Error('Trigger value must be positive');
  }
  
  if (['PERCENT_GAIN', 'PERCENT_LOSS', 'DOLLAR_GAIN', 'DOLLAR_LOSS'].includes(request.triggerType)) {
    if (!request.entryPrice && !request.positionId) {
      throw new Error('Entry price or position ID required for percentage/dollar-based triggers');
    }
  }
  
  if (request.orderType === 'limit' && !request.limitPrice) {
    throw new Error('Limit price required for limit orders');
  }
}

/**
 * Take snapshots of current positions for historical tracking
 */
async function takePositionSnapshots(
  positions: AlpacaPosition[],
  prices: Record<string, number>
): Promise<void> {
  const snapshots = positions.map(p => ({
    symbol: p.symbol,
    quantity: parseFloat(p.qty),
    avgEntryPrice: parseFloat(p.avg_entry_price),
    currentPrice: prices[p.symbol] || parseFloat(p.current_price),
    marketValue: parseFloat(p.market_value),
    unrealizedPL: parseFloat(p.unrealized_pl),
    unrealizedPLPct: parseFloat(p.unrealized_plpc) * 100,
  }));

  if (snapshots.length > 0) {
    await prisma.positionSnapshot.createMany({
      data: snapshots,
    });
  }
}

/**
 * Get execution history for a rule
 */
export async function getRuleExecutions(ruleId: string): Promise<Array<{
  id: string;
  triggerPrice: number;
  executedPrice: number | null;
  quantity: number;
  orderId: string | null;
  orderStatus: string;
  errorMessage: string | null;
  createdAt: Date;
}>> {
  return prisma.automationExecution.findMany({
    where: { ruleId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get all rules (including triggered/cancelled)
 */
export async function getAllRules(limit: number = 100): Promise<AutomationRuleWithStatus[]> {
  const rules = await prisma.automationRule.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return rules.map(rule => ({
    ...rule,
    currentPrice: undefined,
    triggerPrice: calculateTriggerPrice(rule, undefined),
    distanceToTrigger: undefined,
    distanceToTriggerPct: undefined,
  }));
}

/**
 * Delete old position snapshots (cleanup)
 */
export async function cleanupSnapshots(olderThanDays: number = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  
  const result = await prisma.positionSnapshot.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  
  return result.count;
}
