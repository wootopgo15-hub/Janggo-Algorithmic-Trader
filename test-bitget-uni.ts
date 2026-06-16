import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget({
    apiKey: process.env.BITGET_API_KEY || 'bg_eaca935ac85c96b7cd97ef2c9540b64d',
    secret: process.env.BITGET_API_SECRET || 'f1a92a54b3ccde42142e0a2d21650bbee596a24aa747db55dcaeda5804aa508d',
    password: process.env.BITGET_PASSPHRASE || 'Wkd1234!',
    options: { defaultType: 'swap' }
  });
  
  // Force unilateral mode
  try {
    await client.setPositionMode(false, 'BTC/USDT:USDT');
  } catch(e) {}
  
  try {
    const params = { hedged: false, oneWayMode: true, marginMode: 'cross' };
    const res = await client.createMarketOrder('BTC/USDT:USDT', 'buy', 0.001, params);
    console.log("Success Unilateral:", res.id);
  } catch(e:any) {
    console.error("Unilateral error:", e.message);
  }
}
test().catch(console.error);
