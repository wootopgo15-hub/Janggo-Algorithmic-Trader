const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add state for isPaperTrading
content = content.replace(
  'const [isAutoTrade, setIsAutoTrade] = useState(false);',
  'const [isAutoTrade, setIsAutoTrade] = useState(false);\n  const [isPaperTrading, setIsPaperTrading] = useState(true);'
);

// 2. Modify executeTrade
const executeTradeOldStart = 'const executeTrade = async (';
const executeTradeBodyStart = `    tradeSymbol?: string,
  ) => {
    try {
      const activeTp = customTp ?? takeProfit;
      const activeSl = customSl ?? stopLoss;
      const tSymbol = tradeSymbol || symbol;
      const response = await fetch(effectiveApiUrl + "/api/trade/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
          ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
          ...(passphrase ? { "x-bitget-passphrase": passphrase } : {}),
        },
        body: JSON.stringify({
          side,
          symbol: tSymbol,
          amount,
          takeProfit: activeTp,
          stopLoss: activeSl,
        }),
      });

      const contentType = response.headers.get("content-type");
      let data: any = {};

      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        console.error("Trade Execution Non-JSON:", text);
        data = { error: "서버 응답 형식이 올바르지 않습니다." };
      }

      const newLog: TradeLog = {
        id: Math.random().toString(36).substr(2, 9),
        side,
        symbol: tSymbol,
        amount,
        timestamp: new Date().toISOString(),
        status: response.ok ? "SUCCESS" : "FAILED",
        reason: data.error,
        takeProfit: activeTp,
        stopLoss: activeSl,
        entryPrice: data.entryPrice,
        tpPrice: data.tpPrice,
        slPrice: data.slPrice,
        isClose: false,
        pnl: "",
      };`;

const executeTradeBodyNew = `    tradeSymbol?: string,
  ) => {
    try {
      const activeTp = customTp ?? takeProfit;
      const activeSl = customSl ?? stopLoss;
      const tSymbol = tradeSymbol || symbol;
      
      let data: any = {};
      let isSuccess = false;

      if (isPaperTrading) {
        const currentPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : 60000;
        const tpPrice = side === "LONG" ? currentPrice * (1 + Number(activeTp) / 100) : currentPrice * (1 - Number(activeTp) / 100);
        const slPrice = side === "LONG" ? currentPrice * (1 - Number(activeSl) / 100) : currentPrice * (1 + Number(activeSl) / 100);
        
        data = {
          entryPrice: currentPrice,
          tpPrice: tpPrice.toFixed(2),
          slPrice: slPrice.toFixed(2),
          orderId: "PAPER_" + Math.random().toString(36).substr(2, 9),
        };
        isSuccess = true;
      } else {
        const response = await fetch(effectiveApiUrl + "/api/trade/execute", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "x-bitget-api-key": apiKey } : {}),
            ...(secretKey ? { "x-bitget-secret-key": secretKey } : {}),
            ...(passphrase ? { "x-bitget-passphrase": passphrase } : {}),
          },
          body: JSON.stringify({
            side,
            symbol: tSymbol,
            amount,
            takeProfit: activeTp,
            stopLoss: activeSl,
          }),
        });

        const contentType = response.headers.get("content-type");

        if (contentType && contentType.includes("application/json")) {
          data = await response.json();
        } else {
          const text = await response.text();
          console.error("Trade Execution Non-JSON:", text);
          data = { error: "서버 응답 형식이 올바르지 않습니다." };
        }
        isSuccess = response.ok;
      }

      const newLog: TradeLog = {
        id: Math.random().toString(36).substr(2, 9),
        side,
        symbol: tSymbol,
        amount: Math.max(1, Number(amount)).toString(),
        timestamp: new Date().toISOString(),
        status: isSuccess ? "SUCCESS" : "FAILED",
        reason: data.error,
        takeProfit: activeTp,
        stopLoss: activeSl,
        entryPrice: data.entryPrice,
        tpPrice: data.tpPrice,
        slPrice: data.slPrice,
        isClose: false,
        pnl: "",
      };`;

content = content.replace(executeTradeBodyStart, executeTradeBodyNew);

fs.writeFileSync('src/App.tsx', content);

