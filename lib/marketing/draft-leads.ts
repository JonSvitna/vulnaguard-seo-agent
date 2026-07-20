import { getPool, query } from '@/lib/db'
import { draftSequence } from '@/vulnaguard-marketing-agents/agents/outreach'
import type { CopywriterResult, OutreachLead } from '@/vulnaguard-marketing-agents/agents/outreach/types'

type Query = <T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>

type Transaction = <T>(work: (query: Query) => Promise<T>) => Promise<T>

export interface DraftLeadDependencies {
  query: Query
  transaction: Transaction
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
  | { leadId: number; status: 'failed'; reason: 'draft_generation_failed' | 'persistence_failed' }

async function transaction<T>(work: (transactionQuery: Query) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const transactionQuery: Query = async (text, params) => {
      const result = await client.query(text, params as never)
      return result.rows
    }
    const result = await work(transactionQuery)
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the mutation error reported to the caller.
    }
    throw error
  } finally {
    client.release()
  }
}

export const productionDependencies: DraftLeadDependencies = {
  query,
  transaction,
  draftSequence,
  onError: (leadId, error) => console.error('[marketing/draft-leads] draft failed for lead', leadId, error),
}

function reportError(deps: DraftLeadDependencies, leadId: number, error: unknown): void {
  try {
    deps.onError?.(leadId, error)
  } catch {
    // Error reporting must not abort the remaining lead drafts.
  }
}

function skippedResult(lead: OutreachLead): DraftLeadResult | null {
  if (lead.status === 'drafted') return { leadId: lead.id, status: 'skipped', reason: 'already_drafted' }
  if (lead.status !== 'discovered') return { leadId: lead.id, status: 'skipped', reason: 'ineligible_status' }
  return null
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
    const initialSkip = skippedResult(lead)
    if (initialSkip) {
      results.push(initialSkip)
      continue
    }

    let draft: CopywriterResult | null = null
    if (lead.contact_email?.trim()) {
      try {
        draft = await deps.draftSequence(lead, null, null, null)
      } catch (error) {
        reportError(deps, leadId, error)
        results.push({ leadId, status: 'failed', reason: 'draft_generation_failed' })
        continue
      }
    }

    try {
      const result = await deps.transaction(async (transactionQuery) => {
        const locked = await transactionQuery<OutreachLead>(
          `SELECT * FROM leads WHERE id = $1 FOR UPDATE`,
          [leadId],
        )
        const current = locked[0]
        if (!current) return { leadId, status: 'skipped', reason: 'not_found' } as DraftLeadResult
        const currentSkip = skippedResult(current)
        if (currentSkip) return currentSkip
        if (!current.contact_email?.trim()) {
          await transactionQuery(
            `UPDATE leads SET status = 'no_email', updated_at = NOW()
             WHERE id = $1 AND status = 'discovered'`,
            [leadId],
          )
          return { leadId, status: 'skipped', reason: 'missing_email' } as DraftLeadResult
        }
        if (!draft) throw new Error('Draft was not generated for an eligible lead')

        await transactionQuery(`DELETE FROM sequences WHERE lead_id = $1`, [leadId])
        const sequences = await transactionQuery<{ id: number }>(
          `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
          [leadId],
        )
        const sequenceId = sequences[0].id

        for (const email of draft.emails) {
          await transactionQuery(
            `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status, flagged_reason)
             VALUES ($1, $2, $3, $4, $5, 'drafted', $6)`,
            [sequenceId, leadId, email.touch_number, email.subject, email.body, email.flagged_reason ?? null],
          )
        }

        if (draft.linkedin_message?.trim()) {
          await transactionQuery(
            `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
             VALUES ($1, $2, $3, 'drafted')`,
            [sequenceId, leadId, draft.linkedin_message],
          )
        }

        await transactionQuery(
          `UPDATE leads SET status = 'drafted', updated_at = NOW()
           WHERE id = $1 AND status = 'discovered'`,
          [leadId],
        )
        return { leadId, status: 'drafted' } as DraftLeadResult
      })
      results.push(result)
    } catch (error) {
      reportError(deps, leadId, error)
      results.push({ leadId, status: 'failed', reason: 'persistence_failed' })
    }
  }

  return results
}
