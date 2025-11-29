
/**
 * PREMIUM TRADINGVIEW WEBHOOK SIGNAL SCANNER
 * 
 * Functionality:
 * 1. Listens for HTTP POST webhooks from TradingView.
 * 2. Parses candle data and indicators (SMA20, SMA200).
 * 3. Validates Trend & Reversal logic.
 * 4. Calculates SL/TP levels (1.5R, 2R, 3R).
 * 5. Outputs strict JSON signals.
 * 
 * --- TRADINGVIEW ALERT CONFIGURATION ---
 * Set Webhook URL to: http://<your-server-ip>:3000/webhook
 * 
 * Message (JSON):
 * {
 *   "symbol": "{{ticker}}",
 *   "time": "{{timenow}}",
 *   "open": {{open}},
 *   "high": {{high}},
 *   "low": {{low}},
 *   "close": {{close}},
 *   "sma20": {{plot("SMA20")}}, 
 *   "sma200": {{plot("SMA200")}},
 *   "reversal_signal": true,
 *   "pattern_name": "Bullish Engulfing" 
 * }
 * 
 * Note: If SMA values are not provided, the scanner will rely on the "trend" field if present,
 * but for "Premium" validation, sending SMAs is recommended.
 */

const http = require('http');

// --- CONFIGURATION ---
const PORT = process.env.PORT || 3000;
const DEFAULT_LOT_SIZE = parseFloat(process.env.LOT_SIZE || '0.10');
const RISK_PERCENT = parseFloat(process.env.RISK_PERCENT || '1.0');
const TIMEFRAME = "M5";

// --- LOGIC ENGINE ---
class SignalEngine {
  static process(data) {
    // 1. Validate Data Integrity
    if (!data.symbol || !data.close) {
      return { error: "Invalid Data: Missing symbol or close price" };
    }

    const close = parseFloat(data.close);
    const high = parseFloat(data.high);
    const low = parseFloat(data.low);
    const sma20 = data.sma20 ? parseFloat(data.sma20) : null;
    const sma200 = data.sma200 ? parseFloat(data.sma200) : null;
    
    // 2. Trend Detection
    // Strict Mode: Uses SMAs if available
    let trend = "FLAT";
    let isTrendValid = false;

    if (sma20 && sma200) {
      if (close > sma200 && sma20 > sma200) {
        trend = "UPTREND";
        isTrendValid = true;
      } else if (close < sma200 && sma20 < sma200) {
        trend = "DOWNTREND";
        isTrendValid = true;
      }
    } else if (data.trend) {
      // Fallback to user-provided trend string
      if (data.trend.toUpperCase().includes("BUY") || data.trend.toUpperCase().includes("UP")) {
        trend = "UPTREND";
        isTrendValid = true;
      } else if (data.trend.toUpperCase().includes("SELL") || data.trend.toUpperCase().includes("DOWN")) {
        trend = "DOWNTREND";
        isTrendValid = true;
      }
    }

    if (!isTrendValid) {
      return {
        symbol: data.symbol,
        status: "WAIT",
        reason: "Trend conditions not met (Price/SMA alignment)"
      };
    }

    // 3. Reversal Signal Validation
    // Checks if TradingView sent a reversal flag (e.g. from Pine Script logic)
    const isReversal = data.reversal_signal === true || data.reversal_signal === "true";
    
    if (!isReversal) {
      return {
        symbol: data.symbol,
        status: "WAIT",
        reason: "No Reversal Signal (Pin Bar/Sweep/BOS) detected"
      };
    }

    // 4. Direction & Entry
    const direction = trend === "UPTREND" ? "BUY" : "SELL";
    const entryPrice = close;

    // 5. Risk Management (SL & TP)
    // SL Logic: 
    // BUY: Below Low of the reversal candle (plus tiny buffer)
    // SELL: Above High of the reversal candle (plus tiny buffer)
    
    let stopLoss, risk;
    
    if (direction === "BUY") {
      stopLoss = low; // Conservative: Low of signal candle
      if (stopLoss >= entryPrice) stopLoss = entryPrice * 0.9995; // Safety fallback
      risk = entryPrice - stopLoss;
    } else {
      stopLoss = high; // Conservative: High of signal candle
      if (stopLoss <= entryPrice) stopLoss = entryPrice * 1.0005; // Safety fallback
      risk = stopLoss - entryPrice;
    }

    // Ensure minimum risk to avoid division by zero or tiny targets
    if (risk <= 0.00001) risk = entryPrice * 0.0005;

    const tp1 = direction === "BUY" ? entryPrice + (risk * 1.5) : entryPrice - (risk * 1.5);
    const tp2 = direction === "BUY" ? entryPrice + (risk * 2.0) : entryPrice - (risk * 2.0);
    const tp3 = direction === "BUY" ? entryPrice + (risk * 3.0) : entryPrice - (risk * 3.0);

    // 6. Strength Score (Mock calculation based on confirmation)
    // If SMAs aligned + Reversal Signal present -> High Score
    const strengthScore = (sma20 && sma200) ? 90 : 80;

    // 7. Construct Final JSON
    return {
      symbol: data.symbol,
      timeframe: TIMEFRAME,
      trend: trend,
      signal: direction,
      entry_price: Number(entryPrice.toFixed(5)),
      stop_loss: Number(stopLoss.toFixed(5)),
      tp1: Number(tp1.toFixed(5)),
      tp2: Number(tp2.toFixed(5)),
      tp3: Number(tp3.toFixed(5)),
      strength_score: strengthScore,
      reason: `${trend} confirmed + ${data.pattern_name || 'Reversal Pattern'} + Risk ${risk.toFixed(5)}`
    };
  }
}

// --- HTTP SERVER ---
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Received Webhook for ${payload.symbol}`);
        
        // Process Logic
        const signal = SignalEngine.process(payload);
        
        // Output to Console (Standard Out)
        console.log(JSON.stringify(signal, null, 2));

        // Response to TradingView
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({ status: 'received', signal: signal }));
        
      } catch (error) {
        console.error("Error processing webhook:", error.message);
        res.writeHead(400, {'Content-Type': 'text/plain'});
        res.end("Invalid JSON Payload");
      }
    });
  } else {
    // Health Check
    res.writeHead(200);
    res.end("TitanSignal Webhook Scanner Active");
  }
});

server.listen(PORT, () => {
  console.log(`
===========================================================
  PREMIUM WEBHOOK SCANNER LISTENING ON PORT ${PORT}
===========================================================
  Waiting for TradingView Alerts...
  
  Endpoint: POST /webhook
  Target Timeframe: M5
  Strategy: SMA20/200 Trend + Reversal
===========================================================
`);
});
