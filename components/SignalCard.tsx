
import React, { useState } from 'react';
import { SignalData, Candle, BacktestResult } from '../types';
import { runBacktest } from '../utils/backtest';
import { ArrowUpCircle, ArrowDownCircle, AlertCircle, Copy, Terminal, Trophy, Target, TrendingUp, Zap, History, BarChart } from 'lucide-react';

interface SignalCardProps {
  signalData: SignalData | null;
  history: Candle[];
  loading: boolean;
  onExecute: (signal: SignalData) => void;
  isTradeActive: boolean;
}

const SignalCard: React.FC<SignalCardProps> = ({ signalData, history, loading, onExecute, isTradeActive }) => {
  const [backtestStats, setBacktestStats] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);

  const handleBacktest = () => {
    if (!signalData || !history) return;
    setIsBacktesting(true);
    
    // Simulate async calculation for UI feel
    setTimeout(() => {
      const stats = runBacktest(history, signalData.signal as 'BUY' | 'SELL', signalData.lot_size);
      setBacktestStats(stats);
      setIsBacktesting(false);
    }, 800);
  };

  if (loading) {
    return (
      <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900 border border-slate-700 rounded-xl animate-pulse relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/20 to-transparent"></div>
        <div className="w-16 h-16 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6 z-10"></div>
        <span className="text-emerald-500 font-bold font-mono text-lg tracking-widest z-10">SCANNING 18 PAIRS...</span>
        <span className="text-slate-500 text-xs font-mono mt-2 z-10">EUR, GBP, JPY, CAD, AUD, XAU, NZD</span>
      </div>
    );
  }

  if (!signalData) {
    return (
      <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center bg-slate-900 border border-slate-700 rounded-xl">
        <Trophy className="w-16 h-16 text-slate-700 mb-4" />
        <span className="text-slate-500 font-mono text-sm">READY FOR ELITE MARKET SCAN</span>
      </div>
    );
  }

  const isBuy = signalData.signal === 'BUY';
  const isSell = signalData.signal === 'SELL';
  const noSignal = signalData.signal === 'NO_SIGNAL';
  
  // Handling "NONE" pair for waiting state
  const displayPair = signalData.best_pair === 'NONE' ? 'NO SETUP' : signalData.best_pair;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      
      {/* Visual Card */}
      <div className={`relative overflow-hidden rounded-xl border flex flex-col ${noSignal ? 'border-slate-700 bg-slate-900' : isBuy ? 'border-emerald-500/50 bg-slate-900' : 'border-rose-500/50 bg-slate-900'}`}>
        
        {/* Elite Badge */}
        {!noSignal && (
          <div className="absolute top-0 right-0 p-2">
            <div className="bg-slate-950/80 backdrop-blur border border-slate-700 px-3 py-1 rounded-full flex items-center gap-2">
              <Trophy size={12} className="text-yellow-500" />
              <span className="text-[10px] font-bold text-yellow-500 tracking-wider">ELITE SIGNAL</span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className={`p-5 border-b ${noSignal ? 'border-slate-800' : isBuy ? 'border-emerald-900' : 'border-rose-900'} flex flex-col gap-2`}>
          <div className="flex justify-between items-start">
            <div>
               <h1 className="text-3xl font-black tracking-tighter text-white">{displayPair}</h1>
               <div className="flex gap-2 mt-1">
                 <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-400">M5</span>
                 <span className={`px-2 py-0.5 rounded text-xs font-bold ${isBuy ? 'bg-emerald-900/50 text-emerald-400' : isSell ? 'bg-rose-900/50 text-rose-400' : 'bg-slate-800 text-slate-500'}`}>
                    {signalData.trend}
                 </span>
               </div>
            </div>
            {!noSignal && (
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-500 font-mono mb-1">STRENGTH</span>
                <div className="text-xl font-bold text-white flex items-center gap-1">
                  {signalData.strength_score}%
                  <TrendingUp size={16} className={signalData.strength_score > 85 ? 'text-emerald-500' : 'text-yellow-500'} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main Signal Display */}
        <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[120px]">
           {isBuy && <ArrowUpCircle className="w-16 h-16 text-emerald-500 mb-2 animate-bounce" />}
           {isSell && <ArrowDownCircle className="w-16 h-16 text-rose-500 mb-2 animate-bounce" />}
           {noSignal && <AlertCircle className="w-16 h-16 text-slate-600 mb-2" />}
           
           <h2 className={`text-4xl font-black tracking-tighter ${isBuy ? 'text-emerald-400' : isSell ? 'text-rose-400' : 'text-slate-500'}`}>
             {signalData.signal === 'NO_SIGNAL' ? 'WAIT' : signalData.signal}
           </h2>
        </div>
        
        {/* Action Buttons */}
        {!noSignal && (
           <div className="px-6 pb-4 flex gap-3">
             <button
               onClick={handleBacktest}
               disabled={isBacktesting}
               className="flex-1 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 hover:border-slate-500 text-xs"
             >
               {isBacktesting ? <History className="animate-spin" size={16} /> : <BarChart size={16} />}
               {isBacktesting ? 'TESTING...' : 'BACKTEST'}
             </button>
             
             <button
               onClick={() => onExecute(signalData)}
               disabled={isTradeActive}
               className={`flex-[2] py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all shadow-lg text-xs ${
                 isTradeActive 
                 ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                 : isBuy 
                   ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50 animate-pulse' 
                   : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/50 animate-pulse'
               }`}
             >
               <Zap size={16} className={isTradeActive ? "" : "fill-current"} />
               {isTradeActive ? 'ACTIVE' : 'AUTO EXECUTE'}
             </button>
           </div>
        )}

        {/* Backtest Results Overlay */}
        {backtestStats && (
          <div className="mx-6 mb-4 p-3 bg-slate-950/80 rounded border border-slate-700 grid grid-cols-3 text-center gap-2">
            <div>
              <span className="block text-[9px] text-slate-500 uppercase">Win Rate</span>
              <span className={`text-sm font-bold ${backtestStats.winRate > 50 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {backtestStats.winRate.toFixed(1)}%
              </span>
            </div>
             <div>
              <span className="block text-[9px] text-slate-500 uppercase">Trades</span>
              <span className="text-sm font-bold text-white">
                {backtestStats.trades}
              </span>
            </div>
             <div>
              <span className="block text-[9px] text-slate-500 uppercase">Est. PnL</span>
              <span className={`text-sm font-bold ${backtestStats.totalPnL > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${backtestStats.totalPnL.toFixed(0)}
              </span>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        {!noSignal && (
          <div className="bg-slate-950/50 border-t border-slate-800">
             <div className="grid grid-cols-2 divide-x divide-slate-800 border-b border-slate-800">
                <div className="p-3">
                  <span className="text-slate-500 text-[10px] uppercase block mb-1">Entry Price</span>
                  <span className="text-white font-mono font-bold text-lg">{signalData.entry_price}</span>
                </div>
                <div className="p-3">
                  <span className="text-slate-500 text-[10px] uppercase block mb-1">Stop Loss</span>
                  <span className="text-rose-400 font-mono font-bold text-lg">{signalData.stop_loss}</span>
                </div>
             </div>
             
             {/* Profit Targets */}
             <div className="p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                   <span className="text-slate-400 flex items-center gap-1"><Target size={12}/> TP1 (1.5R)</span>
                   <span className="text-emerald-400 font-mono">{signalData.tp1} <span className="text-emerald-700 ml-1">(${signalData.estimated_profit_tp1})</span></span>
                </div>
                <div className="flex justify-between items-center text-xs">
                   <span className="text-slate-400 flex items-center gap-1"><Target size={12}/> TP2 (2.0R)</span>
                   <span className="text-emerald-400 font-mono">{signalData.tp2} <span className="text-emerald-700 ml-1">(${signalData.estimated_profit_tp2})</span></span>
                </div>
             </div>
          </div>
        )}

        {/* Reason */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <p className="text-slate-400 text-xs leading-relaxed font-mono">
            <span className="text-slate-200 font-bold mr-2">LOGIC &gt;</span>
            {signalData.reason}
          </p>
        </div>
      </div>

      {/* JSON Output Panel */}
      <div className="rounded-xl border border-slate-700 bg-slate-950 flex flex-col overflow-hidden h-full">
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900 flex justify-between items-center">
          <span className="text-xs font-mono text-emerald-500 flex items-center gap-2">
            <Terminal size={14} /> JSON_OUTPUT_STREAM
          </span>
          <button 
            onClick={() => navigator.clipboard.writeText(JSON.stringify(signalData, null, 2))}
            className="text-slate-500 hover:text-white transition-colors"
          >
            <Copy size={14} />
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1 custom-scrollbar">
          <pre className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
            {JSON.stringify(signalData, null, 2)}
          </pre>
        </div>
      </div>

    </div>
  );
};

export default SignalCard;
