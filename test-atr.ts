import { ATR } from 'technicalindicators';

const high = [10, 11, 10];
const low = [9, 9, 8];
const close = [9.5, 10, 9];

const atr = ATR.calculate({
  high, low, close, period: 2
});

console.log(atr);
