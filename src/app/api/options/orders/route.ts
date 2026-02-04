import { NextRequest } from 'next/server';
import {
  submitOptionsOrder,
  parseOptionSymbol,
  canSellCoveredCall,
  canSellCashSecuredPut,
} from '@/lib/alpaca-options';
import { getPositions, getAccount } from '@/lib/alpaca';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';
import { audit } from '@/lib/audit-log';
import { alpacaConfig } from '@/lib/env';
import { validateSide, validateOrderType, validatePositiveNumber } from '@/lib/validation';

/**
 * POST /api/options/orders
 * Submit an options order
 *
 * Level 1 supported strategies:
 * - Covered Call: Sell call against owned shares
 * - Cash-Secured Put: Sell put with cash collateral
 */
export const POST = apiHandler(async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    symbol,
    limitPrice,
    strategy,
    skipValidation = false,
  } = body;

  // Validate option symbol
  if (!symbol || typeof symbol !== 'string') {
    return apiError('Option symbol is required', 400);
  }

  // Parse option symbol to understand what we're trading
  const parsed = parseOptionSymbol(symbol);
  if (!parsed) {
    return apiError('Invalid option symbol format. Expected format: AAPL240119C00100000', 400);
  }

  // Validate side
  const sideResult = validateSide(body.side?.toLowerCase?.());
  if (!sideResult.valid) {
    return apiError(sideResult.error, 400);
  }
  const side = sideResult.value;

  // Validate quantity
  const quantityResult = validatePositiveNumber(body.quantity, 'quantity', { integer: true });
  if (!quantityResult.valid) {
    return apiError(quantityResult.error, 400);
  }
  const quantity = quantityResult.value;

  // Validate type (default to limit for options)
  const typeResult = validateOrderType(body.type?.toLowerCase?.() || 'limit');
  if (!typeResult.valid) {
    return apiError(typeResult.error, 400);
  }
  const type = typeResult.value;

  // Level 1 validation (unless explicitly skipped)
  if (!skipValidation && side === 'sell') {
    const [positions, account] = await Promise.all([
      getPositions(),
      getAccount(),
    ]);

    if (parsed.type === 'call') {
      // Covered call - need underlying shares
      const validation = canSellCoveredCall(
        positions.map(p => ({ symbol: p.symbol, qty: p.qty })),
        parsed.rootSymbol,
        quantity
      );

      if (!validation.allowed) {
        return apiError('Level 1 Restriction: Covered call requires underlying shares', 403);
      }
    } else {
      // Cash-secured put - need buying power
      const validation = canSellCashSecuredPut(
        parseFloat(account.buying_power),
        parsed.strikePrice,
        quantity
      );

      if (!validation.allowed) {
        return apiError('Level 1 Restriction: Cash-secured put requires sufficient buying power', 403);
      }
    }
  }

  // Validate limit price for limit orders
  if (type === 'limit' && !limitPrice) {
    return apiError('Limit price required for limit orders', 400);
  }

  // Submit order to Alpaca
  const order = await submitOptionsOrder({
    symbol: symbol.toUpperCase(),
    qty: quantity,
    side,
    type,
    time_in_force: 'day', // Options must be day orders
    limit_price: limitPrice,
  });

  // Audit log the options order
  const resolvedStrategy = strategy || (side === 'sell'
    ? (parsed.type === 'call' ? 'covered_call' : 'cash_secured_put')
    : 'buy_option');

  await audit.orderSubmitted(order.id || 'unknown', symbol.toUpperCase(), {
    type: 'options',
    side,
    quantity,
    strategy: resolvedStrategy,
    underlying: parsed.rootSymbol,
    expiration: parsed.expirationDate,
    strike: parsed.strikePrice,
  });

  return apiSuccess({
    order,
    strategy: resolvedStrategy,
    parsed: {
      underlying: parsed.rootSymbol,
      expiration: parsed.expirationDate,
      type: parsed.type,
      strike: parsed.strikePrice,
    },
  });
});

/**
 * GET /api/options/orders
 * Get open options orders
 */
export const GET = apiHandler(async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status') || 'open';

  // Use the Alpaca orders endpoint with asset_class filter
  const response = await fetch(
    `${alpacaConfig.baseUrl}/v2/orders?status=${status}`,
    {
      headers: {
        'APCA-API-KEY-ID': alpacaConfig.apiKey,
        'APCA-API-SECRET-KEY': alpacaConfig.apiSecret,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch orders: ${response.statusText}`);
  }

  const orders = await response.json();

  // Filter to options only (symbols with option format)
  const optionsOrders = orders.filter((order: { symbol: string }) =>
    parseOptionSymbol(order.symbol) !== null
  );

  const formattedOrders = optionsOrders.map((order: {
    id: string;
    client_order_id: string;
    symbol: string;
    qty: string;
    filled_qty: string;
    type: string;
    side: string;
    limit_price: string | null;
    filled_avg_price: string | null;
    status: string;
    created_at: string;
    submitted_at: string;
    filled_at: string | null;
  }) => {
    const parsed = parseOptionSymbol(order.symbol);
    return {
      id: order.id,
      clientOrderId: order.client_order_id,
      symbol: order.symbol,
      underlying: parsed?.rootSymbol,
      expiration: parsed?.expirationDate,
      optionType: parsed?.type,
      strike: parsed?.strikePrice,
      quantity: parseInt(order.qty),
      filledQuantity: parseInt(order.filled_qty),
      type: order.type,
      side: order.side,
      limitPrice: order.limit_price ? parseFloat(order.limit_price) : null,
      filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
      status: order.status,
      createdAt: order.created_at,
      submittedAt: order.submitted_at,
      filledAt: order.filled_at,
    };
  });

  return apiSuccess({
    orders: formattedOrders,
    count: formattedOrders.length,
  });
});
