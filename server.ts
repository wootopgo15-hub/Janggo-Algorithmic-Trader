import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { RSI, MACD } from "technicalindicators";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Bitget API Credentials (Retrieved from env)
const getBitgetCreds = () => ({
  apiKey: process.env.BITGET_API_KEY || "bg_c0bb357a72c3fb92fd9b5cb49de3c424",
  secretKey: process.env.BITGET_SECRET_KEY || "ece23d19f8e4a7b113effe079420f05cf9e1b8f433af8063593f40b090c84b45",
  passphrase: process.env.BITGET_PASSPHRASE || "geminibot2026",
});

// Helper for Bitget V2 Signature
function generateBitgetSignature(timestamp: string, method: string, path: string, body: string = "") {
  const { secretKey } = getBitgetCreds();
  const message = timestamp + method.toUpperCase() + path + body;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

async function executeFuturesOrder(side: "buy" | "sell", symbol: string, amount: string) {
  const { apiKey, passphrase } = getBitgetCreds();
  if (!apiKey || !passphrase) throw new Error("Bitget API credentials missing in environment");

  const endpoint = "/api/v2/mix/order/place-order";
  const timestamp = Date.now().toString();
  
  // Bitget Futures Order Payload
  const body = {
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "isolated",
    marginCoin: "USDT",
    size: amount, // For futures, size is usually the contract count or coin amount
    side: side,   // buy or sell
    tradeSide: "open", // open or close
    orderType: "market"
  };

  const bodyStr = JSON.stringify(body);
  const signature = generateBitgetSignature(timestamp, "POST", endpoint, bodyStr);

  const response = await axios.post(`https://api.bitget.com${endpoint}`, body, {
    headers: {
      "ACCESS-KEY": apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": passphrase,
      "Content-Type": "application/json",
    }
  });

  return response.data;
}

// Initialize Gemini
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function fetchBitgetFuturesCandles(symbol: string = "BTCUSDT", granularity: string = "1H") {
  try {
    // Bitget V2 Mix (Futures) Candles API
    const response = await axios.get("https://api.bitget.com/api/v2/mix/market/candles", {
      params: {
        symbol,
        productType: "USDT-FUTURES",
        granularity,
        limit: 100
      }
    });

    if (response.data.code !== "00000") {
      throw new Error(`Bitget API Error: ${response.data.msg}`);
    }

    return response.data.data.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    })).reverse();
  } catch (error) {
    console.error("Error fetching Bitget data:", error);
    throw error;
  }
}

// Simple in-memory cache to prevent Gemini quota exhaustion
const analysisCache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_DURATION = 15 * 60 * 1000; // Increased to 15 minutes to respect 20-req/day free tier quota

app.post("/api/analyze", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", granularity = "1H", customData } = req.body;
    const cacheKey = `${symbol}_${granularity}`;

    // Check cache first (ignore cache if customData is provided)
    if (!customData && analysisCache[cacheKey] && (Date.now() - analysisCache[cacheKey].timestamp < CACHE_DURATION)) {
      console.log(`[Cache Hit] Returning cached analysis for ${cacheKey}`);
      return res.json(analysisCache[cacheKey].data);
    }

    let candles: any[];
    if (customData) {
      candles = customData;
    } else {
      candles = await fetchBitgetFuturesCandles(symbol, granularity);
    }

    if (!candles || candles.length < 50) {
      return res.status(400).json({ error: "Insufficient data for analysis" });
    }

    const closes = candles.map(c => c.close);

    const rsiValues = RSI.calculate({ values: closes, period: 14 });
    const lastRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];

    const macdResult = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });

    const lastMACD = macdResult[macdResult.length - 1];
    const prevMACD = macdResult[macdResult.length - 2];

    let decision: "LONG" | "SHORT" | "HOLD" = "HOLD";

    // LONG Conditions: RSI 30 Exit OR MACD Golden Cross
    const rsiOversoldExit = prevRSI <= 30 && lastRSI > prevRSI;
    const macdGoldenCross = prevMACD.MACD! < prevMACD.signal! && lastMACD.MACD! > lastMACD.signal!;

    if (rsiOversoldExit || macdGoldenCross) {
      decision = "LONG";
    }

    // SHORT Conditions: RSI 70 Entry (falling from 70+) OR MACD Dead Cross
    const rsiOverboughtFalling = prevRSI >= 70 && lastRSI < prevRSI;
    const macdDeadCross = prevMACD.MACD! > prevMACD.signal! && lastMACD.MACD! < lastMACD.signal!;

    if (rsiOverboughtFalling || macdDeadCross) {
      decision = "SHORT";
    }

    // Algorithmic Fallback Summary
    const fallbackSummary = `[지표 분석] RSI(${lastRSI.toFixed(1)})와 MACD(${lastMACD.MACD?.toFixed(2)}) 기준 ${decision === 'HOLD' ? '관망' : decision} 포지션이 유리한 구간입니다.`;
    let analysis_summary = fallbackSummary;

    if (process.env.GEMINI_API_KEY) {
      const prompt = `
        당신은 고급 가상화폐 선물 퀀트 투자 전문가입니다. 다음 데이터를 분석하여 매매 결정을 내렸습니다.
        
        결정: ${decision}
        RSI (14): ${lastRSI.toFixed(2)} (이전: ${prevRSI?.toFixed(2)})
        MACD Line: ${lastMACD.MACD?.toFixed(4)}
        MACD Signal: ${lastMACD.signal?.toFixed(4)}
        현재 가격: ${closes[closes.length - 1]}
        
        선물 매매 규칙:
        - LONG: RSI 30 이하 탈출 또는 MACD 골든크로스
        - SHORT: RSI 70 이상에서 하락 반전 또는 MACD 데드크로스
        
        이 결정에 대한 분석 및 선물 포지션 진입 근거를 한국어로 요약하여 최대 1문장으로 작성하십시오.
      `;

      try {
        const response = await genAI.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt,
        });
        analysis_summary = response.text?.trim() || fallbackSummary;
      } catch (e: any) {
        console.error("Gemini API Error Details:", e);
        console.log("Gemini fallback applied due to API limits or errors.");
        // Silent fallback - users will see the algorithmic prompt instead of an error message
        analysis_summary = fallbackSummary;
      }
    }

    const result = {
      decision,
      analysis_summary,
      indicators: {
        rsi: rsiValues.slice(-20),
        macd: macdResult.slice(-20)
      },
      lastPrices: closes.slice(-20)
    };

    // Update cache
    if (!customData) {
      analysisCache[cacheKey] = {
        data: result,
        timestamp: Date.now()
      };
    }

    res.json(result);

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trade/execute", async (req, res) => {
  try {
    const { side, symbol, amount } = req.body;
    // Map LONG/SHORT to buy/sell
    const bitgetSide = side === "LONG" ? "buy" : "sell";
    const result = await executeFuturesOrder(bitgetSide, symbol, amount);
    if (result.code !== "00000") {
      return res.status(400).json({ error: result.msg || "Order failed" });
    }
    res.json({ success: true, orderId: result.data.orderId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));

    app.all("/api/*", (req, res) => {
      res.status(404).json({ error: "API Route not found" });
    });

    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer();
}
