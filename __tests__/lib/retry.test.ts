/**
 * Tests for Retry Utility with Exponential Backoff
 */

import { calculateDelay, withRetry, withRetrySafe, sleep, RetryConfig } from '../../src/lib/retry';

// Mock setTimeout for faster tests
jest.useFakeTimers();

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  backoffMultiplier: 2,
  jitter: false,
};

describe('Retry Utility', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('calculateDelay', () => {
    it('should calculate exponential delay without jitter', () => {
      const config = { ...DEFAULT_CONFIG, jitter: false };
      expect(calculateDelay(0, config)).toBe(500);   // 500 * 2^0
      expect(calculateDelay(1, config)).toBe(1000);  // 500 * 2^1
      expect(calculateDelay(2, config)).toBe(2000);  // 500 * 2^2
      expect(calculateDelay(3, config)).toBe(4000);  // 500 * 2^3
    });

    it('should clamp delay to maxDelayMs', () => {
      const config = { ...DEFAULT_CONFIG, jitter: false, maxDelayMs: 3000 };
      expect(calculateDelay(0, config)).toBe(500);
      expect(calculateDelay(1, config)).toBe(1000);
      expect(calculateDelay(2, config)).toBe(2000);
      expect(calculateDelay(3, config)).toBe(3000); // Clamped from 4000
      expect(calculateDelay(10, config)).toBe(3000); // Clamped from 512000
    });

    it('should add jitter when enabled', () => {
      const config = { ...DEFAULT_CONFIG, jitter: true };
      // With jitter, delay should be between 50% and 100% of calculated delay
      const results = new Set<number>();
      for (let i = 0; i < 20; i++) {
        const delay = calculateDelay(1, config);
        expect(delay).toBeGreaterThanOrEqual(500);  // 1000 * 0.5
        expect(delay).toBeLessThanOrEqual(1000);    // 1000 * 1.0
        results.add(delay);
      }
      // With 20 runs, we should get at least 2 different values
      expect(results.size).toBeGreaterThan(1);
    });

    it('should handle custom backoff multiplier', () => {
      const config = { ...DEFAULT_CONFIG, jitter: false, backoffMultiplier: 3 };
      expect(calculateDelay(0, config)).toBe(500);   // 500 * 3^0
      expect(calculateDelay(1, config)).toBe(1500);  // 500 * 3^1
      expect(calculateDelay(2, config)).toBe(4500);  // 500 * 3^2
    });

    it('should round delays to integers', () => {
      const config = { ...DEFAULT_CONFIG, jitter: false, baseDelayMs: 333, backoffMultiplier: 1.5 };
      const delay = calculateDelay(1, config);
      expect(Number.isInteger(delay)).toBe(true);
    });
  });

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

    it('should return result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxRetries: 3 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        maxDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after exhausting retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('persistent failure'));

      await expect(withRetry(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
      })).rejects.toThrow('persistent failure');

      expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should respect isRetryable predicate', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('retryable'))
        .mockRejectedValueOnce(new Error('non-retryable'));

      const isRetryable = (error: unknown) => {
        return error instanceof Error && error.message === 'retryable';
      };

      await expect(withRetry(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        isRetryable,
      })).rejects.toThrow('non-retryable');

      expect(fn).toHaveBeenCalledTimes(2); // Stopped at non-retryable
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockResolvedValue('success');

      await withRetry(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });

    it('should not retry on first attempt success', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn().mockResolvedValue(42);

      const result = await withRetry(fn, { maxRetries: 3, onRetry });

      expect(result).toBe(42);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should use default config when none provided', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await withRetry(fn);
      expect(result).toBe('ok');
    });
  });

  describe('withRetrySafe', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      jest.useFakeTimers();
    });

    it('should return success result on success', async () => {
      const fn = jest.fn().mockResolvedValue('data');

      const result = await withRetrySafe(fn, { maxRetries: 3 });

      expect(result.success).toBe(true);
      expect(result.data).toBe('data');
      expect(result.attempts).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should return failure result after exhausting retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('boom'));

      const result = await withRetrySafe(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.data).toBeUndefined();
      expect(result.error).toBeInstanceOf(Error);
      expect(result.attempts).toBe(3); // 1 initial + 2 retries
    });

    it('should return success after retries', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('recovered');

      const result = await withRetrySafe(fn, {
        maxRetries: 3,
        baseDelayMs: 1,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBe('recovered');
      expect(result.attempts).toBe(2);
    });

    it('should stop early on non-retryable error', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fatal'));

      const result = await withRetrySafe(fn, {
        maxRetries: 5,
        baseDelayMs: 1,
        isRetryable: () => false,
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should call onRetry for each retry attempt', async () => {
      const onRetry = jest.fn();
      const fn = jest.fn().mockRejectedValue(new Error('fail'));

      await withRetrySafe(fn, {
        maxRetries: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
      expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error), expect.any(Number));
    });
  });

  describe('sleep', () => {
    it('should resolve after specified time', async () => {
      const promise = sleep(1000);

      jest.advanceTimersByTime(999);
      // Should not have resolved yet

      jest.advanceTimersByTime(1);
      await promise; // Now it should resolve
    });

    it('should resolve immediately for 0ms', async () => {
      const promise = sleep(0);
      jest.advanceTimersByTime(0);
      await promise;
    });
  });
});
