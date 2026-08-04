export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const PROVIDER_POLICY = Object.freeze({
  data_collection: 'deny',
  zdr: true,
  require_parameters: true,
});

const TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'read_file',
    description: 'Read one synthetic repository file by its exact path.',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
      additionalProperties: false,
    },
  },
});

const SYNTHETIC_MESSAGES = Object.freeze([
  {
    role: 'system',
    content:
      'This is a synthetic transport test. Call read_file exactly once. ' +
      'Do not request, infer, or emit real repository content.',
  },
  { role: 'user', content: 'Inspect the synthetic path src/example.js by calling read_file.' },
]);

/**
 * @typedef {object} PreflightConfig
 * @property {string} apiKey
 * @property {string[]} requiredModels
 * @property {string} model
 * @property {number} keyLimitUsd
 * @property {'daily'|'weekly'|'monthly'} keyLimitReset
 * @property {string} diagnosticProvider
 * @property {number} requestTimeoutMs
 */

/**
 * @typedef {object} RouteEvidence
 * @property {string} provider
 * @property {string} model
 * @property {number} promptTokens
 * @property {number} completionTokens
 * @property {number} costUsd
 */

/**
 * Verify the current key and a source-free OpenRouter route.
 * @param {PreflightConfig} config
 * @param {{fetch?: typeof fetch, timeoutSignal?: (ms: number) => AbortSignal}} [runtime]
 * @returns {Promise<{route: RouteEvidence, diagnostic: null|{status: 'eligible'|'strict-route-ineligible', provider: string}}>}
 */
export async function verifyOpenRouterPreflight(config, runtime = {}) {
  const fetchImpl = runtime.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const timeoutSignal = runtime.timeoutSignal ?? ((ms) => AbortSignal.timeout(ms));
  const headers = {
    authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
    'user-agent': 'shipyard-openrouter-preflight',
    'x-openrouter-metadata': 'enabled',
  };

  const key = await requireJson(
    fetchImpl,
    `${OPENROUTER_BASE_URL}/key`,
    { method: 'GET', headers, signal: timeoutSignal(config.requestTimeoutMs) },
    'key validation',
  );
  requireKeyPolicy(key, config.keyLimitUsd, config.keyLimitReset);

  const models = await requireJson(
    fetchImpl,
    `${OPENROUTER_BASE_URL}/models/user`,
    { method: 'GET', headers, signal: timeoutSignal(config.requestTimeoutMs) },
    'model eligibility',
  );
  requireExactModels(models, config.requiredModels);

  const endpoints = await requireJson(
    fetchImpl,
    `${OPENROUTER_BASE_URL}/endpoints/zdr`,
    { method: 'GET', headers, signal: timeoutSignal(config.requestTimeoutMs) },
    'ZDR endpoint discovery',
  );
  const zdrProviders = requireZdrProviders(endpoints, config.model);

  const routeResponse = await requireJson(
    fetchImpl,
    `${OPENROUTER_BASE_URL}/chat/completions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody(config.model)),
      signal: timeoutSignal(config.requestTimeoutMs),
    },
    'strict tool route',
  );
  const route = requireRouteEvidence(routeResponse, config.model);
  requireZdrProvider(route.provider, zdrProviders, 'strict tool route');

  let diagnostic = null;
  if (config.diagnosticProvider) {
    const response = await fetchImpl(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(
        requestBody(config.model, {
          only: [config.diagnosticProvider],
          allow_fallbacks: false,
        }),
      ),
      signal: timeoutSignal(config.requestTimeoutMs),
    });

    if (response.ok) {
      const payload = await parseJson(response, 'diagnostic provider route');
      const evidence = requireRouteEvidence(payload, config.model);
      requireZdrProvider(evidence.provider, zdrProviders, 'diagnostic provider route');
      diagnostic = { status: /** @type {const} */ ('eligible'), provider: evidence.provider };
    } else {
      const payload = await parseJson(response, 'diagnostic provider route');
      if (!isStrictRouteIneligibleResponse(response.status, payload, config.model)) {
        throw new Error(`OpenRouter diagnostic provider route failed with status ${response.status}`);
      }
      diagnostic = {
        status: /** @type {const} */ ('strict-route-ineligible'),
        provider: config.diagnosticProvider,
      };
    }
  }

  return { route, diagnostic };
}

function requestBody(model, providerOverrides = {}) {
  return {
    model,
    messages: SYNTHETIC_MESSAGES,
    temperature: 0.1,
    tools: [TOOL],
    tool_choice: { type: 'function', function: { name: 'read_file' } },
    usage: { include: true },
    provider: { ...PROVIDER_POLICY, ...providerOverrides },
  };
}

async function requireJson(fetchImpl, url, init, operation) {
  const response = await fetchImpl(url, init);
  if (!response.ok) throw new Error(`OpenRouter ${operation} failed with status ${response.status}`);
  return parseJson(response, operation);
}

async function parseJson(response, operation) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`OpenRouter ${operation} returned invalid JSON`, { cause: error });
  }
}

function requireKeyPolicy(payload, expectedLimit, expectedReset) {
  if (!isObject(payload) || !isObject(payload.data)) {
    throw new Error('OpenRouter key response has an unexpected shape');
  }
  const { limit, limit_reset: reset, limit_remaining: remaining } = payload.data;
  if (limit !== expectedLimit) {
    throw new Error(`OpenRouter key limit must equal USD ${expectedLimit}`);
  }
  if (reset !== expectedReset) {
    throw new Error(`OpenRouter key limit reset must equal ${expectedReset}`);
  }
  requireNonNegativeNumber(remaining, 'key limit remaining');
}

function requireExactModels(payload, requiredModels) {
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    throw new Error('OpenRouter model eligibility response has an unexpected shape');
  }
  const actual = new Set();
  for (const value of payload.data) {
    if (!isObject(value) || typeof value.id !== 'string' || !value.id.trim()) {
      throw new Error('OpenRouter model eligibility response has an unexpected shape');
    }
    actual.add(value.id);
  }
  const required = new Set(requiredModels);
  for (const model of required) {
    if (!actual.has(model)) throw new Error(`OpenRouter policy excludes required model ${model}`);
  }
  for (const model of actual) {
    if (!required.has(model)) throw new Error(`OpenRouter policy allows unexpected model ${model}`);
  }
}

function requireZdrProviders(payload, model) {
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    throw new Error('OpenRouter ZDR endpoint response has an unexpected shape');
  }
  const providers = new Set(
    payload.data.flatMap((value) =>
      isObject(value) &&
      value.model_id === model &&
      typeof value.provider_name === 'string' &&
      value.provider_name.trim()
        ? [value.provider_name]
        : [],
    ),
  );
  if (providers.size === 0) throw new Error(`OpenRouter exposes no ZDR endpoint for ${model}`);
  return providers;
}

function requireZdrProvider(provider, providers, operation) {
  if (!providers.has(provider)) {
    throw new Error(`OpenRouter ${operation} selected provider ${provider} outside the ZDR registry`);
  }
}

function requireRouteEvidence(payload, model) {
  if (!isObject(payload) || payload.model !== model) {
    throw new Error('OpenRouter returned a model other than the exact preflight model');
  }
  const provider = providerName(payload);
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const message = isObject(choice) && isObject(choice.message) ? choice.message : undefined;
  const toolCalls = message && Array.isArray(message.tool_calls) ? message.tool_calls : [];
  requireSyntheticToolCall(toolCalls);
  const usage = isObject(payload.usage) ? payload.usage : undefined;
  return {
    provider,
    model,
    promptTokens: requireNonNegativeNumber(usage?.prompt_tokens, 'prompt token count'),
    completionTokens: requireNonNegativeNumber(usage?.completion_tokens, 'completion token count'),
    costUsd: requireNonNegativeNumber(usage?.cost, 'provider cost'),
  };
}

function providerName(payload) {
  if (typeof payload.provider === 'string' && payload.provider.trim()) return payload.provider;
  const metadata = isObject(payload.openrouter_metadata) ? payload.openrouter_metadata : undefined;
  const endpoints = metadata && isObject(metadata.endpoints) ? metadata.endpoints : undefined;
  const available = endpoints && Array.isArray(endpoints.available) ? endpoints.available : [];
  const selected = available.flatMap((endpoint) =>
    isObject(endpoint) &&
    endpoint.selected === true &&
    typeof endpoint.provider === 'string' &&
    endpoint.provider.trim()
      ? [endpoint.provider]
      : [],
  );
  if (selected.length === 1 && selected[0] !== undefined) return selected[0];
  throw new Error('OpenRouter response omitted one unambiguous selected provider');
}

function requireSyntheticToolCall(toolCalls) {
  if (toolCalls.length === 0) {
    throw new Error('OpenRouter preflight did not return the required read_file tool call');
  }
  if (toolCalls.length !== 1) {
    throw new Error('OpenRouter preflight must return exactly one read_file tool call');
  }

  const call = toolCalls[0];
  if (
    !isObject(call) ||
    call.type !== 'function' ||
    typeof call.id !== 'string' ||
    !call.id.trim() ||
    !isObject(call.function) ||
    call.function.name !== 'read_file' ||
    typeof call.function.arguments !== 'string'
  ) {
    throw new Error('OpenRouter preflight omitted a usable read_file tool call');
  }

  let args;
  try {
    args = JSON.parse(call.function.arguments);
  } catch (error) {
    throw new Error('OpenRouter preflight omitted a usable read_file tool call', { cause: error });
  }
  if (!isObject(args) || args.path !== 'src/example.js' || Object.keys(args).length !== 1) {
    throw new Error('OpenRouter preflight omitted a usable read_file tool call');
  }
}

function isStrictRouteIneligibleResponse(status, payload, model) {
  if (status !== 404 || !isObject(payload) || !isObject(payload.error)) return false;
  if (payload.error.code !== 404) return false;
  const message = payload.error.message;
  const noProvider =
    typeof message === 'string' &&
    (/\bno (?:allowed |eligible )?providers? (?:are )?available\b/i.test(message) ||
      /\bno eligible providers?\b/i.test(message));
  if (!noProvider) return false;
  const metadata = isObject(payload.openrouter_metadata) ? payload.openrouter_metadata : undefined;
  if (!metadata || metadata.requested !== model || metadata.attempt !== 0) return false;
  const endpoints = isObject(metadata.endpoints) ? metadata.endpoints : undefined;
  const available = endpoints && Array.isArray(endpoints.available) ? endpoints.available : undefined;
  return available !== undefined && !available.some((endpoint) => isObject(endpoint) && endpoint.selected === true);
}

function requireNonNegativeNumber(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`OpenRouter response omitted a valid ${field}`);
  }
  return value;
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
