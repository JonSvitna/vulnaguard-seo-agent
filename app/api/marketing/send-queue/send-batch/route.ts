import { NextResponse } from 'next/server'
import { runSendBatch } from '@/lib/send-batch'

export async function POST() {
  try {
    const result = await runSendBatch()
    return NextResponse.json(result)
  } catch (err) {
    console.error('[marketing/send-queue/send-batch]', err)
    return NextResponse.json({ error: 'Batch send failed' }, { status: 500 })
  }
}
