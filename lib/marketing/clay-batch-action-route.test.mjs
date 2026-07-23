import test from 'node:test'
import assert from 'node:assert/strict'

import { handleClayBatchApprove } from '../../app/api/marketing/clay-batches/[batchId]/approve/route.ts'
import { handleClayBatchReject } from '../../app/api/marketing/clay-batches/[batchId]/reject/route.ts'

const secret = 'test-automation-secret'
const BATCH_ID = 'clay-2026-07-20'

function request(authorization = `Bearer ${secret}`) {
  return new Request(`https://example.test/api/marketing/clay-batches/${BATCH_ID}/approve`, {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  })
}

test('approve rejects missing Authorization', async () => {
  const response = await handleClayBatchApprove(request(''), BATCH_ID, {
    automationSecret: secret,
    approveClayBatch: async () => {
      throw new Error('should not run')
    },
  })
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' })
})

test('approve rejects incorrect bearer', async () => {
  const response = await handleClayBatchApprove(request('Bearer wrong'), BATCH_ID, {
    automationSecret: secret,
    approveClayBatch: async () => {
      throw new Error('should not run')
    },
  })
  assert.equal(response.status, 401)
})

test('approve requires batch_id', async () => {
  const response = await handleClayBatchApprove(request(), '   ', {
    automationSecret: secret,
    approveClayBatch: async () => {
      throw new Error('should not run')
    },
  })
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { ok: false, error: 'batch_id is required' })
})

test('approve with valid bearer calls approveClayBatch and returns result', async () => {
  const calls = []
  const response = await handleClayBatchApprove(request(), BATCH_ID, {
    automationSecret: secret,
    approveClayBatch: async (batchId) => {
      calls.push(batchId)
      return { ok: true, approved: 2, sent: 1, failed: 0 }
    },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, approved: 2, sent: 1, failed: 0 })
  assert.deepEqual(calls, [BATCH_ID])
})

test('approve is idempotent on second call (zero approved)', async () => {
  let calls = 0
  const deps = {
    automationSecret: secret,
    approveClayBatch: async () => {
      calls += 1
      return calls === 1
        ? { ok: true, approved: 3, sent: 2, failed: 0 }
        : { ok: true, approved: 0, sent: 0, failed: 0, message: 'No drafted sequences to approve' }
    },
  }
  const first = await handleClayBatchApprove(request(), BATCH_ID, deps)
  const second = await handleClayBatchApprove(request(), BATCH_ID, deps)
  assert.equal((await first.json()).approved, 3)
  assert.equal((await second.json()).approved, 0)
  assert.equal(calls, 2)
})

test('approve does not leak internal errors', async () => {
  const response = await handleClayBatchApprove(request(), BATCH_ID, {
    automationSecret: secret,
    approveClayBatch: async () => {
      throw new Error('database connection string must not leak')
    },
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { ok: false, error: 'Failed to approve batch' })
})

test('reject rejects unauthorized', async () => {
  const response = await handleClayBatchReject(request('Bearer wrong'), BATCH_ID, {
    automationSecret: secret,
    rejectClayBatch: async () => {
      throw new Error('should not run')
    },
  })
  assert.equal(response.status, 401)
})

test('reject with valid bearer calls rejectClayBatch', async () => {
  const calls = []
  const response = await handleClayBatchReject(request(), encodeURIComponent(BATCH_ID), {
    automationSecret: secret,
    rejectClayBatch: async (batchId) => {
      calls.push(batchId)
      return { ok: true, rejected: 2, updated: 2 }
    },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, rejected: 2, updated: 2 })
  assert.deepEqual(calls, [BATCH_ID])
})

test('reject is idempotent on second call', async () => {
  let calls = 0
  const deps = {
    automationSecret: secret,
    rejectClayBatch: async () => {
      calls += 1
      return calls === 1
        ? { ok: true, rejected: 2, updated: 2 }
        : { ok: true, rejected: 0, updated: 0, message: 'No drafted sequences to reject' }
    },
  }
  const first = await handleClayBatchReject(request(), BATCH_ID, deps)
  const second = await handleClayBatchReject(request(), BATCH_ID, deps)
  assert.equal((await first.json()).rejected, 2)
  assert.equal((await second.json()).rejected, 0)
})
