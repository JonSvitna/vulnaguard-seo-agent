import { query } from '@/lib/db'
import { runSendBatch } from '@/lib/send-batch'
import type { SendBatchResult } from '@/lib/send-batch'

type Query = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>

export interface BatchApprovalDependencies {
  query: Query
  runSendBatch: () => Promise<Pick<SendBatchResult, 'sent' | 'failed'>>
  onError?: (error: unknown) => void
}

export interface ClayBatchSample {
  company_name: string
  subject: string | null
  preview: string
}

export interface ClayBatchSummary {
  batch_id: string
  lead_count: number
  draft_count: number
  services: Record<string, number>
  average_fit_score: number
  samples: ClayBatchSample[]
  dashboard_path: string
}

export interface ApproveBatchResult {
  ok: true
  approved: number
  sent: number
  failed: number
  message?: string
}

export interface RejectBatchResult {
  ok: true
  rejected: number
  updated: number
  message?: string
}

export type BatchActionResult = ApproveBatchResult | RejectBatchResult

const SAMPLE_LIMIT = 3
const PREVIEW_MAX = 120

export const productionDependencies: BatchApprovalDependencies = {
  query,
  runSendBatch,
  onError: (error) => console.error('[marketing/batch-approval]', error),
}

function reportError(deps: BatchApprovalDependencies, error: unknown): void {
  try {
    deps.onError?.(error)
  } catch {
    // Error reporting must not abort the approval response.
  }
}

function truncatePreview(body: string | null | undefined): string {
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= PREVIEW_MAX) return text
  return `${text.slice(0, PREVIEW_MAX - 1).trimEnd()}…`
}

function dashboardPath(batchId: string, category: string): string {
  return `/dashboard/marketing-agents?category=${encodeURIComponent(category)}&batch_id=${encodeURIComponent(batchId)}`
}

export async function getClayBatchSummary(
  batchId: string,
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<ClayBatchSummary> {
  const totals = await deps.query<{
    lead_count: string
    draft_count: string
    average_fit_score: string | null
    category: string | null
  }>(
    `SELECT
       COUNT(DISTINCT l.id)::text AS lead_count,
       COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'drafted')::text AS draft_count,
       AVG(l.fit_score)::text AS average_fit_score,
       MAX(l.category) AS category
     FROM leads l
     LEFT JOIN sequences s ON s.lead_id = l.id
     WHERE l.batch_id = $1`,
    [batchId],
  )

  const serviceRows = await deps.query<{ recommended_service: string | null; count: string }>(
    `SELECT recommended_service, COUNT(*)::text AS count
     FROM leads
     WHERE batch_id = $1
     GROUP BY recommended_service`,
    [batchId],
  )

  const sampleRows = await deps.query<{
    company_name: string
    subject: string | null
    body: string | null
  }>(
    `SELECT l.company_name, e.subject, e.body
     FROM sequences s
     JOIN leads l ON l.id = s.lead_id
     LEFT JOIN emails e ON e.sequence_id = s.id AND e.touch_number = 1
     WHERE l.batch_id = $1 AND s.status = 'drafted'
     ORDER BY s.created_at ASC, s.id ASC
     LIMIT $2`,
    [batchId, SAMPLE_LIMIT],
  )

  const services: Record<string, number> = {}
  for (const row of serviceRows) {
    const key = row.recommended_service?.trim() || 'unknown'
    services[key] = Number(row.count) || 0
  }

  const averageRaw = Number(totals[0]?.average_fit_score)
  const average_fit_score = Number.isFinite(averageRaw) ? Math.round(averageRaw * 10) / 10 : 0

  return {
    batch_id: batchId,
    lead_count: Number(totals[0]?.lead_count) || 0,
    draft_count: Number(totals[0]?.draft_count) || 0,
    services,
    average_fit_score,
    samples: sampleRows.map((row) => ({
      company_name: row.company_name,
      subject: row.subject,
      preview: truncatePreview(row.body),
    })),
    dashboard_path: dashboardPath(batchId, totals[0]?.category ?? 'clay_leads'),
  }
}

async function scheduleTouches(
  deps: BatchApprovalDependencies,
  approvedIds: number[],
): Promise<void> {
  const configRows = await deps.query<{ value: string }>(
    `SELECT value FROM agent_config WHERE key = 'sequence_delay_days'`,
  )
  const delays = (configRows[0]?.value ?? '4,9,14')
    .split(',')
    .map((d) => Number(d.trim()))
    .filter(Number.isFinite)

  await deps.query(
    `UPDATE emails SET scheduled_at = NOW() WHERE sequence_id = ANY($1::int[]) AND touch_number = 1`,
    [approvedIds],
  )

  const touchNumbers = await deps.query<{ touch_number: number }>(
    `SELECT DISTINCT touch_number FROM emails WHERE sequence_id = ANY($1::int[]) AND touch_number > 1 ORDER BY touch_number`,
    [approvedIds],
  )
  for (const { touch_number } of touchNumbers) {
    const delayDays = delays[touch_number - 2] ?? delays[delays.length - 1] ?? (touch_number - 1) * 5
    await deps.query(
      `UPDATE emails SET scheduled_at = NOW() + make_interval(days => $2) WHERE sequence_id = ANY($1::int[]) AND touch_number = $3`,
      [approvedIds, delayDays, touch_number],
    )
  }
}

async function runImmediateSend(deps: BatchApprovalDependencies): Promise<{ sent: number; failed: number }> {
  try {
    const batch = await deps.runSendBatch()
    return { sent: batch.sent, failed: batch.failed }
  } catch (error) {
    reportError(deps, error)
    return { sent: 0, failed: 0 }
  }
}

export async function approveSequenceIds(
  sequenceIds: number[],
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<ApproveBatchResult> {
  const uniqueIds = [...new Set(sequenceIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (!uniqueIds.length) {
    return { ok: true, approved: 0, sent: 0, failed: 0, message: 'No drafted sequences to approve' }
  }

  const updated = await deps.query<{ id: number; lead_id: number }>(
    `UPDATE sequences SET status = 'approved', approved_at = NOW()
     WHERE id = ANY($1::int[]) AND status = 'drafted'
     RETURNING id, lead_id`,
    [uniqueIds],
  )
  const approvedIds = updated.map((row) => row.id)
  const leadIds = [...new Set(updated.map((row) => row.lead_id))]

  if (!approvedIds.length) {
    return { ok: true, approved: 0, sent: 0, failed: 0, message: 'No drafted sequences to approve' }
  }

  await deps.query(
    `UPDATE leads SET status = 'approved', updated_at = NOW() WHERE id = ANY($1::int[])`,
    [leadIds],
  )

  await scheduleTouches(deps, approvedIds)
  const { sent, failed } = await runImmediateSend(deps)

  return { ok: true, approved: approvedIds.length, sent, failed }
}

export async function approveClayBatch(
  batchId: string,
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<ApproveBatchResult> {
  // Resolve by batch_id (each source sets its own category, e.g. clay_leads/origami_leads).
  const drafted = await deps.query<{ id: number }>(
    `SELECT s.id
     FROM sequences s
     JOIN leads l ON l.id = s.lead_id
     WHERE l.batch_id = $1 AND s.status = 'drafted'
     ORDER BY s.id`,
    [batchId],
  )
  return approveSequenceIds(drafted.map((row) => row.id), deps)
}

export async function rejectSequenceIds(
  sequenceIds: number[],
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<RejectBatchResult> {
  const uniqueIds = [...new Set(sequenceIds.filter((id) => Number.isInteger(id) && id > 0))]
  if (!uniqueIds.length) {
    return { ok: true, rejected: 0, updated: 0, message: 'No drafted sequences to reject' }
  }

  const updated = await deps.query<{ id: number; lead_id: number }>(
    `UPDATE sequences SET status = 'rejected'
     WHERE id = ANY($1::int[]) AND status = 'drafted'
     RETURNING id, lead_id`,
    [uniqueIds],
  )
  const leadIds = [...new Set(updated.map((row) => row.lead_id))]

  if (leadIds.length) {
    await deps.query(
      `UPDATE leads SET status = 'rejected', updated_at = NOW() WHERE id = ANY($1::int[])`,
      [leadIds],
    )
  }

  const rejected = updated.length
  return {
    ok: true,
    rejected,
    updated: rejected,
    message: rejected ? undefined : 'No drafted sequences to reject',
  }
}

export async function rejectClayBatch(
  batchId: string,
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<RejectBatchResult> {
  const drafted = await deps.query<{ id: number }>(
    `SELECT s.id
     FROM sequences s
     JOIN leads l ON l.id = s.lead_id
     WHERE l.batch_id = $1 AND s.status = 'drafted'
     ORDER BY s.id`,
    [batchId],
  )
  return rejectSequenceIds(drafted.map((row) => row.id), deps)
}

export async function approveAllDraftedWithEmail(
  deps: BatchApprovalDependencies = productionDependencies,
): Promise<ApproveBatchResult> {
  const rows = await deps.query<{ id: number }>(
    `SELECT s.id FROM sequences s JOIN leads l ON l.id = s.lead_id
     WHERE s.status = 'drafted' AND NULLIF(TRIM(l.contact_email), '') IS NOT NULL`,
  )
  return approveSequenceIds(rows.map((row) => row.id), deps)
}
