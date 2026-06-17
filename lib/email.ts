import { Resend } from 'resend'
import { query } from './db'

export interface SendEmailParams {
  to: string
  subject: string
  body: string
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
}

async function getFromAddress(): Promise<string> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM agent_config WHERE key = 'smtp_from'`
  )
  return rows[0]?.value?.trim() || 'outreach@vulnaguard.com'
}

export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY is not set' }
  }

  const from = await getFromAddress()
  const resend = new Resend(apiKey)

  // Convert plain text body to minimal HTML (preserve line breaks)
  const html = `<pre style="font-family: inherit; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${params.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html,
    text: params.body,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Unknown Resend error' }
  }

  return { ok: true, id: data.id }
}
