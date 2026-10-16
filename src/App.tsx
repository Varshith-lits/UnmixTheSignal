/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Sliders, RotateCcw, Activity } from 'lucide-react';
import { SeparateTab, GlobalSessionState } from './components/SeparateTab.tsx';
import { NoiseExperimentTab } from './components/NoiseExperimentTab.tsx';
import { MiniShazamTab } from './components/MiniShazamTab.tsx';
import { SummaryTab } from './components/SummaryTab.tsx';
import { stopCurrentPlayback } from './utils/audio.ts';

type ActiveTab = 'separate' | 'noise' | 'shazam' | 'summary';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('separate');
  const [maxSeconds, setMaxSeconds] = useState<number>(30);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sessionState, setSessionState] = useState<GlobalSessionState | null>(null);

  const handleTabChange = (tab: ActiveTab) => {
    stopCurrentPlayback();
    setActiveTab(tab);
  };

  const handleResetSession = () => {
    stopCurrentPlayback();
    setSessionState(null);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Bar Contract: Exactly 3 Zones */}
      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <Activity className="h-4 w-4 text-cyan-400" />
            <span className="font-semibold tracking-tight text-slate-100 font-mono text-sm">
              Audio ICA Lab
            </span>
          </div>

          {/* Zone 2: 4 single-line text navigation links / tabs */}
          <nav className="flex items-center gap-1 sm:gap-2 overflow-x-auto text-xs font-mono font-medium py-1">
            <button
              type="button"
              onClick={() => handleTabChange('separate')}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'separate'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              1. Separate
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('noise')}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'noise'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              2. Noise Experiment
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('shazam')}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'shazam'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              3. Mini-Shazam
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('summary')}
              className={`px-3 py-1.5 rounded transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'summary'
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              4. Summary
            </button>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              aria-label="Toggle audio settings"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono transition-colors border ${
                showSettings
                  ? 'border-cyan-700 bg-cyan-950/60 text-cyan-300'
                  : 'border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
      </header>

      {/* Collapsible Settings Box */}
      {showSettings && (
        <div className="border-b border-slate-800 bg-slate-950/90 px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <label htmlFor="max-sec-input" className="text-slate-400">
                  Max seconds per file:
                </label>
                <input
                  id="max-sec-input"
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={maxSeconds}
                  onChange={(e) => setMaxSeconds(Math.max(5, Math.min(120, Number(e.target.value) || 30)))}
                  className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500 tabular-nums"
                />
                <span className="text-slate-500">sec (default 30)</span>
              </div>

              <div className="text-slate-400">
                AudioContext Sample Rate: <span className="text-cyan-400 font-semibold">22,050 Hz</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleResetSession}
              className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Clear In-Memory Cache</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'separate' && (
          <SeparateTab
            maxSeconds={maxSeconds}
            sessionState={sessionState}
            setSessionState={setSessionState}
          />
        )}

        {activeTab === 'noise' && (
          <NoiseExperimentTab sessionState={sessionState} />
        )}

        {activeTab === 'shazam' && (
          <MiniShazamTab maxSeconds={maxSeconds} sessionState={sessionState} />
        )}

        {activeTab === 'summary' && <SummaryTab />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-4 text-center text-xs font-mono text-slate-500">
        In-Browser Independent Component Analysis (ICA) & Audio Separation Lab &middot; 22,050 Hz 16-Bit Little-Endian PCM
      </footer>
    </div>
  );
}
