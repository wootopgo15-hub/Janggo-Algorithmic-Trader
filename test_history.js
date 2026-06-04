import axios from 'axios';
import crypto from 'crypto';

const apiKey = process.env.BITGET_API_KEY || ''; // Add here if needed
const secretKey = process.env.BITGET_SECRET_KEY || '';
const passphrase = process.env.BITGET_PASSPHRASE || '';

const endpoint = "/api/v2/mix/position/history-position?productType=USDT-FUTURES&symbol=ETHUSDT";
const timestamp = Date.now().toString();
const message = timestamp + "GET" + endpoint;
const signature = crypto.createHmac("sha256", secretKey).update(message).digest("base64");

axios.get(`https://api.bitget.com${endpoint}`, {
  headers: {
    "ACCESS-KEY": apiKey,
    "ACCESS-SIGN": signature,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  }
}).then(res => {
  console.log(res.data.data);
}).catch(console.error);
