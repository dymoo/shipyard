import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Workspace } from '../cloud-coder/src/workspace.js';

test('writes and deletes only ordinary repository files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-workspace-'));
  fs.writeFileSync(path.join(root, 'app.js'), 'export const oldValue = true;\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);

  await workspace.write('src/new.js', 'export const value = 1;\n');
  await workspace.delete('app.js');

  assert.equal(fs.readFileSync(path.join(root, 'src/new.js'), 'utf8'), 'export const value = 1;\n');
  assert.equal(fs.existsSync(path.join(root, 'app.js')), false);
  assert.deepEqual(workspace.changes(), [
    { path: 'app.js', content: null },
    { path: 'src/new.js', content: 'export const value = 1;\n' },
  ]);
});

test('rejects path escapes, git metadata, and symlink writes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-workspace-'));
  fs.mkdirSync(path.join(root, '.git'));
  fs.symlinkSync(os.tmpdir(), path.join(root, 'linked'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);

  await assert.rejects(() => workspace.write('../outside.txt', 'no'), /repository-relative/i);
  await assert.rejects(() => workspace.write('.git/config', 'no'), /git metadata/i);
  await assert.rejects(() => workspace.write('linked/outside.txt', 'no'), /symlink/i);
});

test('reads and lists ordinary workspace files without following links', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shipyard-coder-workspace-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/app.js'), 'export const app = true;');
  fs.symlinkSync(path.join(root, 'src/app.js'), path.join(root, 'src/link.js'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = new Workspace(root);

  assert.equal(await workspace.read('src/app.js'), 'export const app = true;');
  await assert.rejects(() => workspace.read('src/link.js'), /symlink target/i);
  assert.deepEqual(await workspace.list(), ['src/app.js']);
});
