const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// First replace the indicator declarations in backtest
code = code.replace(
`    const adxResult = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
    const ema50 = EMA.calculate({ values: closes, period: 50 });
    const ema200 = EMA.calculate({ values: closes, period: 200 });
    const stochastic = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
    const bb = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes });
    const rsiResult = RSI.calculate({ period: 14, values: closes });
    const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });`,
`    const ema80 = EMA.calculate({ values: closes, period: 80 });
    const ema320 = EMA.calculate({ values: closes, period: 320 });
    const macdResult = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
    const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });`
);

code = code.replace(
`    const pAdx = pad(adxResult, chartData.length);
    const pEma50 = pad(ema50, chartData.length);
    const pEma200 = pad(ema200, chartData.length);
    const pStoch = pad(stochastic, chartData.length);
    const pBb = pad(bb, chartData.length);
    const pRsi = pad(rsiResult, chartData.length);
    const pAtr = pad(atrResult, chartData.length);`,
`    const pEma80 = pad(ema80, chartData.length);
    const pEma320 = pad(ema320, chartData.length);
    const pMacd = pad(macdResult, chartData.length);
    const pAtr = pad(atrResult, chartData.length);`
);

// We need to replace the long evaluate exit/entry for Backtest with new logic.
let startExitLogic = code.indexOf(`for (let i = 200; i < chartData.length; i++) {`);
let endExitLogic = code.indexOf(`} catch (err) {`, startExitLogic);

const newLogicMap = `
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
                highestHigh: currentPrice,
                lowestLow: currentPrice,
                phase: reason,
                atr: currentAtr,
                barsHeld: 0,
                halfTaken: false
            };
            chartData[i].signal = position.type;
        }
    }
`;

code = code.substring(0, startExitLogic) + newLogicMap + code.substring(endExitLogic);

// Now patch the live logic inside watchExchangeData
// Around line 950 inside watchExchangeData():
let startLiveIndicators = code.indexOf(`const adxResult = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });`);
let endLiveIndicators = code.indexOf(`if (adxResult.length > 0 `, startLiveIndicators);

if(startLiveIndicators !== -1) {
    code = code.substring(0, startLiveIndicators) +
`                     const ema80 = EMA.calculate({ values: closes, period: 80 });
                     const ema320 = EMA.calculate({ values: closes, period: 320 });
                     const macdResult = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
                     const atrResult = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
                     
                     ` + code.substring(endLiveIndicators);
}

code = code.replace(`if (adxResult.length > 0 && ema50.length > 0 && ema200.length > 0 && stochastic.length > 1 && bb.length > 0 && rsiResult.length > 0 && atrResult.length > 0) {`,
`if (ema80.length > 0 && ema320.length > 0 && macdResult.length > 1 && atrResult.length > 0) {`);

code = code.replace(/const currentAdx15m = adxResult\[adxResult.length - 1\].adx;[\s\S]*const currentVwap = lastVwap;/g,
`                       const currentEma80 = ema80[ema80.length - 1];
                       const currentEma320 = ema320[ema320.length - 1];
                       const prevEma320 = ema320[ema320.length - 2];
                       const currentPrice = closes[closes.length - 1];
                       const prevMacd = macdResult[macdResult.length - 2];
                       const currentMacd = macdResult[macdResult.length - 1];
                       const currentAtr = atrResult[atrResult.length - 1];`);

code = code.replace(/let currentAdx4h = currentAdx15m;[\s\S]*if \(shouldEnterLong \|\| shouldEnterShort\) \{/g,
`
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
                       let reason = '';
                       if (shouldEnterLong) reason = 'Uptrend';
                       if (shouldEnterShort) reason = 'Downtrend';

                       if (shouldEnterLong || shouldEnterShort) {`);


// Finally we must fix the SL/TP logic in live engine
let liveExitStart = code.indexOf(`// Exit Logic Implementation`);
let liveExitEnd = code.indexOf(`if (shouldExit) {`, liveExitStart);
if (liveExitStart !== -1) {
    const newLiveExitBlock = `// Exit Logic Implementation
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
                         } else if (current <= hardStopLong || candle.low <= hardStopLong) {
                             shouldExit = true;
                             exitReason = 'Stop-Loss (-1.5 ATR)';
                         }
                     } else {
                         if (current <= tpShort || candle.low <= tpShort) {
                             shouldExit = true;
                             exitReason = 'Take Profit (+3.0 ATR)';
                         } else if (current >= hardStopShort || candle.high >= hardStopShort) {
                             shouldExit = true;
                             exitReason = 'Stop-Loss (-1.5 ATR)';
                         }
                     }
                     
                     `;
    code = code.substring(0, liveExitStart) + newLiveExitBlock + code.substring(liveExitEnd);
}

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts successfully");
