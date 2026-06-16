import * as ccxt from 'ccxt';

async function test() {
  const exchange = new ccxt.pro.bitget({
    enableRateLimit: true,
    options: { defaultType: 'swap' }
  });
  const symbol = 'BTC/USDT:USDT';
  try {
     const ohlcv = await exchange.watchOHLCV(symbol, '1m');
     console.log('Success:', ohlcv.length);
  } catch (e) {
     console.error('Error:', e);
  }
  process.exit(0);
}
test().catch(console.error);
