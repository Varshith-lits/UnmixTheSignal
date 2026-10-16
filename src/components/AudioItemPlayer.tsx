import React, { useState } from 'react';
import { Play, Square, Download, Trash2 } from 'lucide-react';
import { WaveformCanvas } from './WaveformCanvas.tsx';
import { playAudioData, stopCurrentPlayback, triggerWavDownload } from '../utils/audio.ts';

interface AudioItemPlayerProps {
  title: string;
  subtitle?: string;
  data: Float64Array;
  sampleRate: number;
  color?: string;
  downloadFilename?: string;
  onDelete?: () => void;
}

export const AudioItemPlayer: React.FC<AudioItemPlayerProps> = ({
  title,
  subtitle,
  data,
  sampleRate,
  color = '#0284c7',
  downloadFilename,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const durationSec = data.length > 0 && sampleRate > 0 ? (data.length / sampleRate).toFixed(2) : '0.00';

  const handlePlayToggle = () => {
    if (isPlaying) {
      stopCurrentPlayback();
      setIsPlaying(false);
    } else {
      playAudioData(data, sampleRate, (playing) => {
        setIsPlaying(playing);
      });
    }
  };

  const handleDownload = () => {
    const fn = downloadFilename || title.toLowerCase().replace(/[^a-z0-9]/g, '_');
    triggerWavDownload(data, sampleRate, fn);
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-slate-800 bg-slate-900/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-sm font-medium text-slate-100">{title}</span>
            <span className="font-mono text-xs text-slate-400">{durationSec}s</span>
          </div>
          {subtitle && <p className="truncate text-xs text-slate-400">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePlayToggle}
            aria-label={isPlaying ? `Stop ${title}` : `Play ${title}`}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-mono font-medium transition-colors ${
              isPlaying
                ? 'bg-rose-600 text-white hover:bg-rose-500'
                : 'bg-cyan-600 text-white hover:bg-cyan-500'
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            aria-label={`Download WAV for ${title}`}
            className="flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>WAV</span>
          </button>
        </div>
      </div>

      <WaveformCanvas data={data} height={44} color={color} />
    </div>
  );
};
