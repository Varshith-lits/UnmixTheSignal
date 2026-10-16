import React, { useState } from 'react';
import {
  Upload,
  Database,
  Search,
  Sparkles,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RotateCw,
} from 'lucide-react';
import { GlobalSessionState } from './SeparateTab.tsx';
import {
  computeSpectrogram,
  extractSpectrogramPeaks,
  generateHashes,
  matchClipAgainstLibrary,
  ShazamLibrary,
  LibraryEntry,
} from '../utils/math.ts';
import { resampleTo8kHz, decodeAudioFile, getAudioContext } from '../utils/audio.ts';
import { generateSyntheticLibrary } from '../utils/audioSynth.ts';

interface MiniShazamTabProps {
  maxSeconds: number;
  sessionState: GlobalSessionState | null;
}

interface LoadedSong {
  id: string;
  name: string;
  data: Float64Array;
  duration: number;
}

interface TestClipItem {
  id: string;
  label: string;
  data: Float64Array;
}

interface IdentificationRow {
  clipLabel: string;
  bestMatch: string;
  isConfident: boolean;
  songScores: Array<{ songId: string; songName: string; score: number }>;
}

export const MiniShazamTab: React.FC<MiniShazamTabProps> = ({ maxSeconds, sessionState }) => {
  // Library songs
  const [librarySongs, setLibrarySongs] = useState<LoadedSong[]>([]);
  const [isBuildingDb, setIsBuildingDb] = useState(false);
  const [dbBuildProgress, setDbBuildProgress] = useState('');
  const [compiledDb, setCompiledDb] = useState<{
    library: ShazamLibrary;
    entries: LibraryEntry[];
    totalHashes: number;
  } | null>(null);

  // Extra uploaded clips
  const [customClips, setCustomClips] = useState<TestClipItem[]>([]);

  // Selected clip sources for testing
  const [includeIcaOutputs, setIncludeIcaOutputs] = useState(true);
  const [includeMixtures, setIncludeMixtures] = useState(true);

  // Identification results
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [identifyProgress, setIdentifyProgress] = useState('');
  const [resultsTable, setResultsTable] = useState<IdentificationRow[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Demo Library
  const handleLoadDemoLibrary = () => {
    setErrorMessage(null);
    const ctx = getAudioContext(22050);
    const synthSongs = generateSyntheticLibrary(ctx.sampleRate, 8.0);
    const loaded: LoadedSong[] = synthSongs.map((s, idx) => ({
      id: `lib-demo-${idx}-${Date.now()}`,
      name: s.name,
      data: s.data,
      duration: s.duration,
    }));
    setLibrarySongs(loaded);
    setCompiledDb(null);
  };

  // Upload Library Songs
  const handleUploadSongs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    try {
      const ctx = getAudioContext(22050);
      const newItems: LoadedSong[] = [];

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

      setLibrarySongs((prev) => {
        const combined = [...prev, ...newItems];
        return combined.slice(0, 10); // limit 5 to 10
      });
      setCompiledDb(null);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error decoding library audio');
    } finally {
      e.target.value = '';
    }
  };

  // Upload Extra Test Clip
  const handleUploadTestClip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErrorMessage(null);

    try {
      const ctx = getAudioContext(22050);
      const newClips: TestClipItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const decoded = await decodeAudioFile(file, ctx, maxSeconds);
        newClips.push({
          id: `clip-${file.name}-${Date.now()}-${i}`,
          label: `Uploaded: ${decoded.name}`,
          data: decoded.data,
        });
      }

      setCustomClips((prev) => [...prev, ...newClips]);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error decoding clip');
    } finally {
      e.target.value = '';
    }
  };

  // Helper to extract 10-second segment from second 5 to 15 (or whole clip if shorter)
  const extractTestSegment = (data: Float64Array, sr: number): Float64Array => {
    const startSample = Math.round(5 * sr);
    const endSample = Math.round(15 * sr);

    if (data.length <= endSample) {
      if (data.length > startSample) {
        return data.slice(startSample);
      }
      return data;
    }
    return data.slice(startSample, endSample);
  };

  // Fingerprint single audio signal
  const fingerprintSignal = async (
    data: Float64Array,
    originalSr: number
  ): Promise<Array<{ hash: number; anchorTime: number }>> => {
    // 1. Resample to 8000 Hz with anti-aliasing, subtract mean
    const resampled = await resampleTo8kHz(data, originalSr);
    if (resampled.length < 1024) return [];

    // 2. Spectrogram (Hann, nperseg=1024, hop=512)
    const spec = computeSpectrogram(resampled, 1024, 512);

    // 3. Peaks: 21x21 neighborhood and L > median(L) + 18 dB
    const peaks = extractSpectrogramPeaks(spec.L, spec.numBins, spec.numFrames, spec.medianL, 18);

    // 4. Hashes (fan-out 6, dt in [1, 60])
    return generateHashes(peaks, 6);
  };

  // Build Library DB
  const handleBuildLibrary = async () => {
    if (librarySongs.length < 5) {
      setErrorMessage('The library requires at least 5 songs (up to 10).');
      return;
    }
    setErrorMessage(null);
    setIsBuildingDb(true);
    setDbBuildProgress('Starting fingerprinting...');

    try {
      const db: ShazamLibrary = new Map();
      const entries: LibraryEntry[] = [];
      let totalHashCount = 0;

      for (let idx = 0; idx < librarySongs.length; idx++) {
        const song = librarySongs[idx];
        setDbBuildProgress(`Fingerprinting track ${idx + 1}/${librarySongs.length}: "${song.name}"...`);
        await new Promise((r) => setTimeout(r, 15));

        entries.push({ songId: song.id, songName: song.name });
        const hashes = await fingerprintSignal(song.data, 22050);

        for (const h of hashes) {
          if (!db.has(h.hash)) {
            db.set(h.hash, []);
          }
          db.get(h.hash)!.push({ songId: song.id, anchorTime: h.anchorTime });
          totalHashCount++;
        }
      }

      setCompiledDb({
        library: db,
        entries,
        totalHashes: totalHashCount,
      });
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to build database');
    } finally {
      setIsBuildingDb(false);
      setDbBuildProgress('');
    }
  };

  // Run Identification
  const handleIdentifyClips = async () => {
    if (!compiledDb) {
      setErrorMessage('Build the library database first before identifying test clips.');
      return;
    }
    setErrorMessage(null);
    setIsIdentifying(true);
    setResultsTable([]);

    try {
      // Gather test clips
      const clipsToTest: TestClipItem[] = [];

      // 1. ICA separated outputs from Tab 1
      if (includeIcaOutputs && sessionState && sessionState.S_est) {
        sessionState.S_est.forEach((sig, idx) => {
          clipsToTest.push({
            id: `ica-${idx}`,
            label: `Tab 1 Separated Source ${idx + 1}`,
            data: sig,
          });
        });
      }

      // 2. Mixed signals from Tab 1
      if (includeMixtures && sessionState && sessionState.X) {
        sessionState.X.forEach((sig, idx) => {
          clipsToTest.push({
            id: `mix-${idx}`,
            label: `Tab 1 Mixed Signal ${idx + 1}`,
            data: sig,
          });
        });
      }

      // 3. Custom uploaded clips
      clipsToTest.push(...customClips);

      if (clipsToTest.length === 0) {
        throw new Error('No test clips selected or available. Run Tab 1 separation or upload extra clips.');
      }

      const rows: IdentificationRow[] = [];

      for (let i = 0; i < clipsToTest.length; i++) {
        const clip = clipsToTest[i];
        setIdentifyProgress(`Matching clip ${i + 1}/${clipsToTest.length}: "${clip.label}"...`);
        await new Promise((r) => setTimeout(r, 15));

        // Take 10-second segment from second 5 to 15 (or whole if shorter)
        const segment = extractTestSegment(clip.data, 22050);
        const clipHashes = await fingerprintSignal(segment, 22050);

        const match = matchClipAgainstLibrary(
          clipHashes,
          compiledDb.library,
          compiledDb.entries
        );

        rows.push({
          clipLabel: clip.label,
          bestMatch: match.isConfident ? match.bestSongName : 'No confident match',
          isConfident: match.isConfident,
          songScores: match.songScores,
        });
      }

      setResultsTable(rows);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Identification failed');
    } finally {
      setIsIdentifying(false);
      setIdentifyProgress('');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* SECTION 1: LIBRARY MANAGEMENT */}
      <div className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">
              Song Reference Library (5 to 10 Songs)
            </h3>
            <p className="text-xs text-slate-400">
              Upload 5 to 10 audio files or load a pre-synthesized library. File names serve as track titles.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleLoadDemoLibrary}
              className="flex items-center gap-1.5 rounded border border-cyan-800 bg-cyan-950/50 px-3 py-1.5 text-xs font-mono text-cyan-300 hover:bg-cyan-900/60 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Load 5-Song Demo Library</span>
            </button>

            <label className="flex cursor-pointer items-center gap-1.5 rounded bg-cyan-600 px-3 py-1.5 text-xs font-mono font-medium text-white hover:bg-cyan-500 transition-colors">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Songs</span>
              <input
                type="file"
                multiple
                accept="audio/*"
                onChange={handleUploadSongs}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Songs List */}
        {librarySongs.length === 0 ? (
          <div className="rounded border border-dashed border-slate-800 p-8 text-center text-xs text-slate-500">
            No library songs loaded yet. Click &quot;Load 5-Song Demo Library&quot; or upload files.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {librarySongs.map((song, idx) => (
              <div
                key={song.id}
                className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 p-2.5 text-xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-mono text-slate-400 mr-1.5">#{idx + 1}</span>
                  <span className="font-medium text-slate-200 truncate">{song.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setLibrarySongs((prev) => prev.filter((_, i) => i !== idx));
                    setCompiledDb(null);
                  }}
                  className="text-slate-500 hover:text-rose-400 shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Build Button */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={isBuildingDb || librarySongs.length < 5}
            onClick={handleBuildLibrary}
            className="flex items-center gap-2 rounded bg-cyan-600 px-4 py-2 text-xs font-mono font-medium text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isBuildingDb ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>{dbBuildProgress || 'Building Database...'}</span>
              </>
            ) : (
              <>
                <Database className="h-3.5 w-3.5" />
                <span>Build Library Database ({librarySongs.length} Songs)</span>
              </>
            )}
          </button>

          {compiledDb && (
            <div className="flex items-center gap-2 font-mono text-xs text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Database Ready ({compiledDb.entries.length} songs indexed, {compiledDb.totalHashes} constellation hashes)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* SECTION 2: TEST CLIPS & IDENTIFICATION */}
      <div className="flex flex-col gap-4 rounded border border-slate-800 bg-slate-900/40 p-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            Audio Query Identification
          </h3>
          <p className="text-xs text-slate-400">
            Select test clips (10s segments from second 5 to 15) to evaluate recognition robustness.
          </p>
        </div>

        {/* Clip Selection Checkboxes */}
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeIcaOutputs}
              onChange={(e) => setIncludeIcaOutputs(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span>Include Tab 1 ICA-Separated Outputs</span>
          </label>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeMixtures}
              onChange={(e) => setIncludeMixtures(e.target.checked)}
              className="rounded border-slate-700 bg-slate-800 text-cyan-500 focus:ring-cyan-500"
            />
            <span>Include Tab 1 Mixed Signals</span>
          </label>

          <label className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-mono text-slate-300 hover:bg-slate-700 transition-colors">
            <Upload className="h-3 w-3" />
            <span>Upload Extra Test Clips</span>
            <input
              type="file"
              multiple
              accept="audio/*"
              onChange={handleUploadTestClip}
              className="hidden"
            />
          </label>
        </div>

        {/* Extra clips list */}
        {customClips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {customClips.map((clip, idx) => (
              <div
                key={clip.id}
                className="flex items-center gap-2 rounded bg-slate-950 px-2.5 py-1 text-xs border border-slate-800"
              >
                <span className="text-slate-300">{clip.label}</span>
                <button
                  type="button"
                  onClick={() => setCustomClips((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-slate-500 hover:text-rose-400"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="flex items-center gap-2 rounded border border-rose-800 bg-rose-950/40 p-3 text-xs text-rose-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Trigger Button */}
        <div>
          <button
            type="button"
            disabled={isIdentifying || !compiledDb}
            onClick={handleIdentifyClips}
            className="flex items-center gap-2 rounded bg-cyan-600 px-5 py-2 text-xs font-mono font-medium text-white hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isIdentifying ? (
              <>
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
                <span>{identifyProgress || 'Querying Hashes...'}</span>
              </>
            ) : (
              <>
                <Search className="h-3.5 w-3.5" />
                <span>Run Identification Algorithm</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* RESULTS TABLE */}
      {resultsTable.length > 0 && compiledDb && (
        <div className="rounded border border-slate-800 bg-slate-900/60 p-4">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-3">
            Identification Results Matrix (Confidence Threshold: Best Score &ge; 10)
          </h4>

          <div className="overflow-x-auto">
            <table className="font-mono text-xs text-slate-300 border-collapse w-full">
              <thead>
                <tr className="bg-slate-950">
                  <th className="border border-slate-800 px-3 py-2 text-left">Clip Label</th>
                  <th className="border border-slate-800 px-3 py-2 text-left text-cyan-400">Best Match</th>
                  {compiledDb.entries.map((song) => (
                    <th key={song.songId} className="border border-slate-800 px-3 py-2 text-right">
                      {song.songName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultsTable.map((row, rIdx) => {
                  const maxScoreInRow = Math.max(...row.songScores.map((s) => s.score));
                  return (
                    <tr key={rIdx} className="hover:bg-slate-900">
                      <td className="border border-slate-800 px-3 py-2 font-medium text-slate-200">
                        {row.clipLabel}
                      </td>
                      <td className="border border-slate-800 px-3 py-2">
                        {row.isConfident ? (
                          <span className="rounded bg-emerald-950/60 px-2 py-0.5 text-emerald-400 border border-emerald-800">
                            {row.bestMatch}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">No confident match</span>
                        )}
                      </td>
                      {row.songScores.map((s) => {
                        const isWinner = s.score === maxScoreInRow && s.score > 0;
                        return (
                          <td
                            key={s.songId}
                            className={`border border-slate-800 px-3 py-2 text-right tabular-nums ${
                              isWinner
                                ? row.isConfident
                                  ? 'text-emerald-400 font-bold bg-emerald-950/20'
                                  : 'text-amber-400 font-medium'
                                : 'text-slate-400'
                            }`}
                          >
                            {s.score}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Domain Note */}
      <div className="rounded border border-slate-800 bg-slate-950 p-4 text-xs text-slate-400 leading-relaxed font-sans">
        If a separated output contains a song from the library it should match it, while speech or unknown sounds should show no confident match. Matching on the separated music is usually stronger than on the raw mixture.
      </div>
    </div>
  );
};
