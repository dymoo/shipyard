import * as core from '../src/core.js';
import { readPreflightConfig } from './config.js';
import { verifyOpenRouterPreflight } from './verify.js';

async function main() {
  const config = readPreflightConfig();
  const evidence = await verifyOpenRouterPreflight(config);
  core.setOutput('evidence', evidence);

  const diagnostic = evidence.diagnostic
    ? ` Diagnostic provider \`${evidence.diagnostic.provider}\`: ${evidence.diagnostic.status}.`
    : '';
  core.appendSummary(
    `### OpenRouter preflight passed\n\n` +
      `Exact model \`${evidence.route.model}\` used ${evidence.route.provider}; ` +
      `${evidence.route.promptTokens} prompt tokens, ${evidence.route.completionTokens} completion tokens, ` +
      `USD ${evidence.route.costUsd}.${diagnostic}`,
  );
}

main().catch((error) => {
  core.setFailed(error instanceof Error ? error.message : 'Unknown OpenRouter preflight failure');
});
