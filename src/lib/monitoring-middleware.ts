/**
 * API Latency Tracking Middleware for Next.js
 *
 * Wraps API route handlers to automatically track response times
 * and classify errors by category.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordApiLatency, ErrorCategory } from './monitoring';
import { CircuitOpenError } from './circuit-breaker';
import { createLogger, serializeError } from './logger';

const log = createLogger('monitoring:middleware');

type RouteHandler = (
  request: NextRequest,
  context?: { params?: Record<string, string> }
) => Promise<NextResponse> | NextResponse;

/**
 * Classify an HTTP status code into an error category
 */
export function classifyStatusCode(statusCode: number): ErrorCategory {
  if (statusCode >= 200 && statusCode < 400) return 'none';
  if (statusCode === 401 || statusCode === 403) return 'auth';
  if (statusCode === 400 || statusCode === 422) return 'validation';
  if (statusCode === 404) return 'not_found';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 503) return 'circuit_breaker';
  if (statusCode === 504 || statusCode === 408) return 'timeout';
  if (statusCode >= 500) return 'server_error';
  return 'unknown';
}

/**
 * Classify a thrown error into an error category
 */
export function classifyError(error: unknown): ErrorCategory {
  if (error instanceof CircuitOpenError) return 'circuit_breaker';
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('econnaborted')) return 'timeout';
    if (msg.includes('unauthorized') || msg.includes('forbidden') || msg.includes('authentication')) return 'auth';
    if (msg.includes('not found') || msg.includes('enoent')) return 'not_found';
    if (msg.includes('rate limit') || msg.includes('too many requests')) return 'rate_limit';
    if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
  }
  return 'server_error';
}

/**
 * Wrap a Next.js API route handler with latency tracking
 */
export function withLatencyTracking(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, context?: { params?: Record<string, string> }) => {
    const start = Date.now();
    const endpoint = request.nextUrl.pathname;
    const method = request.method;

    try {
      const response = await handler(request, context);
      const latencyMs = Date.now() - start;

      // Record the metric asynchronously (don't wait)
      recordApiLatency({
        endpoint,
        method,
        latencyMs,
        statusCode: response.status,
        errorCategory: classifyStatusCode(response.status),
      }).catch((err) => {
        log.warn('Failed to record latency', serializeError(err));
      });

      return response;
    } catch (error) {
      const latencyMs = Date.now() - start;

      // Record error metric with classification
      recordApiLatency({
        endpoint,
        method,
        latencyMs,
        statusCode: 500,
        errorCategory: classifyError(error),
      }).catch((err) => {
        log.warn('Failed to record latency', serializeError(err));
      });

      throw error;
    }
  };
}

/**
 * Higher-order function to combine with other middleware (like withAuth)
 */
export function composeWithLatency<T extends RouteHandler>(
  middleware: (handler: T) => RouteHandler,
  handler: T
): RouteHandler {
  return withLatencyTracking(middleware(handler));
}

/**
 * Normalize endpoint path for grouping
 * e.g., /api/automation/trailing-stop/abc123 -> /api/automation/trailing-stop/[id]
 */
export function normalizeEndpoint(path: string): string {
  // Replace UUID-like segments with [id]
  const uuidPattern = /\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
  let normalized = path.replace(uuidPattern, '/[id]');

  // Replace CUID-like segments with [id] (alphanumeric, typically 25 chars)
  const cuidPattern = /\/c[a-z0-9]{24,25}(?=\/|$)/gi;
  normalized = normalized.replace(cuidPattern, '/[id]');

  // Replace numeric IDs with [id]
  const numericIdPattern = /\/\d+(?=\/|$)/g;
  normalized = normalized.replace(numericIdPattern, '/[id]');

  return normalized;
}
