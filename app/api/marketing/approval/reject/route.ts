import { NextRequest, NextResponse } from 'next/server'

import { rejectClayBatch, rejectSequenceIds } from '@/lib/marketing/batch-approval'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const hasSequenceIds = Array.isArray(body.sequence_ids)
    const hasBatchId = typeof body.batch_id === 'string' && body.batch_id.trim().length > 0

    if (hasSequenceIds && hasBatchId) {
      return NextResponse.json(
        { error: 'Provide sequence_ids or batch_id, not both' },
        { status: 400 },
      )
    }

    if (!hasSequenceIds && !hasBatchId) {
      return NextResponse.json(
        { error: 'sequence_ids or batch_id is required' },
        { status: 400 },
      )
    }

    let result
    if (hasBatchId) {
      result = await rejectClayBatch(body.batch_id.trim())
    } else {
      const ids: number[] = body.sequence_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)
      if (!ids.length) {
        return NextResponse.json({ error: 'sequence_ids is required' }, { status: 400 })
      }
      result = await rejectSequenceIds(ids)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[marketing/approval/reject]', err)
    return NextResponse.json({ error: 'Failed to reject sequences' }, { status: 500 })
  }
}
