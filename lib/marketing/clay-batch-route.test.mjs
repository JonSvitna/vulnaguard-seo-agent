import test from 'node:test'
import assert from 'node:assert/strict'

import { handleClayBatchPost } from '../../app/api/marketing/leads/clay-batch/route.ts'

const secret = 'test-automation-secret'

function validPayload(overrides = {}) {
  return {
    clay_row_id: 'clay-row-1',
    batch_id: 'batch-2026-07-19',
    company_name: 'Acme Defense',
    website: 'https://www.acme.example/about',
    contact_name: 'Ada Lovelace',
    title: 'CTO',
    email: 'ADA@ACME.EXAMPLE',
    location: 'Austin, TX',
    fit_score: 92,
    fit_reason: 'Strong commercial security fit',
    recommended_service: 'cybersecurity',
    ...overrides,
  }
}

function request(payload = validPayload(), authorization = `Bearer ${secret}`) {
  return new Request('https://example.test/api/marketing/leads/clay-batch', {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

function dependencies(options = {}) {
  const calls = []
  const deps = {
    automationSecret: secret,
    ensureSchema: async () => {},
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      if (options.queryError) throw new Error('database details must not leak')
      if (sql.includes('INSERT INTO leads')) return options.insertRows ?? [{ id: 41 }]
      if (sql.includes('SELECT id FROM leads')) return options.lookupRows ?? [{ id: 41 }]
      if (sql.includes('SELECT id FROM sequences')) return options.sequenceRows ?? [{ id: 501 }]
      return []
    },
    draftLeadIds: options.draftLeadIds ?? (async () => [{ leadId: 41, status: 'drafted' }]),
  }
  return { deps, calls }
}

test('a valid Clay row creates one lead, drafts it, and returns authoritative sequence IDs', async () => {
  const { deps, calls } = dependencies({ sequenceRows: [{ id: 501 }, { id: 502 }] })
  const response = await handleClayBatchPost(request(), deps)

  assert.equal(response.status, 201)
  assert.deepEqual(await response.json(), {
    ok: true,
    created: true,
    lead_id: 41,
    batch_id: 'batch-2026-07-19',
    sequence_ids: [501, 502],
  })
  const insert = calls.find(({ sql }) => sql.includes('INSERT INTO leads'))
  assert.match(insert.sql, /ON CONFLICT \(source, external_source_id\)/)
  assert.deepEqual(insert.params, [
    'Acme Defense', 'acme.example', 'Austin, TX', 'Ada Lovelace', 'CTO', 'ada@acme.example',
    'clay', 'scheduled_clay_table', 'clay-row-1', 'discovered', 92,
    'Strong commercial security fit', 'clay_leads', 'commercial_security',
    'batch-2026-07-19', 92, 'Strong commercial security fit', 'cybersecurity',
  ])
})

test('a replay looks up the existing lead, accepts already-drafted, and does not claim creation', async () => {
  let draftedIds
  const { deps, calls } = dependencies({
    insertRows: [],
    lookupRows: [{ id: 77 }],
    sequenceRows: [{ id: 601 }],
    draftLeadIds: async (ids) => {
      draftedIds = ids
      return [{ leadId: 77, status: 'skipped', reason: 'already_drafted' }]
    },
  })
  const response = await handleClayBatchPost(request(), deps)

  assert.equal(response.status, 200)
  assert.deepEqual(draftedIds, [77])
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO leads')).length, 1)
  assert.deepEqual(await response.json(), {
    ok: true,
    created: false,
    lead_id: 77,
    batch_id: 'batch-2026-07-19',
    sequence_ids: [601],
  })
})

for (const [name, override] of [
  ['unsupported service', { recommended_service: 'tax_consulting' }],
  ['malformed email', { email: 'not-an-email' }],
  ['malformed domain', { website: 'invalid_domain' }],
  ['score below threshold', { fit_score: 69 }],
]) {
  test(`${name} returns 400 without touching the database`, async () => {
    const { deps, calls } = dependencies()
    const response = await handleClayBatchPost(request(validPayload(override)), deps)
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { ok: false, error: 'invalid_payload' })
    assert.equal(calls.length, 0)
  })
}

test('database failure returns a stable retryable 500', async () => {
  const { deps } = dependencies({ queryError: true })
  const response = await handleClayBatchPost(request(), deps)
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { ok: false, error: 'intake_failed', retryable: true })
})

test('draft failure and retryable draft skips return retryable 500 without false success', async () => {
  for (const result of [
    { leadId: 41, status: 'failed', reason: 'draft_generation_failed' },
    { leadId: 41, status: 'skipped', reason: 'lead_changed_retry' },
  ]) {
    const { deps } = dependencies({ draftLeadIds: async () => [result] })
    const response = await handleClayBatchPost(request(), deps)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, error: 'draft_failed', retryable: true })
  }
})

test('rejects unauthenticated requests before parsing or database access', async () => {
  const { deps, calls } = dependencies()
  const response = await handleClayBatchPost(request(validPayload(), 'Bearer wrong'), deps)
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { ok: false, error: 'unauthorized' })
  assert.equal(calls.length, 0)
})

test('malformed JSON returns 400', async () => {
  const { deps, calls } = dependencies()
  const malformed = new Request('https://example.test/api/marketing/leads/clay-batch', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: '{',
  })
  const response = await handleClayBatchPost(malformed, deps)
  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { ok: false, error: 'invalid_payload' })
  assert.equal(calls.length, 0)
})
