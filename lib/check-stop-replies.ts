import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { postSlackMessage } from '@/lib/slack'
import { fetchMailSince } from '@/lib/ms365-graph'

const CURSOR_KEY = 'ms365_mail_cursor'
const STOP_RE = /\bstop\b/i

export interface CheckStopRepliesResult {
  ok: boolean
  checked: number
  unsubscribed: number
  errors: string[]
}

async function getCursor(): Promise<string> {
  const rows = await query<{ value: string }>(`SELECT value FROM agent_config WHERE key = $1`, [CURSOR_KEY])
  if (rows[0]?.value) return rows[0].value
  // First run: only look back 60 minutes so we don't reprocess mailbox history.
  return new Date(Date.now() - 60 * 60 * 1000).toISOString()
}

async function setCursor(iso: string): Promise<void> {
  await query(
    `INSERT INTO agent_config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [CURSOR_KEY, iso]
  )
}

// Polls the M365 mailbox that outbound outreach replies land in, and for any
// reply from a known lead whose body/subject contains "stop", suppresses that
// lead the same way the manual opt-out endpoint does. This is the automated
// backstop for CAN-SPAM's "Reply STOP to opt out" footer promise — without it,
// opt-outs only happen if a human notices the reply in time.
export async function checkStopReplies(): Promise<CheckStopRepliesResult> {
  if (!process.env.MS365_CLIENT_ID || !process.env.MS365_TENANT_ID || !process.env.MS365_CLIENT_SECRET || !process.env.MS365_USER_UPN) {
    return { ok: false, checked: 0, unsubscribed: 0, errors: ['MS365 credentials are not set — STOP-reply auto-detection is disabled'] }
  }

  const errors: string[] = []
  let unsubscribed = 0
  const since = await getCursor()
  let messages
  try {
    messages = await fetchMailSince(since)
  } catch (err) {
    return { ok: false, checked: 0, unsubscribed: 0, errors: [err instanceof Error ? err.message : 'mail fetch failed'] }
  }

  if (!messages.length) {
    return { ok: true, checked: 0, unsubscribed: 0, errors: [] }
  }

  for (const msg of messages) {
    const sender = msg.from?.emailAddress?.address?.toLowerCase().trim()
    if (!sender) continue

    const bodyMatches = STOP_RE.test(msg.subject ?? '') || STOP_RE.test(msg.bodyPreview ?? '')
    if (!bodyMatches) continue

    try {
      const leads = await query<{ id: number; company_name: string; status: string }>(
        `SELECT id, company_name, status FROM leads WHERE lower(contact_email) = $1`,
        [sender]
      )
      const lead = leads[0]
      if (!lead || lead.status === 'unsubscribed') continue

      await query(`UPDATE leads SET status = 'unsubscribed', updated_at = NOW() WHERE id = $1`, [lead.id])

      const ack = await sendEmail({
        to: sender,
        subject: 'Confirmed: removed from Vulnaguard outreach',
        body: "You've been removed from our outreach list and won't receive further emails from us. Sorry for the interruption.",
      })
      if (!ack.ok) errors.push(`Ack email to ${sender} failed: ${ack.error}`)

      await postSlackMessage(
        `:no_entry_sign: *STOP reply detected* — ${lead.company_name} (${sender}) replied "STOP" and was auto-removed from outreach.`
      )
      unsubscribed++
    } catch (err) {
      errors.push(`Lead lookup/update for ${sender} failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  const last = messages[messages.length - 1]
  const nextCursor = new Date(new Date(last.receivedDateTime).getTime() + 1000).toISOString()
  await setCursor(nextCursor)

  return { ok: true, checked: messages.length, unsubscribed, errors }
}
