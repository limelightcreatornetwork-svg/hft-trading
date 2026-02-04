/**
 * Alerts API Routes
 * 
 * GET  - Get active alerts and summary
 * POST - Create a new alert (price, P&L, or volume)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/api-auth';
import {
  createPriceAlert,
  createPnLAlert,
  createVolumeSpikeAlert,
  getActivePriceAlerts,
  getActivePnLAlerts,
  getActiveVolumeSpikeAlerts,
  getActiveAlertsSummary,
  getAlertHistory,
  monitorAlerts,
} from '@/lib/alert-system';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'price', 'pnl', 'volume', or all
    const symbol = searchParams.get('symbol');
    const history = searchParams.get('history') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');

    if (history) {
      const alerts = await getAlertHistory({
        symbol: symbol || undefined,
        type: type || undefined,
        limit,
      });
      return NextResponse.json({
        success: true,
        data: { alerts },
      });
    }

    const summary = getActiveAlertsSummary();

    let data: {
      summary: typeof summary;
      priceAlerts?: ReturnType<typeof getActivePriceAlerts>;
      pnlAlerts?: ReturnType<typeof getActivePnLAlerts>;
      volumeAlerts?: ReturnType<typeof getActiveVolumeSpikeAlerts>;
    } = { summary };

    if (!type || type === 'price') {
      data.priceAlerts = getActivePriceAlerts(symbol || undefined);
    }
    if (!type || type === 'pnl') {
      data.pnlAlerts = getActivePnLAlerts(symbol || undefined);
    }
    if (!type || type === 'volume') {
      data.volumeAlerts = getActiveVolumeSpikeAlerts(symbol || undefined);
    }
    
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('GET alerts error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get alerts' },
      { status: 500 }
    );
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { alertType, ...params } = body;

    if (!alertType) {
      return NextResponse.json(
        { success: false, error: 'alertType is required (price, pnl, volume)' },
        { status: 400 }
      );
    }

    let alert;

    switch (alertType) {
      case 'price': {
        const { symbol, type, targetValue, basePrice, message, priority, repeating, cooldownMinutes, expiresAt } = params;
        
        if (!symbol || !type || targetValue === undefined) {
          return NextResponse.json(
            { success: false, error: 'symbol, type (PRICE_ABOVE/PRICE_BELOW/PRICE_CHANGE_PCT), and targetValue are required' },
            { status: 400 }
          );
        }

        alert = await createPriceAlert({
          symbol,
          alertType: type,
          targetValue,
          basePrice,
          message,
          priority,
          repeating,
          cooldownMinutes,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });
        break;
      }

      case 'pnl': {
        const { symbol, type, targetValue, message, priority, expiresAt } = params;
        
        if (!type || targetValue === undefined) {
          return NextResponse.json(
            { success: false, error: 'type (PNL_ABOVE/PNL_BELOW/PNL_PCT_ABOVE/PNL_PCT_BELOW) and targetValue are required' },
            { status: 400 }
          );
        }

        alert = await createPnLAlert({
          symbol, // Optional for portfolio-level
          alertType: type,
          targetValue,
          message,
          priority,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        });
        break;
      }

      case 'volume': {
        const { symbol, multiplier, averagePeriod, message, priority } = params;
        
        if (!symbol || !multiplier) {
          return NextResponse.json(
            { success: false, error: 'symbol and multiplier are required' },
            { status: 400 }
          );
        }

        alert = await createVolumeSpikeAlert({
          symbol,
          multiplier,
          averagePeriod,
          message,
          priority,
        });
        break;
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown alertType: ${alertType}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('POST alert error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create alert' },
      { status: 500 }
    );
  }
});
