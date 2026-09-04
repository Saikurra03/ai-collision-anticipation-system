import { Shield, Activity } from 'lucide-react';

interface HeaderProps {
  status: 'idle' | 'live' | 'processing';
  /** Honest application state label (never claims camera hardware). */
  detail: string;
}

export function Header({ status, detail }: HeaderProps) {
  const cfg = {
    idle: { label: 'System Idle', dot: 'bg-slate-400', text: 'text-slate-500' },
    live: { label: 'System Active', dot: 'bg-green-500', text: 'text-green-600' },
    processing: { label: 'Processing', dot: 'bg-amber-500', text: 'text-amber-600' },
  }[status];

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
            <Shield className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold text-slate-900">AI Driver Alert System</h1>
            <p className="text-xs text-slate-500">AI-powered collision anticipation</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
            <span className={`text-sm font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Activity className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-500">{detail}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
