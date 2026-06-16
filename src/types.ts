export interface MarketState {
  trend: string;
  ema12h: number;
  ema4h: number;
  adx1h: number;
  rsi15m: number;
  bbUpper: number;
  bbLower: number;
  currentPrice: number;
}

export interface PositionState {
  side: string;
  entryPrice: number;
  tpPrice: number;
  slPrice: number;
  balanceUsdt: number;
}

export interface BacktestReport {
  totalTrades: number;
  winRate: string;
  returnPct: string;
  mdd: string;
  finalBalance: string;
  aiReport?: string;
}

export interface EquityCurvePoint {
  date: number;
  equity: number;
}

export interface TradeRecord {
  date: number;
  side: string;
  exitType: 'TP' | 'SL';
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  balance: number;
}

export interface StatusResponse {
  state: MarketState;
  position: PositionState;
  settings?: {
    walletUsage: number;
  };
  expectedReturns?: {
    daily: number;
    fifteenDays: number;
    thirtyDays: number;
  };
}
