import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SKILL_FILES = Object.freeze(['implement', 'tdd', 'diagnosing-bugs', 'code-review', 'ponytail-review']);

const skillDirectory = fileURLToPath(new URL('../skills/', import.meta.url));

/** @type {Map<string, {name: string, description: string, body: string}>} */
const skills = new Map(
  SKILL_FILES.map((name) => {
    const body = fs.readFileSync(`${skillDirectory}${name}.md`, 'utf8');
    const metadata = parseMetadata(body);
    if (metadata.name !== name || !metadata.description) {
      throw new Error(`Cloud Coder skill ${name} must declare its exact name and description.`);
    }
    return [name, { name, description: metadata.description, body }];
  }),
);

/** Return the only skill context sent in Cloud Coder's base prompt. */
export function listSkillMetadata() {
  return [...skills.values()].map(({ name, description }) => ({ name, description }));
}

/** Host-owned resolution prevents a model from treating arbitrary repository text as a skill. */
export function loadSkill(name) {
  const skill = skills.get(name);
  if (!skill) throw new Error(`Skill "${name}" is not available to Cloud Coder.`);
  return { ...skill };
}

function parseMetadata(body) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(body);
  if (!match) return {};
  const fields = Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map((line) => /^([\w-]+):\s*["']?(.+?)["']?\s*$/.exec(line))
      .filter(Boolean)
      .map((parts) => [parts[1], parts[2]]),
  );
  return { name: fields.name, description: fields.description };
}
