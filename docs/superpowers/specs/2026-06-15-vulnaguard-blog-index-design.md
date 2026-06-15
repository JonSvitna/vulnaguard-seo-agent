# Vulnaguard Blog Index (Auto-Discovery) — Design

## Context

The Vulnaguard public site needs a browsable blog landing page so visitors can view published posts in one place.

Current publishing creates individual blog pages at app/blog/[slug]/page.tsx, but there is no guaranteed public index page that lists all posts.

## Scope

This design covers Vulnaguard first.

Out of scope for this pass:
- Cross-site rollout to sentinel-cmmc, mectofitness, bluealamo
- Advanced filtering, search, pagination, tags, categories
- CMS/editor UI for post curation

## Requirements

1. Public route /blog must list published blog posts.
2. New posts should appear automatically after deploy without manual list updates.
3. Missing optional metadata must not break rendering.
4. Page should be server-rendered and SEO-friendly.

## Approach Options Considered

1. Runtime filesystem discovery from app/blog/*/page.tsx
- Pros: fully automatic, zero manual maintenance, no secondary manifest to sync.
- Cons: requires predictable metadata extraction conventions.

2. Generated manifest data file
- Pros: explicit schema and faster page assembly.
- Cons: extra synchronization point; not truly automatic if generation is skipped.

3. Manual curated list
- Pros: strongest editorial control.
- Cons: high maintenance; fails the automatic requirement.

## Chosen Approach

Use runtime filesystem discovery in the Vulnaguard site repo.

Create app/blog/page.tsx that:
- Scans app/blog/*/page.tsx on the server.
- Derives slug from folder name.
- Attempts to read exported metadata fields when present.
- Falls back safely when metadata is missing.
- Sorts posts newest-first.
- Renders a clean card list linking to each post route.

## Data Contract (Target)

Preferred metadata fields on each blog page:
- title: string
- description: string
- publishedAt: ISO date string
- optionally image: string

Fallback rules:
- title: derived from slug (kebab-case to title case)
- description: default teaser string
- publishedAt: omitted in UI if unavailable
- image: no image block rendered

This ensures index stability even with mixed legacy posts.

## Rendering + UX

Blog index page should include:
- Heading and short intro
- Responsive grid/list of post cards
- Card elements: title, description, optional date, read-more link
- Empty state when no posts exist

No pagination in first pass.

## SEO + Performance

- Use server component for index page.
- Export page metadata for title/description.
- Avoid client-side fetch for listing.
- Keep parsing lightweight and tolerant of missing metadata.

## Agent Pipeline Follow-up

To keep auto-index quality high, adjust blog generation guidance in the SEO agent so future blog pages consistently include metadata fields listed above.

This follow-up is part of implementation in the SEO agent repository, while actual public page file is created in the Vulnaguard site repository.

## Risks and Mitigations

1. Inconsistent metadata across older blog pages
- Mitigation: robust fallback logic and non-fatal parsing.

2. Variations in page file structure
- Mitigation: defensive extraction strategy; skip invalid entries rather than crash page.

3. Future scale (many posts)
- Mitigation: first pass is simple list; pagination can be added later if needed.

## Testing Plan

1. Build passes on Vulnaguard site.
2. Visiting /blog shows all current app/blog/[slug]/page.tsx posts.
3. Add a new post page and redeploy; new post appears automatically.
4. Verify at least one post with missing metadata still renders with fallbacks.
5. Validate links open the correct post routes.

## Success Criteria

1. /blog is publicly reachable and lists posts.
2. No manual edits needed to include newly published posts.
3. Missing metadata does not break page rendering.
4. Output is SEO-friendly server-rendered markup.
