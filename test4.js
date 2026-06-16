import { createChart, CandlestickSeries } from 'lightweight-charts';
const div = document.createElement('div');
document.body.appendChild(div);
try {
  const chart = createChart(div, { width: 400, height: 300 });
  const series = chart.addSeries(CandlestickSeries, {});
  console.log("addSeries success");
} catch(e) {
  console.log("addSeries ERR", e.message);
}
try {
  const chart2 = createChart(div, { width: 400, height: 300 });
  const series2 = chart2.addCandlestickSeries({});
  console.log("addCandlestickSeries success");
} catch(e) {
  console.log("addCandlestickSeries ERR", e.message);
}
