
import React, { useState, useEffect } from 'react';
import { SignalData, MarketType, ActiveTrade } from '../types';
import { Calculator, Lock, Unlock, XCircle } from 'lucide-react';

interface PnLTrackerProps {
  activeSignal: SignalData | null;
  activeTrade: ActiveTrade | null;
  currentLivePrice: number;
  onCloseTrade: () => void;
}

const PnLTracker: React.FC<PnLTrackerProps> = ({ activeSignal, activeTrade, currentLivePrice, onCloseTrade }) => {
  const [currentPriceInput, setCurrentPriceInput] = useState<string>('');
  const [entryPrice, setEntryPrice] = useState<string>('');
  const [lots, setLots] = useState<string>('0.10');
  const [marketType, setMarketType] = useState<MarketType>(MarketType.FOREX);
  const [pnl, setPnl] = useState<number | null>(null);

  // Mode: If activeTrade exists, we are in "Live Tracking" mode (Locked).
  // Otherwise, we are in "Simulation/Manual" mode (Unlocked).

  // 1. Handle Active Trade (Live Mode)
  useEffect(() => {
    if (activeTrade) {
      setEntryPrice(activeTrade.entryPrice.toString());
      setLots(activeTrade.lotSize.toString());
      setMarketType(activeTrade.marketType);
      
      // Update price automatically from live feed
      if (currentLivePrice > 0) {
        setCurrentPriceInput(currentLivePrice.toString());
      }
    }
  }, [activeTrade, currentLivePrice]);

  // 2. Handle Signal Pre-fill (Simulation Mode)
  useEffect(() => {
    if (!activeTrade && activeSignal && activeSignal.signal !== 'NO_SIGNAL') {
      setEntryPrice(activeSignal.entry_price.toString());
      setLots(activeSignal.lot_size.toString());
      setCurrentPriceInput(activeSignal.entry_price.toString());
      
      if (activeSignal.best_pair.includes('BTC') || activeSignal.best_pair.includes('ETH')) {
        setMarketType(MarketType.CRYPTO);
      } else if (activeSignal.best_pair.includes('XAU')) {
        setMarketType(MarketType.METALS);
      } else {
        setMarketType(MarketType.FOREX);
      }
    }
  }, [activeSignal, activeTrade]);

  // 3. Calculation Logic
  useEffect(() => {
    const entry = parseFloat(entryPrice);
    const curr = parseFloat(currentPriceInput);
    const lotSize = parseFloat(lots);

    if (isNaN(entry) || isNaN(curr) || isNaN(lotSize)) {
      setPnl(null);
      return;
    }

    let contractSize = 100000;
    if (marketType === MarketType.METALS) contractSize = 100;
    if (marketType === MarketType.CRYPTO) contractSize = 1;

    let direction = 1; // Default Long
    if (activeTrade) {
      direction = activeTrade.type === 'BUY' ? 1 : -1;
    } else if (activeSignal?.signal === 'SELL') {
      direction = -1;
    }

    const diff = curr - entry;
    const profit = diff * (lotSize * contractSize) * direction;
    setPnl(profit);
  }, [currentPriceInput, entryPrice, lots, marketType, activeSignal, activeTrade]);

  return (
    <div className={`bg-slate-900 border rounded-xl p-6 transition-colors duration-500 ${activeTrade ? 'border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.1)]' : 'border-slate-700'}`}>
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <Calculator className={activeTrade ? "text-emerald-400 animate-pulse" : "text-emerald-600"} size={20} />
          <h2 className="text-lg font-bold text-white tracking-wide">
            {activeTrade ? `LIVE TRADE: ${activeTrade.pair}` : 'PNL SIMULATOR'}
          </h2>
        </div>
        
        {activeTrade && (
          <button 
            onClick={onCloseTrade}
            className="flex items-center gap-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/40 rounded-lg text-white text-xs font-bold transition-all animate-pulse"
          >
            <XCircle size={16} /> CLOSE TRADE
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 relative">
        {/* Overlay if Active Trade to prevent manual edit */}
        {activeTrade && (
          <div className="absolute inset-0 z-10 cursor-not-allowed" title="Fields locked during active trade"></div>
        )}

        <div>
          <label className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
            MARKET {activeTrade ? <Lock size={10}/> : <Unlock size={10}/>}
          </label>
          <select 
            value={marketType}
            onChange={(e) => setMarketType(e.target.value as MarketType)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none"
            disabled={!!activeTrade}
          >
            <option value={MarketType.FOREX}>FOREX (100k)</option>
            <option value={MarketType.METALS}>METALS (100)</option>
            <option value={MarketType.CRYPTO}>CRYPTO (1)</option>
          </select>
        </div>
        
        <div>
          <label className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
            ENTRY {activeTrade ? <Lock size={10}/> : <Unlock size={10}/>}
          </label>
          <input 
            type="number" 
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono"
            placeholder="0.0000"
            disabled={!!activeTrade}
          />
        </div>

        <div>
           <label className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
             LOTS {activeTrade ? <Lock size={10}/> : <Unlock size={10}/>}
           </label>
           <input 
            type="number" 
            value={lots}
            onChange={(e) => setLots(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono"
            step="0.01"
            disabled={!!activeTrade}
          />
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs font-mono text-slate-500 mb-1">
            CURRENT PRICE {activeTrade ? <span className="text-emerald-500 font-bold animate-pulse text-[10px] ml-auto">LIVE FEED</span> : null}
          </label>
          <input 
            type="number" 
            value={currentPriceInput}
            onChange={(e) => setCurrentPriceInput(e.target.value)}
            className={`w-full bg-slate-950 border rounded px-3 py-2 text-sm text-white focus:border-emerald-500 outline-none font-mono ${activeTrade ? 'border-emerald-900/50 text-emerald-400' : 'border-slate-700'}`}
            placeholder="0.0000"
            disabled={!!activeTrade}
          />
        </div>
      </div>

      <div className="bg-slate-950 rounded-lg p-6 flex flex-col items-center justify-center border border-slate-800 relative overflow-hidden">
         <span className="text-slate-500 text-xs font-mono uppercase tracking-widest mb-1">
           {activeTrade ? 'REAL-TIME PROFIT/LOSS' : 'ESTIMATED PROFIT/LOSS'}
         </span>
         <div className={`text-5xl font-black tracking-tight transition-all duration-300 ${pnl && pnl > 0 ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]' : pnl && pnl < 0 ? 'text-rose-400 drop-shadow-[0_0_10px_rgba(244,63,94,0.3)]' : 'text-slate-500'}`}>
            {pnl !== null ? (
              <>
                {pnl > 0 ? '+' : ''}{pnl.toFixed(2)} <span className="text-xl font-medium text-slate-600">USD</span>
              </>
            ) : (
              '--.--'
            )}
         </div>
         {activeTrade && (
           <div className="mt-2 text-xs font-mono text-slate-500">
             Trade Open: {new Date(activeTrade.openTime).toLocaleTimeString()} | Direction: <span className={activeTrade.type === 'BUY' ? 'text-emerald-500' : 'text-rose-500'}>{activeTrade.type}</span>
           </div>
         )}
      </div>
    </div>
  );
};

export default PnLTracker;
