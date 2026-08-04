import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateInstalled, validatePreflight } from '../skills/setup-shipyard/validate.mjs';

const CONFIG = {
  runnerLabel: 'shipyard-runners',
  modelSecret: 'LLM_API_KEY',
  handoffSecret: 'SHIPYARD_HANDOFF_TOKEN',
  sandboxImage: 'registry.example/ci@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  baseUrl: 'https://provider.example/v1',
  reviewerModel: 'provider/reviewer',
  lowComplexityModel: 'provider/low',
  highComplexityModel: 'provider/high',
};

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
  assert.match(skill, /Confirm both\s+Coder and Reviewer use the confirmed dedicated runner\s+label/i);
  assert.match(skill, /Preserve unrelated jobs, steps, actions\s+and permissions unchanged/i);
  assert.match(skill, /stop and ask the maintainer to separate the\s+workflows first/i);
  assert.match(skill, /inside the Shipyard job/i);
  assert.match(skill, /use `gh secret list` to confirm both\s+names exist/i);
  assert.match(skill, /Clear\s+`SHIPYARD_CODER_READY` before either secret is removed or rotated/i);
  assert.match(skill, /validate\.mjs --mode preflight/);
  assert.match(skill, /validator again in `installed` mode/i);
  assert.match(skill, /Do not manufacture a test\s+Issue or apply `ready-for-agent`/i);
  assert.match(skill, /Merge this focused section into the target repository's root `AGENTS\.md`/);
});

test('the setup validator rejects unsafe inputs before workflow edits', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.doesNotThrow(() => validatePreflight({ root, ...CONFIG }));
  assert.throws(() => validatePreflight({ root, ...CONFIG, runnerLabel: 'self-hosted' }), /dedicated GitHub label/i);
  assert.throws(() => validatePreflight({ root, ...CONFIG, sandboxImage: 'node:20' }), /SHA-256 digest/i);
});

test('the setup validator accepts only a guarded installed factory', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-setup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workflowDirectory = path.join(root, '.github', 'workflows');
  fs.mkdirSync(workflowDirectory, { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '## Shipyard\n');
  fs.writeFileSync(
    path.join(workflowDirectory, 'shipyard-reviewer.yml'),
    `runs-on: ${CONFIG.runnerLabel}\nuses: dymoo/shipyard@v3\napi-key: \${{ secrets.${CONFIG.modelSecret} }}\nhandoff-token: \${{ secrets.${CONFIG.handoffSecret} }}\nvars.LLM_BASE_URL != ''\nvars.LLM_MODEL != ''\n`,
  );
  fs.writeFileSync(
    path.join(workflowDirectory, 'shipyard-coder.yml'),
    `runs-on: ${CONFIG.runnerLabel}\nuses: dymoo/shipyard/cloud-coder@v4\napi-key: \${{ secrets.${CONFIG.modelSecret} }}\nhandoff-token: \${{ secrets.${CONFIG.handoffSecret} }}\nvars.SHIPYARD_CODER_READY == 'true'\n${CONFIG.sandboxImage}\n`,
  );

  assert.doesNotThrow(() => validateInstalled({ root, ...CONFIG }));
  fs.appendFileSync(path.join(workflowDirectory, 'shipyard-reviewer.yml'), '- run: npm test\n');
  assert.throws(() => validateInstalled({ root, ...CONFIG }), /must not contain shell steps/i);
});
