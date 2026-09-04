import { AlertTriangle } from 'lucide-react';
import type { PrimaryThreat } from '../types';

interface ActiveAlertProps {
  threat: PrimaryThreat | null;
}

export function ActiveAlert({ threat }: ActiveAlertProps) {
  const hasThreat = !!threat && (threat.risk_score ?? 0) > 0;

  if (!hasThreat) return null;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600 shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-red-600">
            Active Driver Alert
          </div>
          <div className="mt-1 text-sm font-medium text-slate-900">
            {(threat?.object_type ?? threat?.class_name ?? 'Object')} approaching from{' '}
            <span className="text-red-600">{(threat?.direction ?? '—').toUpperCase()}</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            Estimated collision in{' '}
            <span className="font-medium text-slate-700">
              {typeof threat?.estimated_ttc === 'number' && Number.isFinite(threat.estimated_ttc)
                ? `${threat.estimated_ttc.toFixed(2)} seconds (estimated)`
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
