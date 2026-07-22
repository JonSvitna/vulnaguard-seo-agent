import { NextRequest, NextResponse } from 'next/server'

import {
  approveAllDraftedWithEmail,
  approveClayBatch,
  approveSequenceIds,
} from '@/lib/marketing/batch-approval'

// Approve now means SEND. Clicking Approve marks the sequence approved, schedules
// touch 1 for immediate send + the follow-up touches on their configured delays,
// then fires the send batch right away so touch 1 goes out without waiting on the
// background scheduler. The old separate "Release" step is gone — it was the reason
// approved leads sat in an "Awaiting Release" bucket and never sent.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const hasSequenceIds = Array.isArray(body.sequence_ids)
    const hasBatchId = typeof body.batch_id === 'string' && body.batch_id.trim().length > 0
    const approveAll = body.all === true

    if (hasSequenceIds && hasBatchId) {
      return NextResponse.json(
        { error: 'Provide sequence_ids or batch_id, not both' },
        { status: 400 },
      )
    }

    if (approveAll && (hasSequenceIds || hasBatchId)) {
      return NextResponse.json(
        { error: 'Provide all, sequence_ids, or batch_id — not a combination' },
        { status: 400 },
      )
    }

    if (!approveAll && !hasSequenceIds && !hasBatchId) {
      return NextResponse.json(
        { error: 'sequence_ids, batch_id, or all is required' },
        { status: 400 },
      )
    }

    let result
    if (approveAll) {
      result = await approveAllDraftedWithEmail()
    } else if (hasBatchId) {
      result = await approveClayBatch(body.batch_id.trim())
    } else {
      const ids: number[] = body.sequence_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => Number.isInteger(id) && id > 0)
      if (!ids.length) {
        return NextResponse.json({ error: 'sequence_ids is required' }, { status: 400 })
      }
      result = await approveSequenceIds(ids)
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[marketing/approval/approve]', err)
    return NextResponse.json({ error: 'Failed to approve sequences' }, { status: 500 })
  }
}
