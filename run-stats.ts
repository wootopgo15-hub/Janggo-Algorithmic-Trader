import fs from 'fs';

async function test() {
    const res = await fetch('http://localhost:3000/api/backtest?period=6m&symbol=BTC/USDT');
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        console.log('total trades:', data.totalTrades);
        const phases = data.trades.reduce((acc: any, t: any) => {
            acc[t.phase] = (acc[t.phase] || 0) + 1;
            return acc;
        }, {});
        console.log('phases:', phases);
    } catch(e) {
        console.log('text:', text.substring(0, 500));
    }
}
test();
