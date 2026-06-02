import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import axios from "axios";
import { RSI, MACD } from "technicalindicators";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Bitget API Credentials (Retrieved from env)
const getBitgetCreds = () => ({
  apiKey: process.env.BITGET_API_KEY || "",
  secretKey: process.env.BITGET_SECRET_KEY || "",
  passphrase: process.env.BITGET_PASSPHRASE || "",
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

app.post("/api/analyze", async (req, res) => {
  try {
    const { symbol = "BTCUSDT", granularity = "1H", customData } = req.body;

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

    let analysis_summary = "현재 지표가 중립적이며 명확한 포지션 진입 신호가 없습니다.";

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
          model: "gemini-flash-latest",
          contents: prompt,
        });
        analysis_summary = response.text?.trim() || analysis_summary;
      } catch (e: any) {
        console.error("Gemini failed", e);
        if (e.message?.includes("429")) {
          analysis_summary = "AI 분석 한도 초과 (무료 티어: 일 20회). 24시간 후 초기화되거나 유료 플랜 전환이 필요합니다. (기본 지표 분석으로 대체됨)";
        } else if (e.message?.includes("503")) {
          analysis_summary = "AI 서비스 일시적 지연 중입니다. 잠시 후 다시 시도해 주세요.";
        } else {
          analysis_summary = "AI 분석 중 오류가 발생했습니다. (기술적 지표 기반 분석 모드)";
        }
      }
    }

    res.json({
      decision,
      analysis_summary,
      indicators: {
        rsi: rsiValues.slice(-20),
        macd: macdResult.slice(-20)
      },
      lastPrices: closes.slice(-20)
    });

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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
