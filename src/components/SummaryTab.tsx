import React from 'react';

export const SummaryTab: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto py-2">
      <div className="rounded border border-slate-800 bg-slate-900/60 p-6 flex flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold text-slate-100 mb-2">
            Independent Component Analysis: Theoretical Synthesis & Methodology
          </h2>
          <p className="text-xs text-slate-400">
            A comprehensive overview of statistical principles, signal transformations, and evaluation metrics in blind source separation.
          </p>
        </div>

        <div className="space-y-6 text-sm text-slate-300 leading-relaxed">
          <section className="flex flex-col gap-1.5 border-b border-slate-800/80 pb-5">
            <h3 className="font-semibold text-slate-100">
              1. Why ICA over PCA?
            </h3>
            <p>
              PCA only uses second-order statistics (covariances), so it can make signals uncorrelated but cannot find the sources. Uncorrelated is weaker than independent. ICA also uses higher-order statistics, which describe the shape of the data, to find the rotation that makes the outputs statistically independent.
            </p>
          </section>

          <section className="flex flex-col gap-1.5 border-b border-slate-800/80 pb-5">
            <h3 className="font-semibold text-slate-100">
              2. What does whitening do and why does it simplify ICA?
            </h3>
            <p>
              Whitening makes the mixed signals uncorrelated with equal variance, so their covariance becomes the identity. After that the only unknown left is a rotation, which ICA can search for much more easily than a full mixing matrix.
            </p>
          </section>

          <section className="flex flex-col gap-1.5 border-b border-slate-800/80 pb-5">
            <h3 className="font-semibold text-slate-100">
              3. Why does non-Gaussianity enable separation, and how does the Central Limit Theorem relate?
            </h3>
            <p>
              The Central Limit Theorem says a sum of independent variables looks closer to a Gaussian than the variables themselves. A mixture is a sum of sources, so mixtures are more Gaussian than the sources. Searching for the least Gaussian directions leads back to the sources. This only works if at most one source is Gaussian, because Gaussian data looks the same in every rotation.
            </p>
          </section>

          <section className="flex flex-col gap-1.5 border-b border-slate-800/80 pb-5">
            <h3 className="font-semibold text-slate-100">
              4. How are the experiments and metrics chosen?
            </h3>
            <p>
              Correlation is simple and shows whether the shape matches. SDR (signal-to-distortion ratio in dB) is the standard audio-separation score and also counts leakage between sources. Both are computed after fixing the order, sign and scale. The noise experiment tests robustness and the PCA comparison shows why ICA is needed.
            </p>
          </section>

          <section className="flex flex-col gap-1.5 pt-1">
            <h3 className="font-semibold text-slate-100">
              Limitations
            </h3>
            <p className="text-slate-400">
              Synthetic mixtures are exactly linear without echo or noise, so near-perfect scores are expected. Real recordings give lower scores.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
