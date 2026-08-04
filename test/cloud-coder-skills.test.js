import test from 'node:test';
import assert from 'node:assert/strict';
import { listSkillMetadata, loadSkill } from '../cloud-coder/src/skills.js';

test('advertises implementation skills without spending context on their bodies', () => {
  const skills = listSkillMetadata();

  assert.deepEqual(
    skills.map((skill) => skill.name),
    ['implement', 'tdd', 'diagnosing-bugs', 'code-review', 'ponytail-review'],
  );
  assert.ok(skills.every((skill) => typeof skill.description === 'string' && skill.description.length > 0));
  assert.ok(skills.every((skill) => !('body' in skill)));
  assert.match(
    skills.find((skill) => skill.name === 'ponytail-review').description,
    /Code review focused exclusively/i,
  );
});

test('loads only an exact allowlisted skill body', () => {
  const skill = loadSkill('tdd');

  assert.equal(skill.name, 'tdd');
  assert.match(skill.body, /red → green/i);
  assert.throws(() => loadSkill('wayfinder'), /not available to Cloud Coder/);
  assert.throws(() => loadSkill('../tdd'), /not available to Cloud Coder/);
});
