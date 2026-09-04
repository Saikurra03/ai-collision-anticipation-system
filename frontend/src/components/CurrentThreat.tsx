import { ShieldCheck } from 'lucide-react';
import type { PrimaryThreat } from '../types';
import { riskColor } from '../utils/format';

interface CurrentThreatProps {
  threat: PrimaryThreat | null;
  live: boolean;
}

export function CurrentThreat({ threat, live }: CurrentThreatProps) {
  const objectType = threat?.object_type ?? threat?.class_name;
  const direction = threat?.direction;
  const ttc = threat?.estimated_ttc;
  const trackingId = threat?.tracking_id;
  const riskLevel = threat?.risk_level ?? 'SAFE';
  const color = riskColor(riskLevel);

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

      {!threat ? (
        <div className="flex items-center gap-3 py-4">
          <ShieldCheck className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-sm font-medium text-slate-900">No Immediate Threat</p>
            <p className="text-xs text-slate-500">
              Final analyzed frame has no tracked threat. See the whole-video verdict for earlier risk events.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Object
            </div>
            <div className="mt-1 text-lg font-semibold capitalize text-slate-900">
              {objectType ?? '—'}
            </div>
            {trackingId !== undefined && (
              <div className="mt-0.5 text-xs text-slate-400">Track ID #{trackingId}</div>
            )}
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Approaching From
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {(direction ?? '—').toUpperCase()}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Est. TTC
            </div>
            <div className="mt-1 text-lg font-semibold text-slate-900">
              {typeof ttc === 'number' && Number.isFinite(ttc) ? (
                <>
                  {ttc.toFixed(2)}{' '}
                  <span className="text-sm font-normal text-slate-400">seconds (estimated)</span>
                </>
              ) : (
                'N/A'
              )}
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Risk Level
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: color }}
              />
              <span className="text-lg font-semibold" style={{ color }}>
                {riskLevel}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-slate-400">
              Risk score{' '}
              {Number.isFinite(threat?.risk_score ?? NaN)
                ? `${Math.round(threat?.risk_score as number)} / 100 (heuristic)`
                : 'N/A'}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Final-frame state — see whole-video verdict for the full analysis.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
