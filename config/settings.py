"""
Centralized application settings for the collision anticipation system.
"""

import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List


@dataclass
class Settings:
    """Application-wide settings for the collision anticipation system."""

    BASE_DIR: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent)
    DATA_DIR: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent / "data")
    UPLOAD_DIR: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent / "data" / "uploads")
    MODEL_DIR: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent / "models")
    OUTPUT_DIR: Path = field(default_factory=lambda: Path(__file__).resolve().parent.parent / "output")

    VIDEO_FPS: int = 30
    FRAME_WIDTH: int = 1280
    FRAME_HEIGHT: int = 720

    YOLO_MODEL_PATH: str = "yolo11n.pt"
    DETECTION_CONFIDENCE: float = 0.45
    DETECTION_CLASSES: List[str] = field(default_factory=lambda: [
        "car", "motorcycle", "bus", "truck", "person", "bicycle"
    ])

    TRACK_BUFFER: int = 30
    MATCH_THRESH: float = 0.8

    PREDICTION_HORIZONS: List[float] = field(default_factory=lambda: [0.5, 1.0, 2.0])
    CONFIDENCE_DECAY: float = 0.15

    DIRECTION_LEFT_RATIO: float = 0.35
    DIRECTION_RIGHT_RATIO: float = 0.65

    RISK_SAFE: int = 20
    RISK_LOW: int = 40
    RISK_MEDIUM: int = 60
    RISK_HIGH: int = 80

    EGO_SPEED_KMH: float = 40.0
    EGO_LENGTH: float = 4.5
    EGO_WIDTH: float = 1.8

    DASHBOARD_PORT: int = 8501

    LOG_LEVEL: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    LOG_FILE: str = "output/logs/system.log"

    # --- Part 2: Motion Analysis ---
    MOTION_HISTORY_LENGTH: int = 15
    STATIONARY_SPEED_THRESHOLD: float = 2.0
    STATIONARY_DISPLACEMENT_THRESHOLD: float = 5.0
    APPROACHING_AREA_GROWTH_RATE: float = 0.02
    LATERAL_DOMINANCE_RATIO: float = 1.5
    MOTION_SMOOTHING_WINDOW: int = 5

    # --- Part 2: Ego Path / Reference Zone ---
    EGO_PATH_LEFT_RATIO: float = 0.30
    EGO_PATH_RIGHT_RATIO: float = 0.70
    EGO_PATH_TOP_RATIO: float = 0.0
    EGO_PATH_BOTTOM_RATIO: float = 1.0
    EGO_ZONE_APPROACHING_PRIORITY: float = 1.5

    # --- Part 2: Trajectory Prediction ---
    TRAJECTORY_HISTORY_LENGTH: int = 20
    TRAJECTORY_FUTURE_HORIZONS: List[float] = field(default_factory=lambda: [0.5, 1.0, 2.0])
    TRAJECTORY_CONVERGENCE_ANGLE_DEG: float = 15.0
    TRAJECTORY_CROSSING_LATERAL_OFFSET: float = 50.0

    # --- Part 2: Conflict Detection ---
    CONFLICT_PROXIMITY_PIXELS: float = 100.0
    CONFLICT_TIME_GAP_THRESHOLD: float = 2.0
    CONFLICT_APPROACHING_BONUS: float = 20.0
    CONFLICT_HIGH_RISK_TTC: float = 2.0
    CONFLICT_MEDIUM_RISK_TTC: float = 4.0

    # --- Part 2: TTC Thresholds ---
    TTC_CRITICAL_THRESHOLD: float = 1.5
    TTC_HIGH_THRESHOLD: float = 3.0
    TTC_MEDIUM_THRESHOLD: float = 5.0

    # --- Part 2: PET Thresholds ---
    PET_CRITICAL_THRESHOLD: float = 1.0
    PET_HIGH_THRESHOLD: float = 2.0
    PET_MEDIUM_THRESHOLD: float = 3.0

    # --- Part 2: Risk Scoring (0-100) ---
    RISK_SCORE_SAFE_MAX: int = 20
    RISK_SCORE_LOW_MAX: int = 40
    RISK_SCORE_MEDIUM_MAX: int = 60
    RISK_SCORE_HIGH_MAX: int = 80
    RISK_WEIGHT_MOTION: float = 0.15
    RISK_WEIGHT_DIRECTION: float = 0.10
    RISK_WEIGHT_PROXIMITY: float = 0.20
    RISK_WEIGHT_CONFLICT: float = 0.20
    RISK_WEIGHT_TTC: float = 0.20
    RISK_WEIGHT_PET: float = 0.10
    RISK_WEIGHT_TRAJECTORY: float = 0.05

    def __post_init__(self):
        """Mark as needing directory initialization."""
        self._dirs_created = False


settings = Settings()


def _ensure_dirs():
    """Create directories lazily on first access."""
    if not settings._dirs_created:
        settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        settings.MODEL_DIR.mkdir(parents=True, exist_ok=True)
        (settings.OUTPUT_DIR / "processed_videos").mkdir(parents=True, exist_ok=True)
        (settings.OUTPUT_DIR / "screenshots").mkdir(parents=True, exist_ok=True)
        (settings.OUTPUT_DIR / "reports").mkdir(parents=True, exist_ok=True)
        (settings.OUTPUT_DIR / "logs").mkdir(parents=True, exist_ok=True)
        settings._dirs_created = True
