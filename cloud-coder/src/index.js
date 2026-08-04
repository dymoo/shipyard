import * as core from '../../src/core.js';
import { GitHub, HttpError } from '../../src/github.js';
import { LLM } from '../../src/llm.js';
import { openArchiveRepo } from '../../src/repo.js';
import { runCoder } from './agent.js';
import { branchForIssue, createDraftPull, deleteBranch, publishChanges } from './broker.js';
import {
  assertAdmissibleIssue,
  modelForComplexity,
  parseAgentBrief,
  readConfig,
  readIssueEvent,
  reasoningEffortForComplexity,
} from './config.js';
import { runSandbox } from './sandbox.js';
import { Workspace } from './workspace.js';

async function main() {
  const config = readConfig();
  const ctx = readIssueEvent();
  if (ctx.skip) {
    core.info(`Nothing to do: ${ctx.skip}.`);
    setOutputs(false);
    return;
  }

  const gh = new GitHub(config.githubToken, { apiUrl: config.githubApiUrl });
  const issue = await gh
    .request('GET', `/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.issueNumber}`)
    .then((result) => result.data);
  assertAdmissibleIssue(issue);
  const brief = parseAgentBrief(issue.body);
  const branch = branchForIssue(issue.number);
  await assertNoActivePull(gh, ctx, branch);
  await assertNoExistingBranch(gh, ctx, branch);

  const repository = await gh.request('GET', `/repos/${ctx.owner}/${ctx.repo}`).then((result) => result.data);
  const base = repository.default_branch;
  if (typeof base !== 'string' || !base) throw new Error('Repository did not supply a default branch.');
  const ref = await gh.request('GET', `/repos/${ctx.owner}/${ctx.repo}/git/ref/heads/${encodeURIComponent(base)}`);
  const baseSha = ref.data?.object?.sha;
  if (typeof baseSha !== 'string' || !baseSha) throw new Error('Default branch did not resolve to a commit SHA.');

  const repo = await openArchiveRepo(gh, { owner: ctx.owner, repo: ctx.repo, sha: baseSha });
  try {
    if (!repo.root) throw new Error('Cloud Coder requires an extracted repository workspace.');
    const workspace = new Workspace(repo.root);
    const model = modelForComplexity(config, brief.complexity);
    const reasoningEffort = reasoningEffortForComplexity(config, brief.complexity);
    core.info(`Coding Issue #${issue.number} at complexity ${brief.complexity} with ${model} (${reasoningEffort}).`);
    const llm = new LLM({ ...config, model, reasoningEffort });
    const coding = await runCoder(llm, {
      brief: issue.body,
      workspace,
      sandboxImage: config.sandboxImage,
      testCommand: brief.testCommand,
    });
    const changes = workspace.changes();
    if (!coding.finished || !changes.length) {
      throw new Error('Cloud Coder finished without a tested workspace change; no branch or pull request was created.');
    }

    // The final run is authoritative: the model could edit again after an
    // earlier tool-triggered test, so a previous green result is not enough.
    const test = await runSandbox(workspace.root, { image: config.sandboxImage, command: brief.testCommand });
    if (!test.passed) throw new Error(`Cloud Coder sandbox test failed:\n${test.output}`);

    await publishChanges(gh, {
      owner: ctx.owner,
      repo: ctx.repo,
      baseSha,
      branch,
      changes,
      message: `Shipyard: implement #${issue.number}`,
    });
    let pull;
    try {
      pull = await createDraftPull(gh, { owner: ctx.owner, repo: ctx.repo, branch, base, issue });
    } catch (error) {
      await deleteBranch(gh, { owner: ctx.owner, repo: ctx.repo, branch }).catch(() => null);
      throw error;
    }
    await gh
      .createIssueComment(
        ctx.owner,
        ctx.repo,
        issue.number,
        `Shipyard Cloud Coder created draft PR #${pull.number} after ${coding.calls} tool calls and ${coding.tests + 1} test run(s).\n\n${coding.summary}`,
      )
      .catch((error) =>
        core.warning(`Draft PR was created, but the run comment could not be posted: ${error.message}`),
      );
    core.info(`Created draft PR #${pull.number} for Issue #${issue.number}.`);
    setOutputs(true, pull.number);
  } finally {
    await repo.close();
  }
}

async function assertNoActivePull(gh, { owner, repo }, branch) {
  const pulls = await gh.request(
    'GET',
    `/repos/${owner}/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`,
  );
  if (Array.isArray(pulls.data) && pulls.data.length) {
    throw new Error(`Cloud Coder already has an active pull request for ${branch}.`);
  }
}

async function assertNoExistingBranch(gh, { owner, repo }, branch) {
  try {
    await gh.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return;
    throw error;
  }
  throw new Error(`Cloud Coder branch ${branch} already exists without an active pull request.`);
}

function setOutputs(dispatched, pull = '') {
  core.setOutput('dispatched', String(dispatched));
  core.setOutput('pull-request', String(pull));
}

main().catch((error) => core.setFailed(error?.stack || String(error)));
