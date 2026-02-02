/**
 * Tests for API Authentication Middleware
 */

import { NextRequest } from 'next/server';

// Mock env module
jest.mock('../../src/lib/env', () => ({
  getOptionalEnv: jest.fn((name: string, defaultValue: string) => {
    if (name === 'HFT_API_KEY') return 'test-api-key-123';
    return defaultValue;
  }),
}));

import { authenticateRequest, isAuthEnabled, withAuth } from '../../src/lib/api-auth';
import { getOptionalEnv } from '../../src/lib/env';

describe('API Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAuthEnabled', () => {
    it('should return true when API key is set', () => {
      expect(isAuthEnabled()).toBe(true);
    });

    it('should return false when API key is not set', () => {
      (getOptionalEnv as jest.Mock).mockReturnValueOnce('');
      // Need to re-import to pick up new value
      jest.resetModules();
      jest.doMock('../../src/lib/env', () => ({
        getOptionalEnv: jest.fn(() => ''),
      }));
      // Dynamic require needed after jest.resetModules() to pick up new mock values
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { isAuthEnabled: isAuthEnabledNew } = require('../../src/lib/api-auth');
      expect(isAuthEnabledNew()).toBe(false);
    });
  });

  describe('authenticateRequest', () => {
    function createRequest(headers: Record<string, string> = {}): NextRequest {
      const url = 'http://localhost:3000/api/test';
      return new NextRequest(url, {
        headers: new Headers(headers),
      });
    }

    it('should authenticate with valid X-API-Key header', () => {
      const request = createRequest({ 'X-API-Key': 'test-api-key-123' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(true);
    });

    it('should authenticate with Bearer token', () => {
      const request = createRequest({ 'Authorization': 'Bearer test-api-key-123' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(true);
    });

    it('should authenticate with direct Authorization header', () => {
      const request = createRequest({ 'Authorization': 'test-api-key-123' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(true);
    });

    it('should reject invalid API key', () => {
      const request = createRequest({ 'X-API-Key': 'wrong-key' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });

    it('should reject request without API key', () => {
      const request = createRequest({});
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(false);
      if (!result.authenticated) {
        expect(result.response.status).toBe(401);
      }
    });

    it('should reject invalid Bearer token format', () => {
      const request = createRequest({ 'Authorization': 'Basic some-other-token' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(false);
    });

    it('should include client ID when authenticated', () => {
      const request = createRequest({ 'X-API-Key': 'test-api-key-123' });
      const result = authenticateRequest(request);
      
      expect(result.authenticated).toBe(true);
      if (result.authenticated) {
        expect(result.clientId).toBeDefined();
        expect(result.clientId.startsWith('key:')).toBe(true);
      }
    });
  });

  describe('withAuth', () => {
    it('should pass through authenticated requests', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );

      const wrappedHandler = withAuth(mockHandler);
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: new Headers({ 'X-API-Key': 'test-api-key-123' }),
      });

      await wrappedHandler(request);

      // Handler is called with request and optional context
      expect(mockHandler).toHaveBeenCalledWith(request, undefined);
    });

    it('should block unauthenticated requests', async () => {
      const mockHandler = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 })
      );
      
      const wrappedHandler = withAuth(mockHandler);
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: new Headers({}),
      });
      
      const response = await wrappedHandler(request);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(response.status).toBe(401);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', () => {
      const request = new NextRequest('http://localhost:3000/api/test', {
        headers: new Headers({ 'X-API-Key': 'test-api-key-123' }),
      });
      
      // Make several requests
      for (let i = 0; i < 5; i++) {
        const result = authenticateRequest(request);
        expect(result.authenticated).toBe(true);
      }
    });

    // Note: Full rate limit testing would require time manipulation
    // This is a basic sanity check
    it('should track requests per client', () => {
      const request1 = new NextRequest('http://localhost:3000/api/test', {
        headers: new Headers({ 'X-API-Key': 'test-api-key-123' }),
      });
      const request2 = new NextRequest('http://localhost:3000/api/test', {
        headers: new Headers({ 'X-API-Key': 'different-key' }),
      });
      
      const result1 = authenticateRequest(request1);
      const result2 = authenticateRequest(request2);
      
      expect(result1.authenticated).toBe(true);
      // Second key is invalid, so should fail auth not rate limit
      expect(result2.authenticated).toBe(false);
    });
  });
});
