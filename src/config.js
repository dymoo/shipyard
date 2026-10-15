import fs from 'node:fs';
import * as core from './core.js';
import { verifiesHandoffProof } from './handoff.js';

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];
export const VERDICT_REAL = 'real';
export const VERDICT_NOT_REAL = 'not_real';
export const BOT_SIGNATURE = '<!-- shipyard:bot -->';

/** Lower rank is more severe. */
export const severityRank = (severity) => {
  const rank = SEVERITIES.indexOf(String(severity || '').toLowerCase());
  return rank === -1 ? SEVERITIES.indexOf('low') : rank;
};

export const DEFAULT_IGNORES = [
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/bun.lock',
  '**/bun.lockb',
  '**/Cargo.lock',
  '**/composer.lock',
  '**/Gemfile.lock',
  '**/poetry.lock',
  '**/uv.lock',
  '**/go.sum',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/*.snap',
  '**/__snapshots__/**',
  '**/dist/**',
  '**/build/**',
  '**/node_modules/**',
  '**/vendor/**',
  '**/.yarn/**',
  '**/*.pb.go',
  '**/*_pb2.py',
  '**/*_pb2.pyi',
  '**/*.pb.cc',
  '**/*.pb.h',
  '**/*.generated.*',
  '**/generated/**',
  '**/*.svg',
];

const TRIGGER_PHRASE = '@shipyard';
const ALLOWED_ASSOCIATIONS = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const VALID_REASONING_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * Fixed product limits. Lookup count, request deadline and the file cap are
 * action inputs, because a large pull request has to raise those three
 * together. The rest stay constants: a workflow must not quietly change
 * review cost or the fail-closed coverage gate.
 */
const LIMITS = {
  agentTurns: 12,
  maxFileBytes: 400000,
  contextLines: 20,
  maxInputTokens: 120000,
  chunkTokens: 30000,
  concurrency: 4,
  maxFindings: 25,
  minSeverity: 'low',
};

/** Defaults match action.yml. Ceilings stop a typo becoming an unbounded spend. */
export const DEFAULT_MAX_TOOL_CALLS = 80;
export const DEFAULT_REQUEST_TIMEOUT_MINUTES = 20;
export const DEFAULT_MAX_FILES = 150;
const MAX_TOOL_CALLS_LIMIT = 500;
const MAX_TIMEOUT_MINUTES = 120;
const MAX_FILES_LIMIT = 500;

export function readConfig() {
  const apiKey = requiredInput('api-key');
  core.mask(apiKey);

  const githubToken = requiredInput('github-token');
  core.mask(githubToken);

  const handoffToken = core.getInput('handoff-token');
  if (handoffToken) core.mask(handoffToken);

  const baseUrl = requiredHttpUrl('base-url', requiredInput('base-url'));
  const model = requiredInput('model');
  const reasoningEffort = validateReasoningEffort(core.getInput('reasoning-effort'));
  const githubApiUrl = requiredHttpUrl('GITHUB_API_URL', requiredEnv('GITHUB_API_URL'));
  const maxToolCalls = boundedInteger('max-tool-calls', DEFAULT_MAX_TOOL_CALLS, 1, MAX_TOOL_CALLS_LIMIT);
  const requestTimeoutMinutes = boundedInteger(
    'request-timeout-minutes',
    DEFAULT_REQUEST_TIMEOUT_MINUTES,
    1,
    MAX_TIMEOUT_MINUTES,
  );
  const maxFiles = boundedInteger('max-files', DEFAULT_MAX_FILES, 1, MAX_FILES_LIMIT);

  return {
    apiKey,
    baseUrl,
    model,
    reasoningEffort,
    githubToken,
    handoffToken,
    githubApiUrl,
    instructions: core.getInput('instructions'),
    ignore: [...DEFAULT_IGNORES, ...core.getLines('ignore')],
    ...LIMITS,
    maxToolCalls,
    maxFiles,
    requestTimeoutMs: requestTimeoutMinutes * 60 * 1000,
  };
}

function boundedInteger(name, fallback, min, max) {
  const raw = core.getInput(name, String(fallback));
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`Input "${name}" must be an integer from ${min} to ${max}.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Input "${name}" must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function requiredInput(name) {
  const value = core.getInput(name);
  if (value) return value;
  throw new Error(`Input "${name}" is required and resolved to an empty value.`);
}

export function validateReasoningEffort(value, name = 'reasoning-effort') {
  if (!value) return '';
  if (VALID_REASONING_EFFORTS.includes(value)) return value;
  throw new Error(`Input "${name}" must be one of ${VALID_REASONING_EFFORTS.join(', ')}.`);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (value) return value;
  throw new Error(`${name} is required.`);
}

function requiredHttpUrl(name, value) {
  const cleaned = value.replace(/\/+$/, '');
  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch (err) {
    throw new Error(`${name} must be an absolute HTTP(S) URL.`, { cause: err });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an absolute HTTP(S) URL without embedded credentials.`);
  }
  if (parsed.search || parsed.hash) throw new Error(`${name} must not contain a query string or fragment.`);
  return cleaned;
}

/**
 * @typedef {object} EventContext
 * @property {string} owner
 * @property {string} repo
 * @property {string} eventName
 * @property {any} payload
 * @property {number|null} [prNumber]
 * @property {string} [trigger]
 * @property {string} [focus]
 * @property {number} [codingIssue]
 * @property {number} [repairRound]
 * @property {string} [headSha]
 * @property {string} [skip]
 */

/**
 * Resolve the pull request and apply the fixed comment-trigger author gate.
 * @returns {EventContext}
 */
export function readEvent(handoffToken = '') {
  const [owner, repo] = requiredEnv('GITHUB_REPOSITORY').split('/');
  if (!owner || !repo) throw new Error('GITHUB_REPOSITORY must be in owner/repository form.');

  const eventName = requiredEnv('GITHUB_EVENT_NAME');
  const eventPath = requiredEnv('GITHUB_EVENT_PATH');
  if (!fs.existsSync(eventPath)) throw new Error(`GITHUB_EVENT_PATH does not exist: ${eventPath}`);
  const payload = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  const base = { owner, repo, eventName, payload };

  if (eventName === 'issue_comment') {
    if (!payload.issue?.pull_request) return { ...base, skip: 'comment is not on a pull request' };

    const body = payload.comment?.body || '';
    if (!containsPhrase(body, TRIGGER_PHRASE)) {
      return { ...base, skip: `comment does not contain ${TRIGGER_PHRASE}` };
    }
    if (payload.comment?.user?.type === 'Bot') return { ...base, skip: 'comment was posted by a bot' };

    const association = String(payload.comment?.author_association || '').toUpperCase();
    if (!ALLOWED_ASSOCIATIONS.has(association)) {
      return { ...base, skip: `author association ${association || 'UNKNOWN'} is not allowed` };
    }

    return {
      ...base,
      prNumber: payload.issue.number,
      trigger: 'mention',
      focus: extractFocus(body, TRIGGER_PHRASE),
    };
  }

  if (eventName === 'repository_dispatch') {
    if (payload.action !== 'shipyard-review')
      return { ...base, skip: 'repository dispatch is not for Shipyard review' };
    const prNumber = payload.client_payload?.pull_request;
    if (!Number.isInteger(prNumber) || prNumber < 1) {
      return { ...base, skip: 'repository dispatch did not include a pull request number' };
    }
    const codingIssue = payload.client_payload?.issue;
    const repairRound = payload.client_payload?.repair_round;
    const headSha = payload.client_payload?.head_sha;
    if (
      !Number.isInteger(codingIssue) ||
      codingIssue < 1 ||
      !Number.isInteger(repairRound) ||
      repairRound < 0 ||
      repairRound > 1 ||
      typeof headSha !== 'string' ||
      !headSha
    ) {
      return {
        ...base,
        skip: 'repository dispatch did not include a valid Cloud Coder Issue, commit, and repair round',
      };
    }
    if (
      !handoffToken ||
      !verifiesHandoffProof(
        handoffToken,
        { direction: 'review', owner, repo, issue: codingIssue, pull: prNumber, repairRound, headSha },
        payload.client_payload?.handoff_proof,
      )
    ) {
      throw new Error('Shipyard review dispatch requires a valid hand-off token and proof.');
    }
    return { ...base, prNumber, trigger: 'cloud-coder', codingIssue, repairRound, headSha };
  }

  if (eventName === 'pull_request' || eventName === 'pull_request_target') {
    return { ...base, prNumber: payload.pull_request?.number, trigger: eventName };
  }

  return { ...base, skip: `unsupported event "${eventName}"` };
}

/** Word-boundary-ish match so "@shipyarder" does not trigger a review. */
export function containsPhrase(body, phrase = TRIGGER_PHRASE) {
  const index = body.toLowerCase().indexOf(phrase.toLowerCase());
  if (index === -1) return false;
  const after = body[index + phrase.length];
  return after === undefined || !/[\w-]/.test(after);
}

export function extractFocus(body, phrase = TRIGGER_PHRASE) {
  const index = body.toLowerCase().indexOf(phrase.toLowerCase());
  if (index === -1) return '';
  return body
    .slice(index + phrase.length)
    .trim()
    .slice(0, 2000);
}
