import { isSafeRepoPath } from '../../src/repo.js';

export function branchForIssue(number) {
  if (!Number.isInteger(number) || number < 1) throw new Error('Cloud Coder requires a positive Issue number.');
  return `shipyard/issue-${number}`;
}

/** Create a branch, commit an already-tested workspace delta, and never force an update. */
export async function publishChanges(gh, { owner, repo, baseSha, baseBranch, branch, changes, message }) {
  if (!branch.startsWith('shipyard/issue-') || !changes.length) {
    throw new Error('Cloud Coder requires a Shipyard branch and at least one workspace change.');
  }
  if (typeof baseBranch !== 'string' || !baseBranch)
    throw new Error('Cloud Coder requires the current base branch name.');
  validateChanges(changes);

  const encodedBranch = encodeURIComponent(branch);
  let branchCreated = false;
  try {
    const currentBase = await gh.request(
      'GET',
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`,
    );
    if (currentBase.data?.object?.sha !== baseSha) {
      throw new Error('Cloud Coder base branch moved during implementation; refusing to publish stale work.');
    }
    await gh.request('POST', `/repos/${owner}/${repo}/git/refs`, {
      body: { ref: `refs/heads/${branch}`, sha: baseSha },
    });
    branchCreated = true;
    const nextCommit = await createCommit(gh, { owner, repo, parent: baseSha, changes, message });
    await gh.request('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${encodedBranch}`, {
      body: { sha: nextCommit.data.sha, force: false },
    });
    return nextCommit.data.sha;
  } catch (error) {
    if (branchCreated) await deleteBranch(gh, { owner, repo, branch }).catch(() => null);
    throw error;
  }
}

export function deleteBranch(gh, { owner, repo, branch }) {
  return gh.request('DELETE', `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`);
}

/** Add one tested repair commit to the exact pull-request head, never force-pushing. */
export async function appendChanges(gh, { owner, repo, branch, expectedSha, changes, message }) {
  if (!changes.length) throw new Error('Cloud Coder repair requires at least one workspace change.');
  validateChanges(changes);
  const encodedBranch = encodeURIComponent(branch);
  const ref = await gh.request('GET', `/repos/${owner}/${repo}/git/ref/heads/${encodedBranch}`);
  const parent = ref.data?.object?.sha;
  if (parent !== expectedSha) throw new Error('Cloud Coder repair branch moved; refusing to overwrite it.');
  const nextCommit = await createCommit(gh, { owner, repo, parent, changes, message });
  await gh.request('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${encodedBranch}`, {
    body: { sha: nextCommit.data.sha, force: false },
  });
  return nextCommit.data.sha;
}

function validateChanges(changes) {
  for (const change of changes) {
    if (!isSafeRepoPath(change.path)) {
      throw new Error(`Cloud Coder change is not a safe repository path: ${change.path}`);
    }
    if (change.content !== null && typeof change.content !== 'string') {
      throw new Error(`Cloud Coder change content must be text or deletion: ${change.path}`);
    }
  }
}

/** Build one commit while retaining executable bits from the parent tree. */
async function createCommit(gh, { owner, repo, parent, changes, message }) {
  const commit = await gh.request('GET', `/repos/${owner}/${repo}/git/commits/${encodeURIComponent(parent)}`);
  const baseTree = commit.data?.tree?.sha;
  if (typeof baseTree !== 'string' || !baseTree) throw new Error('GitHub did not return the parent commit tree.');
  const entries = await gh.request(
    'GET',
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(baseTree)}?recursive=1`,
  );
  if (!Array.isArray(entries.data?.tree)) throw new Error('GitHub did not return the parent tree entries.');
  const modes = new Map(entries.data.tree.map((entry) => [entry.path, entry.mode]));
  const tree = [];
  for (const change of changes) {
    const existingMode = modes.get(change.path);
    if (existingMode && !['100644', '100755'].includes(existingMode)) {
      throw new Error(`Cloud Coder cannot replace a non-regular repository entry: ${change.path}`);
    }
    const mode = existingMode || '100644';
    if (change.content === null) {
      tree.push({ path: change.path, mode, type: 'blob', sha: null });
      continue;
    }
    const blob = await gh.request('POST', `/repos/${owner}/${repo}/git/blobs`, {
      body: { content: change.content, encoding: 'utf-8' },
    });
    tree.push({ path: change.path, mode, type: 'blob', sha: blob.data.sha });
  }
  const nextTree = await gh.request('POST', `/repos/${owner}/${repo}/git/trees`, {
    body: { base_tree: baseTree, tree },
  });
  return gh.request('POST', `/repos/${owner}/${repo}/git/commits`, {
    body: { message, tree: nextTree.data.sha, parents: [parent] },
  });
}

export function createDraftPull(gh, { owner, repo, branch, base, issue }) {
  return gh
    .request('POST', `/repos/${owner}/${repo}/pulls`, {
      body: {
        title: `Shipyard: ${issue.title}`,
        head: branch,
        base,
        draft: true,
        body: `Implements #${issue.number}. Generated by Shipyard Cloud Coder; awaiting Cloud Reviewer and human review.`,
      },
    })
    .then((result) => result.data);
}
