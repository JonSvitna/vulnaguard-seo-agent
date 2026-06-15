---
applyTo: "**"
---

# Brainstorming Gate — Mandatory Before Creative Work

Before implementing any new feature, component, API route, agent, or behavior change:

1. Load and follow the **brainstorming skill**: `.claude/skills/brainstorming/SKILL.md`
2. Do NOT write code until the user has reviewed and approved a design
3. Save the design doc to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`

**This applies to all work** — "trivial" changes have unexamined assumptions. Run the process, keep the design short if the scope is small.

Exceptions (no brainstorming needed):
- Pure bug fixes with a clearly defined root cause
- Updating copy, styles, or configuration with no behavior change
- Adding a new site to `SITES[]` in `lib/config.ts` (no code path changes)
