/**
 * Regime Detection Module
 * 
 * Classifies market conditions for HFT trading decisions.
 */

export * from './types';
export * from './indicators';
export { 
  RegimeDetector, 
  createRegimeDetector, 
  detectRegime 
} from './regimeDetector';
