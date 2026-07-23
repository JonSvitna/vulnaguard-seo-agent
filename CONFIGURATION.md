# Configuration Guide

This app does one job: qualify email-bearing leads and send outreach.

Configured two ways:

1. **Environment variables** — server credentials (Anthropic/OpenAI, Resend, Postgres, automation secret). Set in `.env.local` locally or Railway Variables in production.
2. **In-app Settings** (`/settings`) — browser-stored Anthropic/OpenAI/Resend keys for convenience, plus AI provider overrides. Marketing agents always use server env keys; localStorage is a fallback for local experiments only.
3. **Marketing Agents Settings tab** — operational knobs in the `agent_config` table (qualifier threshold, send delays, daily limit, Clay fit threshold).

---

## Required env vars

| Variable | Required | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes* | Qualifier + copywriter (Claude) |
| `OPENAI_API_KEY` | Yes* | Alternative provider |
| `RESEND_API_KEY` | Yes | Live outreach sends |
| `DATABASE_URL` | Yes (Railway) | Leads / sequences / emails |
| `MARKETING_AUTOMATION_SECRET` | Yes (for Clay/n8n) | Bearer auth for Clay automation routes: intake, batch summary, batch approve, batch reject |
| `SEND_BATCH_INTERVAL_MINUTES` | No | Drip scheduler cadence (default 15) |
| `DISABLE_SEND_BATCH_SCHEDULER` | No | Set `true` to disable background send/drip/STOP checks |
| `PGSSLMODE` | No | `disable` only for local non-SSL Postgres |

\* At least one of Anthropic/OpenAI is required.

### STOP-reply opt-out (optional)

| Variable | Purpose |
| --- | --- |
| `MS365_TENANT_ID` / `MS365_CLIENT_ID` / `MS365_CLIENT_SECRET` / `MS365_USER_UPN` | Poll mailbox for "stop" replies via Graph |

Without these, STOP checks no-op and opt-outs stay manual.

---

## Approve = send

`POST /api/marketing/approval/approve` (dashboard) schedules touch 1 immediately, schedules follow-ups from `sequence_delay_days`, and calls `runSendBatch()` right away. There is no separate Release step.

Clay/Slack automation uses Bearer-protected batch routes (same underlying helpers):

- `POST /api/marketing/clay-batches/:batchId/approve`
- `POST /api/marketing/clay-batches/:batchId/reject`

---

## Clay intake

Live automation path (all require `Authorization: Bearer $MARKETING_AUTOMATION_SECRET`):

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/marketing/leads/clay-batch` | Insert + draft one qualified Clay row |
| `GET` | `/api/marketing/clay-batches/:batchId` | Summary + Slack Block Kit contract |
| `POST` | `/api/marketing/clay-batches/:batchId/approve` | Approve batch and send |
| `POST` | `/api/marketing/clay-batches/:batchId/reject` | Reject drafted sequences in batch |

Clay fit scoring happens upstream. Intake inserts + drafts; it does **not** run the CMMC qualifier.

See AIS-OS `references/clay-lead-automation.md` for the full Clay → n8n → approve flow.
