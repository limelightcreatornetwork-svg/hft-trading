import { NextRequest } from 'next/server';
import { activateKillSwitch, deactivateKillSwitch, isKillSwitchActive, getRiskConfig } from '@/lib/risk-engine';
import { cancelAllOrders, getOrders } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';
import { apiSuccess, apiError } from '@/lib/api-helpers';

// Disable caching - always fetch fresh data
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const GET = withAuth(async function GET(_request: NextRequest) {
  try {
    const config = await getRiskConfig();
    const killSwitchState = await isKillSwitchActive();
    const active = killSwitchState || !config.tradingEnabled;

    return apiSuccess({
      active,
      tradingEnabled: config.tradingEnabled,
      message: active ? 'Kill switch is ACTIVE - trading disabled' : 'Kill switch is OFF - trading enabled',
    });
  } catch (error) {
    console.error('Kill switch GET API error:', error);
    return apiError('Failed to get kill switch status');
  }
});

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, cancelOrders = true } = body;

    if (!action || !['activate', 'deactivate'].includes(action)) {
      return apiError('Invalid action. Use "activate" or "deactivate"', 400);
    }

    let cancelledOrders = 0;

    if (action === 'activate') {
      // Activate kill switch
      await activateKillSwitch();

      // Cancel all open orders if requested
      if (cancelOrders) {
        try {
          const openOrders = await getOrders('open');
          if (openOrders.length > 0) {
            const result = await cancelAllOrders();
            cancelledOrders = result.cancelled;
          }
        } catch (cancelError) {
          console.error('Error cancelling orders:', cancelError);
        }
      }

      return apiSuccess({
        active: true,
        message: 'Kill switch ACTIVATED - trading disabled',
        cancelledOrders,
      });
    } else {
      // Deactivate kill switch
      await deactivateKillSwitch();

      return apiSuccess({
        active: false,
        message: 'Kill switch DEACTIVATED - trading enabled',
      });
    }
  } catch (error) {
    console.error('Kill switch POST API error:', error);
    return apiError('Failed to toggle kill switch');
  }
});
