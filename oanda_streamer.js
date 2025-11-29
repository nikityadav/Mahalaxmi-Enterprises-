
const https = require('https');

// Configuration from Environment Variables
const ACCOUNT_ID = process.env.OANDA_ACCOUNT_ID;
const API_KEY = process.env.OANDA_API_KEY;
const INSTRUMENTS = (process.env.SYMBOLS || 'EUR_USD,XAU_USD').split(',').map(s => s.trim());
const PRACTICE = process.env.OANDA_PRACTICE !== 'false'; // Default to true (Practice)

const STREAM_DOMAIN = PRACTICE 
  ? 'stream-fxpractice.oanda.com' 
  : 'stream-fxtrade.oanda.com';

if (!ACCOUNT_ID || !API_KEY) {
  console.error("Error: Missing OANDA_ACCOUNT_ID or OANDA_API_KEY environment variables.");
  console.error("Usage: export OANDA_ACCOUNT_ID=... && export OANDA_API_KEY=... && node oanda_streamer.js");
  process.exit(1);
}

// State for aggregation
const activeCandles = {}; // { symbol: { open, high, low, close, bucketTime (ms) } }
const M5_MS = 5 * 60 * 1000;

console.log(`Starting OANDA Streamer for: ${INSTRUMENTS.join(', ')}`);
console.log(`Environment: ${PRACTICE ? 'Practice' : 'Live'}`);

function getM5BucketStart(dateObj) {
  const ms = dateObj.getTime();
  const remainder = ms % M5_MS;
  return ms - remainder;
}

function processLine(line) {
  try {
    const data = JSON.parse(line);
    
    // Handle Heartbeats
    if (data.type === 'HEARTBEAT') {
      return;
    }

    // Handle Price Ticks
    if (data.type === 'PRICE') {
      const symbol = data.instrument;
      const time = new Date(data.time);
      const bucketStart = getM5BucketStart(time);
      
      // Calculate Mid Price
      let price = 0;
      if (data.bids && data.bids.length > 0 && data.asks && data.asks.length > 0) {
        price = (parseFloat(data.bids[0].price) + parseFloat(data.asks[0].price)) / 2;
      } else if (data.closeoutBid && data.closeoutAsk) {
        price = (parseFloat(data.closeoutBid) + parseFloat(data.closeoutAsk)) / 2;
      } else {
        return; // Skip if no price data
      }

      let candle = activeCandles[symbol];

      // If we have a candle from a previous bucket, close it
      if (candle && bucketStart > candle.bucketTime) {
        const closeTime = new Date(candle.bucketTime + M5_MS).toISOString();
        
        const output = {
          symbol: symbol,
          time: closeTime, // "ISO8601 of candle close"
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };

        console.log(JSON.stringify(output));
        
        // Clear old candle
        candle = null;
      }

      // Initialize new candle if needed
      if (!candle) {
        activeCandles[symbol] = {
          bucketTime: bucketStart,
          open: price,
          high: price,
          low: price,
          close: price
        };
      } else {
        // Update existing candle
        if (price > candle.high) candle.high = price;
        if (price < candle.low) candle.low = price;
        candle.close = price;
        activeCandles[symbol] = candle;
      }
    }
  } catch (e) {
    console.error("Error processing line:", e.message);
  }
}

function startStream() {
  const options = {
    hostname: STREAM_DOMAIN,
    path: `/v3/accounts/${ACCOUNT_ID}/pricing/stream?instruments=${encodeURIComponent(INSTRUMENTS.join(','))}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Connection': 'keep-alive'
    }
  };

  const req = https.request(options, (res) => {
    if (res.statusCode !== 200) {
      console.error(`Stream connection failed with status: ${res.statusCode}`);
      // If unauthorized, don't retry immediately
      if (res.statusCode === 401) process.exit(1);
      setTimeout(startStream, 5000);
      return;
    }

    console.log("Connected to OANDA Stream.");
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      // The last element is either an empty string (if line ended with \n) or an incomplete line
      buffer = lines.pop(); 

      for (const line of lines) {
        if (line.trim()) {
          processLine(line);
        }
      }
    });

    res.on('end', () => {
      console.log("Stream ended by server. Reconnecting...");
      setTimeout(startStream, 1000);
    });

    res.on('error', (err) => {
      console.error("Stream response error:", err);
    });
  });

  req.on('error', (e) => {
    console.error("Request error:", e.message);
    setTimeout(startStream, 5000);
  });

  req.end();
}

startStream();
