"""
FastAPI application that exposes the existing AI backend to a web frontend.

This layer does NOT reimplement any AI logic. It calls into
`src.pipeline.processor.process_video` and `src.dataset.dataset_runner.DatasetTestRunner`
exactly as the previous Streamlit UI did.
"""

from __future__ import annotations

import asyncio
import datetime
import os
import shutil
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from config.dataset_config import dataset_config, _ensure_dataset_dirs
from config.settings import _ensure_dirs, settings
from api.risk_color import risk_color
from src.dataset.dataset_manager import DatasetManager
from src.dataset.dataset_runner import DatasetTestRunner
from src.pipeline.processor import PipelineResult, process_video
from src.dataset.huggingface_loader import download_all, list_all_local_videos, download_nexar

_ensure_dirs()
_ensure_dataset_dirs()

app = FastAPI(title="AI Collision Anticipation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


UPLOAD_DIR = settings.UPLOAD_DIR
PROCESSED_DIR = settings.OUTPUT_DIR / "processed_videos"
DATASET_RUNS_DIR = dataset_config.DATASET_TEST_DIR
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
DATASET_RUNS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# In-memory job store
# ---------------------------------------------------------------------------


@dataclass
class Job:
    job_id: str
    status: str = "pending"
    progress: float = 0.0
    step: str = ""
    frame: int = 0
    total: int = 0
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    stage: str = ""
    video_filename: Optional[str] = None
    started_at: str = field(default_factory=lambda: datetime.datetime.now().isoformat())
    finished_at: Optional[str] = None
    stats: Dict[str, Any] = field(default_factory=dict)


# E11: in-memory job lifecycle. Finished (completed/error) jobs older than
# JOB_TTL_SECONDS are pruned, and the store is capped at MAX_JOBS entries
# (oldest finished first). Active (pending/running) jobs are never deleted.
JOB_TTL_SECONDS = 3600
MAX_JOBS = 200


def _prune_jobs() -> None:
    now = datetime.datetime.now()
    with _jobs_lock:
        if len(_jobs) <= MAX_JOBS:
            finished = [
                (jid, j) for jid, j in _jobs.items()
                if j.status in ("completed", "error") and j.finished_at
            ]
            if not finished:
                return
        try:
            cutoff = now - datetime.timedelta(seconds=JOB_TTL_SECONDS)
            expired = [
                jid for jid, j in _jobs.items()
                if j.status in ("completed", "error") and j.finished_at
                and datetime.datetime.fromisoformat(j.finished_at) < cutoff
            ]
            for jid in expired:
                del _jobs[jid]
        except (ValueError, TypeError):
            pass
        if len(_jobs) > MAX_JOBS:
            finished_sorted = sorted(
                (j for j in _jobs.values() if j.status in ("completed", "error") and j.finished_at),
                key=lambda j: j.finished_at or "",
            )
            for j in finished_sorted[: len(_jobs) - MAX_JOBS]:
                _jobs.pop(j.job_id, None)


def _mark_finished(job: Job) -> None:
    job.finished_at = datetime.datetime.now().isoformat()
    _prune_jobs()


_jobs: Dict[str, Job] = {}
_jobs_lock = threading.Lock()


def _new_job() -> Job:
    job_id = uuid.uuid4().hex[:12]
    with _jobs_lock:
        job = Job(job_id=job_id)
        _jobs[job_id] = job
    _prune_jobs()
    return job


def _get_job(job_id: str) -> Job:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return job


def _job_to_dict(job: Job) -> Dict[str, Any]:
    return {
        "job_id": job.job_id,
        "status": job.status,
        "progress": job.progress,
        "step": job.step,
        "frame": job.frame,
        "total": job.total,
        "error": job.error,
        "video_filename": job.video_filename,
        "stage": job.stage,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "has_result": job.result is not None,
        "stats": job.stats,
    }


# ---------------------------------------------------------------------------
# Static helpers
# ---------------------------------------------------------------------------


def _sanitize_json(value: Any) -> Any:
    """Recursively convert a pipeline result into strict-JSON-safe data.

    ROOT-CAUSE FIX (blank page): pandas aggregations (min/mode over
    all-None groups) produce float('nan') for estimated_ttc/estimated_pet/
    estimated_act. Python's json.dumps emits raw `NaN` literals, which the
    WebSocket path forwards verbatim. Browsers' JSON.parse REJECTS `NaN`,
    so the frontend's WS `result` handler threw, `onResult` never ran, and
    a later `status: completed` progress update (without result payload)
    crashed VideoSection on `result!.primary_threat`. NaN/Inf therefore
    become None here (transport-level, lossless for the UI which renders
    None as "N/A"/"Not Available"). numpy scalars become native types.
    """
    import math

    if isinstance(value, dict):
        return {k: _sanitize_json(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_sanitize_json(v) for v in value]
    if isinstance(value, bool) or value is None or isinstance(value, (str, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    try:
        import numpy as np  # type: ignore

        if isinstance(value, np.generic):
            return _sanitize_json(value.item())
        if isinstance(value, np.ndarray):
            return _sanitize_json(value.tolist())
    except ImportError:
        pass
    if isinstance(value, Path):
        return str(value)
    return value


def _serialize_pipeline_result(result: PipelineResult) -> Dict[str, Any]:
    primary = result.primary_threat or {}
    # Real sorted track-ID list (was: total_unique_tracks COUNT mislabeled
    # as unique_track_ids, violating the frontend's number[] contract).
    track_ids = sorted({int(r.get("track_id")) for r in result.analysis_rows if r.get("track_id") is not None})
    payload = {
        "output_video_path": result.output_video_path,
        "output_video_filename": result.output_video_filename,
        "stats": result.stats,
        "risk_summary": result.risk_summary,
        "primary_threat": {
            **primary,
            "color": risk_color(primary.get("risk_level", "SAFE")),
        } if primary else None,
        "analysis_rows": result.analysis_rows,
        "top_threats": result.top_threats,
        "unique_track_ids": track_ids,
        "class_counts": result.stats.get("class_counts", {}),
        "verdict": result.verdict or {
            "level": "UNKNOWN",
            "label": "Verdict unavailable",
            "collision_risk_detected": False,
            "reason": "backend did not provide a verdict",
        },
    }
    return _sanitize_json(payload)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/")
async def root() -> Dict[str, Any]:
    return {
        "service": "ai-collision-anticipation-api",
        "health": "/api/health",
        "frontend": "http://localhost:5173",
    }


@app.get("/api/health")
async def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "ai-collision-anticipation-api"}


def _probe_video(path: Path, delete_on_failure: bool = True) -> Dict[str, Any]:
    """E14: validate a saved video file. Returns metadata dict.

    Raises HTTPException(400) with a useful message when the file is
    empty, unreadable, or has invalid video metadata. Only deletes the
    file when delete_on_failure is True (fresh uploads); dataset/source
    files are never deleted.
    """
    import cv2

    def _fail(detail: str) -> None:
        if delete_on_failure:
            path.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=detail)

    if not path.is_file():
        raise HTTPException(status_code=400, detail="Uploaded file was not saved correctly")
    if path.stat().st_size == 0:
        _fail("Uploaded file is empty (0 bytes). Please choose a valid video file.")
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            _fail("File could not be opened as a video. It may be corrupted or in an unsupported codec.")
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        if fps < 1.0:
            _fail(f"Video has invalid FPS ({fps}). Please choose a valid video file.")
        if frames < 1 or width < 1 or height < 1:
            _fail("Video metadata is unreadable (no frames/dimensions). The file may be corrupted.")
        assert fps is not None
        return {"fps": fps, "frame_count": frames, "width": width, "height": height}
    finally:
        cap.release()


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Save an uploaded video and return its server-side path."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # E8: accept .webm consistently with dataset SUPPORTED_VIDEO_FORMATS.
    ext = Path(file.filename).suffix.lower()
    if ext not in {".mp4", ".avi", ".mov", ".mkv", ".webm"}:
        raise HTTPException(status_code=400, detail=f"Unsupported video format: {ext}. Supported: mp4, avi, mov, mkv, webm.")

    safe_name = f"{uuid.uuid4().hex[:8]}_{Path(file.filename).name}"
    save_path = UPLOAD_DIR / safe_name

    with open(save_path, "wb") as out:
        shutil.copyfileobj(file.file, out)

    # E14: fail fast on empty/corrupt uploads instead of erroring mid-processing.
    meta = _probe_video(save_path)

    return {
        "filename": file.filename,
        "saved_filename": safe_name,
        "path": str(save_path),
        "size_bytes": save_path.stat().st_size,
        **meta,
    }


@app.post("/api/process")
async def start_processing(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Start processing an uploaded (or dataset) video."""
    video_path = payload.get("video_path")
    if not video_path:
        raise HTTPException(status_code=400, detail="video_path is required")

    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Video not found at {video_path}")

    # E14: fail fast with a clear error instead of a job that errors later.
    # Never deletes dataset/source files (delete_on_failure=False).
    try:
        _probe_video(Path(video_path), delete_on_failure=False)
    except HTTPException as exc:
        raise HTTPException(status_code=400, detail=f"Video cannot be processed: {exc.detail}")

    confidence = float(payload.get("confidence", 0.5))
    max_frames = payload.get("max_frames")
    frame_skip = int(payload.get("frame_skip", 1))
    output_scale = float(payload.get("output_scale", 1.0))

    job = _new_job()
    job.video_filename = Path(video_path).name

    def _run() -> None:
        try:
            with _jobs_lock:
                job.status = "running"

            def _on_progress(p: Dict[str, Any]) -> None:
                with _jobs_lock:
                    job.progress = float(p.get("progress", 0.0))
                    job.frame = int(p.get("frame", 0))
                    job.total = int(p.get("total", 0))
                    job.step = str(p.get("step", ""))
                    job.stage = str(p.get("stage", ""))
                    if "stats" in p:
                        job.stats = p["stats"]

            result = process_video(
                video_path=video_path,
                confidence=confidence,
                on_progress=_on_progress,
                max_frames=max_frames,
                frame_skip=frame_skip,
                output_scale=output_scale,
            )
            with _jobs_lock:
                job.result = _serialize_pipeline_result(result)
                job.status = "completed"
                job.progress = 1.0
                job.step = "Complete"
                job.finished_at = datetime.datetime.now().isoformat()
        except Exception as exc:  # noqa: BLE001
            with _jobs_lock:
                job.status = "error"
                job.error = str(exc)
                job.step = "Error"
                job.finished_at = datetime.datetime.now().isoformat()

    threading.Thread(target=_run, daemon=True).start()
    return _job_to_dict(job)


@app.get("/api/jobs/{job_id}")
async def job_status(job_id: str) -> Dict[str, Any]:
    _prune_jobs()
    job = _get_job(job_id)
    payload = _job_to_dict(job)
    if job.status == "completed" and job.result:
        payload["result"] = job.result
    return payload


@app.get("/api/videos/{filename}")
async def get_processed_video(filename: str):
    path = PROCESSED_DIR / filename
    if not path.exists():
        path = UPLOAD_DIR / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(path, media_type="video/mp4", filename=filename)


@app.get("/api/source")
async def get_source_video(path: str) -> FileResponse:
    """Serve an original/source video by absolute server path.

    E9 helper for "Take Data From Sources": dataset videos live outside
    UPLOAD_DIR/PROCESSED_DIR (e.g. data/videos, data/datasets), so they
    cannot be addressed by bare filename. The path must resolve inside
    DATA_DIR, otherwise 403. Used for original-preview playback only;
    processing still goes through POST /api/process with the same path.
    """
    candidate = Path(path)
    if not candidate.is_absolute():
        raise HTTPException(status_code=400, detail="Absolute video path required")
    try:
        resolved = candidate.resolve()
        resolved.relative_to(settings.DATA_DIR.resolve())
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="Access outside data directory is forbidden")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(resolved, media_type="video/mp4", filename=resolved.name)


@app.post("/api/csv_report")
async def csv_report(payload: Dict[str, Any]) -> JSONResponse:
    """Generate the same analysis-report CSV the Streamlit UI produced."""
    rows = payload.get("rows", [])
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="rows must be a list")

    import pandas as pd

    if not rows:
        return JSONResponse({"csv": ""})

    df = pd.DataFrame(rows)
    display_cols = [
        "class_name", "track_id", "direction", "motion",
        "trajectory", "conflict", "estimated_ttc", "estimated_pet",
        "estimated_drac_risk", "estimated_act", "max_risk_score", "risk_level",
    ]
    available = [c for c in display_cols if c in df.columns]
    rename_map = {
        "class_name": "Object",
        "track_id": "Tracking ID",
        "direction": "Direction",
        "motion": "Motion",
        "trajectory": "Trajectory",
        "conflict": "Conflict",
        "estimated_ttc": "Estimated TTC",
        "estimated_pet": "Estimated PET",
        "estimated_drac_risk": "Estimated DRAC Risk",
        "estimated_act": "Estimated ACT",
        "max_risk_score": "Risk Score",
        "risk_level": "Risk Level",
    }
    df_export = df[available].copy().rename(columns=rename_map)
    return JSONResponse({"csv": df_export.to_csv(index=False)})


# ---------------------------------------------------------------------------
# Dataset routes
# ---------------------------------------------------------------------------


@app.get("/api/dataset/summary")
async def dataset_summary() -> Dict[str, Any]:
    dm = DatasetManager()
    dm.discover_videos()
    return {
        "summary": dm.get_summary(),
        "videos": dm.get_metadata_for_all(),
    }


@app.post("/api/dataset/random")
async def dataset_random(payload: Dict[str, Any]) -> Dict[str, Any]:
    category = payload.get("category", "both")
    count = int(payload.get("count", 1))
    seed_raw = payload.get("seed")
    seed_int: Optional[int] = None
    if seed_raw not in (None, ""):
        try:
            seed_int = int(str(seed_raw))
        except ValueError:
            seed_int = None

    dm = DatasetManager()
    dm.discover_videos()
    selected = dm.select_random(count=count, category=category, seed=seed_int)
    return {"videos": [v.to_dict() for v in selected]}


@app.post("/api/dataset/test")
async def dataset_test(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Run the dataset test runner (same as the Streamlit 'Automated Dataset Test' mode)."""
    category = payload.get("category", "both")
    count = int(payload.get("count", 5))
    confidence = float(payload.get("confidence", 0.5))
    seed_raw = payload.get("seed")
    seed_int: Optional[int] = None
    if seed_raw not in (None, ""):
        try:
            seed_int = int(str(seed_raw))
        except ValueError:
            seed_int = None

    dm = DatasetManager()
    dm.discover_videos()
    videos = dm.select_random(count=count, category=category, seed=seed_int)
    if not videos:
        raise HTTPException(status_code=404, detail="No dataset videos matched the criteria")

    run_id = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = DATASET_RUNS_DIR / f"run_{run_id}"
    run_dir.mkdir(parents=True, exist_ok=True)

    runner = DatasetTestRunner(confidence=confidence)

    job = _new_job()
    job.video_filename = f"dataset_test_{run_id}"

    def _run() -> None:
        try:
            with _jobs_lock:
                job.status = "running"

            result_summary = {
                "run_id": run_id,
                "total_videos": len(videos),
                "video_results": [],
                "processed_count": 0,
                "failed_count": 0,
                "positive_videos": 0,
                "negative_videos": 0,
                "positive_detected": 0,
                "positive_missed": 0,
                "negative_false_positives": 0,
                "avg_max_risk": 0.0,
                "max_observed_risk": 0.0,
                "avg_processing_fps": 0.0,
                "total_processing_time": 0.0,
            }

            for i, vid_meta in enumerate(videos):
                with _jobs_lock:
                    job.step = f"Processing {i+1}/{len(videos)}: {vid_meta.file_name}"
                    job.progress = i / max(len(videos), 1)
                    job.frame = i
                    job.total = len(videos)

                vr = runner.process_single_video(vid_meta, output_dir=run_dir)

                result_summary["video_results"].append(vr.to_dict())
                if vr.error:
                    result_summary["failed_count"] += 1
                else:
                    result_summary["processed_count"] += 1

                if vid_meta.category == "positive":
                    result_summary["positive_videos"] += 1
                    if vr.alert_generated:
                        result_summary["positive_detected"] += 1
                    else:
                        result_summary["positive_missed"] += 1
                elif vid_meta.category == "negative":
                    result_summary["negative_videos"] += 1
                    if vr.false_positive:
                        result_summary["negative_false_positives"] += 1

            risk_scores = [r["max_risk"] for r in result_summary["video_results"] if not r["error"]]
            proc_times = [r["processing_time"] for r in result_summary["video_results"] if not r["error"]]
            frame_counts = [r["frames_processed"] for r in result_summary["video_results"] if not r["error"]]
            if risk_scores:
                result_summary["avg_max_risk"] = sum(risk_scores) / len(risk_scores)
                result_summary["max_observed_risk"] = max(risk_scores)
            if proc_times:
                result_summary["total_processing_time"] = sum(proc_times)
                total_f = sum(frame_counts)
                if result_summary["total_processing_time"] > 0:
                    result_summary["avg_processing_fps"] = total_f / result_summary["total_processing_time"]

            with _jobs_lock:
                job.result = result_summary
                job.status = "completed"
                job.progress = 1.0
                job.step = "Complete"
                job.finished_at = datetime.datetime.now().isoformat()
        except Exception as exc:  # noqa: BLE001
            with _jobs_lock:
                job.status = "error"
                job.error = str(exc)
                job.step = "Error"
                job.finished_at = datetime.datetime.now().isoformat()

    threading.Thread(target=_run, daemon=True).start()
    return _job_to_dict(job)


# ---------------------------------------------------------------------------
# Dataset integration (HuggingFace + Indian open-source)
# ---------------------------------------------------------------------------


@app.post("/api/dataset/download")
async def download_datasets(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Download videos from multiple open-source datasets.

    Body:
        sources: list of "nexar", "indian_road", "indian_pedestrian" (default: all)
        max_samples: cap per HuggingFace dataset (default: 50)
    """
    sources = payload.get("sources", ["nexar", "indian_road", "indian_pedestrian"])
    max_samples = int(payload.get("max_samples", 50))

    job = _new_job()
    job.video_filename = "dataset_download"

    def _run() -> None:
        try:
            with _jobs_lock:
                job.status = "running"
                job.step = "Downloading datasets..."

            results = {}

            def _on_progress(source: str, current: int, total: int, message: str) -> None:
                with _jobs_lock:
                    job.step = f"[{source}] {message}"
                    job.frame = current
                    job.total = total

            all_results = download_all(sources=sources, max_samples=max_samples, on_progress=_on_progress)

            for src, stats in all_results.items():
                results[src] = {
                    "total": stats.total,
                    "downloaded": stats.downloaded,
                    "local_dir": stats.local_dir,
                    "error": stats.error,
                }

            total_videos = sum(r["downloaded"] for r in results.values())
            with _jobs_lock:
                job.result = results
                job.status = "completed"
                job.progress = 1.0
                job.step = f"Downloaded {total_videos} videos from {len(results)} sources"
        except Exception as exc:
            with _jobs_lock:
                job.status = "error"
                job.error = str(exc)
                job.step = "Error"
                job.finished_at = datetime.datetime.now().isoformat()

    threading.Thread(target=_run, daemon=True).start()
    return _job_to_dict(job)


@app.get("/api/dataset/local_videos")
async def local_videos() -> Dict[str, Any]:
    """List all locally cached dataset videos."""
    videos = list_all_local_videos()
    return {"count": len(videos), "videos": videos}


@app.post("/api/process_hf")
async def process_hf_video(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Process any locally cached dataset video through the pipeline."""
    video_path = payload.get("video_path")
    if not video_path:
        raise HTTPException(status_code=400, detail="video_path is required")
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail=f"Video not found: {video_path}")

    confidence = float(payload.get("confidence", 0.5))
    max_frames = payload.get("max_frames")
    frame_skip = int(payload.get("frame_skip", 1))
    output_scale = float(payload.get("output_scale", 1.0))

    job = _new_job()
    job.video_filename = Path(video_path).name

    def _run() -> None:
        try:
            with _jobs_lock:
                job.status = "running"

            def _on_progress(p: Dict[str, Any]) -> None:
                with _jobs_lock:
                    job.progress = float(p.get("progress", 0.0))
                    job.frame = int(p.get("frame", 0))
                    job.total = int(p.get("total", 0))
                    job.step = str(p.get("step", ""))
                    job.stage = str(p.get("stage", ""))

            result = process_video(
                video_path=video_path,
                confidence=confidence,
                on_progress=_on_progress,
                max_frames=max_frames,
                frame_skip=frame_skip,
                output_scale=output_scale,
            )
            with _jobs_lock:
                job.result = _serialize_pipeline_result(result)
                job.status = "completed"
                job.progress = 1.0
                job.step = "Complete"
                job.finished_at = datetime.datetime.now().isoformat()
        except Exception as exc:
            with _jobs_lock:
                job.status = "error"
                job.error = str(exc)
                job.step = "Error"
                job.finished_at = datetime.datetime.now().isoformat()

    threading.Thread(target=_run, daemon=True).start()
    return _job_to_dict(job)


# ---------------------------------------------------------------------------
# WebSocket — live progress stream for a given job
# ---------------------------------------------------------------------------


@app.websocket("/ws/jobs/{job_id}")
async def job_ws(ws: WebSocket, job_id: str) -> None:
    await ws.accept()
    try:
        while True:
            with _jobs_lock:
                job = _jobs.get(job_id)
                if not job:
                    await ws.send_json({"type": "error", "message": "Unknown job"})
                    await ws.close()
                    return
                snapshot = {
                    "type": "progress",
                    "status": job.status,
                    "progress": job.progress,
                    "frame": job.frame,
                    "total": job.total,
                    "step": job.step,
                    "stage": job.stage,
                    "error": job.error,
                    "has_result": job.result is not None,
                    "stats": job.stats,
                }
            await ws.send_json(snapshot)
            if job.status in ("completed", "error"):
                if job.result is not None:
                    await ws.send_json({"type": "result", "result": job.result})
                await ws.send_json({"type": "done"})
                await ws.close()
                return
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=False)