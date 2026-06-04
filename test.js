import axios from 'axios';
axios.get('https://api.bitget.com/api/v2/mix/market/contracts?productType=USDT-FUTURES').then(res => {
  const eth = res.data.data.find(c => c.symbol === 'ETHUSDT');
  console.log(eth);
})
