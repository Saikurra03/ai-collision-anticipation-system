import { ShieldCheck, AlertTriangle } from 'lucide-react';
import type { PipelineResultPayload } from '../types';
import { riskColor } from '../utils/format';
import { getVerdict } from '../utils/verdict';

interface CurrentThreatProps {
  result: PipelineResultPayload | null;
  live: boolean;
}

const verdictColor = (level: string | undefined): string => {
  switch (level) {
    case 'HIGH_COLLISION_RISK':
      return '#DC2626';
    case 'POTENTIAL_COLLISION_RISK':
      return '#F59E0B';
    case 'LOW_RISK':
      return '#16A34A';
    case 'NO_SIGNIFICANT_RISK':
      return '#16A34A';
    default:
      return '#94A3B8';
  }
};

export function CurrentThreat({ result, live }: CurrentThreatProps) {
  const v = getVerdict(result);
  const vColor = verdictColor(v.level);
  const threat = result?.primary_threat ?? null;
  const stats = result?.stats;
  const hasEarlierRisk = v.collision_risk_detected || (stats?.cumulative_max_risk ?? 0) >= 20;
  const finalFrameSafe = !threat || (threat?.risk_level ?? 'SAFE') === 'SAFE';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Current Threat</h3>
        {live && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 border border-green-200">
            Final frame
          </span>
        )}
      </div>

      {!result ? (
        <div className="flex items-start gap-3 py-1">
          <ShieldCheck className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">Analysis Not Started</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Run analysis to see the whole-video threat assessment.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Whole-Video Verdict */}
          <div className="space-y-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Whole-Video Verdict
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full flex-shrink-0"
                style={{ background: vColor }}
              />
              <span className="text-lg font-semibold leading-tight" style={{ color: vColor }}>
                {v.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{v.reason}</p>
          </div>

          {/* Earlier Risk Warning */}
          {hasEarlierRisk && finalFrameSafe && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-amber-800">Earlier risk event detected</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  The final frame is safe, but risk was detected earlier in the video.
                  See the whole-video verdict above for details.
                </p>
              </div>
            </div>
          )}

          {/* Final Frame Threat */}
          {threat && (threat?.risk_level ?? 'SAFE') !== 'SAFE' && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Final Frame Threat
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ background: riskColor(threat?.risk_level) }}
                />
                <span className="text-sm font-semibold capitalize text-slate-900">
                  {threat?.risk_level ?? '—'}
                </span>
              </div>
              <div className="text-sm font-medium text-slate-900 capitalize leading-relaxed break-words">
                {threat?.object_type ?? threat?.class_name ?? '—'}
              </div>
              {threat?.direction && (
                <div className="text-xs text-slate-500">
                  Approaching from {(threat.direction).toUpperCase()}
                </div>
              )}
              {typeof threat?.estimated_ttc === 'number' && Number.isFinite(threat.estimated_ttc) ? (
                <div className="text-xs text-slate-500">
                  Est. TTC: {threat.estimated_ttc.toFixed(2)}s
                </div>
              ) : (
                <div className="text-xs text-slate-400">Est. TTC: N/A</div>
              )}
            </div>
          )}

          {threat && (threat?.risk_level ?? 'SAFE') === 'SAFE' && (
            <div className="flex items-start gap-3 py-1">
              <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Final frame: no elevated threat detected.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
