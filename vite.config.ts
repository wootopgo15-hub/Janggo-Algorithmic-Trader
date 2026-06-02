import axios from 'axios';
import crypto from 'crypto';

const apiKey = "bg_c0bb357a72c3fb92fd9b5cb49de3c424";
const secretKey = "ece23d19f8e4a7b113effe079420f05cf9e1b8f433af8063593f40b090c84b45";
const passphrase = "geminibot2026";

function getBitgetHeaders(endpoint: string, method: string = "GET", body: string = "") {
  const timestamp = Date.now().toString();
  const message = timestamp + method + endpoint + body;
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("base64");
  return {
    "ACCESS-KEY": apiKey,
    "ACCESS-SIGN": signature,
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
}

const endpoint = "/api/v2/mix/account/accounts?productType=USDT-FUTURES";
axios.get(`https://api.bitget.com${endpoint}`, {
  headers: getBitgetHeaders(endpoint)
}).then(res => console.log("SUCCESS:", JSON.stringify(res.data, null, 2)))
  .catch(err => console.error("ERROR:", err.response ? err.response.data : err.message));
