const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// For backtest error: currentPrice instead of currentClose
code = code.replace(/highestHigh: currentPrice,/g, 'highestHigh: currentClose,');
code = code.replace(/lowestLow: currentPrice,/g, 'lowestLow: currentClose,');

// For live logic error: it still uses ADX, currentVwap, currentEma50, currentEma200.
// Let's replace the whole live block.

let startLiveEval = code.indexOf(`                       let currentAdx4h = currentAdx15m;`);
let endLiveEval = code.indexOf(`                       if (shouldEnterLong || shouldEnterShort) {`, startLiveEval);

if (startLiveEval !== -1 && endLiveEval !== -1) {
    const newLiveEvalBlock = `
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
                       coinObj.phase = reason || 'Sideways';

`;
    code = code.substring(0, startLiveEval) + newLiveEvalBlock + code.substring(endLiveEval);
}

fs.writeFileSync('server.ts', code);
console.log("Patched server.ts second time");
