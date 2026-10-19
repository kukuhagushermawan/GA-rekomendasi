'use client';

import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkPointComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef } from 'react';

echarts.use([LineChart, ScatterChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkPointComponent, CanvasRenderer]);

export type EChartOption = echarts.EChartsCoreOption;

/** Pembungkus kecil Apache ECharts: membuat chart sekali, memperbarui opsi, menyesuaikan ukuran. */
export function EChart({ option, height = 320, className }: { option: EChartOption; height?: number; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const instance = echarts.init(el.current);
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, true);
  }, [option]);

  return <div ref={el} className={className} style={{ height, width: '100%' }} />;
}

export const CHART_COLORS = { navy: '#083d6b', gold: '#d99a00', green: '#15803d', red: '#c62828', grey: '#94a3b8' };
