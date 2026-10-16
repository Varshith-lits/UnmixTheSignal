import React, { useState } from 'react';
import {
  Upload,
  Plus,
  Trash2,
  Sparkles,
  PlayCircle,
  CheckCircle,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { AudioItemPlayer } from './AudioItemPlayer.tsx';
import { WindowComparisonPlot } from './WaveformCanvas.tsx';
import {
  mulberry32,
  matrixConditionNumber,
  separate,
  evaluateSeparation,
  crossCorrelationFFT,
  peakXcorr,
  MatchResult,
} from '../utils/math.ts';
import { decodeAudioFile, getAudioContext, stopCurrentPlayback } from '../utils/audio.ts';
import { generateSyntheticSources } from '../utils/audioSynth.ts';

export interface GlobalSessionState {
  sampleRate: number;
  mode: 'modeA' | 'modeB';
  sourceNames: string[];
  S?: Float64Array[]; // Mode A only
  X: Float64Array[];
  S_est: Float64Array[];
  Z: Float64Array[];
}

interface SeparateTabProps {
  maxSeconds: number;
  sessionState: GlobalSessionState | null;
  setSessionState: React.Dispatch<React.SetStateAction<GlobalSessionState | null>>;
}

interface LoadedAudioItem {
  id: string;
  name: string;
  data: Float64Array;
  duration: number;
}

export const SeparateTab: React.FC<SeparateTabProps> = ({
  maxSeconds,
  sessionState,
  setSessionState,
}) => {
  const [mode, setMode] = useState<'modeA' | 'modeB'>('modeA');
  const [alignInTime, setAlignInTime] = useState(true);

  // Files loaded in UI
  const [sourcesA, setSourcesA] = useState<LoadedAudioItem[]>([]);
  const [mixturesB, setMixturesB] = useState<LoadedAudioItem[]>([]);
  const [originalsB, setOriginalsB] = useState<LoadedAudioItem[]>([]);

  // Computation status
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Output results
  const [mixingMatrixA, setMixingMatrixA] = useState<number[][] | null>(null);
  const [conditionNumA, setConditionNumA] = useState<number | null>(null);
  const [generatedMixturesA, setGeneratedMixturesA] = useState<Float64Array[]>([]);

  const [timeOffsetsB, setTimeOffsetsB] = useState<number[]>([]);

  // Whitening & ICA Results
  const [covZ, setCovZ] = useState<number[][] | null>(null);
  const [isCovZIdentity, setIsCovZIdentity] = useState<boolean | null>(null);
  const [convergenceMsg, setConvergenceMsg] = useState<string | null>(null);
  const [separatedSignals, setSeparatedSignals] = useState<Float64Array[]>([]);

  // Mode A Evaluation
  const [evalIca, setEvalIca] = useState<{
    corrMatrix: number[][];
    matches: MatchResult[];
    alignedSignals: Float64Array[];
    averageSDR: number;
  } | null>(null);

  const [evalPca, setEvalPca] = useState<{
    corrMatrix: number[][];
    matches: MatchResult[];
    averageSDR: number;
  } | null>(null);

  // Mode A 50ms plot window state
  const [bestWindowBlock, setBestWindowBlock] = useState<{
    startIndex: number;
    windowSize: number;
  } | null>(null);

  // Mode B with originals evaluation
  const [modeBPeakScores, setModeBPeakScores] = useState<{
    rawScores: number[][];
    icaScores: number[][];
    summaries: Array<{ name: string; bestRaw: number; bestIca: number; icaBetter: boolean }>;
  } | null>(null);

  // Load Demo Audio Preset
  const handleLoadDemoSources = () => {
    stopCurrentPlayback();
    setErrorMessage(null);
    const ctx = getAudioContext(22050);
    const demo = generateSyntheticSources(ctx.sampleRate, 6.0);
    const items: LoadedAudioItem[] = demo.map((d, i) => ({
      id: `demo-${i}-${Date.now()}`,
      name: d.name,
      data: d.data,
      duration: d.duration,
    }));
    setSourcesA(items);
  };

  // Upload handlers
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetList: 'modeA' | 'modeB_mix' | 'modeB_orig'
  ) => {
    stopCurrentPlayback();
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      setErrorMessage(null);
      const ctx = getAudioContext(22050);
      const newItems: LoadedAudioItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const decoded = await decodeAudioFile(file, ctx, maxSeconds);
        newItems.push({
          id: `${file.name}-${Date.now()}-${i}`,
          name: decoded.name,
          data: decoded.data,
          duration: decoded.duration,
        });
      }

      if (targetList === 'modeA') {
        setSourcesA((prev) => {
          const combined = [...prev, ...newItems];
          return combined.slice(0, 5); // limit 2-5
        });
      } else if (targetList === 'modeB_mix') {
        setMixturesB((prev) => {
          const combined = [...prev, ...newItems];
          return combined.slice(0, 5);
        });
      } else {
        setOriginalsB((prev) => {
          const combined = [...prev, ...newItems];
          return combined.slice(0, 5);
        });
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? `Audio decode error: ${err.message}` : 'Failed to decode audio file'
      );
    } finally {
      e.target.value = '';
    }
  };

  const removeSourceA = (idx: number) => {
    setSourcesA((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeMixtureB = (idx: number) => {
    setMixturesB((prev) => prev.filter((_, i) => i !== idx));
  };

  const removeOriginalB = (idx: number) => {
    setOriginalsB((prev) => prev.filter((_, i) => i !== idx));
  };

  // Yield helper to prevent UI freezing
  const yieldToBrowser = (msg: string) => {
    setProgressMsg(msg);
    return new Promise<void>((resolve) => setTimeout(resolve, 15));
  };

  // Run Separation
  const handleRunSeparation = async () => {
    stopCurrentPlayback();
    setErrorMessage(null);
    setIsProcessing(true);
    setProgressMsg('Initializing AudioContext...');

    try {
      const ctx = getAudioContext(22050);
      const sr = ctx.sampleRate;

      if (mode === 'modeA') {
        if (sourcesA.length < 2) {
          throw new Error('Mode A requires at least 2 clean audio files (maximum 5).');
        }
        const N = sourcesA.length;

        await yieldToBrowser(`Synchronizing ${N} signals to shortest duration...`);
        const minLen = Math.min(...sourcesA.map((s) => s.data.length));
        if (minLen < 500) {
          throw new Error('Audio clips are too short (less than 500 samples).');
        }

        // Stack into S (one row per source)
        const S: Float64Array[] = sourcesA.map((s) => s.data.slice(0, minLen));

        // Determine mixing matrix A
        await yieldToBrowser('Generating mixing matrix...');
        let A: number[][];
        let cond: number;

        if (N === 2) {
          A = [
            [0.6, 0.4],
            [0.3, 0.7],
          ];
          cond = matrixConditionNumber(A);
        } else {
          // Draw A with seeded PRNG (seed 42), entries in [0.2, 1.0], redraw until cond < 30
          const rng = mulberry32(42);
          let attempts = 0;
          do {
            A = Array.from({ length: N }, () =>
              Array.from({ length: N }, () => 0.2 + 0.8 * rng())
            );
            cond = matrixConditionNumber(A);
            attempts++;
          } while (cond >= 30 && attempts < 500);
        }

        setMixingMatrixA(A);
        setConditionNumA(cond);

        // Mix: X = A * S
        await yieldToBrowser('Mixing signals X = A * S...');
        const X: Float64Array[] = Array.from({ length: N }, () => new Float64Array(minLen));
        for (let i = 0; i < N; i++) {
          const Xi = X[i];
          const Ai = A[i];
          for (let s = 0; s < minLen; s++) {
            let sum = 0;
            for (let j = 0; j < N; j++) {
              sum += Ai[j] * S[j][s];
            }
            Xi[s] = sum;
          }
        }
        setGeneratedMixturesA(X);

        // Separate
        await yieldToBrowser('Running PCA Whitening and FastICA...');
        const sepResult = await separate(X, N, yieldToBrowser);

        // Check whitened covariance
        const cov = sepResult.covariance_Z;
        setCovZ(cov);
        let isId = true;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const exp = i === j ? 1 : 0;
            if (Math.abs(cov[i][j] - exp) > 1e-3) {
              isId = false;
            }
          }
        }
        setIsCovZIdentity(isId);
        setConvergenceMsg(sepResult.convergenceMessage);

        // Normalize separated sources by max absolute value
        const S_est_norm: Float64Array[] = sepResult.ica.map((sig) => {
          let maxAbs = 0;
          for (let s = 0; s < sig.length; s++) {
            const a = Math.abs(sig[s]);
            if (a > maxAbs) maxAbs = a;
          }
          const res = new Float64Array(sig.length);
          const sc = maxAbs > 0 ? 1.0 / maxAbs : 1.0;
          for (let s = 0; s < sig.length; s++) res[s] = sig[s] * sc;
          return res;
        });
        setSeparatedSignals(S_est_norm);

        // Evaluation
        await yieldToBrowser('Evaluating ICA and PCA-only SDR & correlations...');
        const evalResultIca = evaluateSeparation(S, sepResult.ica);
        const evalResultPca = evaluateSeparation(S, sepResult.pca);

        setEvalIca(evalResultIca);
        setEvalPca(evalResultPca);

        // 50 ms window block selection
        const blockSize = Math.max(1, Math.round(0.05 * sr));
        const numBlocks = Math.floor(minLen / blockSize);

        if (numBlocks > 0) {
          // Compute RMS per block divided by source max block RMS
          const normRMS: number[][] = Array.from({ length: N }, () => new Array(numBlocks));
          for (let i = 0; i < N; i++) {
            const blockRmsList = new Float64Array(numBlocks);
            let maxBlockRms = 0;
            for (let b = 0; b < numBlocks; b++) {
              let sumSq = 0;
              const start = b * blockSize;
              for (let k = 0; k < blockSize; k++) {
                const val = S[i][start + k];
                sumSq += val * val;
              }
              const rms = Math.sqrt(sumSq / blockSize);
              blockRmsList[b] = rms;
              if (rms > maxBlockRms) maxBlockRms = rms;
            }
            for (let b = 0; b < numBlocks; b++) {
              normRMS[i][b] = maxBlockRms > 0 ? blockRmsList[b] / maxBlockRms : 0;
            }
          }

          // Pick block where minimum across sources is largest
          let bestB = 0;
          let maxMinRms = -1;
          for (let b = 0; b < numBlocks; b++) {
            let minR = 1.0;
            for (let i = 0; i < N; i++) {
              if (normRMS[i][b] < minR) minR = normRMS[i][b];
            }
            if (minR > maxMinRms) {
              maxMinRms = minR;
              bestB = b;
            }
          }

          setBestWindowBlock({
            startIndex: bestB * blockSize,
            windowSize: blockSize,
          });
        }

        // Store session state for Tab 2 and 3
        setSessionState({
          sampleRate: sr,
          mode: 'modeA',
          sourceNames: sourcesA.map((s) => s.name),
          S,
          X,
          S_est: S_est_norm,
          Z: sepResult.pca,
        });
      } else {
        // MODE B: User uploaded mixed recordings
        if (mixturesB.length < 2) {
          throw new Error('Mode B requires at least 2 mixed recordings (maximum 5).');
        }
        const M = mixturesB.length;

        let alignedX: Float64Array[] = [];
        const lagsInSeconds: number[] = [0];

        if (alignInTime) {
          await yieldToBrowser('Cross-correlating mixtures for cross-device time alignment...');
          const ref = mixturesB[0].data;
          const max20SecSamples = Math.min(Math.round(20 * sr), ref.length);
          const ref20 = ref.slice(0, max20SecSamples);

          const shiftedList: Float64Array[] = [ref];
          const calculatedLags: number[] = [0];

          for (let m = 1; m < M; m++) {
            const other = mixturesB[m].data;
            const other20 = other.slice(0, Math.min(Math.round(20 * sr), other.length));

            const { c, N: Nfft } = crossCorrelationFFT(ref20, other20);
            const searchLagSamples = Math.min(Math.round(3 * sr), Math.floor(Nfft / 2) - 1);

            let bestLag = 0;
            let maxAbsC = -1;

            // Search |lag| <= 3 seconds
            // lag l >= 0: at index l
            for (let l = 0; l <= searchLagSamples; l++) {
              const val = Math.abs(c[l]);
              if (val > maxAbsC) {
                maxAbsC = val;
                bestLag = l;
              }
            }
            // lag -l: at index Nfft - l
            for (let l = 1; l <= searchLagSamples; l++) {
              const val = Math.abs(c[Nfft - l]);
              if (val > maxAbsC) {
                maxAbsC = val;
                bestLag = -l;
              }
            }

            calculatedLags.push(bestLag);
            lagsInSeconds.push(bestLag / sr);

            // Shift
            if (bestLag > 0) {
              const shifted = new Float64Array(other.length + bestLag);
              shifted.set(other, bestLag);
              shiftedList.push(shifted);
            } else if (bestLag < 0) {
              const skip = -bestLag;
              const shifted = other.slice(skip);
              shiftedList.push(shifted);
            } else {
              shiftedList.push(other);
            }
          }

          setTimeOffsetsB(lagsInSeconds);

          // Drop first max(0, max(lags)) samples from every aligned signal
          const maxLag = Math.max(0, ...calculatedLags);
          const trimmedList = shiftedList.map((sig) => (sig.length > maxLag ? sig.slice(maxLag) : sig));
          const shortest = Math.min(...trimmedList.map((s) => s.length));
          alignedX = trimmedList.map((s) => s.slice(0, shortest));
        } else {
          const shortest = Math.min(...mixturesB.map((s) => s.data.length));
          alignedX = mixturesB.map((s) => s.data.slice(0, shortest));
          setTimeOffsetsB(mixturesB.map(() => 0));
        }

        // Run separate on alignedX
        await yieldToBrowser(`Running FastICA on ${M} mixed channels...`);
        const sepResult = await separate(alignedX, M, yieldToBrowser);

        // Verify covariance
        const cov = sepResult.covariance_Z;
        setCovZ(cov);
        let isId = true;
        for (let i = 0; i < M; i++) {
          for (let j = 0; j < M; j++) {
            const exp = i === j ? 1 : 0;
            if (Math.abs(cov[i][j] - exp) > 1e-3) isId = false;
          }
        }
        setIsCovZIdentity(isId);
        setConvergenceMsg(sepResult.convergenceMessage);

        // Normalize separated sources
        const S_est_norm: Float64Array[] = sepResult.ica.map((sig) => {
          let maxAbs = 0;
          for (let s = 0; s < sig.length; s++) {
            const a = Math.abs(sig[s]);
            if (a > maxAbs) maxAbs = a;
          }
          const res = new Float64Array(sig.length);
          const sc = maxAbs > 0 ? 1.0 / maxAbs : 1.0;
          for (let s = 0; s < sig.length; s++) res[s] = sig[s] * sc;
          return res;
        });
        setSeparatedSignals(S_est_norm);

        // Mode B with originals scoring (optional)
        if (originalsB.length > 0) {
          await yieldToBrowser('Computing peak cross-correlations against provided originals...');
          const rawScores: number[][] = [];
          const icaScores: number[][] = [];
          const summaries: Array<{
            name: string;
            bestRaw: number;
            bestIca: number;
            icaBetter: boolean;
          }> = [];

          for (let i = 0; i < originalsB.length; i++) {
            const orig = originalsB[i].data;
            const rRow: number[] = [];
            for (let j = 0; j < alignedX.length; j++) {
              rRow.push(peakXcorr(orig, alignedX[j], sr, 5, 20));
            }
            rawScores.push(rRow);

            const iRow: number[] = [];
            for (let j = 0; j < S_est_norm.length; j++) {
              iRow.push(peakXcorr(orig, S_est_norm[j], sr, 5, 20));
            }
            icaScores.push(iRow);

            const bestRaw = Math.max(...rRow);
            const bestIca = Math.max(...iRow);
            summaries.push({
              name: originalsB[i].name,
              bestRaw,
              bestIca,
              icaBetter: bestIca > bestRaw,
            });
          }

          setModeBPeakScores({ rawScores, icaScores, summaries });
        } else {
          setModeBPeakScores(null);
        }

        // Store session state
        setSessionState({
          sampleRate: sr,
          mode: 'modeB',
          sourceNames: mixturesB.map((m) => m.name),
          X: alignedX,
          S_est: S_est_norm,
          Z: sepResult.pca,
        });
      }
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'An error occurred during separation.'
      );
    } finally {
      setIsProcessing(false);
      setProgressMsg('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Mode Selector */}
      <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
        <label className="mb-2 block text-xs font-mono uppercase tracking-wider text-slate-400">
          Source Separation Workflow Mode
        </label>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setMode('modeA');
              setSeparatedSignals([]);
            }}
            className={`flex flex-col gap-1 rounded border p-3.5 text-left transition-colors ${
              mode === 'modeA'
                ? 'border-cyan-500 bg-cyan-950/30 text-white'
                : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="font-semibold text-sm">
              Mode A: Individual Clean Sounds
            </span>
            <span className="text-xs text-slate-400">
              Upload clean source audio files. The engine synthesizes a linear mixture matrix, separates them, and runs full ground-truth evaluation and PCA comparisons.
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('modeB');
              setSeparatedSignals([]);
            }}
            className={`flex flex-col gap-1 rounded border p-3.5 text-left transition-colors ${
              mode === 'modeB'
                ? 'border-cyan-500 bg-cyan-950/30 text-white'
                : 'border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-700'
            }`}
          >
            <span className="font-semibold text-sm">
              Mode B: Mixed Recordings
            </span>
            <span className="text-xs text-slate-400">
              Upload already-mixed microphone recordings. Includes optional cross-device time alignment and optional ground truth scoring.
            </span>
          </button>
        </div>
      </div>

      {/* MODE A INPUTS */}
      {mode === 'modeA' && (
        <div className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">
                Individual Clean Audio Sources (2 to 5 files)
              </h3>
              <p className="text-xs text-slate-400">
                Upload any browser-decodable audio (WAV, MP3, FLAC, M4A, OGG) or load synthetic audio.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLoadDemoSources}
                className="flex items-center gap-1.5 rounded border border-cyan-800 bg-cyan-950/50 px-3 py-1.5 text-xs font-mono text-cyan-300 hover:bg-cyan-900/60 transition-colors"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Load Sample Audio Pack</span>
              </button>

              <label className="flex cursor-pointer items-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-xs font-mono font-medium text-white hover:bg-cyan-500 transition-colors">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Audio Files</span>
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => handleFileUpload(e, 'modeA')}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {sourcesA.length === 0 ? (
            <div className="rounded border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
              No files loaded yet. Click &quot;Load Sample Audio Pack&quot; for an instant demo or upload your own files.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {sourcesA.map((item, idx) => (
                <div key={item.id} className="relative group">
                  <AudioItemPlayer
                    title={`Source ${idx + 1}: ${item.name}`}
                    data={item.data}
                    sampleRate={22050}
                    color="#0284c7"
                    downloadFilename={`clean_source_${idx + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeSourceA(idx)}
                    aria-label={`Remove source ${idx + 1}`}
                    className="absolute top-2 right-2 rounded bg-slate-800 p-1 text-slate-400 hover:bg-rose-900 hover:text-white transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {sourcesA.length < 5 && sourcesA.length >= 2 && (
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-mono text-cyan-400 hover:text-cyan-300">
              <Plus className="h-3.5 w-3.5" />
              <span>Add another file ({sourcesA.length}/5)</span>
              <input
                type="file"
                multiple
                accept="audio/*"
                onChange={(e) => handleFileUpload(e, 'modeA')}
                className="hidden"
              />
            </label>
          )}
        </div>
      )}

      {/* MODE B INPUTS */}
      {mode === 'modeB' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  Mixed Recordings (2 to 5 files)
                </h3>
                <p className="text-xs text-slate-400">
                  Upload audio mixtures recorded from multiple microphones or channels.
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-xs font-mono font-medium text-white hover:bg-cyan-500 transition-colors">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Mixed Recordings</span>
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => handleFileUpload(e, 'modeB_mix')}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="align-time"
                checked={alignInTime}
                onChange={(e) => setAlignInTime(e.target.checked)}
                className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
              />
              <label htmlFor="align-time" className="text-xs font-medium text-slate-300">
                These were recorded on different devices - align them in time
              </label>
            </div>

            {mixturesB.length === 0 ? (
              <div className="rounded border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
                No mixed recordings uploaded.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {mixturesB.map((item, idx) => (
                  <div key={item.id} className="relative group">
                    <AudioItemPlayer
                      title={`Recording ${idx + 1}: ${item.name}`}
                      data={item.data}
                      sampleRate={22050}
                      color="#f59e0b"
                      downloadFilename={`raw_mixture_${idx + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeMixtureB(idx)}
                      aria-label={`Remove mixture ${idx + 1}`}
                      className="absolute top-2 right-2 rounded bg-slate-800 p-1 text-slate-400 hover:bg-rose-900 hover:text-white transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Optional Clean Originals for Scoring */}
          <div className="flex flex-col gap-3 rounded border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-semibold text-slate-300">
                  Original Clean Sounds (Optional, only to score the result)
                </h4>
                <p className="text-xs text-slate-400">
                  If available, upload ground truth audio to compute peak cross-correlation comparisons.
                </p>
              </div>

              <label className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-mono text-slate-300 hover:bg-slate-700 transition-colors">
                <Upload className="h-3.5 w-3.5" />
                <span>Upload Originals</span>
                <input
                  type="file"
                  multiple
                  accept="audio/*"
                  onChange={(e) => handleFileUpload(e, 'modeB_orig')}
                  className="hidden"
                />
              </label>
            </div>

            {originalsB.length > 0 && (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {originalsB.map((item, idx) => (
                  <div key={item.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 p-2 text-xs">
                    <span className="truncate text-slate-300">{item.name}</span>
                    <button
                      type="button"
                      onClick={() => removeOriginalB(idx)}
                      className="text-slate-500 hover:text-rose-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Button & Status */}
      <div className="flex flex-col gap-3">
        {errorMessage && (
          <div className="flex items-center gap-2 rounded border border-rose-800/80 bg-rose-950/40 p-3 text-xs text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={
              isProcessing ||
              (mode === 'modeA' ? sourcesA.length < 2 : mixturesB.length < 2)
            }
            onClick={handleRunSeparation}
            className="flex items-center gap-2 rounded bg-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                <span>Separating...</span>
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                <span>Execute Audio Separation Pipeline</span>
              </>
            )}
          </button>

          {isProcessing && (
            <span className="font-mono text-xs text-cyan-400">
              {progressMsg || 'Processing...'}
            </span>
          )}
        </div>
      </div>

      {/* RESULTS DISPLAY */}
      {separatedSignals.length > 0 && (
        <div className="flex flex-col gap-6 pt-2">
          {/* Mixing Matrix (Mode A) */}
          {mode === 'modeA' && mixingMatrixA && (
            <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-baseline justify-between mb-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Synthesized Mixing Matrix A
                </h4>
                {conditionNumA !== null && (
                  <span className="font-mono text-xs text-slate-400">
                    Condition Number: <strong className="text-slate-200">{conditionNumA.toFixed(2)}</strong> (must be &lt; 30)
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="font-mono text-xs text-slate-300 border-collapse">
                  <tbody>
                    {mixingMatrixA.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((val, cIdx) => (
                          <td key={cIdx} className="border border-slate-800 px-3 py-1.5 text-right tabular-nums">
                            {val.toFixed(4)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Show Mixtures */}
              <div className="mt-4">
                <h5 className="text-xs font-mono text-slate-400 mb-2">
                  Microphone Mixtures X = A * S
                </h5>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {generatedMixturesA.map((mix, idx) => (
                    <AudioItemPlayer
                      key={idx}
                      title={`mixed_mic${idx + 1}`}
                      data={mix}
                      sampleRate={22050}
                      color="#f59e0b"
                      downloadFilename={`mixed_mic${idx + 1}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mode B Time Alignment Readout */}
          {mode === 'modeB' && alignInTime && timeOffsetsB.length > 0 && (
            <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
                Time Alignment Offsets (Common Sample Rate: 22050 Hz)
              </h4>
              <div className="flex flex-wrap gap-4 font-mono text-xs text-slate-300">
                {timeOffsetsB.map((offset, idx) => (
                  <div key={idx} className="rounded bg-slate-950 px-3 py-1.5 border border-slate-800">
                    Recording {idx + 1}: <span className="text-cyan-400">{offset >= 0 ? `+${offset.toFixed(3)}s` : `${offset.toFixed(3)}s`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 1: Whitened Covariance Matrix */}
          {covZ && (
            <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Step 1 - Covariance of Whitened Data Z
                </h4>
                {isCovZIdentity ? (
                  <span className="flex items-center gap-1 font-mono text-xs text-emerald-400">
                    <CheckCircle className="h-3.5 w-3.5" />
                    <span>Identity matrix verified (tol 1e-3)</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-mono text-xs text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Warning: Covariance deviates from Identity</span>
                  </span>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="font-mono text-xs text-slate-300 border-collapse">
                  <tbody>
                    {covZ.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((val, cIdx) => (
                          <td
                            key={cIdx}
                            className={`border border-slate-800 px-3 py-1.5 text-right tabular-nums ${
                              rIdx === cIdx ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                            }`}
                          >
                            {val.toFixed(5)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 2: Convergence Info */}
          {convergenceMsg && (
            <div className="rounded border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">
              <strong className="text-slate-400">FastICA Optimization:</strong>{' '}
              <span className={convergenceMsg.startsWith('Converged') ? 'text-emerald-400' : 'text-amber-400'}>
                {convergenceMsg}
              </span>
            </div>
          )}

          {/* Step 3: Estimated Sources */}
          <div>
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-2">
              Step 3 - Separated Sources (Normalized by Max Absolute Value)
            </h4>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {separatedSignals.map((sig, idx) => (
                <AudioItemPlayer
                  key={idx}
                  title={`separated_source${idx + 1}`}
                  data={sig}
                  sampleRate={22050}
                  color="#06b6d4"
                  downloadFilename={`separated_source${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Step 4: Mode A Evaluation */}
          {mode === 'modeA' && evalIca && evalPca && (
            <div className="flex flex-col gap-5 rounded border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Step 4 - Ground Truth Evaluation & Benchmarks
              </h4>

              {/* Absolute Correlation Matrix */}
              <div>
                <h5 className="text-xs font-mono text-slate-400 mb-2">
                  Absolute Pearson Correlation Matrix (Rows = Originals, Columns = Estimates)
                </h5>
                <div className="overflow-x-auto">
                  <table className="font-mono text-xs text-slate-300 border-collapse">
                    <thead>
                      <tr>
                        <th className="border border-slate-800 px-3 py-1 bg-slate-950 text-left">Original \ Est</th>
                        {evalIca.corrMatrix[0].map((_, cIdx) => (
                          <th key={cIdx} className="border border-slate-800 px-3 py-1 bg-slate-950 text-right">
                            Est {cIdx + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {evalIca.corrMatrix.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="border border-slate-800 px-3 py-1 font-semibold text-slate-400">
                            Source {rIdx + 1}
                          </td>
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="border border-slate-800 px-3 py-1 text-right tabular-nums">
                              {val.toFixed(4)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Matched Pairs with SDR */}
              <div className="flex flex-col gap-1.5 font-mono text-xs">
                <h5 className="text-slate-400 mb-1">Optimal Assignment & SDR Metrics:</h5>
                {evalIca.matches.map((m) => (
                  <div key={m.origIndex} className="rounded bg-slate-950 px-3 py-1.5 border border-slate-800 flex items-center justify-between">
                    <span>
                      original {m.origIndex + 1} &lt;-&gt; estimate {m.estIndex + 1}:
                    </span>
                    <span className="space-x-4">
                      <span>correlation: <strong className="text-cyan-400">{m.correlation.toFixed(4)}</strong></span>
                      <span>SDR: <strong className="text-emerald-400">{m.sdr.toFixed(1)} dB</strong></span>
                    </span>
                  </div>
                ))}
              </div>

              {/* PCA Comparison Table */}
              <div>
                <h5 className="text-xs font-mono text-slate-400 mb-2">
                  Separation Comparison: FastICA vs. PCA Whitening Only
                </h5>
                <div className="overflow-x-auto">
                  <table className="font-mono text-xs text-slate-300 border-collapse w-full">
                    <thead>
                      <tr className="bg-slate-950">
                        <th className="border border-slate-800 px-3 py-1.5 text-left">Source</th>
                        <th className="border border-slate-800 px-3 py-1.5 text-right text-cyan-400">ICA Correlation</th>
                        <th className="border border-slate-800 px-3 py-1.5 text-right text-cyan-400">ICA SDR</th>
                        <th className="border border-slate-800 px-3 py-1.5 text-right text-amber-400">PCA-only Corr</th>
                        <th className="border border-slate-800 px-3 py-1.5 text-right text-amber-400">PCA-only SDR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalIca.matches.map((m, idx) => {
                        const pcaM = evalPca.matches[idx];
                        return (
                          <tr key={idx}>
                            <td className="border border-slate-800 px-3 py-1.5 font-medium">Source {idx + 1}</td>
                            <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-cyan-300">
                              {m.correlation.toFixed(4)}
                            </td>
                            <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-emerald-400 font-semibold">
                              {m.sdr.toFixed(1)} dB
                            </td>
                            <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-amber-300">
                              {pcaM ? pcaM.correlation.toFixed(4) : '-'}
                            </td>
                            <td className="border border-slate-800 px-3 py-1.5 text-right tabular-nums text-amber-400">
                              {pcaM ? `${pcaM.sdr.toFixed(1)} dB` : '-'}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-950 font-semibold">
                        <td className="border border-slate-800 px-3 py-1.5">Average</td>
                        <td className="border border-slate-800 px-3 py-1.5 text-right text-cyan-300">
                          {(evalIca.matches.reduce((s, m) => s + m.correlation, 0) / evalIca.matches.length).toFixed(4)}
                        </td>
                        <td className="border border-slate-800 px-3 py-1.5 text-right text-emerald-400">
                          {evalIca.averageSDR.toFixed(1)} dB
                        </td>
                        <td className="border border-slate-800 px-3 py-1.5 text-right text-amber-300">
                          {(evalPca.matches.reduce((s, m) => s + m.correlation, 0) / evalPca.matches.length).toFixed(4)}
                        </td>
                        <td className="border border-slate-800 px-3 py-1.5 text-right text-amber-400">
                          {evalPca.averageSDR.toFixed(1)} dB
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 50 ms Window Plot */}
              {bestWindowBlock && sessionState?.S && generatedMixturesA.length > 0 && (
                <div>
                  <h5 className="text-xs font-mono text-slate-400 mb-2">
                    50 ms Active Window Waveform Inspection (Original vs. Mixture vs. Recovered)
                  </h5>
                  <div className="flex flex-col gap-3">
                    {evalIca.matches.map((m, idx) => (
                      <WindowComparisonPlot
                        key={idx}
                        original={sessionState.S![m.origIndex]}
                        mixed={generatedMixturesA[idx]}
                        recovered={evalIca.alignedSignals[m.origIndex]}
                        startIndex={bestWindowBlock.startIndex}
                        windowSize={bestWindowBlock.windowSize}
                        sourceIdx={idx}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Mode B with Originals Scores */}
          {mode === 'modeB' && modeBPeakScores && (
            <div className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900/60 p-4">
              <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">
                Peak Cross-Correlation Scoring against Clean Originals
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Raw table */}
                <div>
                  <h5 className="text-xs font-mono text-slate-400 mb-1.5">Raw Recordings vs Originals</h5>
                  <table className="font-mono text-xs text-slate-300 border-collapse w-full">
                    <thead>
                      <tr className="bg-slate-950">
                        <th className="border border-slate-800 px-2 py-1 text-left">Original</th>
                        {modeBPeakScores.rawScores[0].map((_, idx) => (
                          <th key={idx} className="border border-slate-800 px-2 py-1 text-right">Rec {idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modeBPeakScores.rawScores.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="border border-slate-800 px-2 py-1 font-medium">{originalsB[rIdx]?.name || `Orig ${rIdx + 1}`}</td>
                          {row.map((v, cIdx) => (
                            <td key={cIdx} className="border border-slate-800 px-2 py-1 text-right tabular-nums">{v.toFixed(3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* ICA table */}
                <div>
                  <h5 className="text-xs font-mono text-slate-400 mb-1.5">ICA Outputs vs Originals</h5>
                  <table className="font-mono text-xs text-slate-300 border-collapse w-full">
                    <thead>
                      <tr className="bg-slate-950">
                        <th className="border border-slate-800 px-2 py-1 text-left">Original</th>
                        {modeBPeakScores.icaScores[0].map((_, idx) => (
                          <th key={idx} className="border border-slate-800 px-2 py-1 text-right">ICA {idx + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {modeBPeakScores.icaScores.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="border border-slate-800 px-2 py-1 font-medium">{originalsB[rIdx]?.name || `Orig ${rIdx + 1}`}</td>
                          {row.map((v, cIdx) => (
                            <td key={cIdx} className="border border-slate-800 px-2 py-1 text-right tabular-nums">{v.toFixed(3)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Per-original summaries */}
              <div className="flex flex-col gap-1 font-mono text-xs mt-1">
                {modeBPeakScores.summaries.map((s, idx) => (
                  <div
                    key={idx}
                    className={`rounded px-3 py-1.5 border ${
                      s.icaBetter
                        ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-300'
                    }`}
                  >
                    <span>{s.name}: best raw recording {s.bestRaw.toFixed(3)}, best ICA output {s.bestIca.toFixed(3)}</span>
                    {s.icaBetter && <span className="ml-2 font-semibold text-emerald-400">(ICA Higher)</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Indeterminacy & Limitations Note */}
          <div className="rounded border border-slate-800/80 bg-slate-950 p-3.5 text-xs text-slate-400 leading-relaxed">
            <strong className="text-slate-300 font-mono">Theoretical Note on ICA:</strong>{' '}
            ICA cannot recover the order, sign or loudness of the sources, so outputs may be swapped, inverted or at a different volume. Real recordings contain echoes and delays that the simple linear model ignores, so real-world results are less clean than synthetic ones. ICA needs at least as many recordings as sources and at most one Gaussian source.
          </div>
        </div>
      )}
    </div>
  );
};
