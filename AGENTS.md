# Working on Shipyard

Conventions for this repository, for humans and for coding agents. Shipyard
reads this file when reviewing its own pull requests, so a rule written here is
a rule it will enforce. Keep it true.

## Non-negotiables

These are load-bearing. A change that breaks one is wrong even if it passes.

- **No cloud-reviewer runtime dependencies.** `action.yml` runs `src/index.js`
  directly, with no build step and no `dist/` bundle, so the code that is
  audited is the code that executes. The companion `preflight/action.yml` does
  the same for `preflight/`. Only `node:` builtins and relative imports in
  cloud-reviewer runtime source. Dev dependencies are fine.
- **Node 20 is the floor.** `runs.using: node20`. Anything newer must be feature
  detected or avoided.
- **Repository code is never executed.** We read the pull request's files; we do
  not run them, build them, or install from them. This is the single property
  that makes `pull_request_target` safe with this action, and it is why the
  workflow needs no checkout.
- **The cloud-reviewer is read-only.** Its tools may list, read and search. No
  writes, shell, network, or path that escapes the extracted repository root.
- **Tool calling is required, not probed.** Parameters like `response_format` are
  dropped when an endpoint rejects them; tool calling is not — an endpoint that
  cannot drive tools is rejected with a clear error, never degraded to a
  diff-only review. Do not add a non-tool retrieval fallback.
- **Anchors come from the diff, never from a model.** A model may reword a
  finding; only `anchorFinding` decides its `path`, `line` and `side`. Any code
  path that lets a model response set those is a bug.
- **Review policy comes from the base commit.** Pull request authors control the
  head snapshot, including any instruction files they change. Contributor rules
  used as review policy are therefore read at `pr.base.sha`; head content
  remains untrusted evidence.
- **Secrets are masked before use.** Every API key goes through `core.mask()` at
  the moment it is read, before anything else can log it.

## Product surface

Shipyard is a GitHub-first code factory with two coordinated actions,
`cloud-reviewer` and `cloud-coder`. The user's local
Codex or Claude Code session owns Matt Pocock skill workflows, ticket
definition, final merge judgement and escalation; GitHub Actions owns bounded
implementation and independent review work.

`cloud-reviewer` is the existing v2 source-bearing review path: one model
investigates with `list_files`, `read_file` and exact-text `search`; one review
pass proposes findings; one skeptic verifies each candidate; diff-derived
anchors produce inline comments and one sticky summary. Its trust boundary is
read-only and must remain so.

`cloud-coder` is a separate, sandboxed companion action. It consumes only a
fully specified Agent Brief, implements and tests a bounded work item, performs
bounded adversarial repair, and hands the resulting draft PR to
`cloud-reviewer`. It never merges code; `ready-for-human` returns merge
judgement to the user's local coding session or a human.

Cloud Coder advertises only approved skill names and descriptions in its base
context. Its host-owned `load_skill(name)` tool reads full immutable bodies on
demand; the allowlist is implementation, TDD, debugging, code review and
Ponytail. Planning skills stay in the local coding session and are never loaded
by the cloud executor.

The review action's public inputs are exactly `api-key`, `base-url`, `model`,
`github-token`, `instructions` and `ignore`. The source-free OpenRouter
preflight has a separate exact interface: `api-key`, `required-models`, `model`,
`key-limit-usd`, `key-limit-reset` and `diagnostic-provider`. Authentication is
API-key-only. ChatGPT subscription OAuth is deferred in
`docs/codex-chatgpt-auth.md`.

## Agent skills

- **Issue tracker:** GitHub Issues in `dymoo/shipyard`. See
  `docs/agents/issue-tracker.md` for the operating model.
- **Triage labels:** Use the canonical Matt Pocock labels documented in
  `docs/agents/triage-labels.md`. Do not create one-off process labels.
- **Domain documentation:** This is a single-context repository; its tracked
  domain context lives in `docs/agents/domain.md`.
- **Shipyard local skill:** `skills/shipyard/SKILL.md` is the portable local-tool
  integration. It requires Matt Pocock's real skills and must not reproduce
  their workflows as an ad-hoc prompt.

## Layout

One responsibility per file. If you cannot say what a file is for in one line,
it needs splitting.

| File              | Owns                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `src/index.js`    | Orchestration. No business logic.                                        |
| `src/config.js`   | Six inputs, fixed limits and event resolution                            |
| `src/prompts.js`  | Every prompt. The product's actual IP.                                   |
| `src/schema.js`   | JSON Schemas for structured replies. Authoritative.                      |
| `src/review.js`   | The model passes: find and refute                                        |
| `src/findings.js` | The finding data model: normalise, merge, fingerprint                    |
| `src/diff.js`     | Diff parsing and comment anchoring                                       |
| `src/context.js`  | File selection, context widening, chunking                               |
| `src/codebase.js` | Base-commit project-rule discovery                                       |
| `src/repo.js`     | Repository access at the head commit                                     |
| `src/agent.js`    | Read-only tools and the bounded investigation loop                       |
| `src/llm.js`      | OpenAI-compatible client, defensive JSON                                 |
| `src/github.js`   | REST client                                                              |
| `src/post.js`     | Comment and summary rendering, posting                                   |
| `src/core.js`     | The small `@actions/core` replacement                                    |
| `preflight/`      | Source-free OpenRouter policy and route verification                     |
| `cloud-coder/`    | Separate Coder boundary: skills, mutable workspace and sandbox prototype |

Dependencies point one way: `index.js` → everything, and modules do not import
their callers. `post.js` must not import `review.js`; anything both need lives in
`findings.js` or `config.js`.

## Checks

There is no compiler, so the checks a compiler would give us are assembled
explicitly. All four must pass, and `npm run check-all` runs them:

| Command                | Catches                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `npm run format:check` | Formatting. Prettier decides; never hand-format.           |
| `npm run lint`         | Correctness and modern-JS discipline, plus JSDoc validity. |
| `npm run typecheck`    | `tsc --checkJs` reading the JSDoc annotations as types.    |
| `npm test`             | Behaviour.                                                 |

Fix what they report; do not silence them. A rule that is genuinely wrong for
this codebase gets turned off in `eslint.config.js` **with a comment saying
why** — as `jsdoc/check-tag-names` is, because JSDoc is this project's type
system and its `@typedef` tags are load-bearing rather than redundant.

## Style

- Plain ESM with JSDoc types. Annotate types in JSDoc; fix type errors by
  describing the type, not by loosening the checker.
- `const` by default, `let` only when reassigned, never `var`. `===` except
  against `null`. Template literals over concatenation.
- Every `catch` either handles the error or explains in a comment why it is safe
  to swallow. An empty, unexplained `catch` is how a failure becomes a mystery.
- An error thrown in place of a caught one carries the original as its `cause`.
- Async work that shares a cache caches the _promise_, not the result, so two
  concurrent callers cannot both start the same fetch.
- Prefer a named function at module scope over a nested arrow when it is more
  than a line or two.
- British spelling in prose and comments. Identifiers stay in whatever spelling
  the surrounding code and the GitHub API already use.

## Comments

Comments say **why**, never what. The code already says what.

```js
// Good — explains a decision the reader cannot infer:
// A snapped anchor points near the finding, not exactly at it, so a committable
// suggestion there would replace the wrong line.

// Bad — restates the code:
// Loop over the findings and push each one.
```

A comment that survives is one that would stop someone "simplifying" the line
away. If a line looks odd and is correct, say why it is correct.

## Deliberate shortcuts

Mark them, and name the ceiling and the upgrade path:

```js
// ponytail: chars/4 is close enough for budgeting; swap in a real tokenizer
// only if truncation starts biting.
```

A shortcut recorded this way is a decision. An unmarked shortcut is a bug
waiting for someone to discover it the hard way. The review treats the first as
fine and the second as a possible finding, so write the comment.

## Tests

`node:test`, no frameworks, no fixtures beyond `test/fixtures.js`, no network.

- Anchoring, chunking, JSON extraction and fingerprinting are where this class of
  tool breaks. A change to any of them lands with a test.
- Test names read as claims about behaviour: `snaps a near miss to the closest
changed line and flags it`, not `test anchorFinding 3`.
- Assert on behaviour, not on prose. Prompt tests match on content with
  whitespace normalised, never on where a line happens to wrap.
- `test/e2e.test.js` runs the real entrypoint against a stub GitHub API and a
  stub model. Anything touching orchestration, event handling or the request
  sequence belongs there.
- Cloud Coder tests must prove the admission gate, lazy allowlisted skill
  loading, workspace containment and Docker isolation without running Docker
  or repository code in the test process.

## Prompts

`src/prompts.js` is edited with the same care as code, because it is the
product.

- State the gates a finding must **pass**. Never write a list of things not to
  report — models underweight negation, so a "do not" line is the weakest
  instruction in the file.
- Every skeptic holds a kill mandate and defaults to "not real" when unsure. A
  false positive costs more than a missed nit.
- Skeptics never see the finder's severity or confidence. Those anchor.
- Untrusted material is fenced with BEGIN/END markers and labelled as data.
- The JSON shape a prompt asks for is the **fallback** description; `src/schema.js`
  is the authoritative contract sent to endpoints that support Structured
  Outputs. Change the schema and the prose together — `test/schema.test.js` fails
  if they drift.
- A token the model must emit and the parser must match (verdict words, side,
  the bot marker) is defined once in `config.js` and interpolated into both the
  prompt and the parser. Never hand-write it in two places.
- When you change a prompt, change the test that pins the behaviour you were
  relying on.

## Before opening a pull request

```bash
npm run check-all   # format, lint, typecheck, tests
```

Keep the diff to one purpose. If it does two things, it is two pull requests.

## Changelog

- 2026-08-04: Added the isolated Cloud Coder v1 security prototype: strict
  Issue Brief admission, lazy immutable implementation skills, contained
  workspace edits and a credential-free no-network Docker test boundary.
- 2026-08-04: Removed the review client's completion-token cap; providers and
  models now control output length while request and input-context limits remain
  fixed.
- 2026-08-04: Rebranded the product as Shipyard, a GitHub-first code factory;
  Cloud Coder dispatch now depends on Matt Pocock's local planning skills while
  Cloud Reviewer retains its separate read-only trust boundary.
- 2026-08-04: Configured Matt Pocock agent workflows for GitHub Issues,
  canonical triage labels and single-context domain documentation.
- 2026-08-01: v2.0.2 added a source-free OpenRouter preflight for exact key
  limits, effective model allowlists, ZDR routing and strict synthetic tool
  compatibility before source-bearing review.
- 2026-07-24: v2 narrowed the action to one context-aware review path, six
  inputs, three read-only tools and API-key authentication. Project rules now
  come from the base commit, and removed surfaces include chat, panels, depth
  presets, tuning knobs, suggestions, gates and output files.
