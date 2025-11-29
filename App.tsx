
import React, { useState, useEffect } from 'react';
import { Activity, RefreshCw, AlertTriangle, ListFilter, BarChart2, Zap } from 'lucide-react';
import { Candle, SignalData, ActiveTrade, MarketType, ClosedTrade } from './types';
import CandleChart from './components/CandleChart';
import SignalCard from './components/SignalCard';
import PnLTracker from './components/PnLTracker';
import TradeJournal from './components/TradeJournal';
import { scanAllMarkets } from './services/geminiService';
import { fetchMarketData } from './utils/marketData';

// Full market list to scan
const MARKET_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', // Majors
  'EURJPY', 'GBPJPY', 'EURGBP', 'EURCAD', 'EURAUD', 'AUDJPY', 'CADJPY', 'CHFJPY', 'GBPAUD', 'GBPCAD', // Minors
  'XAUUSD', 'XAUEUR', 'XAUAUD', // Metals
  'BTCUSD', 'BTCEUR', 'BTCGBP', 'BTCJPY' // Bitcoin Pairs
];

const App: React.FC = () => {
  // Store candle data for ALL pairs
  const [marketData, setMarketData] = useState<Record<string, Candle[]>>({});
  // Signal State
  const [activeSignal, setActiveSignal] = useState<SignalData | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  // UI State
  const [selectedPair, setSelectedPair] = useState('EURUSD'); // Which chart to show
  const [apiKeyError, setApiKeyError] = useState(false);
  const [isLive, setIsLive] = useState(false);
  
  // Active Trade State
  const [activeTrade, setActiveTrade] = useState<ActiveTrade | null>(null);
  // Journal State
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([]);
  // Data Source State
  const [useMT5, setUseMT5] = useState(false);

  // Helper for sequential delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Determine market type helper
  const getMarketType = (pair: string): MarketType => {
    if (pair.includes('BTC') || pair.includes('ETH')) return MarketType.CRYPTO;
    if (pair.includes('XAU')) return MarketType.METALS;
    return MarketType.FOREX;
  };

  const getContractSize = (pair: string) => {
    if (pair.includes('BTC') || pair.includes('ETH')) return 1;
    if (pair.includes('XAU')) return 100;
    return 100000;
  };

  // Trade Logic
  const handleExecuteTrade = (signal: SignalData) => {
    if (activeTrade) return; // Prevent double trade
    
    const newTrade: ActiveTrade = {
      pair: signal.best_pair,
      type: signal.signal === 'BUY' ? 'BUY' : 'SELL',
      entryPrice: signal.entry_price,
      lotSize: signal.lot_size,
      openTime: Date.now(),
      marketType: getMarketType(signal.best_pair)
    };
    
    setActiveTrade(newTrade);
    // If trade executed on a different pair, switch view to it for convenience
    if (signal.best_pair !== selectedPair) {
      setSelectedPair(signal.best_pair);
    }
  };

  const getCurrentTradePrice = () => {
    if (!activeTrade) return 0;
    const candles = marketData[activeTrade.pair];
    if (candles && candles.length > 0) {
      return candles[candles.length - 1].close;
    }
    return activeTrade.entryPrice; // Fallback
  };

  const handleCloseTrade = () => {
    if (!activeTrade) return;

    const closePrice = getCurrentTradePrice();
    const contractSize = getContractSize(activeTrade.pair);
    const direction = activeTrade.type === 'BUY' ? 1 : -1;
    const pnl = (closePrice - activeTrade.entryPrice) * (activeTrade.lotSize * contractSize) * direction;

    const closedTrade: ClosedTrade = {
      id: Date.now().toString(),
      pair: activeTrade.pair,
      type: activeTrade.type,
      entryPrice: activeTrade.entryPrice,
      closePrice: closePrice,
      lotSize: activeTrade.lotSize,
      pnl: pnl,
      closeTime: Date.now()
    };

    setClosedTrades(prev => [...prev, closedTrade]);
    setActiveTrade(null);
  };

  // Load live data on mount
  useEffect(() => {
    let isMounted = true;

    const loadAllPairs = async () => {
      // 1. Fetch Selected Pair FIRST (Immediate UI feedback)
      if (isMounted) {
         const selectedData = await fetchMarketData(selectedPair, useMT5);
         setMarketData(prev => ({ ...prev, [selectedPair]: selectedData }));
         if (initialLoad) setInitialLoad(false);
      }

      // 2. Fetch the rest sequentially to avoid Rate Limits
      // Only do full scan if not in live mode to save resources
      if (!isLive) {
        for (const pair of MARKET_PAIRS) {
          if (!isMounted) break;
          if (pair === selectedPair) continue; // Already fetched

          const candles = await fetchMarketData(pair, useMT5);
          setMarketData(prev => ({ ...prev, [pair]: candles }));
          
          // Throttling: Wait 800ms between requests to stay polite to the free API
          await delay(800);
        }
      }
    };

    loadAllPairs();
    
    // Background Refresh Loop
    // Responsible for keeping Selected Pair AND Active Trade Pair updated
    const interval = setInterval(async () => {
       if(!isMounted) return;
       
       const pairsToUpdate = new Set<string>();
       pairsToUpdate.add(selectedPair);
       if (activeTrade) pairsToUpdate.add(activeTrade.pair);

       for (const pair of Array.from(pairsToUpdate)) {
         try {
           const fresh = await fetchMarketData(pair, useMT5);
           setMarketData(prev => ({ ...prev, [pair]: fresh }));
         } catch (e) {
           console.error("Bg Update Error:", pair, e);
         }
       }
    }, isLive ? 30000 : 60000); // Update faster in Live Mode

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedPair, isLive, activeTrade, useMT5]); 

  // Live Analysis Loop
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const runLiveAnalysis = async () => {
      if (!isLive) return;
      
      try {
        // Fetch latest data for selected pair
        const candles = await fetchMarketData(selectedPair, useMT5);
        setMarketData(prev => ({ ...prev, [selectedPair]: candles }));

        // Analyze ONLY the selected pair to save tokens/quota
        const signal = await scanAllMarkets({ [selectedPair]: candles });
        setActiveSignal(signal);
      } catch (err) {
        console.error("Live Loop Error:", err);
      }
    };

    if (isLive) {
      runLiveAnalysis(); // Immediate run
      // Increased from 30000 to 60000 (60s) to avoid 429 Rate Limits
      interval = setInterval(runLiveAnalysis, 60000); 
    }

    return () => clearInterval(interval);
  }, [isLive, selectedPair, useMT5]);


  const handleScanAllMarkets = async () => {
    if (!process.env.API_KEY) {
      setApiKeyError(true);
      return;
    }
    setApiKeyError(false);
    setLoading(true);
    setIsLive(false); 

    try {
      const freshSelected = await fetchMarketData(selectedPair, useMT5);
      const currentDataSnapshot = { 
        ...marketData, 
        [selectedPair]: freshSelected 
      };
      setMarketData(currentDataSnapshot);

      const signal = await scanAllMarkets(currentDataSnapshot);
      setActiveSignal(signal);

      if (signal.best_pair && signal.best_pair !== 'NONE') {
        setSelectedPair(signal.best_pair);
      }
    } catch (e) {
      console.error(e);
      alert("Error analyzing market. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans">
      
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center border-b border-slate-800 pb-6 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-slate-900 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/20 border border-emerald-500/20">
            <Activity className="text-emerald-400" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white italic">TITAN<span className="text-emerald-500">SIGNAL</span> <span className="text-slate-600 not-italic font-normal text-lg">| ELITE</span></h1>
            <p className="text-xs text-slate-500 font-mono tracking-wider">INSTITUTIONAL M5 REVERSAL ENGINE</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end">
           {/* Data Source Toggle */}
           <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700 p-1 mr-2">
            <button 
              onClick={() => setUseMT5(false)}
              className={`px-3 py-1 text-xs font-bold rounded ${!useMT5 ? 'bg-slate-700 text-white' : 'text-slate-500'}`}
            >
              API
            </button>
            <button 
              onClick={() => setUseMT5(true)}
              className={`px-3 py-1 text-xs font-bold rounded ${useMT5 ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}
            >
              MT5
            </button>
          </div>

          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-700">
             <BarChart2 size={16} className="text-slate-500 ml-2" />
             <select 
              className="bg-transparent text-white text-sm focus:ring-0 border-none outline-none font-mono py-1 pr-2 cursor-pointer"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
            >
              {MARKET_PAIRS.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>

          {/* Live Signals Button */}
          <button 
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold transition-all border ${isLive ? 'bg-rose-500/10 border-rose-500 text-rose-400 animate-pulse' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
          >
             <Zap size={18} className={isLive ? "fill-rose-400" : ""} />
             {isLive ? 'LIVE SCAN ON' : 'LIVE SIGNALS'}
          </button>

          <button 
            onClick={handleScanAllMarkets}
            disabled={loading || initialLoad}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg border border-transparent ${loading || initialLoad ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-900/40 hover:scale-105'}`}
          >
            {loading ? <RefreshCw className="animate-spin" size={18} /> : <ListFilter size={18} />}
            {loading ? 'SCANNING 18 PAIRS...' : initialLoad ? 'LOADING DATA...' : 'SCAN ALL MARKETS'}
          </button>
        </div>
      </header>

      {apiKeyError && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-rose-950/30 border border-rose-900 rounded-lg flex items-center gap-3 text-rose-400">
          <AlertTriangle size={20} />
          <span>API Key missing. Cannot connect to Titan Elite Engine. Please ensure process.env.API_KEY is set.</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Chart & PnL */}
        <div className="lg:col-span-2 space-y-6">
          {initialLoad && Object.keys(marketData).length === 0 ? (
            <div className="w-full h-[320px] bg-slate-900 rounded-lg border border-slate-700 flex flex-col items-center justify-center animate-pulse">
               <Activity className="text-slate-700 w-12 h-12 mb-4 animate-bounce" />
               <span className="text-slate-500 font-mono text-sm">CONNECTING TO LIVE DATA FEED...</span>
            </div>
          ) : (
            <CandleChart data={marketData[selectedPair] || []} pairName={selectedPair} />
          )}
          
          <PnLTracker 
            activeSignal={activeSignal} 
            activeTrade={activeTrade}
            currentLivePrice={getCurrentTradePrice()}
            onCloseTrade={handleCloseTrade}
          />
        </div>

        {/* Right Column: Signal Output & Journal */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <div className="flex-none">
            <SignalCard 
              signalData={activeSignal} 
              history={marketData[activeSignal?.best_pair || selectedPair] || []}
              loading={loading} 
              onExecute={handleExecuteTrade}
              isTradeActive={!!activeTrade}
            />
          </div>
          
          <div className="flex-1 min-h-[300px]">
            <TradeJournal trades={closedTrades} />
          </div>
        </div>

      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto mt-12 pt-6 border-t border-slate-900 text-center text-slate-600 text-xs font-mono">
        <p>SYSTEM STATUS: {initialLoad ? 'INITIALIZING' : isLive ? 'LIVE SCANNING ACTIVE' : 'ONLINE'} | DATA FEED: HYBRID (LIVE + SIMULATION) | STRATEGY: SMART MONEY REVERSAL</p>
        <p className="mt-2 text-[10px] text-slate-700">Trading Foreign Exchange (Forex) carries a high level of risk and may not be suitable for all investors.</p>
      </footer>

    </div>
  );
};

export default App;
