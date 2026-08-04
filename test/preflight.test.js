import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyOpenRouterPreflight } from '../preflight/verify.js';

const REVIEW_MODEL = 'deepseek/deepseek-v4-flash-0731';
const LUNA_MODEL = 'openai/gpt-5.6-luna';

/** @type {Parameters<typeof verifyOpenRouterPreflight>[0]} */
const config = {
  apiKey: 'secret',
  requiredModels: [LUNA_MODEL, REVIEW_MODEL],
  model: REVIEW_MODEL,
  keyLimitUsd: 10,
  keyLimitReset: 'daily',
  diagnosticProvider: 'deepseek',
  requestTimeoutMs: 120000,
};

const jsonResponse = (body, status = 200) => Response.json(body, { status });

const toolResponse = (provider, overrides = {}) => ({
  model: REVIEW_MODEL,
  provider,
  choices: [
    {
      message: {
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'read_file', arguments: '{"path":"src/example.js"}' },
          },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 20, completion_tokens: 5, cost: 0.00001 },
  ...overrides,
});

const keyResponse = (overrides = {}) =>
  jsonResponse({ data: { limit: 10, limit_reset: 'daily', limit_remaining: 10, ...overrides } });

const modelResponse = (ids = [LUNA_MODEL, REVIEW_MODEL]) => jsonResponse({ data: ids.map((id) => ({ id })) });

const zdrResponse = (providers = ['Fireworks']) =>
  jsonResponse({ data: providers.map((provider_name) => ({ model_id: REVIEW_MODEL, provider_name })) });

function responseFetch(responses, requests = []) {
  return async (url, init) => {
    requests.push({ url: String(url), init });
    const response = responses.shift();
    assert.ok(response, `unexpected request to ${url}`);
    return response;
  };
}

test('proves the exact key policy, models, ZDR tool route and first-party route exclusion', async () => {
  const requests = [];
  const responses = [
    keyResponse(),
    modelResponse(),
    zdrResponse(),
    jsonResponse(toolResponse('Fireworks')),
    jsonResponse(
      {
        error: { code: 404, message: 'No allowed providers are available' },
        openrouter_metadata: {
          requested: REVIEW_MODEL,
          attempt: 0,
          endpoints: {
            available: [{ provider: 'DeepSeek', model: REVIEW_MODEL, selected: false }],
          },
        },
      },
      404,
    ),
  ];
  const fetchImpl = responseFetch(responses, requests);

  const result = await verifyOpenRouterPreflight(config, { fetch: fetchImpl });

  assert.deepEqual(result, {
    route: {
      provider: 'Fireworks',
      model: REVIEW_MODEL,
      promptTokens: 20,
      completionTokens: 5,
      costUsd: 0.00001,
    },
    diagnostic: { status: 'strict-route-ineligible', provider: 'deepseek' },
  });
  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.init.headers.authorization, 'Bearer secret');
    assert.ok(request.init.signal instanceof AbortSignal);
  }
  for (const request of requests.slice(3)) {
    const body = JSON.parse(String(request.init.body));
    assert.equal(body.max_tokens, undefined);
    assert.equal(body.max_completion_tokens, undefined);
    assert.deepEqual(
      {
        data_collection: body.provider.data_collection,
        zdr: body.provider.zdr,
        require_parameters: body.provider.require_parameters,
      },
      { data_collection: 'deny', zdr: true, require_parameters: true },
    );
    assert.deepEqual(body.tool_choice, { type: 'function', function: { name: 'read_file' } });
  }
  const diagnostic = JSON.parse(String(requests[4].init.body));
  assert.deepEqual(diagnostic.provider.only, ['deepseek']);
  assert.equal(diagnostic.provider.allow_fallbacks, false);
});

test('rejects a changed key limit or reset before making an inference request', async (t) => {
  /** @type {Array<[string, Response]>} */
  const cases = [
    ['limit', keyResponse({ limit: 20 })],
    ['reset', keyResponse({ limit_reset: 'weekly' })],
  ];
  for (const [name, key] of cases) {
    await t.test(name, async () => {
      const requests = [];
      await assert.rejects(
        verifyOpenRouterPreflight(config, { fetch: responseFetch([key], requests) }),
        /key limit (?:must equal|reset must equal)/,
      );
      assert.equal(requests.length, 1);
      assert.match(requests[0].url, /\/key$/);
    });
  }
});

test('rejects a missing or unexpected allowed model before making an inference request', async (t) => {
  /** @type {Array<[string, string[], RegExp]>} */
  const cases = [
    ['missing', [REVIEW_MODEL], /excludes required model openai\/gpt-5\.6-luna/],
    ['unexpected', [LUNA_MODEL, REVIEW_MODEL, 'another/model'], /allows unexpected model another\/model/],
  ];
  for (const [name, ids, message] of cases) {
    await t.test(name, async () => {
      const requests = [];
      await assert.rejects(
        verifyOpenRouterPreflight(config, {
          fetch: responseFetch([keyResponse(), modelResponse(ids)], requests),
        }),
        message,
      );
      assert.equal(requests.length, 2);
      assert.match(requests[1].url, /\/models\/user$/);
    });
  }
});

test('accepts current router metadata as the selected provider evidence', async () => {
  const route = toolResponse(undefined, {
    openrouter_metadata: {
      endpoints: {
        available: [
          { provider: 'DeepInfra', selected: false },
          { provider: 'Fireworks', selected: true },
        ],
      },
    },
  });

  const result = await verifyOpenRouterPreflight(
    { ...config, diagnosticProvider: '' },
    { fetch: responseFetch([keyResponse(), modelResponse(), zdrResponse(), jsonResponse(route)]) },
  );

  assert.equal(result.route.provider, 'Fireworks');
  assert.equal(result.diagnostic, null);
});

test('omits the diagnostic request when no provider is configured', async () => {
  const requests = [];
  const result = await verifyOpenRouterPreflight(
    { ...config, diagnosticProvider: '' },
    {
      fetch: responseFetch(
        [keyResponse(), modelResponse(), zdrResponse(), jsonResponse(toolResponse('Fireworks'))],
        requests,
      ),
    },
  );

  assert.equal(requests.length, 4);
  assert.equal(result.diagnostic, null);
});

test('rejects a transient diagnostic provider failure instead of calling the route ineligible', async () => {
  const transient = jsonResponse(
    {
      error: { code: 503, message: 'Provider temporarily unavailable' },
      openrouter_metadata: {
        requested: REVIEW_MODEL,
        attempt: 1,
        endpoints: { available: [{ provider: 'DeepSeek', selected: true }] },
      },
    },
    503,
  );

  await assert.rejects(
    verifyOpenRouterPreflight(config, {
      fetch: responseFetch([
        keyResponse(),
        modelResponse(),
        zdrResponse(),
        jsonResponse(toolResponse('Fireworks')),
        transient,
      ]),
    }),
    /diagnostic provider route failed with status 503/,
  );
});

test('rejects an undocumented zero-attempt 503 instead of inferring strict-route ineligibility', async () => {
  const unavailable = jsonResponse(
    {
      error: { code: 503, message: 'No eligible provider' },
      openrouter_metadata: {
        requested: REVIEW_MODEL,
        attempt: 0,
        endpoints: { available: [{ provider: 'DeepSeek', selected: false }] },
      },
    },
    503,
  );

  await assert.rejects(
    verifyOpenRouterPreflight(config, {
      fetch: responseFetch([
        keyResponse(),
        modelResponse(),
        zdrResponse(),
        jsonResponse(toolResponse('Fireworks')),
        unavailable,
      ]),
    }),
    /diagnostic provider route failed with status 503/,
  );
});

test('rejects a 404 diagnostic whose error envelope reports another failure code', async () => {
  const ambiguous = jsonResponse(
    {
      error: { code: 503, message: 'No allowed providers are available' },
      openrouter_metadata: {
        requested: REVIEW_MODEL,
        attempt: 0,
        endpoints: { available: [{ provider: 'DeepSeek', selected: false }] },
      },
    },
    404,
  );

  await assert.rejects(
    verifyOpenRouterPreflight(config, {
      fetch: responseFetch([
        keyResponse(),
        modelResponse(),
        zdrResponse(),
        jsonResponse(toolResponse('Fireworks')),
        ambiguous,
      ]),
    }),
    /diagnostic provider route failed with status 404/,
  );
});

test('accepts only a documented zero-attempt no-provider diagnostic as strict-route ineligible', async () => {
  const excluded = jsonResponse(
    {
      error: { code: 404, message: 'No allowed providers are available' },
      openrouter_metadata: {
        requested: REVIEW_MODEL,
        attempt: 0,
        endpoints: { available: [{ provider: 'DeepSeek', selected: false }] },
      },
    },
    404,
  );

  const result = await verifyOpenRouterPreflight(config, {
    fetch: responseFetch([
      keyResponse(),
      modelResponse(),
      zdrResponse(),
      jsonResponse(toolResponse('Fireworks')),
      excluded,
    ]),
  });

  assert.deepEqual(result.diagnostic, { status: 'strict-route-ineligible', provider: 'deepseek' });
});

test('fails when the model ignores the required synthetic tool call', async () => {
  const withoutTools = toolResponse('Fireworks', { choices: [{ message: { content: 'src/example.js' } }] });

  await assert.rejects(
    verifyOpenRouterPreflight(
      { ...config, diagnosticProvider: '' },
      {
        fetch: responseFetch([keyResponse(), modelResponse(), zdrResponse(), jsonResponse(withoutTools)]),
      },
    ),
    /did not return the required read_file tool call/,
  );
});

test('fails when the synthetic tool call cannot drive the real tool loop', async (t) => {
  const invalidCalls = [
    { name: 'missing id', call: { type: 'function', function: { name: 'read_file', arguments: '{}' } } },
    {
      name: 'wrong path',
      call: {
        id: 'call_1',
        type: 'function',
        function: { name: 'read_file', arguments: '{"path":"src/other.js"}' },
      },
    },
    {
      name: 'malformed arguments',
      call: { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{' } },
    },
  ];

  for (const { name, call } of invalidCalls) {
    await t.test(name, async () => {
      const invalid = toolResponse('Fireworks', { choices: [{ message: { tool_calls: [call] } }] });
      await assert.rejects(
        verifyOpenRouterPreflight(
          { ...config, diagnosticProvider: '' },
          {
            fetch: responseFetch([keyResponse(), modelResponse(), zdrResponse(), jsonResponse(invalid)]),
          },
        ),
        /usable read_file tool call/,
      );
    });
  }

  const validCall = toolResponse('Fireworks').choices[0].message.tool_calls[0];
  const multiple = toolResponse('Fireworks', {
    choices: [{ message: { tool_calls: [validCall, { ...validCall, id: 'call_2' }] } }],
  });
  await assert.rejects(
    verifyOpenRouterPreflight(
      { ...config, diagnosticProvider: '' },
      {
        fetch: responseFetch([keyResponse(), modelResponse(), zdrResponse(), jsonResponse(multiple)]),
      },
    ),
    /exactly one read_file tool call/,
  );
});
