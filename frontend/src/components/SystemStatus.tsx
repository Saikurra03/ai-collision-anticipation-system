import { Shield, Camera, Activity, Cpu } from 'lucide-react';
import type { PipelineStats } from '../types';
import { fmtFloat, fmtInt } from '../utils/format';

interface SystemStatusProps {
  status: 'idle' | 'live' | 'processing';
  stats: PipelineStats | null;
  hasVideo: boolean;
}

export function SystemStatus({ status, stats, hasVideo }: SystemStatusProps) {
  const cfg = {
    idle: { label: 'Idle', dot: 'bg-slate-400', text: 'text-slate-500' },
    live: { label: 'Active', dot: 'bg-green-500', text: 'text-green-600' },
    processing: { label: 'Processing', dot: 'bg-amber-500', text: 'text-amber-600' },
  }[status];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-900">System Status</h3>
      <div>
        <Row
          icon={<Shield className="h-4 w-4 text-slate-400" />}
          label="System"
          value={
            <span className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
              <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
            </span>
          }
        />
        <Row
          icon={<Camera className="h-4 w-4 text-slate-400" />}
          label="Video"
          value={
            <span className={`text-sm font-medium ${hasVideo ? 'text-green-600' : 'text-slate-400'}`}>
              {hasVideo ? 'Loaded' : 'None selected'}
            </span>
          }
        />
        <Row
          icon={<Activity className="h-4 w-4 text-slate-400" />}
          label="FPS"
          value={
            <span className="text-sm font-medium text-slate-900">
              {stats ? fmtFloat(stats.processing_fps, 1) : '—'}
            </span>
          }
        />
        <Row
          icon={<Cpu className="h-4 w-4 text-slate-400" />}
          label="Detected Objects"
          value={
            <span className="text-sm font-medium text-slate-900">
              {stats ? fmtInt(stats.total_detections) : '—'}
            </span>
          }
        />
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-sm text-slate-500">{label}</span>
      </div>
      {value}
    </div>
  );
}
