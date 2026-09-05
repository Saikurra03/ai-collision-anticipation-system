import { useEffect, useMemo, useRef, useState } from 'react';
import { Header } from './components/Header';
import { VideoSection } from './components/VideoSection';
import { SystemStatus } from './components/SystemStatus';
import { CurrentThreat } from './components/CurrentThreat';
import { ActiveAlert } from './components/ActiveAlert';
import { FrameProcessing } from './components/FrameProcessing';
import { SystemDetails } from './components/SystemDetails';
import { api } from './api';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { JobSnapshot } from './types';

interface SelectedVideo {
  file_path: string;
  file_name: string;
  display_name: string;
}

export default function App() {
  const [confidence, setConfidence] = useState(0.5);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  const headerStatus: 'idle' | 'live' | 'processing' = useMemo(() => {
    if (job?.status === 'running') return 'processing';
    if (job?.status === 'completed') return 'live';
    return 'idle';
  }, [job]);

  const handleUpload = async (file: File) => {
    try {
      const res = await api.uploadVideo(file);
      setSelectedVideo({
        file_path: res.path,
        file_name: res.saved_filename,
        display_name: res.filename,
      });
      setJob(null);
      setIsPlaying(false);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleSelectSourceVideo = (video: { file_path: string; file_name: string; display_name?: string }) => {
    // Shared entry point for Upload and Take-Data-From-Sources (Phase 3).
    // file_name must always be the canonical backend filename.
    setSelectedVideo({
      file_path: video.file_path,
      file_name: video.file_name,
      display_name: video.display_name ?? video.file_name,
    });
    setJob(null);
    setIsPlaying(false);
  };

  const handleStartProcessing = async () => {
    if (!selectedVideo) return;
    try {
      const newJob = await api.startProcessing(selectedVideo.file_path, confidence);
      setJob(newJob);
      openSocket(newJob.job_id);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to start processing');
    }
  };

  // E10: polling fallback handle. If the WebSocket never opens, errors,
  // or closes before the job finishes, we fall back to GET /api/jobs polling
  // so progress never gets permanently stuck.
  const pollCancelRef = useRef<(() => void) | null>(null);

  const stopPolling = () => {
    if (pollCancelRef.current) {
      pollCancelRef.current();
      pollCancelRef.current = null;
    }
  };

  const openSocket = (jobId: string) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    stopPolling();
    let finished = false;
    let gotResult = false;

    const startPollFallback = () => {
      // Never leave a completed-without-result job stranded: poll REST
      // until the result arrives (or the job errors). A finished job WITH
      // result needs no fallback.
      if (pollCancelRef.current) return;
      if (finished && gotResult) return;
      pollCancelRef.current = api.pollJob(jobId, {
        onUpdate: (snap) => {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: snap.status,
                  progress: snap.progress,
                  step: snap.step,
                  stage: snap.stage ?? prev.stage,
                  frame: snap.frame,
                  total: snap.total,
                  error: snap.error,
                  has_result: snap.has_result,
                }
              : prev
          );
        },
        onDone: (snap) => {
          finished = true;
          gotResult = true;
          stopPolling();
          setJob((prev) =>
            prev
              ? { ...prev, result: snap.result, has_result: true, status: 'completed' }
              : prev
          );
          setIsPlaying(true);
        },
        onError: (msg) => {
          console.error('polling fallback error', msg);
        },
      });
    };

    const ws = api.openJobSocket(jobId, {
      onProgress: (p) => {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: p.status as JobSnapshot['status'],
                progress: p.progress,
                step: p.step,
                stage: p.stage ?? prev.stage,
                frame: p.frame,
                total: p.total,
                error: p.error,
                has_result: p.has_result,
              }
            : prev
        );
      },
      onResult: (result) => {
        finished = true;
        gotResult = true;
        stopPolling();
        setJob((prev) =>
          prev
            ? { ...prev, result, has_result: true, status: 'completed' }
            : prev
        );
        setIsPlaying(true);
      },
      onDone: () => {
        finished = true;
        ws.close();
        socketRef.current = null;
        // WS `done` without a result (lost/unparsable result frame):
        // fetch it via REST instead of stranding the UI at 100%.
        if (!gotResult) startPollFallback();
        else stopPolling();
      },
      onError: (msg) => {
        console.error('socket error', msg);
        startPollFallback();
      },
    });
    ws.onclose = () => {
      if (!finished || !gotResult) startPollFallback();
    };
    // If the socket never opens (proxy down, prod build, firewall), fall back.
    const openTimer = setTimeout(() => {
      if (!finished && ws.readyState !== WebSocket.OPEN) startPollFallback();
    }, 4000);
    const origClose = ws.close.bind(ws);
    ws.close = (...args: Parameters<typeof origClose>) => {
      clearTimeout(openTimer);
      return origClose(...args);
    };
    socketRef.current = ws;
  };

  const handleReset = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    stopPolling();
    setSelectedVideo(null);
    setJob(null);
    setIsPlaying(false);
  };

  useEffect(() => {
    return () => {
      if (socketRef.current) socketRef.current.close();
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const processing = job?.status === 'running';
  const result = job?.status === 'completed' ? job.result ?? null : null;

  // Honest header state: reflects actual app state, never claims camera hardware.
  const headerDetail = processing
    ? 'Processing video…'
    : job?.status === 'error'
      ? 'Processing failed'
      : result
        ? 'Analysis complete'
        : selectedVideo
          ? 'Video ready'
          : 'No video selected';

  return (
    <div className="min-h-screen bg-[#F6F7F9]">
      <Header status={headerStatus} detail={headerDetail} />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* Left Column - Video Area */}
          <div className="space-y-4">
            <ErrorBoundary section="video analysis">
            <VideoSection
              job={job}
              videoPath={selectedVideo?.file_path ?? null}
              selectedFilename={selectedVideo?.file_name ?? null}
              selectedDisplayName={selectedVideo?.display_name ?? null}
              confidence={confidence}
              isPlaying={isPlaying}
              onConfidenceChange={setConfidence}
              onReset={handleReset}
              onFileSelected={handleUpload}
              onSelectSourceVideo={handleSelectSourceVideo}
              onStartProcessing={handleStartProcessing}
              processing={processing}
            />
            </ErrorBoundary>
          </div>

{/* Right Column - Monitoring & Threats */}
            <div className="space-y-4">
              <SystemStatus
                status={headerStatus}
                stats={result?.stats ?? null}
                hasVideo={!!selectedVideo}
              />
              <CurrentThreat
                result={result}
                live={!!result && job?.status === 'completed'}
              />
              <FrameProcessing job={job} />
              <ActiveAlert threat={result?.primary_threat ?? null} />
            </div>
        </div>

        {/* Bottom - System Details (collapsible) */}
        <div className="mt-5">
          <ErrorBoundary section="system details">
            <SystemDetails result={result} />
          </ErrorBoundary>
        </div>

        <footer className="pt-4 pb-2 text-center text-[11px] text-slate-400">
          AI Collision Anticipation System · Software Simulation Prototype
        </footer>
      </main>
    </div>
  );
}