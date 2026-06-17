import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  try {
    const { to } = await req.json() as { to?: string }

    if (!to?.trim()) {
      return NextResponse.json({ error: 'to address is required' }, { status: 400 })
    }

    const result = await sendEmail({
      to: to.trim(),
      subject: 'Resend test — Vulnaguard SEO Agent',
      body: 'This is a test email confirming Resend is configured correctly for your Vulnaguard SEO Agent outreach pipeline.\n\nIf you received this, email sending is working.',
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 })
    }

    return NextResponse.json({ ok: true, id: result.id })
  } catch (err) {
    console.error('[marketing/test-email]', err)
    return NextResponse.json({ error: 'Failed to send test email' }, { status: 500 })
  }
}
