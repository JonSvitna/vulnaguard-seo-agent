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

const BUFFER_PLATFORMS = ["linkedin", "facebook", "instagram"] as const;

// Oldest record still missing at least one Buffer platform — replaces
// content-bank.md as the source of truth for "what's next to post."
export async function getNextUnposted(
  brand = "vulnaguard"
): Promise<ContentPipelineRecord | null> {
  const rows = await query<ContentPipelineRecord>(
    `SELECT * FROM content_pipeline_records
     WHERE brand = $1
       AND NOT (posted_platforms ?& $2::text[])
     ORDER BY created_at ASC
     LIMIT 1`,
    [brand, BUFFER_PLATFORMS]
  );
  return rows[0] ?? null;
}

export async function markPlatformPosted(
  id: string,
  platform: (typeof BUFFER_PLATFORMS)[number],
  postedAt: string = new Date().toISOString()
): Promise<ContentPipelineRecord> {
  const rows = await query<ContentPipelineRecord>(
    `UPDATE content_pipeline_records
     SET posted_platforms = posted_platforms || jsonb_build_object($2::text, $3::text)
     WHERE id = $1
     RETURNING *`,
    [id, platform, postedAt]
  );
  return rows[0];
}

export async function markIndieHackersPosted(
  id: string,
  postedAt: string = new Date().toISOString()
): Promise<ContentPipelineRecord> {
  const rows = await query<ContentPipelineRecord>(
    `UPDATE content_pipeline_records
     SET posted_indiehackers_at = $2
     WHERE id = $1
     RETURNING *`,
    [id, postedAt]
  );
  return rows[0];
}
