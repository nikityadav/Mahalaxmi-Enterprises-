
import { Candle, BacktestResult } from '../types';

export const runBacktest = (
  candles: Candle[], 
  signalType: 'BUY' | 'SELL', 
  lotSize: number = 0.1
): BacktestResult => {
  if (!candles || candles.length < 50) {
    return { trades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0, profitFactor: 0 };
  }

  let wins = 0;
  let losses = 0;
  let totalPnL = 0;
  let grossProfit = 0;
  let grossLoss = 0;

  // Simple Contract Size mapping (fallback)
  // Note: Actual app logic handles this more dynamically, but for backtest estimation:
  // We assume a standard multiplier to normalize PnL roughly to USD.
  const CONTRACT_SIZE = 100000; // Standard FX

  // Iterate through history to find similar setups
  // Start from index 200 to ensure SMAs are valid
  for (let i = 200; i < candles.length - 1; i++) {
    const candle = candles[i];
    const prev = candles[i-1];

    if (!candle.sma20 || !candle.sma200) continue;

    let entry = 0;
    let sl = 0;
    let tp = 0;
    let triggered = false;

    // Strategy Logic: Trend Following Pullback
    // 1. Trend Filter
    const isUptrend = candle.close > candle.sma200 && candle.sma20 > candle.sma200;
    const isDowntrend = candle.close < candle.sma200 && candle.sma20 < candle.sma200;

    // 2. Setup Logic (Simplified for backtest: Price crossing/touching SMA20)
    // We check if the strategy matches the current SIGNAL type (BUY or SELL)
    if (signalType === 'BUY' && isUptrend) {
       // Simple condition: Green candle after red candle near SMA20
       if (candle.close > candle.open && prev.close < prev.open) {
         triggered = true;
         entry = candle.close;
         // Dynamic SL based on local low
         const lowWindow = candles.slice(i-5, i).map(c => c.low);
         sl = Math.min(...lowWindow) * 0.9998; 
         const risk = entry - sl;
         tp = entry + (risk * 1.5); // 1.5R Target
       }
    } else if (signalType === 'SELL' && isDowntrend) {
       // Simple condition: Red candle after green candle near SMA20
       if (candle.close < candle.open && prev.close > prev.open) {
         triggered = true;
         entry = candle.close;
         // Dynamic SL based on local high
         const highWindow = candles.slice(i-5, i).map(c => c.high);
         sl = Math.max(...highWindow) * 1.0002;
         const risk = sl - entry;
         tp = entry - (risk * 1.5); // 1.5R Target
       }
    }

    // 3. Trade Simulation (Forward Test)
    if (triggered && entry > 0 && sl > 0 && tp > 0) {
      // Look forward up to 50 candles to see result
      let outcome = 0; // 0 = open/breakeven, 1 = win, -1 = loss
      
      for (let j = i + 1; j < Math.min(i + 50, candles.length); j++) {
        const future = candles[j];
        
        if (signalType === 'BUY') {
           if (future.low <= sl) { outcome = -1; break; } // Stopped out
           if (future.high >= tp) { outcome = 1; break; } // Target hit
        } else {
           if (future.high >= sl) { outcome = -1; break; } // Stopped out
           if (future.low <= tp) { outcome = 1; break; } // Target hit
        }
      }

      // Calculate PnL
      const riskAmount = Math.abs(entry - sl) * lotSize * CONTRACT_SIZE;
      const rewardAmount = Math.abs(entry - tp) * lotSize * CONTRACT_SIZE;

      if (outcome === 1) {
        wins++;
        totalPnL += rewardAmount;
        grossProfit += rewardAmount;
      } else if (outcome === -1) {
        losses++;
        totalPnL -= riskAmount;
        grossLoss += riskAmount;
      }
      
      // Skip forward to avoid overlapping trades in this simple simulation
      if (outcome !== 0) i += 5; 
    }
  }

  return {
    trades: wins + losses,
    wins,
    losses,
    winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0,
    totalPnL,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  };
};
