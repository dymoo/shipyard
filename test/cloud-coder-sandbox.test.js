import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runSandbox } from '../cloud-coder/src/sandbox.js';

test('runs the declared command in a credential-free, no-network container copy', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-sandbox-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  /** @type {{file: string, args: string[]} | null} */
  let call = null;

  const result = await runSandbox(
    root,
    { image: `ghcr.io/acme/project-ci@sha256:${'a'.repeat(64)}`, command: 'npm test' },
    {
      execFile: async (file, args) => {
        call = { file, args };
        const mount = args[args.indexOf('--mount') + 1];
        const source = /source=([^,]+)/.exec(mount)[1];
        assert.equal(fs.existsSync(path.join(source, '.git')), false);
        assert.equal(fs.readFileSync(path.join(source, 'package.json'), 'utf8'), '{}');
        return { stdout: 'tests passed', stderr: '' };
      },
    },
  );

  if (!call) throw new Error('Docker runtime was not called.');
  assert.equal(call.file, 'docker');
  assert.ok(call.args.includes('--network'));
  assert.equal(call.args[call.args.indexOf('--network') + 1], 'none');
  assert.ok(call.args.includes('--cap-drop'));
  assert.ok(call.args.includes('--security-opt'));
  assert.ok(call.args.includes('no-new-privileges'));
  assert.equal(call.args.at(-1), 'npm test');
  assert.deepEqual(result, { passed: true, output: 'tests passed' });
});

test('rejects an unsafe sandbox image before launching Docker', async () => {
  await assert.rejects(
    () => runSandbox('/tmp', { image: 'ghcr.io/acme/image;rm', command: 'npm test' }),
    /sandbox image/i,
  );
  await assert.rejects(
    () => runSandbox('/tmp', { image: 'ghcr.io/acme/image:latest', command: 'npm test' }),
    /sandbox image/i,
  );
});
