/**
 * GET /api/stats - Get trading statistics
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTradingStats } from '@/lib/trade-manager';

export async function GET(request: NextRequest) {
  try {
    const stats = await getTradingStats();
    
    return NextResponse.json({
      success: true,
      stats,
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics', details: String(error) },
      { status: 500 }
    );
  }
}
