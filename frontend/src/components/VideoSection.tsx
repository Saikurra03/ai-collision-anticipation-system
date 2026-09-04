import { useEffect, useRef, useState } from 'react';
import {
  RotateCcw,
  Upload,
  Video as VideoIcon,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import type { JobSnapshot, AnalysisVerdict } from '../types';
import { api } from '../api';
import { getVerdict } from '../utils/verdict';

/** Whole-video verdict panel driven by the single centralized verdict (FIX 1/2). */
function VerdictPanel({ verdict }: { verdict: AnalysisVerdict }) {
  const risk = verdict.level === 'HIGH_COLLISION_RISK' || verdict.level === 'POTENTIAL_COLLISION_RISK';
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border ${
        risk ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
      }`}
    >
      <CheckCircle
        className={`h-5 w-5 flex-shrink-0 ${risk ? 'text-amber-600' : 'text-emerald-600'}`}
      />
      <div>
        <div className={`font-medium ${risk ? 'text-amber-800' : 'text-emerald-800'}`}>
          Analysis Complete — {verdict.label}
        </div>
        <div className={`text-sm mt-0.5 ${risk ? 'text-amber-700' : 'text-emerald-700'}`}>
          {verdict.reason}. Estimates from video-based motion analysis; no crash occurred or was recorded.
        </div>
      </div>
    </div>
  );
}

interface VideoSectionProps {
  job: JobSnapshot | null;
  videoPath: string | null;
  selectedFilename: string | null;
  selectedDisplayName?: string | null;
  confidence: number;
  isPlaying: boolean;
  onConfidenceChange: (value: number) => void;
  onReset: () => void;
  onFileSelected: (file: File) => void;
  onSelectSourceVideo?: (video: { file_path: string; file_name: string; display_name?: string }) => void;
  onStartProcessing: () => void;
  processing: boolean;
}

export function VideoSection({
  job,
  videoPath,
  selectedFilename,
  selectedDisplayName,
  confidence,
  isPlaying,
  onConfidenceChange,
  onReset,
  onFileSelected,
  onSelectSourceVideo,
  onStartProcessing,
  processing,
}: VideoSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  // E9: inline (non-popup) data-source browser state.
  const [showSources, setShowSources] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourceVideos, setSourceVideos] = useState<{ file_path: string; file_name: string }[]>([]);
  const [sourcesError, setSourcesError] = useState<string | null>(null);

  useEffect(() => {
    // Keep the label next to Upload in sync when a source video is picked.
    if (selectedDisplayName) setSelectedFileName(selectedDisplayName);
  }, [selectedDisplayName]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isPlaying, job?.result?.output_video_filename]);

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setSelectedFileName(file.name);
    try {
      await onFileSelected(file);
    } finally {
      setIsUploading(false);
    }
  };

  // ROOT-CAUSE FIX (blank page): a `status: 'completed'` update can arrive
  // WITHOUT the result payload (e.g. WS result message lost/unparsable).
  // `job.result` is then `undefined`, and `undefined !== null` used to mark
  // hasResult=true and crash on `result!.primary_threat`, unmounting the
  // whole app. `?? null` keeps "completed but result pending" in the
  // processing state instead of crashing.
  const result = job?.status === 'completed' ? (job.result ?? null) : null;
  const hasResult = result !== null;
  const primaryThreat = hasResult ? result.primary_threat ?? null : null;

  const processedSrc =
    hasResult && result.output_video_filename
      ? api.videoUrl(result.output_video_filename)
      : null;

  // E1+E9: original preview streams by absolute server path through
  // GET /api/source (validated to stay inside data/). Works uniformly for
  // uploaded videos (data/uploads/...) and dataset videos
  // (data/videos/..., data/datasets/...). Never auto-starts analysis.
  const originalSrc = videoPath ? api.sourceUrl(videoPath) : null;
  const displayName = selectedDisplayName ?? selectedFilename ?? 'Video';

  const loadSources = async () => {
    setSourcesError(null);
    setSourcesLoading(true);
    try {
      const [summary, local] = await Promise.all([
        api.datasetSummary().catch(() => ({ videos: [] as never[] })),
        api.localVideos().catch(() => ({ videos: [] as never[] })),
      ]);
      const fromSummary = (summary.videos as { file_path: string; file_name: string }[]).map(
        (v) => ({ file_path: v.file_path, file_name: v.file_name })
      );
      const fromLocal = (local.videos as { path: string; filename: string }[]).map(
        (v) => ({ file_path: v.path, file_name: v.filename })
      );
      const seen = new Set<string>();
      const merged = [...fromSummary, ...fromLocal].filter((v) => {
        if (!v.file_path || seen.has(v.file_path)) return false;
        seen.add(v.file_path);
        return true;
      });
      setSourceVideos(merged);
      if (merged.length === 0) {
        setSourcesError('No source videos available yet. Upload a video or download a dataset.');
      }
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : 'Failed to load sources');
    } finally {
      setSourcesLoading(false);
    }
  };

  const toggleSources = () => {
    const next = !showSources;
    setShowSources(next);
    if (next && sourceVideos.length === 0) void loadSources();
  };

  const pickRandomSource = async () => {
    setSourcesError(null);
    setSourcesLoading(true);
    try {
      const res = await api.datasetRandom('all', 1, '');
      if (res.videos.length === 0) {
        setSourcesError('No source videos matched.');
        return;
      }
      const v = res.videos[0];
      onSelectSourceVideo?.({ file_path: v.file_path, file_name: v.file_name, display_name: v.file_name });
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : 'Random pick failed');
    } finally {
      setSourcesLoading(false);
    }
  };

  return (
    <section className="space-y-4">
      {/* Video Title */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Live Road View</h2>
{processedSrc && (
            <span className="text-xs text-slate-500">AI-annotated output</span>
          )}
          {originalSrc && !processedSrc && (
            <span className="text-xs text-emerald-600">Original Video — Ready for Analysis</span>
          )}
      </div>

      {/* Video Container */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="relative aspect-video w-full bg-slate-50">
          {processedSrc ? (
            <video
              ref={videoRef}
              src={processedSrc}
              className="h-full w-full object-contain"
              controls={false}
              playsInline
              muted
            />
          ) : originalSrc ? (
            <video
              ref={videoRef}
              src={originalSrc}
              className="h-full w-full object-contain"
              controls
              playsInline
              muted
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-center text-slate-400">
              <VideoIcon className="h-10 w-10" />
              <p>
                {videoPath
                  ? `${displayName} ready. Click Start Analysis to begin.`
                  : 'Upload a traffic video to begin AI analysis.'}
              </p>
            </div>
          )}

          {processing && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                <div className="text-sm font-medium text-slate-900">
                  {job?.step ?? 'Processing…'}
                </div>
                {job && (
                  <div className="w-64">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${Math.round(job.progress * 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-500">
                      <span>
                        Frame {job.frame.toLocaleString()} / {job.total.toLocaleString()}
                      </span>
                      <span>{Math.round(job.progress * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls Below Video */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {/* Video Source Section */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">Video Source</label>
            <div className="flex items-center gap-2">
              {/* Upload Video button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setSelectedFileName(file.name);
                    handleFile(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || processing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload Video
              </button>

              {selectedFileName && (
                <span className="text-xs text-slate-500 ml-2">{selectedFileName}</span>
              )}
              {/* E9: real dataset/HF source picker — inline panel, no popup,
                  never auto-starts analysis. */}
              <button
                type="button"
                onClick={toggleSources}
                disabled={isUploading || processing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <VideoIcon className="h-4 w-4" />
                Take Data From Sources
              </button>
            </div>
            {showSources && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">Available source videos (real files)</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={pickRandomSource}
                      disabled={sourcesLoading || processing}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      {sourcesLoading ? 'Loading…' : 'Pick Random'}
                    </button>
                    <button
                      type="button"
                      onClick={loadSources}
                      disabled={sourcesLoading}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
                {sourcesError && <p className="text-xs text-red-600">{sourcesError}</p>}
                {sourceVideos.length > 0 && (
                  <ul className="max-h-40 space-y-1 overflow-y-auto">
                    {sourceVideos.map((v) => (
                      <li key={v.file_path}>
                        <button
                          type="button"
                          disabled={processing}
                          onClick={() =>
                            onSelectSourceVideo?.({
                              file_path: v.file_path,
                              file_name: v.file_name,
                              display_name: v.file_name,
                            })
                          }
                          className="w-full truncate rounded-md px-2 py-1 text-left font-mono text-xs text-slate-700 hover:bg-white hover:text-blue-700 disabled:opacity-50"
                          title={v.file_path}
                        >
                          {v.file_name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Detection Confidence */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-500">
              Detection Confidence
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={confidence}
                onChange={(e) => onConfidenceChange(Number(e.target.value))}
                className="w-32 accent-blue-600"
              />
              <span className="w-10 font-mono text-sm text-slate-600">
                {confidence.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={!videoPath || processing}
              onClick={onStartProcessing}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
              Start Analysis
            </button>
            <button
              type="button"
              disabled={!videoPath}
              onClick={onReset}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Collision Prediction Section */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-900 mb-3">Collision Prediction</h3>
        
        {primaryThreat ? (
          <>
          <div className="grid grid-cols-4 gap-3 sm:grid-cols-4">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Object</div>
              <div className="mt-1 font-medium text-slate-900 capitalize">
                {primaryThreat.object_type ?? primaryThreat.class_name ?? '—'}
              </div>
              {primaryThreat.tracking_id !== undefined && (
                <div className="mt-0.5 text-xs text-slate-400">Track ID #{primaryThreat.tracking_id}</div>
              )}
            </div>
            
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Direction</div>
              <div className="mt-1 font-medium text-slate-900">
                {(primaryThreat.direction ?? '—').toUpperCase()}
              </div>
            </div>
            
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Est. TTC</div>
              <div className="mt-1 font-medium text-slate-900">
                {typeof primaryThreat.estimated_ttc === 'number' && Number.isFinite(primaryThreat.estimated_ttc)
                  ? `${primaryThreat.estimated_ttc.toFixed(2)} sec`
                  : 'N/A'}
              </div>
            </div>
            
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Risk Level</div>
              <div className="mt-1 flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  primaryThreat.risk_level === 'CRITICAL' ? 'bg-red-500' :
                  primaryThreat.risk_level === 'HIGH' ? 'bg-orange-500' :
                  primaryThreat.risk_level === 'MEDIUM' ? 'bg-amber-500' :
                  primaryThreat.risk_level === 'LOW' ? 'bg-emerald-500' :
                  'bg-slate-400'
                }`} />
                <span className="font-medium capitalize text-slate-900">
                  {primaryThreat.risk_level ?? '—'}
                </span>
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                Risk score {Number.isFinite(primaryThreat.risk_score ?? NaN) ? Math.round(primaryThreat.risk_score as number) : 'N/A'} / 100 (heuristic)
              </div>
            </div>
          </div>
          {result && (
            <p className="mt-2 text-xs text-slate-500">
              Whole-video verdict: <span className="font-medium text-slate-700">{getVerdict(result).label}</span>
              <span className="text-slate-400"> — threat above is the final-frame state.</span>
            </p>
          )}
          </>
        ) : hasResult ? (
          <VerdictPanel verdict={getVerdict(result)} />
        ) : processing ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-blue-200 bg-blue-50">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 flex-shrink-0" />
            <div className="text-sm text-blue-800">Analysis in progress... Collision prediction will appear after analysis completes.</div>
          </div>
        ) : !videoPath ? (
          <div className="text-center py-6 text-slate-400">
            <p>No video selected. Please upload a video to begin analysis.</p>
          </div>
        ) : (
          <div className="text-center py-6 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="font-medium text-slate-500">No analysis has been run yet.</p>
            <p className="text-sm text-slate-400 mt-1">Click <span className="font-medium text-blue-600">Start Analysis</span> to run the AI collision anticipation pipeline.</p>
          </div>
        )}
      </div>

      {/* Frame Processing Section - Below video */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-medium text-slate-900 mb-3">Frame Processing</h3>
        
        {!processing && !hasResult && !videoPath ? (
          <div className="text-center py-4 text-slate-400 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="font-medium text-slate-500">No video loaded.</p>
            <p className="text-sm text-slate-400 mt-1">Select a video source to enable frame processing.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-sm">
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Frame</div>
              <div className="mt-1 font-medium text-slate-900">
                {job?.frame?.toLocaleString() ?? '—'} / {job?.total?.toLocaleString() ?? '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Progress</div>
              <div className="mt-1 font-medium text-slate-900">
                {job?.progress !== undefined ? `${(job.progress * 100).toFixed(1)}%` : '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">FPS</div>
              <div className="mt-1 font-medium text-slate-900">
                {(() => {
                  const fps = job?.result?.stats?.processing_fps ?? job?.stats?.processing_fps;
                  return fps ? fps.toFixed(1) : '—';
                })()}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Objects</div>
              <div className="mt-1 font-medium text-slate-900">
                {job?.result?.stats?.total_detections ?? job?.stats?.total_detections ?? '—'}
              </div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 bg-slate-50">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Collisions</div>
              <div className="mt-1 font-medium text-slate-900 text-red-600">
                {job?.result?.stats?.collision_count ?? job?.stats?.collision_count ?? '—'}
              </div>
            </div>
          </div>
        )}

        {/* Pipeline Stage — honest coarse status driven by the backend's
            structured `stage` field (LOADING_VIDEO / ANALYZING_FRAMES /
            FINALIZING / COMPLETED / FAILED). Per-module badges would be
            dishonest because all AI modules run together on every frame. */}
        {(processing || hasResult || job?.status === 'error') && (
          <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-400">Pipeline</div>
              {processing && job?.progress !== undefined && (
                <div className="w-32">
                  <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${Math.min(job.progress * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const order = ['LOADING_VIDEO', 'ANALYZING_FRAMES', 'FINALIZING', 'COMPLETED'] as const;
                const labels: Record<string, string> = {
                  LOADING_VIDEO: 'Loading video',
                  ANALYZING_FRAMES: 'Analyzing frames',
                  FINALIZING: 'Finalizing',
                  COMPLETED: 'Complete',
                };
                const failed = job?.status === 'error';
                const current = failed
                  ? -1
                  : hasResult
                    ? 3
                    : Math.max(0, order.indexOf((job?.stage as string) as typeof order[number]));
                return (
                  <>
                    {order.map((s, i) => {
                      const state = failed && i === current + 1 ? 'failed' : i < current ? 'completed' : i === current ? 'active' : 'pending';
                      return (
                        <span
                          key={s}
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            state === 'completed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : state === 'active'
                                ? 'bg-blue-100 text-blue-700'
                                : state === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {failed && i === 0 ? 'Failed' : labels[s]}
                          {state === 'active' && <Loader2 className="h-3 w-3 animate-spin ml-1 inline-block" />}
                          {state === 'completed' && <CheckCircle className="h-3 w-3 ml-1 inline-block" />}
                        </span>
                      );
                    })}
                    {failed && (
                      <span className="text-xs text-red-600">{job?.error ?? 'Processing failed'}</span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {hasResult && (job?.result?.stats || job?.stats) && (
          <div className="mt-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-2">Processing Summary</div>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div><span className="text-slate-400">Frames Processed: </span><span className="font-medium">{(job.result?.stats?.frames_processed ?? job.stats?.frames_processed)?.toLocaleString()}</span></div>
              <div><span className="text-slate-400">Processing Time: </span><span className="font-medium">{job.result?.stats?.processing_time ?? job.stats?.processing_time}</span></div>
              <div><span className="text-slate-400">Processing FPS: </span><span className="font-medium">{(job.result?.stats?.processing_fps ?? job.stats?.processing_fps)?.toFixed(1)}</span></div>
              <div><span className="text-slate-400">Total Frames: </span><span className="font-medium">{(job.result?.stats?.total_frames ?? job.stats?.total_frames)?.toLocaleString()}</span></div>
              <div><span className="text-slate-400">Unique Tracks: </span><span className="font-medium">{job.result?.stats?.total_unique_tracks ?? job.stats?.total_unique_tracks}</span></div>
              <div><span className="text-slate-400">Total Detections: </span><span className="font-medium">{job.result?.stats?.total_detections ?? job.stats?.total_detections}</span></div>
              <div><span className="text-slate-400">Collisions: </span><span className="font-medium text-red-600">{job.result?.stats?.collision_count ?? job.stats?.collision_count}</span></div>
              <div><span className="text-slate-400">Object Types: </span><span className="font-medium">{Object.keys(job.result?.stats?.class_counts ?? job.stats?.class_counts ?? {}).join(', ') || '—'}</span></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}