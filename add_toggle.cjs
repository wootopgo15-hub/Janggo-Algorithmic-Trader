const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `                    <div
                      onClick={() => setIsAutoTrade(!isAutoTrade)}
                      className={cn(
                        "w-10 h-5 rounded-full cursor-pointer transition-all relative border border-[#30363d]",
                        isAutoTrade ? "bg-emerald-500" : "bg-[#21262d]",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all",
                          isAutoTrade ? "left-[22px]" : "left-1",
                        )}
                      />
                    </div>
                  </div>`;

// First check what the existing string is.
if (content.includes('left-5.5')) {
  content = content.replace('left-5.5', 'left-[22px]');
}

const autoTradeToggleBlock = `                    <div
                      onClick={() => setIsAutoTrade(!isAutoTrade)}
                      className={cn(
                        "w-10 h-5 rounded-full cursor-pointer transition-all relative border border-[#30363d]",
                        isAutoTrade ? "bg-emerald-500" : "bg-[#21262d]",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all",
                          isAutoTrade ? "left-[22px]" : "left-1",
                        )}
                      />
                    </div>
                  </div>`;

const newBlock = `                    <div
                      onClick={() => setIsAutoTrade(!isAutoTrade)}
                      className={cn(
                        "w-10 h-5 rounded-full cursor-pointer transition-all relative border border-[#30363d]",
                        isAutoTrade ? "bg-emerald-500" : "bg-[#21262d]",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all",
                          isAutoTrade ? "left-[22px]" : "left-1",
                        )}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-[#30363d] mt-4">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Gamepad2 className="w-4 h-4 text-purple-500" />
                      Paper Trading (모의 투자)
                    </h3>
                    <div
                      onClick={() => setIsPaperTrading(!isPaperTrading)}
                      className={cn(
                        "w-10 h-5 rounded-full cursor-pointer transition-all relative border border-[#30363d]",
                        isPaperTrading ? "bg-purple-500" : "bg-[#21262d]",
                      )}
                    >
                      <div
                        className={cn(
                          "absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all",
                          isPaperTrading ? "left-[22px]" : "left-1",
                        )}
                      />
                    </div>
                  </div>`;

content = content.replace(autoTradeToggleBlock, newBlock);

// ensure Gamepad2 is imported from lucide-react
if (content.includes('Gamepad2') && !content.includes('Gamepad2,')) {
    content = content.replace('Zap,', 'Zap, Gamepad2,');
}

fs.writeFileSync(file, content);
