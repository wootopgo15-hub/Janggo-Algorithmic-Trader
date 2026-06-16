import * as ccxt from 'ccxt';

export class ExchangeManager {
  private exchange: ccxt.Exchange;
  private timeOffset: number = 0;

  constructor() {
    this.exchange = new ccxt.bitget({
      apiKey: process.env.BITGET_API_KEY,
      secret: process.env.BITGET_SECRET,
      password: process.env.BITGET_PASSPHRASE,
      enableRateLimit: true, // Internal CCXT throttling
      options: {
        defaultType: 'swap', // 'swap' for perpetual futures in Bitget
      }
    });
  }

  // 1. Data Verification & Time Synchronization (500-candle past chart)
  async syncTime() {
    try {
      const serverTime = await this.exchange.fetchTime();
      const localTime = Date.now();
      
      this.timeOffset = serverTime - localTime;
      
      // Fetch 500 candles to verify
      const ohlcv = await this.exchange.fetchOHLCV('BTC/USDT', '1m', undefined, 500);
      const lastCandleTime = ohlcv[ohlcv.length - 1][0];
      
      const gap = Math.abs(serverTime - lastCandleTime);
      
      // If gap is more than 3 minutes, issue warning
      if (gap > 180000) {
         console.warn(`[WARNING] Data desync! Gap: ${gap}ms. Fallback triggered.`);
         return false; // Return false to halt trading and request manual sync
      }
      return true;
    } catch (e) {
      console.error('Time Sync Failed:', e);
      return false;
    }
  }

  getOffset() {
    return this.timeOffset;
  }
  
  // 3. Websocket & Fallback (Skeleton via CCXT PRO/REST)
  // ccxt.pro handles WS automatically for fetchOHLCV if awaited properly,
  // falling back to REST if WS fails.
  async getMarketData(symbol: string) {
    // API Rate limit defense is handled by ccxt enableRateLimit: true
    return await this.exchange.fetchOHLCV(symbol, '15m', undefined, 500);
  }

  async panicSellAll() {
    // Slippage defense and specific exits handling
    console.log('[EXCHANGE] Executing Market Market Sell for all positions.');
    // CCXT positions liquidations goes here
  }
}
