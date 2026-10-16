import React, { useEffect, useRef } from 'react';

export interface NoiseDataPoint {
  snr: number;
  icaSdr: number;
  pcaSdr: number;
}

interface NoiseSdrChartProps {
  data: NoiseDataPoint[];
  height?: number;
}

export const NoiseSdrChart: React.FC<NoiseSdrChartProps> = ({ data, height = 280 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 600;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Margins
    const padLeft = 55;
    const padRight = 30;
    const padTop = 35;
    const padBottom = 45;

    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, width, height);

    // Coordinate ranges
    // SNR: 40 dB (left) to 0 dB (right) or 0 to 40
    // Prompt: SNR in [40, 30, 20, 10, 5, 0] dB
    const minSnr = 0;
    const maxSnr = 40;

    // Compute SDR min and max
    let minSdr = 0;
    let maxSdr = 0;
    for (const d of data) {
      if (d.icaSdr > maxSdr) maxSdr = d.icaSdr;
      if (d.pcaSdr > maxSdr) maxSdr = d.pcaSdr;
      if (d.icaSdr < minSdr) minSdr = d.icaSdr;
      if (d.pcaSdr < minSdr) minSdr = d.pcaSdr;
    }
    // Round up maxSdr to next multiple of 5 or 10, minimum 35
    maxSdr = Math.max(35, Math.ceil((maxSdr + 5) / 5) * 5);
    minSdr = Math.min(0, Math.floor(minSdr / 5) * 5);

    const xPos = (snr: number) => {
      // 40 on left, 0 on right (or standard 0 on left, 40 on right)
      // Usually decreasing noise (higher SNR) goes left-to-right (0 to 40)
      return padLeft + ((snr - minSnr) / (maxSnr - minSnr)) * plotW;
    };

    const yPos = (sdr: number) => {
      const clamped = Math.max(minSdr, Math.min(maxSdr, sdr));
      return padTop + plotH - ((clamped - minSdr) / (maxSdr - minSdr)) * plotH;
    };

    // Draw Grid Lines & Y ticks
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px font-mono, monospace';
    ctx.textAlign = 'right';

    const numYTicks = 6;
    for (let i = 0; i <= numYTicks; i++) {
      const val = minSdr + (i / numYTicks) * (maxSdr - minSdr);
      const y = yPos(val);

      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillText(`${Math.round(val)} dB`, padLeft - 8, y + 4);
    }

    // X ticks (0, 5, 10, 20, 30, 40)
    ctx.textAlign = 'center';
    const xTicks = [0, 5, 10, 20, 30, 40];
    for (const snr of xTicks) {
      const x = xPos(snr);
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, padTop + plotH);
      ctx.stroke();

      ctx.fillText(`${snr}`, x, padTop + plotH + 18);
    }

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px font-sans, sans-serif';
    ctx.fillText('Recording Signal-to-Noise Ratio (SNR in dB)', padLeft + plotW / 2, height - 10);

    ctx.save();
    ctx.translate(14, padTop + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Separation Quality (Average SDR in dB)', 0, 0);
    ctx.restore();

    // Sort data by ascending SNR for clean line drawing
    const sorted = [...data].sort((a, b) => a.snr - b.snr);

    // Draw PCA line (dashed amber/orange)
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    sorted.forEach((p, idx) => {
      const x = xPos(p.snr);
      const y = yPos(p.pcaSdr);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // PCA points
    ctx.fillStyle = '#f59e0b';
    sorted.forEach((p) => {
      const x = xPos(p.snr);
      const y = yPos(p.pcaSdr);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw ICA line (solid cyan/sky)
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    sorted.forEach((p, idx) => {
      const x = xPos(p.snr);
      const y = yPos(p.icaSdr);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // ICA points
    ctx.fillStyle = '#06b6d4';
    sorted.forEach((p) => {
      const x = xPos(p.snr);
      const y = yPos(p.icaSdr);
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Legend
    const legendX = width - padRight - 190;
    const legendY = padTop + 10;

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.fillRect(legendX, legendY, 180, 52);
    ctx.strokeRect(legendX, legendY, 180, 52);

    // ICA legend item
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(legendX + 12, legendY + 18);
    ctx.lineTo(legendX + 38, legendY + 18);
    ctx.stroke();
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(legendX + 25, legendY + 18, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '11px font-sans, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FastICA (Separated)', legendX + 46, legendY + 22);

    // PCA legend item
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(legendX + 12, legendY + 38);
    ctx.lineTo(legendX + 38, legendY + 38);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(legendX + 25, legendY + 38, 3.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f1f5f9';
    ctx.fillText('PCA Whitening Only', legendX + 46, legendY + 42);
  }, [data, height]);

  return (
    <div className="w-full overflow-hidden rounded border border-slate-800 bg-slate-950 p-2">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, display: 'block' }}
      />
    </div>
  );
};
