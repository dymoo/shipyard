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
