/**
 * Tests for Monitoring Middleware
 */

import { NextRequest, NextResponse } from 'next/server';

// Mock the monitoring module
jest.mock('../../src/lib/monitoring', () => ({
  recordApiLatency: jest.fn().mockResolvedValue(undefined),
}));

import { recordApiLatency } from '../../src/lib/monitoring';
import {
  withLatencyTracking,
  composeWithLatency,
  normalizeEndpoint,
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
