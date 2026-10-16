import React, { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  data: Float64Array;
  height?: number;
  color?: string;
  className?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  data,
  height = 56,
  color = '#0284c7', // sky-600
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 300;
    const h = height;

    canvas.width = width * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Clear background
    ctx.fillStyle = '#0f172a'; // dark slate
    ctx.fillRect(0, 0, width, h);

    // Zero-line
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(width, h / 2);
    ctx.stroke();

    // Waveform: min/max per column
    const step = data.length / width;
    ctx.fillStyle = color;

    for (let x = 0; x < width; x++) {
      const startIdx = Math.floor(x * step);
      const endIdx = Math.min(data.length, Math.floor((x + 1) * step));

      let min = 1.0;
      let max = -1.0;

      for (let i = startIdx; i < endIdx; i++) {
        const val = data[i];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      if (min > max) {
        min = 0;
        max = 0;
      }

      const yMin = ((1.0 - max) * 0.5) * (h - 4) + 2;
      const yMax = ((1.0 - min) * 0.5) * (h - 4) + 2;
      const barHeight = Math.max(1, yMax - yMin);

      ctx.fillRect(x, yMin, 1, barHeight);
    }
  }, [data, height, color]);

  return (
    <div className={`w-full overflow-hidden rounded border border-slate-700 bg-slate-900 ${className}`}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  );
};

interface WindowComparisonPlotProps {
  original: Float64Array;
  mixed: Float64Array;
  recovered: Float64Array;
  startIndex: number;
  windowSize: number;
  sourceIdx: number;
}

export const WindowComparisonPlot: React.FC<WindowComparisonPlotProps> = ({
  original,
  mixed,
  recovered,
  startIndex,
  windowSize,
  sourceIdx,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 600;
    const height = 90;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    const colWidth = width / 3;
    const colPad = 6;

    // Helper to draw single waveform column
    const drawColumn = (
      colIdx: number,
      title: string,
      drawSignals: Array<{ data: Float64Array; color: string; width: number; isFilled?: boolean }>
    ) => {
      const x0 = colIdx * colWidth;
      const plotW = colWidth - colPad * 2;
      const plotH = height - 28;
      const yMid = 22 + plotH / 2;

      // Col title
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px font-mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title, x0 + colWidth / 2, 14);

      // Border box
      ctx.strokeStyle = '#1e293b';
      ctx.strokeRect(x0 + colPad, 20, plotW, plotH);

      // Centerline
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(x0 + colPad, yMid);
      ctx.lineTo(x0 + colPad + plotW, yMid);
      ctx.stroke();

      for (const sig of drawSignals) {
        ctx.strokeStyle = sig.color;
        ctx.lineWidth = sig.width;
        ctx.beginPath();

        for (let i = 0; i < windowSize; i++) {
          const sample = sig.data[startIndex + i] || 0;
          const x = x0 + colPad + (i / (windowSize - 1)) * plotW;
          // Clamp normalized sample to [-1.2, 1.2]
          const clamped = Math.max(-1.2, Math.min(1.2, sample));
          const y = yMid - (clamped / 1.2) * (plotH * 0.45);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    };

    // Col 1: Original source
    drawColumn(0, `Source ${sourceIdx + 1} (Original)`, [
      { data: original, color: '#38bdf8', width: 1.5 },
    ]);

    // Col 2: Mixed signal
    drawColumn(1, `Mixed Signal`, [
      { data: mixed, color: '#fbbf24', width: 1.5 },
    ]);

    // Col 3: Recovered (thin red) over original (thick light gray)
    drawColumn(2, `Recovered (Red) vs Orig (Gray)`, [
      { data: original, color: '#64748b', width: 3.5 },
      { data: recovered, color: '#ef4444', width: 1.5 },
    ]);
  }, [original, mixed, recovered, startIndex, windowSize, sourceIdx]);

  return (
    <div className="w-full overflow-hidden rounded border border-slate-800 bg-slate-950">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '90px', display: 'block' }}
      />
    </div>
  );
};
