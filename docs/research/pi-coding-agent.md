# Pi coding agent: small core, broad capability

Research date: 2026-08-04. Compaction details were verified against Pi's
official documentation and source snapshots: [`agent-session.ts` at `ab5f8d8`,
committed 2026-08-04 09:05 UTC](https://github.com/earendil-works/pi/blob/ab5f8d88ee1d400c0c8fb5c50ac10b2f4a4851d1/packages/coding-agent/src/core/agent-session.ts),
[`compaction.ts` at `9b3a205`, committed 2026-07-22 21:54 UTC](https://github.com/earendil-works/pi/blob/9b3a2059171bcc74ad9d2cadeea6d186776cf2db/packages/coding-agent/src/core/compaction/compaction.ts),
and [the compaction documentation at `786c76c`, committed 2026-08-03 11:41
UTC](https://github.com/earendil-works/pi/blob/786c76cb76bea452fa7287cc1014c4a3d3cad2b1/packages/coding-agent/docs/compaction.md).

## Executive finding

Pi stays capable by separating a deliberately small agent loop and default tool
set from workflow policy. The default SDK session exposes only `read`, `bash`,
`edit`, and `write`; `grep`, `find`, and `ls` are optional built-ins. Features
such as sub-agents, plan mode, permission prompts, MCP, to-dos, and background
shells are intentionally absent from the core. Pi expects extensions, skills,
prompt templates, packages, ordinary CLI programs, or external isolation to add
them when needed. This is an explicit product principle, not an unfinished
feature list. [README: introduction and philosophy](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#philosophy)
[SDK: tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#tools)

## Where the capability lives

### Minimal core and tool surface

- The agent core maintains messages, model, system prompt, tools and streaming
  state; capability is supplied as tools rather than hard-coded workflows.
  `createAgentSession()` can select an exact tool allowlist, disable all tools,
  or disable only built-ins while retaining explicitly supplied extension tools.
  [SDK: Agent state and tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#agent-and-agentstate)
  [SDK: tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#tools)
- Pi's seven built-ins are primitives: file reading/writing/editing, shell
  execution, and search/listing. Its normal coding set is the smaller four-tool
  subset. Custom tools use the same typed definition and execution contract and
  can be combined with, or replace, built-ins.
  [SDK: custom tools](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#custom-tools)
- This keeps orchestration generic. Workflow features remain optional because
  extensions can register tools and commands, subscribe to lifecycle events,
  replace built-ins, and provide alternative tool operations for containers,
  SSH, or other remote execution backends.
  [Extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)

### SDK, extensions, and the resource loader

- The coding-agent package is both the CLI and its embedding SDK. A minimal
  integration creates a session, subscribes to events, and prompts it; RPC mode
  offers a JSONL subprocess boundary for non-Node hosts.
  [SDK: quick start](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#quick-start)
  [README: programmatic usage](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#programmatic-usage)
- `ResourceLoader` is the capability assembly seam. The default loader discovers
  extensions, skills, prompt templates, themes, and context files. Embedders can
  inject a custom loader or override each resource class independently, so the
  session factory does not need workflow-specific discovery logic.
  [SDK: core concepts](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#core-concepts)
  [SDK: ResourceLoader](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#resourceloader)
- Pi packages are only distribution: an npm/git package can bundle extensions,
  skills, prompts, and themes, with a manifest or conventional directories.
  This grows the ecosystem without expanding the core contract.
  [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)

### Skills, context, and prompt customisation

- Context files (`AGENTS.md` or `CLAUDE.md`) provide persistent project rules.
  Pi walks from the working directory through its parents and concatenates
  matching files with the global context file.
  [README: context files](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#context-files)
- Skills are on-demand instruction packages following the Agent Skills format;
  the system prompt advertises their names/descriptions and the agent reads the
  selected `SKILL.md` when needed. Prompt templates are reusable Markdown prompt
  expansions. System-prompt override/append hooks cover the remaining embedding
  cases without changing the agent loop.
  [README: skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#skills)
  [SDK: skills and context](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#skills)
  [SDK: system prompt](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#system-prompt)

### Sessions and compaction

- Sessions are append-only JSONL trees linked by entry `id` and `parentId`, so
  branching, resuming, forking, and audit history share one simple persistence
  model. The SDK also supports in-memory sessions for ephemeral automation.
  [Sessions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md)
  [SDK: session management](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#session-management)
- Pi's proactive trigger is `contextTokens > contextWindow - reserveTokens`.
  Its defaults are a 16,384-token response reserve and a 20,000-token recent
  raw-message tail. It normally cuts on turn boundaries, never at a tool result;
  if one turn exceeds the tail budget, it separately summarises the early part
  of that turn. Context usage prefers the provider's latest valid usage and
  estimates only trailing messages, falling back to a characters/4 estimate.
  [Trigger and defaults](https://github.com/earendil-works/pi/blob/9b3a2059171bcc74ad9d2cadeea6d186776cf2db/packages/coding-agent/src/core/compaction/compaction.ts#L116-L220)
  [Cut-point implementation](https://github.com/earendil-works/pi/blob/9b3a2059171bcc74ad9d2cadeea6d186776cf2db/packages/coding-agent/src/core/compaction/compaction.ts#L287-L429)
- The generated checkpoint has fixed sections for goal, constraints, done/in
  progress/blocked work, decisions, next steps and critical context, with exact
  paths, function names and errors called out for preservation. On later
  compactions, Pi asks the model to merge the previous summary with the newly
  compacted messages. Read and modified file lists are accumulated separately
  in structured compaction metadata. The checkpoint plus the recent raw tail is
  sent to the model; the complete append-only JSONL history remains available
  for audit, resume and branching.
  [Summary contract and iterative merge](https://github.com/earendil-works/pi/blob/9b3a2059171bcc74ad9d2cadeea6d186776cf2db/packages/coding-agent/src/core/compaction/compaction.ts#L435-L639)
  [Preparation and cumulative state](https://github.com/earendil-works/pi/blob/9b3a2059171bcc74ad9d2cadeea6d186776cf2db/packages/coding-agent/src/core/compaction/compaction.ts#L643-L706)
- Pi also recovers from a hard overflow or recoverable truncated response: it
  removes the failed assistant response from active context, compacts, and
  retries the interrupted turn exactly once. A second overflow fails visibly.
  Stale pre-compaction usage cannot immediately retrigger compaction, and
  summarisation calls use the normal bounded transient-error retry policy
  (three attempts by default, with exponential backoff). A failed summary does
  not silently replace history.
  [Overflow and stale-usage safeguards](https://github.com/earendil-works/pi/blob/ab5f8d88ee1d400c0c8fb5c50ac10b2f4a4851d1/packages/coding-agent/src/core/agent-session.ts#L1814-L1909)
  [Compaction execution](https://github.com/earendil-works/pi/blob/ab5f8d88ee1d400c0c8fb5c50ac10b2f4a4851d1/packages/coding-agent/src/core/agent-session.ts#L1911-L2068)
  [Retry defaults](https://github.com/earendil-works/pi/blob/b103937d3c003a48d32de9763856f2dae55ab605/packages/coding-agent/docs/settings.md#retry)

### Sandbox and credential boundaries

- Pi does **not** claim that its core is a sandbox. It deliberately omits
  permission popups and recommends a container or an environment-specific
  extension for confirmation and isolation. Its package documentation is more
  explicit: extensions execute arbitrary code and skills can direct executable
  actions, so packages have full system access.
  [README: philosophy](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#philosophy)
  [Pi packages: security warning](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md#install-and-manage)
  [Official sandbox extension example](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/sandbox)
- Project trust is a resource-loading boundary, not an execution sandbox. Until
  a project is trusted, Pi withholds project settings, extensions, and packages;
  non-interactive runs default to ignoring them unless configured or explicitly
  approved. Context files still load before trust, so their content must remain
  untrusted instructions.
  [README: project trust](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#project-trust)
- Authentication is injectable. Runtime API-key overrides are not persisted;
  embedders may provide custom paths or an in-memory credential store. Stored
  credentials and environment variables remain fallback sources in the default
  runtime.
  [SDK: API keys and OAuth](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md#api-keys-and-oauth)

## Implications for Shipyard Cloud Coder

1. **Copy the seam, not the whole product.** Keep Cloud Coder's loop to model
   calls, message state, an explicit tool registry, bounded retries, and event
   output. Agent Brief handling, test strategy, adversarial repair, GitHub
   handoff, and future workflows should compose around that loop.
2. **Start with the fewest capability-bearing tools.** A shell plus precise
   file read/edit primitives is enough for broad coding work. Add a distinct
   tool only when it creates an enforceable boundary or materially improves
   model reliability; never mirror every underlying API as a model tool.
3. **Make one controlled resource loader.** Load only Shipyard-owned prompts,
   approved skills, the fully specified Agent Brief, and base-commit policy.
   Advertise skill names/descriptions in the base prompt and expose a typed
   `load_skill(name)` tool for complete immutable bodies on demand. Disable
   ambient global/project discovery in CI. In particular, never execute
   pull-request-provided extensions or package hooks, and treat head-commit
   instructions as evidence rather than policy.
4. **Put security below the tool API.** Run the entire coder in a disposable
   container with scoped filesystem, network, process, CPU, memory, and time
   limits. Tool allowlists and approval prompts are useful policy controls but
   are not sandbox boundaries. Implement filesystem and shell operations through
   a replaceable sandbox backend, matching Pi's pluggable operations seam.
5. **Use ephemeral credentials.** Inject the model key and narrowly scoped
   GitHub credential at runtime, outside the writable workspace; do not persist
   them in session logs, settings, artifacts, or the container image. Keep the
   model-facing tool process credential-free where feasible and broker required
   GitHub operations through a narrower host boundary.
6. **Preserve an append-only execution record.** A JSONL event/session log gives
   retries, compaction, repair passes, and handoff one auditable history. Keep
   full tool inputs/results in the secured job record while sending only bounded
   recent context plus structured summaries back to the model.
7. **Compact for quality, not merely overflow.** Trigger before an LLM call when
   active input reaches the lower of the provider-safe limit
   (`contextWindow - responseReserve`) and a model-specific quality ceiling.
   Start with a conservative 200,000-token ceiling and Pi's 20,000-token recent
   tail; tune the ceiling per model from accepted-PR evidence. This deliberately
   avoids relying on nominal million-token windows after useful coding quality
   has already degraded.
8. **Treat the checkpoint as lossy, model-facing state.** Keep the Agent Brief,
   base-commit project policy, current workspace/diff and test results as
   host-owned authoritative state. The checkpoint should carry goal,
   constraints, decisions, progress, unresolved failures, next steps and exact
   paths/symbols/errors; track read/modified files and completed tests in typed
   host metadata rather than trusting prose alone. Send the checkpoint plus the
   recent raw tail, while retaining a full append-only event log outside model
   context.
9. **Use Pi's bounded recovery shape.** Recalculate context after compaction;
   reject a checkpoint that does not materially reduce it; retry transient
   summary failures within the existing request retry budget; and permit only
   one overflow compact-and-retry for a model turn before failing visibly. The
   first Shipyard version only needs automatic in-job compaction to solve long
   coding/review runs. Cross-job resume can later rebuild from the same
   checkpoint, host metadata and immutable workspace artifact without changing
   the model-facing format.
10. **Keep Cloud Coder's runtime separate from Cloud Reviewer.** Current Pi main
    requires Node `>=22.19.0`, while this repository's reviewer action has a
    load-bearing Node 20 floor. Embed Pi in a separate action/container runtime,
    or deliberately pin and verify a compatible Pi release; do not raise the
    reviewer's runtime as collateral work.
    [Pi package engine requirement](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/package.json#L646-L649)

The central lesson is architectural: a small core remains powerful when its
few extension points are deep, capability-bearing, and host-controlled. For
Cloud Coder, Pi's extensibility model is useful; Pi's default local trust model
is not sufficient for untrusted pull-request code and must be replaced by
mandatory process isolation and explicit resource selection.
