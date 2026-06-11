# Vulnaguard Content Pipeline

AI-powered content engine. Drop in a raw idea, voice memo, or video description — get 5 platform-ready posts in seconds.

## What it generates
- LinkedIn post (Sean's voice, thought leadership)
- Instagram caption + hashtags
- Facebook post
- YouTube long-form description (SEO-structured)
- YouTube Shorts script
- Video brief (hook, key points, CTA) + an on-demand full speaking script

## File structure

```
app/
  api/content-pipeline/
    generate/route.ts         ← POST /api/content-pipeline/generate
    script/route.ts           ← POST /api/content-pipeline/script
  content-pipeline/
    page.tsx                  ← UI at /content-pipeline

components/content-pipeline/
  CaptureScreen.tsx           ← Type / Voice / Video input
  GeneratingScreen.tsx        ← Progress indicator
  Dashboard.tsx               ← Review + edit cards
  PlatformCard.tsx            ← Per-platform post card
  VideoCard.tsx               ← Video brief + speaking script card

vulnaguard-marketing-agents/
  agents/content-pipeline/
    index.ts                  ← Agent core (calls Anthropic API)
    systemPrompt.ts           ← Brand voice (Vulnaguard / Sean's voice)
    types.ts                  ← Shared TypeScript types
  pipeline/
    content-pipeline.ts       ← Orchestrator (agent + DB save)
```

The `content_pipeline_records` table is created automatically via `ensureSchema()` in `lib/db.ts` — no manual migration needed.

## Setup

### 1. Environment variables
Already using `ANTHROPIC_API_KEY` from the existing repo — no new vars needed.

### 2. Navigate to
```
http://localhost:3000/content-pipeline
```
or click "Content Pipeline" in the dashboard header.

## Adding a new brand
1. Add a new system prompt in `vulnaguard-marketing-agents/agents/content-pipeline/systemPrompt.ts`
2. Add it to the `BRAND_PROMPTS` map
3. Pass `brand: "mectofitness"` in the API call

## Video workflow (currently half-implemented)

The Video tab generates a `video_brief` (hook, key points, CTA) plus an on-demand
full speaking script via `POST /api/content-pipeline/script`, written in Sean's
voice and sized for ~45-75 seconds on camera. The script is saved to
`content_pipeline_records.video_script`.

There is **no automated rendering step**: read the script on camera, then produce
the final video manually — e.g. with the [HyperFrames skills](https://github.com/heygen-com/hyperframes)
(`npx skills add heygen-com/hyperframes` in a Claude Code session, then `/hyperframes`)
or any other editor. A live HyperFrames API integration would require a HyperFrames
account credential that isn't configured for this app.
