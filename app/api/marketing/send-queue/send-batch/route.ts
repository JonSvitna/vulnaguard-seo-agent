import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'

interface DueEmail extends Record<string, unknown> {
  id: number
  sequence_id: number
  lead_id: number
  touch_number: number
  subject: string | null
  body: string | null
  contact_email: string | null
}

export async function POST() {
  try {
    // Read daily send limit
    const configRows = await query<{ value: string }>(
      `SELECT value FROM agent_config WHERE key = 'daily_send_limit'`
    )
    const dailyLimit = Number(configRows[0]?.value) || 50

    // Count emails already sent today
    const sentTodayRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM emails WHERE sent_at >= CURRENT_DATE`
    )
    const sentToday = Number(sentTodayRows[0]?.count) || 0
    const remaining = Math.max(0, dailyLimit - sentToday)

    if (remaining === 0) {
      return NextResponse.json({
        ok: true, total: 0, sent: 0, failed: 0, skipped_linkedin: 0,
        capped: true, message: `Daily limit of ${dailyLimit} already reached (${sentToday} sent today)`,
      })
    }

    // Atomically claim emails — UPDATE to 'sending' WHERE still 'drafted' prevents double-send
    // under concurrent batch calls. Only email-addressable leads are claimed for sending.
    const claimed = await query<DueEmail>(
      `UPDATE emails SET status = 'sending'
       WHERE id IN (
         SELECT e.id FROM emails e
         JOIN sequences s ON s.id = e.sequence_id
         JOIN leads l ON l.id = e.lead_id
         WHERE e.status = 'drafted'
           AND s.status = 'approved'
           AND e.scheduled_at <= NOW()
           AND l.contact_email IS NOT NULL
         ORDER BY e.scheduled_at ASC
         LIMIT $1
       )
       RETURNING id, sequence_id, lead_id, touch_number, subject, body,
                 (SELECT l.contact_email FROM leads l WHERE l.id = lead_id) AS contact_email`,
      [remaining]
    )

    // Count LinkedIn-only leads that are due but skipped (no email address)
    const linkedinRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM emails e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN leads l ON l.id = e.lead_id
       WHERE e.status = 'drafted'
         AND s.status = 'approved'
         AND e.scheduled_at <= NOW()
         AND l.contact_email IS NULL`
    )
    const skipped_linkedin = Number(linkedinRows[0]?.count) || 0

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const email of claimed) {
      if (!email.subject || !email.body || !email.contact_email) {
        // Reset back to drafted so it can be retried
        await query(`UPDATE emails SET status = 'drafted' WHERE id = $1`, [email.id])
        failed++
        continue
      }

      const result = await sendEmail({
        to: email.contact_email,
        subject: email.subject,
        body: email.body,
      })

      if (!result.ok) {
        await query(`UPDATE emails SET status = 'drafted' WHERE id = $1`, [email.id])
        failed++
        errors.push(`Email ${email.id}: ${result.error}`)
        continue
      }

      await query(
        `UPDATE emails SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [email.id]
      )

      const remaining_in_seq = await query(
        `SELECT id FROM emails WHERE sequence_id = $1 AND status IN ('drafted', 'sending')`,
        [email.sequence_id]
      )
      if (!remaining_in_seq.length) {
        await query(`UPDATE sequences SET status = 'sent' WHERE id = $1`, [email.sequence_id])
        await query(`UPDATE leads SET status = 'sent', updated_at = NOW() WHERE id = $1`, [email.lead_id])
      }

      sent++
    }

    await query(
      `INSERT INTO pipeline_runs (agent, status, leads_processed, details, finished_at)
       VALUES ('send_batch', $1, $2, $3, NOW())`,
      [
        failed === 0 ? 'success' : 'error',
        sent,
        JSON.stringify({ total: claimed.length, sent, failed, skipped_linkedin, errors, daily_limit: dailyLimit, sent_today: sentToday + sent }),
      ]
    )

    return NextResponse.json({
      ok: true,
      total: claimed.length,
      sent,
      failed,
      skipped_linkedin,
      capped: false,
      remaining_today: remaining - sent,
      errors,
    })
  } catch (err) {
    console.error('[marketing/send-queue/send-batch]', err)
    return NextResponse.json({ error: 'Batch send failed' }, { status: 500 })
  }
}
