/**
 * Environment Variable Validation
 *
 * Provides type-safe access to environment variables with proper error messages
 */

import { createLogger } from './logger';

/**
 * Get a required environment variable
 * Throws descriptive error if missing
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
      `Please set it in your .env file or environment.`
    );
  }
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get a boolean environment variable
 */
export function getBooleanEnv(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Get a numeric environment variable
 */
export function getNumericEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    createLogger('env').warn('Invalid numeric env var', { name, value, defaultValue });
    return defaultValue;
  }
  return parsed;
}

/**
 * Validate all required environment variables at startup
 * Call this early in app initialization
 */
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const required = [
    'ALPACA_API_KEY',
    'ALPACA_API_SECRET',
  ];
  
  const missing = required.filter(name => !process.env[name]);
  
  if (missing.length > 0) {
    createLogger('env').error('Missing required environment variables', { missing });
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Alpaca-specific environment configuration
 */
export const alpacaConfig = {
  get apiKey(): string {
    return getRequiredEnv('ALPACA_API_KEY');
  },
  get apiSecret(): string {
    return getRequiredEnv('ALPACA_API_SECRET');
  },
  get isPaper(): boolean {
    return getBooleanEnv('ALPACA_PAPER', true);
  },
  get baseUrl(): string {
    return getOptionalEnv(
      'ALPACA_BASE_URL',
      getBooleanEnv('ALPACA_PAPER', true)
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets'
    );
  },
} as const;

/**
 * Database configuration
 */
export const dbConfig = {
  get databaseUrl(): string {
    return getRequiredEnv('DATABASE_URL');
  },
} as const;
