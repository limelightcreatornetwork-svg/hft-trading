/**
 * Unified Automation Runner API Route
 * 
 * POST - Run all automation services in one call
 * 
 * This endpoint should be called periodically (e.g., every 10 seconds during market hours)
 * to monitor positions and execute automated trading logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import { isMarketOpen } from '@/lib/alpaca';
import { monitorAndExecute } from '@/lib/automation';
import { monitorTrailingStops } from '@/lib/trailing-stop';
import { monitorScaledExits } from '@/lib/scaled-exits';
import { monitorAlerts } from '@/lib/alert-system';
import { orderQueue } from '@/lib/order-queue';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface AutomationResult {
  timestamp: string;
  marketOpen: boolean;
  skipped: boolean;
  reason?: string;
  results?: {
    rules: Awaited<ReturnType<typeof monitorAndExecute>>;
    trailingStops: Awaited<ReturnType<typeof monitorTrailingStops>>;
    scaledExits: Awaited<ReturnType<typeof monitorScaledExits>>;
    alerts: Awaited<ReturnType<typeof monitorAlerts>>;
    orderQueue: {
      processed: number;
      submitted: number;
      failed: number;
      errors: string[];
    };
    orderSync: number;
  };
  totalTriggered: number;
  totalErrors: string[];
  durationMs: number;
}

export const POST = withAuth(async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json().catch(() => ({}));
    const force = body.force === true;
    const services = body.services || ['all']; // Can specify: rules, trailing, scaled, alerts, queue

    // Check if market is open (unless forced)
    const marketOpen = await isMarketOpen();
    if (!marketOpen && !force) {
      return NextResponse.json({
        success: true,
        data: {
          timestamp: new Date().toISOString(),
          marketOpen: false,
          skipped: true,
          reason: 'Market is closed',
          totalTriggered: 0,
          totalErrors: [],
          durationMs: Date.now() - startTime,
        } as AutomationResult,
      });
    }

    const runAll = services.includes('all');
    const allErrors: string[] = [];
    let totalTriggered = 0;

    // Run automation rules
    let rulesResult: Awaited<ReturnType<typeof monitorAndExecute>> | undefined;
    if (runAll || services.includes('rules')) {
      try {
        rulesResult = await monitorAndExecute();
        totalTriggered += rulesResult.rulesTriggered;
        allErrors.push(...rulesResult.errors);
      } catch (error) {
        allErrors.push(`Rules error: ${error}`);
      }
    }

    // Run trailing stops
    let trailingResult: Awaited<ReturnType<typeof monitorTrailingStops>> | undefined;
    if (runAll || services.includes('trailing')) {
      try {
        trailingResult = await monitorTrailingStops();
        totalTriggered += trailingResult.stopsTriggered;
        allErrors.push(...trailingResult.errors);
      } catch (error) {
        allErrors.push(`Trailing stops error: ${error}`);
      }
    }

    // Run scaled exits
    let scaledResult: Awaited<ReturnType<typeof monitorScaledExits>> | undefined;
    if (runAll || services.includes('scaled')) {
      try {
        scaledResult = await monitorScaledExits();
        totalTriggered += scaledResult.targetsTriggered + scaledResult.trailingTriggered;
        allErrors.push(...scaledResult.errors);
      } catch (error) {
        allErrors.push(`Scaled exits error: ${error}`);
      }
    }

    // Run alerts
    let alertsResult: Awaited<ReturnType<typeof monitorAlerts>> | undefined;
    if (runAll || services.includes('alerts')) {
      try {
        alertsResult = await monitorAlerts();
        totalTriggered += alertsResult.alertsTriggered;
        allErrors.push(...alertsResult.errors);
      } catch (error) {
        allErrors.push(`Alerts error: ${error}`);
      }
    }

    // Process order queue
    let queueResult: { processed: number; submitted: number; failed: number; errors: string[] } | undefined;
    if (runAll || services.includes('queue')) {
      try {
        const result = await orderQueue.processQueue();
        queueResult = {
          processed: result.processed,
          submitted: result.submitted,
          failed: result.failed,
          errors: result.errors,
        };
        allErrors.push(...result.errors);
      } catch (error) {
        allErrors.push(`Order queue error: ${error}`);
      }
    }

    // Sync order statuses
    let syncCount = 0;
    if (runAll || services.includes('queue')) {
      try {
        syncCount = await orderQueue.syncOrderStatuses();
      } catch (error) {
        allErrors.push(`Order sync error: ${error}`);
      }
    }

    const result: AutomationResult = {
      timestamp: new Date().toISOString(),
      marketOpen,
      skipped: false,
      results: {
        rules: rulesResult || { rulesChecked: 0, rulesTriggered: 0, errors: [], triggeredRules: [] },
        trailingStops: trailingResult || { stopsChecked: 0, stopsUpdated: 0, stopsTriggered: 0, errors: [], triggeredStops: [], updatedHighWaterMarks: [] },
        scaledExits: scaledResult || { plansChecked: 0, targetsTriggered: 0, trailingTriggered: 0, errors: [], executions: [] },
        alerts: alertsResult || { alertsChecked: 0, alertsTriggered: 0, errors: [], triggeredAlerts: [] },
        orderQueue: queueResult || { processed: 0, submitted: 0, failed: 0, errors: [] },
        orderSync: syncCount,
      },
      totalTriggered,
      totalErrors: allErrors,
      durationMs: Date.now() - startTime,
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Automation run error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to run automation',
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
});

export const GET = withAuth(async function GET(_request) {
  // Return automation status/summary
  try {
    const marketOpen = await isMarketOpen();
    const queueStats = orderQueue.getStats();

    return NextResponse.json({
      success: true,
      data: {
        marketOpen,
        orderQueue: queueStats,
        hint: 'POST to this endpoint to run automation. Use { force: true } to run even when market is closed.',
      },
    });
  } catch (error) {
    console.error('Automation status error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get automation status' },
      { status: 500 }
    );
  }
});
