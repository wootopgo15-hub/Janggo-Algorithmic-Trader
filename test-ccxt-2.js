import ccxt from 'ccxt';
const exchange = new ccxt.bitget({ enableRateLimit: true, options: { defaultType: 'swap' } });
exchange.fetchOHLCV('BTC/USDT:USDT', '1m', undefined, 10).then(res => console.log('success', res.length)).catch(e => console.error('fetchOHLCV error:', e.message));
