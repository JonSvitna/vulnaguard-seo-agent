import { NextRequest, NextResponse } from 'next/server'

import { rejectClayBatch } from '@/lib/marketing/batch-approval'
import { isMarketingAutomationAuthorized } from '@/lib/marketing/service-auth'

interface RouteContext {
  params: Promise<{ batchId: string }>
}

interface RejectDependencies {
  automationSecret?: string
  rejectClayBatch: typeof rejectClayBatch
  onError?: (error: unknown) => void
}

const productionDependencies: RejectDependencies = {
  automationSecret: process.env.MARKETING_AUTOMATION_SECRET,
  rejectClayBatch,
  onError: (error) => console.error('[marketing/clay-batches/reject]', error),
}

function jsonResponse(body: object, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function handleClayBatchReject(
  request: Request,
  batchIdRaw: string,
  deps: RejectDependencies = productionDependencies,
): Promise<NextResponse> {
  if (!isMarketingAutomationAuthorized(request, deps.automationSecret)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }

  const batchId = decodeURIComponent(batchIdRaw ?? '').trim()
  if (!batchId) {
    return jsonResponse({ ok: false, error: 'batch_id is required' }, 400)
  }

  try {
    const result = await deps.rejectClayBatch(batchId)
    return jsonResponse(result, 200)
  } catch (error) {
    try {
      deps.onError?.(error)
    } catch {
      // Error reporting must not alter the stable automation response.
    }
    return jsonResponse({ ok: false, error: 'Failed to reject batch' }, 500)
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { batchId } = await context.params
  return handleClayBatchReject(request, batchId)
}
