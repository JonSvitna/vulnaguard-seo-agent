import { NextResponse } from 'next/server'
import { query, ensureSchema } from '@/lib/db'
import { qualifyAndUpdateLead } from '@/lib/marketing/qualify'
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
          const draft = await draftSequence(updated, updated.persona_slug as string | null)

          // Delete any existing sequence, then insert new one
          await query(`DELETE FROM sequences WHERE lead_id = $1`, [lead.id])
          const seqs = await query<{ id: number }>(
            `INSERT INTO sequences (lead_id, status) VALUES ($1, 'drafted') RETURNING id`,
            [lead.id]
          )
          const seqId = seqs[0].id

          for (const e of draft.emails) {
            await query(
              `INSERT INTO emails (sequence_id, lead_id, touch_number, subject, body, status)
               VALUES ($1, $2, $3, $4, $5, 'drafted')`,
              [seqId, lead.id, e.touch_number, e.subject, e.body]
            )
          }

          if (draft.linkedin_message?.trim()) {
            await query(
              `INSERT INTO linkedin_messages (sequence_id, lead_id, message, status)
               VALUES ($1, $2, $3, 'drafted')`,
              [seqId, lead.id, draft.linkedin_message]
            )
          }

          await query(
            `UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1`,
            [lead.id]
          )

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
