import { Resend } from 'resend'
import { query } from '@/lib/db'

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

  const pending = await query<PendingEmail>(
    `SELECT id, resend_message_id FROM emails
     WHERE status = 'sent' AND resend_message_id IS NOT NULL AND delivered_at IS NULL AND bounced_at IS NULL
     ORDER BY sent_at DESC
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
      }
    } catch (err) {
      errors.push(`Email ${email.id}: ${err instanceof Error ? err.message : 'sync failed'}`)
    }
  }

  return { ok: true, checked: pending.length, delivered, bounced, errors }
}
