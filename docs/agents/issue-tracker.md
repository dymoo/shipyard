# GitHub Issues workflow

GitHub Issues is the source of truth for work in this repository. Pull
requests are implementation and review surfaces, not a substitute backlog.

## Triage and execution

Use Matt Pocock's workflow in this order:

1. `/triage` collects context, tests the request against the repository, and
   publishes a durable Agent Brief.
2. `/wayfinder` maps a large or uncertain initiative into a spec and
   dependency-ordered leaf tickets before implementation starts.
3. `/to-spec` and `/to-tickets` publish the approved work. A leaf ticket is
   labelled `ready-for-agent` only when it is safe for a fresh agent to run
   AFK.
4. `/implement`, with TDD and code review, completes one ticket in a fresh
   context. Each ticket must fit one context window.

The canonical lifecycle labels are documented in
[`triage-labels.md`](triage-labels.md). An item has exactly one lifecycle label
at a time.

## Cloud-coder eligibility

`ready-for-agent` is the universal readiness gate. The cloud-coder workflow
only dispatches an item when its latest Agent Brief declares an implementation
complexity score, named acceptance checks, affected boundary, test command, and
any dependency or blocker. The score selects an execution tier; it is not a
reason to leave well-defined work unimplemented.

Use this five-point scale in every Agent Brief:

| Score | Meaning                                                                            | Execution tier                       |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------ |
| 1     | Local, mechanical change with a focused test                                       | GPT-5.6 Luna, xhigh                  |
| 2     | Contained change with known files and checks                                       | GPT-5.6 Luna, xhigh                  |
| 3     | Moderate, well-specified multi-file change                                         | GPT-5.6 Luna, xhigh                  |
| 4     | Cross-cutting but fully specified change                                           | GPT-5.6 Terra, high/xhigh            |
| 5     | Architectural, migration, security, or broad change with an approved specification | GPT-5.6 Terra, high/xhigh and review |

The score is an explicit routing decision, not an estimate of engineering
effort. It must not substitute for the acceptance checks or turn vague work
into an executable ticket. Scores 4–5 require an adversarial-review pass and
the same final local Codex, Claude Code or human merge decision; the v1
workflow never auto-merges.

The cloud coder refuses incomplete, blocked, or fork-originated work rather
than guessing.

## Draft-PR hand-off

The cloud coder works only on an eligible issue or a trusted same-repository
draft pull request. It creates or updates a draft pull request, runs the
repository's checks, and performs a bounded adversarial-review-and-repair pass.
It then removes `ready-for-agent`, applies `ready-for-human`, and leaves a
handoff comment with the Agent Brief, commands run, commits, review findings,
and remaining risks.

`ready-for-human` means the user's local Codex or Claude Code session, or a
human, decides whether to request more work, merge, or return the item to
triage. The v1 workflow never auto-merges and never executes a fork pull
request.
