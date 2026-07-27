import { NextResponse } from 'next/server'
import { query, ensureSchema } from '@/lib/db'
import { qualifyAndUpdateLead } from '@/lib/marketing/qualify'
import { persistDraftedSequence } from '@/lib/marketing/draft-leads'
import { draftSequence } from '@/vulnaguard-marketing-agents/agents/outreach'
import type { OutreachLead } from '@/vulnaguard-marketing-agents/agents/outreach/types'

export async function POST() {
  try {
    await ensureSchema()

    const configRows = await query<{ value: string }>(
      `SELECT value FROM agent_config WHERE key = 'batch_size'`
    )
    const batchSize = Number(configRows[0]?.value) || 10

    const leads = await query<OutreachLead>(
      `SELECT * FROM leads WHERE status = 'discovered' ORDER BY created_at ASC LIMIT $1`,
      [batchSize]
    )

    if (!leads.length) {
      return NextResponse.json({ ok: true, message: 'No discovered leads to process', processed: 0 })
    }

    let qualified = 0
    let drafted = 0
    let disqualified = 0
    let errors = 0

    for (const lead of leads) {
      try {
        const updated = await qualifyAndUpdateLead(lead)

        if (updated.status !== 'qualified') {
          disqualified++
          continue
        }

        qualified++

        try {
          const draft = await draftSequence(updated, updated.persona_slug as string | null, null, updated.skill_slugs as string[] | null)

          await persistDraftedSequence(lead.id, draft, query)

          drafted++
        } catch (draftErr) {
          console.error('[pipeline/run] draft failed for lead', lead.id, draftErr)
          errors++
        }
      } catch (qualErr) {
        console.error('[pipeline/run] qualify failed for lead', lead.id, qualErr)
        errors++
      }
    }

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('full_pipeline', $1, $2, $3, NOW())`,
      [
        errors === 0 ? 'success' : 'error',
        leads.length,
        JSON.stringify({ processed: leads.length, qualified, drafted, disqualified, errors }),
      ]
    )

    return NextResponse.json({
      ok: true,
      processed: leads.length,
      qualified,
      drafted,
      disqualified,
      errors,
    })
  } catch (err) {
    console.error('[marketing/pipeline/run]', err)
    return NextResponse.json({ error: 'Pipeline run failed' }, { status: 500 })
  }
}
