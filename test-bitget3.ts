import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget();
  await client.loadMarkets();
  console.log("XRP precision:", client.markets['XRP/USDT:USDT'].precision.amount);
  console.log("BTC precision:", client.markets['BTC/USDT:USDT'].precision.amount);
}
test().catch(console.error);
