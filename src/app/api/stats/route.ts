/**
 * GET /api/stats - Get trading statistics
 */

import { NextResponse } from 'next/server';
import { getTradingStats } from '@/lib/trade-manager';
import { withAuth } from '@/lib/api-auth';

export const GET = withAuth(async function GET() {
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
});
