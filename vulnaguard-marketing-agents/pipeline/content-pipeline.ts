import { query } from "@/lib/db";
import { runContentPipelineAgent } from "../agents/content-pipeline";
import type { ContentPipelineInput, ContentPipelineRecord } from "../agents/content-pipeline/types";

export async function runContentPipeline(
  input: ContentPipelineInput & { voiceSkillSlug?: string | null }
): Promise<ContentPipelineRecord> {
  // 1. Run the agent
  const generated = await runContentPipelineAgent(input);

  // 2. Persist to shared PostgreSQL
  const rows = await query<ContentPipelineRecord>(
    `INSERT INTO content_pipeline_records
       (brand, capture_mode, raw_input, core_idea, linkedin, instagram,
        facebook, youtube_desc, youtube_short, video_brief)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      input.brand ?? "vulnaguard",
      input.captureMode,
      input.rawInput,
      generated.core_idea,
      generated.linkedin,
      generated.instagram,
      generated.facebook,
      generated.youtube_desc,
      generated.youtube_short,
      JSON.stringify(generated.video_brief),
    ]
  );

  return rows[0];
}

export async function getContentHistory(
  brand = "vulnaguard",
  limit = 20
): Promise<ContentPipelineRecord[]> {
  return query<ContentPipelineRecord>(
    `SELECT * FROM content_pipeline_records
     WHERE brand = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [brand, limit]
  );
}
