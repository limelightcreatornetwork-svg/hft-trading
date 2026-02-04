/**
 * Strategy Input Validation
 *
 * Validates strategy creation and update payloads using
 * the same patterns as validation.ts.
 */

import {
  type ValidationResult,
  validateString,
  validateNumber,
  validatePositiveNumber,
  validateEnum,
  validateSymbol,
} from './validation';
import type { StrategyInput, StrategyUpdate } from './strategy-manager';

const STRATEGY_TYPES = ['manual', 'momentum', 'meanReversion', 'breakout'] as const;
type StrategyType = (typeof STRATEGY_TYPES)[number];

/**
 * Validate that a value is a non-empty array of valid stock symbols
 */
function validateSymbolsArray(value: unknown, fieldName: string): ValidationResult<string[]> {
  if (!Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  if (value.length === 0) {
    return { valid: false, error: `${fieldName} must not be empty` };
  }
  const validated: string[] = [];
  for (const sym of value) {
    const result = validateSymbol(sym);
    if (!result.valid) {
      return { valid: false, error: `${fieldName} contains invalid symbol: ${result.error}` };
    }
    validated.push(result.value);
  }
  return { valid: true, value: validated };
}

/**
 * Validate that a value is a plain object (JSON-compatible)
 */
function validateJsonObject(value: unknown, fieldName: string): ValidationResult<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an object` };
  }
  return { valid: true, value: value as Record<string, unknown> };
}

/**
 * Validate a strategy creation payload
 */
export function validateStrategyInput(body: unknown): ValidationResult<StrategyInput> {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const data = body as Record<string, unknown>;

  // Required: name
  const nameResult = validateString(data.name, 'name', { minLength: 1, maxLength: 100 });
  if (!nameResult.valid) return nameResult;

  // Required: type
  const typeResult = validateEnum(data.type, 'type', STRATEGY_TYPES);
  if (!typeResult.valid) return typeResult;

  // Required: symbols
  const symbolsResult = validateSymbolsArray(data.symbols, 'symbols');
  if (!symbolsResult.valid) return symbolsResult;

  // Required: entryConditions
  const entryResult = validateJsonObject(data.entryConditions, 'entryConditions');
  if (!entryResult.valid) return entryResult;

  // Required: exitConditions
  const exitResult = validateJsonObject(data.exitConditions, 'exitConditions');
  if (!exitResult.valid) return exitResult;

  // Required: positionSizing
  const sizingResult = validateJsonObject(data.positionSizing, 'positionSizing');
  if (!sizingResult.valid) return sizingResult;

  // Required: riskParams
  const riskResult = validateJsonObject(data.riskParams, 'riskParams');
  if (!riskResult.valid) return riskResult;

  const result: StrategyInput = {
    name: nameResult.value,
    type: typeResult.value,
    symbols: symbolsResult.value,
    entryConditions: entryResult.value,
    exitConditions: exitResult.value,
    positionSizing: sizingResult.value,
    riskParams: riskResult.value,
  };

  // Optional: description
  if (data.description !== undefined) {
    const descResult = validateString(data.description, 'description', { maxLength: 500 });
    if (!descResult.valid) return descResult;
    result.description = descResult.value;
  }

  // Optional: allocatedCapital
  if (data.allocatedCapital !== undefined) {
    const capResult = validatePositiveNumber(data.allocatedCapital, 'allocatedCapital');
    if (!capResult.valid) return capResult;
    result.allocatedCapital = capResult.value;
  }

  // Optional: maxPositionSize
  if (data.maxPositionSize !== undefined) {
    const posResult = validatePositiveNumber(data.maxPositionSize, 'maxPositionSize');
    if (!posResult.valid) return posResult;
    result.maxPositionSize = posResult.value;
  }

  // Optional: riskPerTrade
  if (data.riskPerTrade !== undefined) {
    const rptResult = validateNumber(data.riskPerTrade, 'riskPerTrade', { min: 0.001, max: 1 });
    if (!rptResult.valid) return rptResult;
    result.riskPerTrade = rptResult.value;
  }

  return { valid: true, value: result };
}

/**
 * Validate a strategy update payload (all fields optional)
 */
export function validateStrategyUpdate(body: unknown): ValidationResult<StrategyUpdate> {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const data = body as Record<string, unknown>;
  const result: StrategyUpdate = {};
  let hasField = false;

  if (data.name !== undefined) {
    const nameResult = validateString(data.name, 'name', { minLength: 1, maxLength: 100 });
    if (!nameResult.valid) return nameResult;
    result.name = nameResult.value;
    hasField = true;
  }

  if (data.description !== undefined) {
    if (data.description === null) {
      result.description = undefined;
    } else {
      const descResult = validateString(data.description, 'description', { maxLength: 500 });
      if (!descResult.valid) return descResult;
      result.description = descResult.value;
    }
    hasField = true;
  }

  if (data.type !== undefined) {
    const typeResult = validateEnum(data.type, 'type', STRATEGY_TYPES);
    if (!typeResult.valid) return typeResult;
    result.type = typeResult.value;
    hasField = true;
  }

  if (data.symbols !== undefined) {
    const symbolsResult = validateSymbolsArray(data.symbols, 'symbols');
    if (!symbolsResult.valid) return symbolsResult;
    result.symbols = symbolsResult.value;
    hasField = true;
  }

  if (data.entryConditions !== undefined) {
    const entryResult = validateJsonObject(data.entryConditions, 'entryConditions');
    if (!entryResult.valid) return entryResult;
    result.entryConditions = entryResult.value;
    hasField = true;
  }

  if (data.exitConditions !== undefined) {
    const exitResult = validateJsonObject(data.exitConditions, 'exitConditions');
    if (!exitResult.valid) return exitResult;
    result.exitConditions = exitResult.value;
    hasField = true;
  }

  if (data.positionSizing !== undefined) {
    const sizingResult = validateJsonObject(data.positionSizing, 'positionSizing');
    if (!sizingResult.valid) return sizingResult;
    result.positionSizing = sizingResult.value;
    hasField = true;
  }

  if (data.riskParams !== undefined) {
    const riskResult = validateJsonObject(data.riskParams, 'riskParams');
    if (!riskResult.valid) return riskResult;
    result.riskParams = riskResult.value;
    hasField = true;
  }

  if (data.allocatedCapital !== undefined) {
    const capResult = validatePositiveNumber(data.allocatedCapital, 'allocatedCapital');
    if (!capResult.valid) return capResult;
    result.allocatedCapital = capResult.value;
    hasField = true;
  }

  if (data.maxPositionSize !== undefined) {
    const posResult = validatePositiveNumber(data.maxPositionSize, 'maxPositionSize');
    if (!posResult.valid) return posResult;
    result.maxPositionSize = posResult.value;
    hasField = true;
  }

  if (data.riskPerTrade !== undefined) {
    const rptResult = validateNumber(data.riskPerTrade, 'riskPerTrade', { min: 0.001, max: 1 });
    if (!rptResult.valid) return rptResult;
    result.riskPerTrade = rptResult.value;
    hasField = true;
  }

  if (data.enabled !== undefined) {
    if (typeof data.enabled !== 'boolean') {
      return { valid: false, error: 'enabled must be a boolean' };
    }
    result.enabled = data.enabled;
    hasField = true;
  }

  if (!hasField) {
    return { valid: false, error: 'At least one field must be provided for update' };
  }

  return { valid: true, value: result };
}
