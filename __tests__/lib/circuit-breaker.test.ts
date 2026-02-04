import {
  CircuitBreaker,
  CircuitOpenError,
  CircuitState,
} from '../../src/lib/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      cooldownMs: 1000,
    });
  });

  // =====================================================================
  // Initial state
  // =====================================================================
  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('allows execution in CLOSED state', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('reports zero stats initially', () => {
      const stats = breaker.getStats();
      expect(stats.name).toBe('test');
      expect(stats.state).toBe('CLOSED');
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.remainingCooldownMs).toBe(0);
    });
  });

  // =====================================================================
  // Successful execution
  // =====================================================================
  describe('successful execution', () => {
    it('passes through successful calls', async () => {
      const result = await breaker.execute(() => Promise.resolve(42));
      expect(result).toBe(42);
    });

    it('tracks success count', async () => {
      await breaker.execute(() => Promise.resolve('a'));
      await breaker.execute(() => Promise.resolve('b'));

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(0);
    });

    it('stays CLOSED after successes', async () => {
      for (let i = 0; i < 10; i++) {
        await breaker.execute(() => Promise.resolve(i));
      }
      expect(breaker.getState()).toBe('CLOSED');
    });
  });

  // =====================================================================
  // Failure tracking and circuit opening
  // =====================================================================
  describe('failure tracking', () => {
    const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    it('stays CLOSED below threshold', async () => {
      await fail();
      await fail();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getStats().consecutiveFailures).toBe(2);
    });

    it('opens after reaching failure threshold', async () => {
      await fail();
      await fail();
      await fail();

      expect(breaker.getState()).toBe('OPEN');
    });

    it('tracks failure count', async () => {
      await fail();
      await fail();
      await fail();

      const stats = breaker.getStats();
      expect(stats.totalFailures).toBe(3);
      expect(stats.consecutiveFailures).toBe(3);
    });

    it('resets consecutive failures on success', async () => {
      await fail();
      await fail();
      await breaker.execute(() => Promise.resolve('ok'));

      expect(breaker.getStats().consecutiveFailures).toBe(0);
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('re-throws the original error', async () => {
      const originalError = new Error('API timeout');
      await expect(
        breaker.execute(() => Promise.reject(originalError))
      ).rejects.toThrow('API timeout');
    });
  });

  // =====================================================================
  // OPEN state behavior
  // =====================================================================
  describe('OPEN state', () => {
    const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    beforeEach(async () => {
      await fail();
      await fail();
      await fail();
    });

    it('rejects calls immediately when OPEN', async () => {
      await expect(
        breaker.execute(() => Promise.resolve('should not run'))
      ).rejects.toThrow(CircuitOpenError);
    });

    it('canExecute returns false when OPEN', () => {
      expect(breaker.canExecute()).toBe(false);
    });

    it('CircuitOpenError has useful properties', async () => {
      try {
        await breaker.execute(() => Promise.resolve('nope'));
        fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        const err = error as CircuitOpenError;
        expect(err.circuitName).toBe('test');
        expect(err.retryAfterMs).toBeGreaterThan(0);
        expect(err.retryAfterMs).toBeLessThanOrEqual(1000);
      }
    });

    it('reports remaining cooldown', () => {
      const stats = breaker.getStats();
      expect(stats.remainingCooldownMs).toBeGreaterThan(0);
      expect(stats.remainingCooldownMs).toBeLessThanOrEqual(1000);
    });
  });

  // =====================================================================
  // HALF_OPEN state and recovery
  // =====================================================================
  describe('HALF_OPEN recovery', () => {
    const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

    beforeEach(async () => {
      // Use short cooldown for these tests
      breaker = new CircuitBreaker('test-recovery', {
        failureThreshold: 2,
        cooldownMs: 50, // 50ms cooldown
      });
      await fail();
      await fail();
      expect(breaker.getState()).toBe('OPEN');
    });

    it('transitions to HALF_OPEN after cooldown', async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(breaker.getState()).toBe('HALF_OPEN');
    });

    it('transitions to CLOSED on successful probe', async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      await breaker.execute(() => Promise.resolve('recovered'));

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });

    it('transitions back to OPEN on failed probe', async () => {
      await new Promise(resolve => setTimeout(resolve, 60));
      await fail();

      expect(breaker.getState()).toBe('OPEN');
    });
  });

  // =====================================================================
  // Manual reset
  // =====================================================================
  describe('reset', () => {
    it('resets circuit to CLOSED state', async () => {
      const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      await fail();
      await fail();
      await fail();
      expect(breaker.getState()).toBe('OPEN');

      breaker.reset();

      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });

    it('preserves total counts after reset', async () => {
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

      breaker.reset();

      const stats = breaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
      expect(stats.totalFailures).toBe(1);
    });
  });

  // =====================================================================
  // State change callback
  // =====================================================================
  describe('onStateChange callback', () => {
    it('fires when state transitions', async () => {
      const transitions: { from: CircuitState; to: CircuitState; name: string }[] = [];

      breaker = new CircuitBreaker('callback-test', {
        failureThreshold: 2,
        cooldownMs: 50,
        onStateChange: (from, to, name) => {
          transitions.push({ from, to, name });
        },
      });

      const fail = () => breaker.execute(() => Promise.reject(new Error('fail'))).catch(() => {});

      await fail();
      await fail();

      expect(transitions).toEqual([
        { from: 'CLOSED', to: 'OPEN', name: 'callback-test' },
      ]);

      // Wait for cooldown, then succeed to close
      await new Promise(resolve => setTimeout(resolve, 60));
      await breaker.execute(() => Promise.resolve('ok'));

      expect(transitions).toEqual([
        { from: 'CLOSED', to: 'OPEN', name: 'callback-test' },
        { from: 'OPEN', to: 'HALF_OPEN', name: 'callback-test' },
        { from: 'HALF_OPEN', to: 'CLOSED', name: 'callback-test' },
      ]);
    });

    it('does not fire for no-op transitions', async () => {
      const calls: string[] = [];
      breaker = new CircuitBreaker('noop', {
        failureThreshold: 3,
        cooldownMs: 1000,
        onStateChange: (_from, to) => calls.push(to),
      });

      // Multiple successes should not trigger transitions
      await breaker.execute(() => Promise.resolve(1));
      await breaker.execute(() => Promise.resolve(2));

      expect(calls).toEqual([]);
    });
  });

  // =====================================================================
  // CircuitOpenError
  // =====================================================================
  describe('CircuitOpenError', () => {
    it('has correct name', () => {
      const err = new CircuitOpenError('my-circuit', 5000);
      expect(err.name).toBe('CircuitOpenError');
    });

    it('has descriptive message', () => {
      const err = new CircuitOpenError('alpaca', 15000);
      expect(err.message).toContain('alpaca');
      expect(err.message).toContain('OPEN');
      expect(err.message).toContain('15s');
    });

    it('is instance of Error', () => {
      const err = new CircuitOpenError('test', 1000);
      expect(err).toBeInstanceOf(Error);
    });
  });

  // =====================================================================
  // Edge cases
  // =====================================================================
  describe('edge cases', () => {
    it('works with threshold of 1', async () => {
      breaker = new CircuitBreaker('strict', { failureThreshold: 1, cooldownMs: 100 });

      await breaker.execute(() => Promise.reject(new Error('one fail'))).catch(() => {});
      expect(breaker.getState()).toBe('OPEN');
    });

    it('handles sync-like async functions', async () => {
      const result = await breaker.execute(async () => 'immediate');
      expect(result).toBe('immediate');
    });

    it('handles mixed successes and failures below threshold', async () => {
      await breaker.execute(() => Promise.reject(new Error('1'))).catch(() => {});
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.reject(new Error('2'))).catch(() => {});
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.reject(new Error('3'))).catch(() => {});

      // Should still be CLOSED because successes reset consecutive counter
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.getStats().consecutiveFailures).toBe(1);
    });
  });
});
