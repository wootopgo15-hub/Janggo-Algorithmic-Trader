const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// The replacement logic for executeTrade
const targetStr = `      if (isPaperTrading) {
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
      } else {`;

// We'll replace the paper trading block with more advanced logic.
const newPaperLogic = `      if (isPaperTrading) {
        const currentPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : 60000;
        const tpPrice = side === "LONG" ? currentPrice * (1 + Number(activeTp) / 100) : currentPrice * (1 - Number(activeTp) / 100);
        const slPrice = side === "LONG" ? currentPrice * (1 - Number(activeSl) / 100) : currentPrice * (1 + Number(activeSl) / 100);
        
        // Handle existing opposite position
        setPaperPositions(prev => {
           let updated = [...prev];
           const existingIdx = updated.findIndex(p => p.symbol === tSymbol);
           
           if (existingIdx !== -1) {
             const existing = updated[existingIdx];
             if (existing.side !== side) {
               // Close opposite position
               const entry = existing.entryPrice;
               const amountNum = Number(existing.amount);
               let pnl = 0;
               if (existing.side === "LONG") {
                 pnl = (currentPrice - entry) / entry * amountNum;
               } else {
                 pnl = (entry - currentPrice) / entry * amountNum;
               }
               
               setPaperBalance(b => b + pnl);
               
               // Add close log
               setLogs(l => [{
                 id: "CLOSE_" + Math.random().toString(36).substr(2, 9),
                 side: "CLOSE",
                 symbol: tSymbol,
                 amount: existing.amount.toString(),
                 timestamp: new Date().toISOString(),
                 status: "SUCCESS",
                 entryPrice: entry,
                 pnl: pnl.toFixed(4),
                 isClose: true,
                 isOpenPos: false
               }, ...l].slice(0, 50));
               
               updated.splice(existingIdx, 1);
             } else {
               // Same side, ignore or average up. Let's ignore for simple mock
               console.log("Already holding", side, "for", tSymbol);
             }
           }
           
           // Open new position
           const hasPos = updated.find(p => p.symbol === tSymbol);
           if (!hasPos) {
             updated.push({
               id: "PAPER_" + Math.random().toString(36).substr(2, 9),
               symbol: tSymbol,
               side,
               amount: amount,
               entryPrice: currentPrice,
               tpPrice,
               slPrice
             });
           }
           return updated;
        });

        data = {
          entryPrice: currentPrice,
          tpPrice: tpPrice.toFixed(2),
          slPrice: slPrice.toFixed(2),
          orderId: "PAPER_NEW",
        };
        isSuccess = true;
      } else {`;

content = content.replace(targetStr, newPaperLogic);

// We need a way to display Paper Balance when Paper trading.
// Current Wallet Balance display
const walletBalanceStr = `                      <span className="text-xl font-bold text-white font-mono">
                        {stats.currentEquity !== null
                          ? \`$\${stats.currentEquity.toFixed(2)}\`
                          : "---"}
                      </span>`;
const walletBalanceNew = `                      <span className="text-xl font-bold text-white font-mono">
                        {isPaperTrading 
                          ? \`$\${paperBalance.toFixed(2)}\`
                          : (stats.currentEquity !== null
                              ? \`$\${stats.currentEquity.toFixed(2)}\`
                              : "---")}
                      </span>`;
content = content.replace(walletBalanceStr, walletBalanceNew);

// And unrealized PnL for paper trading
const upnlStr = `                      <span
                        className={cn(
                          "text-xl font-bold font-mono",
                          stats.unrealizedPL >= 0
                            ? "text-emerald-500"
                            : "text-rose-500",
                        )}
                      >
                        {stats.unrealizedPL > 0 ? "+" : ""}
                        {(stats.unrealizedPL || 0).toFixed(2)}
                      </span>`;

const upnlNew = `                      <span
                        className={cn(
                          "text-xl font-bold font-mono",
                          isPaperTrading 
                            ? (paperPositions.reduce((sum, p) => {
                                const currentPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : p.entryPrice;
                                const pnl = p.side === "LONG" 
                                  ? (currentPrice - p.entryPrice) / p.entryPrice * Number(p.amount)
                                  : (p.entryPrice - currentPrice) / p.entryPrice * Number(p.amount);
                                return sum + pnl;
                              }, 0) >= 0 ? "text-emerald-500" : "text-rose-500")
                            : (stats.unrealizedPL >= 0 ? "text-emerald-500" : "text-rose-500"),
                        )}
                      >
                        {isPaperTrading ? (
                          (() => {
                            const upnl = paperPositions.reduce((sum, p) => {
                                const currentPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : p.entryPrice;
                                const pnl = p.side === "LONG" 
                                  ? (currentPrice - p.entryPrice) / p.entryPrice * Number(p.amount)
                                  : (p.entryPrice - currentPrice) / p.entryPrice * Number(p.amount);
                                return sum + pnl;
                            }, 0);
                            return \`\${upnl > 0 ? "+" : ""}\${upnl.toFixed(2)}\`;
                          })()
                        ) : (
                           \`\${stats.unrealizedPL > 0 ? "+" : ""}\${(stats.unrealizedPL || 0).toFixed(2)}\`
                        )}
                      </span>`;
content = content.replace(upnlStr, upnlNew);

fs.writeFileSync(file, content);
