import { NextRequest, NextResponse } from 'next/server'

import { getClayBatchSummary, productionDependencies } from '@/lib/marketing/batch-approval'
import { buildClaySlackMessage } from '@/lib/marketing/clay-slack'
import { isMarketingAutomationAuthorized } from '@/lib/marketing/service-auth'

interface RouteContext {
  params: Promise<{ batchId: string }>
}

export async function GET(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  if (!isMarketingAutomationAuthorized(request, process.env.MARKETING_AUTOMATION_SECRET)) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { batchId: rawBatchId } = await context.params
  const batchId = decodeURIComponent(rawBatchId ?? '').trim()
  if (!batchId) {
    return NextResponse.json(
      { ok: false, error: 'batch_id is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const summary = await getClayBatchSummary(batchId, productionDependencies)
    return NextResponse.json(
      {
        ...summary,
        slack_message: buildClaySlackMessage(summary),
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch (error) {
    console.error('[marketing/clay-batches]', error)
    return NextResponse.json(
      { ok: false, error: 'Failed to load batch summary' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
