# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/dymoo/commitreview/security/advisories/new).
Do not open a public issue for an exploitable report.

## Threat model

commitreview runs inside GitHub Actions. There is no hosted service or
telemetry. The review action makes network requests to exactly two configured
authorities: GitHub's API and the required `base-url`. The optional preflight
has one fixed authority, `https://openrouter.ai/api/v1`, and never contacts
GitHub or a consumer-configured endpoint.

**Credentials.** The model API key and GitHub token are registered with the
runner's secret masker immediately after they are read. The review model key is
sent only to `base-url` in an `Authorization` header; the preflight key is sent
only to its fixed OpenRouter authority. There is no default or fallback model
endpoint.

**OpenRouter routing.** When `base-url` is exactly
`https://openrouter.ai/api/v1`, every request requires an OpenRouter endpoint
with data collection denied and Zero Data Retention enabled. It also requires
support for all request parameters. If no matching endpoint is available, the
review fails rather than relaxing those constraints or falling back to another
model. Other configured endpoints receive no OpenRouter-specific routing
fields, including proxies that happen to implement an OpenRouter-compatible
interface.

The optional `preflight/` action is a source-free fail-closed gate for
OpenRouter consumers. It validates the live API key's exact spend limit and
reset interval, effective model allowlist, current ZDR endpoint availability,
and a strict synthetic tool route. Run it directly before the source-bearing
review step so replacing the secret cannot silently reuse an earlier result.
Its optional single-provider diagnostic reports strict-route ineligibility only
when OpenRouter returns its documented 404 with zero-attempt routing metadata.
That result does not attribute the exclusion to any single guardrail or privacy
setting. Provider outages and ambiguous errors fail the preflight.

**Data sent to the model.** A review can send the pull request title,
description and focused mention; changed hunks and surrounding source;
repository instruction documents from the base commit; and non-ignored
repository files selected by the read-only investigation. This is intentionally
broader than the diff.
Paths matching `ignore` are excluded from file selection, instruction discovery
and agent tools. The built-in list covers generated, vendored and build output,
not secrets; add sensitive paths explicitly.

**Untrusted input.** A pull request author controls code, file names and pull
request prose that reach the model. Prompts fence these as data, but prompt
instructions are not a security boundary. Treat findings as untrusted advice
and never automate merges from them.

**Pull request code is never executed.** The action downloads GitHub's repository
snapshot at the head commit, extracts it to a temporary directory and reads
files. It does not run, build, install or check out the pull request. Reads
reject traversal, backslashes and paths outside the snapshot; symlink targets
are resolved and checked before reading. The temporary snapshot is removed after
context collection, including on failure.

This makes `pull_request_target` safe for the recommended workflow only while
that workflow also avoids checking out or executing the pull request head.

**Agent boundary.** The model has only `list_files`, `read_file` and exact-text
`search`. Calls are bounded and respect ignores. There is no write tool, shell,
repository-code execution or agent network access. Endpoints that reject tool
calling fail rather than silently degrading.

**Posted model text.** GitHub sanitises rendered Markdown. commitreview also
neutralises user mentions and strips its reserved fingerprint markers from
model-authored prose before posting it.

**Who can spend the key.** Automatic `pull_request` and `pull_request_target`
events are not author-gated; on a public repository, any opened pull request can
cause a review. The `@commitreview` comment trigger is fixed to repository
owners, members and collaborators. There is no input that disables that gate.

**Permissions.** The action needs `contents: read` and
`pull-requests: write`. It never writes repository contents, pushes, approves or
requests changes. Reviews use the `COMMENT` event.

## Supply chain

There are no runtime dependencies and no bundled build output. The root and
preflight `action.yml` files run their source directly on Node 20, so the
audited source is the executed source. Pin an immutable release when required:

```yaml
- uses: dymoo/commitreview@v2.0.2
```
