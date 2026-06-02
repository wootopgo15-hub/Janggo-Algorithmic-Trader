import crypto from "crypto";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const apiKey = "bg_c0bb357a72c3fb92fd9b5cb49de3c424";
const secretKey = process.env.BITGET_SECRET_KEY || "ece23d19f8e4a7b113effe079420f05cf9e1b8f433af8063593f40b090c84b45";
const passphrase = process.env.BITGET_PASSPHRASE || "geminibot2026";

async function run() {
  const endpoint = "/api/v2/mix/position/history-position?productType=USDT-FUTURES&startTime=" + (Date.now() - 30 * 24 * 60 * 60 * 1000).toString();
  const timestamp = Date.now().toString();
  const message = timestamp + "GET" + endpoint;
  const signature = crypto.createHmac("sha256", secretKey).update(message).digest("base64");

  try {
    const res = await axios.get(`https://api.bitget.com${endpoint}`, {
      headers: {
        "ACCESS-KEY": apiKey,
        "ACCESS-SIGN": signature,
        "ACCESS-TIMESTAMP": timestamp,
        "ACCESS-PASSPHRASE": passphrase,
        "Content-Type": "application/json",
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e: any) {
    console.error(e.response?.data || e.message);
  }
}
run();
