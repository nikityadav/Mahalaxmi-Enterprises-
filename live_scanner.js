
/**
 * PREMIUM LIVE MARKET SIGNAL SCANNER
 * 
 * Sources: OANDA (Forex/Metals), BINANCE (Crypto)
 * Timeframe: M5
 * Strategy: Trend (SMA200) + Reversal (Sweep/Pin/BOS)
 * 
 * Usage: 
 *   export SYMBOLS=EUR_USD,XAU_USD,BTCUSDT
 *   export OANDA_API_KEY=...
 *   export OANDA_ACCOUNT_ID=...
 *   node live_scanner.js
 */

const https = require('https');
const EventEmitter = require('events');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.warn("WARN: 'ws' module not found. Binance streaming will fail. Run 'npm install ws'");
}

// --- CONFIGURATION ---
const CONFIG = {
  // dataSource: Removed preference. Now derived from SYMBOLS.
  symbols: (process.env.SYMBOLS || 'BTCUSDT').split(',').map(s => s.trim()),
  timeframe: 'M5',
  riskReward: { tp1: 1.5, tp2: 2.0, tp3: 3.0 },
  oanda: {
    apiKey: process.env.OANDA_API_KEY,
    accountId: process.env.OANDA_ACCOUNT_ID,
    practice: process.env.OANDA_PRACTICE !== 'false', // Default true
    streamHost: process.env.OANDA_PRACTICE === 'false' ? 'stream-fxtrade.oanda.com' : 'stream-fxpractice.oanda.com',
    apiHost: process.env.OANDA_PRACTICE === 'false' ? 'api-fxtrade.oanda.com' : 'api-fxpractice.oanda.com'
  },
  binance: {
    wsBase: 'wss://stream.binance.com:9443/ws',
    apiBase: 'https://api.binance.com'
  }
};

// --- TECHNICAL ANALYSIS ENGINE ---
class TechAnalysis {
  static sma(data, period) {
    if (data.length < period) return null;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
  }

  static atr(candles, period) {
    if (candles.length < period + 1) return null;
    let trSum = 0;
    // Simple ATR calc for efficiency
    for (let i = candles.length - period; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trSum += tr;
    }
    return trSum / period;
  }

  static detectPattern(candles) {
    const current = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    
    const bodySize = Math.abs(current.close - current.open);
    const totalSize = current.high - current.low;
    const wickTop = current.high - Math.max(current.open, current.close);
    const wickBottom = Math.min(current.open, current.close) - current.low;
    
    // Pin Bar / Hammer / Shooting Star
    const isPinBarBullish = wickBottom > (bodySize * 2) && wickTop < bodySize;
    const isPinBarBearish = wickTop > (bodySize * 2) && wickBottom < bodySize;

    // Engulfing
    const isBullishEngulfing = current.close > current.open && prev.close < prev.open && current.close > prev.open && current.open < prev.close;
    const isBearishEngulfing = current.close < current.open && prev.close > prev.open && current.close < prev.close && current.open > prev.open;

    if (isPinBarBullish || isBullishEngulfing) return 'BULLISH';
    if (isPinBarBearish || isBearishEngulfing) return 'BEARISH';
    return 'NEUTRAL';
  }

  static detectSweep(candles, lookback = 10) {
    // Basic sweep detection: Price broke a recent high/low but closed back inside
    const current = candles[candles.length - 1];
    const prevHigh = Math.max(...candles.slice(-lookback, -1).map(c => c.high));
    const prevLow = Math.min(...candles.slice(-lookback, -1).map(c => c.low));

    // Bearish Sweep (Liquidity Grab at Top)
    if (current.high > prevHigh && current.close < prevHigh) return 'BEARISH_SWEEP';
    
    // Bullish Sweep (Liquidity Grab at Low)
    if (current.low < prevLow && current.close > prevLow) return 'BULLISH_SWEEP';

    return 'NONE';
  }
}

// --- MARKET DATA MANAGER ---
class MarketManager {
  constructor() {
    this.candles = {}; // { symbol: [ {time, open, high, low, close} ] }
    this.activeCandle = {}; // { symbol: { ... } }
  }

  initSymbol(symbol) {
    if (!this.candles[symbol]) this.candles[symbol] = [];
  }

  addHistory(symbol, historyCandles) {
    this.initSymbol(symbol);
    // Merge history, ensuring no duplicates by time
    const existingTimes = new Set(this.candles[symbol].map(c => c.time));
    historyCandles.forEach(c => {
      if (!existingTimes.has(c.time)) {
        this.candles[symbol].push(c);
      }
    });
    this.candles[symbol].sort((a, b) => new Date(a.time) - new Date(b.time));
    // Keep reasonable buffer
    if (this.candles[symbol].length > 300) {
      this.candles[symbol] = this.candles[symbol].slice(-300);
    }
  }

  updateTick(symbol, price, time) {
    this.initSymbol(symbol);
    
    const tickTime = new Date(time);
    const m5Start = new Date(tickTime);
    m5Start.setMinutes(Math.floor(tickTime.getMinutes() / 5) * 5, 0, 0);
    const m5TimeStr = m5Start.toISOString();

    let active = this.activeCandle[symbol];

    // Check if new candle started
    if (active && active.time !== m5TimeStr) {
      // Close previous candle
      this.candles[symbol].push(active);
      if (this.candles[symbol].length > 300) this.candles[symbol].shift();
      
      // Emit Candle Close Event
      this.onCandleClose(symbol, active);
      
      active = null;
    }

    if (!active) {
      this.activeCandle[symbol] = {
        time: m5TimeStr,
        open: price,
        high: price,
        low: price,
        close: price
      };
    } else {
      active.close = price;
      if (price > active.high) active.high = price;
      if (price < active.low) active.low = price;
      this.activeCandle[symbol] = active;
    }
  }

  // Called when a candle officially closes
  onCandleClose(symbol, candle) {
    const history = this.candles[symbol];
    if (history.length < 200) {
      console.log(JSON.stringify({ symbol, status: "WAIT", reason: `Not enough data (${history.length}/200)` }));
      return;
    }

    // --- RUN STRATEGY ---
    const closes = history.map(c => c.close);
    const sma20 = TechAnalysis.sma(closes, 20);
    const sma200 = TechAnalysis.sma(closes, 200);
    const atr = TechAnalysis.atr(history, 14);
    const pattern = TechAnalysis.detectPattern(history);
    const sweep = TechAnalysis.detectSweep(history);

    // 1. TREND FILTER
    const isUptrend = sma20 > sma200 && candle.close > sma200;
    const isDowntrend = sma20 < sma200 && candle.close < sma200;

    let signal = 'NONE';
    let reason = '';
    let score = 0;

    // 2. SIGNAL DETECTION
    if (isUptrend) {
      if (pattern === 'BULLISH' || sweep === 'BULLISH_SWEEP') {
        signal = 'BUY';
        reason = `Uptrend (Price > SMA200) + ${pattern === 'BULLISH' ? 'Bullish Pattern' : 'Liquidity Sweep'}`;
        score = 85;
      }
    } else if (isDowntrend) {
      if (pattern === 'BEARISH' || sweep === 'BEARISH_SWEEP') {
        signal = 'SELL';
        reason = `Downtrend (Price < SMA200) + ${pattern === 'BEARISH' ? 'Bearish Pattern' : 'Liquidity Sweep'}`;
        score = 85;
      }
    }

    // 3. OUTPUT
    if (signal !== 'NONE') {
      // Risk Management
      const slDist = atr * 1.5;
      const entry = candle.close;
      const sl = signal === 'BUY' ? entry - slDist : entry + slDist;
      const risk = Math.abs(entry - sl);
      
      const output = {
        symbol: symbol,
        timeframe: CONFIG.timeframe,
        trend: isUptrend ? 'UPTREND' : 'DOWNTREND',
        signal: signal,
        entry_price: parseFloat(entry.toFixed(5)),
        stop_loss: parseFloat(sl.toFixed(5)),
        tp1: parseFloat((signal === 'BUY' ? entry + (risk * 1.5) : entry - (risk * 1.5)).toFixed(5)),
        tp2: parseFloat((signal === 'BUY' ? entry + (risk * 2.0) : entry - (risk * 2.0)).toFixed(5)),
        tp3: parseFloat((signal === 'BUY' ? entry + (risk * 3.0) : entry - (risk * 3.0)).toFixed(5)),
        strength_score: score,
        reason: reason
      };
      
      console.log(JSON.stringify(output));
    } else {
      console.log(JSON.stringify({
        symbol,
        status: "WAIT",
        trend: isUptrend ? 'UP' : isDowntrend ? 'DOWN' : 'FLAT',
        reason: "No valid reversal setup"
      }));
    }
  }
}

const marketManager = new MarketManager();

// --- ADAPTERS ---

// OANDA ADAPTER
async function startOanda(symbols) {
  if (symbols.length === 0) return;

  const { apiKey, accountId, apiHost, streamHost } = CONFIG.oanda;
  if (!apiKey || !accountId) {
    console.error("Missing OANDA API Key or Account ID for symbols: " + symbols.join(','));
    return;
  }

  // 1. Fetch History first (Warmup)
  console.error(`Fetching history from OANDA for ${symbols.length} pairs...`);
  for (const symbol of symbols) {
    const oandaSymbol = symbol.includes('_') ? symbol : symbol.replace('/', '_');
    try {
      const path = `/v3/instruments/${oandaSymbol}/candles?count=250&granularity=M5`;
      const data = await httpsGet(apiHost, path, apiKey);
      if (data && data.candles) {
        const history = data.candles
          .filter(c => c.complete)
          .map(c => ({
            time: c.time,
            open: parseFloat(c.mid.o),
            high: parseFloat(c.mid.h),
            low: parseFloat(c.mid.l),
            close: parseFloat(c.mid.c)
          }));
        marketManager.addHistory(oandaSymbol, history);
        console.error(`Loaded ${history.length} candles for ${oandaSymbol}`);
      }
    } catch (e) {
      console.error(`Failed to load history for ${symbol}:`, e.message);
    }
  }

  // 2. Start Stream
  console.error(`Starting OANDA Stream for: ${symbols.join(', ')}`);
  const symbolsStr = symbols.map(s => s.includes('_') ? s : s.replace('/', '_')).join(',');
  
  const options = {
    hostname: streamHost,
    path: `/v3/accounts/${accountId}/pricing/stream?instruments=${encodeURIComponent(symbolsStr)}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  };

  const req = https.request(options, (res) => {
    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'PRICE') {
            const price = (parseFloat(msg.bids[0].price) + parseFloat(msg.asks[0].price)) / 2;
            marketManager.updateTick(msg.instrument, price, msg.time);
          }
        } catch (e) {}
      }
    });
  });
  req.end();
}

// BINANCE ADAPTER
async function startBinance(symbols) {
  if (symbols.length === 0) return;
  if (!WebSocket) {
    console.error("Cannot start Binance without 'ws' module.");
    return;
  }

  // 1. Fetch History (Warmup)
  console.error(`Fetching history from Binance for ${symbols.length} pairs...`);
  for (const symbol of symbols) {
    try {
      const path = `/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=5m&limit=250`;
      const data = await httpsGet('api.binance.com', path);
      if (Array.isArray(data)) {
        const history = data.map(k => ({
          time: new Date(k[0]).toISOString(),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4])
        }));
        marketManager.addHistory(symbol.toUpperCase(), history);
        console.error(`Loaded ${history.length} candles for ${symbol}`);
      }
    } catch (e) {
      console.error(`Failed to load history for ${symbol}:`, e.message);
    }
  }

  // 2. Start WebSocket Stream
  const streams = symbols.map(s => `${s.toLowerCase()}@kline_5m`).join('/');
  const wsUrl = `${CONFIG.binance.wsBase}/stream?streams=${streams}`;
  
  console.error(`Connecting to Binance WS...`);
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => console.error("Binance WS Connected"));
  
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.data && msg.data.k) {
      const k = msg.data.k;
      const symbol = k.s;
      marketManager.updateTick(symbol, parseFloat(k.c), new Date(k.t));
    }
  });
}

// Helper
function httpsGet(host, path, apiKey = null) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host,
      path: path,
      headers: { 'User-Agent': 'NodeScanner' }
    };
    if (apiKey) opts.headers['Authorization'] = `Bearer ${apiKey}`;
    
    https.get(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// --- MAIN HYBRID ROUTING ---
const oandaSymbols = [];
const binanceSymbols = [];

CONFIG.symbols.forEach(s => {
  // Logic: XAUUSD, XAU_USD, or pairs with underscore are OANDA/Forex
  // Pairs like BTCUSDT are Binance
  if (s.includes('_') || s === 'XAUUSD' || s === 'EURUSD' || s.includes('JPY') || s.includes('CAD') || s.includes('AUD')) {
    oandaSymbols.push(s);
  } else {
    binanceSymbols.push(s);
  }
});

if (oandaSymbols.length > 0) startOanda(oandaSymbols);
if (binanceSymbols.length > 0) startBinance(binanceSymbols);
