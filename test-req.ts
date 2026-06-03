import axios from 'axios';
import crypto from 'crypto';

const apiKey = process.env.BITGET_API_KEY || "bg_c0bb357a72c3fb92fd9b5cb49de3c424";
const secretKey = process.env.BITGET_SECRET_KEY || "ece23d19f8e4a7b113effe079420f05cf9e1b8f433af8063593f40b090c84b45";
const passphrase = process.env.BITGET_PASSPHRASE || "geminibot2026";

function generateSignature(timestamp, method, path, body = "") {
  const message = timestamp + method + path + body;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

async function test() {
  const timestamp = Date.now().toString();
  const endpoint = "/api/v2/mix/order/place-order";
  
  const body = {
    symbol: "ADAUSDT",
    productType: "USDT-FUTURES",
    marginMode: "crossed",
    marginCoin: "USDT",
    size: "1",
    price: "0.5",
    side: "buy",
    tradeSide: "open",
    orderType: "market",
    presetTakeProfitPrice: "2.0",
    presetStopSurplusPrice: "2.0",
    presetTakeLossPrice: "0.1",
    presetStopLossPrice: "0.1"
  };

  const bodyStr = JSON.stringify(body);
  const signature = generateSignature(timestamp, "POST", endpoint, bodyStr);

  try {
    const response = await axios.post(`https://api.bitget.com${endpoint}`, body, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      },
    });
    console.log("Success:", response.data);
  } catch (error) {
    console.log("Error:", error.response?.data || error.message);
  }
}

test();
