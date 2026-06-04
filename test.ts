import axios from "axios";
import { RSI } from "technicalindicators";

async function test() {
  const url = 'https://api.bitget.com/api/v2/mix/market/candles';
  const res = await axios.get(url, { params: { symbol: 'BTCUSDT', productType: 'USDT-FUTURES', granularity: '15m', limit: 1000 }});
  
  let data = res.data.data;
  data = data.map((c: any) => ({ close: parseFloat(c[4]) })).reverse();
  
  const closes = data.map((d: any) => d.close);
  const rsi = RSI.calculate({ values: closes, period: 14 });
  
  console.log('Candles fetched:', closes.length);
  console.log('Latest close:', closes[closes.length - 1]);
  console.log('Last 5 RSI:', rsi.slice(-5));
}
test();
