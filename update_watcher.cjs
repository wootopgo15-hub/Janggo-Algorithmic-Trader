const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Insert the TP/SL watcher for paper trading right after the spider/grid strategy block or before it
const watcherStartStr = `  // ========== SPIDER / GRID STRATEGY (AUTO TP / SL) ==========`;

const watcherNew = `  // ========== PAPER TRADING (AUTO TP / SL) ==========
  useEffect(() => {
    if (!isPaperTrading || !analysis || paperPositions.length === 0) return;
    
    const currentPrice = analysis.lastPrices[analysis.lastPrices.length - 1];
    if (!currentPrice) return;
    
    setPaperPositions(prev => {
      let updated = [...prev];
      let didClose = false;
      
      for (let i = updated.length - 1; i >= 0; i--) {
        const p = updated[i];
        let shouldClose = false;
        
        if (p.side === "LONG") {
          if (currentPrice >= p.tpPrice || currentPrice <= p.slPrice) shouldClose = true;
        } else {
          if (currentPrice <= p.tpPrice || currentPrice >= p.slPrice) shouldClose = true;
        }
        
        if (shouldClose) {
           const entry = p.entryPrice;
           const amountNum = Number(p.amount);
           let pnl = 0;
           if (p.side === "LONG") {
             pnl = (currentPrice - entry) / entry * amountNum;
           } else {
             pnl = (entry - currentPrice) / entry * amountNum;
           }
           
           setPaperBalance(b => b + pnl);
           
           // Add close log
           setLogs(l => [{
             id: "CLOSE_" + Math.random().toString(36).substr(2, 9),
             side: "CLOSE",
             symbol: p.symbol,
             amount: p.amount.toString(),
             timestamp: new Date().toISOString(),
             status: "SUCCESS",
             entryPrice: entry,
             pnl: pnl.toFixed(4),
             isClose: true,
             isOpenPos: false
           }, ...l].slice(0, 50));
           
           updated.splice(i, 1);
           didClose = true;
        }
      }
      
      return didClose ? updated : prev;
    });
  }, [analysis?.lastPrices, paperPositions, isPaperTrading]);

  // ========== SPIDER / GRID STRATEGY (AUTO TP / SL) ==========`;

content = content.replace(watcherStartStr, watcherNew);

fs.writeFileSync(file, content);
