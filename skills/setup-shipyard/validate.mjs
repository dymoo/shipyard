import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;
const RUNNER_LABEL = /^[A-Za-z0-9_.-]+$/;
const IMAGE_DIGEST = /^[\w./:-]+@sha256:[a-f0-9]{64}$/;
const SKILL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const OPTIONS = new Set([
  '--mode',
  '--root',
  '--runner-label',
  '--model-secret',
  '--handoff-secret',
  '--sandbox-image',
  '--base-url',
  '--reviewer-model',
  '--low-complexity-model',
  '--high-complexity-model',
]);
const AGENTS_REQUIREMENTS = [
  '## Shipyard',
  'The local Codex or Claude Code session owns Matt Pocock planning skills',
  'Shipyard runs bounded Coder and independent Reviewer work in GitHub Actions; it never auto-merges.',
  'Apply `ready-for-agent` only to an open GitHub Issue with a complete Agent Brief:',
  'Coder requires a dedicated Docker-capable runner and a digest-pinned test image.',
];

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
  if (config.modelSecret === config.handoffSecret) {
    throw new Error('Model and hand-off secrets must use different names.');
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
  validateWorkflow(config, 'shipyard-reviewer.yml');
  validateWorkflow(config, 'shipyard-coder.yml');
  validateAgents(config.root);
}

function validateWorkflow(config, name) {
  const filePath = path.join(config.root, '.github', 'workflows', name);
  if (!fs.existsSync(filePath)) throw new Error(`Missing ${filePath}.`);
  const templatePath = path.join(SKILL_DIRECTORY, 'templates', name);
  const expected = configuredTemplate(fs.readFileSync(templatePath, 'utf8'), config);
  const actual = fs.readFileSync(filePath, 'utf8');
  if (normaliseNewlines(actual) !== normaliseNewlines(expected)) {
    throw new Error(`${name} must be the canonical Shipyard workflow with only configured substitutions.`);
  }
}

function requiredDirectory(value, name) {
  if (!value || !fs.statSync(value, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${name} does not exist.`);
  }
}

function configuredTemplate(template, config) {
  return template
    .replaceAll('shipyard-runners', config.runnerLabel)
    .replaceAll('secrets.LLM_API_KEY', `secrets.${config.modelSecret}`)
    .replaceAll('secrets.SHIPYARD_HANDOFF_TOKEN', `secrets.${config.handoffSecret}`)
    .replace('ghcr.io/acme/project-ci@sha256:replace-with-a-real-image-digest', config.sandboxImage);
}

function normaliseNewlines(value) {
  return value.replaceAll('\r\n', '\n');
}

function validateAgents(root) {
  const agentsPath = path.join(root, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) throw new Error('AGENTS.md must contain the Shipyard contract.');
  const agents = fs.readFileSync(agentsPath, 'utf8');
  if (!AGENTS_REQUIREMENTS.every((requirement) => agents.includes(requirement))) {
    throw new Error('AGENTS.md must contain the complete Shipyard contract.');
  }
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!OPTIONS.has(key) || !value || values[key])
      throw new Error('Use each documented --key value argument exactly once.');
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mode, config } = parseArguments(process.argv.slice(2));
  if (mode === 'preflight') validatePreflight(config);
  else validateInstalled(config);
  process.stdout.write(`Shipyard ${mode} validation passed.\n`);
}
