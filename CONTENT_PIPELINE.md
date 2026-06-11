# Vulnaguard Content Pipeline

AI-powered content engine. Drop in a raw idea, voice memo, or video description — get 5 platform-ready posts in seconds.

## What it generates
- LinkedIn post (Sean's voice, thought leadership)
- Instagram caption + hashtags
- Facebook post
- YouTube long-form description (SEO-structured)
- YouTube Shorts script
- HyperFrames video brief (hook, key points, CTA)

## File structure

```
app/
  api/content-pipeline/
    generate/route.ts         ← POST /api/content-pipeline/generate
    hyperframes/route.ts      ← POST /api/content-pipeline/hyperframes
  content-pipeline/
    page.tsx                  ← UI at /content-pipeline

components/content-pipeline/
  CaptureScreen.tsx           ← Type / Voice / Video input
  GeneratingScreen.tsx        ← Progress indicator
  Dashboard.tsx               ← Review + edit cards
  PlatformCard.tsx            ← Per-platform post card
  VideoCard.tsx               ← HyperFrames video brief card

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
