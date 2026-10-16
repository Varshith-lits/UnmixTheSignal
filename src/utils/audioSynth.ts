/**
 * Synthetic audio generator to allow one-click testing and demonstration.
 * Generates clean audio waveforms (flute, rhythm, synth lead, chirp) at given sample rate.
 */

export function generateSyntheticSources(
  sampleRate = 22050,
  duration = 6.0
): Array<{ name: string; data: Float64Array; duration: number }> {
  const numSamples = Math.round(duration * sampleRate);

  // 1. Flute Melody: sinusoidal with subtle vibrato and envelope
  const flute = new Float64Array(numSamples);
  const notes = [440, 523.25, 659.25, 587.33, 440, 659.25];
  const noteDuration = duration / notes.length;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.min(notes.length - 1, Math.floor(t / noteDuration));
    const noteTime = t - noteIdx * noteDuration;
    const freq = notes[noteIdx];
    const vibrato = 1.0 + 0.015 * Math.sin(2 * Math.PI * 5.5 * t);
    const env = Math.sin(Math.PI * Math.min(1.0, noteTime / noteDuration));
    // Fundamental + 2nd + 3rd harmonic
    const sample =
      Math.sin(2 * Math.PI * freq * vibrato * t) +
      0.35 * Math.sin(2 * Math.PI * freq * 2 * vibrato * t) +
      0.15 * Math.sin(2 * Math.PI * freq * 3 * vibrato * t);
    flute[i] = sample * env;
  }

  // 2. Rhythm & Percussion: kick and snare pattern
  const rhythm = new Float64Array(numSamples);
  const beatInterval = 0.35; // seconds
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const beatPhase = (t % beatInterval) / beatInterval;
    const beatIndex = Math.floor(t / beatInterval);

    if (beatIndex % 2 === 0) {
      // Kick: pitch drop 140Hz -> 45Hz with exponential decay
      const decay = Math.exp(-beatPhase * 12);
      const pitch = 45 + 100 * Math.exp(-beatPhase * 25);
      rhythm[i] = Math.sin(2 * Math.PI * pitch * (beatPhase * beatInterval)) * decay;
    } else {
      // Snare: noise burst + 180Hz tone
      const decay = Math.exp(-beatPhase * 14);
      // Pseudo-random noise
      const noise = ((i * 1234567) % 1000) / 500 - 1;
      const tone = Math.sin(2 * Math.PI * 180 * (beatPhase * beatInterval));
      rhythm[i] = (0.7 * noise + 0.5 * tone) * decay;
    }
  }

  // 3. Synth Arpeggio: rich chord sequence
  const synth = new Float64Array(numSamples);
  const arpNotes = [261.63, 329.63, 392.0, 523.25]; // C major
  const arpRate = 0.15;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const noteIdx = Math.floor(t / arpRate) % arpNotes.length;
    const f = arpNotes[noteIdx];
    // Band-limited triangle / soft saw
    let s = 0;
    for (let h = 1; h <= 5; h += 2) {
      s += (Math.sin(2 * Math.PI * f * h * t) / (h * h)) * (h % 4 === 1 ? 1 : -1);
    }
    synth[i] = s;
  }

  // Normalize each signal by max abs
  const sources = [
    { name: 'Flute Melody (Woodwind)', data: flute, duration },
    { name: 'Percussion Beat (Rhythm)', data: rhythm, duration },
    { name: 'Synthesizer Arp (Lead)', data: synth, duration },
  ];

  for (const s of sources) {
    let max = 0;
    for (let i = 0; i < s.data.length; i++) {
      const a = Math.abs(s.data[i]);
      if (a > max) max = a;
    }
    if (max > 0) {
      for (let i = 0; i < s.data.length; i++) s.data[i] /= max;
    }
  }

  return sources;
}

// Generate 5 distinct synthetic songs for Mini-Shazam library testing
export function generateSyntheticLibrary(
  sampleRate = 22050,
  duration = 8.0
): Array<{ name: string; data: Float64Array; duration: number }> {
  const titles = [
    'Solar Flare - Electronic Pulse',
    'Midnight Jazz - Blue Note Swing',
    'Acoustic Serenade - Folk Harmony',
    'Neon Velocity - Synthwave Bass',
    'Mountain Echo - Ambient Chimes',
  ];

  const baseFreqs = [440, 330, 261.63, 196, 523.25];
  const numSamples = Math.round(duration * sampleRate);

  return titles.map((title, idx) => {
    const data = new Float64Array(numSamples);
    const baseF = baseFreqs[idx];
    const tempo = 0.2 + idx * 0.05;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const step = Math.floor(t / tempo);
      const mod = 1.0 + 0.3 * (step % 4);
      const f1 = baseF * mod;
      const f2 = baseF * 1.5 * mod;

      const s =
        Math.sin(2 * Math.PI * f1 * t) * 0.6 +
        Math.sin(2 * Math.PI * f2 * t) * 0.4 +
        0.2 * Math.sin(2 * Math.PI * (baseF * 0.5) * t);

      // Envelope modulation
      const env = 0.5 + 0.5 * Math.sin(2 * Math.PI * (t / tempo));
      data[i] = s * env;
    }

    // Normalize
    let max = 0;
    for (let i = 0; i < numSamples; i++) {
      if (Math.abs(data[i]) > max) max = Math.abs(data[i]);
    }
    if (max > 0) {
      for (let i = 0; i < numSamples; i++) data[i] /= max;
    }

    return { name: title, data, duration };
  });
}
