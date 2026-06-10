const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            stats.unrealizedPL >= 0
                              ? "text-emerald-500/70"
                              : "text-rose-500/70",
                          )}
                        >
                          (Open: {stats.unrealizedPL > 0 ? "+" : ""}
                          {(stats.unrealizedPL || 0).toFixed(2)})
                        </span>`;

const newStr = `                        <span
                          className={cn(
                            "text-[10px] font-mono",
                            isPaperTrading 
                              ? (paperPositions.reduce((sum, p) => {
                                  const cPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : p.entryPrice;
                                  const pl = p.side === "LONG" 
                                    ? (cPrice - p.entryPrice) / p.entryPrice * Number(p.amount)
                                    : (p.entryPrice - cPrice) / p.entryPrice * Number(p.amount);
                                  return sum + pl;
                                }, 0) >= 0 ? "text-emerald-500/70" : "text-rose-500/70")
                              : (stats.unrealizedPL >= 0 ? "text-emerald-500/70" : "text-rose-500/70")
                          )}
                        >
                          (Open: {isPaperTrading ? (
                            (() => {
                              const upnl = paperPositions.reduce((sum, p) => {
                                  const cPrice = analysis?.lastPrices ? analysis.lastPrices[analysis.lastPrices.length - 1] : p.entryPrice;
                                  const pl = p.side === "LONG" 
                                    ? (cPrice - p.entryPrice) / p.entryPrice * Number(p.amount)
                                    : (p.entryPrice - cPrice) / p.entryPrice * Number(p.amount);
                                  return sum + pl;
                              }, 0);
                              return \`\${upnl > 0 ? "+" : ""}\${upnl.toFixed(2)}\`;
                            })()
                          ) : (
                            \`\${stats.unrealizedPL > 0 ? "+" : ""}\${(stats.unrealizedPL || 0).toFixed(2)}\`
                          )})
                        </span>`;

content = content.replace(targetStr, newStr);

fs.writeFileSync(file, content);
