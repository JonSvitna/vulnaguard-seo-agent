import test from 'node:test'
import assert from 'node:assert/strict'

import { constantTimeEqual, isMarketingAutomationAuthorized } from './service-auth.ts'

const secret = 'test-automation-secret'

function request(authorization) {
  const headers = new Headers()
  if (authorization !== undefined) headers.set('authorization', authorization)
  return new Request('https://example.test/api', { headers })
}

test('rejects a missing Authorization header', () => {
  assert.equal(isMarketingAutomationAuthorized(request(), secret), false)
})

test('rejects a malformed Authorization header', () => {
  assert.equal(isMarketingAutomationAuthorized(request(secret), secret), false)
  assert.equal(isMarketingAutomationAuthorized(request(`Basic ${secret}`), secret), false)
  assert.equal(isMarketingAutomationAuthorized(request(`Bearer  ${secret}`), secret), false)
})

test('rejects an incorrect bearer secret, including a different length', () => {
  assert.equal(isMarketingAutomationAuthorized(request('Bearer incorrect'), secret), false)
  assert.equal(isMarketingAutomationAuthorized(request(`Bearer ${secret}x`), secret), false)
})

test('executes the constant-time comparator for unequal-length values', () => {
  let comparisons = 0
  const comparator = (left, right) => {
    comparisons++
    assert.equal(left.byteLength, right.byteLength)
    return true
  }

  assert.equal(constantTimeEqual('short', 'a-longer-secret', comparator), false)
  assert.equal(comparisons, 1)
})

test('accepts MARKETING_AUTOMATION_SECRET from the environment', () => {
  const previous = process.env.MARKETING_AUTOMATION_SECRET
  process.env.MARKETING_AUTOMATION_SECRET = secret
  try {
    assert.equal(isMarketingAutomationAuthorized(request(`Bearer ${secret}`)), true)
  } finally {
    if (previous === undefined) delete process.env.MARKETING_AUTOMATION_SECRET
    else process.env.MARKETING_AUTOMATION_SECRET = previous
  }
})

test('fails closed when the configured secret is absent or empty', () => {
  assert.equal(isMarketingAutomationAuthorized(request(`Bearer ${secret}`), undefined), false)
  assert.equal(isMarketingAutomationAuthorized(request(`Bearer ${secret}`), ''), false)
  assert.equal(isMarketingAutomationAuthorized(request(`Bearer ${secret}`), '   '), false)
})
