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

export type StoryboardGraphic = "CornerCard" | "SideList" | "WordStack" | "none";

export interface StoryboardBeat {
  order: number;
  kind: "hook" | "point" | "cta";
  content: string;
  start_sec: number;
  duration_sec: number;
  graphic: StoryboardGraphic;
}

export interface Storyboard {
  beats: StoryboardBeat[];
  total_duration_sec: number;
  hyperframes_recommended: boolean;
  hyperframes_reason: string | null;
}

export interface GeneratedContent {
  core_idea: string;
  linkedin: string;
  instagram: string;
  facebook: string;
  youtube_desc: string;
  youtube_short: string;
  video_brief: VideoBrief;
  // null when the LLM's storyboard failed shape validation — callers must fall back
  // to the pre-storyboard even-spacing render behavior rather than treat this as an error.
  storyboard: Storyboard | null;
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
  storyboard: Storyboard | null;
  voice_skill_slug: string | null;
  video_script: string | null;
  hyperframes_prompt: string | null;
  created_at: Date;
}
