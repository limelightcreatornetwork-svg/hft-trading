/**
 * Alert System Service
 * 
 * Implements:
 * - Price movement alerts (absolute and percentage)
 * - Position P&L alerts
 * - Volume spike detection
 * - Alert delivery (in-app, webhooks, etc.)
 */

import { prisma } from './db';
import { getLatestQuote, getPositions, AlpacaPosition } from './alpaca';
import { withRetrySafe } from './retry';

// ============================================
// TYPES
// ============================================

export type AlertType = 
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'PRICE_CHANGE_PCT'
  | 'PNL_ABOVE'
  | 'PNL_BELOW'
  | 'PNL_PCT_ABOVE'
  | 'PNL_PCT_BELOW'
  | 'VOLUME_SPIKE'
  | 'POSITION_SIZE';

export type AlertPriority = 'low' | 'medium' | 'high' | 'critical';

export type AlertStatus = 'active' | 'triggered' | 'cancelled' | 'expired';

export interface PriceAlert {
  id: string;
  symbol: string;
  alertType: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PRICE_CHANGE_PCT';
  targetValue: number;         // Price or percentage
  basePrice?: number;          // For percentage calculations
  currentPrice?: number;
  message?: string;
  priority: AlertPriority;
  status: AlertStatus;
  repeating: boolean;          // Fire once or every time condition is met
  cooldownMinutes: number;     // Minimum time between repeated alerts
  lastTriggeredAt?: Date;
  createdAt: Date;
  expiresAt?: Date;
}

export interface PnLAlert {
  id: string;
  symbol?: string;             // Optional - null for portfolio-level
  alertType: 'PNL_ABOVE' | 'PNL_BELOW' | 'PNL_PCT_ABOVE' | 'PNL_PCT_BELOW';
  targetValue: number;         // Dollar amount or percentage
  currentPnL?: number;
  currentPnLPct?: number;
  message?: string;
  priority: AlertPriority;
  status: AlertStatus;
  createdAt: Date;
  expiresAt?: Date;
}

export interface VolumeSpikeAlert {
  id: string;
  symbol: string;
  multiplier: number;          // Fire when volume > (average * multiplier)
  averagePeriod: number;       // Days to calculate average (e.g., 20)
  averageVolume?: number;
  currentVolume?: number;
  message?: string;
  priority: AlertPriority;
  status: AlertStatus;
  createdAt: Date;
}

export interface AlertTriggerResult {
  alertId: string;
  alertType: AlertType;
  symbol?: string;
  message: string;
  priority: AlertPriority;
  triggeredAt: Date;
  data: Record<string, unknown>;
}

export interface AlertMonitorResult {
  alertsChecked: number;
  alertsTriggered: number;
  errors: string[];
  triggeredAlerts: AlertTriggerResult[];
}

// ============================================
// IN-MEMORY ALERT STORES
// ============================================

const priceAlerts: Map<string, PriceAlert> = new Map();
const pnlAlerts: Map<string, PnLAlert> = new Map();
const volumeAlerts: Map<string, VolumeSpikeAlert> = new Map();

// Store for volume history (symbol -> array of daily volumes)
const volumeHistory: Map<string, number[]> = new Map();

// ============================================
// PRICE ALERTS
// ============================================

/**
 * Create a price alert
 */
export async function createPriceAlert(params: {
  symbol: string;
  alertType: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'PRICE_CHANGE_PCT';
  targetValue: number;
  basePrice?: number;
  message?: string;
  priority?: AlertPriority;
  repeating?: boolean;
  cooldownMinutes?: number;
  expiresAt?: Date;
}): Promise<PriceAlert> {
  const id = `pa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Get current price for base if not provided
  let basePrice = params.basePrice;
  let currentPrice: number | undefined;
  
  try {
    const quote = await getLatestQuote(params.symbol);
    currentPrice = (quote.bid + quote.ask) / 2 || quote.last;
    if (!basePrice && params.alertType === 'PRICE_CHANGE_PCT') {
      basePrice = currentPrice;
    }
  } catch {
    // Continue without current price
  }
  
  const alert: PriceAlert = {
    id,
    symbol: params.symbol.toUpperCase(),
    alertType: params.alertType,
    targetValue: params.targetValue,
    basePrice,
    currentPrice,
    message: params.message,
    priority: params.priority || 'medium',
    status: 'active',
    repeating: params.repeating || false,
    cooldownMinutes: params.cooldownMinutes || 5,
    createdAt: new Date(),
    expiresAt: params.expiresAt,
  };
  
  priceAlerts.set(id, alert);
  
  // Also store in database
  await prisma.alert.create({
    data: {
      positionId: id, // Using as alert group ID
      type: params.alertType,
      message: params.message || `Price alert for ${params.symbol}: ${params.alertType} ${params.targetValue}`,
      triggered: false,
    },
  });
  
  return alert;
}

/**
 * Get all active price alerts
 */
export function getActivePriceAlerts(symbol?: string): PriceAlert[] {
  const alerts = Array.from(priceAlerts.values()).filter(a => a.status === 'active');
  if (symbol) {
    return alerts.filter(a => a.symbol === symbol.toUpperCase());
  }
  return alerts;
}

/**
 * Cancel a price alert
 */
export function cancelPriceAlert(id: string): void {
  const alert = priceAlerts.get(id);
  if (alert) {
    alert.status = 'cancelled';
  }
}

// ============================================
// P&L ALERTS
// ============================================

/**
 * Create a P&L alert (position or portfolio level)
 */
export async function createPnLAlert(params: {
  symbol?: string;             // Null for portfolio-level
  alertType: 'PNL_ABOVE' | 'PNL_BELOW' | 'PNL_PCT_ABOVE' | 'PNL_PCT_BELOW';
  targetValue: number;
  message?: string;
  priority?: AlertPriority;
  expiresAt?: Date;
}): Promise<PnLAlert> {
  const id = `pnl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const alert: PnLAlert = {
    id,
    symbol: params.symbol?.toUpperCase(),
    alertType: params.alertType,
    targetValue: params.targetValue,
    message: params.message,
    priority: params.priority || 'high',
    status: 'active',
    createdAt: new Date(),
    expiresAt: params.expiresAt,
  };
  
  pnlAlerts.set(id, alert);
  
  await prisma.alert.create({
    data: {
      positionId: id,
      type: params.alertType,
      message: params.message || `P&L alert ${params.symbol ? 'for ' + params.symbol : '(portfolio)'}: ${params.alertType} ${params.targetValue}`,
      triggered: false,
    },
  });
  
  return alert;
}

/**
 * Get all active P&L alerts
 */
export function getActivePnLAlerts(symbol?: string): PnLAlert[] {
  const alerts = Array.from(pnlAlerts.values()).filter(a => a.status === 'active');
  if (symbol) {
    return alerts.filter(a => a.symbol === symbol.toUpperCase() || a.symbol === undefined);
  }
  return alerts;
}

/**
 * Cancel a P&L alert
 */
export function cancelPnLAlert(id: string): void {
  const alert = pnlAlerts.get(id);
  if (alert) {
    alert.status = 'cancelled';
  }
}

// ============================================
// VOLUME SPIKE ALERTS
// ============================================

/**
 * Create a volume spike alert
 */
export async function createVolumeSpikeAlert(params: {
  symbol: string;
  multiplier: number;          // e.g., 2 for 2x average volume
  averagePeriod?: number;      // Days, default 20
  message?: string;
  priority?: AlertPriority;
}): Promise<VolumeSpikeAlert> {
  const id = `vs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const alert: VolumeSpikeAlert = {
    id,
    symbol: params.symbol.toUpperCase(),
    multiplier: params.multiplier,
    averagePeriod: params.averagePeriod || 20,
    message: params.message,
    priority: params.priority || 'medium',
    status: 'active',
    createdAt: new Date(),
  };
  
  volumeAlerts.set(id, alert);
  
  await prisma.alert.create({
    data: {
      positionId: id,
      type: 'VOLUME_SPIKE',
      message: params.message || `Volume spike alert for ${params.symbol}: ${params.multiplier}x average`,
      triggered: false,
    },
  });
  
  return alert;
}

/**
 * Get all active volume spike alerts
 */
export function getActiveVolumeSpikeAlerts(symbol?: string): VolumeSpikeAlert[] {
  const alerts = Array.from(volumeAlerts.values()).filter(a => a.status === 'active');
  if (symbol) {
    return alerts.filter(a => a.symbol === symbol.toUpperCase());
  }
  return alerts;
}

/**
 * Cancel a volume spike alert
 */
export function cancelVolumeSpikeAlert(id: string): void {
  const alert = volumeAlerts.get(id);
  if (alert) {
    alert.status = 'cancelled';
  }
}

/**
 * Update volume history for a symbol
 */
export function updateVolumeHistory(symbol: string, volume: number): void {
  const history = volumeHistory.get(symbol.toUpperCase()) || [];
  history.push(volume);
  // Keep last 30 days
  if (history.length > 30) {
    history.shift();
  }
  volumeHistory.set(symbol.toUpperCase(), history);
}

/**
 * Calculate average volume for a symbol
 */
export function getAverageVolume(symbol: string, days: number = 20): number | undefined {
  const history = volumeHistory.get(symbol.toUpperCase());
  if (!history || history.length === 0) return undefined;
  
  const relevantHistory = history.slice(-days);
  return relevantHistory.reduce((sum, v) => sum + v, 0) / relevantHistory.length;
}

// ============================================
// ALERT MONITORING
// ============================================

/**
 * Monitor and check all alerts
 * Should be called periodically
 */
export async function monitorAlerts(): Promise<AlertMonitorResult> {
  const result: AlertMonitorResult = {
    alertsChecked: 0,
    alertsTriggered: 0,
    errors: [],
    triggeredAlerts: [],
  };
  
  // Collect all symbols that need quotes
  const allSymbols = new Set<string>();
  
  getActivePriceAlerts().forEach(a => allSymbols.add(a.symbol));
  getActiveVolumeSpikeAlerts().forEach(a => allSymbols.add(a.symbol));
  
  // Get current positions for P&L alerts
  let positions: AlpacaPosition[] = [];
  try {
    positions = await getPositions();
    positions.forEach(p => allSymbols.add(p.symbol));
  } catch (error) {
    result.errors.push(`Failed to get positions: ${error}`);
  }
  
  // Get current prices
  const prices: Record<string, number> = {};
  await Promise.all([...allSymbols].map(async (sym) => {
    try {
      const quote = await getLatestQuote(sym);
      prices[sym] = (quote.bid + quote.ask) / 2 || quote.last;
    } catch (error) {
      result.errors.push(`Failed to get quote for ${sym}: ${error}`);
    }
  }));
  
  // Check price alerts
  for (const alert of getActivePriceAlerts()) {
    result.alertsChecked++;
    
    const currentPrice = prices[alert.symbol];
    if (!currentPrice) continue;
    
    alert.currentPrice = currentPrice;
    
    // Check if in cooldown
    if (alert.repeating && alert.lastTriggeredAt) {
      const cooldownEnd = new Date(alert.lastTriggeredAt.getTime() + alert.cooldownMinutes * 60 * 1000);
      if (new Date() < cooldownEnd) continue;
    }
    
    // Check if expired
    if (alert.expiresAt && new Date() > alert.expiresAt) {
      alert.status = 'expired';
      continue;
    }
    
    let triggered = false;
    
    switch (alert.alertType) {
      case 'PRICE_ABOVE':
        triggered = currentPrice >= alert.targetValue;
        break;
      case 'PRICE_BELOW':
        triggered = currentPrice <= alert.targetValue;
        break;
      case 'PRICE_CHANGE_PCT':
        if (alert.basePrice) {
          const changePct = ((currentPrice - alert.basePrice) / alert.basePrice) * 100;
          triggered = Math.abs(changePct) >= alert.targetValue;
        }
        break;
    }
    
    if (triggered) {
      const triggerResult = await handlePriceAlertTrigger(alert, currentPrice);
      result.alertsTriggered++;
      result.triggeredAlerts.push(triggerResult);
    }
  }
  
  // Check P&L alerts
  const positionMap = new Map<string, AlpacaPosition>();
  positions.forEach(p => positionMap.set(p.symbol, p));
  
  for (const alert of getActivePnLAlerts()) {
    result.alertsChecked++;
    
    // Check if expired
    if (alert.expiresAt && new Date() > alert.expiresAt) {
      alert.status = 'expired';
      continue;
    }
    
    let pnl: number;
    let pnlPct: number;
    
    if (alert.symbol) {
      // Position-level P&L
      const position = positionMap.get(alert.symbol);
      if (!position) continue;
      
      pnl = parseFloat(position.unrealized_pl);
      pnlPct = parseFloat(position.unrealized_plpc) * 100;
    } else {
      // Portfolio-level P&L
      pnl = positions.reduce((sum, p) => sum + parseFloat(p.unrealized_pl), 0);
      const totalCost = positions.reduce((sum, p) => sum + parseFloat(p.cost_basis), 0);
      pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    }
    
    alert.currentPnL = pnl;
    alert.currentPnLPct = pnlPct;
    
    let triggered = false;
    
    switch (alert.alertType) {
      case 'PNL_ABOVE':
        triggered = pnl >= alert.targetValue;
        break;
      case 'PNL_BELOW':
        triggered = pnl <= alert.targetValue;
        break;
      case 'PNL_PCT_ABOVE':
        triggered = pnlPct >= alert.targetValue;
        break;
      case 'PNL_PCT_BELOW':
        triggered = pnlPct <= alert.targetValue;
        break;
    }
    
    if (triggered) {
      const triggerResult = await handlePnLAlertTrigger(alert, pnl, pnlPct);
      result.alertsTriggered++;
      result.triggeredAlerts.push(triggerResult);
    }
  }
  
  // Check volume spike alerts
  for (const alert of getActiveVolumeSpikeAlerts()) {
    result.alertsChecked++;
    
    const avgVolume = getAverageVolume(alert.symbol, alert.averagePeriod);
    if (!avgVolume) continue;
    
    alert.averageVolume = avgVolume;
    
    // Note: In production, fetch current day's volume from market data API
    // For now, using a placeholder
    const currentVolume = alert.currentVolume || 0;
    
    if (currentVolume > avgVolume * alert.multiplier) {
      const triggerResult = await handleVolumeSpikeAlertTrigger(alert, currentVolume, avgVolume);
      result.alertsTriggered++;
      result.triggeredAlerts.push(triggerResult);
    }
  }
  
  return result;
}

/**
 * Handle a triggered price alert
 */
async function handlePriceAlertTrigger(alert: PriceAlert, currentPrice: number): Promise<AlertTriggerResult> {
  const now = new Date();
  
  if (alert.repeating) {
    alert.lastTriggeredAt = now;
  } else {
    alert.status = 'triggered';
  }
  
  const message = alert.message || 
    `Price alert: ${alert.symbol} ${alert.alertType === 'PRICE_ABOVE' ? 'above' : 'below'} $${alert.targetValue.toFixed(2)} (current: $${currentPrice.toFixed(2)})`;
  
  // Store in database with retry
  await withRetrySafe(
    () => prisma.alert.create({
      data: {
        positionId: alert.id,
        type: alert.alertType,
        message,
        triggered: true,
        triggeredAt: now,
      },
    }),
    { maxRetries: 2, baseDelayMs: 200, maxDelayMs: 2000 }
  );

  return {
    alertId: alert.id,
    alertType: alert.alertType,
    symbol: alert.symbol,
    message,
    priority: alert.priority,
    triggeredAt: now,
    data: {
      targetValue: alert.targetValue,
      currentPrice,
      basePrice: alert.basePrice,
    },
  };
}

/**
 * Handle a triggered P&L alert
 */
async function handlePnLAlertTrigger(alert: PnLAlert, pnl: number, pnlPct: number): Promise<AlertTriggerResult> {
  const now = new Date();
  alert.status = 'triggered';
  
  const message = alert.message ||
    `P&L alert${alert.symbol ? ' for ' + alert.symbol : ' (portfolio)'}: ${alert.alertType} $${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%)`;
  
  await withRetrySafe(
    () => prisma.alert.create({
      data: {
        positionId: alert.id,
        type: alert.alertType,
        message,
        triggered: true,
        triggeredAt: now,
      },
    }),
    { maxRetries: 2, baseDelayMs: 200, maxDelayMs: 2000 }
  );

  return {
    alertId: alert.id,
    alertType: alert.alertType,
    symbol: alert.symbol,
    message,
    priority: alert.priority,
    triggeredAt: now,
    data: {
      targetValue: alert.targetValue,
      currentPnL: pnl,
      currentPnLPct: pnlPct,
    },
  };
}

/**
 * Handle a triggered volume spike alert
 */
async function handleVolumeSpikeAlertTrigger(
  alert: VolumeSpikeAlert,
  currentVolume: number,
  avgVolume: number
): Promise<AlertTriggerResult> {
  const now = new Date();
  alert.status = 'triggered';
  
  const multiplierActual = (currentVolume / avgVolume).toFixed(1);
  const message = alert.message ||
    `Volume spike: ${alert.symbol} volume ${multiplierActual}x average (${currentVolume.toLocaleString()} vs ${avgVolume.toLocaleString()} avg)`;
  
  await withRetrySafe(
    () => prisma.alert.create({
      data: {
        positionId: alert.id,
        type: 'VOLUME_SPIKE',
        message,
        triggered: true,
        triggeredAt: now,
      },
    }),
    { maxRetries: 2, baseDelayMs: 200, maxDelayMs: 2000 }
  );

  return {
    alertId: alert.id,
    alertType: 'VOLUME_SPIKE',
    symbol: alert.symbol,
    message,
    priority: alert.priority,
    triggeredAt: now,
    data: {
      multiplier: alert.multiplier,
      currentVolume,
      averageVolume: avgVolume,
      actualMultiplier: parseFloat(multiplierActual),
    },
  };
}

// ============================================
// ALERT HISTORY & MANAGEMENT
// ============================================

/**
 * Get alert history from database
 */
export async function getAlertHistory(params: {
  symbol?: string;
  type?: string;
  triggered?: boolean;
  limit?: number;
}): Promise<Array<{
  id: string;
  type: string;
  message: string;
  triggered: boolean;
  triggeredAt: Date | null;
  createdAt: Date;
}>> {
  const where: {
    type?: string;
    triggered?: boolean;
  } = {};
  
  if (params.type) where.type = params.type;
  if (params.triggered !== undefined) where.triggered = params.triggered;
  
  const alerts = await prisma.alert.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: params.limit || 100,
  });
  
  return alerts.map(a => ({
    id: a.id,
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
    data: { dismissed: true, dismissedAt: new Date() },
  });
}

/**
 * Get all active alerts summary
 */
export function getActiveAlertsSummary(): {
  priceAlerts: number;
  pnlAlerts: number;
  volumeAlerts: number;
  total: number;
} {
  return {
    priceAlerts: getActivePriceAlerts().length,
    pnlAlerts: getActivePnLAlerts().length,
    volumeAlerts: getActiveVolumeSpikeAlerts().length,
    total: getActivePriceAlerts().length + getActivePnLAlerts().length + getActiveVolumeSpikeAlerts().length,
  };
}

/**
 * Clear all alerts (for testing/reset)
 */
export function clearAllAlerts(): void {
  priceAlerts.clear();
  pnlAlerts.clear();
  volumeAlerts.clear();
}
