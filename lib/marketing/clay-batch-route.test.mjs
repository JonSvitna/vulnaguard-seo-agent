import test from 'node:test'
import assert from 'node:assert/strict'

import { handleClayBatchPost } from '../../app/api/marketing/leads/clay-batch/route.ts'
import { draftLeadIds } from './draft-leads.ts'

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
  const errors = []
  const deps = {
    automationSecret: secret,
    ensureSchema: async () => {},
    query: async (sql, params = []) => {
      calls.push({ sql, params })
      if (options.queryError) throw new Error('database details must not leak')
      if (sql.includes('INSERT INTO leads')) return options.insertRows ?? [{ id: 41 }]
      if (sql.includes('SELECT id, batch_id FROM leads') || sql.includes('SELECT id FROM leads')) {
        return options.lookupRows ?? [{ id: 41, batch_id: 'batch-2026-07-19' }]
      }
      if (sql.includes('SELECT id FROM sequences')) return options.sequenceRows ?? [{ id: 501 }]
      return []
    },
    draftLeadIds: options.draftLeadIds ?? (async () => [{ leadId: 41, status: 'drafted' }]),
    onError: (error) => { errors.push(error) },
  }
  return { deps, calls, errors }
}

function statefulDependencies() {
  const state = { leads: [], sequences: [], emails: [], linkedin: [] }
  let nextLeadId = 40
  let nextSequenceId = 500
  let insertGate = Promise.resolve()

  function makeQuery(target) {
    return async (sql, params = []) => {
      if (sql.includes('INSERT INTO leads')) {
        const run = insertGate.then(async () => {
          const existing = target.leads.find(
            (lead) => lead.source === params[6] && lead.external_source_id === params[8],
          )
          if (existing) return []
          const lead = {
            id: ++nextLeadId,
            company_name: params[0],
            website: params[1],
            location: params[2],
            contact_name: params[3],
            contact_title: params[4],
            contact_email: params[5],
            source: params[6],
            source_detail: params[7],
            external_source_id: params[8],
            status: params[9],
            score: params[10],
            score_reason: params[11],
            category: params[12],
            business_line: params[13],
            batch_id: params[14],
            fit_score: params[15],
            fit_reason: params[16],
            recommended_service: params[17],
          }
          target.leads.push(lead)
          return [{ id: lead.id }]
        })
        insertGate = run.then(() => undefined, () => undefined)
        return run
      }
      if (sql.includes('SELECT id, batch_id FROM leads') || sql.includes('SELECT id FROM leads')) {
        const lead = target.leads.find(
          (item) => item.source === params[0] && item.external_source_id === params[1],
        )
        return lead ? [{ id: lead.id, batch_id: lead.batch_id }] : []
      }
      if (sql.includes('SELECT id FROM sequences')) {
        return target.sequences
          .filter((sequence) => sequence.lead_id === params[0])
          .sort((a, b) => a.id - b.id)
          .map(({ id }) => ({ id }))
      }
      if (sql.includes('SELECT * FROM leads') && sql.includes('ANY')) {
        return target.leads
          .filter((lead) => params[0].includes(lead.id))
          .map((lead) => structuredClone(lead))
      }
      if (sql.includes('SELECT * FROM leads') && sql.includes('FOR UPDATE')) {
        const lead = target.leads.find((item) => item.id === params[0])
        return lead ? [structuredClone(lead)] : []
      }
      if (sql.includes('DELETE FROM sequences')) {
        const removedIds = target.sequences
          .filter((sequence) => sequence.lead_id === params[0])
          .map((sequence) => sequence.id)
        target.sequences = target.sequences.filter((sequence) => sequence.lead_id !== params[0])
        target.emails = target.emails.filter((email) => !removedIds.includes(email.sequence_id))
        target.linkedin = target.linkedin.filter((message) => !removedIds.includes(message.sequence_id))
        return []
      }
      if (sql.includes('INSERT INTO sequences')) {
        const sequence = { id: ++nextSequenceId, lead_id: params[0], status: 'drafted' }
        target.sequences.push(sequence)
        return [{ id: sequence.id }]
      }
      if (sql.includes('INSERT INTO emails')) {
        target.emails.push({ sequence_id: params[0], lead_id: params[1], touch_number: params[2] })
        return []
      }
      if (sql.includes('INSERT INTO linkedin_messages')) {
        target.linkedin.push({ sequence_id: params[0], lead_id: params[1] })
        return []
      }
      if (sql.includes("UPDATE leads SET status = 'drafted'")) {
        const lead = target.leads.find((item) => item.id === params[0])
        if (lead?.status === 'discovered') lead.status = 'drafted'
        return []
      }
      return []
    }
  }

  const draftDependencies = {
    query: makeQuery(state),
    transaction: async (work) => {
      const pending = structuredClone(state)
      const result = await work(makeQuery(pending))
      Object.assign(state, pending)
      return result
    },
    draftSequence: async () => ({
      emails: [{ touch_number: 1, subject: 'Hello', body: 'Body' }],
      linkedin_message: '',
    }),
  }
  let draftGate = Promise.resolve()
  return {
    state,
    deps: {
      automationSecret: secret,
      ensureSchema: async () => {},
      query: makeQuery(state),
      // Serialize drafting the way production SELECT ... FOR UPDATE does under load.
      draftLeadIds: (leadIds) => {
        const run = draftGate.then(() => draftLeadIds(leadIds, draftDependencies))
        draftGate = run.then(() => undefined, () => undefined)
        return run
      },
    },
  }
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

test('an identical replay uses the existing drafted lead and preserves its single sequence', async () => {
  const { deps, state } = statefulDependencies()

  const firstResponse = await handleClayBatchPost(request(), deps)
  assert.equal(firstResponse.status, 201)
  assert.deepEqual(await firstResponse.json(), {
    ok: true,
    created: true,
    lead_id: 41,
    batch_id: 'batch-2026-07-19',
    sequence_ids: [501],
  })

  const secondResponse = await handleClayBatchPost(request(), deps)
  assert.equal(secondResponse.status, 200)
  assert.deepEqual(await secondResponse.json(), {
    ok: true,
    created: false,
    lead_id: 41,
    batch_id: 'batch-2026-07-19',
    sequence_ids: [501],
  })
  assert.equal(state.leads.length, 1)
  assert.equal(state.leads[0].status, 'drafted')
  assert.deepEqual(state.sequences, [{ id: 501, lead_id: 41, status: 'drafted' }])
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
    const { deps, errors } = dependencies({ draftLeadIds: async () => [result] })
    const response = await handleClayBatchPost(request(), deps)
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { ok: false, error: 'draft_failed', retryable: true })
    assert.equal(errors.length, 1)
    assert.equal(errors[0].stage, 'draft')
    assert.equal(errors[0].lead_id, 41)
    assert.equal(errors[0].draft_status, result.status)
  }
})

test('replay returns the stored batch_id (first-write-wins), not a later incoming batch', async () => {
  const { deps, state } = statefulDependencies()

  const first = await handleClayBatchPost(request(validPayload({ batch_id: 'batch-original' })), deps)
  assert.equal(first.status, 201)
  assert.equal((await first.json()).batch_id, 'batch-original')

  const replay = await handleClayBatchPost(
    request(validPayload({ batch_id: 'batch-different' })),
    deps,
  )
  assert.equal(replay.status, 200)
  assert.deepEqual(await replay.json(), {
    ok: true,
    created: false,
    lead_id: 41,
    batch_id: 'batch-original',
    sequence_ids: [501],
  })
  assert.equal(state.leads[0].batch_id, 'batch-original')
})

test('concurrent duplicate intakes produce one lead and one sequence', async () => {
  const { deps, state } = statefulDependencies()
  const [first, second] = await Promise.all([
    handleClayBatchPost(request(), deps),
    handleClayBatchPost(request(), deps),
  ])

  const bodies = await Promise.all([first.json(), second.json()])
  const statuses = [first.status, second.status].sort()
  assert.deepEqual(statuses, [200, 201])
  assert.equal(state.leads.length, 1)
  assert.equal(state.sequences.length, 1)
  assert.equal(new Set(bodies.map((body) => body.lead_id)).size, 1)
  assert.ok(bodies.every((body) => body.ok === true))
  assert.deepEqual(
    bodies.map((body) => body.sequence_ids).sort((a, b) => a[0] - b[0]),
    [[state.sequences[0].id], [state.sequences[0].id]],
  )
})

test('success responses set Cache-Control: no-store', async () => {
  const { deps } = dependencies()
  const response = await handleClayBatchPost(request(), deps)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
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
