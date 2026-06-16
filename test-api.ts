import fetch from 'node-fetch';
async function test() {
    const res = await fetch('http://localhost:3000/api/backtest?period=6m&symbol=BTC/USDT');
    const data: any = await res.json();
    console.log('chartData:', data.chartData ? data.chartData.length : 'none');
    console.log('trades:', data.totalTrades);
    console.log('winRate:', data.winRate);
    console.log('netProfit:', data.netProfit);
}
test();
