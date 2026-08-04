import fs from 'node:fs';
import path from 'node:path';

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const RUNNER_LABEL = /^[A-Za-z0-9_.-]+$/;
const IMAGE_DIGEST = /^[\w./:-]+@sha256:[a-f0-9]{64}$/;

export function validatePreflight(config) {
  requiredDirectory(config.root, 'Repository root');
  if (!RUNNER_LABEL.test(config.runnerLabel) || config.runnerLabel === 'self-hosted') {
    throw new Error('Runner label must be a dedicated GitHub label, never "self-hosted".');
  }
  for (const [name, value] of [
    ['Model secret', config.modelSecret],
    ['Hand-off secret', config.handoffSecret],
  ]) {
    if (!SECRET_NAME.test(value)) throw new Error(`${name} must be a GitHub Actions secret name.`);
  }
  if (!IMAGE_DIGEST.test(config.sandboxImage)) {
    throw new Error('Sandbox image must be pinned to a lowercase SHA-256 digest.');
  }
  for (const [name, value] of [
    ['Base URL', config.baseUrl],
    ['Reviewer model', config.reviewerModel],
    ['Low-complexity model', config.lowComplexityModel],
    ['High-complexity model', config.highComplexityModel],
  ]) {
    if (!value) throw new Error(`${name} is required.`);
  }
  try {
    const url = new URL(config.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('invalid URL');
    }
  } catch {
    throw new Error('Base URL must be an absolute HTTP(S) URL without credentials, query, or fragment.');
  }
}

export function validateInstalled(config) {
  validatePreflight(config);
  const reviewer = readWorkflow(config.root, 'shipyard-reviewer.yml');
  const coder = readWorkflow(config.root, 'shipyard-coder.yml');

  requireText(reviewer, `runs-on: ${config.runnerLabel}`, 'Reviewer must use the dedicated runner label.');
  requireText(coder, `runs-on: ${config.runnerLabel}`, 'Coder must use the dedicated runner label.');
  requireText(reviewer, 'uses: dymoo/shipyard@v3', 'Reviewer must use the Shipyard v3 action.');
  requireText(coder, 'uses: dymoo/shipyard/cloud-coder@v4', 'Coder must use the Shipyard v4 action.');
  requireText(
    reviewer,
    `api-key: \${{ secrets.${config.modelSecret} }}`,
    'Reviewer must use the configured model secret.',
  );
  requireText(coder, `api-key: \${{ secrets.${config.modelSecret} }}`, 'Coder must use the configured model secret.');
  requireText(
    reviewer,
    `handoff-token: \${{ secrets.${config.handoffSecret} }}`,
    'Reviewer must use the configured hand-off secret.',
  );
  requireText(
    coder,
    `handoff-token: \${{ secrets.${config.handoffSecret} }}`,
    'Coder must use the configured hand-off secret.',
  );
  requireText(reviewer, "vars.LLM_BASE_URL != ''", 'Reviewer must gate on its base URL Variable.');
  requireText(reviewer, "vars.LLM_MODEL != ''", 'Reviewer must gate on its model Variable.');
  requireText(coder, "vars.SHIPYARD_CODER_READY == 'true'", 'Coder must gate on explicit readiness.');
  requireText(coder, config.sandboxImage, 'Coder must use the configured digest-pinned image.');
  forbidText(reviewer, 'actions/checkout', 'Reviewer must never check out pull-request code.');
  forbidText(reviewer, /^\s*-\s+run:/m, 'Reviewer must not contain shell steps.');
  forbidText(`${reviewer}\n${coder}`, 'runs-on: self-hosted', 'Shipyard must not use the broad self-hosted label.');

  const agentsPath = path.join(config.root, 'AGENTS.md');
  if (!fs.existsSync(agentsPath) || !/^## Shipyard$/m.test(fs.readFileSync(agentsPath, 'utf8'))) {
    throw new Error('AGENTS.md must contain a Shipyard section.');
  }
}

function readWorkflow(root, name) {
  const filePath = path.join(root, '.github', 'workflows', name);
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${filePath}.`);
  return fs.readFileSync(filePath, 'utf8');
}

function requiredDirectory(value, name) {
  if (!value || !fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${name} does not exist.`);
  }
}

function requireText(text, value, message) {
  if (!text.includes(value)) throw new Error(message);
}

function forbidText(text, value, message) {
  if (typeof value === 'string' ? text.includes(value) : value.test(text)) throw new Error(message);
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || !value || values[key]) throw new Error('Use each --key value argument exactly once.');
    values[key] = value;
  }
  const mode = values['--mode'];
  if (!['preflight', 'installed'].includes(mode)) throw new Error('--mode must be preflight or installed.');
  const config = {
    root: values['--root'],
    runnerLabel: values['--runner-label'],
    modelSecret: values['--model-secret'],
    handoffSecret: values['--handoff-secret'],
    sandboxImage: values['--sandbox-image'],
    baseUrl: values['--base-url'],
    reviewerModel: values['--reviewer-model'],
    lowComplexityModel: values['--low-complexity-model'],
    highComplexityModel: values['--high-complexity-model'],
  };
  return { mode, config };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const { mode, config } = parseArguments(process.argv.slice(2));
  if (mode === 'preflight') validatePreflight(config);
  else validateInstalled(config);
  process.stdout.write(`Shipyard ${mode} validation passed.\n`);
}
