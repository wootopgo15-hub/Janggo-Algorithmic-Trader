import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import { X, Check } from 'lucide-react';
import { socket } from '../socket';

interface TimeSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  offsetMs: number;
  onOffsetChange: (offset: number) => void;
  coins: string[];
}

export const TimeSyncModal: React.FC<TimeSyncModalProps> = ({ isOpen, onClose, offsetMs, onOffsetChange, coins }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [localOffset, setLocalOffset] = useState(offsetMs);
  const [selectedCoin, setSelectedCoin] = useState(coins[0] || 'BTC/USDT');
  
  // Use ref to hold current offset for WS callbacks to avoiding stale data
  const localOffsetRef = useRef(localOffset);

  useEffect(() => {
    setLocalOffset(offsetMs);
  }, [offsetMs, isOpen]);

  useEffect(() => {
    localOffsetRef.current = localOffset;
  }, [localOffset]);

  useEffect(() => {
    if (!isOpen || !chartContainerRef.current) return;

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
      height: 300
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

    let rawDataCache: any[] = [];
    
    const applyOffset = (dataTime: number, offsetMs: number) => {
      return Math.floor(dataTime + (offsetMs / 1000));
    };

    const safeSetData = () => {
       const sorted = [...rawDataCache].sort((a,b) => a.time - b.time);
       const unique = [];
       let lastTime = -1;
       for (const item of sorted) {
          if (item.time !== lastTime) {
             unique.push(item);
             lastTime = item.time;
          } else {
             unique[unique.length - 1] = item;
          }
       }
       rawDataCache = unique;
       
       try {
         exchangeSeries.setData(rawDataCache);
         
         const offsetData = [];
         let lastOffsetTime = -1;
         for (const item of rawDataCache) {
             const t = applyOffset(item.time, localOffsetRef.current);
             if (t !== lastOffsetTime) {
                 offsetData.push({ ...item, time: t });
                 lastOffsetTime = t;
             } else {
                 offsetData[offsetData.length - 1] = { ...item, time: t };
             }
         }
         localSeries.setData(offsetData);
       } catch(e) { console.error(e) }
    };

    const handleSeed = (data: any[]) => {
       rawDataCache = data;
       safeSetData();
       chart.timeScale().fitContent();
    };

    const handleCandle = (candle: any) => {
       const last = rawDataCache[rawDataCache.length - 1];
       if (last && last.time === candle.time) {
          rawDataCache[rawDataCache.length - 1] = candle;
       } else {
          rawDataCache.push(candle);
          if (rawDataCache.length > 500) rawDataCache.shift();
       }
       
       try {
         const latest = rawDataCache[rawDataCache.length - 1];
         exchangeSeries.update(latest);
         localSeries.update({
            ...latest,
            time: applyOffset(latest.time, localOffsetRef.current)
         });
       } catch(e) { console.error(e) }
    };

    socket.on(`seed:${selectedCoin}`, handleSeed);
    socket.on(`candle:${selectedCoin}`, handleCandle);
    
    // Request seed manually just in case
    socket.emit('request_seed', selectedCoin);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    
    // Set up resize observer to better handle visibility changes
    let resizeObserver: ResizeObserver | null = null;
    try {
      if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
        resizeObserver = new window.ResizeObserver(() => handleResize());
        resizeObserver.observe(chartContainerRef.current);
      }
    } catch (e) {
      console.warn("ResizeObserver not available", e);
    }
    
    window.addEventListener('resize', handleResize);

    return () => {
      socket.off(`seed:${selectedCoin}`, handleSeed);
      socket.off(`candle:${selectedCoin}`, handleCandle);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      chart.remove();
    };
  }, [isOpen, selectedCoin]);

  // Re-sync local offset visually when slider changes
  useEffect(() => {
    // A trick to trigger a re-render/re-sync without blowing up chart:
    // In production we could incrementally update, but full re-render on slider move 
    // is too fast, let's just trigger a request seed again if we want to redraw.
    // Or we rely on safeSetData, but we can't easily export safeSetData.
    // The easiest robust way is just requesting seed again to flush UI.
    const timer = setTimeout(() => {
        socket.emit('request_seed', selectedCoin);
    }, 100);
    return () => clearTimeout(timer);
  }, [localOffset, selectedCoin]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0A0D14] border border-gray-800 rounded-xl w-full max-w-4xl flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
        
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#0C0E14]">
          <div className="flex gap-4 items-center">
            <div>
              <h2 className="text-sm font-bold text-gray-200 uppercase tracking-widest">시간 동기화 시각적 검증</h2>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">거래소 vs 로컬 타임</p>
            </div>
            
            <select 
               value={selectedCoin} 
               onChange={(e) => setSelectedCoin(e.target.value)}
               className="bg-[#050608] border border-gray-700 text-xs text-gray-300 font-bold px-3 py-1 rounded"
            >
               {coins.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <div ref={chartContainerRef} className="w-full h-[300px] bg-[#050608] border border-gray-800 rounded-lg" />
          
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
