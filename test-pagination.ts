import ccxt from 'ccxt';

async function test() {
    const exchange = new ccxt.bitget({ enableRateLimit: true, options: { defaultType: 'swap' }});
    const now = Date.now();
    let since = now - (180 * 24 * 60 * 60 * 1000); // 180 days ago
    
    let allOhlcv: any[] = [];
    let fetchCount = 0;
    while (since < now && fetchCount < 20) {
      const ohlcv = await exchange.fetchOHLCV('BTC/USDT:USDT', '15m', since, 1000);
      if (!ohlcv || ohlcv.length === 0) {
        console.log(`fetchCount ${fetchCount}: no more data`);
        break;
      }
      console.log(`fetchCount ${fetchCount}: returned ${ohlcv.length} candles, first ${new Date(ohlcv[0][0]).toISOString()}, last ${new Date(ohlcv[ohlcv.length-1][0]).toISOString()}`);
      allOhlcv = allOhlcv.concat(ohlcv);
      const lastCandleTime = ohlcv[ohlcv.length - 1][0];
      
      if (lastCandleTime >= since) {
         since = lastCandleTime + 1;
      } else {
         break;
      }
      fetchCount++;
    }
}
test();
