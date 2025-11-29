import { Candle } from '../types';

// Map standard pairs to CryptoCompare Symbols (FSYM, TSYM)
// Updated base prices to reflect more accurate 2024/2025 market levels for fallback scenarios
const PAIR_MAP: Record<string, { f: string; t: string; base: number }> = {
  'EURUSD': { f: 'EUR', t: 'USD', base: 1.0550 },
  'GBPUSD': { f: 'GBP', t: 'USD', base: 1.2650 },
  'USDJPY': { f: 'USD', t: 'JPY', base: 154.50 },
  'USDCHF': { f: 'USD', t: 'CHF', base: 0.8850 },
  'USDCAD': { f: 'USD', t: 'CAD', base: 1.4050 },
  'AUDUSD': { f: 'AUD', t: 'USD', base: 0.6500 },
  'NZDUSD': { f: 'NZD', t: 'USD', base: 0.5900 },
  'EURJPY': { f: 'EUR', t: 'JPY', base: 163.00 },
  'GBPJPY': { f: 'GBP', t: 'JPY', base: 195.50 },
  'EURGBP': { f: 'EUR', t: 'GBP', base: 0.8300 },
  'EURCAD': { f: 'EUR', t: 'CAD', base: 1.4800 },
  'EURAUD': { f: 'EUR', t: 'AUD', base: 1.6200 },
  'AUDJPY': { f: 'AUD', t: 'JPY', base: 100.50 },
  'CADJPY': { f: 'CAD', t: 'JPY', base: 110.00 },
  'CHFJPY': { f: 'CHF', t: 'JPY', base: 174.50 },
  'GBPAUD': { f: 'GBP', t: 'AUD', base: 1.9500 },
  'GBPCAD': { f: 'GBP', t: 'CAD', base: 1.7800 },
  'XAUUSD': { f: 'XAU', t: 'USD', base: 2650.00 }, // Updated Gold Price
  'BTCUSD': { f: 'BTC', t: 'USD', base: 95000.00 }
};

// Calculate Simple Moving Average
const calculateSMA = (data: number[], window: number): number[] => {
  const sma = [];
  for (let i = 0; i < data.length; i++) {
    if (i < window - 1) {
      sma.push(NaN);
      continue;
    }
    const slice = data.slice(i - window + 1, i + 1);
    const sum = slice.reduce((a, b) => a + b, 0);
    sma.push(sum / window);
  }
  return sma;
};

// Generate realistic looking mock data if API fails
const generateFallbackData = (pair: string, count: number = 250): Candle[] => {
  const basePrice = PAIR_MAP[pair]?.base || 1.0000;
  const candles: Candle[] = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);
  const timeStep = 300; // 5 minutes

  // Generate history
  for (let i = count; i > 0; i--) {
    const time = now - (i * timeStep);
    const volatility = basePrice * 0.0005; // 0.05% per candle volatility
    const change = (Math.random() - 0.5) * volatility * 2;
    
    const open = currentPrice;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;

    candles.push({
      time,
      open,
      high,
      low,
      close,
    });
    
    currentPrice = close;
  }

  // Calculate indicators
  const closes = candles.map(c => c.close);
  const sma20 = calculateSMA(closes, 20);
  const sma200 = calculateSMA(closes, 200);

  return candles.map((c, i) => ({
    ...c,
    sma20: isNaN(sma20[i]) ? undefined : sma20[i],
    sma200: isNaN(sma200[i]) ? undefined : sma200[i]
  }));
};

export const fetchMarketData = async (pair: string, useMT5: boolean = false): Promise<Candle[]> => {
  const symbols = PAIR_MAP[pair];
  if (!symbols) {
    console.warn(`Pair ${pair} not found in map, using fallback.`);
    return generateFallbackData(pair);
  }

  // Fetch M5 candles (5 minutes = aggregate 5 minutes)
  // Using try/catch to gracefully handle API errors/rate limits
  const url = `https://min-api.cryptocompare.com/data/v2/histominute?fsym=${symbols.f}&tsym=${symbols.t}&limit=250&aggregate=5`;

  try {
    const response = await fetch(url);
    const json = await response.json();

    if (json.Response !== 'Success' || !json.Data || !json.Data.Data) {
      // If API returns explicit error (like Rate Limit or Market does not exist), throw to trigger fallback
      console.warn(`API Error for ${pair}: ${json.Message}`);
      throw new Error(json.Message || 'API Error');
    }

    const rawData = json.Data.Data;
    
    if (rawData.length === 0) {
       throw new Error('No data returned');
    }

    // Extract closes for SMA calc
    const closes = rawData.map((d: any) => d.close);
    const sma20 = calculateSMA(closes, 20);
    const sma200 = calculateSMA(closes, 200);

    const candles: Candle[] = rawData.map((d: any, i: number) => ({
      time: d.time, // Unix timestamp in seconds
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      sma20: isNaN(sma20[i]) ? undefined : sma20[i],
      sma200: isNaN(sma200[i]) ? undefined : sma200[i]
    }));

    return candles;
  } catch (e) {
    console.warn(`Failed to fetch data for ${pair} (${e instanceof Error ? e.message : 'Unknown'}). Switching to simulation mode.`);
    return generateFallbackData(pair);
  }
};
