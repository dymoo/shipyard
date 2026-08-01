import * as core from '../src/core.js';

const LIMIT_RESETS = new Set(['daily', 'weekly', 'monthly']);

export function readPreflightConfig() {
  const apiKey = requiredInput('api-key');
  core.mask(apiKey);
  const requiredModels = [...new Set(core.getLines('required-models'))];
  if (requiredModels.length === 0) throw new Error('Input "required-models" must name at least one model.');
  const model = requiredInput('model');
  if (!requiredModels.includes(model)) throw new Error('Input "model" must appear in required-models.');

  const keyLimitUsd = Number(requiredInput('key-limit-usd'));
  if (!Number.isFinite(keyLimitUsd) || keyLimitUsd <= 0) {
    throw new Error('Input "key-limit-usd" must be a positive number.');
  }

  const reset = requiredInput('key-limit-reset').toLowerCase();
  if (!LIMIT_RESETS.has(reset)) {
    throw new Error('Input "key-limit-reset" must be daily, weekly or monthly.');
  }

  return {
    apiKey,
    requiredModels,
    model,
    keyLimitUsd,
    keyLimitReset: /** @type {'daily'|'weekly'|'monthly'} */ (reset),
    diagnosticProvider: core.getInput('diagnostic-provider'),
    requestTimeoutMs: 120000,
  };
}

function requiredInput(name) {
  const value = core.getInput(name);
  if (value) return value;
  throw new Error(`Input "${name}" is required and resolved to an empty value.`);
}
