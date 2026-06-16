import * as lwc from 'lightweight-charts';
console.log("Keys:", Object.keys(lwc).join(", "));
if (lwc.CandlestickSeries) console.log("CandlestickSeries is:", typeof lwc.CandlestickSeries);
