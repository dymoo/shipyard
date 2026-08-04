import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readIssueEvent } from '../cloud-coder/src/config.js';
import { createHandoffProof } from '../src/handoff.js';

function repairDispatch(overrides = {}) {
  const payload = { issue: 7, pull_request: 12, repair_round: 1, head_sha: 'headsha', ...overrides };
  return {
    action: 'shipyard-repair',
    client_payload: {
      ...payload,
      handoff_proof: createHandoffProof('handoff-secret', {
        direction: 'repair',
        owner: 'o',
        repo: 'r',
        issue: payload.issue,
        pull: payload.pull_request,
        repairRound: payload.repair_round,
        headSha: payload.head_sha,
      }),
    },
  };
}

test('Cloud Coder action declares the bounded implementation contract', () => {
  const action = fs.readFileSync(new URL('../cloud-coder/action.yml', import.meta.url), 'utf8');
  assert.match(action, /^name: Shipyard Cloud Coder$/m);
  assert.match(action, /sandbox-image:/);
  assert.match(action, /luna-model:/);
  assert.match(action, /terra-model:/);
  assert.match(action, /luna-reasoning-effort:/);
  assert.match(action, /terra-reasoning-effort:/);
  assert.match(action, /handoff-token:/);
  assert.match(action, /default: gpt-5\.6-luna/);
  assert.match(action, /default: gpt-5\.6-terra/);
  assert.match(action, /main: src\/index\.js/);
});

test('dispatches only when ready-for-agent labels an Issue', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-event-'));
  const eventPath = path.join(dir, 'event.json');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const previous = Object.fromEntries(
    ['GITHUB_REPOSITORY', 'GITHUB_EVENT_NAME', 'GITHUB_EVENT_PATH'].map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, {
    GITHUB_REPOSITORY: 'o/r',
    GITHUB_EVENT_NAME: 'issues',
    GITHUB_EVENT_PATH: eventPath,
  });
  fs.writeFileSync(
    eventPath,
    JSON.stringify({ action: 'labeled', label: { name: 'ready-for-agent' }, issue: { number: 7 } }),
  );
  assert.deepEqual(readIssueEvent('handoff-secret'), { owner: 'o', repo: 'r', issueNumber: 7 });

  fs.writeFileSync(eventPath, JSON.stringify({ action: 'labeled', label: { name: 'bug' }, issue: { number: 7 } }));
  assert.match(readIssueEvent('handoff-secret').skip, /ready-for-agent/i);

  process.env.GITHUB_EVENT_NAME = 'repository_dispatch';
  fs.writeFileSync(eventPath, JSON.stringify(repairDispatch()));
  assert.deepEqual(readIssueEvent('handoff-secret'), {
    owner: 'o',
    repo: 'r',
    issueNumber: 7,
    pullNumber: 12,
    repairRound: 1,
    headSha: 'headsha',
  });

  fs.writeFileSync(
    eventPath,
    JSON.stringify({
      ...repairDispatch(),
      client_payload: { ...repairDispatch().client_payload, handoff_proof: 'forged' },
    }),
  );
  assert.throws(() => readIssueEvent('handoff-secret'), /requires a valid hand-off token and proof/i);

  fs.writeFileSync(eventPath, JSON.stringify(repairDispatch({ repair_round: 2 })));
  assert.match(readIssueEvent('handoff-secret').skip, /expected Issue, PR, commit, and round/i);
});
