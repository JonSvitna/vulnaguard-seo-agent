import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'

interface EmailRow extends Record<string, unknown> {
  id: number
  sequence_id: number
  lead_id: number
  touch_number: number
  subject: string | null
  body: string | null
  status: string
  contact_email: string | null
  company_name: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({})) as { manual?: boolean }
    const manual = body.manual === true

    const rows = await query<EmailRow>(
      `SELECT e.id, e.sequence_id, e.lead_id, e.touch_number, e.subject, e.body, e.status,
              l.contact_email, l.company_name
       FROM emails e
       JOIN leads l ON l.id = e.lead_id
       WHERE e.id = $1`,
      [id]
    )

    if (!rows.length) {
      return NextResponse.json({ error: 'Email not found' }, { status: 404 })
    }

    const email = rows[0]

    if (!email.subject || !email.body) {
      return NextResponse.json({ error: 'Email has no subject or body' }, { status: 400 })
    }

    if (!manual) {
      // Real Resend send
      if (!email.contact_email) {
        return NextResponse.json({ error: 'No email address on file — use manual mark for LinkedIn-only leads' }, { status: 400 })
      }

      const result = await sendEmail({
        to: email.contact_email,
        subject: email.subject,
        body: email.body,
      })

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 502 })
      }
    }

    // Mark as sent (both real send and manual)
    const updated = await query<{ sequence_id: number; lead_id: number }>(
      `UPDATE emails SET status = 'sent', sent_at = NOW() WHERE id = $1 RETURNING sequence_id, lead_id`,
      [id]
    )
    const { sequence_id, lead_id } = updated[0]

    const remaining = await query(
      `SELECT id FROM emails WHERE sequence_id = $1 AND status IN ('drafted', 'sending')`,
      [sequence_id]
    )

    if (!remaining.length) {
      await query(`UPDATE sequences SET status = 'sent' WHERE id = $1`, [sequence_id])
      await query(`UPDATE leads SET status = 'sent', updated_at = NOW() WHERE id = $1`, [lead_id])
    }

    return NextResponse.json({ ok: true, manual, sequence_completed: !remaining.length })
  } catch (err) {
    console.error('[marketing/emails/[id]/send]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
