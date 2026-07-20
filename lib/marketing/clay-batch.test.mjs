import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLAY_FIT_THRESHOLD,
  CLAY_SERVICE_TO_BUSINESS_LINE,
  normalizeClayLead,
} from './clay-batch.ts';

const validLead = {
  clay_row_id: ' row_123 ',
  batch_id: ' clay-2026-07-20 ',
  company_name: ' Acme Plumbing ',
  website: ' HTTPS://WWW.Acme.Example/services ',
  contact_name: ' Alex Smith ',
  email: ' Alex@Acme.Example ',
  fit_score: 84,
  fit_reason: ' Small local company with an outdated website. ',
  recommended_service: 'website_design',
};

test('normalizes a strong lead and returns only allow-listed fields', () => {
  const lead = normalizeClayLead({
    ...validLead,
    category: 'sales',
    business_line: 'cmmc',
    attacker_controlled: true,
  });

  assert.deepEqual(lead, {
    external_source_id: 'row_123',
    batch_id: 'clay-2026-07-20',
    company_name: 'Acme Plumbing',
    website: 'acme.example',
    contact_name: 'Alex Smith',
    contact_email: 'alex@acme.example',
    source: 'clay',
    source_detail: 'scheduled_clay_table',
    fit_score: 84,
    fit_reason: 'Small local company with an outdated website.',
    recommended_service: 'website_design',
    category: 'clay_leads',
    business_line: 'website_dev',
  });
});

test('maps every supported Clay service to an existing business line', () => {
  assert.deepEqual(CLAY_SERVICE_TO_BUSINESS_LINE, {
    cybersecurity: 'commercial_security',
    compliance_cmmc: 'cmmc',
    website_design: 'website_dev',
    systems_automation: 'systems_automation',
  });
  for (const [recommended_service, businessLine] of Object.entries(CLAY_SERVICE_TO_BUSINESS_LINE)) {
    assert.equal(normalizeClayLead({ ...validLead, recommended_service }).business_line, businessLine);
  }
});

test('rejects rows below the enrichment threshold', () => {
  assert.equal(CLAY_FIT_THRESHOLD, 70);
  assert.throws(
    () => normalizeClayLead({ ...validLead, fit_score: CLAY_FIT_THRESHOLD - 1 }),
    /fit score/i,
  );
});

test('rejects invalid scores and unsupported services', () => {
  for (const fit_score of [-1, 70.5, 101, '84']) {
    assert.throws(() => normalizeClayLead({ ...validLead, fit_score }), /fit score/i);
  }
  assert.throws(
    () => normalizeClayLead({ ...validLead, recommended_service: 'none' }),
    /recommended service/i,
  );
  for (const recommended_service of ['toString', 'constructor', '__proto__']) {
    assert.throws(
      () => normalizeClayLead({ ...validLead, recommended_service }),
      /recommended service/i,
    );
  }
});

test('rejects missing, whitespace-only, or malformed required values', () => {
  for (const field of ['clay_row_id', 'batch_id', 'company_name', 'fit_reason', 'website', 'email']) {
    assert.throws(() => normalizeClayLead({ ...validLead, [field]: '   ' }), new RegExp(field.replaceAll('_', ' '), 'i'));
  }
  assert.throws(() => normalizeClayLead({ ...validLead, email: 'not-an-email' }), /email/i);
  assert.throws(() => normalizeClayLead({ ...validLead, website: 'not a domain' }), /website/i);
});

test('rejects malformed DNS domains in email and website fields', () => {
  for (const email of [
    'user@-bad.example',
    'user@bad-.example',
    'user@bad..example',
    'user@bad_name.example',
    'user@example.com.',
    'user@127.0.0.1',
  ]) {
    assert.throws(() => normalizeClayLead({ ...validLead, email }), /email/i);
  }

  for (const website of [
    'https://-bad.example',
    'https://bad-.example',
    'https://bad..example',
    'https://bad_name.example',
    'https://example.com.',
    'http://127.0.0.1',
    'http://[::1]',
  ]) {
    assert.throws(() => normalizeClayLead({ ...validLead, website }), /website/i);
  }
});

test('rejects email local parts outside supported dot-atom syntax', () => {
  for (const email of [
    '.user@example.com',
    'user..name@example.com',
    'user.@example.com',
    'user()@example.com',
  ]) {
    assert.throws(() => normalizeClayLead({ ...validLead, email }), /email/i);
  }
});
