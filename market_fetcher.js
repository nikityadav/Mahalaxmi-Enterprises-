
/**
 * LIVE MARKET DATA FETCHER
 * 
 * Supports: OANDA (Forex/Metals), BINANCE (Crypto)
 * Output: M5 Candle JSON on Close
 * 
 * Usage:
 *   export DATA_SOURCE=OANDA  (or BINANCE)
 *   export SYMBOLS=EUR_USD,XAU_USD  (or btcusdt,ethusdt)
 *   export OANDA_API_KEY=...
 *   export OANDA_ACCOUNT_ID=...
 *   node market_fetcher.js
 */

const https = require('https');
let WebSocket;
try {
  WebSocket = require('ws');
} catch (e) {
  console.warn("WARN: 'ws' module not found. Binance streaming will fail. Run 'npm install ws'");
}

// --- CONFIGURATION ---
const CONFIG = {
  dataSource: process.env.DATA_SOURCE || 'OANDA', // 'OANDA' or 'BINANCE'
  symbols: (process.env.SYMBOLS || 'EUR_USD').split(',').map(s => s.trim()),
  timeframe: 'M5', // 5 Minutes
  oanda: {
    apiKey: process.env.OANDA_API_KEY,
    accountId: process.env.OANDA_ACCOUNT_ID,
    practice: process.env.OANDA_PRACTICE !== 'false', // Default true
    streamHost: process.env.OANDA_PRACTICE === 'false' ? 'stream-fxtrade.oanda.com' : 'stream-fxpractice.oanda.com',
  },
  binance: {
    wsBase: 'wss://stream.binance.com:9443/ws',
  }
};

const M5_MS = 5 * 60 * 1000;

class MarketFetcher {
  constructor() {
    this.activeCandles = {}; // { symbol: { open, high, low, close, bucketTime, currentPrice } }
  }

  // --- UTILS ---

  getM5Bucket(timestamp) {
    const ms = new Date(timestamp).getTime();
    return ms - (ms % M5_MS);
  }

  // --- OUTPUT ---

  emitCandle(symbol, candle) {
    const output = {
      symbol: symbol,
      time: new Date(candle.bucketTime + M5_MS).toISOString(), // Close time
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      current_price: candle.close
    };
    console.log(JSON.stringify(output));
  }

  // --- PROCESSING ---

  processTick(symbol, price, timeStr) {
    const tickTime = new Date(timeStr).getTime();
    const bucketStart = this.getM5Bucket(tickTime);
    
    let candle = this.activeCandles[symbol];

    // 1. Check for Candle Close (New Bucket Started)
    if (candle && bucketStart > candle.bucketTime) {
      this.emitCandle(symbol, candle);
      candle = null; // Reset
    }

    // 2. Initialize or Update Candle
    if (!candle) {
      // Start new candle
      this.activeCandles[symbol] = {
        bucketTime: bucketStart,
        open: price,
        high: price,
        low: price,
        close: price,
        currentPrice: price
      };
    } else {
      // Update existing
      if (price > candle.high) candle.high = price;
      if (price < candle.low) candle.low = price;
      candle.close = price;
      candle.currentPrice = price;
      this.activeCandles[symbol] = candle;
    }
  }
}

const fetcher = new MarketFetcher();

// --- OANDA CONNECTION ---
function startOanda() {
  const { apiKey, accountId, streamHost } = CONFIG.oanda;
  
  if (!apiKey || !accountId) {
    console.error("Error: Missing OANDA Credentials.");
    process.exit(1);
  }

  const symbolsStr = CONFIG.symbols.map(s => s.includes('_') ? s : s.replace('/', '_')).join(',');

  const options = {
    hostname: streamHost,
    path: `/v3/accounts/${accountId}/pricing/stream?instruments=${encodeURIComponent(symbolsStr)}`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${apiKey}` }
  };

  console.error(`Connecting to OANDA Stream: ${symbolsStr}`);

  const req = https.request(options, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'PRICE') {
            // Calculate Mid Price for Forex
            const bid = parseFloat(msg.bids[0].price);
            const ask = parseFloat(msg.asks[0].price);
            const mid = (bid + ask) / 2;
            
            fetcher.processTick(msg.instrument, mid, msg.time);
          } else if (msg.type === 'HEARTBEAT') {
            // Keep connection alive
          }
        } catch (e) {
          // Ignore parse errors for heartbeats or malformed lines
        }
      }
    });

    res.on('end', () => {
      console.error("OANDA Stream ended. Reconnecting in 3s...");
      setTimeout(startOanda, 3000);
    });
  });

  req.on('error', (e) => {
    console.error(`OANDA Request Error: ${e.message}. Retrying...`);
    setTimeout(startOanda, 5000);
  });

  req.end();
}

// --- BINANCE CONNECTION ---
function startBinance() {
  if (!WebSocket) {
    console.error("Error: 'ws' module required for Binance.");
    process.exit(1);
  }

  const streams = CONFIG.symbols.map(s => `${s.toLowerCase()}@kline_5m`).join('/');
  const wsUrl = `${CONFIG.binance.wsBase}/stream?streams=${streams}`;

  console.error(`Connecting to Binance WS: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);

  ws.on('open', () => {
    console.error("Binance Connected.");
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.data && msg.data.k) {
        const k = msg.data.k;
        
        // Binance Klines map directly to candles
        // We can either use their 'x' (closed) flag directly or feed ticks.
        // To be consistent with "Live Market Data Fetcher" logic, we treat close as current price.
        
        const symbol = k.s;
        const price = parseFloat(k.c);
        const time = new Date(k.t).toISOString();
        const isClosed = k.x;

        if (isClosed) {
          // Output immediately on close
          const output = {
            symbol: symbol,
            time: new Date(k.T).toISOString(), // Candle End Time
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            current_price: parseFloat(k.c)
          };
          console.log(JSON.stringify(output));
        } else {
           // Optional: Track live price internally if needed for other logic
        }
      }
    } catch (e) {
      console.error("Binance Parse Error:", e.message);
    }
  });

  ws.on('close', () => {
    console.error("Binance WS Closed. Reconnecting in 3s...");
    setTimeout(startBinance, 3000);
  });

  ws.on('error', (e) => {
    console.error("Binance WS Error:", e.message);
  });
}

// --- MAIN ENTRY ---

if (CONFIG.dataSource === 'OANDA') {
  startOanda();
} else {
  startBinance();
}
