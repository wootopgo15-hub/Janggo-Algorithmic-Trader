import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget({ apiKey: 'fake', secret: 'fake', password: 'fake' });
  client.markets = {'BTC/USDT:USDT': { id: 'BTCUSDT', symbol: 'BTC/USDT:USDT', type: 'swap', swap: true, linear: true, future: true, settleId: 'USDT', active: true, precision: { amount: 0.001, price: 0.1 }, contractSize: 1 }};
  
  console.log('--- Unilateral Open Long with Stop Loss ---');
  try {
    const req1 = client.createOrderRequest('BTC/USDT:USDT', 'market', 'buy', 1.5, undefined, { hedged: false, oneWayMode: true, marginMode: 'cross', reduceOnly: false, presetStopLossPrice: 50000 });
    console.log(req1);
  } catch(e:any){
    console.error(e);
  }
}
test().catch(console.error);
