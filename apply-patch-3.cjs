const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStart = `// Technical Indicators & Entry Logic`;
const targetEnd = `if (shouldEnterLong || shouldEnterShort) {`;

if (code.indexOf(targetStart) !== -1 && code.indexOf(targetEnd) !== -1) {
    const beginIdx = code.indexOf(targetStart);
    const endIdx = code.indexOf(targetEnd) + targetEnd.length;

    const replacement = `// Technical Indicators & Entry Logic
                 const cache = candleCache[coin];
                 if (cache && cache.length >= 200 && coinObj && isMasterActive && coinObj.active) {
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

                       let recentMin = currentPrice;
                       let recentMax = currentPrice;
                       for (let j = 1; j < 5; j++) {
                          if (!lows[lows.length - 1 - j]) break;
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

                       if (shouldEnterLong || shouldEnterShort) {`;

    code = code.substring(0, beginIdx) + replacement + code.substring(endIdx);
    fs.writeFileSync('server.ts', code);
    console.log("Patched smoothly");
} else {
    console.log("Could not find start or end");
}
