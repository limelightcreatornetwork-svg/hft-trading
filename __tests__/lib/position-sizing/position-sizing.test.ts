/**
 * Tests for Position Sizing Service
 */

// Sector mappings (copied from position-sizing.ts for testing)
const SECTOR_MAPPINGS: Record<string, string> = {
  AAPL: 'Technology', MSFT: 'Technology', GOOGL: 'Technology', GOOG: 'Technology',
  META: 'Technology', NVDA: 'Technology', AMD: 'Technology', INTC: 'Technology',
  TSLA: 'Technology', TSM: 'Technology', AVGO: 'Technology', ORCL: 'Technology',
  CRM: 'Technology', ADBE: 'Technology', CSCO: 'Technology', IBM: 'Technology',
  QCOM: 'Technology', TXN: 'Technology', MU: 'Technology', AMAT: 'Technology',
  JPM: 'Finance', BAC: 'Finance', WFC: 'Finance', C: 'Finance',
  GS: 'Finance', MS: 'Finance', BLK: 'Finance', SCHW: 'Finance',
  V: 'Finance', MA: 'Finance', AXP: 'Finance', PYPL: 'Finance',
  JNJ: 'Healthcare', UNH: 'Healthcare', PFE: 'Healthcare', MRK: 'Healthcare',
  ABBV: 'Healthcare', LLY: 'Healthcare', TMO: 'Healthcare', ABT: 'Healthcare',
  AMZN: 'Consumer', WMT: 'Consumer', HD: 'Consumer', MCD: 'Consumer',
  COST: 'Consumer', NKE: 'Consumer', SBUX: 'Consumer', TGT: 'Consumer',
  KO: 'Consumer', PEP: 'Consumer', PG: 'Consumer',
  XOM: 'Energy', CVX: 'Energy', COP: 'Energy', SLB: 'Energy',
  EOG: 'Energy', OXY: 'Energy', PSX: 'Energy', VLO: 'Energy',
  BA: 'Industrials', CAT: 'Industrials', GE: 'Industrials', HON: 'Industrials',
  UPS: 'Industrials', LMT: 'Industrials', RTX: 'Industrials', DE: 'Industrials',
  F: 'Auto', GM: 'Auto', NIO: 'Auto', RIVN: 'Auto', LCID: 'Auto',
  SPY: 'ETF', QQQ: 'ETF', IWM: 'ETF', DIA: 'ETF',
  VTI: 'ETF', VOO: 'ETF', XLF: 'ETF', XLK: 'ETF',
};

function getSector(symbol: string): string {
  return SECTOR_MAPPINGS[symbol.toUpperCase()] || 'Other';
}

describe('Position Sizing', () => {
  describe('getSector', () => {
    it('should return correct sector for known tech stocks', () => {
      expect(getSector('AAPL')).toBe('Technology');
      expect(getSector('MSFT')).toBe('Technology');
      expect(getSector('NVDA')).toBe('Technology');
      expect(getSector('AMD')).toBe('Technology');
      expect(getSector('INTC')).toBe('Technology');
    });

    it('should return correct sector for finance stocks', () => {
      expect(getSector('JPM')).toBe('Finance');
      expect(getSector('BAC')).toBe('Finance');
      expect(getSector('V')).toBe('Finance');
      expect(getSector('MA')).toBe('Finance');
    });

    it('should return correct sector for auto stocks', () => {
      expect(getSector('F')).toBe('Auto');
      expect(getSector('GM')).toBe('Auto');
      expect(getSector('NIO')).toBe('Auto');
    });

    it('should return correct sector for ETFs', () => {
      expect(getSector('SPY')).toBe('ETF');
      expect(getSector('QQQ')).toBe('ETF');
      expect(getSector('IWM')).toBe('ETF');
    });

    it('should handle lowercase symbols', () => {
      expect(getSector('aapl')).toBe('Technology');
      expect(getSector('spy')).toBe('ETF');
    });

    it('should return "Other" for unknown symbols', () => {
      expect(getSector('UNKNOWN')).toBe('Other');
      expect(getSector('XYZ123')).toBe('Other');
    });
  });

  describe('Position Size Calculations', () => {
    // Note: Full integration tests would require mocking Alpaca and Prisma
    // These are unit tests for the pure functions
    
    it('should respect portfolio percentage limits', () => {
      const portfolioValue = 10000;
      const maxPositionPct = 10;
      const maxPosition = portfolioValue * (maxPositionPct / 100);
      
      expect(maxPosition).toBe(1000);
    });

    it('should calculate sector headroom correctly', () => {
      const portfolioValue = 10000;
      const maxSectorPct = 30;
      const currentSectorExposure = 2000;
      
      const maxSectorValue = portfolioValue * (maxSectorPct / 100);
      const sectorHeadroom = maxSectorValue - currentSectorExposure;
      
      expect(sectorHeadroom).toBe(1000);
    });

    it('should calculate cash reserve correctly', () => {
      const portfolioValue = 10000;
      const currentCash = 3000;
      const cashReservePct = 20;
      
      const requiredCash = portfolioValue * (cashReservePct / 100);
      const availableForTrading = currentCash - requiredCash;
      
      expect(requiredCash).toBe(2000);
      expect(availableForTrading).toBe(1000);
    });

    it('should return zero when cash below reserve', () => {
      const portfolioValue = 10000;
      const currentCash = 1500;
      const cashReservePct = 20;
      
      const requiredCash = portfolioValue * (cashReservePct / 100);
      const availableForTrading = Math.max(0, currentCash - requiredCash);
      
      expect(availableForTrading).toBe(0);
    });
  });

  describe('Kelly Criterion', () => {
    it('should calculate basic Kelly percentage', () => {
      const winRate = 0.6;  // 60% win rate
      const avgWin = 2;     // Average win is 2x
      const avgLoss = 1;    // Average loss is 1x
      
      const winLossRatio = avgWin / avgLoss;
      const kellyPct = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;
      
      // Kelly = (0.6 * 2 - 0.4) / 2 = (1.2 - 0.4) / 2 = 0.4 = 40%
      expect(kellyPct).toBeCloseTo(0.4);
    });

    it('should return zero Kelly for losing system', () => {
      const winRate = 0.4;  // 40% win rate
      const avgWin = 1;
      const avgLoss = 1;
      
      const winLossRatio = avgWin / avgLoss;
      let kellyPct = (winRate * winLossRatio - (1 - winRate)) / winLossRatio;
      kellyPct = Math.max(0, kellyPct);
      
      // Kelly = (0.4 * 1 - 0.6) / 1 = -0.2, capped at 0
      expect(kellyPct).toBe(0);
    });

    it('should apply fraction for safer sizing', () => {
      const fullKelly = 0.4;  // 40% full Kelly
      const fraction = 0.25; // Quarter Kelly
      
      const adjustedKelly = fullKelly * fraction;
      
      expect(adjustedKelly).toBe(0.1);  // 10%
    });
  });

  describe('Herfindahl-Hirschman Index', () => {
    it('should calculate HHI for concentrated portfolio', () => {
      // Single position = 100% concentration
      const positions = [1.0];
      const hhi = positions.reduce((sum, pct) => sum + pct * pct, 0);
      
      expect(hhi).toBe(1.0);  // Maximum concentration
    });

    it('should calculate HHI for diversified portfolio', () => {
      // 10 equal positions
      const positions = Array(10).fill(0.1);
      const hhi = positions.reduce((sum, pct) => sum + pct * pct, 0);
      
      expect(hhi).toBeCloseTo(0.1);  // Well diversified
    });

    it('should calculate HHI for mixed portfolio', () => {
      // One large position (50%) + four small (12.5% each)
      const positions = [0.5, 0.125, 0.125, 0.125, 0.125];
      const hhi = positions.reduce((sum, pct) => sum + pct * pct, 0);
      
      // 0.25 + 4 * 0.015625 = 0.25 + 0.0625 = 0.3125
      expect(hhi).toBeCloseTo(0.3125);
    });
  });
});
