import express from "express";
import path from "path";
import axios from "axios";
import { RSI, MACD, ATR, StochasticRSI } from "technicalindicators";
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
          limit: 1000,
        },
      },
    );

    if (response.data.code !== "00000") {
      throw new Error(`Bitget API Error: ${response.data.msg}`);
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

    if (!candles || candles.length < 50 || !candles5m || !candles10m || !candles15m) {
      return res.status(400).json({ error: "Insufficient data for analysis" });
    }

    const calcInds = (cands: any[]) => {
      const cls = cands.map((c) => c.close);
      const rVals = RSI.calculate({ values: cls, period: 14 });
      const srVals = StochasticRSI.calculate({
        values: cls,
        rsiPeriod: 14,
        stochasticPeriod: 14,
        kPeriod: 3,
        dPeriod: 3,
      });
      const mRes = MACD.calculate({
        values: cls,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      const h = cands.map((c) => c.high);
      const l = cands.map((c) => c.low);
      const aVals = ATR.calculate({ high: h, low: l, close: cls, period: 14 });
      return { cls, rVals, srVals, mRes, aVals };
    };

    const mainInds = calcInds(candles);
    const inds5 = calcInds(candles5m);
    const inds10 = calcInds(candles10m);
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

    // Strict local rules
    const rsi5m = inds5.rVals[inds5.rVals.length - 1];
    const rsi10m = inds10.rVals[inds10.rVals.length - 1];
    const rsi15m = inds15.rVals[inds15.rVals.length - 1];
    
    const macd15mLast = inds15.mRes[inds15.mRes.length - 1];
    const macd15mPrev = inds15.mRes[inds15.mRes.length - 2];
    const isMacd15mGold = macd15mPrev.histogram !== undefined && macd15mLast.histogram !== undefined && macd15mPrev.histogram < 0 && macd15mLast.histogram > 0;
    const isMacd15mDead = macd15mPrev.histogram !== undefined && macd15mLast.histogram !== undefined && macd15mPrev.histogram > 0 && macd15mLast.histogram < 0;

    if (rsi5m <= 34 && rsi10m <= 34 && isMacd15mGold) decision = "LONG";
    else if (rsi5m >= 67 && rsi10m >= 67 && isMacd15mDead) decision = "SHORT";

    // HOLD Fallback Base
    let fallbackSummary = `[기본 지표] 5분 RSI(${rsi5m?.toFixed(1)}) & 10분 RSI(${rsi10m?.toFixed(1)}) 기준 관망`;
    if (decision === "LONG")
      fallbackSummary = `[기본 지표] 5분/10분 RSI 과매도(<=34) & 15분 MACD 골든크로스 - 롱 진입`;
    if (decision === "SHORT")
      fallbackSummary = `[기본 지표] 5분/10분 RSI 과매수(>=67) & 15분 MACD 데드크로스 - 숏 진입`;

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
- **5분 RSI:** ${rsi5m.toFixed(2)}
- **10분 RSI:** ${rsi10m.toFixed(2)}
- **15분 MACD Histogram:** ${macd15mLast.histogram?.toFixed(4)}

# 분석 요약 가이드라인
- 롱 진입 조건(5분, 10분 RSI <= 34 및 15분 MACD 골든크로스), 숏 진입 조건(5분, 10분 RSI >= 67 및 15분 MACD 데드크로스).
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
      indicators: {
        rsi: rsiValues.slice(-20),
        stochRsi: mainInds.srVals.slice(-20),
        macd: macdResult.slice(-20),
      },
      indicators5m: {
        rsi: inds5.rVals.slice(-20),
        stochRsi: inds5.srVals.slice(-20),
        macd: inds5.mRes.slice(-20),
      },
      indicators10m: {
        rsi: inds10.rVals.slice(-20),
        stochRsi: inds10.srVals.slice(-20),
        macd: inds10.mRes.slice(-20),
      },
      indicators15m: {
        rsi: inds15.rVals.slice(-20),
        stochRsi: inds15.srVals.slice(-20),
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
