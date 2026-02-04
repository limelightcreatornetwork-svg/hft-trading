/**
 * Strategy Factory
 *
 * Registry pattern for creating strategy instances by type.
 */

import type { TradingStrategy } from './types';
import { MomentumStrategy } from './momentum-strategy';
import { MeanReversionStrategy } from './mean-reversion-strategy';
import { BreakoutStrategy } from './breakout-strategy';

const registry = new Map<string, () => TradingStrategy>();

// Register built-in strategies
registry.set('momentum', () => new MomentumStrategy());
registry.set('meanReversion', () => new MeanReversionStrategy());
registry.set('breakout', () => new BreakoutStrategy());

/**
 * Create a strategy instance by type
 */
export function createStrategy(type: string): TradingStrategy {
  const factory = registry.get(type);
  if (!factory) {
    throw new Error(`Unknown strategy type: ${type}`);
  }
  return factory();
}

/**
 * Get all available strategy types
 */
export function getAvailableStrategyTypes(): string[] {
  return Array.from(registry.keys());
}

/**
 * Register a custom strategy type
 */
export function registerStrategy(type: string, factory: () => TradingStrategy): void {
  registry.set(type, factory);
}
