import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdmissibleIssue, parseAgentBrief } from '../cloud-coder/src/config.js';

const BRIEF = `## Desired behaviour
Add the missing guard.

## Non-goals
Do not alter the public API.

## Acceptance checks
- Missing input returns a 400 response.

## Test command
npm test

## Complexity
3

## Risks
Avoid changing the response schema.`;

test('parses an AFK-ready Agent Brief with a bounded complexity score', () => {
  assert.deepEqual(parseAgentBrief(BRIEF), { complexity: 3, testCommand: 'npm test' });
});

test('rejects an incomplete Agent Brief before dispatch', () => {
  assert.throws(() => parseAgentBrief('## Desired behaviour\nDo a thing.'), /missing required section/i);
  assert.throws(() => parseAgentBrief(BRIEF.replace('\n3\n', '\n6\n')), /complexity/i);
  assert.throws(() => parseAgentBrief(BRIEF.replace('npm test', 'npm test\nrm -rf /')), /one non-empty line/i);
});

test('accepts only an open ready-for-agent Issue', () => {
  const issue = {
    state: 'open',
    labels: [{ name: 'ready-for-agent' }],
  };

  assert.doesNotThrow(() => assertAdmissibleIssue(issue));
  assert.throws(() => assertAdmissibleIssue({ ...issue, state: 'closed' }), /open Issue/i);
  assert.throws(() => assertAdmissibleIssue({ ...issue, labels: [] }), /ready-for-agent/i);
  assert.throws(() => assertAdmissibleIssue({ ...issue, pull_request: {} }), /Issue rather than a pull request/i);
});
