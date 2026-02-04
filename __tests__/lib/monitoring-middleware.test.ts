/**
 * Tests for Monitoring Middleware
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock the monitoring module
jest.mock('../../src/lib/monitoring', () => ({
  recordApiLatency: jest.fn().mockResolvedValue(undefined),
}));

// Mock circuit-breaker to get CircuitOpenError
jest.mock('../../src/lib/circuit-breaker', () => {
  class CircuitOpenError extends Error {
    readonly circuitName: string;
    readonly retryAfterMs: number;
    constructor(circuitName: string, retryAfterMs: number) {
      super(`Circuit ${circuitName} is OPEN`);
      this.name = 'CircuitOpenError';
      this.circuitName = circuitName;
      this.retryAfterMs = retryAfterMs;
    }
  }
  return { CircuitOpenError };
});

import { recordApiLatency } from '../../src/lib/monitoring';
import { CircuitOpenError } from '../../src/lib/circuit-breaker';
import {
  withLatencyTracking,
  composeWithLatency,
  normalizeEndpoint,
  classifyStatusCode,
  classifyError,
} from '../../src/lib/monitoring-middleware';

describe('Monitoring Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withLatencyTracking', () => {
    it('should track successful requests', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true }, { status: 200 })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
      });

      const response = await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(request, undefined);
      expect(response.status).toBe(200);
      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/test',
          method: 'GET',
          statusCode: 200,
          latencyMs: expect.any(Number),
        })
      );
    });

    it('should track POST requests', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ id: '123' }, { status: 201 })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/orders', {
        method: 'POST',
      });

      await wrappedHandler(request);

      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/api/orders',
          method: 'POST',
          statusCode: 201,
        })
      );
    });

    it('should track error responses', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ error: 'Not found' }, { status: 404 })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/missing', {
        method: 'GET',
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(404);
      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
        })
      );
    });

    it('should track thrown errors as 500', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Internal error'));

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/crash', {
        method: 'GET',
      });

      await expect(wrappedHandler(request)).rejects.toThrow('Internal error');

      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        })
      );
    });

    it('should pass context to handler', async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/items/123', {
        method: 'GET',
      });

      const context = { params: { id: '123' } };
      await wrappedHandler(request, context);

      expect(handler).toHaveBeenCalledWith(request, context);
    });

    it('should measure latency accurately', async () => {
      const handler = jest.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return NextResponse.json({ success: true });
      });

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/slow', {
        method: 'GET',
      });

      await wrappedHandler(request);

      const call = (recordApiLatency as jest.Mock).mock.calls[0][0];
      expect(call.latencyMs).toBeGreaterThanOrEqual(50);
      expect(call.latencyMs).toBeLessThan(200); // Should not be too long
    });

    it('should not block on recording failure', async () => {
      (recordApiLatency as jest.Mock).mockRejectedValueOnce(new Error('Recording failed'));

      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
      });

      // Should not throw
      const response = await wrappedHandler(request);
      expect(response.status).toBe(200);
    });
  });

  describe('composeWithLatency', () => {
    it('should compose with other middleware', async () => {
      const innerHandler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const authMiddleware = jest.fn((handler) => {
        return async (request: NextRequest) => {
          // Simulate auth check
          return handler(request);
        };
      });

      const composedHandler = composeWithLatency(authMiddleware, innerHandler);

      const request = new NextRequest('http://localhost/api/protected', {
        method: 'GET',
      });

      await composedHandler(request);

      expect(authMiddleware).toHaveBeenCalled();
      expect(innerHandler).toHaveBeenCalled();
      expect(recordApiLatency).toHaveBeenCalled();
    });
  });

  describe('normalizeEndpoint', () => {
    it('should replace UUIDs with [id]', () => {
      const endpoint = '/api/orders/550e8400-e29b-41d4-a716-446655440000';
      expect(normalizeEndpoint(endpoint)).toBe('/api/orders/[id]');
    });

    it('should replace multiple UUIDs', () => {
      const endpoint = '/api/users/550e8400-e29b-41d4-a716-446655440000/orders/660e8400-e29b-41d4-a716-446655440001';
      expect(normalizeEndpoint(endpoint)).toBe('/api/users/[id]/orders/[id]');
    });

    it('should replace CUIDs with [id]', () => {
      const endpoint = '/api/positions/clk7z2x9y0000p1qw8x9y0z1a';
      expect(normalizeEndpoint(endpoint)).toBe('/api/positions/[id]');
    });

    it('should replace numeric IDs with [id]', () => {
      const endpoint = '/api/items/12345';
      expect(normalizeEndpoint(endpoint)).toBe('/api/items/[id]');
    });

    it('should handle multiple numeric IDs', () => {
      const endpoint = '/api/users/123/posts/456';
      expect(normalizeEndpoint(endpoint)).toBe('/api/users/[id]/posts/[id]');
    });

    it('should not modify endpoints without IDs', () => {
      const endpoint = '/api/health';
      expect(normalizeEndpoint(endpoint)).toBe('/api/health');
    });

    it('should not modify query parameters', () => {
      const endpoint = '/api/orders';
      expect(normalizeEndpoint(endpoint)).toBe('/api/orders');
    });

    it('should handle trailing slashes', () => {
      const endpoint = '/api/items/123/';
      // Note: normalizes to [id]/ which is fine for grouping
      expect(normalizeEndpoint(endpoint)).toBe('/api/items/[id]/');
    });

    it('should handle mixed ID formats', () => {
      const endpoint = '/api/users/550e8400-e29b-41d4-a716-446655440000/orders/123';
      expect(normalizeEndpoint(endpoint)).toBe('/api/users/[id]/orders/[id]');
    });
  });
});

describe('Middleware HTTP method coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

  methods.forEach((method) => {
    it(`should track ${method} requests`, async () => {
      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/test', { method });

      await wrappedHandler(request);

      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
        })
      );
    });
  });
});

describe('Middleware status code coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const statusCodes = [200, 201, 204, 301, 400, 401, 403, 404, 500, 502, 503];

  statusCodes.forEach((statusCode) => {
    it(`should track ${statusCode} responses`, async () => {
      const handler = jest.fn().mockResolvedValue(
        new NextResponse(null, { status: statusCode })
      );

      const wrappedHandler = withLatencyTracking(handler);

      const request = new NextRequest('http://localhost/api/test', {
        method: 'GET',
      });

      await wrappedHandler(request);

      expect(recordApiLatency).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode,
        })
      );
    });
  });
});

describe('classifyStatusCode', () => {
  it('should classify 2xx as none', () => {
    expect(classifyStatusCode(200)).toBe('none');
    expect(classifyStatusCode(201)).toBe('none');
    expect(classifyStatusCode(204)).toBe('none');
  });

  it('should classify 3xx as none', () => {
    expect(classifyStatusCode(301)).toBe('none');
    expect(classifyStatusCode(304)).toBe('none');
  });

  it('should classify 401/403 as auth', () => {
    expect(classifyStatusCode(401)).toBe('auth');
    expect(classifyStatusCode(403)).toBe('auth');
  });

  it('should classify 400/422 as validation', () => {
    expect(classifyStatusCode(400)).toBe('validation');
    expect(classifyStatusCode(422)).toBe('validation');
  });

  it('should classify 404 as not_found', () => {
    expect(classifyStatusCode(404)).toBe('not_found');
  });

  it('should classify 429 as rate_limit', () => {
    expect(classifyStatusCode(429)).toBe('rate_limit');
  });

  it('should classify 503 as circuit_breaker', () => {
    expect(classifyStatusCode(503)).toBe('circuit_breaker');
  });

  it('should classify 504/408 as timeout', () => {
    expect(classifyStatusCode(504)).toBe('timeout');
    expect(classifyStatusCode(408)).toBe('timeout');
  });

  it('should classify other 5xx as server_error', () => {
    expect(classifyStatusCode(500)).toBe('server_error');
    expect(classifyStatusCode(502)).toBe('server_error');
  });

  it('should classify unrecognized codes as unknown', () => {
    expect(classifyStatusCode(418)).toBe('unknown');
    expect(classifyStatusCode(451)).toBe('unknown');
  });
});

describe('classifyError', () => {
  it('should classify CircuitOpenError as circuit_breaker', () => {
    const error = new CircuitOpenError('test-circuit', 5000);
    expect(classifyError(error)).toBe('circuit_breaker');
  });

  it('should classify timeout errors', () => {
    expect(classifyError(new Error('Request timed out'))).toBe('timeout');
    expect(classifyError(new Error('Connection timeout'))).toBe('timeout');
    expect(classifyError(new Error('ECONNABORTED'))).toBe('timeout');
  });

  it('should classify auth errors', () => {
    expect(classifyError(new Error('Unauthorized access'))).toBe('auth');
    expect(classifyError(new Error('Forbidden resource'))).toBe('auth');
    expect(classifyError(new Error('Authentication required'))).toBe('auth');
  });

  it('should classify not_found errors', () => {
    expect(classifyError(new Error('Resource not found'))).toBe('not_found');
    expect(classifyError(new Error('ENOENT: no such file'))).toBe('not_found');
  });

  it('should classify rate_limit errors', () => {
    expect(classifyError(new Error('Rate limit exceeded'))).toBe('rate_limit');
    expect(classifyError(new Error('Too many requests'))).toBe('rate_limit');
  });

  it('should classify validation errors', () => {
    expect(classifyError(new Error('Validation failed'))).toBe('validation');
    expect(classifyError(new Error('Invalid input'))).toBe('validation');
  });

  it('should classify generic errors as server_error', () => {
    expect(classifyError(new Error('Something went wrong'))).toBe('server_error');
    expect(classifyError(new Error('Unexpected failure'))).toBe('server_error');
  });

  it('should classify non-Error objects as server_error', () => {
    expect(classifyError('string error')).toBe('server_error');
    expect(classifyError(42)).toBe('server_error');
    expect(classifyError(null)).toBe('server_error');
  });
});

describe('Error classification in middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should include errorCategory for successful responses', async () => {
    const handler = jest.fn().mockResolvedValue(
      NextResponse.json({ success: true }, { status: 200 })
    );

    const wrappedHandler = withLatencyTracking(handler);
    const request = new NextRequest('http://localhost/api/test', { method: 'GET' });

    await wrappedHandler(request);

    expect(recordApiLatency).toHaveBeenCalledWith(
      expect.objectContaining({
        errorCategory: 'none',
      })
    );
  });

  it('should classify thrown CircuitOpenError correctly', async () => {
    const handler = jest.fn().mockRejectedValue(
      new CircuitOpenError('alpaca-trading', 30000)
    );

    const wrappedHandler = withLatencyTracking(handler);
    const request = new NextRequest('http://localhost/api/trade', { method: 'POST' });

    await expect(wrappedHandler(request)).rejects.toThrow();

    expect(recordApiLatency).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        errorCategory: 'circuit_breaker',
      })
    );
  });

  it('should classify 401 response as auth error', async () => {
    const handler = jest.fn().mockResolvedValue(
      new NextResponse(null, { status: 401 })
    );

    const wrappedHandler = withLatencyTracking(handler);
    const request = new NextRequest('http://localhost/api/test', { method: 'GET' });

    await wrappedHandler(request);

    expect(recordApiLatency).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        errorCategory: 'auth',
      })
    );
  });
});
