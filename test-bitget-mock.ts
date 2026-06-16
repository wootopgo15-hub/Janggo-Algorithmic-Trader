import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget({ apiKey: 'fake', secret: 'fake', password: 'fake' });
  client.markets = {'BTC/USDT:USDT': { id: 'BTCUSDT', symbol: 'BTC/USDT:USDT', type: 'swap', swap: true, linear: true, future: true, settleId: 'USDT', active: true, precision: { amount: 0.001, price: 0.1 }, contractSize: 1 }};
  
  console.log('--- Hedge Open Short ---');
  try {
    const req2 = client.createOrderRequest('BTC/USDT:USDT', 'market', 'sell', 1.5, undefined, { hedged: true, marginMode: 'cross', reduceOnly: false });
    console.log("Using 'sell' without reduceOnly:", req2);
  } catch(e:any){}
}
test().catch(console.error);
