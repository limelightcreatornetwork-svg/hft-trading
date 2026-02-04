/**
 * Alerts API Routes
 *
 * GET  - Get active alerts and summary
 * POST - Create a new alert (price, P&L, or volume)
 */

import { NextRequest } from 'next/server';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import {
  createPriceAlert,
  createPnLAlert,
  createVolumeSpikeAlert,
  getActivePriceAlerts,
  getActivePnLAlerts,
  getActiveVolumeSpikeAlerts,
  getActiveAlertsSummary,
  getAlertHistory,
} from '@/lib/alert-system';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(request: NextRequest) {
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
    return apiSuccess({ alerts });
  }

  const summary = getActiveAlertsSummary();

  const data: {
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

  return apiSuccess(data);
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();

  const { alertType, ...params } = body;

  if (!alertType) {
    return apiError('alertType is required (price, pnl, volume)', 400);
  }

  let alert;

  switch (alertType) {
    case 'price': {
      const { symbol, type, targetValue, basePrice, message, priority, repeating, cooldownMinutes, expiresAt } = params;

      if (!symbol || !type || targetValue === undefined) {
        return apiError('symbol, type (PRICE_ABOVE/PRICE_BELOW/PRICE_CHANGE_PCT), and targetValue are required', 400);
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
        return apiError('type (PNL_ABOVE/PNL_BELOW/PNL_PCT_ABOVE/PNL_PCT_BELOW) and targetValue are required', 400);
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
        return apiError('symbol and multiplier are required', 400);
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
      return apiError(`Unknown alertType: ${alertType}`, 400);
  }

  return apiSuccess(alert);
});
