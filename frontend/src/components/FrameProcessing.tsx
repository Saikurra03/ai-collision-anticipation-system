import { JobSnapshot } from '../types';

interface FrameProcessingProps {
  job: JobSnapshot | null;
}

function WorkflowStep({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col items-center">
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm min-w-[120px]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <div className="mt-0.5 text-base font-bold text-slate-900">{value ?? '—'}</div>
      </div>
    </div>
  );
}

export function FrameProcessing({ job }: FrameProcessingProps) {
  const frameValue = job ? `${job.frame.toLocaleString()} / ${job.total.toLocaleString()}` : null;
  const progressValue = job?.progress !== undefined ? `${(job.progress * 100).toFixed(1)}%` : null;
  const fpsValue = (() => {
    const fps = job?.result?.stats?.processing_fps ?? job?.stats?.processing_fps;
    return fps ? `${fps.toFixed(1)}` : null;
  })();
  const objectsValue = job?.result?.stats?.total_detections ?? job?.stats?.total_detections;
  const collisionsValue = job?.result?.stats?.collision_count ?? job?.stats?.collision_count;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-medium text-slate-900 mb-3">Frame Processing</h3>
      {!job ? (
        <div className="text-center py-4 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-sm">No analysis has been run yet.</p>
        </div>
      ) : (
        <div className="flex flex-col items-stretch gap-2">
          <WorkflowStep label="Frame" value={frameValue} />
          <div className="flex justify-center text-slate-300 text-lg font-bold leading-none">▼</div>
          <WorkflowStep label="Progress" value={progressValue} />
          <div className="flex justify-center text-slate-300 text-lg font-bold leading-none">▼</div>
          <WorkflowStep label="FPS" value={fpsValue} />
          <div className="flex justify-center text-slate-300 text-lg font-bold leading-none">▼</div>
          <WorkflowStep label="Objects" value={objectsValue !== undefined ? String(objectsValue) : null} />
          <div className="flex justify-center text-slate-300 text-lg font-bold leading-none">▼</div>
          <WorkflowStep label="Collisions" value={collisionsValue !== undefined ? String(collisionsValue) : null} />
        </div>
      )}
    </div>
  );
}
