/**
 * Regime Detection Module
 *
 * Classifies market conditions for HFT trading decisions.
 *
 * Two complementary detectors:
 *  1. RegimeDetector (from ./regimeDetector) – pure computation on MarketDataInput
 *  2. AlpacaRegimeDetector (from ./alpacaRegimeDetector) – fetches data from
 *     Alpaca and caches results; used by confidence, risk-engine, /api/regime.
 */

// Pure-computation types and detector
export * from './types';
export * from './indicators';
export {
  RegimeDetector,
  createRegimeDetector,
  detectRegime
} from './regimeDetector';

// Alpaca-based detector, caching helpers, and backward-compat types
export {
  AlpacaRegimeDetector,
  getRegimeDetector,
  detectRegimeCached,
  clearRegimeCache,
  type RegimeType,
  type AlpacaRegimeResult,
  type RegimeMetrics,
  type Bar,
} from './alpacaRegimeDetector';
