---
name: hyperframes
description: Use this skill whenever designing, scripting, or prompting HyperFrames video or image content. Trigger when Sean asks to create a video, animate content, build a HyperFrames project, choose effects, add captions, apply transitions, use overlays, showcase apps, display data visually, or describe a video "flavor." Also trigger when Sean says things like "make a video for," "animate this," "add an effect," "what component should I use," or "how do I show X in HyperFrames." This skill defines the full approved toolkit — always pull from this list before suggesting anything outside it. If a use case isn't covered here, flag it and ask before going outside scope.
---

# HyperFrames Skill

HyperFrames is an open-source video and image creation format. This skill defines the approved component toolkit and how to use each category effectively. Stay within this toolkit. If something outside this list seems useful, surface it and get confirmation first.

---

## Component Toolkit

### TEXT CAPTIONS

| Component | Command | Use When |
|---|---|---|
| Caption Pill Karaoke | `npx hyperframes add caption-pill-karaoke` | Word-by-word karaoke-style caption highlighting. Good for hook lines, punchy statements, high-retention reels. |
| Caption Weight Shift | `npx hyperframes add caption-weight-shift` | Animated font-weight transitions on text. Good for emphasis, key words, dramatic reveals. |

---

### HTML IN CANVAS (VFX)

| Component | Command | Use When |
|---|---|---|
| VFX Magnetic | `npx hyperframes add vfx-magnetic` | Elements pulled/repelled by cursor or anchor point. Good for interactive-feel product reveals. |
| VFX Portal | `npx hyperframes add vfx-portal` | Scene transition through a portal warp. Good for "enter a world" intros, dimensional brand moments. |
| VFX Liquid Background | `npx hyperframes add vfx-liquid-background` | Organic, fluid animated background. Good for ambient b-roll, mood-setting sections. |
| VFX Shatter | `npx hyperframes add vfx-shatter` | Element breaks apart into fragments. Good for dramatic reveals, before/after transitions, "break the old way" messaging. |
| VFX Text Cursor | `npx hyperframes add vfx-text-cursor` | Typing cursor animation on text. Good for terminal-feel content, code-adjacent brands, founder voice content. |

---

### SOCIAL OVERLAYS

| Component | Command | Use When |
|---|---|---|
| Instagram Follow | `npx hyperframes add instagram-follow` | Native-looking IG follow prompt overlay. Good for IG-first content, growth CTAs. |
| X Post | `npx hyperframes add x-post` | X/Twitter post card overlay. Good for quoting tweets, social proof, hot takes. |
| YT Lower Third | `npx hyperframes add yt-lower-third` | YouTube-style name/title lower third. Good for interview format, authority positioning, tutorial content. |

---

### SHADER TRANSITIONS

Shaders are **described per video flavor** — there is no fixed command. When designing a transition, describe the visual mood and this skill will prompt accordingly.

**Common flavor descriptions:**
- **Cinematic / dark sci-fi** → Glitch dissolve, light leak burn, pixel scatter
- **Clean / SaaS product** → Soft fade, horizontal wipe, blur-to-sharp
- **Energetic / social-first** → Whip pan, zoom punch, flash cut
- **Premium / editorial** → Cross-dissolve, film grain bleed, slow vignette pull
- **Tech / terminal** → Scan line wipe, CRT flicker, matrix rain curtain

> When Sean describes a video's "flavor," select or propose a shader style that matches. Confirm before locking.

---

### CSS TRANSITIONS

CSS transitions are also **case-by-case** and described per scene context, not pre-installed.

**Common patterns:**
- Slide in from bottom/left/right
- Fade up with scale
- Stagger reveal (child elements cascade in)
- Clip-path wipe (reveals element along a path)
- Opacity + blur combo (de-focus exit, sharp entry)

> Propose the CSS transition style as part of the scene brief. Don't over-engineer — use the simplest transition that serves the visual story.

---

### APP SHOWCASE

| Component | Command | Use When |
|---|---|---|
| App Showcase | `npx hyperframes add app-showcase` | Full device frame mockup with app content. Good for product demos, SaaS walkthroughs, feature highlights. |
| Apple Money Count | `npx hyperframes add apple-money-count` | Animated number counter in Apple UI style. Good for revenue reveals, stat callouts, ROI moments. |
| UI 3D Reveal | `npx hyperframes add ui-3d-reveal` | 3D perspective flip/reveal of a UI screen. Good for product launches, dashboard intros, feature drops. |

---

### DATA CHARTS

| Component | Command | Use When |
|---|---|---|
| Data Chart | `npx hyperframes add data-chart` | Animated chart (bar, line, etc.). Good for metrics, results, proof-of-concept moments. |
| US Map | `npx hyperframes add us-map` | Blank US map base. Good for geographic coverage, regional breakdowns. |
| US Map Bubble | `npx hyperframes add us-map-bubble` | US map with sized bubble overlays. Good for volume-by-state, density, reach data. |
| US Map Flow | `npx hyperframes add us-map-flow` | US map with flow/movement paths. Good for migration, distribution, outreach flow. |
| US Map Hex | `npx hyperframes add us-map-hex` | US map in hexagonal tile format. Good for clean visual breakdowns, state-by-state comparisons. |
| World Map | `npx hyperframes add world-map` | Global map base. Good for international reach, global stats, worldwide coverage stories. |

---

### PARALLAX ZOOM

| Component | Command | Use When |
|---|---|---|
| Parallax Zoom | `npx hyperframes add parallax-zoom` | Push-in zoom with layered depth. Good for dramatic openers, product hero moments, cinematic intros. |
| Parallax Unzoom | `npx hyperframes add parallax-unzoom` | Pull-back reveal with layered depth. Good for "big picture" reveals, context-setting moments, endings. |

---

### MORPH TEXT

| Component | Command | Use When |
|---|---|---|
| Morph Text | `npx hyperframes add morph-text` | Text smoothly morphs from one word/phrase to another. Good for "X becomes Y" messaging, benefit pivots, before/after language. |
| Caption Blend Difference | `npx hyperframes add caption-blend-difference` | Caption rendered in blend-difference mode for visual contrast. Good for overlay on busy video backgrounds, stylized text moments. |

---

### BLOCKS

| Component | Command | Use When |
|---|---|---|
| Flowchart | `npx hyperframes add flowchart` | Animated flowchart/diagram builder. Good for explaining processes, system overviews, how-it-works sections. |
| Logo Outro | `npx hyperframes add logo-outro` | Branded logo end card. Good for all videos — use as default closing frame. |

---

### APPLE TERMINAL / CODE

| Component | Command | Use When |
|---|---|---|
| Apple Terminal | `npx hyperframes add apple-terminal` | macOS terminal window with animated typing. Good for dev-adjacent content, CLI tools, founder/builder audience. |
| Code Snippet Dark+ | `npx hyperframes add code-snippet-dark-plus` | VS Code Dark+ styled code block with syntax highlighting. Good for code reveals, technical explainers, SaaS walkthroughs. |

---

## How to Use This Skill

### When Sean describes a video concept:
1. Identify the **video flavor** (cinematic, product demo, social reel, data story, etc.)
2. Select components from the toolkit above that match the story beats
3. Propose shader and CSS transitions that fit the flavor
4. List the `npx hyperframes add` commands in scene order
5. Flag anything the toolkit doesn't cover and ask before going outside it

### Component selection priority:
- **Hook/Opener** → Parallax Zoom, VFX Portal, Morph Text, Caption Pill Karaoke
- **Body / Story beats** → App Showcase, Data Chart, VFX Shatter, Flowchart, VFX Text Cursor
- **Social proof / Overlays** → X Post, YT Lower Third, Apple Money Count
- **Closer / CTA** → Logo Outro, Instagram Follow, Caption Weight Shift

### Out-of-scope rule:
If a use case isn't covered by this toolkit, say: *"This isn't in the current HyperFrames toolkit — want me to add it or find an alternative within scope?"* Don't silently suggest outside tools.
