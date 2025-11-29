
import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { Candle } from '../types';

interface CandleChartProps {
  data: Candle[];
  pairName: string;
}

const CandleChart: React.FC<CandleChartProps> = ({ data, pairName }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const sma20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Initialize Chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: 'Solid', color: '#0f172a' }, // Slate-900
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1, // CrosshairMode.Normal
      },
    });

    // Add Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981', // Emerald-500
      downColor: '#f43f5e', // Rose-500
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
    });

    // Add SMA Series
    const sma20Series = chart.addLineSeries({
      color: '#eab308', // Yellow
      lineWidth: 2,
      title: 'SMA 20',
    });

    const sma200Series = chart.addLineSeries({
      color: '#3b82f6', // Blue
      lineWidth: 2,
      title: 'SMA 200',
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    sma20SeriesRef.current = sma20Series;
    sma200SeriesRef.current = sma200Series;

    // Resize Observer
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Update Data
  useEffect(() => {
    if (!candleSeriesRef.current || !sma20SeriesRef.current || !sma200SeriesRef.current || data.length === 0) return;

    // Format data for Lightweight Charts
    const candleData = data.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    // Filter out undefined SMAs (beginning of data)
    const sma20Data = data
      .filter(d => d.sma20 !== undefined)
      .map(d => ({ time: d.time, value: d.sma20! }));

    const sma200Data = data
      .filter(d => d.sma200 !== undefined)
      .map(d => ({ time: d.time, value: d.sma200! }));

    candleSeriesRef.current.setData(candleData);
    sma20SeriesRef.current.setData(sma20Data);
    sma200SeriesRef.current.setData(sma200Data);

    // Fit content
    if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
    }
  }, [data]);

  return (
    <div className="w-full h-[320px] bg-slate-900 rounded-lg border border-slate-700 p-1 relative">
      <div className="absolute top-2 left-3 z-10 bg-slate-950/80 px-2 py-1 rounded border border-slate-700 pointer-events-none">
        <span className="text-xs text-white font-bold">{pairName}</span>
        <span className="text-[10px] text-emerald-500 ml-2">LIVE DATA</span>
      </div>
      <div ref={chartContainerRef} className="w-full h-full rounded overflow-hidden" />
    </div>
  );
};

export default CandleChart;
