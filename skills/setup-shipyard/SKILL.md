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

## Install the factory

1. Start from Shipyard's maintained, versioned workflow examples:

   - Reviewer: `examples/workflows/shipyard-reviewer.yml`, using
     `dymoo/shipyard@v3`.
   - Coder: `examples/workflows/shipyard-coder.yml`, using
     `dymoo/shipyard/cloud-coder@v4`.

   Merge them into `.github/workflows/shipyard-reviewer.yml` and
   `.github/workflows/shipyard-coder.yml`. If either file exists, preserve its
   repository-specific triggers and permissions unless they weaken Shipyard's
   trust boundary; do not overwrite it blindly.

2. Replace the example runner label and sandbox-image placeholder with the
   confirmed dedicated label and digest. Do not add checkout, install, build or
   shell steps to the Reviewer workflow. Both actions receive only their
   documented inputs.

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

   Configure the model key and `SHIPYARD_HANDOFF_TOKEN` as Actions secrets.
   Inspect only secret names when validating setup. Do not enable Coder by
   setting `SHIPYARD_CODER_READY=true` until its two secret names, model
   Variables, dedicated runner, and pinned test image are all confirmed.

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
   image. Keep `SHIPYARD_CODER_READY` false until the required Actions secrets,
   model Variables, runner, and image are configured. Coder may create a draft
   PR and perform one bounded repair after Cloud Reviewer findings; the local
   session or a human decides whether to merge.
   ```

5. Update the target repository's human README with a short Shipyard setup link
   when it has contributor setup documentation. Point to the versioned
   workflows, required Variables/secrets, dedicated runner requirement, and the
   fact that the local `shipyard` skill—not the cloud agent—creates Agent
   Briefs.

## Validate and enable deliberately

1. Review the complete workflow and `AGENTS.md` diff. Run the target
   repository's normal formatting, lint, type and test checks when they exist.
2. With `gh`, verify workflow files are present; list Variables and secret names
   only. Confirm the Coder workflow uses a dedicated runner label, a real
   digest, and the `SHIPYARD_CODER_READY == 'true'` admission condition.
3. Confirm the reviewer still has no checkout, no execution of pull-request
   code, and no model-controlled write path.
4. Only after all configuration is confirmed, set `SHIPYARD_CODER_READY=true`.
   Leave it false when any dependency is pending. Do not manufacture a test
   Issue or apply `ready-for-agent` merely to prove installation.

## Hand off to normal Shipyard operation

Report the installed workflow paths, runner label, non-secret Variables, secret
_names_ only, whether Coder is enabled, and any blocker. Then use the
`shipyard` skill for triage, Wayfinder, Agent Briefs and final local review.
