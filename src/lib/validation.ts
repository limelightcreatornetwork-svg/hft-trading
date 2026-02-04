/**
 * Input Validation Utilities
 * 
 * Provides type-safe validation for API inputs
 */

export type ValidationResult<T> = 
  | { valid: true; value: T }
  | { valid: false; error: string };

/**
 * Validate a string field
 */
export function validateString(
  value: unknown,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp } = {}
): ValidationResult<string> {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  
  if (options.minLength !== undefined && value.length < options.minLength) {
    return { valid: false, error: `${fieldName} must be at least ${options.minLength} characters` };
  }
  
  if (options.maxLength !== undefined && value.length > options.maxLength) {
    return { valid: false, error: `${fieldName} must be at most ${options.maxLength} characters` };
  }
  
  if (options.pattern && !options.pattern.test(value)) {
    return { valid: false, error: `${fieldName} has invalid format` };
  }
  
  return { valid: true, value };
}

/**
 * Validate a number field
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): ValidationResult<number> {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, error: `${fieldName} must be a valid number` };
  }
  
  if (options.integer && !Number.isInteger(value)) {
    return { valid: false, error: `${fieldName} must be an integer` };
  }
  
  if (options.min !== undefined && value < options.min) {
    return { valid: false, error: `${fieldName} must be at least ${options.min}` };
  }
  
  if (options.max !== undefined && value > options.max) {
    return { valid: false, error: `${fieldName} must be at most ${options.max}` };
  }
  
  return { valid: true, value };
}

/**
 * Validate a positive number
 */
export function validatePositiveNumber(
  value: unknown,
  fieldName: string,
  options: { allowZero?: boolean; integer?: boolean } = {}
): ValidationResult<number> {
  const numResult = validateNumber(value, fieldName, { 
    min: options.allowZero ? 0 : 0.000001,
    integer: options.integer,
  });
  
  if (!numResult.valid) return numResult;
  
  if (!options.allowZero && numResult.value <= 0) {
    return { valid: false, error: `${fieldName} must be positive` };
  }
  
  return numResult;
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[]
): ValidationResult<T> {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  
  if (!allowedValues.includes(value as T)) {
    return { 
      valid: false, 
      error: `${fieldName} must be one of: ${allowedValues.join(', ')}` 
    };
  }
  
  return { valid: true, value: value as T };
}

/**
 * Validate symbol (uppercase stock ticker)
 */
export function validateSymbol(value: unknown): ValidationResult<string> {
  const stringResult = validateString(value, 'symbol', { 
    minLength: 1, 
    maxLength: 10,
    pattern: /^[A-Z0-9.]+$/i,
  });
  
  if (!stringResult.valid) return stringResult;
  
  return { valid: true, value: stringResult.value.toUpperCase() };
}

/**
 * Validate trade side
 */
export function validateSide(value: unknown): ValidationResult<'buy' | 'sell'> {
  return validateEnum(value, 'side', ['buy', 'sell'] as const);
}

/**
 * Validate order type
 */
export function validateOrderType(value: unknown): ValidationResult<'market' | 'limit'> {
  return validateEnum(value, 'orderType', ['market', 'limit'] as const);
}

/**
 * Parse an integer from a query string parameter with a safe default.
 * Returns the default if the value is null, empty, or not a valid integer.
 */
export function parseIntParam(value: string | null, defaultValue: number): number {
  if (value === null || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Validate trade request body
 */
export interface ValidatedTradeRequest {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  entryPrice: number;
  takeProfitPct?: number;
  stopLossPct?: number;
  timeStopHours?: number;
  trailingStopPct?: number;
}

export function validateTradeRequest(body: unknown): ValidationResult<ValidatedTradeRequest> {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }
  
  const data = body as Record<string, unknown>;
  
  // Required fields
  const symbolResult = validateSymbol(data.symbol);
  if (!symbolResult.valid) return symbolResult;
  
  const sideResult = validateSide(data.side);
  if (!sideResult.valid) return sideResult;
  
  const quantityResult = validatePositiveNumber(data.quantity, 'quantity', { integer: true });
  if (!quantityResult.valid) return quantityResult;
  
  const entryPriceResult = validatePositiveNumber(data.entryPrice, 'entryPrice');
  if (!entryPriceResult.valid) return entryPriceResult;
  
  // Optional fields
  const result: ValidatedTradeRequest = {
    symbol: symbolResult.value,
    side: sideResult.value,
    quantity: quantityResult.value,
    entryPrice: entryPriceResult.value,
  };
  
  if (data.takeProfitPct !== undefined) {
    const tpResult = validatePositiveNumber(data.takeProfitPct, 'takeProfitPct');
    if (!tpResult.valid) return tpResult;
    result.takeProfitPct = tpResult.value;
  }
  
  if (data.stopLossPct !== undefined) {
    const slResult = validatePositiveNumber(data.stopLossPct, 'stopLossPct');
    if (!slResult.valid) return slResult;
    result.stopLossPct = slResult.value;
  }
  
  if (data.timeStopHours !== undefined) {
    const tsResult = validatePositiveNumber(data.timeStopHours, 'timeStopHours');
    if (!tsResult.valid) return tsResult;
    result.timeStopHours = tsResult.value;
  }
  
  if (data.trailingStopPct !== undefined) {
    const trailResult = validatePositiveNumber(data.trailingStopPct, 'trailingStopPct');
    if (!trailResult.valid) return trailResult;
    result.trailingStopPct = trailResult.value;
  }
  
  return { valid: true, value: result };
}
