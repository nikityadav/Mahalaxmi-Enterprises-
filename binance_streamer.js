
const WebSocket = require('ws');

// Configuration
// Default to BTCUSDT if no env var provided
const SYMBOLS = (process.env.SYMBOLS || 'btcusdt').split(',').map(s => s.trim().toLowerCase());
const RECONNECT_DELAY = 5000;

// URL Construction
// Combined streams format: wss://stream.binance.com:9443/stream?streams=<stream1>/<stream2>
// Stream name: <symbol>@kline_5m
const streamNames = SYMBOLS.map(s => `${s}@kline_5m`);
const WS_URL = `wss://stream.binance.com:9443/stream?streams=${streamNames.join('/')}`;

console.log(`Starting Binance Streamer for: ${SYMBOLS.join(', ').toUpperCase()}`);
console.log(`Stream URL: ${WS_URL}`);

function startStream() {
  let ws;
  
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    if (e.message.includes('Cannot find module')) {
      console.error("Error: 'ws' module is missing. Please run: npm install ws");
      process.exit(1);
    }
    throw e;
  }

  ws.on('open', () => {
    console.log('Connected to Binance WebSocket.');
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      // Combined stream payload format: { "stream": "btcusdt@kline_5m", "data": { ... } }
      if (!message.data || !message.data.k) return;

      const kline = message.data.k;

      // Check if candle is closed (x: true means the candle is finished)
      if (kline.x) {
        const output = {
          symbol: kline.s.toUpperCase(),     // Symbol (e.g., BTCUSDT)
          time: new Date(kline.T).toISOString(), // ISO8601 of candle close time
          open: parseFloat(kline.o),
          high: parseFloat(kline.h),
          low: parseFloat(kline.l),
          close: parseFloat(kline.c)
        };

        // Output strict JSON on a single line
        console.log(JSON.stringify(output));
      }
    } catch (e) {
      console.error('Error parsing message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log(`Connection closed. Reconnecting in ${RECONNECT_DELAY/1000}s...`);
    setTimeout(startStream, RECONNECT_DELAY);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    // The close event will usually follow an error, triggering the reconnect logic
    try {
        ws.close();
    } catch (e) {
        // Ignore close errors
    }
  });
}

// Start the process
startStream();
