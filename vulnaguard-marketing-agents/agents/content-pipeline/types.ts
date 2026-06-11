export type CaptureMode = "type" | "voice" | "video";

export type Platform =
  | "linkedin"
  | "instagram"
  | "facebook"
  | "youtube_desc"
  | "youtube_short";

export interface VideoBrief {
  hook: string;
  points: string[];
  cta: string;
  style: string;
}

export interface GeneratedContent {
  core_idea: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  youtube_desc: string;
  youtube_short: string;
  video_brief: VideoBrief;
}

export interface ContentPipelineInput {
  rawInput: string;
  captureMode: CaptureMode;
  brand?: string; // defaults to "vulnaguard"
}

export interface ContentPipelineRecord {
  [key: string]: unknown;
  id: string;
  brand: string;
  capture_mode: CaptureMode;
  raw_input: string;
  core_idea: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  youtube_desc: string;
  youtube_short: string;
  video_brief: VideoBrief;
  created_at: Date;
}
