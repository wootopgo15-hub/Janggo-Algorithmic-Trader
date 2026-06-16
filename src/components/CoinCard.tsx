import React, { useEffect, useRef, useState } from 'react';
import { CoinState } from '../types';
import { TrendingUp, TrendingDown, Minus, Play, Square } from 'lucide-react';
import { createChart, ColorType, CandlestickSeries, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';
import { socket } from '../socket';
import { EMA, ADX, Stochastic } from 'technicalindicators';

interface CoinCardProps {
  coin: CoinState;
  timeOffsetMs: number;
  onToggle: (symbol: string) => void;
}

export const CoinCard: React.FC<CoinCardProps> = ({ coin, timeOffsetMs, onToggle }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const ema50SeriesRef = useRef<any>(null);
  const ema200SeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const positionLineRef = useRef<any>(null);

  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [indicators, setIndicators] = useState({
     adx: 0,
     stochK: 0,
     stochD: 0,
     isGoldenCross: false,
     isDeadCross: false,
     ema50: 0,
     ema200: 0
  });

  // Keep a local ref to cached data for real-time recalculation
  const dataCache = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#6b7280',
      },
      grid: {
        vertLines: { color: 'rgba(31, 41, 55, 0.4)', style: 1 },
        horzLines: { color: 'rgba(31, 41, 55, 0.4)', style: 1 },
      },
      rightPriceScale: {
        visible: true,
        borderColor: 'rgba(31, 41, 55, 0.4)',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        visible: true,
        borderColor: 'rgba(31, 41, 55, 0.4)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0, // CrosshairMode.Normal is 0
        vertLine: { color: 'rgba(107, 114, 128, 0.4)' },
        horzLine: { color: 'rgba(107, 114, 128, 0.4)' }
      },
      handleScroll: true,
      handleScale: true,
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    seriesRef.current = candlestickSeries;
    const markersPlugin = createSeriesMarkers(candlestickSeries, []);
    markersRef.current = markersPlugin;

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#3b82f6', // blue
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    });
    ema50SeriesRef.current = ema50Series;

    const ema200Series = chart.addSeries(LineSeries, {
      color: '#eab308', // yellow
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
    });
    ema200SeriesRef.current = ema200Series;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#26a69a',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // set to empty string to overlay over price instead of own scale (we will attach to separate scale below)
    });
    
    // Set separate scale for overlaying volume at bottom
    chart.priceScale('').applyOptions({
         scaleMargins: {
             top: 0.8, // leave top 80% for price
             bottom: 0,
         },
         visible: false
    });

    volumeSeriesRef.current = volumeSeries;

    const applyOffset = (dataTime: number) => {
      // timeOffsetMs is in milliseconds, lightweight-charts time for 1m is in seconds
      return Math.floor(dataTime + (timeOffsetMs / 1000));
    };

    const recalculateIndicators = (fullData: any[]) => {
       if (fullData.length === 0) return;
       
       const close = fullData.map(d => d.close);
       const high = fullData.map(d => d.high);
       const low = fullData.map(d => d.low);

       // EMA 50
       let ema50Result = EMA.calculate({ period: 50, values: close });
       // EMA 200
       let ema200Result = EMA.calculate({ period: 200, values: close });
       // ADX
       let adxResult = ADX.calculate({ period: 14, high, low, close });
       // Stochastic
       let stochResult = Stochastic.calculate({ period: 14, signalPeriod: 3, high, low, close });

       // Arrays to update Lightweight Chart series
       const ema50ChartData: any[] = [];
       const ema200ChartData: any[] = [];
       const volumeData: any[] = [];
       
       for (let i = 0; i < fullData.length; i++) {
           const time = applyOffset(fullData[i].time);
           volumeData.push({
               time,
               value: fullData[i].volume || 0,
               color: (fullData[i].close >= fullData[i].open) ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)'
           });

           if (i >= 49) {
               ema50ChartData.push({ time, value: ema50Result[i - 49] });
           }
           if (i >= 199) {
               ema200ChartData.push({ time, value: ema200Result[i - 199] });
           }
       }
       
       if (ema50ChartData.length > 0) ema50Series.setData(ema50ChartData);
       if (ema200ChartData.length > 0) ema200Series.setData(ema200ChartData);
       if (volumeData.length > 0) volumeSeries.setData(volumeData);

       // Update text UI state based on the latest calculation
       const latestEma50 = ema50Result.length > 0 ? ema50Result[ema50Result.length - 1] : 0;
       const latestEma200 = ema200Result.length > 0 ? ema200Result[ema200Result.length - 1] : 0;
       
       // Calculate cross
       let isGoldenCross = false;
       let isDeadCross = false;
       if (ema50Result.length > 1 && ema200Result.length > 1) {
           const prevEma50 = ema50Result[ema50Result.length - 2];
           const prevEma200 = ema200Result[ema200Result.length - 2];
           isGoldenCross = prevEma50 <= prevEma200 && latestEma50 > latestEma200;
           isDeadCross = prevEma50 >= prevEma200 && latestEma50 < latestEma200;
       }

       setIndicators({
           adx: adxResult.length > 0 ? adxResult[adxResult.length - 1].adx : 0,
           stochK: stochResult.length > 0 ? stochResult[stochResult.length - 1].k : 0,
           stochD: stochResult.length > 0 ? stochResult[stochResult.length - 1].d : 0,
           ema50: latestEma50,
           ema200: latestEma200,
           isGoldenCross,
           isDeadCross
       });
    };

    const handleSeed = (data: any[]) => {
      try {
        const sorted = [...data].sort((a,b) => a.time - b.time);
        
        // Remove duplicate timestamps if they exist, to prevent lightweight-charts errors
        const uniqueSorted = [];
        let lastTime = -1;
        for (const item of sorted) {
          if (item.time !== lastTime) {
            uniqueSorted.push({
               ...item,
            });
            lastTime = item.time;
          } else {
             uniqueSorted[uniqueSorted.length - 1] = {
                 ...item,
             };
          }
        }
        
        // Save to cache for indicator recalculation
        dataCache.current = uniqueSorted;
        
        const chartData = uniqueSorted.map(item => ({
             ...item,
             time: applyOffset(item.time)
        }));

        candlestickSeries.setData(chartData);
        if (chartData.length > 0) {
          setCurrentPrice(chartData[chartData.length - 1].close);
        }
        
        recalculateIndicators(uniqueSorted);
        
        chart.timeScale().fitContent();
      } catch (e) { console.error(e) }
    };

    const handleCandle = (candle: any) => {
      try {
        const timeApp = applyOffset(candle.time);
        candlestickSeries.update({
          ...candle,
          time: timeApp
        });
        
        // Update cache
        const lastCandle = dataCache.current[dataCache.current.length - 1];
        if (lastCandle && lastCandle.time === candle.time) {
            dataCache.current[dataCache.current.length - 1] = candle;
        } else {
            dataCache.current.push(candle);
            // Limit array logic
            if (dataCache.current.length > 600) dataCache.current.shift();
        }
        
        recalculateIndicators(dataCache.current);
        setCurrentPrice(candle.close);
      } catch (e) { console.error(e) }
    };

    socket.on(`seed:${coin.symbol}`, handleSeed);
    socket.on(`candle:${coin.symbol}`, handleCandle);
    
    // Request seed data explicitly since component might mount after socket connects
    socket.emit('request_seed', coin.symbol);

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight
        });
      }
    };
    
    let resizeObserver: ResizeObserver | null = null;
    try {
      if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
        resizeObserver = new window.ResizeObserver(() => {
          handleResize();
        });
        resizeObserver.observe(chartContainerRef.current);
      }
    } catch (e) {
      console.warn("ResizeObserver not available", e);
    }
    
    window.addEventListener('resize', handleResize);

    return () => {
      socket.off(`seed:${coin.symbol}`, handleSeed);
      socket.off(`candle:${coin.symbol}`, handleCandle);
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) resizeObserver.disconnect();
      chart.remove();
    };
  }, [coin.symbol, timeOffsetMs]);

  useEffect(() => {
    if (!seriesRef.current) return;
    
    if (positionLineRef.current) {
        try {
            seriesRef.current.removePriceLine(positionLineRef.current);
        } catch(e) {}
        positionLineRef.current = null;
    }

    if (coin.entryPrice && coin.positionType && (coin.longActive || coin.shortActive)) {
      positionLineRef.current = seriesRef.current.createPriceLine({
        price: coin.entryPrice,
        color: coin.positionType === 'LONG' ? '#22c55e' : '#ef4444',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `${coin.positionType} ENTRY`,
      });
      
      if (coin.entryTime) {
         if (markersRef.current) {
             markersRef.current.setMarkers([
                {
                   time: Math.floor(coin.entryTime + (timeOffsetMs / 1000)) as any,
                   position: coin.positionType === 'LONG' ? 'belowBar' : 'aboveBar',
                   color: coin.positionType === 'LONG' ? '#22c55e' : '#ef4444',
                   shape: coin.positionType === 'LONG' ? 'arrowUp' : 'arrowDown',
                   text: `${coin.positionType} ENTRY`,
                   size: 2
                }
             ]);
         }
      }
    } else {
      if (markersRef.current) markersRef.current.setMarkers([]);
    }
  }, [coin.entryPrice, coin.entryTime, coin.positionType, coin.longActive, coin.shortActive, timeOffsetMs]);

  const getPhaseStyles = () => {
    switch (coin.entryPhase || coin.phase) {
      case 'Uptrend': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'Downtrend': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'Sideways': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'SidewaysWideLong':
      case 'SqueezeBreakoutLong': return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'SidewaysWideShort':
      case 'SqueezeBreakoutShort': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };
  
  const getPhaseText = () => {
    const p = coin.entryPhase || coin.phase;
    if (p === 'Uptrend') return '추세 눌림 상승';
    if (p === 'Downtrend') return '추세 데드캣 하락';
    if (p === 'SidewaysWideLong') return '박스권 역추세 상승';
    if (p === 'SidewaysWideShort') return '박스권 역추세 하락';
    if (p === 'SqueezeBreakoutLong') return '스퀴즈 돌파 상승';
    if (p === 'SqueezeBreakoutShort') return '스퀴즈 돌파 하락';
    if (p === 'Sideways') return '횡보 대기';
    return '관망';
  };
  
  const isPositivePnl = coin.pnl >= 0;

  return (
    <div className={`bg-[#0C0E14] border rounded-xl pt-3 px-3 pb-0 flex flex-col justify-between transition-colors relative group h-full overflow-hidden ${coin.active ? 'border-gray-800 hover:border-blue-500/50' : 'border-gray-800/80 opacity-70 hover:border-gray-700'}`}>
      
      {/* Toggle Button */}
      <div className="absolute top-2 right-2 z-10">
        <div 
          onClick={() => onToggle(coin.symbol)}
          className={`w-8 h-4 rounded-full flex items-center px-0.5 cursor-pointer transition-colors ${coin.active ? 'bg-blue-600' : 'bg-gray-600'}`}
        >
          <div className={`w-3 h-3 bg-white rounded-full transition-all ${coin.active ? 'ml-auto shadow-sm' : ''}`}></div>
        </div>
      </div>
      
      {/* Header Info */}
      <div>
        <div className="flex items-center justify-between pr-10">
          <div className="flex flex-col">
            <span className={`text-sm font-bold tracking-tight ${coin.active ? 'text-white' : 'text-gray-400'}`}>
              {coin.symbol}
            </span>
            <span className={`text-xs font-mono font-medium ${coin.active ? 'text-gray-300' : 'text-gray-500'}`}>
              {currentPrice !== null ? currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : '---'}
            </span>
          </div>
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${getPhaseStyles()}`}>
            {getPhaseText()}
          </span>
        </div>
        
        <div className="mt-2 flex justify-between items-end">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">포지션</span>
            <div className={`text-xs font-mono italic font-bold ${coin.longActive ? 'text-green-400' : coin.shortActive ? 'text-red-400' : 'text-gray-300'}`}>
              {coin.longActive ? '롱 (LONG)' : coin.shortActive ? '숏 (SHORT)' : '관망 (PASS)'}
            </div>
            {coin.margin !== undefined && coin.margin > 0 && (
              <div className="text-[9px] text-blue-300 mt-1 font-mono">
                투입금액: ${coin.margin.toFixed(2)}
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-end">
             {coin.longActive || coin.shortActive ? (
                <>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">미실현 수익금</span>
                  <div className={`text-xl font-black font-mono tracking-tighter leading-none ${isPositivePnl ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositivePnl ? '+$' : '-$'}{Math.abs(coin.pnl).toFixed(2)}
                  </div>
                </>
             ) : (
                <>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold mb-0.5">상태</span>
                  <div className="text-xl font-black font-mono text-yellow-400/80 italic font-normal tracking-tighter leading-none">관망 (PASS)</div>
                </>
             )}
          </div>
        </div>
      </div>
      
      {/* Technical Indicators */}
      <div className="grid grid-cols-4 gap-1 text-[9px] mt-3 px-1 border-t border-gray-800/50 pt-2">
          <div className="flex flex-col">
             <span className="text-gray-500 font-semibold mb-0.5">ADX (14)</span>
             <span className={`font-mono font-bold ${indicators.adx > 25 ? 'text-blue-400' : 'text-gray-400'}`}>{indicators.adx.toFixed(1)}</span>
          </div>
          <div className="flex flex-col">
             <span className="text-gray-500 font-semibold mb-0.5">Stoch (14)</span>
             <span className={`font-mono font-bold ${indicators.stochK > 80 ? 'text-red-400' : indicators.stochK < 20 ? 'text-green-400' : 'text-gray-400'}`}>
               {indicators.stochK.toFixed(1)} / {indicators.stochD.toFixed(1)}
             </span>
          </div>
          <div className="flex flex-col col-span-2 items-end">
             <span className="text-gray-500 font-semibold mb-0.5 "><span className="text-blue-500/80">50</span> / <span className="text-yellow-500/80">200</span> EMA</span>
             <div className="flex items-center gap-2">
               <span className="font-mono text-gray-300">
                 {indicators.ema50 > indicators.ema200 ? <TrendingUp size={10} className="inline text-green-500 mr-1"/> : <TrendingDown size={10} className="inline text-red-500 mr-1" />}
                 상태
               </span>
               {indicators.isGoldenCross ? (
                  <span className="bg-yellow-500/20 text-yellow-500 px-1 rounded font-bold">골든</span>
               ) : indicators.isDeadCross ? (
                  <span className="bg-red-500/20 text-red-500 px-1 rounded font-bold">데드</span>
               ) : (
                  <span className="text-gray-600">-</span>
               )}
             </div>
          </div>
      </div>

      {/* Internal Strategy Settings Footer */}
      <div className="flex flex-col gap-2 text-[10px] text-gray-500 pt-3 mt-4 border-t border-gray-800/50 uppercase tracking-wider font-semibold leading-relaxed">
        <div className="flex justify-between items-center">
            <span className="text-gray-400">기본 설정 (레버리지 / 손절):</span>
            <span className="text-orange-400 font-mono tracking-normal font-bold">5x / 진입 금액의 10% 제한</span>
        </div>
        <div className="flex flex-col gap-1.5 mt-1">
          <span className="text-gray-400">추세장 분할 익절 (5:5):</span>
          <div className="flex items-center justify-between bg-[#0A0D14] p-2 rounded border border-gray-800/60 w-full shadow-inner">
              <span className="text-blue-400 font-mono tracking-normal shrink-0 font-bold">+3% 수익 시</span>
              <span className="text-gray-300 font-mono tracking-normal text-right text-[9.5px]">고점 대비 1.08% 되돌림 전액 익절</span>
          </div>
          <div className="flex items-center justify-between bg-[#0A0D14] p-2 rounded border border-gray-800/60 w-full shadow-inner">
               <span className="text-purple-400 font-mono tracking-normal shrink-0 font-bold">+5% 수익 시</span>
               <span className="text-gray-300 font-mono tracking-normal text-right text-[9.5px]">50% 익절, 나머지 2% 트레일링</span>
          </div>
        </div>
      </div>
      
      {/* Chart Space */}
      <div className={`mt-3 -mx-3 flex-1 min-h-[300px] h-[350px] bg-[#050608] border-t border-gray-800/60 flex relative overflow-hidden ${coin.active ? '' : 'opacity-40'}`}>
          <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
      </div>

    </div>
  );
};
