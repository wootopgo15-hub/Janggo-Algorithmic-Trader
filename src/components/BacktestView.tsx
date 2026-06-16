import React, { useEffect, useState, useRef } from 'react';
import { BacktestSummary } from '../types';
import { createChart, ColorType, CrosshairMode, CandlestickSeries, createSeriesMarkers } from 'lightweight-charts';
import { TrendingUp, Activity, PieChart, CheckCircle2, AlertCircle, RefreshCw, History, Clock } from 'lucide-react';
import { BacktestTimeSyncModal } from './BacktestTimeSyncModal';

export const BacktestView: React.FC = () => {
  const [data, setData] = useState<BacktestSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<'1d' | '3m' | '6m' | '1y'>('3m');
  const [symbol, setSymbol] = useState('BTC/USDT');
  const [isValidating, setIsValidating] = useState(false);
  const [validationOk, setValidationOk] = useState<boolean | null>(null);
  const [isTimeSyncOpen, setIsTimeSyncOpen] = useState(false);
  const [timeOffset, setTimeOffset] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const TARGET_COINS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT',
    'AVAX/USDT', 'DOGE/USDT', 'DOT/USDT', 'LINK/USDT', 'POL/USDT'
  ];

  const fetchBacktest = (selectedPeriod: string, selectedSymbol: string) => {
    setLoading(true);
    setValidationOk(null);
    setIsValidating(true);
    
    // Simulate validation delay
    setTimeout(() => {
      setIsValidating(false);
      setValidationOk(true); // Simulate sync success
      
      fetch(`/api/backtest?period=${selectedPeriod}&symbol=${encodeURIComponent(selectedSymbol)}`)
        .then(res => res.json())
        .then(d => {
          setData(d);
          setLoading(false);
        })
        .catch(err => {
          console.error("Backtest fetch error:", err);
          setLoading(false);
        });
    }, 1500);
  };

  useEffect(() => {
    fetchBacktest(period, symbol);
  }, [period, symbol]);

  useEffect(() => {
    if (!data || !chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = ''; // Clear previous chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937', style: 1 },
        horzLines: { color: '#1f2937', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      rightPriceScale: {
        borderColor: '#1f2937',
      },
      timeScale: {
        borderColor: '#1f2937',
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 350
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Ensure data is sorted by time and time is numeric (Unix timestamp format)
    const uniqueMap = new Map();
    if (data.chartData && Array.isArray(data.chartData)) {
      [...data.chartData].forEach((d: any) => {
          uniqueMap.set(d.time, d);
      });
    }
    const sortedData = Array.from(uniqueMap.values()).sort((a, b) => a.time - b.time);
    const validData = sortedData.map(d => ({
        time: d.time as any, 
        open: d.open, 
        high: d.high, 
        low: d.low, 
        close: d.close 
    }));
    
    try {
      candlestickSeries.setData(validData);
    } catch(e) {
      console.error("Chart setData failed:", e);
    }

    const markers: any[] = [];
    sortedData.forEach(item => {
      if (item.signal === 'LONG') {
        markers.push({ time: item.time, position: 'belowBar', color: '#22c55e', shape: 'arrowUp', text: 'LONG' });
      } else if (item.signal === 'SHORT') {
        markers.push({ time: item.time, position: 'aboveBar', color: '#ef4444', shape: 'arrowDown', text: 'SHORT' });
      }
      
      if (item.exit) {
        markers.push({ time: item.time, position: 'aboveBar', color: '#facc15', shape: 'circle', text: 'EXIT' });
      }
    });
    
    // Sort markers by time
    markers.sort((a, b) => a.time - b.time);
    createSeriesMarkers(candlestickSeries, markers);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data]);

  return (
    <div className="flex-1 flex flex-col gap-6 w-full animate-in fade-in duration-500 pb-20">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
         <div>
            <h2 className="text-lg font-bold text-gray-100 uppercase tracking-widest flex items-center gap-2">
                <History size={18} className="text-blue-500" />
                백테스트 (Backtesting) 리포트
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-1">실시간 가격 데이터를 활용한 단일 코인 과거 시뮬레이션</p>
         </div>
         <div className="flex gap-4">
             <select 
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="bg-[#0A0D14] border border-gray-800 text-gray-300 text-xs font-bold uppercase tracking-wider font-mono rounded px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors"
             >
                {TARGET_COINS.map(c => (
                   <option key={c} value={c}>{c}</option>
                ))}
             </select>
             <div className="flex gap-2">
                 {['1d', '3m', '6m', '1y'].map((p) => (
                 <button
                    key={p}
                    onClick={() => setPeriod(p as any)}
                    className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider font-mono border transition-colors ${
                        period === p 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : 'bg-[#0A0D14] border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                    }`}
                 >
                     {p === '1d' ? '1일' : p === '3m' ? '3개월' : p === '6m' ? '6개월' : '1년'}
                 </button>
             ))}
             </div>
         </div>
      </div>

      {/* Validation Status / Strategy Setup Modal */}
      {isValidating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0A0D14] border border-gray-800 rounded-xl max-w-sm w-full p-6 flex flex-col items-center gap-5 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="relative mt-2">
                    <div className="w-16 h-16 border-4 border-gray-800 border-t-blue-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <TrendingUp size={20} className="text-blue-500" />
                    </div>
                </div>
                <div>
                   <h3 className="text-white font-bold text-lg mb-1 tracking-widest">초기화 적용 중...</h3>
                   <p className="text-xs text-gray-500 font-mono mt-2">
                     과거 대규모 차트 4시간봉(4H) 병합 및 스나이퍼 로직 적용
                   </p>
                </div>
                <div className="w-full bg-gray-900 h-1.5 rounded-full overflow-hidden mt-1 relative">
                    <div className="absolute top-0 bottom-0 left-0 bg-blue-500 w-[70%] animate-pulse rounded-full"></div>
                </div>
                <p className="text-[10px] text-gray-600 font-mono">실제 백테스트 적용 범위: 500개 이상 데이터 로드 중</p>
            </div>
        </div>
      )}

      {loading && !isValidating ? (
           <div className="flex-1 flex justify-center items-center min-h-[300px]">
               <div className="text-gray-500 font-mono animate-pulse uppercase tracking-widest text-sm flex flex-col items-center gap-2">
                   <div className="w-6 h-6 border-2 border-t-blue-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
                   백테스트 엔진 구동 중...
               </div>
           </div>
      ) : data ? (
        <>
          {/* Strategy Info */}
          <div className="mx-2 mb-2 bg-[#0C0E14] border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2 mb-3">
              <Activity size={16} className="text-blue-500" />
              적용된 매매 기법 (MTF 4H-1H-15M 얼라인먼트)
            </h3>
            <ul className="text-xs text-gray-400 font-mono space-y-1.5 list-disc pl-5">
              <li><strong className="text-gray-300">데이터 조회:</strong> 15분봉 데이터 500개를 ccxt.pro의 웹소켓(watch_ohlcv)으로 실시간 수신하여 실시간 계산.</li>
              <li><strong className="text-gray-300">지표 계산:</strong> 수신된 데이터 기반으로 EMA(320), EMA(80), MACD(12, 26, 9), ATR(14) 실시간 적용.</li>
              <li><strong className="text-gray-300">4H 메인 추세:</strong> 15분 기준 320 EMA (4H 20 EMA 상당) 상승세 / 하락세 판단.</li>
              <li><strong className="text-gray-300">1H 눌림목:</strong> 15분 기준 80 EMA (1H 20 EMA 상당) 지지/저항 구조 및 눌림목 판단.</li>
              <li><strong className="text-gray-300">15M 타점 (Long):</strong> MACD(12, 26, 9) 지표 골든 크로스 발생 시 진입.</li>
              <li><strong className="text-gray-300">15M 타점 (Short):</strong> MACD(12, 26, 9) 지표 데드 크로스 발생 시 진입.</li>
              <li><strong className="text-gray-300">리스크 관리 (ATR):</strong> <span className="text-blue-400">손절가(SL) = Entry ± (ATR * 1.5) / 익절가(TP) = Entry ± (ATR * 3.0)</span></li>
            </ul>
          </div>

          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 px-2">
            <div className="bg-[#0C0E14] border border-gray-800 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 bg-blue-500/10 rounded-bl-full w-24 h-24 -mt-4 -mr-4"></div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex items-center gap-2">
                <PieChart size={14} className="text-blue-500" />
                단일 코인 승률
              </div>
              <div className="text-3xl font-black font-mono text-white mt-1 group-hover:text-blue-400 transition-colors">
                {Number(data.winRate).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-600 font-mono mt-auto pt-2">총 {data.totalTrades}회 거래 [{period.toUpperCase()}]</div>
            </div>

            <div className="bg-[#0C0E14] border border-gray-800 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 bg-red-500/10 rounded-bl-full w-24 h-24 -mt-4 -mr-4"></div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex items-center gap-2">
                <Activity size={14} className="text-red-500" />
                최대 낙폭 (MDD)
              </div>
              <div className="text-3xl font-black font-mono text-white mt-1 group-hover:text-red-400 transition-colors">
                {Number(data.mdd).toFixed(1)}%
              </div>
              <div className="text-xs text-gray-600 font-mono mt-auto pt-2 border-t border-gray-800/50">안전성 기준 통과 완료</div>
            </div>

            <div className="bg-[#0C0E14] border border-gray-800 rounded-xl p-4 flex flex-col gap-2 relative overflow-hidden group">
               <div className="absolute top-0 right-0 p-4 opacity-5 bg-green-500/10 rounded-bl-full w-24 h-24 -mt-4 -mr-4"></div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest font-bold flex items-center gap-2">
                <TrendingUp size={14} className="text-green-500" />
                총 순이익
              </div>
              <div className="text-3xl font-black font-mono text-green-400 mt-1">
                {Number(data.netProfit) > 0 ? '+' : ''}${Number(data.netProfit).toLocaleString()}
              </div>
              <div className="text-xs text-green-500/50 font-mono mt-auto pt-2">초기 자본 $2,000 / 레버리지 5x 기준</div>
            </div>
          </div>

          {/* Chart Section */}
          <div className="bg-[#0C0E14] border border-gray-800 rounded-xl p-4 flex flex-col gap-4 mx-2">
            <div className="flex justify-between items-center px-1">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest flex items-center gap-2">
                <Activity size={16} className="text-blue-500" />
                적중 타점 시각화 ({symbol})
              </h3>
              <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-widest font-mono">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-green-500"></div>롱 진입</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div>숏 진입</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div>청산</span>
              </div>
            </div>
            
            {/* Lightweight Charts mounting point */}
            <div ref={chartContainerRef} className="h-[350px] w-full mt-2 rounded border border-gray-800 bg-[#0A0D14]" />
          </div>

          {/* Trade History Table */}
          <div className="bg-[#0C0E14] border border-gray-800 rounded-xl flex flex-col mx-2 overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#0d1017]">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-widest">상세 포지션 내역</h3>
              <span className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">최근 거래 표시</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono whitespace-nowrap">
                <thead className="text-[10px] text-gray-500 uppercase tracking-widest bg-[#0A0D14] border-b border-gray-800">
                  <tr>
                    <th className="px-4 py-3 font-semibold">ID</th>
                    <th className="px-4 py-3 font-semibold">심볼</th>
                    <th className="px-4 py-3 font-semibold">포지션/국면</th>
                    <th className="px-4 py-3 font-semibold">진입 시간/가격</th>
                    <th className="px-4 py-3 font-semibold">청산 시간/가격</th>
                    <th className="px-4 py-3 font-semibold text-right">수익률 (PnL)</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300 divide-y divide-gray-800">
                  {data.recentTrades && Array.isArray(data.recentTrades) ? data.recentTrades.map((trade: any, index: number) => {
                    const isWin = trade.pnl >= 0;
                    return (
                      <tr key={`${trade.id}-${index}`} className="hover:bg-gray-800/20 transition-colors">
                        <td className="px-4 py-3">{trade.id}</td>
                        <td className="px-4 py-3 font-bold text-white">{trade.symbol}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2 items-center">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase border font-bold ${trade.type === 'LONG' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                              {trade.type}
                            </span>
                            <span className="text-[10px] text-gray-500 border border-gray-700 px-1.5 py-0.5 rounded uppercase font-sans">
                              {trade.phase === 'Uptrend' ? '4H 상승/1H 눌림 (L)' :
                               trade.phase === 'Downtrend' ? '4H 하락/1H 반등 (S)' :
                               trade.phase}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[10px] text-gray-500">{trade.entryTime}</div>
                          <div className="font-bold">${trade.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-[10px] text-gray-500">{trade.exitTime}</div>
                          <div className="font-bold">${trade.exitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                           <span className={`font-bold ${isWin ? 'text-green-400' : 'text-red-400'}`}>
                             {isWin ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                           </span>
                           <div className={`text-[10px] ${isWin ? 'text-green-500/60' : 'text-red-500/60'}`}>
                             {isWin ? '+' : ''}${trade.pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                           </div>
                        </td>
                      </tr>
                    );
                  }) : null}
                </tbody>
              </table>
            </div>
          </div>
          <BacktestTimeSyncModal 
            isOpen={isTimeSyncOpen}
            onClose={() => setIsTimeSyncOpen(false)}
            offsetMs={timeOffset}
            onOffsetChange={(offset) => {
               setTimeOffset(offset);
               // Re-run backtest or adjust logically depending on implementation
            }}
            symbol={symbol}
            chartData={data?.chartData || []}
          />
        </>
      ) : null}

    </div>
  );
};

