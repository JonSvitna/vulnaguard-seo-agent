import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  const perPage = req.nextUrl.searchParams.get('per_page') || '5'

  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'PEXELS_API_KEY not set' }, { status: 500 })
  if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 })

  const res = await fetch(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`,
    { headers: { Authorization: apiKey } }
  )
  const data = await res.json()
  return NextResponse.json(data)
}
