import { NextRequest, NextResponse } from 'next/server';
import { 
  submitOptionsOrder, 
  parseOptionSymbol,
  canSellCoveredCall,
  canSellCashSecuredPut,
} from '@/lib/alpaca-options';
import { getPositions, getAccount } from '@/lib/alpaca';

/**
 * POST /api/options/orders
 * Submit an options order
 * 
 * Level 1 supported strategies:
 * - Covered Call: Sell call against owned shares
 * - Cash-Secured Put: Sell put with cash collateral
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      symbol, 
      quantity, 
      side, 
      type = 'limit',
      limitPrice,
      strategy,
      skipValidation = false,
    } = body;

    // Validate required fields
    if (!symbol || !quantity || !side) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: symbol, quantity, side' },
        { status: 400 }
      );
    }

    // Parse option symbol to understand what we're trading
    const parsed = parseOptionSymbol(symbol);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid option symbol format' },
        { status: 400 }
      );
    }

    // Validate quantity is whole number
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be a positive whole number' },
        { status: 400 }
      );
    }

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
        error: error instanceof Error ? error.message : 'Failed to submit options order' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/options/orders
 * Get open options orders
 */
export async function GET(request: NextRequest) {
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
        error: error instanceof Error ? error.message : 'Failed to fetch options orders' 
      },
      { status: 500 }
    );
  }
}
