import { NextRequest, NextResponse } from 'next/server';
import {
  submitOptionsOrder,
  parseOptionSymbol,
  canSellCoveredCall,
  canSellCashSecuredPut,
  closeOptionsPosition,
  getClosingSide,
} from '@/lib/alpaca-options';
import { getPositions, getAccount } from '@/lib/alpaca';
import { withAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit-log';
import { validateSide, validateOrderType, validatePositiveNumber } from '@/lib/validation';

/**
 * POST /api/options/orders
 * Submit an options order
 *
 * Level 1 supported strategies:
 * - Covered Call: Sell call against owned shares
 * - Cash-Secured Put: Sell put with cash collateral
 */
export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      symbol,
      limitPrice,
      strategy,
      skipValidation = false,
    } = body;

    // Validate option symbol
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Option symbol is required' },
        { status: 400 }
      );
    }

    // Parse option symbol to understand what we're trading
    const parsed = parseOptionSymbol(symbol);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid option symbol format. Expected format: AAPL240119C00100000' },
        { status: 400 }
      );
    }

    // Validate side
    const sideResult = validateSide(body.side?.toLowerCase?.());
    if (!sideResult.valid) {
      return NextResponse.json(
        { success: false, error: sideResult.error },
        { status: 400 }
      );
    }
    const side = sideResult.value;

    // Validate quantity
    const quantityResult = validatePositiveNumber(body.quantity, 'quantity', { integer: true });
    if (!quantityResult.valid) {
      return NextResponse.json(
        { success: false, error: quantityResult.error },
        { status: 400 }
      );
    }
    const quantity = quantityResult.value;

    // Validate type (default to limit for options)
    const typeResult = validateOrderType(body.type?.toLowerCase?.() || 'limit');
    if (!typeResult.valid) {
      return NextResponse.json(
        { success: false, error: typeResult.error },
        { status: 400 }
      );
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
          return NextResponse.json({
            success: false,
            error: 'Level 1 Restriction: Covered call requires underlying shares',
            reason: validation.reason,
            availableShares: validation.availableShares,
          }, { status: 403 });
        }
      } else {
        // Cash-secured put - need buying power
        const validation = canSellCashSecuredPut(
          parseFloat(account.buying_power),
          parsed.strikePrice,
          quantity
        );
        
        if (!validation.allowed) {
          return NextResponse.json({
            success: false,
            error: 'Level 1 Restriction: Cash-secured put requires sufficient buying power',
            reason: validation.reason,
            requiredCash: validation.requiredCash,
          }, { status: 403 });
        }
      }
    }

    // Validate limit price for limit orders
    if (type === 'limit' && !limitPrice) {
      return NextResponse.json(
        { success: false, error: 'Limit price required for limit orders' },
        { status: 400 }
      );
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
    await audit.orderSubmitted(order.id || 'unknown', symbol.toUpperCase(), {
      type: 'options',
      side,
      quantity,
      strategy: strategy || (side === 'sell' ?
        (parsed.type === 'call' ? 'covered_call' : 'cash_secured_put') :
        'buy_option'),
      underlying: parsed.rootSymbol,
      expiration: parsed.expirationDate,
      strike: parsed.strikePrice,
    });

    return NextResponse.json({
      success: true,
      data: {
        order,
        strategy: strategy || (side === 'sell' ?
          (parsed.type === 'call' ? 'covered_call' : 'cash_secured_put') :
          'buy_option'),
        parsed: {
          underlying: parsed.rootSymbol,
          expiration: parsed.expirationDate,
          type: parsed.type,
          strike: parsed.strikePrice,
        },
      },
    });
  } catch (error) {
    console.error('Options order API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to submit options order'
      },
      { status: 500 }
    );
  }
});

/**
 * GET /api/options/orders
 * Get open options orders
 */
export const GET = withAuth(async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'open';

    // Use the Alpaca orders endpoint with asset_class filter
    const response = await fetch(
      `${process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets'}/v2/orders?status=${status}`,
      {
        headers: {
          'APCA-API-KEY-ID': process.env.ALPACA_API_KEY!,
          'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET!,
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

    return NextResponse.json({
      success: true,
      data: {
        orders: formattedOrders,
        count: formattedOrders.length,
      },
    });
  } catch (error) {
    console.error('Options orders GET API error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch options orders'
      },
      { status: 500 }
    );
  }
});
