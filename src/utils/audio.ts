/**
 * Audio playback, decoding, resampling, and WAV generation utilities.
 */

import { encodeWav16Bit } from './math.ts';

let globalAudioCtx: AudioContext | null = null;
let currentSourceNode: AudioBufferSourceNode | null = null;
let currentOnStopCallback: (() => void) | null = null;

export function getAudioContext(desiredSampleRate = 22050): AudioContext {
  if (!globalAudioCtx || globalAudioCtx.state === 'closed') {
    // Some browsers may not allow arbitrary sample rates for AudioContext;
    // standard Web Audio allows sampleRate in constructor options.
    try {
      globalAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
        sampleRate: desiredSampleRate,
      });
    } catch {
      globalAudioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

export async function decodeAudioFile(
  file: File,
  ctx: AudioContext,
  maxSeconds = 30
): Promise<{ name: string; data: Float64Array; duration: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const sampleRate = ctx.sampleRate;
  const maxSamples = Math.min(
    Math.round(maxSeconds * sampleRate),
    audioBuffer.length
  );

  const numChannels = audioBuffer.numberOfChannels;
  const mono = new Float64Array(maxSamples);

  // Convert to mono by averaging channels
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < maxSamples; i++) {
      mono[i] += channelData[i] / numChannels;
    }
  }

  // Normalize by max absolute value (skip if max is 0)
  let maxAbs = 0;
  for (let i = 0; i < maxSamples; i++) {
    const abs = Math.abs(mono[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs > 0) {
    const scale = 1.0 / maxAbs;
    for (let i = 0; i < maxSamples; i++) {
      mono[i] *= scale;
    }
  }

  return {
    name: file.name,
    data: mono,
    duration: maxSamples / sampleRate,
  };
}

export function stopCurrentPlayback(): void {
  if (currentSourceNode) {
    try {
      currentSourceNode.stop();
      currentSourceNode.disconnect();
    } catch {
      // Ignored if already stopped
    }
    currentSourceNode = null;
  }
  if (currentOnStopCallback) {
    const cb = currentOnStopCallback;
    currentOnStopCallback = null;
    cb();
  }
}

export function playAudioData(
  data: Float64Array,
  sampleRate: number,
  onPlayStateChange?: (isPlaying: boolean) => void
): () => void {
  stopCurrentPlayback();

  const ctx = getAudioContext(sampleRate);
  const buffer = ctx.createBuffer(1, data.length, sampleRate);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    channelData[i] = data[i];
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  currentSourceNode = source;
  onPlayStateChange?.(true);

  const onStop = () => {
    if (currentSourceNode === source) {
      currentSourceNode = null;
      currentOnStopCallback = null;
    }
    onPlayStateChange?.(false);
  };

  currentOnStopCallback = onStop;
  source.onended = onStop;

  source.start(0);

  return () => {
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Ignored
    }
    onStop();
  };
}

export function triggerWavDownload(
  data: Float64Array,
  sampleRate: number,
  filename: string
): void {
  const wavBytes = encodeWav16Bit(data, sampleRate);
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Resample audio to 8000 Hz using OfflineAudioContext (with browser anti-aliasing)
export async function resampleTo8kHz(
  data: Float64Array,
  originalRate: number
): Promise<Float64Array> {
  const targetRate = 8000;
  if (originalRate === targetRate) {
    // Just subtract mean
    const res = new Float64Array(data.length);
    let mean = 0;
    for (let i = 0; i < data.length; i++) mean += data[i];
    mean /= data.length;
    for (let i = 0; i < data.length; i++) res[i] = data[i] - mean;
    return res;
  }

  const targetLength = Math.max(1, Math.round((data.length * targetRate) / originalRate));
  const offlineCtx = new OfflineAudioContext(1, targetLength, targetRate);
  const buffer = offlineCtx.createBuffer(1, data.length, originalRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    channel[i] = data[i];
  }

  const source = offlineCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(offlineCtx.destination);
  source.start(0);

  const rendered = await offlineCtx.startRendering();
  const renderedData = rendered.getChannelData(0);
  const result = new Float64Array(targetLength);

  let mean = 0;
  for (let i = 0; i < targetLength; i++) {
    mean += renderedData[i];
  }
  mean /= targetLength;

  for (let i = 0; i < targetLength; i++) {
    result[i] = renderedData[i] - mean;
  }

  return result;
}
