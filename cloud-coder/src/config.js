const REQUIRED_SECTIONS = [
  'Desired behaviour',
  'Non-goals',
  'Acceptance checks',
  'Test command',
  'Complexity',
  'Risks',
];

/** Parse the brief before spending a model request or touching a sandbox. */
export function parseAgentBrief(brief) {
  if (typeof brief !== 'string' || brief.trim() === '') throw new Error('Agent Brief is required.');
  const sections = new Map();
  let name = null;
  let content = [];
  for (const line of brief.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (name) sections.set(name, content.join('\n').trim());
      name = heading[1].trim().toLowerCase();
      content = [];
    } else if (name) {
      content.push(line);
    }
  }
  if (name) sections.set(name, content.join('\n').trim());

  for (const name of REQUIRED_SECTIONS) {
    if (!sections.get(name.toLowerCase())) throw new Error(`Agent Brief is missing required section "${name}".`);
  }

  const complexity = Number(sections.get('complexity'));
  if (!Number.isInteger(complexity) || complexity < 1 || complexity > 5) {
    throw new Error('Agent Brief complexity must be an integer from 1 to 5.');
  }

  const testCommand = sections.get('test command');
  if (testCommand.includes('\n') || testCommand.includes('\r')) {
    throw new Error('Agent Brief test command must be one non-empty line.');
  }
  return { complexity, testCommand };
}

/** Reject unsafe admission before the model sees source or receives tools. */
export function assertAdmissibleIssue(issue) {
  if (!issue || issue.state !== 'open') throw new Error('Cloud Coder accepts only open Issues.');
  if (issue.pull_request) throw new Error('Cloud Coder accepts an Issue rather than a pull request.');
  if (!issue.labels?.some((label) => label.name === 'ready-for-agent')) {
    throw new Error('Cloud Coder requires the ready-for-agent label.');
  }
}
