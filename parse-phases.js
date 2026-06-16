import fs from 'fs';

async function go() {
  const { ADX } = await import('technicalindicators');
  const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=1000');
  const data = await res.json();
  const highs = data.map(d => parseFloat(d[2]));
  const lows = data.map(d => parseFloat(d[3]));
  const closes = data.map(d => parseFloat(d[4]));
  const adxResult = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  let countAbove20 = 0, countAbove25 = 0;
  adxResult.forEach(r => {
    if (r.adx > 20) countAbove20++;
    if (r.adx > 25) countAbove25++;
  });
  console.log(`total: ${adxResult.length}, above20: ${countAbove20}, above25: ${countAbove25}`);
}
go();
