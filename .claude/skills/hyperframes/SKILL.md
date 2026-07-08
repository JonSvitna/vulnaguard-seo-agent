---
name: hyperframes
description: Use this skill whenever designing, scripting, or prompting HyperFrames video or image content for this repo's content-pipeline video scripts. Trigger when Sean asks to create a video, animate content, or turn a content-pipeline video brief/script into an actual HyperFrames composition.
---

# HyperFrames — routed to Creative OS

The canonical HyperFrames toolkit (composition authoring, component catalog, shader/CSS
transitions, CLI commands) lives in `~/Documents/GitHub/video-website-agent`'s HyperFrames
skill pool, dispatched via `~/Documents/GitHub/creative-os`. This repo doesn't keep its own
copy — spawn an Agent into `video-website-agent` (or `creative-os` if unsure which pool owns
the task) rather than improvising HyperFrames guidance locally.

## What this repo hands off

`content-pipeline`'s video tab produces a `video_brief` (hook, key points, CTA) and an
on-demand full speaking script (`content_pipeline_records.video_script`, see
`CONTENT_PIPELINE.md`). Once Sean has a recorded take, the script + brief is the handoff
payload to Creative OS for actual composition/rendering — this repo does not render video
itself.
