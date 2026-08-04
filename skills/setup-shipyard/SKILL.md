---
name: setup-shipyard
description: Verify Matt Pocock's real skills, then safely install and configure Shipyard's GitHub Actions factory and repository agent instructions.
---

# Set up Shipyard

Use this skill once in a repository before its local coding session uses the
`shipyard` skill to define or dispatch work. This is a bootstrap skill, not an
implementation-planning workflow.

## Hard dependency

Before editing the target repository, inspect the local tool's _available skill
registry_ for these real Matt Pocock skills:

```text
triage
wayfinder
to-spec
to-tickets
implement
tdd
code-review
```

If any are absent, report the exact missing names and stop. Do not imitate the
missing workflow with a generic prompt, partially configure GitHub Actions, or
apply `ready-for-agent`. Install or configure Matt's real skills in the local
tool, then run `setup-shipyard` again.

## Discover before changing anything

Read the target repository's root `AGENTS.md` and `CLAUDE.md` when present, its
existing GitHub Actions workflows, package/test commands, and `git remote -v`.
Confirm that GitHub Actions is the intended execution platform.

Collect these values from existing repository configuration or ask the user;
never invent them:

- a **dedicated** self-hosted runner label with Docker, such as an ARC scale-set
  release name; never fall back to the broad `self-hosted` label;
- the OpenAI-compatible API base URL, reviewer model, low-tier Coder model and
  high-tier Coder model;
- the optional reasoning effort for each Coder tier;
- a SHA-256 digest-pinned Docker image containing the target repository's test
  toolchain;
- names of the existing model-key and hand-off-token Actions secrets, or
  confirmation that the maintainer will create `LLM_API_KEY` and
  `SHIPYARD_HANDOFF_TOKEN`.

Do not print, write, or request secret values in an Issue, pull request,
workflow file, repository Variable, model prompt, or command output.

Before editing workflows, run the bundled validator in `preflight` mode with the
confirmed non-secret values. It rejects a broad runner, invalid secret name,
un-pinned image, invalid endpoint, or missing model selection before any target
repository file changes:

```text
node /path/to/setup-shipyard/validate.mjs --mode preflight --root /path/to/repo \
  --runner-label dedicated-runner --model-secret LLM_API_KEY \
  --handoff-secret SHIPYARD_HANDOFF_TOKEN --sandbox-image registry/image@sha256:<64-lowercase-hex> \
  --base-url https://provider.example/v1 --reviewer-model provider/reviewer \
  --low-complexity-model provider/low --high-complexity-model provider/high
```

## Install the factory

1. Start from Shipyard's maintained, versioned workflow examples:

   - Reviewer: `examples/workflows/shipyard-reviewer.yml`, using
     `dymoo/shipyard@v3`.
   - Coder: `examples/workflows/shipyard-coder.yml`, using
     `dymoo/shipyard/cloud-coder@v4`.

   Install the canonical Reviewer and Coder jobs from those examples into
   `.github/workflows/shipyard-reviewer.yml` and
   `.github/workflows/shipyard-coder.yml`. If either file exists, audit every
   reachable job before changing it. Preserve unrelated jobs, steps, actions
   and permissions unchanged. Replace only an unambiguously identified Shipyard
   job with the canonical job. If the canonical workflow file cannot be safely
   partitioned from unrelated jobs or has an unsafe reachable
   `pull_request_target` path, stop and ask the maintainer to separate the
   workflows first; never delete unrelated automation. Never retain arbitrary
   existing steps, actions, permissions, inputs, or
   checkout/install/build/shell behaviour **inside the Shipyard job**.

2. Replace the example runner label and sandbox-image placeholder with the
   confirmed dedicated label and digest. Do not add checkout, install, build or
   shell steps to the Reviewer workflow. Both actions receive only their
   documented inputs. When discovery found existing secret names, replace
   `secrets.LLM_API_KEY` and `secrets.SHIPYARD_HANDOFF_TOKEN` in both copied
   workflows with those names; otherwise create secrets with exactly the example
   names. The Coder and Reviewer must reference the same hand-off secret name.

3. Configure repository **Variables**, never action defaults:

   ```text
   LLM_BASE_URL
   LLM_MODEL
   SHIPYARD_CODER_LOW_COMPLEXITY_MODEL
   SHIPYARD_CODER_HIGH_COMPLEXITY_MODEL
   SHIPYARD_CODER_LOW_COMPLEXITY_REASONING_EFFORT   # optional
   SHIPYARD_CODER_HIGH_COMPLEXITY_REASONING_EFFORT  # optional
   SHIPYARD_CODER_READY=false
   ```

   Ensure the confirmed model-key and shared hand-off-token names are Actions
   secrets. Immediately before enabling, use `gh secret list` to confirm both
   names exist and get the maintainer's explicit confirmation that both secret
   values are active after their latest rotation. Do not enable Coder by setting
   `SHIPYARD_CODER_READY=true` until that verification, its model Variables,
   dedicated runner, and pinned test image are all confirmed. Clear
   `SHIPYARD_CODER_READY` before either secret is removed or rotated, then repeat
   this verification before enabling it again.

4. Merge this focused section into the target repository's root `AGENTS.md`.
   Preserve all existing instructions and do not create a personal-only file.

   ```md
   ## Shipyard

   The local Codex or Claude Code session owns Matt Pocock planning skills,
   ticket quality, escalation and final merge judgement. Shipyard runs bounded
   Coder and independent Reviewer work in GitHub Actions; it never auto-merges.

   Apply `ready-for-agent` only to an open GitHub Issue with a complete Agent
   Brief: desired behaviour, non-goals, acceptance checks, exact test command,
   affected boundary, dependencies or blockers, risks, and complexity 1–5.
   Do not dispatch vague initiatives, fork work, or work without Matt's real
   skills available locally.

   Coder requires a dedicated Docker-capable runner and a digest-pinned test
   image. Keep `SHIPYARD_CODER_READY` false until the required Actions secrets
   are confirmed active, model Variables, runner, and image are configured.
   Clear it before either secret rotates. Coder may create a draft PR and
   perform one bounded repair after Cloud Reviewer findings; the local session
   or a human decides whether to merge.
   ```

5. Update the target repository's human README with a short Shipyard setup link
   when it has contributor setup documentation. Point to the versioned
   workflows, required Variables/secrets, dedicated runner requirement, and the
   fact that the local `shipyard` skill—not the cloud agent—creates Agent
   Briefs.

## Validate and enable deliberately

1. Review the complete workflow and `AGENTS.md` diff. Run the target
   repository's normal formatting, lint, type and test checks when they exist.
2. With `gh`, verify workflow files are present and use `gh secret list` to
   confirm both required secret names immediately before enablement. Confirm both
   Coder and Reviewer use the confirmed dedicated runner label. Confirm Coder
   also uses a real digest and the `SHIPYARD_CODER_READY == 'true'` admission
   condition.
3. Confirm the reviewer still has no checkout, no execution of pull-request
   code, and no model-controlled write path.
4. Only after the maintainer has confirmed active secret values and all
   configuration is confirmed, set `SHIPYARD_CODER_READY=true`. Leave it false
   when any dependency is pending, and clear it before a secret rotation or
   removal. Do not manufacture a test Issue or apply `ready-for-agent` merely
   to prove installation.
5. Run the bundled validator again in `installed` mode with the same values.
   It checks both workflow files, exact action versions, runner labels, configured
   secret references, Coder image/readiness, Reviewer no-checkout/no-shell
   boundary, and the target `AGENTS.md` section. Do not call setup complete
   unless it passes.

## Hand off to normal Shipyard operation

Report the installed workflow paths, runner label, non-secret Variables, secret
_names_ only, whether Coder is enabled, and any blocker. Then use the
`shipyard` skill for triage, Wayfinder, Agent Briefs and final local review.
