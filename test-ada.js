fetch('http://localhost:3000/api/backtest?symbol=BTC/USDT&period=3m').then(r => r.json()).then(d => {
    console.log("BTC Net:", d.netProfit, "WinRate:", d.winRate);
    let phases = {};
    d.recentTrades.forEach(tr => {
        if (!tr.isPartial) {
            phases[tr.phase] = (phases[tr.phase] || 0) + 1;
        }
    });
    console.log("BTC Entry Phases:", phases);
}).catch(console.error);
