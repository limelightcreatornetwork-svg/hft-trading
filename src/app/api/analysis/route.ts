import { NextRequest } from 'next/server';
import { getAccount, getPortfolioHistory, getAccountActivities } from '@/lib/alpaca';
import { apiHandler, apiSuccess, apiError } from '@/lib/api-helpers';

// Disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function calculateDailyPnL(profitLoss: number[]): { dateIndex: number; pnl: number }[] {
  if (!profitLoss || profitLoss.length === 0) return [];
  const daily: { dateIndex: number; pnl: number }[] = [];
  for (let i = 0; i < profitLoss.length; i++) {
    const prev = i > 0 ? profitLoss[i - 1] : 0;
    daily.push({ dateIndex: i, pnl: profitLoss[i] - prev });
  }
  return daily;
}

export const GET = apiHandler(async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') || '1M') as
      | '1M'
      | '3M'
      | '6M'
      | '1A'
      | 'all'
      | 'intraday';
    const timeframe = (searchParams.get('timeframe') || '1D') as
      | '1Min'
      | '5Min'
      | '15Min'
      | '1H'
      | '1D';

    const [account, history, activities] = await Promise.all([
      getAccount(),
      getPortfolioHistory({ period, timeframe }),
      getAccountActivities({ activityTypes: 'FILL', direction: 'desc', pageSize: 200 }),
    ]);

    const equitySeries = history?.equity || [];
    const profitLossSeries = history?.profit_loss || [];
    const profitLossPctSeries = history?.profit_loss_pct || [];
    const timestamps = history?.timestamp || [];

    const lastEquity =
      equitySeries.length > 0 ? equitySeries[equitySeries.length - 1] : parseFloat(account.portfolio_value);
    const firstEquity = equitySeries.length > 0 ? equitySeries[0] : lastEquity;

    const totalPnl = lastEquity - firstEquity;
    const totalPnlPercent = firstEquity > 0 ? (totalPnl / firstEquity) * 100 : 0;

    const dailyPnL = calculateDailyPnL(profitLossSeries);
    const winDays = dailyPnL.filter(d => d.pnl > 0).length;
    const loseDays = dailyPnL.filter(d => d.pnl < 0).length;
    const wins = dailyPnL.filter(d => d.pnl > 0).map(d => d.pnl);
    const losses = dailyPnL.filter(d => d.pnl < 0).map(d => d.pnl);
    const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? losses.reduce((s, v) => s + v, 0) / losses.length : 0;
    const profitFactor =
      losses.length > 0
        ? wins.reduce((s, v) => s + v, 0) / Math.abs(losses.reduce((s, v) => s + v, 0))
        : wins.length > 0
          ? Number.POSITIVE_INFINITY
          : 0;

    const trades = (activities || []).map((a) => ({
      id: a.id,
      symbol: a.symbol,
      side: a.side?.toUpperCase?.() || 'BUY',
      quantity: a.qty ? parseFloat(a.qty) : 0,
      entryPrice: a.price ? parseFloat(a.price) : 0,
      exitPrice: a.price ? parseFloat(a.price) : 0,
      pnl: a.net_amount ? parseFloat(a.net_amount) : 0,
      pnlPercent: 0,
      strategy: 'Fill',
      entryDate: a.transaction_time,
      exitDate: a.transaction_time,
    }));

    return apiSuccess({
      metrics: {
        totalValue: lastEquity,
        totalPnl,
        totalPnlPercent,
        winRate: winDays + loseDays > 0 ? (winDays / (winDays + loseDays)) * 100 : 0,
        avgWin,
        avgLoss,
        sharpeRatio: null,
        maxDrawdown: null,
        tradesCount: trades.length,
        winningTrades: winDays,
        losingTrades: loseDays,
        profitFactor: Number.isFinite(profitFactor) ? profitFactor : null,
        avgHoldingTime: null,
      },
      trades,
      equityCurve: timestamps.map((ts, idx) => ({
        timestamp: ts,
        equity: equitySeries[idx],
        profitLoss: profitLossSeries[idx],
        profitLossPct: profitLossPctSeries[idx],
      })),
      dailyPnL: timestamps.map((ts, idx) => ({
        timestamp: ts,
        pnl: dailyPnL[idx]?.pnl ?? 0,
      })),
    });
  } catch (error) {
    console.error('Analysis API error:', error);
    return apiError('Failed to load analysis');
  }
});
