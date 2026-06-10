import { NextRequest, NextResponse } from 'next/server'

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GSC_CLIENT_ID || '',
      client_secret: process.env.GSC_CLIENT_SECRET || '',
      refresh_token: process.env.GSC_REFRESH_TOKEN || '',
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token
}

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get('domain') || 'vulnaguard.com'
  const days = parseInt(req.nextUrl.searchParams.get('days') || '90')

  if (!process.env.GSC_CLIENT_ID) {
    // Return mock data if GSC not configured
    return NextResponse.json({
      mock: true,
      rows: [
        { keys: ['cmmc compliance software'], clicks: 12, impressions: 340, ctr: 0.035, position: 14.2 },
        { keys: ['cmmc level 2 checklist'], clicks: 8, impressions: 210, ctr: 0.038, position: 9.1 },
        { keys: ['cmmc continuous monitoring'], clicks: 3, impressions: 180, ctr: 0.017, position: 22.4 },
        { keys: ['vulnaguard sentinel'], clicks: 45, impressions: 89, ctr: 0.506, position: 2.1 },
        { keys: ['cmmc gap analysis tool'], clicks: 1, impressions: 95, ctr: 0.011, position: 31.7 },
      ],
    })
  }

  try {
    const token = await getAccessToken()
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain:${domain}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['query'],
          rowLimit: 100,
        }),
      }
    )
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'GSC error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
