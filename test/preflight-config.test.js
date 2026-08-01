import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readPreflightConfig } from '../preflight/config.js';

function withEnv(values, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

const values = {
  'INPUT_API-KEY': 'secret',
  'INPUT_REQUIRED-MODELS': 'openai/gpt-5.6-luna\ndeepseek/deepseek-v4-flash-0731',
  INPUT_MODEL: 'deepseek/deepseek-v4-flash-0731',
  'INPUT_KEY-LIMIT-USD': '10',
  'INPUT_KEY-LIMIT-RESET': 'daily',
  'INPUT_DIAGNOSTIC-PROVIDER': 'deepseek',
};

test('reads one strict OpenRouter preflight contract', () => {
  const config = withEnv(values, readPreflightConfig);
  assert.deepEqual(config.requiredModels, ['openai/gpt-5.6-luna', 'deepseek/deepseek-v4-flash-0731']);
  assert.equal(config.model, 'deepseek/deepseek-v4-flash-0731');
  assert.equal(config.keyLimitUsd, 10);
  assert.equal(config.keyLimitReset, 'daily');
  assert.equal(config.diagnosticProvider, 'deepseek');
  assert.equal(config.requestTimeoutMs, 120000);
});

test('rejects an invalid limit or a model outside the exact allowlist', () => {
  assert.throws(() => withEnv({ ...values, 'INPUT_KEY-LIMIT-USD': '0' }, readPreflightConfig), /positive number/);
  assert.throws(
    () => withEnv({ ...values, INPUT_MODEL: 'another/model' }, readPreflightConfig),
    /must appear in required-models/,
  );
});

test('preflight action metadata exposes only the reviewed inputs', () => {
  const action = fs.readFileSync(new URL('../preflight/action.yml', import.meta.url), 'utf8');
  const inputBlock = action.slice(action.indexOf('inputs:'), action.indexOf('\noutputs:'));
  const names = [...inputBlock.matchAll(/^ {2}([a-z-]+):$/gm)].map((match) => match[1]);
  assert.deepEqual(names, [
    'api-key',
    'required-models',
    'model',
    'key-limit-usd',
    'key-limit-reset',
    'diagnostic-provider',
  ]);
  assert.match(action, /using: node20/);
  assert.match(action, /main: index\.js/);
});

test('the compiler checks every preflight production file', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../tsconfig.json', import.meta.url), 'utf8'));
  assert.ok(config.include.includes('preflight/**/*.js'));
});
