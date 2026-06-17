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
    const due = await query<DueEmail>(
      `SELECT e.id, e.sequence_id, e.lead_id, e.touch_number, e.subject, e.body, l.contact_email
       FROM emails e
       JOIN sequences s ON s.id = e.sequence_id
       JOIN leads l ON l.id = e.lead_id
       WHERE e.status = 'drafted'
         AND s.status = 'approved'
         AND e.scheduled_at <= NOW()
         AND l.contact_email IS NOT NULL
       ORDER BY e.scheduled_at ASC`
    )

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const email of due) {
      if (!email.subject || !email.body || !email.contact_email) {
        failed++
        continue
      }

      const result = await sendEmail({
        to: email.contact_email,
        subject: email.subject,
        body: email.body,
      })

      if (!result.ok) {
        failed++
        errors.push(`Email ${email.id}: ${result.error}`)
        continue
      }

      await query(
        `UPDATE emails SET status = 'sent', sent_at = NOW() WHERE id = $1`,
        [email.id]
      )

      const remaining = await query(
        `SELECT id FROM emails WHERE sequence_id = $1 AND status = 'drafted'`,
        [email.sequence_id]
      )
      if (!remaining.length) {
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
        JSON.stringify({ total: due.length, sent, failed, errors }),
      ]
    )

    return NextResponse.json({ ok: true, total: due.length, sent, failed, errors })
  } catch (err) {
    console.error('[marketing/send-queue/send-batch]', err)
    return NextResponse.json({ error: 'Batch send failed' }, { status: 500 })
  }
}
