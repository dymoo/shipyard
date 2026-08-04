import fsp from 'node:fs/promises';
import path from 'node:path';
import { isSafeRepoPath } from '../../src/repo.js';

const MAX_WRITE_BYTES = 1024 * 1024;

/** A mutable extracted snapshot. Model paths never reach Git metadata or the host filesystem. */
export class Workspace {
  #changes = new Map();

  constructor(root) {
    this.root = path.resolve(root);
  }

  async write(relativePath, content) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_WRITE_BYTES) {
      throw new Error(`Cloud Coder writes must be text under ${MAX_WRITE_BYTES} bytes.`);
    }
    const target = await this.#safeTarget(relativePath, { createParents: true });
    await fsp.writeFile(target, content, 'utf8');
    this.#changes.set(relativePath, content);
  }

  async delete(relativePath) {
    const target = await this.#safeTarget(relativePath, { createParents: false });
    const stat = await fsp.lstat(target).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Cloud Coder can delete only an existing file: ${relativePath}`);
    await fsp.unlink(target);
    this.#changes.set(relativePath, null);
  }

  async read(relativePath) {
    const target = await this.#safeTarget(relativePath, { createParents: false });
    const stat = await fsp.lstat(target).catch(() => null);
    if (!stat?.isFile()) return null;
    return fsp.readFile(target, 'utf8');
  }

  async list() {
    return walk(this.root, this.root);
  }

  changes() {
    return [...this.#changes]
      .map(([path, content]) => ({ path, content }))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async #safeTarget(relativePath, { createParents }) {
    if (!isSafeRepoPath(relativePath)) throw new Error('Cloud Coder paths must be repository-relative.');
    if (relativePath === '.git' || relativePath.startsWith('.git/')) {
      throw new Error('Cloud Coder cannot access git metadata.');
    }

    const parts = relativePath.split('/');
    let current = this.root;
    for (const segment of parts.slice(0, -1)) {
      current = path.join(current, segment);
      const stat = await fsp.lstat(current).catch(() => null);
      if (stat?.isSymbolicLink()) throw new Error(`Cloud Coder refuses a symlink parent: ${relativePath}`);
      if (stat && !stat.isDirectory()) throw new Error(`Cloud Coder path parent is not a directory: ${relativePath}`);
      if (!stat) {
        if (!createParents) throw new Error(`Cloud Coder path does not exist: ${relativePath}`);
        await fsp.mkdir(current);
      }
    }
    const target = path.join(current, parts.at(-1));
    const stat = await fsp.lstat(target).catch(() => null);
    if (stat?.isSymbolicLink()) throw new Error(`Cloud Coder refuses a symlink target: ${relativePath}`);
    return target;
  }
}

async function walk(root, directory, paths = []) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git' || entry.isSymbolicLink()) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(root, full, paths);
    else if (entry.isFile()) paths.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return paths.sort();
}
