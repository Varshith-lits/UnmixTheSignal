import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32,
  boxMullerGaussian,
  jacobiEigendecomposition,
  multiplyMatrices,
  transposeMatrix,
  invSqrtSymmetric,
  matrixConditionNumber,
  fftRadix2,
  crossCorrelationFFT,
  peakXcorr,
  separate,
  evaluateSeparation,
  encodeWav16Bit,
  computeSpectrogram,
  extractSpectrogramPeaks,
  generateHashes,
  matchClipAgainstLibrary,
} from './math.ts';

test('mulberry32 and Gaussian generation are deterministic', () => {
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  const v1 = [rng1(), rng1(), rng1()];
  const v2 = [rng2(), rng2(), rng2()];
  assert.deepEqual(v1, v2);

  const gRng = mulberry32(100);
  const g1 = boxMullerGaussian(gRng);
  const g2 = boxMullerGaussian(gRng);
  assert.equal(typeof g1, 'number');
  assert.equal(typeof g2, 'number');
  assert.notEqual(g1, g2);
});

test('Jacobi eigendecomposition accurately decomposes symmetric matrix', () => {
  // Symmetric 3x3 matrix
  const A = [
    [4, 1, -2],
    [1, 2, 0],
    [-2, 0, 3],
  ];
  const { eigenvalues, eigenvectors } = jacobiEigendecomposition(A);
  assert.equal(eigenvalues.length, 3);
  assert.equal(eigenvectors.length, 3);

  // V * V^T should be Identity
  const VVT = multiplyMatrices(eigenvectors, transposeMatrix(eigenvectors));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      const expected = i === j ? 1 : 0;
      assert.ok(Math.abs(VVT[i][j] - expected) < 1e-10, `V*VT failed at ${i},${j}`);
    }
  }

  // A * V[:, k] should equal lambda_k * V[:, k]
  const AV = multiplyMatrices(A, eigenvectors);
  for (let k = 0; k < 3; k++) {
    const lambda = eigenvalues[k];
    for (let r = 0; r < 3; r++) {
      const diff = Math.abs(AV[r][k] - lambda * eigenvectors[r][k]);
      assert.ok(diff < 1e-10, `Eigenvector verification failed for col ${k}, row ${r}: diff ${diff}`);
    }
  }
});

test('invSqrtSymmetric computes M^(-1/2) accurately', () => {
  const M = [
    [2, 0.5],
    [0.5, 3],
  ];
  const invSqrt = invSqrtSymmetric(M);
  // (M^(-1/2)) * M * (M^(-1/2)) should be Identity
  const step = multiplyMatrices(invSqrt, M);
  const res = multiplyMatrices(step, invSqrt);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const expected = i === j ? 1 : 0;
      assert.ok(Math.abs(res[i][j] - expected) < 1e-10, `invSqrt failed at ${i},${j}`);
    }
  }
});

test('matrixConditionNumber works correctly', () => {
  const A = [
    [0.6, 0.4],
    [0.3, 0.7],
  ];
  const cond = matrixConditionNumber(A);
  assert.ok(cond > 1 && cond < 10, `Unexpected condition number: ${cond}`);
});

test('radix-2 FFT and IFFT reconstruct input signal', () => {
  const N = 128;
  const real = new Float64Array(N);
  const imag = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    real[i] = Math.sin((2 * Math.PI * 5 * i) / N) + 0.5 * Math.cos((2 * Math.PI * 12 * i) / N);
  }
  const original = Float64Array.from(real);

  fftRadix2(real, imag, false);
  fftRadix2(real, imag, true);

  for (let i = 0; i < N; i++) {
    assert.ok(Math.abs(real[i] - original[i]) < 1e-10, `FFT roundtrip error at ${i}`);
    assert.ok(Math.abs(imag[i]) < 1e-10, `Imaginary leakage at ${i}`);
  }
});

test('crossCorrelationFFT accurately detects delay lag', () => {
  const N = 256;
  const a = new Float64Array(N);
  const b = new Float64Array(N);
  // Pulse in a at sample 30, in b at sample 20 (delay = +10 samples)
  const lagTrue = 10;
  for (let i = 0; i < 50; i++) {
    const val = Math.sin((2 * Math.PI * i) / 10);
    a[i + lagTrue + 10] = val;
    b[i + 10] = val;
  }
  const { c } = crossCorrelationFFT(a, b);
  // The peak of c should be at lagTrue
  let maxIdx = 0;
  let maxVal = -1;
  for (let i = 0; i < 40; i++) {
    if (Math.abs(c[i]) > maxVal) {
      maxVal = Math.abs(c[i]);
      maxIdx = i;
    }
  }
  assert.equal(maxIdx, lagTrue);
});

test('peakXcorr returns 1.0 for identical signals', () => {
  const N = 1000;
  const a = new Float64Array(N);
  for (let i = 0; i < N; i++) a[i] = Math.sin(0.05 * i);
  const score = peakXcorr(a, a, 1000, 2, 2);
  assert.ok(Math.abs(score - 1.0) < 1e-3, `Expected ~1.0, got ${score}`);
});

test('FastICA and separate() recover mixed non-Gaussian audio-like signals', async () => {
  const N = 4000;
  const s1 = new Float64Array(N);
  const s2 = new Float64Array(N);

  // s1: pure sine wave 440Hz-like
  // s2: high-frequency modulated square wave
  for (let i = 0; i < N; i++) {
    s1[i] = Math.sin(0.08 * i);
    s2[i] = Math.sign(Math.sin(0.015 * i)) * (0.5 + 0.5 * Math.cos(0.005 * i));
  }

  // Mixing matrix A = [[0.6, 0.4], [0.3, 0.7]]
  const x1 = new Float64Array(N);
  const x2 = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    x1[i] = 0.6 * s1[i] + 0.4 * s2[i];
    x2[i] = 0.3 * s1[i] + 0.7 * s2[i];
  }

  const result = await separate([x1, x2], 2);
  assert.equal(result.ica.length, 2);
  assert.equal(result.pca.length, 2);

  // Whitened covariance should be identity matrix
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const exp = i === j ? 1 : 0;
      assert.ok(
        Math.abs(result.covariance_Z[i][j] - exp) < 1e-3,
        `Whitened covariance not identity at ${i},${j}: ${result.covariance_Z[i][j]}`
      );
    }
  }

  // Evaluate separation against ground truth
  const evalIca = evaluateSeparation([s1, s2], result.ica);
  const evalPca = evaluateSeparation([s1, s2], result.pca);

  // ICA should have high correlation (> 0.95) and strong SDR (> 20 dB)
  for (const match of evalIca.matches) {
    assert.ok(match.correlation > 0.95, `ICA correlation too low: ${match.correlation}`);
    assert.ok(match.sdr > 20.0, `ICA SDR too low: ${match.sdr}`);
  }

  // ICA average SDR must be significantly better than PCA-only SDR
  assert.ok(
    evalIca.averageSDR > evalPca.averageSDR + 5.0,
    `ICA SDR (${evalIca.averageSDR}) should exceed PCA SDR (${evalPca.averageSDR}) by > 5dB`
  );
});

test('encodeWav16Bit produces valid WAV buffer', () => {
  const samples = new Float64Array([0, 0.5, 1.0, 0, -0.5, -1.0]);
  const wavBytes = encodeWav16Bit(samples, 22050);
  assert.equal(wavBytes.length, 44 + 6 * 2);

  const header = String.fromCharCode(...wavBytes.slice(0, 4));
  assert.equal(header, 'RIFF');
  const format = String.fromCharCode(...wavBytes.slice(8, 12));
  assert.equal(format, 'WAVE');
});

test('Mini-Shazam fingerprinting and offset voting identifies matching track', () => {
  const sr = 8000;
  const duration = 2.0;
  const totalSamples = Math.round(sr * duration);

  // Generate 2 distinct "songs"
  const song1 = new Float64Array(totalSamples);
  const song2 = new Float64Array(totalSamples);
  for (let i = 0; i < totalSamples; i++) {
    // Song 1 has strong harmonics at specific frequencies
    song1[i] = Math.sin(2 * Math.PI * 440 * (i / sr)) + Math.sin(2 * Math.PI * 880 * (i / sr));
    // Song 2 has different frequencies
    song2[i] = Math.sin(2 * Math.PI * 300 * (i / sr)) + Math.sin(2 * Math.PI * 600 * (i / sr));
  }

  const spec1 = computeSpectrogram(song1);
  const peaks1 = extractSpectrogramPeaks(spec1.L, spec1.numBins, spec1.numFrames, spec1.medianL, 5);
  const hashes1 = generateHashes(peaks1);

  const spec2 = computeSpectrogram(song2);
  const peaks2 = extractSpectrogramPeaks(spec2.L, spec2.numBins, spec2.numFrames, spec2.medianL, 5);
  const hashes2 = generateHashes(peaks2);

  // Build library DB
  const library = new Map<number, Array<{ songId: string; anchorTime: number }>>();
  for (const h of hashes1) {
    if (!library.has(h.hash)) library.set(h.hash, []);
    library.get(h.hash)!.push({ songId: 'song-1', anchorTime: h.anchorTime });
  }
  for (const h of hashes2) {
    if (!library.has(h.hash)) library.set(h.hash, []);
    library.get(h.hash)!.push({ songId: 'song-2', anchorTime: h.anchorTime });
  }

  const songs = [
    { songId: 'song-1', songName: 'Acoustic 440+880' },
    { songId: 'song-2', songName: 'Bass 300+600' },
  ];

  // Query with song1 (a sub-clip)
  const queryResult = matchClipAgainstLibrary(hashes1, library, songs);
  assert.equal(queryResult.bestSongId, 'song-1');
  assert.ok(queryResult.bestScore > 0);
});
