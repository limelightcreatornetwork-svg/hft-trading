/**
 * POST /api/options/positions/close
 * Close an options position by submitting an opposing order
 *
 * Body:
 * - symbol: string (option symbol like AAPL240119C00100000)
 * - quantity: number (contracts to close)
 * - currentSide: 'long' | 'short'
 * - orderType?: 'market' | 'limit' (default: market)
 * - limitPrice?: number (required if orderType is 'limit')
 */

import { NextRequest, NextResponse } from 'next/server';
import { closeOptionsPosition, parseOptionSymbol, getClosingSide } from '@/lib/alpaca-options';
import { withAuth } from '@/lib/api-auth';
import { audit } from '@/lib/audit-log';
import { validatePositiveNumber } from '@/lib/validation';

export const POST = withAuth(async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { symbol, quantity, currentSide, orderType = 'market', limitPrice } = body;

    // Validate symbol
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Option symbol is required' },
        { status: 400 }
      );
    }

    const parsed = parseOptionSymbol(symbol);
    if (!parsed) {
      return NextResponse.json(
        { success: false, error: 'Invalid option symbol format. Expected format: AAPL240119C00100000' },
        { status: 400 }
      );
    }

    // Validate quantity
    const quantityResult = validatePositiveNumber(quantity, 'quantity', { integer: true });
    if (!quantityResult.valid) {
      return NextResponse.json(
        { success: false, error: quantityResult.error },
        { status: 400 }
      );
    }

    // Validate current side
    if (!currentSide || !['long', 'short'].includes(currentSide)) {
      return NextResponse.json(
        { success: false, error: 'currentSide must be "long" or "short"' },
        { status: 400 }
      );
    }

    // Validate order type
    if (orderType && !['market', 'limit'].includes(orderType)) {
      return NextResponse.json(
        { success: false, error: 'orderType must be "market" or "limit"' },
        { status: 400 }
      );
    }

    // Validate limit price for limit orders
    if (orderType === 'limit') {
      if (!limitPrice || typeof limitPrice !== 'number' || limitPrice <= 0) {
        return NextResponse.json(
          { success: false, error: 'Limit price required for limit orders' },
          { status: 400 }
        );
      }
    }

    // Close the position
    const order = await closeOptionsPosition({
      symbol: symbol.toUpperCase(),
      quantity: quantityResult.value,
      currentSide,
      orderType,
      limitPrice,
    });

    // Audit log the close
    const closingSide = getClosingSide(currentSide);
    await audit.orderSubmitted(order.id || 'unknown', symbol.toUpperCase(), {
      type: 'options_close',
      action: 'close_position',
      closingSide,
      originalSide: currentSide,
      quantity: quantityResult.value,
      orderType,
      limitPrice,
      underlying: parsed.rootSymbol,
      expiration: parsed.expirationDate,
      strike: parsed.strikePrice,
      optionType: parsed.type,
    });

    return NextResponse.json({
      success: true,
      data: {
        order,
        closingSide,
        parsed: {
          underlying: parsed.rootSymbol,
          expiration: parsed.expirationDate,
          type: parsed.type,
          strike: parsed.strikePrice,
        },
      },
    });
  } catch (error) {
    console.error('Options close position error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close options position'
      },
      { status: 500 }
    );
  }
});
