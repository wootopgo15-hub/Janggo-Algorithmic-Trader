const fs = require('fs');

const file = 'src/App.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\{\/\* 5m timeframe \*\/.*?(?=<\/div>\s*<\/div>\s*<\/div>\s*\)\})/s, `
                {/* 15m timeframe Heikin-Ashi */}
                <div className="bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
                  <h4 className="text-[10px] uppercase font-mono text-slate-500 mb-2">
                    15분 봉 (15m Timeframe) - Heikin-Ashi & 20 SMA
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#0a0c10] p-4 rounded-xl border border-[#30363d]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-mono text-slate-500">
                          Heikin-Ashi 종가
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono text-white">
                        {analysis?.indicators15m
                          ? analysis.indicators15m.haCloses[
                              analysis.indicators15m.haCloses.length - 1
                            ]?.toFixed(2)
                          : "--"}
                      </div>
                    </div>

                    <div className="bg-[#0a0c10] p-4 rounded-xl border border-[#30363d]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] uppercase font-mono text-slate-500">
                          20 SMA
                        </span>
                      </div>
                      <div className="text-xl font-bold font-mono text-white">
                        {analysis?.indicators15m
                          ? analysis.indicators15m.sma[
                              analysis.indicators15m.sma.length - 1
                            ]?.toFixed(2)
                          : "--"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-[#21262d] border border-[#30363d] p-4 rounded-xl">
                  <h4 className="text-[10px] uppercase font-mono text-slate-500 mb-2">
                    Combined Signal Logic
                  </h4>
                  <p className="text-sm text-slate-300 leading-relaxed font-mono">
                    <span className="text-emerald-400 font-bold">
                      LONG 진입 조건:
                    </span>{" "}
                    직전 캔들 종가가 SMA 아래에 있었고, 현재 종가가 SMA 상향 돌파 (골든 크로스)
                    <br />
                    <span className="text-rose-400 font-bold mt-1 inline-block">
                      SHORT 진입 조건:
                    </span>{" "}
                    직전 캔들 종가가 SMA 위에 있었고, 현재 종가가 SMA 하향 돌파 (데드 크로스)
                    <br />
                    <br />
                    <strong>현재 예측된 최종 포지션: </strong>
                    {analysis ? (
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded font-bold ml-1",
                          analysis.decision === "LONG"
                            ? "bg-emerald-500/20 text-emerald-500"
                            : analysis.decision === "SHORT"
                              ? "bg-rose-500/20 text-rose-500"
                              : "bg-slate-500/20 text-slate-400",
                        )}
                      >
                        {analysis.decision}
                      </span>
                    ) : (
                      <span className="text-slate-500 ml-1">계산 중...</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
`);

content = content.replace(/STRATEGY_RULES: RSI_OVERSOLD_EXIT.*?SHORT/s, "STRATEGY_RULES: HEIKIN_ASHI_CLOSE CROSSES_ABOVE SMA(20) == LONG | HEIKIN_ASHI_CLOSE CROSSES_BELOW SMA(20) == SHORT");

// Also replace the rest of 'RSI' / 'MACD' mentions in the UI like tooltips or strategy blocks.
content = content.replace(/15분 RSI &lt;= 34 &amp; 15분 MACD 하락 에너지 감소 동시 만족/g, "직전 캔들 종가가 SMA 아래 -> 현재 종가가 SMA 위로 돌파");
content = content.replace(/15분 RSI &gt;= 67 &amp; 15분 MACD 상승 에너지 감소 동시 만족/g, "직전 캔들 종가가 SMA 위 -> 현재 종가가 SMA 아래로 돌파");

fs.writeFileSync(file, content);
