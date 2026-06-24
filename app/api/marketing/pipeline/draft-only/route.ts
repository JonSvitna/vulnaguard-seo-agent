import { NextRequest, NextResponse } from 'next/server'
import { query, ensureSchema } from '@/lib/db'
import { draftSequence } from '@/vulnaguard-marketing-agents/agents/outreach'
import type { OutreachLead } from '@/vulnaguard-marketing-agents/agents/outreach/types'

// For business lines with no qualifier rubric yet (anything besides 'cmmc'),
// leads sit at status='discovered' forever per the qualify gate in
// import-confirm/route.ts. This drafts them directly, skipping the score
// threshold, since sourcing already filtered for fit.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema()
    const body = await req.json().catch(() => ({}))
    const businessLine: string = body.business_line ?? 'website_design'
    const limit: number = Number(body.limit) || 100

    const leads = await query<OutreachLead>(
      `SELECT * FROM leads WHERE status = 'discovered' AND business_line = $1 ORDER BY created_at ASC LIMIT $2`,
      [businessLine, limit]
    )

    if (!leads.length) {
      return NextResponse.json({ ok: true, message: 'No discovered leads for this business line', processed: 0 })
    }

    let drafted = 0
    let errors = 0

    for (const lead of leads) {
      try {
        const draft = await draftSequence(lead, null, null, null)

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

        await query(`UPDATE leads SET status = 'drafted', updated_at = NOW() WHERE id = $1`, [lead.id])
        drafted++
      } catch (err) {
        console.error('[pipeline/draft-only] draft failed for lead', lead.id, err)
        errors++
      }
    }

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('draft_only', $1, $2, $3, NOW())`,
      [
        errors === 0 ? 'success' : 'error',
        leads.length,
        JSON.stringify({ business_line: businessLine, drafted, errors }),
      ]
    )

    return NextResponse.json({ ok: true, processed: leads.length, drafted, errors })
  } catch (err) {
    console.error('[marketing/pipeline/draft-only]', err)
    return NextResponse.json({ error: 'Draft-only pipeline run failed' }, { status: 500 })
  }
}
