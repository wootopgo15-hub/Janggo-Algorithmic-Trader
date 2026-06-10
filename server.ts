import express from "express";
import path from "path";
import axios from "axios";
import { SMA } from "technicalindicators";
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
      const respData = axiosError.response.data;
      console.error("Bitget API Error:", typeof respData === 'object' ? JSON.stringify(respData) : respData);
      let errMsg =
        respData?.msg ||
        (typeof respData === "object" ? JSON.stringify(respData) : respData);
      if (typeof errMsg === 'string' && errMsg.includes("apikey/password is incorrect")) {
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
          limit: 1000,
        },
      },
    );

    if (response.data.code !== "00000") {
      const errMsg = typeof response.data.msg === "object" ? JSON.stringify(response.data.msg) : response.data.msg;
      throw new Error(`Bitget API Error: ${errMsg}`);
    }

    return response.data.data.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5]),
    }));
  } catch (error) {
    console.error("Error fetching Bitget data:", error);
    throw error;
  }
}

// Simple in-memory cache to prevent Gemini quota exhaustion
const analysisCache: Record<string, { data: any; timestamp: number }> = {};
const CACHE_DURATION = 15 * 1000; // 15 seconds cache for real-time RSI updates (Gemini handles rate limits gracefully via fallback)

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
    let candles10m: any[];
    let candles15m: any[];

    if (customData) {
      candles = customData;
      candles5m = customData;
      candles10m = customData;
      candles15m = customData;
    } else {
      const [resMain, res5, res15] = await Promise.all([
        fetchBitgetFuturesCandles(symbol, granularity),
        granularity === "5m"
          ? Promise.resolve(null)
          : fetchBitgetFuturesCandles(symbol, "5m"),
        granularity === "15m"
          ? Promise.resolve(null)
          : fetchBitgetFuturesCandles(symbol, "15m"),
      ]);
      candles = resMain;
      candles5m = res5 || resMain;
      candles15m = res15 || resMain;

      const aggregateTo10m = (c5: any[]) => {
        const result = [];
        let current10m: any = null;
        for (const c of c5) {
          const d = new Date(parseInt(c.timestamp));
          const min = d.getMinutes();
          const isStartOf10m = min % 10 === 0;

          if (isStartOf10m) {
            if (current10m) result.push({ ...current10m });
            current10m = { ...c };
          } else {
            if (current10m) {
              current10m.high = Math.max(current10m.high, c.high);
              current10m.low = Math.min(current10m.low, c.low);
              current10m.close = c.close;
              current10m.volume += c.volume;
            }
          }
        }
        if (current10m) result.push({ ...current10m });
        return result;
      };

      candles10m = aggregateTo10m(candles5m);
    }

    if (
      !candles ||
      candles.length < 50 ||
      !candles5m ||
      !candles10m ||
      !candles15m
    ) {
      return res.status(400).json({ error: "Insufficient data for analysis" });
    }

    const calcInds = (cands: any[]) => {
      const cls = cands.map((c) => c.close);

      const haCands = [];
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (i === 0) {
          haCands.push({
            open: c.open,
            high: c.high,
            low: c.low,
            close: (c.open + c.high + c.low + c.close) / 4,
          });
        } else {
          const prev = haCands[i - 1];
          const haOpen = (prev.open + prev.close) / 2;
          const haClose = (c.open + c.high + c.low + c.close) / 4;
          const haHigh = Math.max(c.high, haOpen, haClose);
          const haLow = Math.min(c.low, haOpen, haClose);
          haCands.push({
            open: haOpen,
            high: haHigh,
            low: haLow,
            close: haClose,
          });
        }
      }
      const haCloses = haCands.map(c => c.close);
      const smaVals = SMA.calculate({ values: haCloses, period: 20 });
      
      return { cls, haCloses, smaVals };
    };

    const mainInds = calcInds(candles);
    const inds15 = calcInds(candles15m);

    let decision: "LONG" | "SHORT" | "HOLD" = "HOLD";

    // Strict local rules (15m HA & 20 SMA)
    const smaPad = inds15.haCloses.length - inds15.smaVals.length;
    const haLast = inds15.haCloses[inds15.haCloses.length - 1];
    const haPrev = inds15.haCloses[inds15.haCloses.length - 2];
    
    const smaLast = inds15.smaVals[inds15.smaVals.length - 1];
    const smaPrev = inds15.smaVals[inds15.smaVals.length - 2];

    const isGoldenCross = haPrev < smaPrev && haLast > smaLast;
    const isDeadCross = haPrev > smaPrev && haLast < smaLast;

    if (isGoldenCross) decision = "LONG";
    else if (isDeadCross) decision = "SHORT";

    // HOLD Fallback Base
    let fallbackSummary = `[기본 지표] 15분 하이킨아시(${haLast?.toFixed(2)}), 20SMA(${smaLast?.toFixed(2)}) 기준 관망`;
    if (decision === "LONG")
      fallbackSummary = `[롱 진입] 15분 하이킨아시 캔들 종가가 20SMA 상향 돌파`;
    if (decision === "SHORT")
      fallbackSummary = `[숏 진입] 15분 하이킨아시 캔들 종가가 20SMA 하향 돌파`;

    let analysis_summary = fallbackSummary;
    let win_probability = "0";

    // 💡 [API 최적화 핵심 로직]
    // 관망(HOLD) 상태일 때는 비싼 AI(Gemini) API를 호출하지 않고 실시간 자체 지표 텍스트만 바로 반환합니다.
    // 매수(LONG) 또는 매도(SHORT) 타점이 명확하게 나왔을 때만 AI API를 호출하여 정밀 분석을 수행합니다.
    // 이렇게 하면 15초마다 갱신해도 무료 API 한도 초과(429 에러)가 절대 발생하지 않습니다.
    if (genAI && process.env.GEMINI_API_KEY && decision !== "HOLD") {
      const prompt = `
# 역할 및 목표
당신의 이름은 "장고 알고리즘 트레이더 (Janggo Algorithmic Trader)"입니다. 당신의 목표는 수집된 실시간 시장 데이터를 요약하여 비트겟(Bitget) 선물 거래용 판단 정보를 JSON으로 반환하는 것입니다.

# 핵심 강제 규칙: 최종 결정 (MANDATORY DECISION)
- 당신은 트레이딩 알고리즘 시스템에 의해 사전 계산된 다음의 최종 매매 결정을 **무조건 항상** 출력해야 합니다.
- **분석 대상:** ${symbol}
- **사전 계산된 최종 진입 포지션:** ${decision}
- **15분 하이킨아시 종가:** ${haLast?.toFixed(2)}
- **15분 20 SMA:** ${smaLast?.toFixed(2)}

# 분석 요약 가이드라인
- 롱 진입 요건: 15분 하이킨아시 캔들 종가가 20SMA를 위로 돌파.
- 숏 진입 요건: 15분 하이킨아시 캔들 종가가 20SMA를 아래로 돌파.
- reason: 위 수치와 사전 결정된 방향을 바탕으로 현재 차트 분위기를 한국어로 1줄 요약. 마크다운 없이 작성.
- win_probability: 0에서 100 사이의 임의의 신뢰도값(정수).

# 출력 형식
오직 아래의 JSON 블록만 출력하십시오:
{
  "pair": "${symbol}",
  "decision": "${decision}",
  "reason": "해당 결정을 내린 지표 상태와 근거 1줄 요약",
  "win_probability": "55"
}
      `.trim();

      try {
        const response = await (genAI! as GoogleGenAI).models.generateContent({
          model: "gemini-2.5-flash", // Using Flash for higher free tier limits (Auto-trade friendly)
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
        // Silently applying fallback (expected due to 20/day free tier quota limits)
        analysis_summary = fallbackSummary;
      }
    }

    const result = {
      decision,
      analysis_summary,
      win_probability,
      indicators15m: {
        haCloses: inds15.haCloses.slice(-20),
        sma: inds15.smaVals.slice(-20),
      },
      lastPrices: mainInds.cls.slice(-20),
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
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
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
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
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
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
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
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
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
    let errorMsg = error.message;
    if (error.response && error.response.data) {
      errorMsg = typeof error.response.data === "object" ? JSON.stringify(error.response.data) : error.response.data;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// --- BACKTEST ENDPOINT ---
app.post("/api/backtest", async (req, res) => {
  const { symbol, yearMonth, initialCapital = 10000, backtestOrderSize = 1000, tpPct = 1, slPct = 2, gridPct = 1 } = req.body;
  if (!symbol || !yearMonth) {
    return res.status(400).json({ error: "Missing symbol or yearMonth (e.g., '2024-05')" });
  }

  const tpDecimal = Number(tpPct) / 100;
  const slDecimal = Number(slPct) / 100;
  const gridDecimal = Number(gridPct) / 100;

  const [year, month] = yearMonth.split("-");
  const startObj = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 1, 0, 0, 0));
  const start = startObj.getTime();
  const endObj = new Date(Date.UTC(parseInt(year), parseInt(month), 1, 0, 0, 0));
  const end = endObj.getTime() - 1;

  let allCandles: any[] = [];
  let currentStart = start;

  try {
    while (currentStart < end) {
      let currentEnd = currentStart + 200 * 5 * 60 * 1000 - 1;
      if (currentEnd > end) currentEnd = end;

      const chunkRes = await axios.get(
        "https://api.bitget.com/api/v2/mix/market/history-candles",
        {
          params: {
            symbol,
            productType: "USDT-FUTURES",
            granularity: "5m",
            limit: 200,
            startTime: currentStart.toString(),
            endTime: currentEnd.toString(),
          },
        },
      );
      if (chunkRes.data && chunkRes.data.data) {
        allCandles.push(...chunkRes.data.data);
      }
      currentStart = currentEnd + 1;
      await new Promise((r) => setTimeout(r, 60)); // Ratelimit protection
    }

    if (allCandles.length === 0) {
      return res.status(404).json({ error: "No data found for this period." });
    }

    allCandles.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
    const opens = allCandles.map((c) => parseFloat(c[1]));
    const highs = allCandles.map((c) => parseFloat(c[2]));
    const lows = allCandles.map((c) => parseFloat(c[3]));
    const closes = allCandles.map((c) => parseFloat(c[4]));

    const haCands = [];
    for (let i = 0; i < allCandles.length; i++) {
      if (i === 0) {
        haCands.push({
          open: opens[i],
          high: highs[i],
          low: lows[i],
          close: (opens[i] + highs[i] + lows[i] + closes[i]) / 4,
        });
      } else {
        const prev = haCands[i - 1];
        const haOpen = (prev.open + prev.close) / 2;
        const haClose = (opens[i] + highs[i] + lows[i] + closes[i]) / 4;
        const haHigh = Math.max(highs[i], haOpen, haClose);
        const haLow = Math.min(lows[i], haOpen, haClose);
        haCands.push({ open: haOpen, high: haHigh, low: haLow, close: haClose });
      }
    }

    const haCloses = haCands.map(c => c.close);
    const smaVals = SMA.calculate({ values: haCloses, period: 20 });

    const smaPad = haCloses.length - smaVals.length;

    const initialBal = Number(initialCapital) || 10000;
    let balance = initialBal;
    const orderSize = Number(backtestOrderSize) || 1000;

    let posSide: null | "LONG" | "SHORT" = null;
    let avgPrice = 0;
    let posAmount = 0;
    let lastExecPrice = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalTrades = 0;
    let spiderCount = 0;
    let maxDrawdown = 0;
    let peakBalance = balance;

    // Simulation Loop
    for (let i = smaPad + 1; i < closes.length; i++) {
      const price = closes[i];

      const haLast = haCloses[i];
      const haPrev = haCloses[i - 1];
      const smaLast = smaVals[i - smaPad];
      const smaPrev = smaVals[i - 1 - smaPad];

      const isGoldenCross = haPrev < smaPrev && haLast > smaLast;
      const isDeadCross = haPrev > smaPrev && haLast < smaLast;

      const currentEquity =
        balance +
        (posSide === "LONG"
          ? ((price - avgPrice) / avgPrice) * posAmount
          : posSide === "SHORT"
            ? ((avgPrice - price) / avgPrice) * posAmount
            : 0);

      if (currentEquity > peakBalance) peakBalance = currentEquity;
      const drawdown = ((peakBalance - currentEquity) / peakBalance) * 100;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;

      if (!posSide) {
        if (isGoldenCross) {
          posSide = "LONG";
          avgPrice = price;
          lastExecPrice = price;
          posAmount = orderSize;
          totalTrades++;
        } else if (isDeadCross) {
          posSide = "SHORT";
          avgPrice = price;
          lastExecPrice = price;
          posAmount = orderSize;
          totalTrades++;
        }
      } else {
        // Simple Risk Management (Stop Loss / Take Profit)
        if (posSide === "LONG") {
          if (price <= avgPrice * (1 - slDecimal)) {
            // Stop Loss
            const loss = ((price - avgPrice) / avgPrice) * posAmount;
            balance += loss;
            lossCount++;
            posSide = null;
          } else if (price >= avgPrice * (1 + tpDecimal)) {
            // Take profit
            const profit = ((price - avgPrice) / avgPrice) * posAmount;
            balance += profit;
            winCount++;
            posSide = null;
          }
        } else if (posSide === "SHORT") {
          if (price >= avgPrice * (1 + slDecimal)) {
            // Stop Loss
            const loss = ((avgPrice - price) / avgPrice) * posAmount;
            balance += loss;
            lossCount++;
            posSide = null;
          } else if (price <= avgPrice * (1 - tpDecimal)) {
            // Take profit
            const profit = ((avgPrice - price) / avgPrice) * posAmount;
            balance += profit;
            winCount++;
            posSide = null;
          }
        }
      }
    }

    if (posSide) {
      const profit =
        posSide === "LONG"
          ? ((closes[closes.length - 1] - avgPrice) / avgPrice) * posAmount
          : ((avgPrice - closes[closes.length - 1]) / avgPrice) * posAmount;
      balance += profit;
      if (profit > 0) winCount++;
      else lossCount++;
    }

    res.json({
      balance: balance.toFixed(2),
      profit: (balance - initialBal).toFixed(2),
      winCount,
      lossCount,
      totalTrades,
      spiderCount,
      maxDrawdown: maxDrawdown.toFixed(2) + "%",
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
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
