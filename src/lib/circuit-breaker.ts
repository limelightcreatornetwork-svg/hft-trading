/**
 * Circuit Breaker for External API Calls
 *
 * Prevents cascading failures when external services (e.g., Alpaca) are down.
 * Tracks consecutive failures and opens the circuit to fail fast.
 *
 * States:
 *   CLOSED  → Normal operation, requests pass through
 *   OPEN    → Failures exceeded threshold, requests fail immediately
 *   HALF_OPEN → After cooldown, allows one probe request to test recovery
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit */
  failureThreshold: number;
  /** Milliseconds to wait before allowing a probe request */
  cooldownMs: number;
  /** Optional callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState, name: string) => void;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 30_000, // 30 seconds
};

export class CircuitBreaker {
  readonly name: string;
  private config: CircuitBreakerConfig;
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private failureCount = 0;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitOpenError(this.name, this.remainingCooldownMs());
    }

    const wasHalfOpen = this.state === 'HALF_OPEN';

    try {
      const result = await fn();
      this.onSuccess(wasHalfOpen);
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Check if the circuit allows requests
   */
  canExecute(): boolean {
    switch (this.state) {
      case 'CLOSED':
        return true;
      case 'OPEN': {
        const elapsed = Date.now() - this.lastFailureTime;
        if (elapsed >= this.config.cooldownMs) {
          this.transition('HALF_OPEN');
          return true;
        }
        return false;
      }
      case 'HALF_OPEN':
        return true;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    // Auto-transition from OPEN to HALF_OPEN if cooldown expired
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.config.cooldownMs) {
        this.transition('HALF_OPEN');
      }
    }
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): {
    name: string;
    state: CircuitState;
    consecutiveFailures: number;
    totalSuccesses: number;
    totalFailures: number;
    lastFailureTime: number;
    remainingCooldownMs: number;
  } {
    return {
      name: this.name,
      state: this.getState(),
      consecutiveFailures: this.consecutiveFailures,
      totalSuccesses: this.successCount,
      totalFailures: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      remainingCooldownMs: this.remainingCooldownMs(),
    };
  }

  /**
   * Manually reset the circuit breaker to CLOSED
   */
  reset(): void {
    this.consecutiveFailures = 0;
    this.transition('CLOSED');
  }

  private onSuccess(wasHalfOpen: boolean): void {
    this.successCount++;
    this.consecutiveFailures = 0;
    if (wasHalfOpen) {
      this.transition('CLOSED');
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.config.failureThreshold) {
      this.transition('OPEN');
    }
  }

  private transition(newState: CircuitState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.config.onStateChange?.(oldState, newState, this.name);
  }

  private remainingCooldownMs(): number {
    if (this.state !== 'OPEN') return 0;
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.config.cooldownMs - elapsed);
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  readonly circuitName: string;
  readonly retryAfterMs: number;

  constructor(circuitName: string, retryAfterMs: number) {
    super(
      `Circuit breaker '${circuitName}' is OPEN. ` +
      `Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
    );
    this.name = 'CircuitOpenError';
    this.circuitName = circuitName;
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================
// Shared circuit breakers for external services
// ============================================

export const alpacaTradingCircuit = new CircuitBreaker('alpaca-trading', {
  failureThreshold: 5,
  cooldownMs: 30_000,
  onStateChange: (from, to, name) => {
    console.warn(`[CIRCUIT-BREAKER] ${name}: ${from} → ${to}`);
  },
});

export const alpacaMarketDataCircuit = new CircuitBreaker('alpaca-market-data', {
  failureThreshold: 3,
  cooldownMs: 15_000,
  onStateChange: (from, to, name) => {
    console.warn(`[CIRCUIT-BREAKER] ${name}: ${from} → ${to}`);
  },
});
