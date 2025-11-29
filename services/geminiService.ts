
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { SignalData, Candle } from "../types";

// Optimized System Instruction to save tokens
const SYSTEM_INSTRUCTION = `
You are a PREMIUM FOREX SIGNAL ENGINE.
Analyze the market data for M5 signals.

STRATEGY:
1. TREND: 
   BUY = Price > SMA200 && SMA20 > SMA200.
   SELL = Price < SMA200 && SMA20 < SMA200.
2. ENTRY: 
   Liquidity sweep + Rejection (Pin/Engulfing) + Pullback to SMA20.
3. VALIDATION: 
   Score 0-100. Return signal only if score >= 80.

OUTPUT JSON:
{
  "best_pair": "string",
  "timeframe": "M5",
  "trend": "UPTREND|DOWNTREND|RANGING",
  "signal": "BUY|SELL|NO_SIGNAL",
  "entry_price": number,
  "stop_loss": number,
  "tp1": number,
  "tp2": number,
  "tp3": number,
  "reason": "string",
  "strength_score": number,
  "lot_size": 0.10,
  "estimated_profit_tp1": number,
  "estimated_profit_tp2": number,
  "estimated_profit_tp3": number,
  "live_pnl_formula": "string",
  "status": "ACTIVE|WAIT"
}
If no valid signal, set "best_pair": "NONE", "signal": "NO_SIGNAL".
`;

const signalSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    best_pair: { type: Type.STRING },
    timeframe: { type: Type.STRING, enum: ["M5"] },
    trend: { type: Type.STRING },
    signal: { type: Type.STRING, enum: ["BUY", "SELL", "NO_SIGNAL"] },
    entry_price: { type: Type.NUMBER },
    stop_loss: { type: Type.NUMBER },
    tp1: { type: Type.NUMBER },
    tp2: { type: Type.NUMBER },
    tp3: { type: Type.NUMBER },
    reason: { type: Type.STRING },
    strength_score: { type: Type.NUMBER },
    lot_size: { type: Type.NUMBER },
    estimated_profit_tp1: { type: Type.NUMBER },
    estimated_profit_tp2: { type: Type.NUMBER },
    estimated_profit_tp3: { type: Type.NUMBER },
    live_pnl_formula: { type: Type.STRING },
    status: { type: Type.STRING, enum: ["ACTIVE", "WAIT"] },
  },
  required: [
    "best_pair",
    "timeframe",
    "trend",
    "signal",
    "entry_price",
    "stop_loss",
    "tp1",
    "tp2",
    "tp3",
    "reason",
    "strength_score",
    "lot_size",
    "estimated_profit_tp1",
    "estimated_profit_tp2",
    "estimated_profit_tp3",
    "live_pnl_formula",
  ],
};

const summarizeMarketData = (marketData: Record<string, Candle[]>) => {
  let summary = "";
  // Limit to top 5 pairs to save tokens if sending multiple, 
  // or just send all if list is small. 
  // For 'Scan All', we might be sending 20 pairs which is huge.
  // We'll prioritize the first few if the list is huge to prevent token overflow, 
  // but strictly rely on the caller to manage batching if needed.
  const pairs = Object.keys(marketData);
  
  for (const pair of pairs) {
    const candles = marketData[pair];
    if (!candles || candles.length < 3) continue;
    
    const last3 = candles.slice(-3);
    const current = last3[2];
    
    // Condensed format
    summary += `P:${pair}|C:${current.close}|SMA20:${current.sma20?.toFixed(4)}|SMA200:${current.sma200?.toFixed(4)}\n`;
    summary += `L3:[${last3[0].open},${last3[0].high},${last3[0].low},${last3[0].close}],[${last3[1].open},${last3[1].high},${last3[1].low},${last3[1].close}],[${current.open},${current.high},${current.low},${current.close}]\n--\n`;
  }
  return summary;
};

export const scanAllMarkets = async (
  marketData: Record<string, Candle[]>
): Promise<SignalData> => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    console.error("API_KEY missing");
    return createErrorSignal("API Key Missing");
  }

  const ai = new GoogleGenAI({ apiKey });
  const marketSummary = summarizeMarketData(marketData);

  const prompt = `Analyze:\n${marketSummary}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: signalSchema,
        temperature: 0.1, 
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as SignalData;
    } else {
      throw new Error("Empty response");
    }
  } catch (error: any) {
    // Graceful Rate Limit Handling
    const errString = JSON.stringify(error);
    if (errString.includes("429") || errString.includes("RESOURCE_EXHAUSTED") || errString.includes("quota")) {
      console.warn("Gemini Rate Limit Hit");
      return createErrorSignal("API RATE LIMIT REACHED. Cooling down...");
    }
    
    console.error("Gemini Error:", error);
    return createErrorSignal("Analysis Service Unavailable");
  }
};

function createErrorSignal(reason: string): SignalData {
  return {
    best_pair: "NONE",
    timeframe: "M5",
    trend: "RANGING",
    signal: "NO_SIGNAL",
    entry_price: 0,
    stop_loss: 0,
    tp1: 0,
    tp2: 0,
    tp3: 0,
    reason: reason,
    strength_score: 0,
    lot_size: 0.10,
    estimated_profit_tp1: 0,
    estimated_profit_tp2: 0,
    estimated_profit_tp3: 0,
    live_pnl_formula: "",
    status: "WAIT"
  };
}
