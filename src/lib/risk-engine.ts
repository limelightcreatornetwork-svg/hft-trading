import { prisma } from './db';

export interface TradingIntent {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit';
  limitPrice?: number;
  strategy: string;
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  checks: {
    name: string;
    passed: boolean;
    details?: string;
  }[];
}

export interface RiskConfig {
  maxPositionSize: number;
  maxOrderSize: number;
  maxDailyLoss: number;
  allowedSymbols: string[];
  tradingEnabled: boolean;
}

// Default risk config if none exists in DB
const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxPositionSize: 1000,
  maxOrderSize: 100,
  maxDailyLoss: 1000,
  allowedSymbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'SPY', 'QQQ', 'NVDA', 'META', 'AMD'],
  tradingEnabled: false,
};

// Kill switch state (in-memory, persisted in RiskConfig)
let killSwitchActive = false;

/**
 * Get current risk configuration
 */
export async function getRiskConfig(): Promise<RiskConfig> {
  try {
    const config = await prisma.riskConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (!config) {
      return DEFAULT_RISK_CONFIG;
    }

    // Update kill switch state from DB
    killSwitchActive = !config.tradingEnabled;

    return {
      maxPositionSize: config.maxPositionSize,
      maxOrderSize: config.maxOrderSize,
      maxDailyLoss: config.maxDailyLoss,
      allowedSymbols: config.allowedSymbols,
      tradingEnabled: config.tradingEnabled,
    };
  } catch (error) {
    console.error('Error fetching risk config:', error);
    return DEFAULT_RISK_CONFIG;
  }
}

/**
 * Update risk configuration
 */
export async function updateRiskConfig(updates: Partial<RiskConfig>): Promise<RiskConfig> {
  try {
    const existingConfig = await prisma.riskConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (existingConfig) {
      const updated = await prisma.riskConfig.update({
        where: { id: existingConfig.id },
        data: {
          maxPositionSize: updates.maxPositionSize ?? existingConfig.maxPositionSize,
          maxOrderSize: updates.maxOrderSize ?? existingConfig.maxOrderSize,
          maxDailyLoss: updates.maxDailyLoss ?? existingConfig.maxDailyLoss,
          allowedSymbols: updates.allowedSymbols ?? existingConfig.allowedSymbols,
          tradingEnabled: updates.tradingEnabled ?? existingConfig.tradingEnabled,
        },
      });
      return {
        maxPositionSize: updated.maxPositionSize,
        maxOrderSize: updated.maxOrderSize,
        maxDailyLoss: updated.maxDailyLoss,
        allowedSymbols: updated.allowedSymbols,
        tradingEnabled: updated.tradingEnabled,
      };
    } else {
      const created = await prisma.riskConfig.create({
        data: {
          maxPositionSize: updates.maxPositionSize ?? DEFAULT_RISK_CONFIG.maxPositionSize,
          maxOrderSize: updates.maxOrderSize ?? DEFAULT_RISK_CONFIG.maxOrderSize,
          maxDailyLoss: updates.maxDailyLoss ?? DEFAULT_RISK_CONFIG.maxDailyLoss,
          allowedSymbols: updates.allowedSymbols ?? DEFAULT_RISK_CONFIG.allowedSymbols,
          tradingEnabled: updates.tradingEnabled ?? DEFAULT_RISK_CONFIG.tradingEnabled,
        },
      });
      return {
        maxPositionSize: created.maxPositionSize,
        maxOrderSize: created.maxOrderSize,
        maxDailyLoss: created.maxDailyLoss,
        allowedSymbols: created.allowedSymbols,
        tradingEnabled: created.tradingEnabled,
      };
    }
  } catch (error) {
    console.error('Error updating risk config:', error);
    throw error;
  }
}

/**
 * Check if kill switch is active
 */
export function isKillSwitchActive(): boolean {
  return killSwitchActive;
}

/**
 * Activate kill switch
 */
export async function activateKillSwitch(): Promise<void> {
  killSwitchActive = true;
  await updateRiskConfig({ tradingEnabled: false });
}

/**
 * Deactivate kill switch
 */
export async function deactivateKillSwitch(): Promise<void> {
  killSwitchActive = false;
  await updateRiskConfig({ tradingEnabled: true });
}

/**
 * Main risk check function
 */
export async function checkIntent(intent: TradingIntent): Promise<RiskCheckResult> {
  const checks: RiskCheckResult['checks'] = [];
  const config = await getRiskConfig();

  // Check 1: Kill switch / Trading enabled
  const tradingCheck = {
    name: 'trading_enabled',
    passed: config.tradingEnabled && !killSwitchActive,
    details: !config.tradingEnabled || killSwitchActive ? 'Trading is disabled (kill switch active)' : 'Trading enabled',
  };
  checks.push(tradingCheck);

  // Check 2: Symbol allowed
  const symbolAllowed = config.allowedSymbols.length === 0 || 
    config.allowedSymbols.includes(intent.symbol.toUpperCase());
  const symbolCheck = {
    name: 'symbol_allowed',
    passed: symbolAllowed,
    details: symbolAllowed 
      ? `Symbol ${intent.symbol} is allowed` 
      : `Symbol ${intent.symbol} not in allowed list: ${config.allowedSymbols.join(', ')}`,
  };
  checks.push(symbolCheck);

  // Check 3: Order size limit
  const orderSizeOk = intent.quantity <= config.maxOrderSize;
  const orderSizeCheck = {
    name: 'order_size',
    passed: orderSizeOk,
    details: orderSizeOk 
      ? `Order size ${intent.quantity} within limit ${config.maxOrderSize}` 
      : `Order size ${intent.quantity} exceeds max ${config.maxOrderSize}`,
  };
  checks.push(orderSizeCheck);

  // Check 4: Position size limit (check current position + new order)
  let currentPositionQty = 0;
  try {
    const position = await prisma.position.findUnique({
      where: { symbol: intent.symbol.toUpperCase() },
    });
    if (position) {
      currentPositionQty = position.quantity;
    }
  } catch (error) {
    console.error('Error checking position:', error);
  }

  const newPositionSize = intent.side === 'buy' 
    ? currentPositionQty + intent.quantity 
    : currentPositionQty - intent.quantity;
  const positionSizeOk = Math.abs(newPositionSize) <= config.maxPositionSize;
  const positionCheck = {
    name: 'position_size',
    passed: positionSizeOk,
    details: positionSizeOk 
      ? `Resulting position ${newPositionSize} within limit ±${config.maxPositionSize}` 
      : `Resulting position ${newPositionSize} exceeds max ±${config.maxPositionSize}`,
  };
  checks.push(positionCheck);

  // Check 5: Daily loss limit
  let dailyPL = 0;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayIntents = await prisma.intent.findMany({
      where: {
        createdAt: { gte: today },
        status: 'EXECUTED',
      },
    });
    
    // This is a simplified check - in production you'd calculate actual P&L
    dailyPL = 0; // Would calculate from fills
  } catch (error) {
    console.error('Error checking daily P&L:', error);
  }

  const dailyLossOk = Math.abs(dailyPL) < config.maxDailyLoss;
  const dailyLossCheck = {
    name: 'daily_loss_limit',
    passed: dailyLossOk,
    details: dailyLossOk 
      ? `Daily P&L ${dailyPL} within limit ±${config.maxDailyLoss}` 
      : `Daily loss ${dailyPL} exceeds limit ${config.maxDailyLoss}`,
  };
  checks.push(dailyLossCheck);

  // Check 6: Basic sanity checks
  const sanityOk = intent.quantity > 0 && 
    ['buy', 'sell'].includes(intent.side) && 
    ['market', 'limit'].includes(intent.orderType);
  const sanityCheck = {
    name: 'sanity_check',
    passed: sanityOk,
    details: sanityOk ? 'Order parameters valid' : 'Invalid order parameters',
  };
  checks.push(sanityCheck);

  // Overall result
  const allPassed = checks.every(c => c.passed);
  const failedChecks = checks.filter(c => !c.passed);

  return {
    approved: allPassed,
    reason: allPassed ? undefined : failedChecks.map(c => c.details).join('; '),
    checks,
  };
}

/**
 * Calculate risk headroom
 */
export async function getRiskHeadroom(): Promise<{
  orderSizeRemaining: number;
  maxPositionHeadroom: number;
  dailyLossRemaining: number;
  tradingEnabled: boolean;
}> {
  const config = await getRiskConfig();

  // Get current largest position
  let maxCurrentPosition = 0;
  try {
    const positions = await prisma.position.findMany();
    maxCurrentPosition = Math.max(...positions.map(p => Math.abs(p.quantity)), 0);
  } catch (error) {
    console.error('Error fetching positions:', error);
  }

  return {
    orderSizeRemaining: config.maxOrderSize,
    maxPositionHeadroom: config.maxPositionSize - maxCurrentPosition,
    dailyLossRemaining: config.maxDailyLoss, // Would calculate actual remaining
    tradingEnabled: config.tradingEnabled && !killSwitchActive,
  };
}
