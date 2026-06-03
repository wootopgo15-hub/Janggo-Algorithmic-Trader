import express from "express";
import path from "path";
import axios from "axios";
import { RSI, MACD, ATR } from "technicalindicators";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// Safely handle body parsing across Vercel and generic Express environments
app.use((req, res, next) => {
  if (req.body !== undefined) {
    next(); // Vercel already parsed it
  } else {
    express.json()(req, res, next);
  }
});

// Bitget API Credentials (Retrieved from headers or env)
const getBitgetCreds = (req?: express.Request) => ({
  apiKey: (req?.headers['x-bitget-api-key'] as string) || process.env.BITGET_API_KEY || "bg_c0bb357a72c3fb92fd9b5cb49de3c424",
  secretKey: (req?.headers['x-bitget-secret-key'] as string) || process.env.BITGET_SECRET_KEY || "ece23d19f8e4a7b113effe079420f05cf9e1b8f433af8063593f40b090c84b45",
  passphrase: (req?.headers['x-bitget-passphrase'] as string) || process.env.BITGET_PASSPHRASE || "geminibot2026",
});

// Helper for Bitget V2 Signature
function generateBitgetSignature(timestamp: string, method: string, path: string, body: string = "", req?: express.Request) {
  const { secretKey } = getBitgetCreds(req);
  const message = timestamp + method.toUpperCase() + path + body;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

async function executeFuturesOrder(side: "buy" | "sell", symbol: string, usdtAmount: string, takeProfitPct?: string, stopLossPct?: string, req?: express.Request) {
  const { apiKey, passphrase } = getBitgetCreds(req);
  if (!apiKey || !passphrase) throw new Error("Bitget API credentials missing in environment");

  // 1. Get contract precision
  const contractsRes = await axios.get('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES');
  const contract = contractsRes.data.data.find((c: any) => c.symbol === symbol);
  if (!contract) throw new Error(`Symbol ${symbol} not found on Bitget`);
  const volumePlace = parseInt(contract.volumePlace, 10);

  // 2. Get current price
  const tickerRes = await axios.get(`https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`);
  const price = parseFloat(tickerRes.data.data[0].markPrice);

  // 3. Calculate size
  const requestedUsdt = parseFloat(usdtAmount);
  let sizeNum = requestedUsdt / price;
  
  // Truncate to required decimal places
  const factor = Math.pow(10, volumePlace);
  sizeNum = Math.floor(sizeNum * factor) / factor;
  const size = sizeNum.toFixed(volumePlace);

  if (sizeNum < parseFloat(contract.minTradeNum)) {
    const requiredUsdt = (parseFloat(contract.minTradeNum) * price * 1.05).toFixed(2); // 5% buffer
    throw new Error(`Minimum trade size not met. Increase your order size to at least ${requiredUsdt} USDT (Bitget requires ${contract.minTradeNum} ${contract.baseCoin}).`);
  }

  const endpoint = "/api/v2/mix/order/place-order";
  const timestamp = Date.now().toString();
  
  // Calculate TP and SL prices if provided
  const pricePlace = parseInt(contract.pricePlace || "1", 10);
  const priceFactor = Math.pow(10, pricePlace);
  const tpPct = parseFloat(takeProfitPct || "0");
  const slPct = parseFloat(stopLossPct || "0");
  
  let presetTakeProfitPrice;
  let presetStopLossPrice;

  if (tpPct > 0) {
    let tpTarget = side === "buy" ? price * (1 + tpPct / 100) : price * (1 - tpPct / 100);
    presetTakeProfitPrice = (Math.round(tpTarget * priceFactor) / priceFactor).toFixed(pricePlace);
  }

  if (slPct > 0) {
    let slTarget = side === "buy" ? price * (1 - slPct / 100) : price * (1 + slPct / 100);
    presetStopLossPrice = (Math.round(slTarget * priceFactor) / priceFactor).toFixed(pricePlace);
  }
  
  // Bitget Futures Order Payload
  const body = {
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "isolated",
    marginCoin: "USDT",
    size: size,   // Base coin amount
    side: side,   // buy or sell
    tradeSide: "open", // open or close
    orderType: "market",
    ...(presetTakeProfitPrice ? { presetTakeProfitPrice } : {}),
    ...(presetStopLossPrice ? { presetStopLossPrice } : {})
  };

  const bodyStr = JSON.stringify(body);
  const signature = generateBitgetSignature(timestamp, "POST", endpoint, bodyStr, req);

  try {
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
  } catch (axiosError: any) {
    if (axiosError.response) {
      console.error("Bitget API Error:", axiosError.response.data);
      let errMsg = axiosError.response.data.msg || JSON.stringify(axiosError.response.data);
      if (errMsg.includes("apikey/password is incorrect")) {
        errMsg = "Bitget API 키 정보가 올바르지 않습니다. 환경 변수에 본인의 API Key, Secret Key를 등록해주세요.";
      }
      throw new Error(errMsg);
    }
    throw axiosError;
  }
}

// Initialize Gemini safely
let genAI: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
} catch (e) {
  console.error("Failed to initialize GoogleGenAI:", e);
}

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
    let body = req.body || {};
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }
    const symbol = body.symbol || "BTCUSDT";
    const granularity = body.granularity || "1H";
    const customData = body.customData;
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

    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const atrValues = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const lastATR = atrValues[atrValues.length - 1];

    let decision: "LONG" | "SHORT" | "HOLD" = "HOLD";

    // LONG Conditions: RSI 40 Exit OR MACD Golden Cross (Scalping)
    const rsiOversoldExit = prevRSI <= 40 && lastRSI > prevRSI;
    const macdGoldenCross = prevMACD.MACD! < prevMACD.signal! && lastMACD.MACD! > lastMACD.signal!;

    if (rsiOversoldExit || macdGoldenCross) {
      decision = "LONG";
    }

    // SHORT Conditions: RSI 60 Entry (falling from 60+) OR MACD Dead Cross
    const rsiOverboughtFalling = prevRSI >= 60 && lastRSI < prevRSI;
    const macdDeadCross = prevMACD.MACD! > prevMACD.signal! && lastMACD.MACD! < lastMACD.signal!;

    if (rsiOverboughtFalling || macdDeadCross) {
      decision = "SHORT";
    }

    // Algorithmic Fallback Summary
    const fallbackSummary = `[단타 지표] RSI(${lastRSI.toFixed(1)}) / MACD(${lastMACD.MACD?.toFixed(2)}) 기준 ${decision === 'HOLD' ? '관망' : decision} (ATR: ${lastATR?.toFixed(2)})`;
    let analysis_summary = fallbackSummary;

    if (genAI && process.env.GEMINI_API_KEY) {
      const prompt = `
        당신은 스캘핑/단타 가상화폐 선물 퀀트 투자 전문가입니다. 잦은 매매와 회전율 극대화를 위한 분석을 제공하세요.
        
        [현재 시장 지표]
        현재 가격: ${closes[closes.length - 1]}
        RSI (14): ${lastRSI.toFixed(2)} (이전: ${prevRSI?.toFixed(2)})
        MACD Line: ${lastMACD.MACD?.toFixed(4)}, Signal: ${lastMACD.signal?.toFixed(4)}
        ATR (14) 시장 변동성 측정치: ${lastATR?.toFixed(4)}
        
        [스캘핑 매매 지침]
        1. 지표 기반 신호 (적극적 진입):
           - LONG: RSI 40 이하 반등 또는 MACD 골든크로스/단기 우상향
           - SHORT: RSI 60 이상 저항 또는 MACD 데드크로스/단기 우하향
        2. 리스크 관리 및 짧은 타점 (가장 중요 기준):
           - 현재 당사 알고리즘의 목표 익절가는 가격 변동의 0.5% ~ 1.0% 사이이며, 손절가는 -0.5%로 매우 짧습니다.
           - 방향성이 단기적으로 0.5% 이상 나올 수 있는 모멘텀이 보이면 주저 없이 "LONG" 혹은 "SHORT" 포지션을 내십시오.
           - 모멘텀이 완전히 죽었거나 심각한 횡보 구간에서만 "HOLD"를 선택하십시오. 적극적인 매매 신호를 권장합니다.
        
        [응답 형식]
        반드시 JSON 형식으로 응답하십시오. 일반 텍스트나 포맷팅 기호(\`\`\`json 등)는 포함하지 말고 JSON 데이터만 출력하십시오.
        {
          "decision": "LONG",  // "LONG", "SHORT", "HOLD" 중 하나
          "analysis": "짧은 단위(0.5~1%) 단타/스캘핑 타점 위주의 해석 근거 요약 (최대 2문장)"
        }
      `;

      try {
        const response = await genAI.models.generateContent({
          model: "gemini-1.5-flash",
          contents: prompt,
        });
        
        let aiText = response.text?.trim() || "{}";
        aiText = aiText.replace(/```json/i, "").replace(/```/g, "").trim();
        const aiJson = JSON.parse(aiText);
        
        if (aiJson.decision === "LONG" || aiJson.decision === "SHORT" || aiJson.decision === "HOLD") {
          decision = aiJson.decision;
        }
        if (aiJson.analysis) {
          analysis_summary = aiJson.analysis;
        }
      } catch (e: any) {
        console.error("Gemini API Error Details:", e);
        console.log("Gemini fallback applied due to API limits or parsing errors.");
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

app.get("/api/trade/balance", async (req, res) => {
  try {
    const { apiKey, passphrase } = getBitgetCreds(req);
    if (!apiKey || !passphrase) throw new Error("Bitget API credentials missing");

    const endpoint = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
    const timestamp = Date.now().toString();
    const message = timestamp + "GET" + endpoint;
    const signature = crypto.createHmac("sha256", getBitgetCreds(req).secretKey).update(message).digest("base64");

    const response = await axios.get(`https://api.bitget.com${endpoint}`, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      }
    });

    if (response.data.code !== "00000") {
      return res.status(400).json({ error: response.data.msg });
    }

    const data = response.data.data[0];
    res.json({
      equity: parseFloat(data.accountEquity),
      unrealizedPL: parseFloat(data.unrealizedPL || "0")
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trade/execute", async (req, res) => {
  console.log("[TRADE EXECUTE ENTRY] req.body:", req.body, "typeof:", typeof req.body);
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(body)) {
      try { body = JSON.parse(body.toString()); } catch (e) { console.error(e); }
    } else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { console.error(e); }
    }
    const { side, symbol, amount, takeProfit, stopLoss } = body;
    if (!symbol) return res.status(400).json({ error: "Missing symbol in request" });
    if (!amount) return res.status(400).json({ error: "Missing amount in request" });
    
    console.log(`[TRADE PARSED] side: ${side}, symbol: ${symbol}, amount: ${amount}, TP: ${takeProfit}, SL: ${stopLoss}`);
    // Map LONG/SHORT to buy/sell
    const bitgetSide = side === "LONG" ? "buy" : "sell";
    const result = await executeFuturesOrder(bitgetSide, symbol, amount, takeProfit, stopLoss, req);
    if (result.code !== "00000") {
      return res.status(400).json({ error: result.msg || "Order failed" });
    }
    res.json({ success: true, orderId: result.data.orderId });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const getVite = new Function('return import("vite")');
    const { createServer: createViteServer } = await getVite();
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
