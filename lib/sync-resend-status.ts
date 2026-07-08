import { Resend } from 'resend'
import { query } from '@/lib/db'
import { postSlackMessage } from '@/lib/slack'

export interface SyncResendStatusResult {
  ok: boolean
  checked: number
  delivered: number
  bounced: number
  errors: string[]
}

interface PendingEmail extends Record<string, unknown> {
  id: number
  resend_message_id: string
  company_name: string
  contact_email: string | null
}

// Resend's GET /emails/:id exposes `last_event` (e.g. "delivered", "bounced",
// "complained", "opened"). Polling avoids needing an inbound webhook
// configured in the Resend dashboard before this is useful.
export async function syncResendStatus(): Promise<SyncResendStatusResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, checked: 0, delivered: 0, bounced: 0, errors: ['RESEND_API_KEY is not set'] }
  }
  const resend = new Resend(apiKey)

  interface EmailWithLead extends PendingEmail {
    lead_id: number
  }

  const pending = await query<EmailWithLead>(
    `SELECT e.id, e.resend_message_id, e.lead_id, l.company_name, l.contact_email
     FROM emails e
     JOIN leads l ON l.id = e.lead_id
     WHERE e.status = 'sent' AND e.resend_message_id IS NOT NULL AND e.delivered_at IS NULL AND e.bounced_at IS NULL
     ORDER BY e.sent_at DESC
     LIMIT 100`
  )

  let delivered = 0
  let bounced = 0
  const errors: string[] = []

  for (const [i, email] of pending.entries()) {
    if (i > 0) await new Promise((resolve) => setTimeout(resolve, 250))

    try {
      const { data, error } = await resend.emails.get(email.resend_message_id)
      if (error || !data) {
        errors.push(`Email ${email.id}: ${error?.message ?? 'no data returned'}`)
        continue
      }

      const lastEvent = (data as { last_event?: string }).last_event

      if (lastEvent === 'delivered' || lastEvent === 'opened' || lastEvent === 'clicked') {
        await query(`UPDATE emails SET delivered_at = NOW() WHERE id = $1`, [email.id])
        delivered++
      } else if (lastEvent === 'bounced' || lastEvent === 'complained') {
        await query(
          `UPDATE emails SET bounced_at = NOW(), bounce_reason = $2 WHERE id = $1`,
          [email.id, lastEvent]
        )
        bounced++

        if (lastEvent === 'complained') {
          // A spam complaint must suppress all future touches immediately, not just log the one event.
          await query(`UPDATE leads SET status = 'unsubscribed', updated_at = NOW() WHERE id = $1`, [email.lead_id])
          await postSlackMessage(
            `:rotating_light: *Spam complaint* — ${email.company_name} (${email.contact_email}) marked complaint on a sent email. Lead auto-suppressed from further sends.`
          )
        } else {
          await postSlackMessage(
            `:x: *Bounce* — ${email.company_name} (${email.contact_email}) bounced.`
          )
        }
      }
    } catch (err) {
      errors.push(`Email ${email.id}: ${err instanceof Error ? err.message : 'sync failed'}`)
    }
  }

  return { ok: true, checked: pending.length, delivered, bounced, errors }
}
