import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('the setup skill requires Matt workflows before configuring Shipyard', () => {
  const skill = fs.readFileSync(new URL('../skills/setup-shipyard/SKILL.md', import.meta.url), 'utf8');

  for (const name of ['triage', 'wayfinder', 'to-spec', 'to-tickets', 'implement', 'tdd', 'code-review']) {
    assert.match(skill, new RegExp(`^${name}$`, 'm'));
  }
  assert.match(skill, /report the exact missing names and stop/i);
  assert.match(skill, /Do not imitate the\s+missing workflow/i);
});

test('the setup skill installs only explicit, guarded Shipyard contracts', () => {
  const skill = fs.readFileSync(new URL('../skills/setup-shipyard/SKILL.md', import.meta.url), 'utf8');

  assert.match(skill, /dymoo\/shipyard@v3/);
  assert.match(skill, /dymoo\/shipyard\/cloud-coder@v4/);
  assert.match(skill, /never fall back to the broad `self-hosted` label/i);
  assert.match(skill, /SHA-256 digest-pinned Docker image/i);
  assert.match(skill, /SHIPYARD_CODER_READY=false/);
  assert.match(skill, /Do not enable Coder.*SHIPYARD_CODER_READY=true/is);
  assert.match(skill, /Do not print, write, or request secret values/i);
  assert.match(skill, /replace\s+`secrets\.LLM_API_KEY` and\s+`secrets\.SHIPYARD_HANDOFF_TOKEN`/i);
  assert.match(skill, /same hand-off secret name/i);
  assert.match(skill, /Do not manufacture a test\s+Issue or apply `ready-for-agent`/i);
  assert.match(skill, /Merge this focused section into the target repository's root `AGENTS\.md`/);
});
