import axios from 'axios';

axios.post('http://localhost:3000/api/trade/execute', {
  side: "LONG",
  symbol: "BTCUSDT",
  amount: "15"
}).then(res => console.log("SUCCESS:", res.data))
  .catch(err => {
    if (err.response) console.log("ERROR:", err.response.data);
    else console.log("ERROR:", err.message);
  });
