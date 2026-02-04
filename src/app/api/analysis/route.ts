import { NextRequest } from 'next/server';
import { getAccount, getPortfolioHistory, getAccountActivities } from '@/lib/alpaca';
import { prisma } from '@/lib/db';
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

function calculateSharpeRatio(dailyReturns: number[]): number | null {
  if (dailyReturns.length < 2) return null;
  const mean = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
  const variance = dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / (dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return null;
  // Annualize: multiply by sqrt(252 trading days)
  return (mean / stdDev) * Math.sqrt(252);
}

function calculateMaxDrawdown(equitySeries: number[]): number | null {
  if (equitySeries.length < 2) return null;
  let peak = equitySeries[0];
  let maxDd = 0;
  for (const equity of equitySeries) {
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

function calculateAvgHoldingTime(
  activities: Array<{ symbol?: string; side?: string; transaction_time?: string }>
): number | null {
  // Pair BUY→SELL fills per symbol to estimate holding duration
  const buys = new Map<string, string[]>();
  const holdingHours: number[] = [];

  for (const a of activities) {
    const symbol = a.symbol;
    const side = a.side?.toUpperCase();
    const time = a.transaction_time;
    if (!symbol || !side || !time) continue;

    if (side === 'BUY') {
      const queue = buys.get(symbol) || [];
      queue.push(time);
      buys.set(symbol, queue);
    } else if (side === 'SELL') {
      const queue = buys.get(symbol);
      if (queue && queue.length > 0) {
        const buyTime = queue.shift()!;
        const hours = (new Date(time).getTime() - new Date(buyTime).getTime()) / (1000 * 60 * 60);
        if (hours >= 0) holdingHours.push(hours);
      }
    }
  }

  if (holdingHours.length === 0) return null;
  return holdingHours.reduce((s, v) => s + v, 0) / holdingHours.length;
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

    const activityOrderIds = (activities || [])
      .map(a => a.order_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const localOrders = activityOrderIds.length > 0
      ? await prisma.order.findMany({
          where: { brokerOrderId: { in: activityOrderIds } },
          include: { intent: true },
        })
      : [];

    const orderStrategyByBrokerId = new Map(
      localOrders.map(o => [o.brokerOrderId, o.intent?.strategy || 'Fill'])
    );

    const trades = (activities || []).map((a) => ({
      id: a.id,
      symbol: a.symbol,
      side: a.side?.toUpperCase?.() || 'BUY',
      quantity: a.qty ? parseFloat(a.qty) : 0,
      entryPrice: a.price ? parseFloat(a.price) : 0,
      exitPrice: a.price ? parseFloat(a.price) : 0,
      pnl: a.net_amount ? parseFloat(a.net_amount) : 0,
      pnlPercent: 0,
      strategy: orderStrategyByBrokerId.get(a.order_id || '') || 'Fill',
      entryDate: a.transaction_time,
      exitDate: a.transaction_time,
    }));

    // Compute daily returns as percentages for Sharpe calculation
    const dailyReturns: number[] = [];
    for (let i = 1; i < equitySeries.length; i++) {
      if (equitySeries[i - 1] > 0) {
        dailyReturns.push((equitySeries[i] - equitySeries[i - 1]) / equitySeries[i - 1]);
      }
    }

    const sharpeRatio = calculateSharpeRatio(dailyReturns);
    const maxDrawdown = calculateMaxDrawdown(equitySeries);
    const avgHoldingTime = calculateAvgHoldingTime(activities || []);

    return apiSuccess({
      metrics: {
        totalValue: lastEquity,
        totalPnl,
        totalPnlPercent,
        winRate: winDays + loseDays > 0 ? (winDays / (winDays + loseDays)) * 100 : 0,
        avgWin,
        avgLoss,
        sharpeRatio,
        maxDrawdown,
        tradesCount: trades.length,
        winningTrades: winDays,
        losingTrades: loseDays,
        profitFactor: Number.isFinite(profitFactor) ? profitFactor : null,
        avgHoldingTime,
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
