import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from './api-auth';

/**
 * Standard API success response
 */
export function apiSuccess<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Standard API error response
 */
export function apiError(message: string, status = 500): NextResponse {
  return NextResponse.json({ success: false, error: message }, { status });
}

/**
 * Create an authenticated API handler with automatic error handling.
 * Eliminates boilerplate try/catch in every route.
 */
export function apiHandler(
  handler: (request: NextRequest) => Promise<NextResponse>
) {
  return withAuth(async function(request: NextRequest, _context?: Record<string, unknown>) {
    try {
      return await handler(request);
    } catch (error) {
      const method = request?.method ?? 'UNKNOWN';
      const pathname = request?.nextUrl?.pathname ?? 'unknown';
      console.error(`API error [${method} ${pathname}]:`, error);
      return apiError('Internal server error');
    }
  });
}
