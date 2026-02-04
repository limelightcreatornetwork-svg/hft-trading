/**
 * Retry Utility with Exponential Backoff
 *
 * Provides resilient execution of async operations with configurable
 * retry behavior, exponential backoff, and jitter.
 */

export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in ms before first retry (default: 500) */
  baseDelayMs: number;
  /** Maximum delay in ms between retries (default: 10000) */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  jitter: boolean;
  /** Optional predicate to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Optional callback on each retry attempt */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  backoffMultiplier: 2,
  jitter: true,
};

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: unknown;
  attempts: number;
}

/**
 * Calculate delay for a given attempt with exponential backoff and optional jitter
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const clampedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Add random jitter between 0% and 100% of the delay
    return Math.round(clampedDelay * (0.5 + Math.random() * 0.5));
  }

  return Math.round(clampedDelay);
}

/**
 * Execute an async function with retry logic
 *
 * Retries on failure with exponential backoff. Returns the result
 * on success or throws the last error after exhausting retries.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we've exhausted retries
      if (attempt >= cfg.maxRetries) {
        break;
      }

      // Check if the error is retryable
      if (cfg.isRetryable && !cfg.isRetryable(error)) {
        break;
      }

      const delay = calculateDelay(attempt, cfg);
      cfg.onRetry?.(attempt + 1, error, delay);

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Execute an async function with retry, returning a result object
 * instead of throwing on failure
 */
export async function withRetrySafe<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<RetryResult<T>> {
  const cfg: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;
  let attempts = 0;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    attempts = attempt + 1;
    try {
      const data = await fn();
      return { success: true, data, attempts };
    } catch (error) {
      lastError = error;

      if (attempt >= cfg.maxRetries) {
        break;
      }

      if (cfg.isRetryable && !cfg.isRetryable(error)) {
        break;
      }

      const delay = calculateDelay(attempt, cfg);
      cfg.onRetry?.(attempt + 1, error, delay);

      await sleep(delay);
    }
  }

  return { success: false, error: lastError, attempts };
}

/**
 * Sleep helper (exported for testing)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
