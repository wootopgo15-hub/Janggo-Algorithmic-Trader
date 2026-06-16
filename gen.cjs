const fs = require('fs');

const serverStr = `import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import { Server } from 'socket.io';
import * as ccxt from 'ccxt';
import { ADX, EMA, BollingerBands, Stochastic, RSI, ATR, MACD } from 'technicalindicators';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

// --- Bot State & Mock DB ---
type BotPhase = 'Uptrend' | 'Downtrend' | 'Sideways' | 'Unknown';
interface CoinState {
  symbol: string;
  active: boolean;
  phase: BotPhase | string;
  pnl: number;
  longActive: boolean;
  shortActive: boolean;
  balance: number;
  entryPrice?: number;
  entryTime?: number;
  positionType?: 'LONG' | 'SHORT';
  margin?: number;
  maxProfitPct?: number; 
  halfTaken?: boolean; 
  fiboTarget?: number;
  entryPhase?: string;
  atr?: number;
  barsHeld?: number;
  highestHigh?: number;
  lowestLow?: number;
}

let isMasterActive = false;
let timeOffsetMs = 0; // Simulated time sync offset
let totalBalance = 2000; // Mock starting balance
let tradingAllocationPct = 20; // Default allocation percentage

const TARGET_COINS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT',
  'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'LINK/USDT', 'POL/USDT'
];

const MOCK_PRICES: Record<string, number> = {
  'BTC/USDT': 64000, 'ETH/USDT': 3400, 'SOL/USDT': 140, 'XRP/USDT': 0.6, 'BNB/USDT': 600,
  'AVAX/USDT': 28, 'DOGE/USDT': 0.12, 'DOT/USDT': 6.5, 'LINK/USDT': 15.5, 'POL/USDT': 0.5
};

let coinStates: CoinState[] = TARGET_COINS.map((symbol, idx) => {
  const isLong = Math.random() > 0.6;
  const isShort = !isLong && Math.random() > 0.6;
  const basePrice = MOCK_PRICES[symbol] || 100;
  
  let entryPrice = undefined;
  let positionType = undefined;
  
  if (isLong || isShort) {
     const priceOffset = (Math.random() - 0.5) * 0.05 * basePrice;
     entryPrice = basePrice + priceOffset;
     positionType = isLong ? ('LONG' as const) : ('SHORT' as const);
  }

  return {
    symbol,
    active: true,
    phase: idx % 3 === 0 ? 'Uptrend' : idx % 3 === 1 ? 'Downtrend' : 'Sideways',
    pnl: (isLong || isShort) ? ((Math.random() * 10) - 3) : 0,
    longActive: !!isLong,
    shortActive: !!isShort,
    balance: 2450.05,
    entryPrice,
    positionType,
    margin: (isLong || isShort) ? ((2000 * 20 / 100) / 10) : 0
  };
});

// --- API Endpoints ---
app.get('/api/status', (req, res) => {
  res.json({
    masterActive: isMasterActive,
    totalBalance,
    totalPnl: coinStates.reduce((acc, c) => acc + c.pnl, 0),
    timeOffsetMs,
    tradingAllocationPct,
    coins: coinStates,
    apiStatus: 'Connected', 
  });
});

app.post('/api/master/toggle', (req, res) => {
  isMasterActive = !isMasterActive;
  res.json({ success: true, masterActive: isMasterActive });
});

app.post('/api/panic-sell', (req, res) => {
  coinStates = coinStates.map(c => ({
    ...c, longActive: false, shortActive: false, pnl: 0, active: false
  }));
  isMasterActive = false;
  res.json({ success: true, message: 'All positions liquidated at market price. Bot paused.' });
});

app.post('/api/allocation', (req, res) => {
  const { pct } = req.body;
  if (typeof pct === 'number') {
    tradingAllocationPct = Math.min(Math.max(pct, 1), 100);
  }
  res.json({ success: true, tradingAllocationPct });
});

app.post('/api/sync-time', (req, res) => {
  const { offset } = req.body;
  if (typeof offset === 'number') {
    timeOffsetMs = offset;
  } else {
    timeOffsetMs = 0; 
  }
  res.json({ success: true, timeOffsetMs });
});

app.post('/api/coin/toggle', (req, res) => {
  const { symbol } = req.body;
  const coin = coinStates.find(c => c.symbol === symbol);
  if (coin) {
    coin.active = !coin.active;
    res.json({ success: true, coin });
  } else {
    res.status(404).json({ error: 'Coin not found' });
  }
});

// --- Mock Backtest Data ---
app.get('/api/backtest', async (req, res) => {
  const period = req.query.period as string || '3m';
  const symbol = req.query.symbol as string || 'BTC/USDT';
  const ccxtSymbol = symbol;
  
  let chartData: any[] = [];
  let testStartTimeMs = 0;
  try {
    const exchange = new ccxt.binance({ enableRateLimit: true });
    let timeframe = '15m';
    let limit = 96;

    let targetDays = 1;
    if (period === '1d') targetDays = 1;
    else if (period === '3m') targetDays = 90;
    else if (period === '6m') targetDays = 180;
    else if (period === '1y') targetDays = 365;

    targetDays = Math.min(targetDays, 180);

    const paddingDays = 40; 
    testStartTimeMs = Date.now() - (targetDays * 24 * 60 * 60 * 1000);
    const now = Date.now();
    let since = now - ((targetDays + paddingDays) * 24 * 60 * 60 * 1000);
    
    let allOhlcv: any[] = [];
    let fetchCount = 0;
    while (since < now && fetchCount < 100) {
      const ohlcv = await exchange.fetchOHLCV(ccxtSymbol, timeframe, since, 1000);
      if (!ohlcv || ohlcv.length === 0) break;
      
      allOhlcv = allOhlcv.concat(ohlcv);
      const lastCandleTime = ohlcv[ohlcv.length - 1][0];
      
      if (lastCandleTime >= since) {
         since = lastCandleTime + 1;
      } else {
         break;
      }
      fetchCount++;
    }

    const dedupMap = new Map();
    allOhlcv.forEach(c => dedupMap.set(c[0], c));
    const deduped = Array.from(dedupMap.values()).sort((a: any, b: any) => a[0] - b[0]);

    chartData = deduped.map((c: any) => ({
      time: Math.floor(c[0] / 1000),
      open: c[1],
      high: c[2],
      low: c[3],
      close: c[4],
      volume: c[5] || 0
    }));
  } catch (err) {
    console.error("Backtest fetch error from exchange:", err);
    let price = 42500;
    const now = Math.floor(Date.now() / 1000);
    for(let i=0; i<300; i++) {
      const time = now - (300 - i) * 900;
      const open = price;
      const close = price + (Math.random() - 0.5) * 400;
      const high = Math.max(open, close) + Math.random() * 200;
      const low = Math.min(open, close) - Math.random() * 200;
      const volume = Math.random() * 1000;
      price = close;
      chartData.push({ time, open, high, low, close, volume });
    }
  }

  let allTrades: any[] = [];
  try {
    const opens = chartData.map(c => c.open);
    const highs = chartData.map(c => c.high);
    const lows = chartData.map(c => c.low);
    const closes = chartData.map(c => c.close);
    const volumes = chartData.map(c => c.volume);
    
    const ema80 = EMA.calculate({ values: closes, period: 80 });
    const ema320 = EMA.calculate({ values: closes, period: 320 });
    const macdResult = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });

    const pad = (arr: any[], length: number) => Array(length - arr.length).fill(null).concat(arr);

    const pEma80 = pad(ema80, chartData.length);
    const pEma320 = pad(ema320, chartData.length);
    const pMacd = pad(macdResult, chartData.length);
    const pAtr = pad(atrResult, chartData.length);
    
    let position: null | { type: 'LONG'|'SHORT', entryPrice: number, entryTime: number, maxProfitPct: number, phase: string, atr: number, barsHeld: number, halfTaken: boolean, highestHigh?: number, lowestLow?: number } = null;
    
    const formatTime = (ms: number) => {
      const d = new Date(ms);
      return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')} \${String(d.getHours()).padStart(2, '0')}:\${String(d.getMinutes()).padStart(2, '0')}\`;
    };

    for (let i = 320; i < chartData.length; i++) {
        const time15m = chartData[i].time;
        const currentClose = closes[i];
        const currentHigh = highs[i];
        const currentLow = lows[i];
        const currentEma80 = pEma80[i];
        const currentEma320 = pEma320[i];
        const currentMacd = pMacd[i];
        const prevMacd = pMacd[i-1];
        const currentAtr = pAtr[i];

        if (!currentEma80 || !currentEma320 || !currentMacd || !prevMacd || !currentAtr) continue;

        if (position) {
            position.barsHeld++;
            let shouldExit = false;
            let exitReason = '';
            let exitPrice = currentClose;

            const tpLong = position.entryPrice + (position.atr * 3.0);
            const tpShort = position.entryPrice - (position.atr * 3.0);
            
            const hardStopLong = position.entryPrice - (position.atr * 1.5);
            const hardStopShort = position.entryPrice + (position.atr * 1.5);

            if (position.type === 'LONG') {
                if (currentHigh >= tpLong) {
                    shouldExit = true;
                    exitPrice = tpLong;
                    if (chartData[i].open > tpLong && chartData[i-1].close < tpLong) exitPrice = chartData[i].open; // gap check
                    exitReason = 'Take Profit (+3.0 ATR)';
                } else if (currentLow <= hardStopLong) {
                    shouldExit = true;
                    exitPrice = hardStopLong;
                    if (chartData[i].open < hardStopLong && chartData[i-1].close > hardStopLong) exitPrice = chartData[i].open;
                    exitReason = 'Stop-Loss (-1.5 ATR)';
                }
            } else {
                if (currentLow <= tpShort) {
                    shouldExit = true;
                    exitPrice = tpShort;
                    if (chartData[i].open < tpShort && chartData[i-1].close > tpShort) exitPrice = chartData[i].open;
                    exitReason = 'Take Profit (+3.0 ATR)';
                } else if (currentHigh >= hardStopShort) {
                    shouldExit = true;
                    exitPrice = hardStopShort;
                    if (chartData[i].open > hardStopShort && chartData[i-1].close < hardStopShort) exitPrice = chartData[i].open;
                    exitReason = 'Stop-Loss (-1.5 ATR)';
                }
            }

            if (i === chartData.length - 1 && !shouldExit) {
                shouldExit = true;
                exitReason = 'End of data';
                exitPrice = currentClose;
            }

            if (shouldExit) {
                const priceDiffPct = position.type === 'LONG' 
                    ? (exitPrice - position.entryPrice) / position.entryPrice
                    : (position.entryPrice - exitPrice) / position.entryPrice;

                allTrades.push({
                    id: 'TRD-' + Date.now() + Math.random().toString(36).substring(2, 5).toUpperCase(),
                    symbol,
                    type: position.type,
                    phase: position.phase,
                    exitReason,
                    entryTimeMs: position.entryTime * 1000,
                    exitTimeMs: chartData[i].time * 1000,
                    entryTime: formatTime(position.entryTime * 1000),
                    exitTime: formatTime(chartData[i].time * 1000),
                    entryPrice: position.entryPrice,
                    exitPrice: exitPrice,
                    priceDiffPct: priceDiffPct,
                    atr: position.atr,
                    sizeMultiplier: 1.0,
                    isPartial: false,
                    pnl: 0, pnlPct: 0
                });
                chartData[i].exit = true;
                position = null;
            }
            continue;
        }

        // Evaluate entry (MTF 4H-1H-15M Alignment)
        const isUptrend4H = currentClose > currentEma320 && currentEma320 > pEma320[i-1];
        const isDowntrend4H = currentClose < currentEma320 && currentEma320 < pEma320[i-1];

        // 1H 눌림목 판단 (가격이 80EMA를 터치하거나 근접)
        let recentMin = currentLow;
        let recentMax = currentHigh;
        for (let j = 0; j < 5; j++) {
            if (!lows[i-j] || !highs[i-j]) break;
            recentMin = Math.min(recentMin, lows[i-j]);
            recentMax = Math.max(recentMax, highs[i-j]);
        }
        const isPullbackTo80EMA = isUptrend4H && (recentMin <= currentEma80 * 1.002);
        const isBounceTo80EMA = isDowntrend4H && (recentMax >= currentEma80 * 0.998);

        // 15M MACD 크로스
        const goldenCross = prevMacd.MACD <= prevMacd.signal && currentMacd.MACD > currentMacd.signal;
        const deadCross = prevMacd.MACD >= prevMacd.signal && currentMacd.MACD < currentMacd.signal;

        let shouldEnterLong = isPullbackTo80EMA && goldenCross;
        let shouldEnterShort = isBounceTo80EMA && deadCross;

        if (chartData[i].time * 1000 < testStartTimeMs) {
            shouldEnterLong = false;
            shouldEnterShort = false;
        }

        let reason = '';
        if (shouldEnterLong) reason = 'Uptrend';
        if (shouldEnterShort) reason = 'Downtrend';

        if (shouldEnterLong || shouldEnterShort) {
            position = {
                type: shouldEnterLong ? 'LONG' : 'SHORT',
                entryPrice: currentClose,
                entryTime: chartData[i].time,
                maxProfitPct: 0,
                highestHigh: currentClose,
                lowestLow: currentClose,
                phase: reason,
                atr: currentAtr,
                barsHeld: 0,
                halfTaken: false
            };
            chartData[i].signal = position.type;
        }
    }
  } catch (err) {
    console.error("Backtest logic calculation error:", err);
  }

  let targetLimit = 96;
  if (period === '1d') targetLimit = 96;
  else if (period === '3m') targetLimit = 96 * 90;
  else if (period === '6m') targetLimit = 96 * 180;
  else if (period === '1y') targetLimit = 96 * 365;
  targetLimit = Math.min(targetLimit, chartData.length);

  const slicedChartData = chartData.slice(-targetLimit);
  const startTime = slicedChartData[0]?.time || 0;
  
  const finalTrades = allTrades.filter(t => t.entryTimeMs >= (startTime * 1000));
  
  let mdd = 0;
  let peak = 2000;
  let rollingCap = 2000;

  finalTrades.forEach(t => {
      const riskAmount = rollingCap * 0.01;
      const riskPct = 0.015;
      let positionSize = riskAmount / riskPct;
      
      const maxPositionSize = rollingCap * 5;
      if (positionSize > maxPositionSize) {
          positionSize = maxPositionSize;
      }

      const executionPenalty = positionSize * 0.0015; 
      let rawPnl = (t.priceDiffPct * positionSize) - executionPenalty;
      
      const pnl = Math.round(rawPnl * 100) / 100;
      t.pnl = pnl;
      t.pnlPct = Math.round((pnl / rollingCap) * 10000) / 100; 
      
      rollingCap += pnl;
      if (rollingCap > peak) peak = rollingCap;
      let dd = ((peak - rollingCap) / peak) * 100;
      if (dd > mdd) mdd = dd;
  });

  const totalTrades = finalTrades.length;
  const winningTrades = finalTrades.filter(t => t.pnl > 0).length;
  let winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  
  let netProfit = rollingCap - 2000;

  const mockBacktest = {
    winRate: winRate.toFixed(1),
    mdd: mdd.toFixed(1),
    netProfit: netProfit.toFixed(2),
    totalTrades,
    chartData: slicedChartData,
    recentTrades: finalTrades.reverse()
  };

  res.json(mockBacktest);
});


// --- Vite Development Middleware & Production Static Serving ---
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(\`Server running on port \${PORT}\`);
  });
}

// CCXT Pro WebSocket for real-time candles
const candleCache: Record<string, any[]> = {};
const candleCache4h: Record<string, any[]> = {};

async function watchExchangeData() {
  io.on('connection', (socket) => {
    Object.keys(candleCache).forEach(coin => {
      socket.emit(\`seed:\${coin}\`, candleCache[coin]);
    });
    
    socket.on('request_seed', (coin) => {
      if (candleCache[coin]) {
        socket.emit(\`seed:\${coin}\`, candleCache[coin]);
      }
    });
  });

  const exchangeConfig: any = {
    enableRateLimit: true,
    options: { defaultType: 'swap' }
  };
  
  if (process.env.BITGET_API_KEY && process.env.BITGET_SECRET && process.env.BITGET_PASSPHRASE) {
    exchangeConfig.apiKey = process.env.BITGET_API_KEY;
    exchangeConfig.secret = process.env.BITGET_SECRET;
    exchangeConfig.password = process.env.BITGET_PASSPHRASE;
  }
  
  const exchange = new ccxt.pro.bitget(exchangeConfig);

  if (exchange.apiKey) {
    try {
      console.log('Connecting to Bitget API to fetch real account data...');
      const balance = await exchange.fetchBalance();
      if (balance && balance.info && balance.info[0] && balance.info[0].usdtEquity) {
         totalBalance = parseFloat(balance.info[0].usdtEquity);
      } else if (balance && balance.USDT && balance.USDT.total) {
         totalBalance = balance.USDT.total;
      }

      const positions = await exchange.fetchPositions();
      positions.forEach((pos: any) => {
         const coinObj = coinStates.find(c => pos.symbol.startsWith(c.symbol.replace('/USDT', '')));
         if (coinObj && pos.contracts > 0) {
            coinObj.entryPrice = pos.entryPrice;
            coinObj.positionType = pos.side === 'long' ? 'LONG' : 'SHORT';
            coinObj.longActive = pos.side === 'long';
            coinObj.shortActive = pos.side === 'short';
            coinObj.pnl = pos.unrealizedPnl || 0;
            coinObj.entryTime = undefined;
            const posMargin = pos.initialMargin || (pos.notional / pos.leverage) || 0;
            coinObj.margin = posMargin;
         }
      });
      console.log('Real Bitget Positions Loaded.');
    } catch (e: any) {
      console.error('Failed to fetch real Bitget data, falling back to mock:', e.message);
    }
  }

  const initPromises = TARGET_COINS.map(async (coin, index) => {
     const symbol = coin.replace('/USDT', '/USDT:USDT');
     
     await new Promise(r => setTimeout(r, index * 200));
     
     try {
       const initialCandles = await exchange.fetchOHLCV(symbol, '15m', undefined, 500);
       const latestPrice = initialCandles[initialCandles.length - 1][4];
       
       const coinObj = coinStates.find(c => c.symbol === symbol.replace(':USDT', ''));
       if (coinObj && (coinObj.longActive || coinObj.shortActive)) {
           const priceOffset = (Math.random() - 0.5) * 0.01 * latestPrice;
           coinObj.entryPrice = latestPrice + priceOffset;
           
           const recentCandle = initialCandles[initialCandles.length - Math.floor(Math.random() * 30 + 1)];
           coinObj.entryTime = Math.floor(recentCandle[0] / 1000);
           
           let priceDiffPct = (latestPrice - coinObj.entryPrice) / coinObj.entryPrice;
           if (coinObj.positionType === 'SHORT') priceDiffPct = -priceDiffPct;
           const leveragedPct = priceDiffPct * 5;
           const feePct = 0.0015 * 5; 
           const netPct = leveragedPct - feePct;
           const positionMargin = (totalBalance * (tradingAllocationPct / 100)) / TARGET_COINS.length;
           coinObj.pnl = positionMargin * netPct;
       }

       candleCache[coin] = initialCandles.map((c: any) => ({
         time: Math.floor(c[0] / 1000), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] 
       }));
       io.emit(\`seed:\${coin}\`, candleCache[coin]);
       
     } catch (e: any) {
        console.error(\`Error fetching initial data for \${symbol}:\`, e.message);
        let price = MOCK_PRICES[coin.replace(':USDT', '')] || 100;
        const now = Math.floor(Date.now() / 1000);
        const dummyCandles = [];
        for(let i=0; i<500; i++) {
          const time = now - (500 - i) * 900;
          const open = price;
          const close = price + (Math.random() - 0.5) * price * 0.002;
          const high = Math.max(open, close) + Math.random() * price * 0.001;
          const low = Math.min(open, close) - Math.random() * price * 0.001;
          const volume = Math.random() * 1000;
          price = close;
          dummyCandles.push({ time, open, high, low, close, volume });
        }
        candleCache[coin] = dummyCandles;
        io.emit(\`seed:\${coin}\`, candleCache[coin]);
     }
     
     (async () => {
       let reconnectAttempts = 0;
       let lastMessageTime = Date.now();
       
       const watchdogInterval = setInterval(() => {
         if (Date.now() - lastMessageTime > 180000) {
           console.log(\`Watchdog timeout for \${symbol}. Forcing reconnect...\`);
           const url = (exchange.urls as any)?.api?.ws;
           if (url) {
             exchange.clients?.[url]?.close?.(); 
           }
           lastMessageTime = Date.now();
         }
       }, 30000);

       while (true) {
         try {
             while (true) {
               const ohlcv = await exchange.watchOHLCV(symbol, '15m');
               lastMessageTime = Date.now();
               reconnectAttempts = 0;
               
               for (const c of ohlcv) {
                 const candle = { time: Math.floor(c[0] / 1000), open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5] };
                 
                 const lastCacheTime = candleCache[coin]?.[candleCache[coin].length - 1]?.time || 0;
                 if (lastCacheTime > 0 && candle.time > lastCacheTime + 900) {
                    try {
                      const backfill = await exchange.fetchOHLCV(symbol, '15m', undefined, 100);
                      const formattedBackfill = backfill.map((bc: any) => ({
                         time: Math.floor(bc[0] / 1000), open: bc[1], high: bc[2], low: bc[3], close: bc[4], volume: bc[5] 
                      }));
                      
                      for (const bfCandle of formattedBackfill) {
                         const existingIdx = candleCache[coin].findIndex(c => c.time === bfCandle.time);
                         if (existingIdx !== -1) {
                            candleCache[coin][existingIdx] = bfCandle;
                         } else {
                            candleCache[coin].push(bfCandle);
                         }
                      }
                      candleCache[coin].sort((a,b) => a.time - b.time);
                      if (candleCache[coin].length > 500) candleCache[coin].splice(0, candleCache[coin].length - 500);
                      
                      io.emit(\`seed:\${coin}\`, candleCache[coin]);
                    } catch (bfErr: any) {
                      console.error(\`[\${symbol}] Backfill failed:\`, bfErr.message);
                    }
                 }
                 
                 io.emit(\`candle:\${coin}\`, candle);
                 
                 const last = candleCache[coin]?.[candleCache[coin].length - 1];
                 if (last && last.time === candle.time) {
                   candleCache[coin][candleCache[coin].length - 1] = candle;
                 } else if (candleCache[coin]) {
                   if (last?.time !== candle.time) {
                     candleCache[coin].push(candle);
                   }
                   if (candleCache[coin].length > 500) candleCache[coin].shift();
                 }
  
                 const coinObj = coinStates.find(x => x.symbol === symbol.replace(':USDT', ''));
                 if (coinObj && coinObj.entryPrice && (coinObj.longActive || coinObj.shortActive)) {
                     const entry = coinObj.entryPrice;
                     const current = candle.close;
                     
                     if (coinObj.positionType === 'LONG') {
                         coinObj.highestHigh = Math.max(coinObj.highestHigh || entry, candle.high);
                     } else {
                         coinObj.lowestLow = Math.min(coinObj.lowestLow || entry, candle.low);
                     }
                     
                     let priceDiffPct = (current - entry) / entry;
                     if (coinObj.positionType === 'SHORT') priceDiffPct = -priceDiffPct;
                     
                     const currentAtr = coinObj.atr || (entry * 0.01);
                     
                     const riskAmount = totalBalance * 0.01;
                     const riskPct = 0.015;
                     let positionSizeUsd = riskAmount / riskPct;
                     const maxPositionSize = totalBalance * 5; 
                     if (positionSizeUsd > maxPositionSize) positionSizeUsd = maxPositionSize;

                     const realisticTotalFeePct = positionSizeUsd * 0.0015;
                     let rawPnl = (priceDiffPct * positionSizeUsd) - realisticTotalFeePct;
                     coinObj.pnl = rawPnl;

                     let shouldExit = false;
                     let exitReason = '';
                     
                     coinObj.barsHeld = (coinObj.barsHeld || 0) + 1;
                     
                     const tpLong = entry + (currentAtr * 3.0);
                     const tpShort = entry - (currentAtr * 3.0);

                     const hardStopLong = entry - (currentAtr * 1.5);
                     const hardStopShort = entry + (currentAtr * 1.5);
                     
                     if (coinObj.positionType === 'LONG') {
                         if (current >= tpLong || candle.high >= tpLong) {
                             shouldExit = true;
                             exitReason = 'Take Profit (+3.0 ATR)';
                         }
                         if (current <= hardStopLong || candle.low <= hardStopLong) {
                             shouldExit = true;
                             exitReason = 'Stop-Loss (-1.5 ATR)';
                         }
                     } else {
                         if (current <= tpShort || candle.low <= tpShort) {
                             shouldExit = true;
                             exitReason = 'Take Profit (+3.0 ATR)';
                         }
                         if (current >= hardStopShort || candle.high >= hardStopShort) {
                             shouldExit = true;
                             exitReason = 'Stop-Loss (-1.5 ATR)';
                         }
                     }

                     if (shouldExit) {
                         console.log(\`[\${symbol}] EXITING POSITION: \${exitReason}\`);
                         if (exchange.apiKey) {
                            console.log(\`Executing Bitget Market Close for \${symbol}\`);
                         }
                         
                         totalBalance += rawPnl;
                         
                         coinObj.longActive = false;
                         coinObj.shortActive = false;
                         coinObj.entryPrice = undefined;
                         coinObj.pnl = 0;
                         coinObj.highestHigh = undefined;
                         coinObj.lowestLow = undefined;
                         coinObj.barsHeld = 0;
                         coinObj.entryPhase = undefined;
                     }
                 }

                 const cache = candleCache[coin];
                 if (cache && cache.length >= 320 && coinObj && isMasterActive && coinObj.active && !coinObj.longActive && !coinObj.shortActive) {
                   try {
                     const opens = cache.map(c => c.open);
                     const highs = cache.map(c => c.high);
                     const lows = cache.map(c => c.low);
                     const closes = cache.map(c => c.close);
                     const volumes = cache.map(c => c.volume);
                     
                     const ema80 = EMA.calculate({ values: closes, period: 80 });
                     const ema320 = EMA.calculate({ values: closes, period: 320 });
                     const macdResult = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
                     const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
                     
                     if (ema80.length > 0 && ema320.length > 0 && macdResult.length > 1 && atrResult.length > 0) {
                       const currentEma80 = ema80[ema80.length - 1];
                       const currentEma320 = ema320[ema320.length - 1];
                       const prevEma320 = ema320[ema320.length - 2];
                       const currentPrice = closes[closes.length - 1];
                       const prevMacd = macdResult[macdResult.length - 2];
                       const currentMacd = macdResult[macdResult.length - 1];
                       const currentAtr = atrResult[atrResult.length - 1];

                       const isUptrend4H = currentPrice > currentEma320 && currentEma320 > prevEma320;
                       const isDowntrend4H = currentPrice < currentEma320 && currentEma320 < prevEma320;

                       let recentMin = lows[lows.length - 1];
                       let recentMax = highs[highs.length - 1];
                       for(let j=1; j<5; j++){
                          if(!lows[lows.length - 1 - j]) break;
                          recentMin = Math.min(recentMin, lows[lows.length - 1 - j]);
                          recentMax = Math.max(recentMax, highs[highs.length - 1 - j]);
                       }

                       const isPullbackTo80EMA = isUptrend4H && (recentMin <= currentEma80 * 1.002);
                       const isBounceTo80EMA = isDowntrend4H && (recentMax >= currentEma80 * 0.998);

                       const goldenCross = prevMacd.MACD <= prevMacd.signal && currentMacd.MACD > currentMacd.signal;
                       const deadCross = prevMacd.MACD >= prevMacd.signal && currentMacd.MACD < currentMacd.signal;

                       let shouldEnterLong = isPullbackTo80EMA && goldenCross;
                       let shouldEnterShort = isBounceTo80EMA && deadCross;
                       
                       let reason = 'Sideways';
                       if (shouldEnterLong) reason = 'Uptrend';
                       if (shouldEnterShort) reason = 'Downtrend';
                       coinObj.phase = reason;

                       if (shouldEnterLong || shouldEnterShort) {
                           if (exchange.apiKey) {
                              console.log(\`LIVE ORDER: \${shouldEnterLong ? 'LONG' : 'SHORT'} on \${symbol}\`);
                           }
                           coinObj.positionType = shouldEnterLong ? 'LONG' : 'SHORT';
                           coinObj.entryPrice = currentPrice;
                           coinObj.entryTime = candle.time;
                           coinObj.longActive = shouldEnterLong;
                           coinObj.shortActive = shouldEnterShort;
                           coinObj.atr = currentAtr;
                           coinObj.highestHigh = currentPrice;
                           coinObj.lowestLow = currentPrice;
                           coinObj.barsHeld = 0;
                           coinObj.margin = (totalBalance * (tradingAllocationPct / 100)) / TARGET_COINS.length;
                           coinObj.pnl = 0;
                       }
                     }
                   } catch (indErr) {
                     console.error("Indicator calculation error:", indErr);
                   }
                 }

               }
             }
         } catch (e: any) {
           console.error(\`Stream error \${symbol}:\`, e.message);
           await new Promise(r => setTimeout(r, 5000));
         }
       }
     })();
  });
  
  await Promise.all(initPromises);
}

startServer().then(() => {
  watchExchangeData();
});
`;
fs.writeFileSync('server.ts', serverStr);
console.log('Regenerated server.ts perfectly.');
