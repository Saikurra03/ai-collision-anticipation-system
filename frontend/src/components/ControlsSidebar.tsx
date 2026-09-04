import { useEffect, useState } from 'react';
import { Database, Shuffle, Settings2, Loader2 } from 'lucide-react';
import { api } from '../api';
import type { DatasetVideo } from '../types';

export type InputMode = 'upload' | 'random' | 'automated';

interface ControlsSidebarProps {
  mode: InputMode;
  onModeChange: (mode: InputMode) => void;
  confidence: number;
  onConfidenceChange: (v: number) => void;
  onSelectVideo: (video: { file_path: string; file_name: string }) => void;
  onStartDatasetTest: (
    category: string,
    count: number,
    seed: string
  ) => void;
  datasetRunning: boolean;
}

export function ControlsSidebar({
  mode,
  onModeChange,
  confidence,
  onConfidenceChange,
  onSelectVideo,
  onStartDatasetTest,
  datasetRunning,
}: ControlsSidebarProps) {
  const [category, setCategory] = useState('both');
  const [count, setCount] = useState(5);
  const [seed, setSeed] = useState('');
  const [videos, setVideos] = useState<DatasetVideo[]>([]);
  const [pickingRandom, setPickingRandom] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .datasetSummary()
      .then((d) => {
        if (active) setVideos(d.videos);
      })
      .catch((err) => {
        if (active) setError(err.message ?? 'Unable to load dataset');
      });
    return () => {
      active = false;
    };
  }, []);

  const handlePickRandom = async () => {
    setError(null);
    setPickingRandom(true);
    try {
      const res = await api.datasetRandom(category, 1, seed);
      if (res.videos.length === 0) {
        setError('No videos matched the criteria.');
        return;
      }
      onSelectVideo(res.videos[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Random pick failed');
    } finally {
      setPickingRandom(false);
    }
  };

  const handleStart = () => {
    onStartDatasetTest(category, count, seed);
  };

  const validCount = videos.filter((v) => v.is_valid).length;

  return (
    <aside className="space-y-4 rounded-xl border border-white/10 bg-ink-900/40 p-4">
      <div className="flex items-center gap-2">
        <Settings2 className="h-4 w-4 text-accent" />
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
          Controls
        </span>
      </div>

      <div>
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Input Mode
        </label>
        <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-ink-800/60 p-1">
          {(
            [
              { id: 'upload', label: 'Upload' },
              { id: 'random', label: 'Random' },
              { id: 'automated', label: 'Auto' },
            ] as { id: InputMode; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onModeChange(opt.id)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                mode === opt.id
                  ? 'bg-accent text-ink-950'
                  : 'text-slate-300 hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'random' && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-ink-800/40 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Shuffle className="h-4 w-4 text-accent" />
            Random Dataset Video
          </div>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="both">Both</option>
              <option value="all">All</option>
            </select>
          </Field>
          <Field label="Seed (optional)">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 42"
              className="w-full rounded-md border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </Field>
          <button
            type="button"
            onClick={handlePickRandom}
            disabled={pickingRandom || datasetRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-accent/90 disabled:opacity-50"
          >
            {pickingRandom ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Shuffle className="h-3.5 w-3.5" />
            )}
            Pick Random Video
          </button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}

      {mode === 'automated' && (
        <div className="space-y-3 rounded-lg border border-white/10 bg-ink-800/40 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Database className="h-4 w-4 text-accent" />
            Automated Dataset Test
          </div>
          <Field label="Category">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="positive">Positive</option>
              <option value="negative">Negative</option>
              <option value="both">Both</option>
              <option value="all">All</option>
            </select>
          </Field>
          <Field label={`Number of videos (max ${Math.max(validCount, 1)})`}>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) =>
                setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
              }
              className="w-full rounded-md border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </Field>
          <Field label="Seed (optional)">
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="e.g. 42"
              className="w-full rounded-md border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
            />
          </Field>
          <button
            type="button"
            onClick={handleStart}
            disabled={datasetRunning}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-ink-950 transition hover:bg-accent/90 disabled:opacity-50"
          >
            {datasetRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            Start Test
          </button>
          {error && <p className="text-xs text-red-300">{error}</p>}
        </div>
      )}

      <div>
        <label className="mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Detection Confidence
        </label>
        <input
          type="range"
          min={0.1}
          max={1.0}
          step={0.05}
          value={confidence}
          onChange={(e) => onConfidenceChange(Number(e.target.value))}
          className="w-full accent-accent"
        />
        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>0.10</span>
          <span className="font-mono text-slate-200">{confidence.toFixed(2)}</span>
          <span>1.00</span>
        </div>
      </div>

      <div className="border-t border-white/5 pt-3 text-[10px] leading-relaxed text-slate-500">
        AI Collision Anticipation System v2.0
        <br />
        Software Simulation Prototype
      </div>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}