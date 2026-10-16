/**
 * Audio ICA Lab - Pure Mathematical & Signal Processing Helpers
 * Implemented from scratch: No external math/signal processing libraries.
 */

// 1. Seeded PRNG: mulberry32 and Gaussian (Box-Muller)
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function boxMullerGaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 2. Matrix Operations
export function createMatrix(rows: number, cols: number, initVal = 0): number[][] {
  const m: number[][] = new Array(rows);
  for (let i = 0; i < rows; i++) {
    m[i] = new Array(cols).fill(initVal);
  }
  return m;
}

export function identityMatrix(n: number): number[][] {
  const I = createMatrix(n, n, 0);
  for (let i = 0; i < n; i++) {
    I[i][i] = 1.0;
  }
  return I;
}

export function transposeMatrix(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0].length;
  const T = createMatrix(cols, rows, 0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = A[i][j];
    }
  }
  return T;
}

export function multiplyMatrices(A: number[][], B: number[][]): number[][] {
  const rA = A.length;
  const cA = A[0].length;
  const rB = B.length;
  const cB = B[0].length;
  if (cA !== rB) {
    throw new Error(`Matrix multiplication dimension mismatch: ${cA} !== ${rB}`);
  }
  const C = createMatrix(rA, cB, 0);
  for (let i = 0; i < rA; i++) {
    for (let k = 0; k < cA; k++) {
      const aik = A[i][k];
      for (let j = 0; j < cB; j++) {
        C[i][j] += aik * B[k][j];
      }
    }
  }
  return C;
}

// 3. Jacobi rotation method for symmetric eigendecomposition
export function jacobiEigendecomposition(
  A_in: number[][],
  maxSweeps = 100,
  tol = 1e-12
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = A_in.length;
  const A = A_in.map((row) => [...row]);
  const V = identityMatrix(n);

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let offDiagSum = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) offDiagSum += Math.abs(A[i][j]);
      }
    }
    if (offDiagSum < tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-15) continue;

        const app = A[p][p];
        const aqq = A[q][q];
        const tau = (aqq - app) / (2.0 * apq);
        let t: number;
        if (tau >= 0) {
          t = 1.0 / (tau + Math.sqrt(1.0 + tau * tau));
        } else {
          t = -1.0 / (-tau + Math.sqrt(1.0 + tau * tau));
        }
        const c = 1.0 / Math.sqrt(1.0 + t * t);
        const s = t * c;

        // Update A
        A[p][p] = app - t * apq;
        A[q][q] = aqq + t * apq;
        A[p][q] = 0;
        A[q][p] = 0;

        for (let r = 0; r < n; r++) {
          if (r !== p && r !== q) {
            const arp = A[r][p];
            const arq = A[r][q];
            A[r][p] = c * arp - s * arq;
            A[p][r] = A[r][p];
            A[r][q] = s * arp + c * arq;
            A[q][r] = A[r][q];
          }
        }

        // Update V (eigenvectors as columns)
        for (let r = 0; r < n; r++) {
          const vrp = V[r][p];
          const vrq = V[r][q];
          V[r][p] = c * vrp - s * vrq;
          V[r][q] = s * vrp + c * vrq;
        }
      }
    }
  }

  const eigenvalues = new Array(n);
  for (let i = 0; i < n; i++) {
    eigenvalues[i] = A[i][i];
  }
  return { eigenvalues, eigenvectors: V };
}

// Matrix inverse square root using Jacobi eigendecomposition: M^(-1/2) = E * diag(1/sqrt(vals)) * E^T
export function invSqrtSymmetric(M: number[][], eps = 1e-12): number[][] {
  const n = M.length;
  const { eigenvalues, eigenvectors } = jacobiEigendecomposition(M);
  const D_inv = eigenvalues.map((v) => (v > eps ? 1.0 / Math.sqrt(v) : 0.0));

  const res = createMatrix(n, n, 0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += eigenvectors[i][k] * D_inv[k] * eigenvectors[j][k];
      }
      res[i][j] = sum;
    }
  }
  return res;
}

// Condition number of matrix A via Jacobi eigenvalues of A^T A
export function matrixConditionNumber(A: number[][]): number {
  const AtA = multiplyMatrices(transposeMatrix(A), A);
  const { eigenvalues } = jacobiEigendecomposition(AtA);
  const svals = eigenvalues.map((v) => Math.sqrt(Math.max(0, v)));
  const maxS = Math.max(...svals);
  const minS = Math.min(...svals);
  if (minS <= 1e-12) return Infinity;
  return maxS / minS;
}

// 4. Radix-2 Complex FFT & IFFT (iterative on Float64Array)
export function fftRadix2(
  real: Float64Array,
  imag: Float64Array,
  inverse = false
): void {
  const n = real.length;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`FFT length must be a power of 2, received ${n}`);
  }

  // Bit reversal permutation
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let k = n >> 1;
    while (k <= j) {
      j -= k;
      k >>= 1;
    }
    j += k;
  }

  // Cooley-Tukey butterfly
  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angle = ((inverse ? 2.0 : -2.0) * Math.PI) / len;
    const wStepR = Math.cos(angle);
    const wStepI = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let wR = 1.0;
      let wI = 0.0;
      for (let k = 0; k < halfLen; k++) {
        const uR = real[i + k];
        const uI = imag[i + k];
        const vR = real[i + k + halfLen] * wR - imag[i + k + halfLen] * wI;
        const vI = real[i + k + halfLen] * wI + imag[i + k + halfLen] * wR;

        real[i + k] = uR + vR;
        imag[i + k] = uI + vI;
        real[i + k + halfLen] = uR - vR;
        imag[i + k + halfLen] = uI - vI;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }

  if (inverse) {
    const invN = 1.0 / n;
    for (let i = 0; i < n; i++) {
      real[i] *= invN;
      imag[i] *= invN;
    }
  }
}

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Full FFT cross-correlation of real signals a and b
// c = IFFT(FFT(a) * conj(FFT(b))); lag l >= 0 at index l, lag -l at index N-l
export function crossCorrelationFFT(
  a: Float64Array,
  b: Float64Array
): { c: Float64Array; N: number } {
  const minLen = a.length + b.length - 1;
  const N = nextPowerOfTwo(minLen);

  const realA = new Float64Array(N);
  const imagA = new Float64Array(N);
  const realB = new Float64Array(N);
  const imagB = new Float64Array(N);

  realA.set(a);
  realB.set(b);

  fftRadix2(realA, imagA, false);
  fftRadix2(realB, imagB, false);

  // C_freq = A * conj(B)
  const realC = new Float64Array(N);
  const imagC = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    realC[i] = realA[i] * realB[i] + imagA[i] * imagB[i];
    imagC[i] = imagA[i] * realB[i] - realA[i] * imagB[i];
  }

  fftRadix2(realC, imagC, true);

  return { c: realC, N };
}

// 5. peakXcorr(a, b, sr, maxLagSeconds=5, seconds=20)
export function peakXcorr(
  a: Float64Array,
  b: Float64Array,
  sr: number,
  maxLagSeconds = 5,
  seconds = 20
): number {
  const maxSamples = Math.min(Math.round(seconds * sr), a.length, b.length);
  if (maxSamples <= 0) return 0;

  // Take first `seconds` and center
  const aSub = new Float64Array(maxSamples);
  const bSub = new Float64Array(maxSamples);
  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < maxSamples; i++) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= maxSamples;
  meanB /= maxSamples;

  let normA = 0;
  let normB = 0;
  for (let i = 0; i < maxSamples; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    aSub[i] = da;
    bSub[i] = db;
    normA += da * da;
    normB += db * db;
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA <= 1e-12 || normB <= 1e-12) return 0;

  const { c, N } = crossCorrelationFFT(aSub, bSub);
  const maxLagSamples = Math.min(Math.round(maxLagSeconds * sr), maxSamples);

  let maxAbsC = 0;
  // lag l >= 0: at index l
  for (let l = 0; l <= maxLagSamples; l++) {
    const val = Math.abs(c[l]);
    if (val > maxAbsC) maxAbsC = val;
  }
  // lag -l: at index N - l
  for (let l = 1; l <= maxLagSamples; l++) {
    const val = Math.abs(c[N - l]);
    if (val > maxAbsC) maxAbsC = val;
  }

  const result = maxAbsC / (normA * normB);
  return Math.min(1.0, Math.max(0.0, result));
}

// 6. FastICA (Symmetric version with tanh)
export async function fastICA(
  Z: Float64Array[],
  nComponents: number,
  maxIter = 200,
  tol = 1e-5,
  seed = 42,
  onProgress?: (msg: string) => Promise<void>
): Promise<{ W: number[][]; message: string; iterations: number }> {
  const numSamples = Z[0].length;
  const rng = mulberry32(seed);

  // Initialize W (n x n) from seeded Gaussian
  let W = createMatrix(nComponents, nComponents, 0);
  for (let i = 0; i < nComponents; i++) {
    for (let j = 0; j < nComponents; j++) {
      W[i][j] = boxMullerGaussian(rng);
    }
  }

  // Orthogonalize initial W: W <- (W W^T)^(-1/2) W
  let WWT = multiplyMatrices(W, transposeMatrix(W));
  let invSqrt = invSqrtSymmetric(WWT);
  W = multiplyMatrices(invSqrt, W);

  let converged = false;
  let finalIter = 0;

  // Buffer for Y = W * Z
  const Y = Array.from({ length: nComponents }, () => new Float64Array(numSamples));

  for (let iter = 1; iter <= maxIter; iter++) {
    finalIter = iter;

    // Y = W * Z
    for (let i = 0; i < nComponents; i++) {
      const Yi = Y[i];
      const Wi = W[i];
      for (let s = 0; s < numSamples; s++) {
        let sum = 0;
        for (let j = 0; j < nComponents; j++) {
          sum += Wi[j] * Z[j][s];
        }
        Yi[s] = sum;
      }
    }

    // term1 (n x n) = g(Y) * Z^T / numSamples, where g(x) = tanh(x)
    // rowMean_gprime = mean(1 - tanh(Y[i])^2)
    const term1 = createMatrix(nComponents, nComponents, 0);
    const rowMeanGprime = new Float64Array(nComponents);

    for (let i = 0; i < nComponents; i++) {
      const Yi = Y[i];
      let sumGprime = 0;
      for (let s = 0; s < numSamples; s++) {
        const tanhY = Math.tanh(Yi[s]);
        const gPrime = 1.0 - tanhY * tanhY;
        sumGprime += gPrime;

        for (let j = 0; j < nComponents; j++) {
          term1[i][j] += tanhY * Z[j][s];
        }
      }
      rowMeanGprime[i] = sumGprime / numSamples;
      for (let j = 0; j < nComponents; j++) {
        term1[i][j] /= numSamples;
      }
    }

    // W_new = term1 - term2, where term2[i][j] = rowMeanGprime[i] * W[i][j]
    const W_new = createMatrix(nComponents, nComponents, 0);
    for (let i = 0; i < nComponents; i++) {
      const meanGp = rowMeanGprime[i];
      for (let j = 0; j < nComponents; j++) {
        W_new[i][j] = term1[i][j] - meanGp * W[i][j];
      }
    }

    // Symmetric decorrelation: W_new <- (W_new W_new^T)^(-1/2) * W_new
    WWT = multiplyMatrices(W_new, transposeMatrix(W_new));
    invSqrt = invSqrtSymmetric(WWT);
    const W_decorr = multiplyMatrices(invSqrt, W_new);

    // Convergence check: distance = max over i of | |(W_decorr W^T)[i][i]| - 1 |
    const WT = transposeMatrix(W);
    let maxDist = 0;
    for (let i = 0; i < nComponents; i++) {
      let diagVal = 0;
      for (let k = 0; k < nComponents; k++) {
        diagVal += W_decorr[i][k] * WT[k][i];
      }
      const dist = Math.abs(Math.abs(diagVal) - 1.0);
      if (dist > maxDist) maxDist = dist;
    }

    W = W_decorr;

    if (maxDist < tol) {
      converged = true;
      break;
    }

    if (iter % 10 === 0 && onProgress) {
      await onProgress(`FastICA iterating: step ${iter}/${maxIter} (error: ${maxDist.toExponential(2)})`);
    }
  }

  const message = converged
    ? `Converged at iteration ${finalIter}`
    : `Did not converge within ${maxIter} iterations`;

  return { W, message, iterations: finalIter };
}

// 7. separate(Xin, nComponents)
export async function separate(
  Xin: Float64Array[],
  nComponents: number,
  onProgress?: (msg: string) => Promise<void>
): Promise<{
  ica: Float64Array[];
  pca: Float64Array[];
  W: number[][];
  W_white: number[][];
  covariance_Z: number[][];
  convergenceMessage: string;
  eigenvalues: number[];
}> {
  const m = Xin.length;
  const numSamples = Xin[0].length;

  if (onProgress) await onProgress('Centering signals...');
  // Center Xin
  const Xc: Float64Array[] = new Array(m);
  for (let i = 0; i < m; i++) {
    const row = new Float64Array(numSamples);
    let mean = 0;
    for (let s = 0; s < numSamples; s++) mean += Xin[i][s];
    mean /= numSamples;
    for (let s = 0; s < numSamples; s++) row[s] = Xin[i][s] - mean;
    Xc[i] = row;
  }

  if (onProgress) await onProgress('Computing covariance & eigendecomposition...');
  // Covariance C = Xc Xc^T / numSamples
  const C = createMatrix(m, m, 0);
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      let sum = 0;
      for (let s = 0; s < numSamples; s++) {
        sum += Xc[i][s] * Xc[j][s];
      }
      C[i][j] = sum / numSamples;
    }
  }

  // Jacobi eigendecomposition
  const { eigenvalues: rawVals, eigenvectors: rawVecs } = jacobiEigendecomposition(C);

  // Sort eigenvalues in DESCENDING order and keep top nComponents
  const indices = Array.from({ length: m }, (_, i) => i);
  indices.sort((a, b) => rawVals[b] - rawVals[a]);

  const topIndices = indices.slice(0, nComponents);
  const vals = topIndices.map((idx) => rawVals[idx]);

  // Whitening matrix W_white = diag(1/sqrt(vals)) * vecs^T
  // vecs^T row k corresponds to eigenvector topIndices[k]
  const W_white = createMatrix(nComponents, m, 0);
  for (let k = 0; k < nComponents; k++) {
    const colIdx = topIndices[k];
    const invStd = vals[k] > 1e-12 ? 1.0 / Math.sqrt(vals[k]) : 0;
    for (let j = 0; j < m; j++) {
      W_white[k][j] = invStd * rawVecs[j][colIdx];
    }
  }

  if (onProgress) await onProgress('Whitening data (PCA)...');
  // Whitened Zw = W_white * Xc
  const Zw: Float64Array[] = Array.from({ length: nComponents }, () => new Float64Array(numSamples));
  for (let k = 0; k < nComponents; k++) {
    const Zk = Zw[k];
    const Wk = W_white[k];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let j = 0; j < m; j++) {
        sum += Wk[j] * Xc[j][s];
      }
      Zk[s] = sum;
    }
  }

  // Compute covariance of Zw to display and verify
  const covZ = createMatrix(nComponents, nComponents, 0);
  for (let i = 0; i < nComponents; i++) {
    for (let j = 0; j < nComponents; j++) {
      let sum = 0;
      for (let s = 0; s < numSamples; s++) {
        sum += Zw[i][s] * Zw[j][s];
      }
      covZ[i][j] = sum / numSamples;
    }
  }

  if (onProgress) await onProgress('Running FastICA...');
  const { W, message } = await fastICA(Zw, nComponents, 200, 1e-5, 42, onProgress);

  // Separated S_est = W * Zw
  const S_est: Float64Array[] = Array.from({ length: nComponents }, () => new Float64Array(numSamples));
  for (let i = 0; i < nComponents; i++) {
    const Si = S_est[i];
    const Wi = W[i];
    for (let s = 0; s < numSamples; s++) {
      let sum = 0;
      for (let j = 0; j < nComponents; j++) {
        sum += Wi[j] * Zw[j][s];
      }
      Si[s] = sum;
    }
  }

  return {
    ica: S_est,
    pca: Zw,
    W,
    W_white,
    covariance_Z: covZ,
    convergenceMessage: message,
    eigenvalues: vals,
  };
}

// 8. Evaluation: SDR and Pearson Correlation
export interface MatchResult {
  origIndex: number;
  estIndex: number;
  correlation: number;
  sdr: number;
  alpha: number;
}

export function evaluateSeparation(
  S_true: Float64Array[],
  S_est: Float64Array[]
): {
  corrMatrix: number[][];
  matches: MatchResult[];
  alignedSignals: Float64Array[];
  averageSDR: number;
} {
  const n = S_true.length;
  const numSamples = S_true[0].length;

  // Center S_true
  const Sc: Float64Array[] = S_true.map((row) => {
    let mean = 0;
    for (let s = 0; s < numSamples; s++) mean += row[s];
    mean /= numSamples;
    const cRow = new Float64Array(numSamples);
    for (let s = 0; s < numSamples; s++) cRow[s] = row[s] - mean;
    return cRow;
  });

  // Center S_est
  const Ec: Float64Array[] = S_est.map((row) => {
    let mean = 0;
    for (let s = 0; s < numSamples; s++) mean += row[s];
    mean /= numSamples;
    const cRow = new Float64Array(numSamples);
    for (let s = 0; s < numSamples; s++) cRow[s] = row[s] - mean;
    return cRow;
  });

  // Absolute Pearson correlation matrix
  const corrMatrix = createMatrix(n, n, 0);
  for (let i = 0; i < n; i++) {
    let normTrue = 0;
    for (let s = 0; s < numSamples; s++) normTrue += Sc[i][s] * Sc[i][s];
    normTrue = Math.sqrt(normTrue);

    for (let j = 0; j < n; j++) {
      let normEst = 0;
      let dot = 0;
      for (let s = 0; s < numSamples; s++) {
        dot += Sc[i][s] * Ec[j][s];
        normEst += Ec[j][s] * Ec[j][s];
      }
      normEst = Math.sqrt(normEst);
      const denom = normTrue * normEst;
      corrMatrix[i][j] = denom > 1e-12 ? Math.abs(dot / denom) : 0;
    }
  }

  // Brute-force permutations of size n (n <= 5)
  const perms = generatePermutations(n);
  let bestScore = -1;
  let bestPerm = perms[0];

  for (const perm of perms) {
    let currentScore = 0;
    for (let i = 0; i < n; i++) {
      currentScore += corrMatrix[i][perm[i]];
    }
    if (currentScore > bestScore) {
      bestScore = currentScore;
      bestPerm = perm;
    }
  }

  // Compute per-matched-pair alpha, SDR, aligned signal
  const matches: MatchResult[] = [];
  const alignedSignals: Float64Array[] = [];
  let sdrSum = 0;

  for (let i = 0; i < n; i++) {
    const j = bestPerm[i];
    const y = S_est[j];

    let dotSy = 0;
    let dotYy = 0;
    let sumSsq = 0;
    for (let s = 0; s < numSamples; s++) {
      dotSy += Sc[i][s] * y[s];
      dotYy += y[s] * y[s];
      sumSsq += Sc[i][s] * Sc[i][s];
    }
    const alpha = dotYy > 1e-12 ? dotSy / dotYy : 0;

    let sumErrSq = 0;
    const aligned = new Float64Array(numSamples);
    for (let s = 0; s < numSamples; s++) {
      const pred = alpha * y[s];
      aligned[s] = pred;
      const err = Sc[i][s] - pred;
      sumErrSq += err * err;
    }
    alignedSignals.push(aligned);

    let sdr: number;
    if (sumErrSq <= 1e-12) {
      sdr = 100.0;
    } else if (sumSsq <= 1e-12) {
      sdr = 0.0;
    } else {
      sdr = 10.0 * Math.log10(sumSsq / sumErrSq);
      if (sdr > 100.0) sdr = 100.0;
    }

    sdrSum += sdr;
    matches.push({
      origIndex: i,
      estIndex: j,
      correlation: corrMatrix[i][j],
      sdr,
      alpha,
    });
  }

  return {
    corrMatrix,
    matches,
    alignedSignals,
    averageSDR: sdrSum / n,
  };
}

function generatePermutations(n: number): number[][] {
  const result: number[][] = [];
  const curr: number[] = [];
  const used = new Array(n).fill(false);

  function backtrack(): void {
    if (curr.length === n) {
      result.push([...curr]);
      return;
    }
    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        used[i] = true;
        curr.push(i);
        backtrack();
        curr.pop();
        used[i] = false;
      }
    }
  }

  backtrack();
  return result;
}

// 9. WAV Encoder (16-bit PCM Mono, Little-Endian, Normalized)
export function encodeWav16Bit(samples: Float64Array, sampleRate: number): Uint8Array {
  // Normalize by max absolute value first
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  const scale = maxAbs > 0 ? 0.98 / maxAbs : 1.0;

  const numSamples = samples.length;
  const byteRate = sampleRate * 2;
  const blockAlign = 2;
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // BitsPerSample (16)

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  // Write PCM samples
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    let s = samples[i] * scale;
    if (s > 1.0) s = 1.0;
    if (s < -1.0) s = -1.0;
    const sampleInt = s < 0 ? s * 32768 : s * 32767;
    view.setInt16(offset, Math.round(sampleInt), true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// 10. Mini-Shazam Fingerprinting & Audio Identification
export interface AudioPeak {
  freqIndex: number;
  timeIndex: number;
}

export function computeSpectrogram(
  audioData: Float64Array,
  nperseg = 1024,
  hop = 512
): { L: number[][]; numFrames: number; numBins: number; medianL: number } {
  // Hann window
  const hann = new Float64Array(nperseg);
  for (let i = 0; i < nperseg; i++) {
    hann[i] = 0.5 * (1.0 - Math.cos((2.0 * Math.PI * i) / (nperseg - 1)));
  }

  const numFrames = Math.max(1, Math.floor((audioData.length - nperseg) / hop) + 1);
  const numBins = nperseg / 2 + 1; // 513 bins

  const L: number[][] = Array.from({ length: numBins }, () => new Array(numFrames));
  const allValues: number[] = [];

  const real = new Float64Array(nperseg);
  const imag = new Float64Array(nperseg);

  for (let t = 0; t < numFrames; t++) {
    const start = t * hop;
    for (let i = 0; i < nperseg; i++) {
      real[i] = audioData[start + i] * hann[i];
      imag[i] = 0.0;
    }
    fftRadix2(real, imag, false);

    for (let f = 0; f < numBins; f++) {
      const power = real[f] * real[f] + imag[f] * imag[f];
      const dB = 10.0 * Math.log10(power + 1e-12);
      L[f][t] = dB;
      allValues.push(dB);
    }
  }

  // Median calculation
  allValues.sort((a, b) => a - b);
  const medianL = allValues[Math.floor(allValues.length / 2)];

  return { L, numFrames, numBins, medianL };
}

// Separable 21x21 maximum filter and peak selection
export function extractSpectrogramPeaks(
  L: number[][],
  numBins: number,
  numFrames: number,
  medianL: number,
  thresholdDb = 18
): AudioPeak[] {
  // Pass 1: 1D max along frequency (radius 10)
  const maxF: number[][] = Array.from({ length: numBins }, () => new Array(numFrames));
  for (let t = 0; t < numFrames; t++) {
    for (let f = 0; f < numBins; f++) {
      let m = -Infinity;
      const fMin = Math.max(0, f - 10);
      const fMax = Math.min(numBins - 1, f + 10);
      for (let j = fMin; j <= fMax; j++) {
        if (L[j][t] > m) m = L[j][t];
      }
      maxF[f][t] = m;
    }
  }

  // Pass 2: 1D max along time (radius 10)
  const threshold = medianL + thresholdDb;
  const peaks: AudioPeak[] = [];

  for (let f = 0; f < numBins; f++) {
    for (let t = 0; t < numFrames; t++) {
      let m = -Infinity;
      const tMin = Math.max(0, t - 10);
      const tMax = Math.min(numFrames - 1, t + 10);
      for (let j = tMin; j <= tMax; j++) {
        if (maxF[f][j] > m) m = maxF[f][j];
      }
      // Check if original is the 21x21 maximum and exceeds threshold
      if (L[f][t] === m && L[f][t] > threshold) {
        peaks.push({ freqIndex: f, timeIndex: t });
      }
    }
  }

  // Sort peaks by timeIndex
  peaks.sort((a, b) => a.timeIndex - b.timeIndex);
  return peaks;
}

// Generate constellation hashes from peaks (fan-out 6, dt in [1, 60])
export function generateHashes(
  peaks: AudioPeak[],
  fanOut = 6
): Array<{ hash: number; anchorTime: number }> {
  const hashes: Array<{ hash: number; anchorTime: number }> = [];

  for (let k = 0; k < peaks.length; k++) {
    const p1 = peaks[k];
    let count = 0;

    for (let m = k + 1; m < peaks.length; m++) {
      const p2 = peaks[m];
      const dt = p2.timeIndex - p1.timeIndex;
      if (dt < 1) continue;
      if (dt > 60) break; // Peaks are sorted by timeIndex

      const hashKey = p1.freqIndex * 1000000 + p2.freqIndex * 1000 + dt;
      hashes.push({ hash: hashKey, anchorTime: p1.timeIndex });
      count++;
      if (count >= fanOut) break;
    }
  }

  return hashes;
}

// Fingerprint query matching against a library
export interface LibraryEntry {
  songId: string;
  songName: string;
}

export type ShazamLibrary = Map<number, Array<{ songId: string; anchorTime: number }>>;

export function matchClipAgainstLibrary(
  clipHashes: Array<{ hash: number; anchorTime: number }>,
  library: ShazamLibrary,
  allSongs: LibraryEntry[]
): {
  bestSongId: string | null;
  bestSongName: string;
  bestScore: number;
  isConfident: boolean;
  songScores: Array<{ songId: string; songName: string; score: number }>;
} {
  // Offset voting map: songId -> Map<offset, count>
  const votes = new Map<string, Map<number, number>>();
  for (const song of allSongs) {
    votes.set(song.songId, new Map());
  }

  for (const q of clipHashes) {
    const matches = library.get(q.hash);
    if (!matches) continue;
    for (const match of matches) {
      const offset = match.anchorTime - q.anchorTime;
      const songVotes = votes.get(match.songId);
      if (songVotes) {
        songVotes.set(offset, (songVotes.get(offset) || 0) + 1);
      }
    }
  }

  // Calculate highest vote count at a single offset for each song
  const songScores = allSongs.map((song) => {
    const songVotes = votes.get(song.songId);
    let maxOffsetCount = 0;
    if (songVotes) {
      for (const count of songVotes.values()) {
        if (count > maxOffsetCount) maxOffsetCount = count;
      }
    }
    return {
      songId: song.songId,
      songName: song.songName,
      score: maxOffsetCount,
    };
  });

  songScores.sort((a, b) => b.score - a.score);

  const best = songScores[0];
  const bestScore = best ? best.score : 0;
  const isConfident = bestScore >= 10;
  const bestSongId = bestScore > 0 ? best.songId : null;
  const bestSongName = bestScore > 0 ? best.songName : 'No match';

  return {
    bestSongId,
    bestSongName,
    bestScore,
    isConfident,
    songScores,
  };
}
