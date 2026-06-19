import { NextRequest, NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) {
    return NextResponse.json({ error: 'url query param is required' }, { status: 400 })
  }

  let target = url
  if (!/^https?:\/\//.test(target)) target = `https://${target}`

  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VulnaguardSEOAuditor/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed with status ${res.status}` }, { status: 502 })
    }
    const html = await res.text()
    const $ = cheerio.load(html)

    const title = $('title').first().text().trim() || null
    const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null
    const h1 = $('h1').map((_, el) => $(el).text().trim()).get().filter(Boolean)
    const h2 = $('h2').map((_, el) => $(el).text().trim()).get().filter(Boolean)

    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    const wordCount = bodyText ? bodyText.split(' ').length : 0

    const schemaBlocks = $('script[type="application/ld+json"]')
      .map((_, el) => {
        try {
          const parsed = JSON.parse($(el).text())
          return parsed['@type'] ?? (Array.isArray(parsed) ? parsed.map(p => p['@type']).join(',') : null)
        } catch {
          return 'invalid-json'
        }
      })
      .get()
      .filter(Boolean)

    const hostname = new URL(target).hostname
    let internalLinks = 0
    let externalLinks = 0
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || ''
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      if (href.startsWith('/') || href.includes(hostname)) internalLinks++
      else if (/^https?:\/\//.test(href)) externalLinks++
    })

    const images = $('img')
    const imagesTotal = images.length
    const imagesMissingAlt = images.filter((_, el) => !$(el).attr('alt')?.trim()).length

    const canonical = $('link[rel="canonical"]').attr('href') || null
    const ogTitle = $('meta[property="og:title"]').attr('content') || null
    const ogDescription = $('meta[property="og:description"]').attr('content') || null

    return NextResponse.json({
      url: target,
      title,
      titleLength: title?.length ?? 0,
      metaDescription,
      metaDescriptionLength: metaDescription?.length ?? 0,
      h1,
      h1Count: h1.length,
      h2,
      h2Count: h2.length,
      wordCount,
      schemaTypesFound: schemaBlocks,
      internalLinks,
      externalLinks,
      imagesTotal,
      imagesMissingAlt,
      canonical,
      ogTitle,
      ogDescription,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Audit fetch failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
