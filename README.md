# commitreview

Context-aware AI code review as a GitHub Action. Bring an OpenAI-compatible
endpoint and API key; commitreview reads the pull request and repository,
investigates with read-only tools, verifies every candidate finding, and posts
the survivors as inline comments.

The v2 product is deliberately narrow:

- one model
- one review pass
- one adversarial verifier per finding
- three read-only repository tools: `list_files`, `read_file`, `search`
- inline comments plus one sticky summary
- six inputs, with review limits owned by the action

There is no hosted service, checkout, runtime dependency or bundled `dist/`.
Both actions run their audited source directly on Node 20.

## Quick start

Add `.github/workflows/commitreview.yml`:

```yaml
name: commitreview

on:
  pull_request_target:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: commitreview-${{ github.event.pull_request.number || github.event.issue.number }}
  cancel-in-progress: true

jobs:
  review:
    if: >-
      github.event_name == 'pull_request_target' ||
      (github.event.issue.pull_request && contains(github.event.comment.body, '@commitreview'))
    runs-on: ubuntu-latest
    steps:
      - uses: dymoo/commitreview@v2
        with:
          api-key: ${{ secrets.LLM_API_KEY }}
          base-url: https://openrouter.ai/api/v1
          model: your-provider/model-id
```

Add `LLM_API_KEY` under **Settings → Secrets and variables → Actions**. The
configured model must support OpenAI-style chat completions and tool calling.

The workflow reviews every pull request update. A repository owner, member or
collaborator can also request a focused review:

```text
@commitreview check the migration for data loss
```

Text after `@commitreview` is always review guidance. v2 does not implement a
chat mode.

## How it works

1. The action downloads the pull request diff and the repository snapshot at
   the head commit. It never checks out or executes pull request code.
2. Changed files are filtered through built-in ignores plus your `ignore`
   patterns. Hunks are widened with surrounding source and rendered with
   explicit old/new line numbers.
3. The model investigates the non-ignored pull request head with bounded
   read-only tools. Repository instruction files such as `AGENTS.md`,
   `CLAUDE.md` and scoped equivalents are read from the trusted base commit, so
   a pull request cannot rewrite its own review policy.
4. One review pass looks for defects and evidenced repository-fit problems.
   Fit findings must cite the existing helper, sibling or written rule they are
   measured against. Validation, security, accessibility and data-loss
   prevention remain load-bearing.
5. A skeptic tries to refute every candidate. Surviving locations are validated
   against the parsed diff; a model can reword a finding but cannot choose an
   invalid anchor.
6. New findings are posted inline. Unanchorable findings move to one sticky
   summary, and stable fingerprints prevent repeats after rebases.

The repository-fit guidance condenses the
[ponytail rules](https://github.com/dietrichgebert/ponytail) by Dietrich
Gebert: prefer deletion, reuse, the standard library and the platform before
adding another abstraction. A `// ponytail:` comment that states a shortcut's
ceiling and upgrade path records a deliberate trade-off.

## Inputs

| Input          | Required | Meaning                                                              |
| -------------- | -------- | -------------------------------------------------------------------- |
| `api-key`      | yes      | Secret for the OpenAI-compatible endpoint.                           |
| `base-url`     | yes      | API root including its version path; there is no fallback URL.       |
| `model`        | yes      | Provider model id.                                                   |
| `github-token` | no       | GitHub token; defaults to `${{ github.token }}`.                     |
| `instructions` | no       | Extra trusted repository-specific review guidance.                   |
| `ignore`       | no       | Newline-separated globs added to the built-in generated/vendor list. |

Outputs are `reviewed` (`true` or `false`) and `findings` (the number that
survived verification).

`reviewed=true` is fail-closed coverage evidence. The action fails instead of
setting it when a non-ignored file has no textual diff, is binary, exceeds the
file limit, contains a hunk over the per-request token budget, or is dropped
after the total input budget is exhausted. Deliberately ignored paths remain
listed in the sticky summary.

Example project guidance:

```yaml
with:
  api-key: ${{ secrets.LLM_API_KEY }}
  base-url: https://openrouter.ai/api/v1
  model: your-provider/model-id
  instructions: |
    Money is stored as integer minor units.
    Every webhook handler must be idempotent.
  ignore: |
    private/**
    **/*.pem
```

Limits for context, files, requests, findings, concurrency and timeouts are
fixed product decisions. Changing one affects cost, reliability or safety, so
it happens in a reviewed release rather than in every consumer workflow.

## Provider contract

The endpoint must expose:

```text
POST {base-url}/chat/completions
Authorization: Bearer {api-key}
```

When `base-url` is exactly `https://openrouter.ai/api/v1`, commitreview adds this
provider policy to every model request:

```json
{
  "provider": {
    "data_collection": "deny",
    "zdr": true,
    "require_parameters": true
  }
}
```

This fails closed when OpenRouter cannot route the selected model to an endpoint
that denies data collection, is marked Zero Data Retention, and supports the
request parameters. The policy is deliberately attached by the action rather
than delegated to consumer workflow configuration. Other base URLs are left
unchanged; an OpenRouter-compatible proxy does not inherit this guarantee.

It must support OpenAI-style function tools. Tool calling is required: an
endpoint that rejects tools fails clearly rather than producing a diff-only
review that looks complete.

### OpenRouter preflight

Repositories that send private source through OpenRouter can put the companion
preflight immediately before the review step:

```yaml
- uses: dymoo/commitreview/preflight@v2.0.2
  with:
    api-key: ${{ secrets.OPENROUTER_API_KEY }}
    required-models: |
      openai/gpt-5.6-luna
      deepseek/deepseek-v4-flash-0731
    model: deepseek/deepseek-v4-flash-0731
    key-limit-usd: ${{ vars.OPENROUTER_KEY_LIMIT_USD }}
    key-limit-reset: daily

- uses: dymoo/commitreview@v2.0.2
  with:
    api-key: ${{ secrets.OPENROUTER_API_KEY }}
    base-url: https://openrouter.ai/api/v1
    model: deepseek/deepseek-v4-flash-0731
```

The preflight sends no repository content. It verifies the current key's exact
spending limit and reset interval, requires `/models/user` to expose exactly the
declared model allowlist, requires a current ZDR endpoint for the test model,
and completes a forced synthetic tool call with the same strict provider policy
used by the review. Put it directly before the review so key rotation or policy
drift fails before source leaves GitHub Actions. Configure the exact model
allowlist with an API-key-scoped
[OpenRouter guardrail](https://openrouter.ai/docs/guides/features/guardrails/overview);
an unrestricted key is rejected because
[`/models/user`](https://openrouter.ai/docs/api/api-reference/models/list-models-user)
exposes additional models.

For a source-free one-off diagnostic, set `diagnostic-provider` to an OpenRouter
provider slug. The preflight disables fallback and reports either a successful
strict route or a documented zero-attempt “no allowed providers” result from
[router metadata](https://openrouter.ai/docs/guides/features/router-metadata).
The latter proves that the named provider is ineligible under the complete
effective route policy; it does not guess which account, guardrail, privacy, or
provider constraint caused the exclusion. Transient provider failures are
errors, not eligibility evidence. Every preflight request has its own
120-second deadline and is attempted once; rerun the workflow to collect fresh
evidence after an operational failure.

In the review action, each logical non-streaming model call has one fixed
ten-minute deadline shared across all attempts. A timeout or abort is terminal
and is never duplicated; fast connection failures, 429s and 5xx responses retry
only while their request and backoff fit inside the remaining budget. Consumer
workflow jobs must leave enough time for the complete multi-call review, and
proxies must not impose a shorter upstream deadline. The larger bound is
intentional for high-reasoning models; the shared deadline and workflow timeout
remain the outer backstops for a stalled provider.

Structured Outputs are used when supported. Endpoints vary on
`response_format`, `max_tokens` and `temperature`, so commitreview adapts those
optional parameters when an endpoint explicitly rejects them. Tool calling is
never dropped.

v2 supports API-key authentication only. ChatGPT subscription OAuth and Codex
account tokens are intentionally deferred; the decision and reconsideration
criteria are in
[docs/codex-chatgpt-auth.md](docs/codex-chatgpt-auth.md).

## Security and data flow

The action makes requests only to GitHub's API and your configured `base-url`.
The model may receive:

- pull request title, description and focused mention text
- changed hunks and surrounding source from non-ignored files
- repository instruction documents
- non-ignored files the investigation chooses to read

All model and GitHub keys are masked immediately. Repository code is read from a
temporary snapshot and never executed; the snapshot is removed after context
collection. Agent tools cannot write, spawn a shell, use the network or escape
the snapshot; symlink targets are resolved and checked before reads.

`pull_request_target` is safe only while your workflow also avoids checking out
or executing the pull request head. Do not add a head-ref checkout to the quick
start workflow.

On public repositories, every pull request update can spend your model key.
Comment-triggered runs are restricted to owners, members and collaborators.
See [SECURITY.md](SECURITY.md) for the full threat model.

## Migrating from v1

v2 is intentionally breaking. Set `base-url` explicitly and remove every input
except the six listed above. The following v1 surfaces were removed:

- chat replies and review-thread conversations
- multi-model panels and synthesis
- depth presets, separate lenses and the separate taste pass
- configurable budgets, passes, severities, verifier votes and posting modes
- suggestions, dry-run, status-gate failure modes and JSON output files
- manual pull request numbers, trigger phrases and author-gate overrides

Repository investigation, evidence-based restraint and verification are always
on. If those semantics are not wanted, stay on `dymoo/commitreview@v1`; the
moving `v1` tag is not changed by the v2 release.

## Development

```bash
npm install
npm run check-all
```

Runtime code has no third-party dependencies. Tests use `node:test`, make no
external network requests, and exercise the real entrypoint against local stub
APIs.

| File              | Responsibility                                |
| ----------------- | --------------------------------------------- |
| `src/index.js`    | Orchestration                                 |
| `src/config.js`   | Six inputs, fixed limits and event resolution |
| `src/prompts.js`  | Review and verifier instructions              |
| `src/schema.js`   | Structured model reply contracts              |
| `src/review.js`   | Finding and verification passes               |
| `src/findings.js` | Normalisation, merging and fingerprints       |
| `src/diff.js`     | Diff parsing and comment anchoring            |
| `src/context.js`  | Filtering, widening and chunking              |
| `src/codebase.js` | Base-commit repository instruction documents  |
| `src/agent.js`    | Read-only tools and bounded investigation     |
| `src/repo.js`     | Immutable repository snapshot access          |
| `src/llm.js`      | OpenAI-compatible client and defensive JSON   |
| `src/github.js`   | GitHub REST client                            |
| `src/post.js`     | Comment and sticky-summary rendering          |
| `src/core.js`     | Small dependency-free Actions runtime adapter |
| `preflight/`      | Source-free OpenRouter policy and route proof |

Licensed under [MIT](LICENSE).
