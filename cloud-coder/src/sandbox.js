import fsp from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile as executeFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(executeFile);
const IMAGE = /^[a-zA-Z0-9./:_-]+@sha256:[a-f0-9]{64}$/;
const SANDBOX_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Run a maintainer-declared validation command away from the credentialed host.
 * The model has no shell tool; this is the only command it can request.
 */
export async function runSandbox(root, { image, command }, runtime = {}) {
  if (!IMAGE.test(image || '')) throw new Error('Cloud Coder sandbox image is invalid.');
  if (typeof command !== 'string' || !command.trim() || /[\r\n]/.test(command)) {
    throw new Error('Cloud Coder sandbox command must be one non-empty line.');
  }

  const copy = await fsp.mkdtemp(path.join(tmpdir(), 'shipyard-coder-sandbox-'));
  const source = path.join(copy, 'work');
  try {
    await fsp.cp(root, source, {
      recursive: true,
      filter: (from) => path.relative(root, from).split(path.sep)[0] !== '.git',
    });
    const mount = `type=bind,source=${source},target=/work`;
    const args = [
      'run',
      '--rm',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      '256',
      '--memory',
      '4g',
      '--cpus',
      '2',
      '--mount',
      mount,
      '--workdir',
      '/work',
      image,
      'sh',
      '-lc',
      command,
    ];
    try {
      const run = runtime.execFile || execFile;
      const { stdout = '', stderr = '' } = await run('docker', args, {
        timeout: SANDBOX_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      });
      return { passed: true, output: output(stdout, stderr) };
    } catch (error) {
      return { passed: false, output: output(errorOutput(error), '') };
    }
  } finally {
    await fsp.rm(copy, { recursive: true, force: true });
  }
}

function output(stdout, stderr) {
  const text = `${stdout}${stderr}`.trim();
  return text.length > 12000 ? `${text.slice(0, 12000)}\n… output truncated …` : text;
}

/** @param {unknown} error */
function errorOutput(error) {
  if (!(error instanceof Error)) return '';
  const result = /** @type {Error & {stdout?: string | Buffer, stderr?: string | Buffer}} */ (error);
  return `${result.stdout || ''}${result.stderr || ''}`;
}
