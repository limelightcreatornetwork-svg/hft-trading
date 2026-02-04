/**
 * API Authentication Middleware
 *
 * Provides authentication for trading API endpoints.
 * Uses API key validation to prevent unauthorized access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOptionalEnv } from './env';
import { createLogger } from './logger';

const log = createLogger('api-auth');

/**
 * API key configuration
 * Set HFT_API_KEY in environment to enable authentication
 * In production, authentication is REQUIRED - first request will fail without it
 * In development, authentication is optional (logs warning if not set)
 */
const API_KEY = getOptionalEnv('HFT_API_KEY', '');

// Flag to track if auth validation has been performed
let authValidated = false;

/**
 * Validate auth configuration at runtime (not build time)
 * Called on first request to ensure production has proper auth configured
 */
function validateAuthConfig(): void {
  if (authValidated) return;
  authValidated = true;

  // Check for build phase - don't validate during build
  const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build';
  if (isBuildTime) return;

  // Enforce authentication in production
  if (!API_KEY && process.env.NODE_ENV === 'production') {
    throw new Error(
      'FATAL: HFT_API_KEY environment variable is required in production. ' +
      'Set this variable to a secure API key to enable authentication.'
    );
  }

  // Warn in development if auth is disabled
  if (!API_KEY && process.env.NODE_ENV !== 'production') {
    log.warn('HFT_API_KEY not set - authentication is disabled. Set in production.');
  }
}

/**
 * Rate limiting state (in-memory for simplicity)
 * For production, use Redis or similar
 */
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60; // 60 requests per minute

/**
 * Check if request is authenticated
 */
function isAuthenticated(request: NextRequest): boolean {
  // If no API key is configured, skip authentication (development mode)
  if (!API_KEY) {
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader) {
    // Support "Bearer <token>" format
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token === API_KEY) {
      return true;
    }
    // Also support direct API key
    if (authHeader === API_KEY) {
      return true;
    }
  }

  // Check X-API-Key header
  const apiKeyHeader = request.headers.get('X-API-Key');
  if (apiKeyHeader === API_KEY) {
    return true;
  }

  return false;
}

/**
 * Get client identifier for rate limiting
 */
function getClientId(request: NextRequest): string {
  // Use API key if present, otherwise use IP
  const apiKey = request.headers.get('X-API-Key') ||
                 request.headers.get('Authorization');

  if (apiKey) {
    return `key:${apiKey.slice(0, 8)}`;
  }

  // Fallback to IP from various headers
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIp || 'unknown';

  return `ip:${ip}`;
}

/**
 * Check rate limit
 */
function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const state = rateLimitState.get(clientId);

  // Clean up old entries
  if (state && state.resetAt < now) {
    rateLimitState.delete(clientId);
  }

  const current = rateLimitState.get(clientId) || {
    count: 0,
    resetAt: now + RATE_LIMIT_WINDOW_MS
  };

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: current.resetAt,
    };
  }

  current.count++;
  rateLimitState.set(clientId, current);

  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX_REQUESTS - current.count,
    resetAt: current.resetAt,
  };
}

/**
 * Unauthorized response
 */
function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error: 'Unauthorized',
      message: 'Valid API key required. Set X-API-Key header or Authorization: Bearer <key>'
    },
    { status: 401 }
  );
}

/**
 * Rate limit exceeded response
 */
function rateLimitResponse(resetAt: number): NextResponse {
  const response = NextResponse.json(
    {
      success: false,
      error: 'Rate limit exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    },
    { status: 429 }
  );

  response.headers.set('Retry-After', Math.ceil((resetAt - Date.now()) / 1000).toString());
  return response;
}

/**
 * Authentication result type
 */
export type AuthResult =
  | { authenticated: true; clientId: string }
  | { authenticated: false; response: NextResponse };

/**
 * Authenticate a request
 * Returns either success with client ID, or failure with error response
 */
export function authenticateRequest(request: NextRequest): AuthResult {
  // Validate auth config on first request (deferred from module load for build compatibility)
  validateAuthConfig();

  // Check authentication
  if (!isAuthenticated(request)) {
    return { authenticated: false, response: unauthorizedResponse() };
  }

  const clientId = getClientId(request);

  // Check rate limit
  const rateLimit = checkRateLimit(clientId);
  if (!rateLimit.allowed) {
    return { authenticated: false, response: rateLimitResponse(rateLimit.resetAt) };
  }

  return { authenticated: true, clientId };
}

/**
 * Route handler context type for Next.js 16+
 */
type RouteContext = { params: Promise<Record<string, string>> };

/**
 * Higher-order function to wrap route handlers with authentication
 *
 * Usage:
 * ```
 * export const POST = withAuth(async (request) => {
 *   // Handler code
 * });
 * ```
 */
export function withAuth(
  handler: (request: NextRequest, context?: RouteContext) => Promise<NextResponse>
): (request: NextRequest, context?: RouteContext) => Promise<NextResponse> {
  return async (request: NextRequest, context?: RouteContext): Promise<NextResponse> => {
    const authResult = authenticateRequest(request);

    if (!authResult.authenticated) {
      return authResult.response;
    }

    // Add rate limit headers to response
    const response = await handler(request, context);

    return response;
  };
}

/**
 * Check if authentication is enabled
 */
export function isAuthEnabled(): boolean {
  return !!API_KEY;
}
