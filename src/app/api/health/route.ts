import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { apiSuccess } from '@/lib/api-helpers';
import { authenticateRequest } from '@/lib/api-auth';
import { alpacaTradingCircuit, alpacaMarketDataCircuit } from '@/lib/circuit-breaker';

/**
 * GET /api/health
 * Health check endpoint for monitoring and deployment
 *
 * Two tiers:
 * - Public (no auth): Returns only { status, timestamp } - safe to expose
 * - Authenticated (with auth + ?detail=true): Returns full details including
 *   DB latency, memory usage, env var status, and individual checks
 *
 * Returns:
 * - status: 'healthy' | 'degraded' | 'unhealthy'
 * - timestamp: ISO timestamp
 * - (authenticated only) checks: individual component statuses
 * - (authenticated only) uptime: server uptime in seconds
 */

const startTime = Date.now();

interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  latencyMs?: number;
}

export async function GET(request: NextRequest) {
  const checks: HealthCheck[] = [];
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // 1. Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    checks.push({
      name: 'database',
      status: dbLatency < 1000 ? 'pass' : 'warn',
      message: dbLatency < 1000 ? 'Connected' : 'Slow response',
      latencyMs: dbLatency,
    });

    if (dbLatency >= 1000) {
      overallStatus = 'degraded';
    }
  } catch (_error) {
    checks.push({
      name: 'database',
      status: 'fail',
      message: 'Connection failed',
    });
    overallStatus = 'unhealthy';
  }

  // 2. Alpaca API check (check if credentials are configured)
  const alpacaKeyConfigured = !!process.env.ALPACA_API_KEY;
  const alpacaSecretConfigured = !!process.env.ALPACA_API_SECRET;

  if (alpacaKeyConfigured && alpacaSecretConfigured) {
    checks.push({
      name: 'alpaca_config',
      status: 'pass',
      message: 'Credentials configured',
    });
  } else {
    checks.push({
      name: 'alpaca_config',
      status: 'fail',
      message: 'Missing API credentials',
    });
    overallStatus = 'unhealthy';
  }

  // 2b. Circuit breaker status
  const tradingCB = alpacaTradingCircuit.getStats();
  const marketDataCB = alpacaMarketDataCircuit.getStats();

  const tradingCircuitOk = tradingCB.state === 'CLOSED';
  const marketDataCircuitOk = marketDataCB.state === 'CLOSED';

  if (tradingCircuitOk && marketDataCircuitOk) {
    checks.push({
      name: 'circuit_breakers',
      status: 'pass',
      message: `Trading: ${tradingCB.state}, Market Data: ${marketDataCB.state}`,
    });
  } else {
    const openCircuits: string[] = [];
    if (!tradingCircuitOk) openCircuits.push(`Trading: ${tradingCB.state}`);
    if (!marketDataCircuitOk) openCircuits.push(`Market Data: ${marketDataCB.state}`);

    checks.push({
      name: 'circuit_breakers',
      status: tradingCB.state === 'OPEN' || marketDataCB.state === 'OPEN' ? 'fail' : 'warn',
      message: openCircuits.join(', '),
    });

    if (tradingCB.state === 'OPEN' || marketDataCB.state === 'OPEN') {
      overallStatus = overallStatus === 'healthy' ? 'degraded' : overallStatus;
    }
  }

  // 3. Memory usage check
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
  const heapUsagePercent = Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100);

  if (heapUsagePercent > 90) {
    checks.push({
      name: 'memory',
      status: 'warn',
      message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
    });
    if (overallStatus === 'healthy') {
      overallStatus = 'degraded';
    }
  } else {
    checks.push({
      name: 'memory',
      status: 'pass',
      message: `${heapUsedMB}MB / ${heapTotalMB}MB (${heapUsagePercent}%)`,
    });
  }

  // 4. Environment check
  const requiredEnvVars = ['DATABASE_URL', 'ALPACA_API_KEY', 'ALPACA_API_SECRET'];
  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length === 0) {
    checks.push({
      name: 'environment',
      status: 'pass',
      message: 'All required variables set',
    });
  } else {
    checks.push({
      name: 'environment',
      status: 'fail',
      message: `Missing: ${missingVars.join(', ')}`,
    });
    overallStatus = 'unhealthy';
  }

  // Calculate uptime
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  // Check if detailed response is requested
  const wantDetail = request.nextUrl.searchParams.get('detail') === 'true';

  // If detail is requested, check authentication
  if (wantDetail) {
    const authResult = authenticateRequest(request);
    if (authResult.authenticated) {
      // Return full detailed response
      const responseData = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
        version: process.env.npm_package_version || '0.1.0',
        environment: process.env.NODE_ENV || 'development',
        checks,
      };

      const httpStatus =
        overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

      return apiSuccess(responseData, httpStatus);
    }
    // Not authenticated but requested detail - return auth error
    return authResult.response;
  }

  // Public response - only status and timestamp, no sensitive details
  const publicResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
  };

  const httpStatus =
    overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return apiSuccess(publicResponse, httpStatus);
}
