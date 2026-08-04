import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCoder } from '../cloud-coder/src/agent.js';
import { Workspace } from '../cloud-coder/src/workspace.js';

test('exposes lazy skill metadata and applies only host-owned workspace tools', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-agent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);
  const requests = [];
  const llm = {
    async send(messages) {
      requests.push(messages);
      return {
        message:
          requests.length === 1
            ? { tool_calls: [call('write_file', { path: 'src/app.js', content: 'export const app = true;\n' })] }
            : { tool_calls: [call('finish', { summary: 'Added the app module.' })] },
      };
    },
  };

  const result = await runCoder(llm, {
    brief: '## Desired behaviour\nAdd an app module.',
    workspace,
    sandboxImage: `ghcr.io/acme/ci@sha256:${'a'.repeat(64)}`,
    testCommand: 'npm test',
  });

  assert.deepEqual(result, { finished: true, summary: 'Added the app module.', calls: 2, tests: 0 });
  assert.equal(await workspace.read('src/app.js'), 'export const app = true;\n');
  assert.match(requests[0][0].content, /"name":"implement"/);
  assert.doesNotMatch(requests[0][0].content, /Start with discovery/i);
});

function call(name, args) {
  return { id: `call-${name}`, function: { name, arguments: JSON.stringify(args) } };
}
