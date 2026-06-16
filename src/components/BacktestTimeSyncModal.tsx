import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { X, Check } from 'lucide-react';

interface BacktestTimeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  offsetMs: number;
  onOffsetChange: (offset: number) => void;
  symbol: string;
  chartData: any[];
}

export const BacktestTimeSyncModal: React.FC<BacktestTimeSyncModalProps> = ({ isOpen, onClose, offsetMs, onOffsetChange, symbol, chartData }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localOffset, setLocalOffset] = useState(offsetMs);

  useEffect(() => {
    setLocalOffset(offsetMs);
  }, [offsetMs, isOpen]);

  useEffect(() => {
    if (!isOpen || !chartContainerRef.current) return;

    chartContainerRef.current.innerHTML = ''; // Clean up

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.4)', style: 1 },
        horzLines: { color: 'rgba(31, 41, 55, 0.4)', style: 1 },
      },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#1f2937' },
      timeScale: { borderColor: '#1f2937', timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: 350
    });

    const exchangeSeries = chart.addSeries(CandlestickSeries, {
      title: '거래소 시간',
      upColor: 'transparent',
      downColor: 'transparent',
      borderVisible: true,
      borderColor: 'rgba(59, 130, 246, 0.5)',
      borderUpColor: 'rgba(59, 130, 246, 0.5)',
      borderDownColor: 'rgba(59, 130, 246, 0.5)',
      wickColor: 'rgba(59, 130, 246, 0.5)',
      wickUpColor: 'rgba(59, 130, 246, 0.5)',
      wickDownColor: 'rgba(59, 130, 246, 0.5)',
    });

    const localSeries = chart.addSeries(CandlestickSeries, {
      title: '로컬 오프셋',
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Ensure chartData is sorted
    const sortedData = [...chartData].sort((a, b) => a.time - b.time);
    
    // We only take the last 500 candles roughly for visualization if needed, or all 
    const displayData = sortedData.slice(-500);

    const validData = displayData.map(d => ({
        time: d.time as any, 
        open: d.open, 
        high: d.high, 
        low: d.low, 
        close: d.close 
    }));

    try {
      exchangeSeries.setData(validData);

      const offsetData = validData.map(d => ({
         ...d,
         time: Math.floor(d.time + (localOffset / 1000)) as any
      }));
      localSeries.setData(offsetData);
      
      chart.timeScale().fitContent();
    } catch(e) {
      console.error(e);
    }

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
  }, [isOpen, localOffset, chartData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0A0D14] border border-gray-800 rounded-xl w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#0C0E14]">
          <div className="flex gap-4 items-center">
            <div>
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">시간 동기화 시각적 검증</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">백테스트 기간 검증</p>
            </div>
            
            <select 
               disabled
               className="bg-[#050608] border border-gray-700 text-xs text-gray-300 font-bold px-3 py-1 rounded"
            >
               <option>{symbol}</option>
            </select>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div ref={chartContainerRef} className="w-full h-[350px] bg-[#050608] border border-gray-800 rounded-lg" />
          
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-[#0C0E14] p-4 rounded-lg border border-gray-800">
            <div className="flex flex-col gap-2 w-full md:w-1/2">
               <div className="flex justify-between items-center">
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">수동 오프셋 조정 (ms)</label>
                 <span className={`text-sm font-mono font-bold ${Math.abs(localOffset) > 1000 ? 'text-orange-400' : 'text-blue-400'}`}>
                   {localOffset > 0 ? '+' : ''}{localOffset}ms
                 </span>
               </div>
               <div className="flex items-center gap-4">
                 <span className="text-[10px] text-gray-600 font-mono">-5000</span>
                 <input 
                   type="range" 
                   value={localOffset}
                   min={-5000} 
                   max={5000} 
                   step={100}
                   onChange={(e) => setLocalOffset(Number(e.target.value))}
                   className="w-full h-1 bg-gray-700 rounded-lg appearance-none accent-blue-500 hover:accent-blue-400 cursor-pointer" 
                 />
                 <span className="text-[10px] text-gray-600 font-mono">+5000</span>
               </div>
            </div>

            <div className="flex gap-2 w-full md:w-auto">
              <button 
                onClick={() => setLocalOffset(0)}
                className="flex-1 md:flex-none px-4 py-2 border border-gray-700 rounded text-xs font-bold hover:bg-gray-800 text-gray-300 transition-colors uppercase tracking-widest"
              >
                초기화
              </button>
              <button 
                onClick={() => {
                  onOffsetChange(localOffset);
                  onClose();
                }}
                className="flex-1 md:flex-none px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold transition-all uppercase tracking-widest shadow-[0_0_15px_rgba(37,99,235,0.2)] flex items-center justify-center gap-2"
              >
                <Check size={16} />
                적용 및 닫기
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};
