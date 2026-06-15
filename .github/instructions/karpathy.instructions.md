---
applyTo: "**/*.ts,**/*.tsx"
---

# Karpathy Coding Guidelines — Always Active

When writing or editing TypeScript/TSX in this project, load and apply `.claude/skills/karpathy-guidelines/SKILL.md`. Summary of the rules:

## 1. Think Before Coding
State assumptions explicitly. If there are multiple valid interpretations, surface them — don't silently pick one.

## 2. Simplicity First
Minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "flexibility" that wasn't asked for.

## 3. Surgical Changes
Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. Remove only imports/variables YOUR changes made unused.

## 4. Goal-Driven Execution
For multi-step tasks, state a brief plan with verifiable checks:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

## Project-Specific Pitfalls
- Always `await params` in dynamic API routes — it is a `Promise<{ param: string }>`
- New DB tables go in `lib/db.ts` SCHEMA const, not in migration files
- New agents go in `AGENT_REGISTRY` in `lib/agents/registry.ts` — don't call agent functions directly
- AI responses return JSON in markdown fences — always strip ` ```json ``` ` before `JSON.parse`
- Output complete files for GitHub writes, never diffs
- Tailwind v4: use `@import "tailwindcss"` in CSS — there is no `tailwind.config.js`
