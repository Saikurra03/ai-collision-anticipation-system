export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string;

export interface PrimaryThreat {
  object_type?: string;
  class_name?: string;
  tracking_id?: number;
  direction?: string;
  motion_state?: string;
  trajectory_status?: string;
  conflict_status?: string;
  risk_score?: number;
  risk_level?: RiskLevel;
  estimated_ttc?: number | null;
  estimated_pet?: number | null;
  estimated_drac_risk?: string;
  estimated_act?: string | null;
  color?: string;
}

export interface PipelineStats {
  frames_processed: number;
  processing_time: string;
  processing_time_raw: number;
  total_unique_tracks: number;
  total_detections: number;
  class_counts: Record<string, number>;
  processing_fps: number;
  total_frames: number;
  video_fps?: number;
  width?: number;
  height?: number;
  collision_count?: number;
  max_conflict?: string;
  processing_errors?: number;
  error_samples?: { frame: number; error: string }[];
  high_conflict_frames?: number;
  cumulative_max_risk?: number;
  max_risk_frame?: number;
  unique_track_ids?: number[];
}

export interface RiskSummary {
  max_risk_score?: number;
  total_objects?: number;
  highest_risk_object?: string;
  primary_threat?: string | null;
  risk_distribution?: Record<string, number>;
  overall_risk_level?: string;
}

export interface AnalysisRow {
  class_name: string;
  track_id: number;
  direction: string;
  motion: string;
  trajectory: string;
  conflict: string;
  estimated_ttc: number | null;
  estimated_pet: number | null;
  estimated_drac_risk: string;
  estimated_act: string | null;
  max_risk_score: number;
  risk_level: RiskLevel;
}

export interface TopThreat {
  rank: number;
  class_name: string;
  tracking_id: number;
  direction: string;
  risk_level: RiskLevel;
  risk_score: number;
}

export type VerdictLevel =
  | 'HIGH_COLLISION_RISK'
  | 'POTENTIAL_COLLISION_RISK'
  | 'LOW_RISK'
  | 'NO_SIGNIFICANT_RISK'
  | 'UNKNOWN';

export interface AnalysisVerdict {
  level: VerdictLevel | string;
  label: string;
  collision_risk_detected: boolean;
  reason: string;
}

export interface PipelineResultPayload {
  output_video_path: string;
  output_video_filename: string;
  stats: PipelineStats;
  risk_summary: RiskSummary;
  primary_threat: PrimaryThreat | null;
  analysis_rows: AnalysisRow[];
  top_threats: TopThreat[];
  unique_track_ids?: number[];
  class_counts?: Record<string, number>;
  verdict?: AnalysisVerdict;
}

export type PipelineStage =
  | 'LOADING_VIDEO'
  | 'ANALYZING_FRAMES'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED'
  | '';

export interface JobSnapshot {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  progress: number;
  step: string;
  stage?: PipelineStage | string;
  frame: number;
  total: number;
  error: string | null;
  video_filename: string | null;
  started_at: string;
  has_result: boolean;
  result?: PipelineResultPayload;
  stats?: PipelineStats;
}

export interface DatasetVideo {
  file_name: string;
  file_path: string;
  category: string;
  subcategory?: string;
  source_dataset?: string;
  width?: number;
  height?: number;
  fps?: number;
  frame_count?: number;
  duration?: number;
  is_valid?: boolean;
  error?: string;
}