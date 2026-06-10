const fs = require('fs');
const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

// The tricky part with multi-line regex is ensuring we don't accidentally match too much.
// We start at `<div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500">`
// We want to delete up to `                  {/* Strategy Explanation Card */}` and its following grids up to `</>`

const startStr = `<div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500">`;
const endStr = `</>
              )}
            </motion.div>`;

const startIdx = content.indexOf(startStr);
const endIdx = content.indexOf(endStr);

if (startIdx !== -1 && endIdx !== -1) {
    const newContent = `                      <div className="mt-6 flex items-center gap-4 text-xs font-mono text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Heikin-Ashi:</span>
                          <span className="text-white">
                            {analysis?.indicators15m
                              ? analysis.indicators15m.haCloses[
                                  analysis.indicators15m.haCloses.length - 1
                                ]?.toFixed(2)
                              : "--"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 ml-4">
                          <span className="text-slate-400">SMA(20):</span>
                          <span className="text-blue-400">
                            {analysis?.indicators15m
                              ? analysis.indicators15m.sma[
                                  analysis.indicators15m.sma.length - 1
                                ]?.toFixed(2)
                              : "--"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Strategy Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                      <h3 className="text-sm font-bold text-emerald-500 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" />
                        LONG Entry Checklist
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            직전 캔들 종가 &lt; SMA (하단 위치)
                          </span>
                          {analysis &&
                          analysis.indicators15m &&
                          analysis.indicators15m.haCloses[
                            analysis.indicators15m.haCloses.length - 2
                          ] <
                            analysis.indicators15m.sma[
                              analysis.indicators15m.sma.length - 2
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            현재 캔들 종가 &gt; SMA (골든 크로스 돌파)
                          </span>
                          {analysis &&
                          analysis.indicators15m &&
                          analysis.indicators15m.haCloses[
                            analysis.indicators15m.haCloses.length - 1
                          ] >
                            analysis.indicators15m.sma[
                              analysis.indicators15m.sma.length - 1
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                              <Play className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
                      <h3 className="text-sm font-bold text-rose-500 mb-4 flex items-center gap-2">
                        <TrendingDown className="w-4 h-4" />
                        SHORT Entry Checklist
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            직전 캔들 종가 &gt; SMA (상단 위치)
                          </span>
                          {analysis &&
                          analysis.indicators15m &&
                          analysis.indicators15m.haCloses[
                            analysis.indicators15m.haCloses.length - 2
                          ] >
                            analysis.indicators15m.sma[
                              analysis.indicators15m.sma.length - 2
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
                              <Square className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                        <div className="flex items-center justify-between p-3 bg-[#0d1117] rounded-xl border border-[#30363d]">
                          <span className="text-xs text-slate-400">
                            현재 캔들 종가 &lt; SMA (데드 크로스 하향)
                          </span>
                          {analysis &&
                          analysis.indicators15m &&
                          analysis.indicators15m.haCloses[
                            analysis.indicators15m.haCloses.length - 1
                          ] <
                            analysis.indicators15m.sma[
                              analysis.indicators15m.sma.length - 1
                            ] ? (
                            <div className="w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center">
                              <Square className="w-3 h-3 text-white fill-current" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-6">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 h-[400px]">
                      <h3 className="text-xs font-mono text-slate-500 mb-4 uppercase tracking-widest flex items-center justify-between">
                        15m Heikin-Ashi & SMA (20) Chart
                      </h3>
                      <ResponsiveContainer
                        width="100%"
                        height="90%"
                        minWidth={1}
                        minHeight={1}
                      >
                        <ComposedChart data={chartData}>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="#30363d"
                            vertical={false}
                          />
                          <XAxis dataKey="time" hide />
                          <YAxis 
                            domain={["auto", "auto"]} 
                            tick={{ fill: "#4b5563", fontSize: 10 }}
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#0d1117",
                              border: "1px solid #30363d",
                              borderRadius: "8px",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="haClose"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            dot={false}
                            name="HA Close"
                          />
                          <Line
                            type="monotone"
                            dataKey="sma"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                            name="SMA (20)"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Strategy Explanation Card */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Info className="w-4 h-4 text-blue-500" />
                        How to LONG (Buy)
                      </h4>
                      <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                        <li>
                          하이킨아시 캔들 종가가 SMA 선{" "}
                          <span className="text-emerald-500 font-bold">
                            아래
                          </span>
                          에 위치하다가
                        </li>
                        <li>
                          현재 캔들 종가가 SMA 선을{" "}
                          <span className="text-emerald-500 font-bold">
                            상향 돌파 (Golden Cross)
                          </span>
                          할 때 매수
                        </li>
                      </ul>
                    </div>
                    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 space-y-4">
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <Info className="w-4 h-4 text-rose-500" />
                        How to SHORT (Sell)
                      </h4>
                      <ul className="text-xs text-slate-400 space-y-2 list-disc pl-4">
                        <li>
                           하이킨아시 캔들 종가가 SMA 선{" "}
                          <span className="text-rose-500 font-bold">
                            위
                          </span>
                          에 위치하다가
                        </li>
                        <li>
                          현재 캔들 종가가 SMA 선을{" "}
                          <span className="text-rose-500 font-bold">
                            하향 돌파 (Dead Cross)
                          </span>
                          할 때 매도
                        </li>
                      </ul>
                    </div>
                  </div>
                ` + endStr;
    const finalContent = content.substring(0, startIdx) + newContent + content.substring(endIdx + endStr.length);
    fs.writeFileSync(file, finalContent);
} else {
  console.error("Tags not found");
}
