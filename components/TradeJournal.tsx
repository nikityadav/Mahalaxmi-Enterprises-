
import React from 'react';
import { ClosedTrade } from '../types';
import { History, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';

interface TradeJournalProps {
  trades: ClosedTrade[];
}

const TradeJournal: React.FC<TradeJournalProps> = ({ trades }) => {
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = trades.length > 0
    ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100
    : 0;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col h-full min-h-[300px]">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
        <div className="flex items-center gap-2 text-white font-bold">
          <History size={18} className="text-emerald-500" />
          <span className="tracking-wider text-sm">DAY JOURNAL</span>
        </div>
        <div className={`text-lg font-mono font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)} USD
        </div>
      </div>

      <div className="grid grid-cols-3 divide-x divide-slate-800 border-b border-slate-800 bg-slate-900 text-center py-3">
         <div>
           <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Trades</span>
           <span className="text-sm font-bold text-white">{trades.length}</span>
         </div>
         <div>
           <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Win Rate</span>
           <span className="text-sm font-bold text-emerald-400">{winRate.toFixed(0)}%</span>
         </div>
         <div>
           <span className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Net PnL</span>
           <span className={`text-sm font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
             ${totalPnL.toFixed(2)}
           </span>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 max-h-[400px]">
        {trades.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-2 min-h-[150px]">
            <History size={32} className="opacity-20" />
            <span className="text-xs font-mono">NO CLOSED TRADES TODAY</span>
          </div>
        ) : (
          trades.slice().reverse().map((trade) => (
            <div key={trade.id} className="bg-slate-950/50 border border-slate-800 rounded p-3 flex justify-between items-center hover:border-slate-600 transition-colors group">
               <div className="flex flex-col gap-1">
                 <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{trade.pair}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${trade.type === 'BUY' ? 'bg-emerald-900/30 text-emerald-500' : 'bg-rose-900/30 text-rose-500'}`}>
                      {trade.type}
                    </span>
                 </div>
                 <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                   {new Date(trade.closeTime).toLocaleTimeString()}
                   <span className="text-slate-700">|</span>
                   {trade.lotSize} Lots
                 </span>
               </div>
               
               <div className="text-right">
                 <div className={`font-bold font-mono text-sm ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                   {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)}
                 </div>
                 <span className="text-[10px] text-slate-600 block group-hover:text-slate-400 transition-colors">
                   {trade.entryPrice.toFixed(4)} → {trade.closePrice.toFixed(4)}
                 </span>
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TradeJournal;
