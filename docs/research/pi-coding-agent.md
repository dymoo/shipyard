# Pi coding agent: small core, broad capability

Research date: 2026-08-04. Sources are limited to Pi's official documentation
and source repository.

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
- Compaction is a replaceable context-management policy. It summarizes older
  turns, retains a configurable recent window, records the summary as another
  session entry, and leaves the complete source history in JSONL. It triggers
  proactively near the model limit or reactively after overflow; extensions can
  provide custom compaction and branch summarisation.
  [Compaction internals](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md)
  [README: compaction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md#compaction)

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
7. **Treat compaction as lossy state reconstruction.** Its summary must preserve
   the Agent Brief, invariants, changed/read files, test outcomes, unresolved
   failures, and remaining work. Never let compaction replace the authoritative
   brief or diff, and validate the final workspace independently of the summary.
8. **Keep Cloud Coder's runtime separate from Cloud Reviewer.** Current Pi main
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
