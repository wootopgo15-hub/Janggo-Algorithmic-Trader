import ccxt from 'ccxt';
async function test() {
  const client = new ccxt.bitget({
    apiKey: process.env.BITGET_API_KEY || 'bg_eaca935ac85c96b7cd97ef2c9540b64d',
    secret: process.env.BITGET_API_SECRET || 'f1a92a54b3ccde42142e0a2d21650bbee596a24aa747db55dcaeda5804aa508d',
    password: process.env.BITGET_PASSPHRASE || 'Wkd1234!',
    options: { defaultType: 'swap' }
  });
  // set position mode to one-way
  try { await client.setPositionMode(false, 'XRP/USDT:USDT'); } catch(e){}
  
  try {
    const params = { };
    const res = await client.createMarketOrder('XRP/USDT:USDT', 'buy', 10, params);
    console.log("Success with {}: ", res.id);
  } catch (e: any) {
    console.error("Failed with {}: ", e.message);
  }
}
test().catch(console.error);
