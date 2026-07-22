import { NextRequest, NextResponse } from 'next/server'

import { ensureSchema, query } from '@/lib/db'
import { normalizeClayLead } from '@/lib/marketing/clay-batch'
import { draftLeadIds } from '@/lib/marketing/draft-leads'
import type { DraftLeadResult } from '@/lib/marketing/draft-leads'
import { isMarketingAutomationAuthorized } from '@/lib/marketing/service-auth'

export const runtime = 'nodejs'

type Query = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>

interface ClayBatchDependencies {
  automationSecret?: string
  ensureSchema: () => Promise<void>
  query: Query
  draftLeadIds: (leadIds: number[]) => Promise<DraftLeadResult[]>
  onError?: (error: unknown) => void
}

const productionDependencies: ClayBatchDependencies = {
  automationSecret: process.env.MARKETING_AUTOMATION_SECRET,
  ensureSchema,
  query,
  draftLeadIds,
  onError: (error) => console.error('[marketing/clay-batch] intake failed', error),
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function errorResponse(error: string, status: number, retryable = false): NextResponse {
  return jsonResponse(
    retryable ? { ok: false, error, retryable: true } : { ok: false, error },
    status,
  )
}

function reportError(deps: ClayBatchDependencies, error: unknown): void {
  try {
    deps.onError?.(error)
  } catch {
    // Error reporting must not alter the stable automation response.
  }
}

export async function handleClayBatchPost(
  request: Request,
  deps: ClayBatchDependencies = productionDependencies,
): Promise<NextResponse> {
  if (!isMarketingAutomationAuthorized(request, deps.automationSecret)) {
    return errorResponse('unauthorized', 401)
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return errorResponse('invalid_payload', 400)
  }

  let lead: ReturnType<typeof normalizeClayLead>
  try {
    lead = normalizeClayLead(payload)
  } catch {
    return errorResponse('invalid_payload', 400)
  }

  try {
    await deps.ensureSchema()
    const inserted = await deps.query<{ id: number }>(
      `INSERT INTO leads (
         company_name, website, location, contact_name, contact_title, contact_email,
         source, source_detail, external_source_id, status, score, score_reason,
         category, business_line, batch_id, fit_score, fit_reason, recommended_service
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
       )
       ON CONFLICT (source, external_source_id) WHERE external_source_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        lead.company_name,
        lead.website,
        lead.location ?? null,
        lead.contact_name ?? null,
        lead.contact_title ?? null,
        lead.contact_email,
        lead.source,
        lead.source_detail,
        lead.external_source_id,
        'discovered',
        lead.fit_score,
        lead.fit_reason,
        lead.category,
        lead.business_line,
        lead.batch_id,
        lead.fit_score,
        lead.fit_reason,
        lead.recommended_service,
      ],
    )

    const created = inserted.length > 0
    let leadId = inserted[0]?.id
    let storedBatchId = lead.batch_id
    if (!leadId) {
      const existing = await deps.query<{ id: number; batch_id: string | null }>(
        `SELECT id, batch_id FROM leads WHERE source = 'clay' AND external_source_id = $1`,
        [lead.external_source_id],
      )
      leadId = existing[0]?.id
      // First-write-wins: replays keep the original stored batch_id.
      if (existing[0]?.batch_id) storedBatchId = existing[0].batch_id
    }
    if (!leadId) throw new Error('lead insert or replay lookup returned no row')

    const draftResults = await deps.draftLeadIds([leadId])
    const draftResult = draftResults.find((result) => result.leadId === leadId)
    const draftSucceeded = draftResult?.status === 'drafted'
      || (draftResult?.status === 'skipped' && draftResult.reason === 'already_drafted')
    if (!draftSucceeded) {
      reportError(deps, {
        stage: 'draft',
        lead_id: leadId,
        external_source_id: lead.external_source_id,
        draft_status: draftResult?.status ?? 'missing',
        draft_reason: draftResult && 'reason' in draftResult ? draftResult.reason : null,
      })
      return errorResponse('draft_failed', 500, true)
    }

    const sequences = await deps.query<{ id: number }>(
      `SELECT id FROM sequences WHERE lead_id = $1 ORDER BY id`,
      [leadId],
    )
    if (!sequences.length) {
      reportError(deps, {
        stage: 'sequence_lookup',
        lead_id: leadId,
        external_source_id: lead.external_source_id,
      })
      return errorResponse('draft_failed', 500, true)
    }

    return jsonResponse({
      ok: true,
      created,
      lead_id: leadId,
      batch_id: storedBatchId,
      sequence_ids: sequences.map((sequence) => sequence.id),
    }, created ? 201 : 200)
  } catch (error) {
    reportError(deps, {
      stage: 'intake',
      external_source_id: lead.external_source_id,
      message: error instanceof Error ? error.message : 'unknown_error',
    })
    return errorResponse('intake_failed', 500, true)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleClayBatchPost(request)
}
