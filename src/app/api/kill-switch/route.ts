import { NextRequest } from 'next/server';
import { activateKillSwitch, deactivateKillSwitch, isKillSwitchActive, getRiskConfig } from '@/lib/risk-engine';
import { cancelAllOrders, getOrders } from '@/lib/alpaca';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { createLogger, serializeError } from '@/lib/logger';

const log = createLogger('api:kill-switch');

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = apiHandler(async function GET(_request: NextRequest) {
  const config = await getRiskConfig();
  const killSwitchState = await isKillSwitchActive();
  const active = killSwitchState || !config.tradingEnabled;

  return apiSuccess({
    active,
    tradingEnabled: config.tradingEnabled,
    message: active ? 'Kill switch is ACTIVE - trading disabled' : 'Kill switch is OFF - trading enabled',
  });
});

export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, cancelOrders = true } = body;

  if (!action || !['activate', 'deactivate'].includes(action)) {
    return apiError('Invalid action. Use "activate" or "deactivate"', 400);
  }

  let cancelledOrders = 0;

  if (action === 'activate') {
    await activateKillSwitch();

    if (cancelOrders) {
      try {
        const openOrders = await getOrders('open');
        if (openOrders.length > 0) {
          const result = await cancelAllOrders();
          cancelledOrders = result.cancelled;
        }
      } catch (cancelError) {
        log.error('Error cancelling orders during kill switch activation', serializeError(cancelError));
      }
    }

    return apiSuccess({
      active: true,
      message: 'Kill switch ACTIVATED - trading disabled',
      cancelledOrders,
    });
  } else {
    await deactivateKillSwitch();

    return apiSuccess({
      active: false,
      message: 'Kill switch DEACTIVATED - trading enabled',
    });
  }
});
