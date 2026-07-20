import test from 'node:test';
import assert from 'node:assert/strict';

import { selectCopywriterPrompt } from './index.ts';
import { COPYWRITER_PROMPTS } from './systemPrompts.ts';

test('selects systems automation copy without CMMC positioning', () => {
  const prompt = selectCopywriterPrompt('systems_automation');

  assert.match(prompt, /workflow|automation|system/i);
  assert.doesNotMatch(prompt, /CMMC|C3PAO|DoD contractor/i);
});

test('preserves existing prompt selection and CMMC fallback behavior', () => {
  for (const [businessLine, prompt] of Object.entries(COPYWRITER_PROMPTS)) {
    assert.equal(selectCopywriterPrompt(businessLine), prompt);
  }

  assert.equal(selectCopywriterPrompt(null), COPYWRITER_PROMPTS.cmmc);
  assert.equal(selectCopywriterPrompt('unknown'), COPYWRITER_PROMPTS.cmmc);
});
