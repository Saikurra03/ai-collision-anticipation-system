import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type {
  AnalysisRow,
  PipelineResultPayload,
  RiskSummary,
  PipelineStats,
} from '../types';
import { fmtFloat, fmtInt, fmtSeconds, riskBadgeClasses } from '../utils/format';
import { getVerdict } from '../utils/verdict';
import { api } from '../api';

interface SystemDetailsProps {
  result: PipelineResultPayload | null;
}

const PIPELINE_STAGES = [
  'Detection',
  'Tracking',
  'Motion Analysis',
  'Prediction',
  'Collision',
  'Risk',
  'Alert',
];

export function SystemDetails({ result }: SystemDetailsProps) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleCsv = async () => {
    if (!result) return;
    setDownloading(true);
    try {
      const { csv } = await api.csvReport(result.analysis_rows);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis_report_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const handleVideoDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = api.videoUrl(result.output_video_filename);
    a.download = result.output_video_filename;
    a.click();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3.5 text-left"
      >
        <span className="text-sm font-semibold text-slate-900">System Details</span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="space-y-6 border-t border-slate-100 px-5 py-5">
          <SafetyMetrics
            riskSummary={result?.risk_summary ?? null}
            primary={result?.primary_threat ?? null}
            stats={result?.stats ?? null}
          />

          <Verdict stats={result?.stats ?? null} verdict={result ? getVerdict(result) : null} />

          <PipelineStatus hasResult={!!result} />

          <ThreatPriority threats={result?.top_threats ?? []} />

          {result && result.analysis_rows.length > 0 && (
            <AnalysisTable rows={result.analysis_rows} />
          )}

          {result && (
            <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={handleVideoDownload}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                Download Processed Video
              </button>
              <button
                type="button"
                onClick={handleCsv}
                disabled={downloading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {downloading ? 'Preparing…' : 'Download Analysis Report (CSV)'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SafetyMetrics({
  riskSummary,
  primary,
  stats,
}: {
  riskSummary: RiskSummary | null;
  primary: PipelineResultPayload['primary_threat'];
  stats: PipelineStats | null;
}) {
  const ttc = primary?.estimated_ttc ?? null;
  const pet = primary?.estimated_pet ?? null;
  const drac = primary?.estimated_drac_risk ?? null;
  const act = primary?.estimated_act ?? null;

  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Safety Metrics
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricTile label="Est. TTC" value={fmtSeconds(ttc)} />
        <MetricTile label="Est. PET" value={fmtSeconds(pet)} />
        <MetricTile label="Est. DRAC (heuristic)" value={drac ?? 'Not Available'} />
        {/* ACT is a backend urgency recommendation (IMMEDIATE/URGENT/PREPARE/
            MONITOR/N/A), never a measured physical metric. */}
        <MetricTile
          label="Recommended Action"
          value={act && act !== 'N/A' ? act : 'Not Available'}
        />
        <MetricTile label="Frame" value={stats ? fmtInt(stats.frames_processed) : 'N/A'} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        TTC/PET are monocular-video estimates, not sensor measurements. DRAC is a heuristic urgency
        category (not measured m/s²). Risk scores are 0–100 heuristic assessments.
      </p>
      {riskSummary && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MetricTile
            label="Max Risk Score"
            value={`${fmtFloat(riskSummary.max_risk_score ?? 0, 0)} / 100`}
          />
          <MetricTile
            label="Highest Risk Object"
            value={riskSummary.highest_risk_object ?? 'N/A'}
          />
          <MetricTile
            label="Objects Analyzed"
            value={fmtInt(riskSummary.total_objects ?? 0)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Honest pipeline status: only COMPLETE is shown as green, and only when a
 * real result exists. We do not claim per-module completion because the
 * backend runs all AI modules together on every frame.
 */
function PipelineStatus({ hasResult }: { hasResult: boolean }) {
  void PIPELINE_STAGES;
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Pipeline
      </h3>
      {hasResult ? (
        <p className="text-xs text-slate-600">
          <span className="rounded-md bg-green-50 border border-green-200 px-2.5 py-1 font-medium text-green-700">
            Analysis Complete
          </span>{' '}
          <span className="ml-2 text-slate-400">
            Detection → Tracking → Motion → Prediction → Collision → Risk → Output all ran per frame.
          </span>
        </p>
      ) : (
        <p className="text-xs text-slate-400">
          No analysis has completed yet. Pipeline stages will be reported honestly after processing.
        </p>
      )}
    </div>
  );
}

/** Whole-video verdict + per-class object counts, all from the backend result.
 * Uses the single centralized verdict (FIX 1/2): NEVER an independent
 * "Collision Detected YES" alongside a "no risk" message elsewhere. */
function Verdict({ stats, verdict }: { stats: PipelineStats | null; verdict: ReturnType<typeof getVerdict> | null }) {
  if (!stats) return null;
  const collisions = stats.collision_count ?? 0;
  const counts = stats.class_counts ?? {};
  const entries = Object.entries(counts);
  const total = entries.reduce((a, [, c]) => a + (c as number), 0);
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Simulation Verdict (whole video)
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="Verdict" value={verdict?.label ?? 'Not Available'} />
        <MetricTile label="Conflict Frames" value={fmtInt(collisions)} />
        <MetricTile
          label="Highest Risk"
          value={`${fmtFloat(stats.cumulative_max_risk ?? 0, 0)} / 100${stats.max_risk_frame ? ` @ frame ${fmtInt(stats.max_risk_frame)}` : ''}`}
        />
        <MetricTile label="Unique Tracks" value={fmtInt(stats.total_unique_tracks)} />
      </div>
      {verdict && (
        <p className="mt-2 text-[11px] text-slate-400">
          Basis: {verdict.reason}. A "conflict frame" means a HIGH/POTENTIAL conflict condition was
          estimated in that frame — not that a crash occurred. Strongest conflict observed:{' '}
          {stats.max_conflict ?? 'NONE'}.
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricTile label="Cars" value={fmtInt((counts['car'] as number) ?? 0)} />
        <MetricTile label="Motorcycles" value={fmtInt((counts['motorcycle'] as number) ?? 0)} />
        <MetricTile label="Bicycles" value={fmtInt((counts['bicycle'] as number) ?? 0)} />
        <MetricTile label="Persons" value={fmtInt((counts['person'] as number) ?? 0)} />
        <MetricTile label="Buses" value={fmtInt((counts['bus'] as number) ?? 0)} />
        <MetricTile label="Trucks" value={fmtInt((counts['truck'] as number) ?? 0)} />
        <MetricTile label="Other Objects" value={fmtInt(total - ['car','motorcycle','bicycle','person','bus','truck'].reduce((a,k)=>a+((counts[k] as number) ?? 0),0))} />
        <MetricTile label="Detection Events" value={fmtInt(stats.total_detections)} />
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Detection events count every per-frame detection (one vehicle seen in 50 frames = 50 events).
        Unique tracks count distinct tracked objects. Per-class counts sum to detection events.
      </p>
      {(stats.processing_errors ?? 0) > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {stats.processing_errors} frame(s) had processing errors and were passed through unannotated. See logs for details.
        </p>
      )}
    </div>
  );
}

function ThreatPriority({
  threats,
}: {
  threats: PipelineResultPayload['top_threats'];
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Threat Priority
      </h3>
      {threats.length === 0 ? (
        <p className="text-xs text-slate-400">
          No ranked threats available. Process a video to view threat ranking.
        </p>
      ) : (
        <ol className="space-y-2">
          {threats.map((t, i) => (
            <li
              key={`${t.tracking_id}-${i}`}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-slate-400">#{i + 1}</span>
                <span className="text-sm font-medium text-slate-900">
                  {t.class_name} #{t.tracking_id}
                </span>
                <span className="text-xs text-slate-500">{t.direction}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-slate-600">
                  {Math.round(t.risk_score)}/100
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${riskBadgeClasses(
                    t.risk_level
                  )}`}
                >
                  {t.risk_level}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnalysisTable({ rows }: { rows: AnalysisRow[] }) {
  const headers = ['Object', 'Track ID', 'Direction', 'Risk', 'TTC', 'PET', 'DRAC', 'Level'];
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Per-Object Summary
      </h3>
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((row, idx) => (
              <tr key={`${row.track_id}-${idx}`} className="border-t border-slate-100">
                <td className="px-3 py-2 text-slate-700">{row.class_name}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.track_id}</td>
                <td className="px-3 py-2 text-slate-700">{row.direction}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {Math.round(row.max_risk_score)}/100
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {row.estimated_ttc !== null ? row.estimated_ttc.toFixed(2) : 'N/A'}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-600">
                  {row.estimated_pet !== null ? row.estimated_pet.toFixed(2) : 'N/A'}
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">{row.estimated_drac_risk}</td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${riskBadgeClasses(
                      row.risk_level
                    )}`}
                  >
                    {row.risk_level}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
