import React, { useState } from 'react';
import { PlayCircle, RotateCw, AlertCircle } from 'lucide-react';
import { GlobalSessionState } from './SeparateTab.tsx';
import { NoiseSdrChart, NoiseDataPoint } from './Charts.tsx';
import { AudioItemPlayer } from './AudioItemPlayer.tsx';
import {
  mulberry32,
  boxMullerGaussian,
  separate,
  evaluateSeparation,
} from '../utils/math.ts';
import { stopCurrentPlayback } from '../utils/audio.ts';

interface NoiseExperimentTabProps {
  sessionState: GlobalSessionState | null;
}

interface SnrOutputs {
  snr: number;
  icaSignals: Float64Array[];
}

export const NoiseExperimentTab: React.FC<NoiseExperimentTabProps> = ({ sessionState }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [tableData, setTableData] = useState<NoiseDataPoint[]>([]);
  const [savedOutputs, setSavedOutputs] = useState<Map<number, Float64Array[]>>(new Map());
  const [selectedSnr, setSelectedSnr] = useState<number>(40);

  // If Tab 1 was not run in Mode A:
  if (!sessionState || sessionState.mode !== 'modeA' || !sessionState.S || !sessionState.X) {
    return (
      <div className="rounded border border-slate-800 bg-slate-900/60 p-8 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-amber-400 mb-3" />
        <h3 className="text-sm font-semibold text-slate-200 mb-1">
          Ground Truth Clean Audio Required
        </h3>
        <p className="text-xs text-slate-400 max-w-lg mx-auto">
          Run the Separate tab in Mode A (individual sounds) first, because this experiment needs the clean originals to score against.
        </p>
      </div>
    );
  }

  const { S, X, sampleRate } = sessionState;
  const N = S.length;
  const numSamples = S[0].length;

  const runExperiment = async () => {
    stopCurrentPlayback();
    setIsRunning(true);
    setTableData([]);
    const snrLevels = [40, 30, 20, 10, 5, 0];
    const results: NoiseDataPoint[] = [];
    const outputsMap = new Map<number, Float64Array[]>();

    try {
      // Seeded PRNG, seed 0, one continuing stream across all SNRs and rows
      const rng = mulberry32(0);

      for (let sIdx = 0; sIdx < snrLevels.length; sIdx++) {
        const snr = snrLevels[sIdx];
        setProgressMsg(`Evaluating SNR = ${snr} dB (${sIdx + 1}/${snrLevels.length})...`);
        await new Promise((r) => setTimeout(r, 15));

        // Create noisy mixtures Xn
        const Xn: Float64Array[] = Array.from({ length: N }, () => new Float64Array(numSamples));

        for (let k = 0; k < N; k++) {
          const Xk = X[k];
          let sumSq = 0;
          for (let i = 0; i < numSamples; i++) sumSq += Xk[i] * Xk[i];
          const signalPower = sumSq / numSamples;
          const noisePower = signalPower / Math.pow(10, snr / 10);
          const noiseStd = Math.sqrt(noisePower);

          const row = Xn[k];
          for (let i = 0; i < numSamples; i++) {
            const g = boxMullerGaussian(rng);
            row[i] = Xk[i] + g * noiseStd;
          }
        }

        // Run separate(Xn, N)
        const sepResult = await separate(Xn, N);

        // Normalize separated sources for listening
        const normalizedIca = sepResult.ica.map((sig) => {
          let maxAbs = 0;
          for (let i = 0; i < sig.length; i++) {
            const a = Math.abs(sig[i]);
            if (a > maxAbs) maxAbs = a;
          }
          const res = new Float64Array(sig.length);
          const sc = maxAbs > 0 ? 1.0 / maxAbs : 1.0;
          for (let i = 0; i < sig.length; i++) res[i] = sig[i] * sc;
          return res;
        });

        outputsMap.set(snr, normalizedIca);

        // Score both result.ica and result.pca with evaluate() against S
        const evalIca = evaluateSeparation(S, sepResult.ica);
        const evalPca = evaluateSeparation(S, sepResult.pca);

        results.push({
          snr,
          icaSdr: evalIca.averageSDR,
          pcaSdr: evalPca.averageSDR,
        });

        setTableData([...results]);
        setSavedOutputs(new Map(outputsMap));
      }
    } finally {
      setIsRunning(false);
      setProgressMsg('');
    }
  };

  const currentSnrSignals = savedOutputs.get(selectedSnr);

  return (
    <div className="flex flex-col gap-6">
      {/* Intro & Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-slate-800 bg-slate-900/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Noise Robustness Analysis across SNR Spectrum
          </h3>
          <p className="text-xs text-slate-400">
            Tests FastICA and PCA whitening against additive Gaussian noise from 40 dB (clean) down to 0 dB (heavy noise).
          </p>
        </div>

        <button
          type="button"
          disabled={isRunning}
          onClick={runExperiment}
          className="flex items-center gap-2 rounded bg-cyan-600 px-4 py-2 text-xs font-mono font-medium text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isRunning ? (
            <>
              <RotateCw className="h-3.5 w-3.5 animate-spin" />
              <span>{progressMsg || 'Calculating...'}</span>
            </>
          ) : (
            <>
              <PlayCircle className="h-3.5 w-3.5" />
              <span>Run Noise Experiment</span>
            </>
          )}
        </button>
      </div>

      {tableData.length > 0 && (
        <div className="flex flex-col gap-6">
          {/* Table & Chart Split */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Table */}
            <div className="rounded border border-slate-800 bg-slate-900/40 p-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
                Separation Quality Metrics
              </h4>
              <table className="font-mono text-xs text-slate-300 border-collapse w-full">
                <thead>
                  <tr className="bg-slate-950">
                    <th className="border border-slate-800 px-3 py-2 text-left">SNR (dB)</th>
                    <th className="border border-slate-800 px-3 py-2 text-right text-cyan-400">ICA SDR</th>
                    <th className="border border-slate-800 px-3 py-2 text-right text-amber-400">PCA SDR</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row) => (
                    <tr key={row.snr} className="hover:bg-slate-900">
                      <td className="border border-slate-800 px-3 py-1.5 font-medium">{row.snr} dB</td>
                      <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-cyan-300 font-semibold">
                        {row.icaSdr.toFixed(2)} dB
                      </td>
                      <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-amber-300">
                        {row.pcaSdr.toFixed(2)} dB
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Line Chart */}
            <div className="lg:col-span-2 rounded border border-slate-800 bg-slate-900/40 p-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                Empirical SDR vs. SNR Characteristic Curve
              </h4>
              <NoiseSdrChart data={tableData} height={260} />
            </div>
          </div>

          {/* Theoretical explanation text */}
          <div className="rounded border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300 leading-relaxed font-sans">
            PCA stays flat because it never separates the sources. ICA improves as the recordings get cleaner. At very high noise both methods are limited by noise.
          </div>

          {/* SNR Audio Inspection Dropdown */}
          <div className="flex flex-col gap-3 rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Acoustic Inspection by Noise Level
                </h4>
                <p className="text-xs text-slate-400">
                  Listen to and download the recovered audio signals at different noise levels.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="snr-select" className="text-xs font-mono text-slate-300">
                  Select SNR:
                </label>
                <select
                  id="snr-select"
                  value={selectedSnr}
                  onChange={(e) => setSelectedSnr(Number(e.target.value))}
                  className="rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {[40, 30, 20, 10, 5, 0].map((level) => (
                    <option key={level} value={level}>
                      {level} dB SNR {level === 40 ? '(Near Clean)' : level === 0 ? '(High Noise)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {currentSnrSignals ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                {currentSnrSignals.map((sig, idx) => (
                  <AudioItemPlayer
                    key={idx}
                    title={`ICA Output ${idx + 1} (${selectedSnr} dB SNR)`}
                    data={sig}
                    sampleRate={sampleRate}
                    color="#06b6d4"
                    downloadFilename={`ica_snr_${selectedSnr}db_source_${idx + 1}`}
                  />
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Run the noise experiment above to generate audio outputs for this level.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
