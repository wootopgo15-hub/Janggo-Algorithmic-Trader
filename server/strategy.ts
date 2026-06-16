export interface Candlestick {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class StrategyEngine {
  // A. Uptrend Logic
  // ADX > 25, 50 EMA > 200 EMA (정배열)
  // Stochastic K-D <= 20 Golden Cross + Volume > 2x
  public evaluateUptrend(candles: Candlestick[]) {
     const adx = this.calculateADX(candles);
     const { ema50, ema200 } = this.calculateEMAs(candles);
     const { stochK, stochD } = this.calculateStoch(candles);
     const currentVolume = candles[candles.length - 1].volume;
     const avgVolume = this.calculateAvgVolume(candles);

     if (adx > 25 && ema50 > ema200) {
       if (stochK <= 20 && stochD <= 20 && stochK > stochD /* Golden cross proxy */) {
         if (currentVolume > avgVolume * 2) {
           return { signal: 'LONG', reason: 'Uptrend setup met' };
         }
       }
     }
     return { signal: 'PASS' };
  }

  // B. Downtrend Logic
  // ADX > 25, 50 EMA < 200 EMA (역배열)
  // Stochastic K-D >= 80 Dead Cross + Volume > 2x
  public evaluateDowntrend(candles: Candlestick[]) {
    const adx = this.calculateADX(candles);
    const { ema50, ema200 } = this.calculateEMAs(candles);
    const { stochK, stochD } = this.calculateStoch(candles);
    const currentVolume = candles[candles.length - 1].volume;
    const avgVolume = this.calculateAvgVolume(candles);

    if (adx > 25 && ema50 < ema200) {
      if (stochK >= 80 && stochD >= 80 && stochK < stochD /* Dead cross proxy */) {
        if (currentVolume > avgVolume * 2) {
          return { signal: 'SHORT', reason: 'Downtrend setup met' };
        }
      }
    }
    return { signal: 'PASS' };
  }

  // C. Sideways Logic & Fibonacci
  // ADX < 25, Price tightly crossing 200 EMA, BB squeeze
  // Fib 0.382 bounce for Long. Exit 0.618
  public evaluateSideways(candles: Candlestick[]) {
     const adx = this.calculateADX(candles);
     if (adx >= 25) return { signal: 'PASS' };

     const high = Math.max(...candles.slice(-20).map(c => c.high));
     const low = Math.min(...candles.slice(-20).map(c => c.low));
     const fib0382 = low + (high - low) * 0.382;
     const fib0618 = low + (high - low) * 0.618;
     
     const currentPrice = candles[candles.length - 1].close;

     // Bouncing off 0.382 
     if (currentPrice > fib0382 && currentPrice < fib0382 * 1.01) { // Pseudo proxy for bounce
         return { signal: 'LONG', target: fib0618, reason: 'Fib bounce' };
     }

     return { signal: 'PASS' };
  }

  // Trailing Stop & Exit Logic (5x Lev, Max Loss $10)
  public calculateExits(entryPrice: number, currentPrice: number, isLong: boolean) {
     const pnlPct = isLong ? (currentPrice - entryPrice) / entryPrice * 100 : (entryPrice - currentPrice) / entryPrice * 100;
     
     // Target A: +3% -> Exit if retraces 1.08%
     if (pnlPct >= 3 && pnlPct < 5) {
        return { action: 'TRAIL_ACTIVE', trigger: 1.08 };
     }
     
     // Target B: +5% -> 50% TP, trail remaining 2%
     if (pnlPct >= 5) {
        return { action: 'PARTIAL_TP', tralingTrigger: 2.0 };
     }
     
     // Stop Loss
     // Absolute loss max $10 logic will be handled by position sizing orchestrator
     return { action: 'HOLD' };
  }

  // Helpers (Dummy implementations for structural reference)
  private calculateADX(c: Candlestick[]) { return Math.random() * 40; }
  private calculateEMAs(c: Candlestick[]) { return { ema50: 105, ema200: 100 }; }
  private calculateStoch(c: Candlestick[]) { return { stochK: 15, stochD: 10 }; }
  private calculateAvgVolume(c: Candlestick[]) { return 1000; }
}
