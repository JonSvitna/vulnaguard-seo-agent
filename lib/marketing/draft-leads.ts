import { query } from '@/lib/db'
import { draftSequence } from '@/vulnaguard-marketing-agents/agents/outreach'
import type { CopywriterResult, OutreachLead } from '@/vulnaguard-marketing-agents/agents/outreach/types'

type Query = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>

export interface DraftLeadDependencies {
  query: Query
  draftSequence: (
    lead: OutreachLead,
    personaSlug?: string | null,
    outreachIntent?: string | null,
    skillSlugs?: string[] | null,
  ) => Promise<CopywriterResult>
  onError?: (leadId: number, error: unknown) => void
}

export type DraftLeadResult =
  | { leadId: number; status: 'drafted' }
  | { leadId: number; status: 'skipped'; reason: 'already_drafted' | 'ineligible_status' | 'missing_email' | 'not_found' }
  | { leadId: number; status: 'failed'; reason: string }

export const productionDependencies: DraftLeadDependencies = {
  query,
  draftSequence,
  onError: (leadId, error) => console.error('[marketing/draft-leads] draft failed for lead', leadId, error),
}

export async function draftLeadIds(
  leadIds: number[],
  deps: DraftLeadDependencies = productionDependencies,
): Promise<DraftLeadResult[]> {
  const uniqueLeadIds = [...new Set(leadIds)]
  if (!uniqueLeadIds.length) return []

  const leads = await deps.query<OutreachLead>(
    `SELECT * FROM leads WHERE id = ANY($1::int[])`,
    [uniqueLeadIds],
  )
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
  const results: DraftLeadResult[] = []

  for (const leadId of uniqueLeadIds) {
    const lead = leadsById.get(leadId)
    if (!lead) {
      results.push({ leadId, status: 'skipped', reason: 'not_found' })
      continue
    }
    if (lead.status === 'drafted') {
      results.push({ leadId, status: 'skipped', reason: 'already_drafted' })
      continue
    }
    if (lead.status !== 'discovered') {
      results.push({ leadId, status: 'skipped', reason: 'ineligible_status' })
      continue
    }
    if (!lead.contact_email?.trim()) {
      await deps.query(
        `UPDATE leads SET status = 'no_email', updated_at = NOW() WHERE id = $1`,
        [leadId],
      )
      results.push({ leadId, status: 'skipped', reason: 'missing_email' })
      continue
    }

    try {
      const draft = await deps.draftSequence(lead, null, null, null)

      await deps.query(`DELETE FROM sequences WHERE lead_id = $1`, [leadId])
      const sequences = await deps.query<{ id: number }>(
        `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
        [leadId],
      )
      const sequenceId = sequences[0].id

      for (const email of draft.emails) {
        await deps.query(
          `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status, flagged_reason)
           VALUES ($1, $2, $3, $4, $5, 'drafted', $6)`,
          [sequenceId, leadId, email.touch_number, email.subject, email.body, email.flagged_reason ?? null],
        )
      }

      if (draft.linkedin_message?.trim()) {
        await deps.query(
          `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
           VALUES ($1, $2, $3, 'drafted')`,
          [sequenceId, leadId, draft.linkedin_message],
        )
      }

      await deps.query(
        `UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1`,
        [leadId],
      )
      results.push({ leadId, status: 'drafted' })
    } catch (error) {
      deps.onError?.(leadId, error)
      results.push({
        leadId,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown drafting error',
      })
    }
  }

  return results
}
