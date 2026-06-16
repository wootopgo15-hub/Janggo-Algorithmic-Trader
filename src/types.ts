export type BotPhase = 'Uptrend' | 'Downtrend' | 'Sideways' | 'Unknown';

export interface CoinState {
  symbol: string;
  active: boolean;
  phase: BotPhase;
  pnl: number;
  longActive: boolean;
  shortActive: boolean;
  balance: number;
  entryPrice?: number;
  entryTime?: number; // UNIX timestamp
  positionType?: 'LONG' | 'SHORT';
  margin?: number;
  maxProfitPct?: number; // for trailing stop
  halfTaken?: boolean; // for 50% TP
  fiboTarget?: number;
  entryPhase?: BotPhase;
}

export interface BotStatusResponse {
  masterActive: boolean;
  totalBalance: number;
  totalPnl: number;
  timeOffsetMs: number;
  tradingAllocationPct: number;
  coins: CoinState[];
  apiStatus: string;
}

export interface TradeRecord {
  id: string;
  symbol: string;
  type: 'LONG' | 'SHORT';
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  phase: BotPhase;
}

export interface BacktestSummary {
  winRate: number;
  mdd: number;
  netProfit: number;
  totalTrades: number;
  chartData: Array<{ time: number; open: number; high: number; low: number; close: number; signal?: string; exit?: boolean }>;
  recentTrades: TradeRecord[];
}
