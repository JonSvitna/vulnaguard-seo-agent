import { NextRequest, NextResponse } from 'next/server'
import { query, ensureSchema } from '@/lib/db'
import { draftLeadIds, summarizeDraftLeadResults } from '@/lib/marketing/draft-leads'
import type { OutreachLead } from '@/vulnaguard-marketing-agents/agents/outreach/types'

// For business lines with no qualifier rubric yet (anything besides 'cmmc'),
// leads sit at status='discovered' forever per the qualify gate in
// import-confirm/route.ts. This drafts them directly, skipping the score
// threshold, since sourcing already filtered for fit.
export async function POST(req: NextRequest) {
  try {
    await ensureSchema()
    const body = await req.json().catch(() => ({}))
    const businessLine: string = body.business_line ?? 'website_dev'
    const limit: number = Number(body.limit) || 100

    // Email-only outreach: demote any no-email discovered leads out of the pipeline
    // first, then draft only the ones we can actually contact.
    await query(
      `UPDATE leads SET status = 'no_email', updated_at = NOW()
       WHERE status = 'discovered' AND business_line = $1 AND NULLIF(TRIM(contact_email), '') IS NULL`,
      [businessLine]
    )

    const leads = await query<OutreachLead>(
      `SELECT * FROM leads WHERE status = 'discovered' AND business_line = $1
         AND NULLIF(TRIM(contact_email), '') IS NOT NULL
       ORDER BY created_at ASC LIMIT $2`,
      [businessLine, limit]
    )

    if (!leads.length) {
      return NextResponse.json({ ok: true, message: 'No discovered leads for this business line', processed: 0 })
    }

    const results = await draftLeadIds(leads.map((lead) => lead.id))
    const { drafted, errors, skipped, skipped_reasons } = summarizeDraftLeadResults(results)

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('draft_only', $1, $2, $3, NOW())`,
      [
        errors === 0 ? 'success' : 'error',
        leads.length,
        JSON.stringify({ business_line: businessLine, drafted, errors, skipped, skipped_reasons }),
      ]
    )

    return NextResponse.json({ ok: true, processed: leads.length, drafted, errors, skipped, skipped_reasons })
  } catch (err) {
    console.error('[marketing/pipeline/draft-only]', err)
    return NextResponse.json({ error: 'Draft-only pipeline run failed' }, { status: 500 })
  }
}
