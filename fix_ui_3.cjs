const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

const startStr = `<div className="grid grid-cols-2 gap-3 mb-2">`;
const endStr = `                      </div>
                    </div>

                    <div className="space-y-1.5">`;

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    const newContent = `<div className="grid grid-cols-1 gap-3 mb-2">
                      {/* 15m Indicators */}
                      <div className="flex flex-col bg-[#0d1117] border border-[#30363d] p-3 rounded-xl justify-center relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-purple-500/10 text-purple-400 text-[9px] px-1.5 py-0.5 rounded-bl-lg font-bold">
                          15m
                        </div>
                        <span className="text-xs text-slate-400 font-mono mb-1 mt-2">
                          HA 종가 & SMA(20)
                        </span>
                        <div className="flex items-center justify-between">
                          <span className="text-lg font-mono font-bold flex items-center text-slate-200">
                            {analysis?.indicators15m ? (
                              analysis.indicators15m.haCloses[
                                analysis.indicators15m.haCloses.length - 1
                              ].toFixed(2)
                            ) : (
                              <RefreshCw className="w-4 h-4 animate-spin opacity-50" />
                            )}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-mono font-bold uppercase",
                              analysis?.indicators15m &&
                                analysis.indicators15m.haCloses[
                                  analysis.indicators15m.haCloses.length - 1
                                ] >
                                analysis.indicators15m.sma[
                                  analysis.indicators15m.sma.length - 1
                                ]
                                  ? "text-emerald-400"
                                  : "text-rose-400",
                            )}
                          >
                            {analysis?.indicators15m
                                ? analysis.indicators15m.haCloses[
                                    analysis.indicators15m.haCloses.length - 1
                                  ] >
                                  analysis.indicators15m.sma[
                                    analysis.indicators15m.sma.length - 1
                                  ]
                                  ? "UP"
                                  : "DOWN"
                              : ""}
                          </span>
                        </div>
`;
    const finalContent = content.substring(0, startIdx) + newContent + content.substring(endIdx);
    fs.writeFileSync(file, finalContent.replace("자동 매매는 RSI/MACD 변동 시 즉시 체결됩니다. 수수료", "자동 매매는 Heikin-Ashi와 SMA 변동 시 즉시 체결됩니다. 수수료"));
} else {
    console.error("Not found");
}
