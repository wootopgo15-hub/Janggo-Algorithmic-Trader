import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts';

export const TradingChart = ({ symbol, ohlcvData, position }: { symbol: string, ohlcvData: any[], position?: any }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<any>(null);
  const markersPluginRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    chartRef.current = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0a' }, // Dark background
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1f1f1f' },
        horzLines: { color: '#1f1f1f' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 10,
        fixLeftEdge: true,
      },
      crosshair: {
        mode: 1,
      },
      autoSize: true,
    });

    seriesRef.current = chartRef.current.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });
    
    markersPluginRef.current = createSeriesMarkers(seriesRef.current);

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  const isInitialized = useRef<boolean>(false);

  useEffect(() => {
    if (seriesRef.current && ohlcvData.length > 0 && chartRef.current) {
      // transform data for lightweight charts
      const formattedData = ohlcvData.map(d => ({
        time: Math.floor(d[0] / 1000) as unknown as string,
        open: d[1],
        high: d[2],
        low: d[3],
        close: d[4]
      }));

      const uniqueData = Array.from(new Map(formattedData.map(item => [item.time, item])).values())
        .sort((a, b) => (a.time as any) - (b.time as any));

      seriesRef.current.setData(uniqueData as any);
      
      if (!isInitialized.current) {
        chartRef.current.timeScale().fitContent();
        isInitialized.current = true;
      }
    }
  }, [ohlcvData]);

  // Update price lines and markers when position or ohlcvData changes
  useEffect(() => {
    if (!seriesRef.current) return;

    // Clear old price lines
    priceLinesRef.current.forEach(line => {
      try { seriesRef.current.removePriceLine(line); } catch (e) {}
    });
    priceLinesRef.current = [];

    if (position && position.status === 'ACTIVE') {
      const isLong = position.side === 'LONG';
      
      if (position.entryPrice) {
        priceLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: position.entryPrice,
            color: '#3b82f6',
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: 'Entry',
          })
        );
      }

      if (position.TARGET_1ST) {
        priceLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: position.TARGET_1ST,
            color: '#10b981',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'TP 1',
          })
        );
      }

      if (position.STOP_LOSS_1ST) {
        priceLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: position.STOP_LOSS_1ST,
            color: '#ef4444',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'SL 1',
          })
        );
      }

      if (position.EXCHANGE_HARD_STOP) {
        priceLinesRef.current.push(
          seriesRef.current.createPriceLine({
            price: position.EXCHANGE_HARD_STOP,
            color: '#991b1b',
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            axisLabelVisible: true,
            title: 'Hard SL',
          })
        );
      }

      // Add marker at exact entry time
      if (position.entryTime && ohlcvData.length > 0) {
        let closestBar = null;
        for (let i = ohlcvData.length - 1; i >= 0; i--) {
          if (ohlcvData[i][0] <= position.entryTime) {
            closestBar = ohlcvData[i];
            break;
          }
        }
        if (!closestBar) closestBar = ohlcvData[ohlcvData.length - 1];

        markersPluginRef.current?.setMarkers([{
          time: Math.floor(closestBar[0] / 1000),
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? '#3b82f6' : '#ef4444',
          shape: isLong ? 'arrowUp' : 'arrowDown',
          text: isLong ? 'Buy' : 'Sell',
        }]);
      } else {
        markersPluginRef.current?.setMarkers([]);
      }

    } else if (position && position.status === 'WAITING' && position.ENTRY_PRICE) {
       // Display expected waiting entries
       priceLinesRef.current.push(
        seriesRef.current.createPriceLine({
          price: position.ENTRY_PRICE,
          color: position.targetSide === 'LONG' ? '#10b981' : '#ef4444',
          lineWidth: 2,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: 'Wait Entry',
        })
      );
      markersPluginRef.current?.setMarkers([]);
    } else {
      markersPluginRef.current?.setMarkers([]);
    }
  }, [position, ohlcvData]);

  return <div ref={chartContainerRef} className="w-full h-full absolute inset-0" />;
};

