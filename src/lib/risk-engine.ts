import { prisma } from './db';
import { detectRegimeCached, RegimeType } from './regime';
import { DEFAULT_RISK_CONFIG } from './constants';

export interface TradingIntent {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  orderType: 'market' | 'limit';
  limitPrice?: number;
  strategy: string;
  skipRegimeCheck?: boolean;
}

export interface RegimeCheckResult {
  regime: RegimeType;
  confidence: number;
  canTrade: boolean;
  sizeMultiplier: number;
  reason?: string;
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

// DEFAULT_RISK_CONFIG is imported from './constants'

// Kill switch state (in-memory, persisted in RiskConfig)
let killSwitchActive = false;
let killSwitchInitPromise: Promise<void> | null = null;
let killSwitchInitialized = false;

/**
 * Reset kill switch state (for testing only)
 * @internal
 */
export function _resetKillSwitchState(): void {
  killSwitchActive = false;
  killSwitchInitPromise = null;
  killSwitchInitialized = false;
}

/**
 * Initialize kill switch state from database
 * Called lazily on first check to ensure DB state is respected on startup
 */
async function initKillSwitchState(): Promise<void> {
  if (killSwitchInitialized) return;

  try {
    const config = await prisma.riskConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    });

    if (config) {
      killSwitchActive = !config.tradingEnabled;
    }
    // If no config exists, keep default (false = trading enabled)

    killSwitchInitialized = true;
  } catch (error) {
    console.error('Error initializing kill switch state from DB:', error);
    // On error, keep default state but mark as initialized to avoid retry loop
    killSwitchInitialized = true;
  }
}

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
 * Check if kill switch is active (async to ensure DB state is loaded)
 * Uses lazy initialization with promise caching to avoid repeated queries
 */
export async function isKillSwitchActive(): Promise<boolean> {
  // Use promise caching to avoid multiple concurrent init calls
  if (!killSwitchInitialized && !killSwitchInitPromise) {
    killSwitchInitPromise = initKillSwitchState();
  }

  if (killSwitchInitPromise) {
    await killSwitchInitPromise;
    killSwitchInitPromise = null;
  }

  return killSwitchActive;
}

/**
 * Check if kill switch is active (sync version for compatibility)
 * WARNING: May return stale state if called before async init completes
 * Prefer using isKillSwitchActive() async version
 */
export function isKillSwitchActiveSync(): boolean {
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
 * Check market regime for a symbol and return trading guidance
 */
export async function checkRegime(symbol: string): Promise<RegimeCheckResult> {
  try {
    const result = await detectRegimeCached(symbol);
    
    // Determine if we can trade and position size multiplier
    let canTrade = true;
    let sizeMultiplier = 1.0;
    let reason: string | undefined;
    
    switch (result.regime) {
      case 'UNTRADEABLE':
        canTrade = false;
        sizeMultiplier = 0;
        reason = 'Market regime is UNTRADEABLE - extreme conditions detected';
        break;
      case 'VOL_EXPANSION':
        canTrade = true;
        sizeMultiplier = 0.5; // Reduce size by 50%
        reason = 'Volatility expansion - position size reduced 50%';
        break;
      case 'CHOP':
        canTrade = true;
        sizeMultiplier = 0.7; // Slightly reduced size for choppy markets
        reason = 'Choppy market - position size reduced 30%';
        break;
      case 'TREND':
        canTrade = true;
        sizeMultiplier = 1.0;
        break;
    }
    
    return {
      regime: result.regime,
      confidence: result.confidence,
      canTrade,
      sizeMultiplier,
      reason,
    };
  } catch (error) {
    console.error('Error checking regime:', error);
    // Default to cautious behavior on error
    return {
      regime: 'CHOP',
      confidence: 0.5,
      canTrade: true,
      sizeMultiplier: 0.5,
      reason: 'Could not determine regime - using conservative settings',
    };
  }
}

/**
 * Main risk check function
 */
export async function checkIntent(intent: TradingIntent): Promise<RiskCheckResult> {
  const checks: RiskCheckResult['checks'] = [];
  const config = await getRiskConfig();

  // Check 1: Kill switch / Trading enabled
  const killSwitchState = await isKillSwitchActive();
  const tradingCheck = {
    name: 'trading_enabled',
    passed: config.tradingEnabled && !killSwitchState,
    details: !config.tradingEnabled || killSwitchState ? 'Trading is disabled (kill switch active)' : 'Trading enabled',
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

  // Check 5: Daily loss limit (realized + unrealized P&L)
  let dailyPL = 0;
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Sum realized P&L from closed managed positions today
    const closedToday = await prisma.managedPosition.findMany({
      where: {
        status: 'closed',
        closedAt: { gte: todayStart },
        pnl: { not: null },
      },
      select: { pnl: true },
    });
    const realizedPL = closedToday.reduce((sum, p) => sum + (p.pnl ?? 0), 0);

    // Sum unrealized P&L from current positions (best-effort, may be stale)
    const positions = await prisma.position.findMany({
      select: { unrealizedPL: true },
    });
    const unrealizedPL = positions.reduce((sum, p) => sum + (p.unrealizedPL ?? 0), 0);

    dailyPL = realizedPL + unrealizedPL;
  } catch (err) {
    console.error('Error checking daily P&L:', err);
  }

  const dailyLossOk = dailyPL > -config.maxDailyLoss;
  const dailyLossCheck = {
    name: 'daily_loss_limit',
    passed: dailyLossOk,
    details: dailyLossOk 
      ? `Daily P&L ${dailyPL} within loss limit ${config.maxDailyLoss}` 
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

  // Check 7: Market Regime - block UNTRADEABLE, warn on VOL_EXPANSION (skippable)
  if (intent.skipRegimeCheck) {
    const regimeCheck = {
      name: 'regime_check',
      passed: true,
      details: 'Regime check skipped by user request',
    };
    checks.push(regimeCheck);
  } else {
    try {
      const regimeResult = await checkRegime(intent.symbol);
      const regimeCheck = {
        name: 'regime_check',
        passed: regimeResult.canTrade,
        details: regimeResult.reason || `Regime: ${regimeResult.regime} (confidence: ${(regimeResult.confidence * 100).toFixed(0)}%)`,
      };
      checks.push(regimeCheck);
      
      // Add warning check for size adjustment (informational, doesn't block)
      if (regimeResult.sizeMultiplier < 1.0 && regimeResult.canTrade) {
        const sizeWarning = {
          name: 'regime_size_adjustment',
          passed: true, // Informational, doesn't block
          details: `Position size should be ${(regimeResult.sizeMultiplier * 100).toFixed(0)}% due to ${regimeResult.regime} regime`,
        };
        checks.push(sizeWarning);
      }
    } catch {
      // If regime check fails, add a warning but don't block
      const regimeCheck = {
        name: 'regime_check',
        passed: true, // Don't block on regime check failure
        details: 'Could not verify market regime - proceeding with caution',
      };
      checks.push(regimeCheck);
    }
  }

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

  const killSwitchState = await isKillSwitchActive();
  return {
    orderSizeRemaining: config.maxOrderSize,
    maxPositionHeadroom: config.maxPositionSize - maxCurrentPosition,
    dailyLossRemaining: config.maxDailyLoss, // Would calculate actual remaining
    tradingEnabled: config.tradingEnabled && !killSwitchState,
  };
}
