<p align="center">
  <img src="assets/shipyard-hero.png" alt="A ship under construction in a dark industrial shipyard" width="100%" />
</p>

# Shipyard

## GitHub-first code factory

Shipyard is for work that has already been thought through. Your local coding
tool—Codex or Claude Code—uses Matt Pocock's skills to make a ticket safe for a
fresh agent context. Shipyard then performs bounded work in GitHub Actions:
implementation, independent adversarial review, and a hand-off for your final
merge decision.

**Released now:** Shipyard Cloud Reviewer at `dymoo/shipyard@v3` and Cloud
Coder at `dymoo/shipyard/cloud-coder@v3`.

## The loop

```text
Your laptop: Codex or Claude Code + Matt's skills
  /triage → /wayfinder → /to-spec → /to-tickets
  Agent Brief + acceptance checks + complexity score
                         │
                         ▼
GitHub Actions: Shipyard Cloud Coder
  first commits → tests → bounded repair pass
                         │
                         ▼
GitHub Actions: Shipyard Cloud Reviewer
  independent adversarial review of the draft PR
                         │
                         ▼
ready-for-human → your local coding tool or you decide to merge
```

Shipyard does not have a separate orchestration product. The local coding tool
remains responsible for planning, queuing, escalation and merge judgement;
Shipyard is the factory floor inside GitHub Actions.

## Matt's skills are the core dependency

Shipyard requires Matt's real workflows rather than a generic “plan then code”
prompt:

1. `/triage` turns a raw issue or draft PR into a durable Agent Brief.
2. `/wayfinder` resolves large or uncertain initiatives before coding begins.
3. `/to-spec` and `/to-tickets` publish small, dependency-ordered leaf tickets.
4. `ready-for-agent` means the brief names desired behaviour, acceptance checks,
   affected boundary, test command, dependencies and risks.

The local tool keeps the planning skills. Cloud Coder receives only a controlled
implementation subset—`/implement`, TDD, debugging, code review and Ponytail—
plus the approved brief. It refuses incomplete, blocked or fork-originated work
instead of reopening product design in GitHub Actions.

See [the Shipyard workflow skill](skills/shipyard/SKILL.md), the
[local-tool guide](docs/shipyard-llm-setup.md) and the
[GitHub Issues workflow](docs/agents/issue-tracker.md).

## Add Shipyard Cloud Reviewer

Create `.github/workflows/shipyard-reviewer.yml`:

```yaml
name: Shipyard Cloud Reviewer

on:
  pull_request_target:
    types: [opened, synchronize, reopened]
  issue_comment:
    types: [created]
  repository_dispatch:
    types: [shipyard-review]

permissions:
  # The fixed Coder repair hand-off needs repository_dispatch. This token is
  # never exposed to the Cloud Reviewer model.
  contents: write
  issues: write
  pull-requests: write

concurrency:
  group: shipyard-review-${{ github.event.pull_request.number || github.event.issue.number || github.event.client_payload.pull_request }}
  cancel-in-progress: true

jobs:
  review:
    if: >-
      (github.event_name == 'pull_request_target' &&
       !startsWith(github.event.pull_request.head.ref, 'shipyard/issue-')) ||
      (github.event_name == 'repository_dispatch' && github.event.action == 'shipyard-review') ||
      (github.event.issue.pull_request && contains(github.event.comment.body, '@shipyard'))
    runs-on: ubuntu-latest
    steps:
      - uses: dymoo/shipyard@v3
        with:
          api-key: ${{ secrets.OPENAI_API_KEY }}
          base-url: https://api.openai.com/v1
          model: gpt-5.6-luna
          handoff-token: ${{ secrets.SHIPYARD_HANDOFF_TOKEN }}
```

Add `OPENAI_API_KEY` and a random `SHIPYARD_HANDOFF_TOKEN` under **Settings →
Secrets and variables → Actions**. The reviewer needs an OpenAI-compatible Chat
Completions endpoint with tool calling. It is API-key-only; a ChatGPT or Codex
subscription is not a GitHub Actions credential. Coder/Reviewer repository
dispatches carry an HMAC proof, bound to the repository, direction, Issue, PR,
repair round and exact head commit. The secret is never sent in a retained event payload or
to either model.

The workflow intentionally has **no checkout**. `pull_request_target` remains
safe only because Cloud Reviewer reads the pull-request snapshot and never
executes its code. Do not add a head-ref checkout, install, build or shell step.
The action's host code uses its GitHub token only for its fixed, non-model-led
handoff: request one Coder repair or mark the Coder's draft PR ready for review.
It skips ordinary pull-request events for generated `shipyard/issue-*` branches:
the repository-dispatch run is the single review-and-handoff authority for those
drafts.

An owner, member or collaborator can request focused guidance with:

```text
@shipyard check the migration for data loss
```

## Let an LLM install it

Paste this into Codex, Claude Code or another trusted local coding tool:

```text
Install Shipyard Cloud Reviewer in this repository.

1. Read AGENTS.md, CONTRIBUTING.md, existing GitHub Actions workflows and PR
   security conventions before editing.
2. Create .github/workflows/shipyard-reviewer.yml from
   https://github.com/dymoo/shipyard/blob/main/README.md.
3. Reuse an existing OpenAI-compatible secret name, otherwise use
   OPENAI_API_KEY. Never put a key in a workflow file.
4. Preserve pull_request_target without checking out, installing, building or
   executing pull-request code in the reviewer job.
5. Use the real endpoint/model available to the repository. Prefer
   gpt-5.6-luna when the OpenAI API is available; otherwise keep an existing
   compatible provider.
6. Create one random `SHIPYARD_HANDOFF_TOKEN` Actions secret and pass it to both
   Shipyard actions as `handoff-token`. Do not add any secret to a
   `repository_dispatch` payload.
7. Run the repository's workflow validation, then show the complete diff and
   identify the secret the maintainer must add.
```

## Models

The Cloud Coder default is **GPT-5.6 Luna with `xhigh` reasoning**. It is the
starting point because the useful unit is cost per _accepted_ PR, not cost per
raw token. Scores 4–5 route to GPT-5.6 Terra at `high` or `xhigh`; DeepSeek V4
Flash remains an evaluated cost-sensitive alternative.

`gpt-5.6-luna` is the API model identifier. `xhigh` is a reasoning-effort
setting for Cloud Coder's harness, not an input on the seven-input,
provider-agnostic reviewer.

## Add Shipyard Cloud Coder

Cloud Coder is triggered by an **Issue**, not by a pull request. Your local
Codex or Claude Code session must use the Shipyard/Matt Pocock workflow to make
the Issue exceptionally clear, place the Agent Brief in its body, then add
`ready-for-agent`.

Copy [the maintained workflow example](examples/workflows/shipyard-coder.yml)
to `.github/workflows/shipyard-coder.yml`. It deliberately has no checkout:
Shipyard downloads the default-branch snapshot itself, and repository code runs
only inside the sandboxed Docker copy.

Use `dymoo/shipyard/cloud-coder@v3` in the copied workflow. Both actions must
receive the same `SHIPYARD_HANDOFF_TOKEN`; Shipyard uses it only to sign and
verify context-bound HMAC hand-offs, never stores it in the dispatch payload,
and never exposes it to either model.

Before enabling it, replace the example `sandbox-image` with an image pinned to
an actual SHA-256 digest. That image must already contain the repository's test
toolchain because the test container has no network. The Coder reads the Brief,
creates `shipyard/issue-<number>`, writes one non-force commit, opens a draft
PR, dispatches Cloud Reviewer in its separate workflow, and comments back on
the source Issue. It never auto-merges.

The workflow needs `contents: write`, `issues: write` and `pull-requests:
write` because Shipyard's host-side broker creates the branch, draft PR and
run comment. Its 45-minute job limit is deliberate: the model does not receive
that token or a shell, but an agentic run must still have an unambiguous end.

By default, complexity scores 1–3 use `gpt-5.6-luna` at `xhigh`; scores 4–5
use `gpt-5.6-terra` at `xhigh`. The workflow can override the model and
reasoning-effort inputs only when a provider names or supports them differently;
routing remains controlled by the Agent Brief complexity score.

## What Cloud Reviewer guarantees

- One investigator, one review pass and a skeptic for each candidate.
- Only `list_files`, `read_file` and exact-text `search` over the PR snapshot.
- Diff-derived anchors: a model never chooses an inline comment location.
- Base-commit instructions, so a PR cannot rewrite its own review policy.
- No checkout, shell, network tool or write path inside the reviewed snapshot.
- Fail-closed review coverage: a non-ignored file without usable textual review
  evidence fails the run instead of claiming a clean review.
- No completion-token cap. The provider/model owns completion length, while each
  logical model call has one ten-minute deadline shared by retries.

The public inputs are `api-key`, `base-url`, `model`, `github-token`, `handoff-token`,
`instructions` and `ignore`. See [SECURITY.md](SECURITY.md) and the maintained
[workflow example](examples/workflows/shipyard-reviewer.yml).

### OpenRouter preflight

For private source sent through OpenRouter, put Shipyard's source-free preflight
directly before the reviewer:

```yaml
- uses: dymoo/shipyard/preflight@v3
  with:
    api-key: ${{ secrets.OPENROUTER_API_KEY }}
    required-models: |
      deepseek/deepseek-v4-flash-0731
    model: deepseek/deepseek-v4-flash-0731
    key-limit-usd: ${{ vars.OPENROUTER_KEY_LIMIT_USD }}
    key-limit-reset: daily

- uses: dymoo/shipyard@v3
  with:
    api-key: ${{ secrets.OPENROUTER_API_KEY }}
    base-url: https://openrouter.ai/api/v1
    model: deepseek/deepseek-v4-flash-0731
```

The preflight sends no repository content. It fails closed unless the live key
has the exact spend limit/reset interval, an exact model allowlist, a ZDR route
and a strict synthetic tool call. The reviewer itself applies the same strict
OpenRouter provider policy whenever that exact base URL is used.

## Security and development

Shipyard Cloud Reviewer masks keys immediately and sends requests only to GitHub
and the configured provider. Its runtime has no third-party dependencies and
runs audited source directly on Node 20. Tests use `node:test`, do not use the
network, and exercise the entrypoint against stub APIs.

```bash
npm install
npm run check-all
```

Read [SECURITY.md](SECURITY.md) for the threat model and
[the Pi research note](docs/research/pi-coding-agent.md) for the minimal-core,
mandatory-sandbox design that informs Cloud Coder.

Licensed under [MIT](LICENSE).
