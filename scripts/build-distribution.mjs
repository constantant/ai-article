#!/usr/bin/env node
// Builds the no-clone distribution artifacts (Claude Code plugin + Claude Desktop
// extension source) from the canonical packages/mcp-server and packages/skill
// sources. Run from the repo root: `node scripts/build-distribution.mjs`.
//
// Not wired into CI on purpose — these are committed files, and having a CI job
// commit build output back to main unattended is more automation than this
// warrants. Run this locally and commit the result before pushing.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

function run(command, args) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`\n✗ "${command} ${args.join(' ')}" failed.`);
    process.exit(result.status ?? 1);
  }
}

run('npx', ['nx', 'run', '@org/mcp-server:bundle']);

const bundledServer = path.join(
  REPO_ROOT,
  'packages',
  'mcp-server',
  'dist-bundle',
  'main.js',
);
const skillSource = path.join(REPO_ROOT, 'packages', 'skill', 'SKILL.md');

const targets = [
  path.join(REPO_ROOT, 'plugin', 'server', 'main.js'),
  path.join(REPO_ROOT, 'desktop-extension', 'server', 'main.js'),
];
for (const target of targets) {
  mkdirSync(path.dirname(target), { recursive: true });
  copyFileSync(bundledServer, target);
  console.log(`✓ copied bundled server to ${path.relative(REPO_ROOT, target)}`);
}

const skillTarget = path.join(
  REPO_ROOT,
  'plugin',
  'skills',
  'article-authoring',
  'SKILL.md',
);
mkdirSync(path.dirname(skillTarget), { recursive: true });
copyFileSync(skillSource, skillTarget);
console.log(`✓ copied skill to ${path.relative(REPO_ROOT, skillTarget)}`);

console.log(
  '\nDone. Review `git status` / `git diff` for plugin/ and desktop-extension/, ' +
    'then commit before pushing a release.',
);
