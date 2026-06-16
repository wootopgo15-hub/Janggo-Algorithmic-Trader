import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget();
  await client.loadMarkets();
  const market = client.markets['XRP/USDT:USDT'];
  console.log("XRP limits:", JSON.stringify(market.limits, null, 2));
  console.log("XRP precision:", JSON.stringify(market.precision, null, 2));
}
test().catch(console.error);
