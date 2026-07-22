import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pagePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../app/(app)/dashboard/marketing-agents/page.tsx',
);

const source = readFileSync(pagePath, 'utf8');

test('marketing dashboard exposes Clay Leads category label', () => {
  assert.match(source, /clay_leads:\s*["']Clay Leads["']/);
  assert.match(source, /["']clay_leads["']/);
});

test('pending fetch passes category and batch_id from URL search params', () => {
  assert.match(source, /useSearchParams/);
  assert.match(source, /searchParams\.get\(\s*["']category["']\s*\)/);
  assert.match(source, /searchParams\.get\(\s*["']batch_id["']\s*\)/);
  assert.match(source, /params\.set\(\s*["']category["']/);
  assert.match(source, /params\.set\(\s*["']batch_id["']/);
  assert.match(source, /\/api\/marketing\/approval\/pending/);
});

test('Clay approval cards surface fit score, service, reason, website, and batch id', () => {
  assert.match(source, /fit_score/);
  assert.match(source, /recommended_service/);
  assert.match(source, /fit_reason/);
  assert.match(source, /seq\.website|website/);
  assert.match(source, /batch_id/);
});

test('batch approve and reject post batch_id payloads to existing endpoints', () => {
  assert.match(
    source,
    /\/api\/marketing\/approval\/approve[\s\S]*?batch_id/,
  );
  assert.match(
    source,
    /\/api\/marketing\/approval\/reject[\s\S]*?batch_id/,
  );
  assert.match(source, /JSON\.stringify\(\s*\{\s*batch_id/);
  // Individual sequence approval must remain available.
  assert.match(source, /sequence_ids:\s*\[id\]/);
  assert.match(source, /sequence_ids:\s*ids/);
});
