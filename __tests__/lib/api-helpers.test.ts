/**
 * Tests for API Helper Utilities
 *
 * Tests the standardized API response functions and error handling wrapper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { apiSuccess, apiError, apiHandler } from '@/lib/api-helpers';

// Mock api-auth
jest.mock('@/lib/api-auth', () => ({
  withAuth: jest.fn((handler) => handler),
}));

// =============================================================================
// MOCK FIXTURES
// =============================================================================

const createMockRequest = (
  method: string = 'GET',
  pathname: string = '/api/test'
): NextRequest => {
  return {
    method,
    nextUrl: { pathname },
  } as unknown as NextRequest;
};

// =============================================================================
// apiSuccess TESTS
// =============================================================================

describe('apiSuccess', () => {
  it('should return success response with data', async () => {
    const data = { id: 1, name: 'test' };
    const response = apiSuccess(data);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
  });

  it('should allow custom status code', async () => {
    const data = { created: true };
    const response = apiSuccess(data, 201);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
  });

  it('should handle array data', async () => {
    const data = [1, 2, 3, 4, 5];
    const response = apiSuccess(data);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle string data', async () => {
    const response = apiSuccess('hello');
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBe('hello');
  });

  it('should handle null data', async () => {
    const response = apiSuccess(null);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBeNull();
  });

  it('should handle undefined data', async () => {
    const response = apiSuccess(undefined);
    const body = await response.json();

    expect(body.success).toBe(true);
    // undefined becomes null in JSON
  });

  it('should handle complex nested data', async () => {
    const data = {
      user: { id: 1, profile: { name: 'Test', settings: { theme: 'dark' } } },
      items: [{ id: 1 }, { id: 2 }],
      count: 100,
    };
    const response = apiSuccess(data);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual(data);
  });

  it('should handle boolean data', async () => {
    const response = apiSuccess(true);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBe(true);
  });

  it('should handle numeric data', async () => {
    const response = apiSuccess(42);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toBe(42);
  });

  it('should handle empty object data', async () => {
    const response = apiSuccess({});
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual({});
  });

  it('should handle empty array data', async () => {
    const response = apiSuccess([]);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// =============================================================================
// apiError TESTS
// =============================================================================

describe('apiError', () => {
  it('should return error response with message', async () => {
    const response = apiError('Something went wrong');
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Something went wrong');
  });

  it('should allow custom status code', async () => {
    const response = apiError('Not found', 404);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not found');
  });

  it('should handle 400 Bad Request', async () => {
    const response = apiError('Invalid input', 400);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid input');
  });

  it('should handle 401 Unauthorized', async () => {
    const response = apiError('Authentication required', 401);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Authentication required');
  });

  it('should handle 403 Forbidden', async () => {
    const response = apiError('Access denied', 403);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Access denied');
  });

  it('should handle 422 Unprocessable Entity', async () => {
    const response = apiError('Validation failed', 422);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error).toBe('Validation failed');
  });

  it('should handle 429 Too Many Requests', async () => {
    const response = apiError('Rate limit exceeded', 429);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toBe('Rate limit exceeded');
  });

  it('should handle 503 Service Unavailable', async () => {
    const response = apiError('Service unavailable', 503);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe('Service unavailable');
  });

  it('should handle empty error message', async () => {
    const response = apiError('');
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toBe('');
  });

  it('should handle long error messages', async () => {
    const longMessage = 'A'.repeat(1000);
    const response = apiError(longMessage);
    const body = await response.json();

    expect(body.error).toBe(longMessage);
  });

  it('should handle special characters in error message', async () => {
    const response = apiError('Error: "test" <script>alert(1)</script>');
    const body = await response.json();

    expect(body.error).toBe('Error: "test" <script>alert(1)</script>');
  });
});

// =============================================================================
// apiHandler TESTS
// =============================================================================

describe('apiHandler', () => {
  it('should wrap handler and pass through successful response', async () => {
    const handler = jest.fn().mockResolvedValue(apiSuccess({ result: 'ok' }));
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(handler).toHaveBeenCalledWith(request, undefined);
    expect(body.success).toBe(true);
    expect(body.data.result).toBe('ok');
  });

  it('should catch errors and return error response', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Handler error'));
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');
    expect(response.status).toBe(500);

    consoleSpy.mockRestore();
  });

  it('should log error with request method and pathname', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Test error');
    const handler = jest.fn().mockRejectedValue(error);
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest('POST', '/api/orders');

    await wrappedHandler(request);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"method":"POST"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('"pathname":"/api/orders"')
    );

    consoleSpy.mockRestore();
  });

  it('should handle synchronous errors', async () => {
    const handler = jest.fn().mockImplementation(() => {
      throw new Error('Sync error');
    });
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');

    consoleSpy.mockRestore();
  });

  it('should handle different HTTP methods', async () => {
    const handler = jest.fn().mockResolvedValue(apiSuccess({ ok: true }));
    const wrappedHandler = apiHandler(handler);

    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    for (const method of methods) {
      const request = createMockRequest(method, '/api/test');
      await wrappedHandler(request);
      expect(handler).toHaveBeenCalled();
    }
  });

  it('should handle null/undefined request gracefully', async () => {
    const handler = jest.fn().mockRejectedValue(new Error('Error'));
    const wrappedHandler = apiHandler(handler);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Create minimal mock request
    const request = {
      method: undefined,
      nextUrl: undefined,
    } as unknown as NextRequest;

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should preserve the response from handler', async () => {
    const customResponse = NextResponse.json(
      { custom: 'data', meta: { page: 1 } },
      { status: 201 }
    );
    const handler = jest.fn().mockResolvedValue(customResponse);
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.custom).toBe('data');
    expect(body.meta.page).toBe(1);
  });

  it('should handle TypeError exceptions', async () => {
    const handler = jest.fn().mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obj: any = null;
      return obj.property; // TypeError: Cannot read property of null
    });
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');

    consoleSpy.mockRestore();
  });

  it('should handle string errors', async () => {
    const handler = jest.fn().mockRejectedValue('String error');
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest();

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await wrappedHandler(request);
    const body = await response.json();

    expect(body.success).toBe(false);
    expect(body.error).toBe('Internal server error');

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('api-helpers integration', () => {
  it('should work together for typical success flow', async () => {
    const handler = async (_req: NextRequest) => {
      const data = { items: [1, 2, 3], total: 3 };
      return apiSuccess(data);
    };
    
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest('GET', '/api/items');
    
    const response = await wrappedHandler(request);
    const body = await response.json();
    
    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([1, 2, 3]);
  });

  it('should work together for typical error flow', async () => {
    const handler = async (_req: NextRequest) => {
      return apiError('Item not found', 404);
    };
    
    const wrappedHandler = apiHandler(handler);
    const request = createMockRequest('GET', '/api/items/999');
    
    const response = await wrappedHandler(request);
    const body = await response.json();
    
    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Item not found');
  });

  it('should handle validation errors properly', async () => {
    const handler = async (req: NextRequest) => {
      // Simulate validation
      const body = await req.json?.();
      if (!body?.name) {
        return apiError('Name is required', 400);
      }
      return apiSuccess({ created: true }, 201);
    };
    
    const wrappedHandler = apiHandler(handler);
    const request = {
      ...createMockRequest('POST', '/api/items'),
      json: () => Promise.resolve({}),
    } as unknown as NextRequest;
    
    const response = await wrappedHandler(request);
    const body = await response.json();
    
    expect(response.status).toBe(400);
    expect(body.error).toBe('Name is required');
  });
});

// =============================================================================
// RESPONSE STRUCTURE TESTS
// =============================================================================

describe('response structure consistency', () => {
  it('success responses should always have success=true and data', async () => {
    const testData = [
      { value: 'string' },
      123,
      [1, 2, 3],
      null,
      true,
      { nested: { deep: { value: 1 } } },
    ];

    for (const data of testData) {
      const response = apiSuccess(data);
      const body = await response.json();

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
      expect(body).not.toHaveProperty('error');
    }
  });

  it('error responses should always have success=false and error', async () => {
    const testCases = [
      { message: 'Error 1', status: 400 },
      { message: 'Error 2', status: 401 },
      { message: 'Error 3', status: 403 },
      { message: 'Error 4', status: 404 },
      { message: 'Error 5', status: 500 },
    ];

    for (const { message, status } of testCases) {
      const response = apiError(message, status);
      const body = await response.json();

      expect(body).toHaveProperty('success', false);
      expect(body).toHaveProperty('error', message);
      expect(body).not.toHaveProperty('data');
    }
  });
});
