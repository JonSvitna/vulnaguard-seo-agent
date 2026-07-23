import { NextRequest, NextResponse } from 'next/server'

import { approveClayBatch } from '@/lib/marketing/batch-approval'
import { isMarketingAutomationAuthorized } from '@/lib/marketing/service-auth'

interface RouteContext {
  params: Promise<{ batchId: string }>
}

interface ApproveDependencies {
  automationSecret?: string
  approveClayBatch: typeof approveClayBatch
  onError?: (error: unknown) => void
}

const productionDependencies: ApproveDependencies = {
  automationSecret: process.env.MARKETING_AUTOMATION_SECRET,
  approveClayBatch,
  onError: (error) => console.error('[marketing/clay-batches/approve]', error),
}

function jsonResponse(body: object, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function handleClayBatchApprove(
  request: Request,
  batchIdRaw: string,
  deps: ApproveDependencies = productionDependencies,
): Promise<NextResponse> {
  if (!isMarketingAutomationAuthorized(request, deps.automationSecret)) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }

  const batchId = decodeURIComponent(batchIdRaw ?? '').trim()
  if (!batchId) {
    return jsonResponse({ ok: false, error: 'batch_id is required' }, 400)
  }

  try {
    const result = await deps.approveClayBatch(batchId)
    return jsonResponse(result, 200)
  } catch (error) {
    try {
      deps.onError?.(error)
    } catch {
      // Error reporting must not alter the stable automation response.
    }
    return jsonResponse({ ok: false, error: 'Failed to approve batch' }, 500)
  }
}

export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const { batchId } = await context.params
  return handleClayBatchApprove(request, batchId)
}
