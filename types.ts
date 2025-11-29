
export interface SignalData {
  best_pair: string;
  timeframe: string;
  trend: "UPTREND" | "DOWNTREND" | "FLAT" | "RANGING";
  signal: "BUY" | "SELL" | "NO_SIGNAL";
  entry_price: number;
  stop_loss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  reason: string;
  strength_score: number;
  lot_size: number;
  estimated_profit_tp1: number;
  estimated_profit_tp2: number;
  estimated_profit_tp3: number;
  live_pnl_formula: string;
  status?: "WAIT" | "ACTIVE";
}

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  sma20?: number;
  sma200?: number;
}

export interface PnLState {
  pair: string;
  entry: number;
  current_price: number;
  lots: number;
  pnl_usd: number;
  contract_size: number;
}

export enum MarketType {
  FOREX = 'FOREX',
  CRYPTO = 'CRYPTO',
  METALS = 'METALS'
}

export interface ActiveTrade {
  pair: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  lotSize: number;
  openTime: number;
  marketType: MarketType;
}

export interface ClosedTrade {
  id: string;
  pair: string;
  type: "BUY" | "SELL";
  entryPrice: number;
  closePrice: number;
  lotSize: number;
  pnl: number;
  closeTime: number;
}

export interface BacktestResult {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  profitFactor: number;
}
