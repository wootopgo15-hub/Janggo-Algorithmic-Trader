import fs from 'fs';

async function go() {
  const res = await fetch('http://localhost:3000/api/backtest?period=6m&symbol=BTC/USDT');
  const d = await res.json();
  const phases = d.recentTrades ? d.recentTrades.reduce((a, t) => {
    a[t.phase] = (a[t.phase] || 0) + 1;
    return a;
  }, {}) : {};
  console.log('trades length:', d.totalTrades);
  console.log('Phases:', phases);
  console.log('ADX stats:');
  
}
go();
