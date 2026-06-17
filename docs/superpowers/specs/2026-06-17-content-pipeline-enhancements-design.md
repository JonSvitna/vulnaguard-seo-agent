# Content Pipeline Enhancements — Design Spec
**Date:** 2026-06-17
**Status:** Approved

## Overview

Three targeted enhancements to the content pipeline:

1. **AI Provider Toggle** — migrate content generation from hardcoded Claude to the shared `ai-provider` abstraction, defaulting to OpenAI
2. **Voice Skills** — extract Sean's voice from hardcoded system prompts into DB-managed skill records; add CRUD UI and per-capture selection
3. **HyperFrames Prompt Generator** — new Dashboard tab that produces a copy-ready Claude Code prompt for building HyperFrames video compositions

---

## Section 1: AI Provider Toggle

### Problem
`vulnaguard-marketing-agents/agents/content-pipeline/index.ts` instantiates `new Anthropic()` directly and hardcodes `claude-sonnet-4-6`. There is no way to switch to OpenAI from the UI.

### Design

**Backend:**
- Migrate `index.ts` to use `getProviderForAgent('content-pipeline')` from `lib/ai-provider.ts`
- Seed a default row in `ai_provider_config`: `{ agent_name: 'content-pipeline', provider: 'openai', model: 'gpt-4.1' }` in `ensureSchema()`
- Both the main generation call and the video script generation call use the same provider config
- `callContentPipelineAI(system, user, maxTokens)` helper inside `index.ts` handles OpenAI/Anthropic branching (same pattern as outreach agent)

**Frontend:**
- Small provider pill in the content pipeline page header — shows "OpenAI" or "Claude" with a click-to-toggle action
- Toggle calls `POST /api/settings/ai-provider` with `{ agent_name: 'content-pipeline', provider, model }`
- Loads current setting on mount via `GET /api/settings/ai-provider`

---

## Section 2: Voice Skills

### Problem
Sean's voice/tone instructions are hardcoded in `systemPrompt.ts` (the `VULNAGUARD_SYSTEM_PROMPT` const). They cannot be edited without a code deploy. There is no mechanism to add new voice styles (e.g., for a different brand or audience register).

### Design

**Database:**
- Add `skill_type TEXT NOT NULL DEFAULT 'persona'` column to the `personas` table via `ALTER TABLE` in `ensureSchema()`
- Marketing outreach personas remain `skill_type = 'persona'`
- Voice/content skills use `skill_type = 'voice'`
- Seed "Sean's Voice — Vulnaguard" as the first voice skill (`ON CONFLICT (slug) DO NOTHING`):
  - `slug`: `seans-voice-vulnaguard`
  - `name`: `Sean's Voice — Vulnaguard`
  - `body`: extracted voice/tone section from current `VULNAGUARD_SYSTEM_PROMPT` (the role definition, tone rules, phrases to avoid, lived-experience framing — not the platform character counts or JSON schema, which stay in the base prompt)

**API:**
- `GET /api/marketing/personas?type=voice` — existing route reads `skill_type` filter from query param; no new routes needed
- `POST /api/marketing/personas` — already handles upsert; client sends `skill_type: 'voice'` in the body
- Add `skill_type` to the POST body schema

**Content generation:**
- `runContentPipeline()` in `index.ts` accepts an optional `voiceSkillSlug?: string` param
- When provided, queries `SELECT body FROM personas WHERE slug = $1 AND skill_type = 'voice'`
- Prepends the skill body to the base system prompt: `## Voice & Tone\n\n{skill_body}\n\n---\n\n{BASE_PROMPT}`
- Base system prompt in `systemPrompt.ts` is trimmed to only platform specs + JSON output schema (voice instructions move to the seeded skill)

**API route changes:**
- `POST /api/content-pipeline/generate` accepts `voiceSkillSlug?: string` in request body
- `POST /api/content-pipeline/script` accepts `voiceSkillSlug?: string` (passes through to script generation)

**Frontend:**
- `CaptureScreen.tsx` gets a "Voice Skill" dropdown above the Submit button
  - Fetches `GET /api/marketing/personas?type=voice` on mount
  - Default: first result (which is the seeded "Sean's Voice" row)
  - Selection persisted to `localStorage` key `content_pipeline_voice_skill`
  - Includes a small "Manage →" link that navigates to the Voice Skills tab
- Content pipeline page gets a **Voice Skills** tab in the top nav
  - Same card list / create / edit / delete UI as the marketing Personas tab
  - Only shows `skill_type = 'voice'` entries
  - Editor modal: Name field + large markdown textarea + Save button
  - Supports uploading `.md` files: file input that reads the file and populates the textarea

**Upload flow:**
- File picker (`<input type="file" accept=".md,.txt">`) in the persona editor modal
- Reads file client-side via `FileReader.readAsText()`
- Populates the body textarea — user reviews/edits before saving
- No server-side file parsing needed; content goes to DB via the existing POST endpoint

---

## Section 3: HyperFrames Prompt Generator

### Problem
The content pipeline Video tab generates a brief + speaking script. There is no path from this output to a HyperFrames video composition. The HyperFrames skill exists in `.claude/skills/hyperframes/SKILL.md` but is only usable inside Claude Code sessions, not the deployed app.

### Design

**Approach:** The deployed app generates a self-contained, copy-ready Claude Code prompt. The user pastes it into a Claude Code session on their machine, which then runs the HyperFrames skill to produce the HTML composition.

**New DB column:**
- `ALTER TABLE content_pipeline_records ADD COLUMN IF NOT EXISTS hyperframes_prompt TEXT`

**New API route:**
- `POST /api/content-pipeline/hyperframes`
- Request body: `{ record_id: string, voice_skill_slug?: string }`
- Server reads:
  1. The `content_pipeline_records` row for `record_id` (gets `core_idea`, `video_brief`, `youtube_short`)
  2. The HyperFrames skill file from `.claude/skills/hyperframes/SKILL.md` (via `fs.readFileSync` — repo file, always present)
  3. The voice skill body from `personas` table (if `voice_skill_slug` provided)
- Calls AI with a meta-prompt that instructs it to write a Claude Code prompt, providing all three inputs
- Saves the generated prompt to `content_pipeline_records.hyperframes_prompt`
- Returns `{ prompt: string }`

**Meta-prompt structure (sent to AI):**
```
You are writing a Claude Code prompt that will be pasted into a terminal to build a HyperFrames video.

## HyperFrames Skill Reference
{SKILL.md content}

## Voice & Tone
{voice_skill_body}

## Video Brief
Core idea: {core_idea}
Hook: {video_brief.hook}
Key points: {video_brief.points}
CTA: {video_brief.cta}
Style: {video_brief.style}

## Your task
Write a complete, self-contained Claude Code prompt that:
1. References specific HyperFrames components by name for each beat
2. Specifies timing, text content, and animation choices
3. Applies the voice/tone guidelines to all on-screen text
4. Produces a single HTML file ready to preview

The output should be the prompt text only — no explanation, no preamble.
```

**Frontend:**
- Dashboard (`components/content-pipeline/Dashboard.tsx`) gets a third tab: **HyperFrames**
- Tab is disabled (greyed, unclickable) when no record is loaded
- Tab content:
  - Brief summary card: hook + 3 points + CTA (read-only, from current session)
  - "Generate HyperFrames Prompt" button (gold, full width) — triggers the API call
  - Loading state: spinner + "Building your HyperFrames prompt…"
  - Result: read-only `<pre>` block with monospace font, full prompt text
  - Large "Copy Prompt" button (clipboard API)
  - Small "Regenerate" link below the copy button
  - If `hyperframes_prompt` already exists on the record (from a prior generation), it loads immediately without regenerating

---

## Data Flow Summary

```
CaptureScreen
  └─ voiceSkillSlug (from dropdown / localStorage)
  └─ rawInput, captureMode, brand
        │
        ▼
POST /api/content-pipeline/generate
  └─ getProviderForAgent('content-pipeline') → OpenAI or Claude
  └─ SELECT body FROM personas WHERE slug = voiceSkillSlug
  └─ runContentPipeline(input, provider, voiceSkill)
  └─ INSERT content_pipeline_records
        │
        ▼
Dashboard (Text Posts | Video | HyperFrames)
        │
        └─ HyperFrames tab
             └─ POST /api/content-pipeline/hyperframes
                  └─ reads SKILL.md + voice skill + video brief
                  └─ AI generates Claude Code prompt
                  └─ UPDATE content_pipeline_records SET hyperframes_prompt
                  └─ Copy to clipboard → paste into Claude Code
```

---

## Files Changed

| File | Change |
|------|--------|
| `lib/db.ts` | Add `skill_type` column to personas; add `hyperframes_prompt` column to content_pipeline_records; seed content-pipeline AI provider default; seed Sean's Voice skill |
| `vulnaguard-marketing-agents/agents/content-pipeline/index.ts` | Migrate to `ai-provider.ts`; accept `voiceSkillSlug`; trim base system prompt |
| `vulnaguard-marketing-agents/agents/content-pipeline/systemPrompt.ts` | Remove voice/tone section (moves to DB seed); keep platform specs + JSON schema |
| `app/api/content-pipeline/generate/route.ts` | Accept `voiceSkillSlug` in body |
| `app/api/content-pipeline/script/route.ts` | Accept `voiceSkillSlug` in body |
| `app/api/content-pipeline/hyperframes/route.ts` | New — HyperFrames prompt generator |
| `app/api/marketing/personas/route.ts` | Add `skill_type` filter to GET; accept `skill_type` in POST |
| `components/content-pipeline/CaptureScreen.tsx` | Add voice skill dropdown + manage link |
| `components/content-pipeline/Dashboard.tsx` | Add HyperFrames tab |
| `app/(app)/content-pipeline/page.tsx` | Add provider toggle in header; add Voice Skills tab |

---

## Out of Scope

- Multi-voice-skill blending (one skill at a time)
- Runtime HyperFrames HTML rendering in the browser (requires local CLI)
- Automatic brand detection for voice skill selection
- Voice skill versioning / history
