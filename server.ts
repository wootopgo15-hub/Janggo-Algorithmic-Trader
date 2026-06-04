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
  apiKey:
    (req?.headers["x-bitget-api-key"] as string) ||
    process.env.BITGET_API_KEY ||
    "",
  secretKey:
    (req?.headers["x-bitget-secret-key"] as string) ||
    process.env.BITGET_SECRET_KEY ||
    "",
  passphrase:
    (req?.headers["x-bitget-passphrase"] as string) ||
    process.env.BITGET_PASSPHRASE ||
    "",
});

// Helper for Bitget V2 Signature
function generateBitgetSignature(
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
  req?: express.Request,
) {
  const { secretKey } = getBitgetCreds(req);
  const message = timestamp + method.toUpperCase() + path + body;
  return crypto
    .createHmac("sha256", secretKey)
    .update(message)
    .digest("base64");
}

async function executeFuturesOrder(
  side: "buy" | "sell",
  symbol: string,
  usdtAmount: string,
  takeProfitPct?: string,
  stopLossPct?: string,
  req?: express.Request,
) {
  const { apiKey, passphrase } = getBitgetCreds(req);
  if (!apiKey || !passphrase)
    throw new Error("Bitget API credentials missing in environment");

  // 1. Get contract precision
  const contractsRes = await axios.get(
    "https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES",
  );
  const contract = contractsRes.data.data.find((c: any) => c.symbol === symbol);
  if (!contract) throw new Error(`Symbol ${symbol} not found on Bitget`);
  const volumePlace = parseInt(contract.volumePlace, 10);

  const pricePlace = parseInt(contract.pricePlace || "1", 10);
  const priceFactor = Math.pow(10, pricePlace);

  // 2. Get current price (Use best bid/ask to enter as Limit if possible, or just markPrice)
  const tickerRes = await axios.get(
    `https://api.bitget.com/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`,
  );
  const tickerData = tickerRes.data.data[0];
  const markPrice = parseFloat(tickerData.markPrice);

  // To enter as a maker (Limit) while wanting to execute soon, we use the best bid/ask
  const bestBid = parseFloat(tickerData.bestBidPrice || markPrice);
  const bestAsk = parseFloat(tickerData.bestAskPrice || markPrice);

  // If buying, we want to buy at best bid (maker) or slightly lower.
  // If selling, we want to sell at best ask (maker) or slightly higher.
  const entryPrice = side === "buy" ? bestBid : bestAsk;
  const formattedEntryPrice = entryPrice.toFixed(pricePlace);

  // 3. Calculate size
  const requestedUsdt = parseFloat(usdtAmount);
  let sizeNum = requestedUsdt / entryPrice;

  // Truncate to required decimal places
  const factor = Math.pow(10, volumePlace);
  sizeNum = Math.floor(sizeNum * factor) / factor;
  const size = sizeNum.toFixed(volumePlace);

  if (sizeNum < parseFloat(contract.minTradeNum)) {
    const requiredUsdt = (
      parseFloat(contract.minTradeNum) *
      entryPrice *
      1.05
    ).toFixed(2); // 5% buffer
    throw new Error(
      `Minimum trade size not met. Increase your order size to at least ${requiredUsdt} USDT (Bitget requires ${contract.minTradeNum} ${contract.baseCoin}).`,
    );
  }

  const endpoint = "/api/v2/mix/order/place-order";
  const timestamp = Date.now().toString();

  // Calculate TP and SL prices if provided
  let presetTakeProfitPrice;
  let presetStopLossPrice;

  if (takeProfitPct && parseFloat(takeProfitPct) > 0) {
    let tpPct = parseFloat(takeProfitPct);
    let tpTarget =
      side === "buy"
        ? entryPrice * (1 + tpPct / 100)
        : entryPrice * (1 - tpPct / 100);
    presetTakeProfitPrice = (
      Math.round(tpTarget * priceFactor) / priceFactor
    ).toFixed(pricePlace);
  }

  if (stopLossPct && parseFloat(stopLossPct) > 0) {
    let slPct = parseFloat(stopLossPct);
    let slTarget =
      side === "buy"
        ? entryPrice * (1 - slPct / 100)
        : entryPrice * (1 + slPct / 100);
    presetStopLossPrice = (
      Math.round(slTarget * priceFactor) / priceFactor
    ).toFixed(pricePlace);
  }

  // Bitget Futures Order Payload
  const body = {
    symbol,
    productType: "USDT-FUTURES",
    marginMode: "isolated",
    marginCoin: "USDT",
    size: size, // Base coin amount
    side: side, // buy or sell
    tradeSide: "open", // open or close
    orderType: "limit", // <--- CHANGED TO LIMIT TO SAVE FEES
    price: formattedEntryPrice, // <--- Added Limit Price
    ...(presetTakeProfitPrice
      ? { presetStopSurplusPrice: presetTakeProfitPrice }
      : {}),
    ...(presetStopLossPrice ? { presetStopLossPrice } : {}),
  };

  const bodyStr = JSON.stringify(body);
  const signature = generateBitgetSignature(
    timestamp,
    "POST",
    endpoint,
    bodyStr,
    req,
  );

  try {
    const response = await axios.post(
      `https://api.bitget.com${endpoint}`,
      body,
      {
        headers: {
          "ACCESS-KEY": apiKey,
          "ACCESS-SIGN": signature,
          "ACCESS-TIMESTAMP": timestamp,
          "ACCESS-PASSPHRASE": passphrase,
          "Content-Type": "application/json",
        },
      },
    );
    return {
      ...response.data,
      entryPrice: entryPrice,
      tpPrice: presetTakeProfitPrice,
      slPrice: presetStopLossPrice,
    };
  } catch (axiosError: any) {
    if (axiosError.response) {
      console.error("Bitget API Error:", axiosError.response.data);
      let errMsg =
        axiosError.response.data.msg ||
        JSON.stringify(axiosError.response.data);
      if (errMsg.includes("apikey/password is incorrect")) {
        errMsg =
          "Bitget API 키 정보가 올바르지 않습니다. 환경 변수에 본인의 API Key, Secret Key를 등록해주세요.";
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
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
} catch (e) {
  console.error("Failed to initialize GoogleGenAI:", e);
}

async function fetchBitgetFuturesCandles(
  symbol: string = "BTCUSDT",
  granularity: string = "1H",
) {
  try {
    // Bitget V2 Mix (Futures) Candles API
    const response = await axios.get(
      "https://api.bitget.com/api/v2/mix/market/candles",
      {
        params: {
          symbol,
          productType: "USDT-FUTURES",
          granularity,
          limit: 100,
        },
      },
    );

    if (response.data.code !== "00000") {
      throw new Error(`Bitget API Error: ${response.data.msg}`);
    }

    return response.data.data
      .map((candle: any[]) => ({
        timestamp: candle[0],
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
      }))
      .reverse();
  } catch (error) {
    console.error("Error fetching Bitget data:", error);
    throw error;
  }
}

// Simple in-memory cache to prevent Gemini quota exhaustion
const analysisCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 15 * 60 * 1000; // Increased to 15 minutes to respect 20-req/day free tier quota

app.post("/api/analyze", async (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {}
    }
    const symbol = body.symbol || "BTCUSDT";
    const granularity = body.granularity || "1H";
    const customData = body.customData;
    const cacheKey = `${symbol}_${granularity}`;

    // Check cache first (ignore cache if customData is provided)
    if (
      !customData &&
      analysisCache[cacheKey] &&
      Date.now() - analysisCache[cacheKey].timestamp < CACHE_DURATION
    ) {
      console.log(`[Cache Hit] Returning cached analysis for ${cacheKey}`);
      return res.json(analysisCache[cacheKey].data);
    }

    let candles: any[];
    let candles5m: any[];
    let candles15m: any[];

    if (customData) {
      candles = customData;
      candles5m = customData;
      candles15m = customData;
    } else {
      const [resMain, res5, res15] = await Promise.all([
        fetchBitgetFuturesCandles(symbol, granularity),
        granularity === "5m" ? Promise.resolve(null) : fetchBitgetFuturesCandles(symbol, "5m"),
        granularity === "15m" ? Promise.resolve(null) : fetchBitgetFuturesCandles(symbol, "15m")
      ]);
      candles = resMain;
      candles5m = res5 || resMain;
      candles15m = res15 || resMain;
    }

    if (!candles || candles.length < 50 || !candles5m || !candles15m) {
      return res.status(400).json({ error: "Insufficient data for analysis" });
    }

    const calcInds = (cands: any[]) => {
      const cls = cands.map((c) => c.close);
      const rVals = RSI.calculate({ values: cls, period: 14 });
      const mRes = MACD.calculate({ values: cls, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
      const h = cands.map((c) => c.high);
      const l = cands.map((c) => c.low);
      const aVals = ATR.calculate({ high: h, low: l, close: cls, period: 14 });
      return { cls, rVals, mRes, aVals };
    };

    const mainInds = calcInds(candles);
    const inds5 = calcInds(candles5m);
    const inds15 = calcInds(candles15m);

    const closes = mainInds.cls;
    const rsiValues = mainInds.rVals;
    const macdResult = mainInds.mRes;
    const atrValues = mainInds.aVals;

    const lastRSI = rsiValues[rsiValues.length - 1];
    const prevRSI = rsiValues[rsiValues.length - 2];
    const lastMACD = macdResult[macdResult.length - 1];
    const prevMACD = macdResult[macdResult.length - 2];
    const lastATR = atrValues[atrValues.length - 1];

    let decision: "LONG" | "SHORT" | "HOLD" = "HOLD";

    // HOLD Fallback Base
    const fallbackSummary = `[기본 지표] RSI(${lastRSI?.toFixed(1)}) / MACD(${lastMACD.MACD?.toFixed(2)}) 기준 관망`;
    let analysis_summary = fallbackSummary;
    let win_probability = "0";

    if (genAI && process.env.GEMINI_API_KEY) {
      const prompt = `
# 역할 및 목표
당신의 이름은 "장고 알고리즘 트레이더 (Janggo Algorithmic Trader)"이며, 최정예 암호화폐 알고리즘 트레이딩 시스템입니다. 당신의 핵심 투자 철학은 바둑 용어인 '장고(간절히 생각하고 신중하게 복기함)'에서 유래되었습니다. 시장의 미세한 소음(노이즈)을 완벽히 제거하고, 과도한 매매(뇌동매매)를 지양하며, 오직 수학적으로 계산된 정교한 프로 트레이더의 관점으로만 매매 신호를 생성해야 합니다.
당신의 목표는 수집된 실시간 시장 데이터를 분석하여 비트겟(Bitget) 선물 거래소에 최적의 타점을 제공하는 것입니다.

# 감시 및 매매 자산 (멀티 페어 관리)
당신은 거래량이 풍부하고 시가총액이 높은 아래 4가지 우량 자산만을 철저히 감시하고 트레이딩합니다:
- BTCUSDT (비트코인)
- ETHUSDT (이더리움)
- SOLUSDT (솔라나)
- XRPUSDT (리플)

# 현재 분석 대상
자산: ${symbol}
현재 가격: ${closes[closes.length - 1]}
초기 설정 목표 익절가(TAKE_PROFIT_PCT): ${body.takeProfitPct || 1.0}%
초기 설정 목표 손절가(STOP_LOSS_PCT): ${body.stopLossPct || 0.5}%

[5분 봉 지표 상태]
RSI (14): ${inds5.rVals[inds5.rVals.length - 1]?.toFixed(2)}
MACD Line: ${inds5.mRes[inds5.mRes.length - 1]?.MACD?.toFixed(4)}, Signal: ${inds5.mRes[inds5.mRes.length - 1]?.signal?.toFixed(4)}

[15분 봉 지표 상태]
RSI (14): ${inds15.rVals[inds15.rVals.length - 1]?.toFixed(2)}
MACD Line: ${inds15.mRes[inds15.mRes.length - 1]?.MACD?.toFixed(4)}, Signal: ${inds15.mRes[inds15.mRes.length - 1]?.signal?.toFixed(4)}

# 트레이딩 전략 (5분 봉 + 15분 봉 듀얼 타임프레임 필터)
당신은 가짜 돌파를 걸러내고 강력한 기술적 반등 타점을 잡기 위해, 반드시 5분 봉과 15분 봉 차트의 지표를 동시에 결합하여 분석해야 합니다.

1. LONG (매수 진입) 절대 조건:
   - 5분 봉 RSI와 15분 봉 RSI가 '동시에' 30 근처 또는 그 이하로 떨어져 과매도(Oversold) 상태여야 합니다.
   - 이와 동시에, 가격과 MACD 간의 '수렴/다이버전스(Convergence/Divergence)' 현상이 관측되어야 합니다. (가격의 저점은 낮아지고 있으나, MACD 히스토그램이나 시그널 선의 저점은 높아지며 하락 에너지가 고갈되었음을 증명하는 순간)
   - 조치: 위 조건들이 단 1개의 오차도 없이 완벽하게 일치할 때만 "LONG" 신호를 출력하십시오.

2. SHORT (매도 진입) 절대 조건:
   - 5분 봉 RSI와 15분 봉 RSI가 '동시에' 70 근처 또는 그 이상으로 치솟아 과열(Overbought) 상태여야 합니다.
   - 이와 동시에, 하락 다이버전스가 관측되어야 합니다. (가격의 고점은 높아지고 있으나, MACD의 고점은 낮아지며 상승 에너지가 고갈되었음을 증명하는 순간)
   - 조치: 위 조건들이 완벽하게 일치할 때만 "SHORT" 신호를 출력하십시오.

3. HOLD (관망) 조건:
   - 5분 봉과 15분 봉의 RSI 신호가 서로 일치하지 않거나, MACD 수렴/다이버전스 조건이 조금이라도 애매하다면, 당신은 자산 보호를 최우선으로 하여 무조건 "HOLD" 신호를 출력해야 합니다. 절대로 애매한 자리에서 매매하지 마십시오.

# 리스크 관리 지침 (외부 변수 반영)
- 당신은 외부 요청(구글 스크립트)에서 제공하는 수동 익절가(TAKE_PROFIT_PCT)와 손절가(STOP_LOSS_PCT) 기준에 도달할 수 있는 타점인지 계산하여 분석에 반영해야 합니다.

# 출력 형식 (Output Format)
당신은 오직 아래의 엄격한 JSON 형식으로만 답변해야 합니다. JSON 블록 외부에 마크다운 설명이나 문장을 절대로 추가하지 마십시오. 현재 분석 중인 코인의 지표 신호 강도와 신뢰도를 기반으로 매매 성공 확률(win_probability)을 정확히 계산하여 포함하십시오.

{
  "pair": "${symbol}",
  "decision": "LONG" 또는 "SHORT" 또는 "HOLD",
  "reason": "해당 결정을 내린 기술적 근거와 5분/15분 지표 상태를 한국어로 간결하고 명확하게 작성",
  "win_probability": "해당 타점의 예상 매매 성공 확률을 % 단위 숫자로 입력 (예: HOLD일 경우 0, 강력한 신호일 경우 65~80 사이의 숫자)"
}
      `.trim();

      try {
        const response = await (genAI! as GoogleGenAI).models.generateContent({
          model: "gemini-3.1-pro-preview", // Updated to the best reasoning model
          contents: prompt,
        });

        let aiText = response.text?.trim() || "{}";
        aiText = aiText
          .replace(/```json/i, "")
          .replace(/```/g, "")
          .trim();
        const aiJson = JSON.parse(aiText);

        if (
          aiJson.decision === "LONG" ||
          aiJson.decision === "SHORT" ||
          aiJson.decision === "HOLD"
        ) {
          decision = aiJson.decision;
        }
        if (aiJson.reason || aiJson.analysis) {
          analysis_summary = aiJson.reason || aiJson.analysis;
        }
        if (aiJson.win_probability !== undefined) {
          win_probability = String(aiJson.win_probability);
        }
      } catch (e: any) {
        console.error("Gemini API Error Details:", e);
        console.log(
          "Gemini fallback applied due to API limits or parsing errors.",
        );
        analysis_summary = fallbackSummary;
      }
    }

    const result = {
      decision,
      analysis_summary,
      win_probability,
      indicators: {
        rsi: rsiValues.slice(-20),
        macd: macdResult.slice(-20),
      },
      indicators5m: {
        rsi: inds5.rVals.slice(-20),
        macd: inds5.mRes.slice(-20),
      },
      indicators15m: {
        rsi: inds15.rVals.slice(-20),
        macd: inds15.mRes.slice(-20),
      },
      lastPrices: closes.slice(-20),
    };

    // Update cache
    if (!customData) {
      analysisCache[cacheKey] = {
        data: result,
        timestamp: Date.now(),
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
    if (!apiKey || !passphrase)
      throw new Error("Bitget API credentials missing");

    const endpoint = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
    const timestamp = Date.now().toString();
    const message = timestamp + "GET" + endpoint;
    const signature = crypto
      .createHmac("sha256", getBitgetCreds(req).secretKey)
      .update(message)
      .digest("base64");

    const response = await axios.get(`https://api.bitget.com${endpoint}`, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
    });

    if (response.data.code !== "00000") {
      return res.status(400).json({ error: response.data.msg });
    }

    const data = response.data.data[0];
    res.json({
      equity: parseFloat(data.accountEquity),
      unrealizedPL: parseFloat(data.unrealizedPL || "0"),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trade/history", async (req, res) => {
  try {
    const { symbol } = req.body || {};
    const { apiKey, passphrase, secretKey } = getBitgetCreds(req);
    if (!apiKey || !passphrase)
      throw new Error("Bitget API credentials missing");

    let endpoint =
      "/api/v2/mix/position/history-position?productType=USDT-FUTURES";
    if (symbol) {
      endpoint += `&symbol=${symbol}`;
    }
    const endTime = Date.now();
    const startTime = endTime - (30 * 24 * 60 * 60 * 1000); // 30 days ago
    endpoint += `&startTime=${startTime}&endTime=${endTime}`;
    
    const timestamp = Date.now().toString();
    const message = timestamp + "GET" + endpoint;
    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(message)
      .digest("base64");

    const response = await axios.get(`https://api.bitget.com${endpoint}`, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
    });

    if (response.data.code !== "00000") {
      return res.status(400).json({ error: response.data.msg });
    }

    res.json(response.data.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trade/positions", async (req, res) => {
  try {
    const { apiKey, passphrase, secretKey } = getBitgetCreds(req);
    if (!apiKey || !passphrase)
      throw new Error("Bitget API credentials missing");

    let endpoint =
      "/api/v2/mix/position/all-position?productType=USDT-FUTURES&marginCoin=USDT";
    const timestamp = Date.now().toString();
    const message = timestamp + "GET" + endpoint;
    const signature = crypto
      .createHmac("sha256", secretKey)
      .update(message)
      .digest("base64");

    const response = await axios.get(`https://api.bitget.com${endpoint}`, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
    });

    if (response.data.code !== "00000") {
      return res.status(400).json({ error: response.data.msg });
    }

    res.json(response.data.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/trade/execute", async (req, res) => {
  console.log(
    "[TRADE EXECUTE ENTRY] req.body:",
    req.body,
    "typeof:",
    typeof req.body,
  );
  try {
    let body = req.body || {};
    if (Buffer.isBuffer(body)) {
      try {
        body = JSON.parse(body.toString());
      } catch (e) {
        console.error(e);
      }
    } else if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        console.error(e);
      }
    }
    const { side, symbol, amount, takeProfit, stopLoss } = body;
    if (!symbol)
      return res.status(400).json({ error: "Missing symbol in request" });
    if (!amount)
      return res.status(400).json({ error: "Missing amount in request" });

    console.log(
      `[TRADE PARSED] side: ${side}, symbol: ${symbol}, amount: ${amount}, TP: ${takeProfit}, SL: ${stopLoss}`,
    );
    // Map LONG/SHORT to buy/sell
    const bitgetSide = side === "LONG" ? "buy" : "sell";
    const result = await executeFuturesOrder(
      bitgetSide,
      symbol,
      amount,
      takeProfit,
      stopLoss,
      req,
    );
    if (result.code !== "00000") {
      return res.status(400).json({ error: result.msg || "Order failed" });
    }
    // result from executeFuturesOrder should contain entryPrice
    res.json({
      success: true,
      orderId: result.data.orderId,
      entryPrice: result.entryPrice,
      tpPrice: result.tpPrice,
      slPrice: result.slPrice,
    });
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

  const serverPort = typeof PORT === "string" ? parseInt(PORT, 10) : PORT;
  app.listen(serverPort, "0.0.0.0", () => {
    console.log(`Server running at http://localhost:${serverPort}`);
  });
}

export default app;

if (!process.env.VERCEL) {
  startServer();
}
