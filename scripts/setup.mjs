#!/usr/bin/env node
// One-shot setup for connecting your Claude to the AI Article test environment.
// Run from the repo root: `node scripts/setup.mjs` (or `npm run setup`).
//
// What it does, equivalent to packages/webapp/README.md steps 1, 3 and 4:
//   1. npm install
//   2. build the mcp-server connector
//   3. write/merge the MCP config for Claude Code and/or Claude Desktop
//   4. install the article-authoring skill
//
// Safe to re-run: it merges into existing config files instead of overwriting
// them, and only touches the "ai-article-platform" MCP entry / skill folder.

import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REST_API_BASE_URL =
  'https://lczeiiixbf2mrtyizmyvgurkta0qoczq.lambda-url.eu-central-1.on.aws/api';

const args = process.argv.slice(2);
const flag = (name) => {
  const prefix = `--${name}=`;
  const hit = args.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
};

function run(command, commandArgs, { optional = false } = {}) {
  // Windows requires shell:true to launch .cmd/.bat shims (npm, npx, claude);
  // every arg here is a static, trusted literal, never user input, so the
  // shell-injection risk that flag normally carries doesn't apply.
  console.log(`\n$ ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0 && !optional) {
    console.error(
      `\n✗ "${command} ${commandArgs.join(' ')}" failed (exit ${result.status}).`,
    );
    process.exit(result.status ?? 1);
  }
  return result.status === 0;
}

function readJson(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    console.warn(
      `⚠ ${filePath} exists but isn't valid JSON — leaving it untouched and skipping.`,
    );
    return null;
  }
}

function mergeMcpConfig(filePath, mcpServerEntry) {
  const existing = readJson(filePath);
  if (existing === null) return false;
  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers['ai-article-platform'] = mcpServerEntry;
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
  console.log(`✓ wrote ${filePath}`);
  return true;
}

const useShell = process.platform === 'win32';

function claudeCliAvailable() {
  const result = spawnSync('claude', ['--version'], {
    stdio: 'ignore',
    shell: useShell,
  });
  return !result.error && result.status === 0;
}

// Registers the MCP server with the `claude` CLI at the given scope
// ("user" = global, works from any project on this machine; "local" = only
// in the project you run `claude` from, private to you). Uses `mcp add` with
// -e flags rather than `mcp add-json`: on Windows, shell:true (required to
// launch the claude.cmd shim) mangles a single JSON-string argument's quoting
// beyond repair, but plain space-separated args survive it fine.
// Idempotent: `add` errors on a name that already exists, so remove first
// (ignoring "not found").
function claudeCliRegister(scope, mcpServerEntry) {
  spawnSync('claude', ['mcp', 'remove', 'ai-article-platform', '-s', scope], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    shell: useShell,
  });
  const envArgs = Object.entries(mcpServerEntry.env).flatMap(([key, value]) => [
    '-e',
    `${key}=${value}`,
  ]);
  const result = spawnSync(
    'claude',
    [
      'mcp',
      'add',
      'ai-article-platform',
      '-s',
      scope,
      ...envArgs,
      '--',
      mcpServerEntry.command,
      ...mcpServerEntry.args,
    ],
    { cwd: REPO_ROOT, stdio: 'inherit', shell: useShell },
  );
  if (result.status !== 0) {
    console.error(`\n✗ "claude mcp add" failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
  console.log(
    `✓ registered with Claude Code (${scope === 'user' ? 'global — available in all your projects' : 'this project only'})`,
  );
}

function claudeDesktopConfigPath() {
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  if (process.platform === 'win32') {
    const appData =
      process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  return path.join(
    os.homedir(),
    '.config',
    'Claude',
    'claude_desktop_config.json',
  );
}

async function main() {
  console.log('AI Article Platform — connector setup\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (question, fallback) => {
    const answer = (
      await rl.question(
        fallback ? `${question} [${fallback}] ` : `${question} `,
      )
    ).trim();
    return answer || fallback;
  };

  let adminKey = flag('admin-key');
  let client = flag('client'); // code | desktop | both
  let codeScope = flag('code-scope'); // global | project | local
  let skillScope = flag('skill-scope'); // project | user

  if (!adminKey) {
    adminKey = await ask(
      'Admin key for the test environment (ask whoever shared this repo with you):',
    );
  }
  if (!client) {
    client = (
      await ask('Connect (c)laude Code, (d)esktop, or (b)oth?', 'b')
    ).toLowerCase();
  }
  const wantsCode =
    client === 'c' || client === 'code' || client === 'b' || client === 'both';
  if (wantsCode && !codeScope) {
    codeScope = (
      await ask(
        'For Claude Code: (g)lobal (available in every project on this machine), ' +
          '(p)roject (shared via .mcp.json, checked into this repo), or (l)ocal ' +
          '(just this project, only you)?',
        'g',
      )
    ).toLowerCase();
  }
  if (!skillScope) {
    skillScope = (
      await ask(
        'Install the skill for (t)his project only, or (u)ser-wide?',
        't',
      )
    ).toLowerCase();
  }
  rl.close();

  if (!adminKey) {
    console.error(
      '\n✗ An admin key is required (create_app needs it). Aborting.',
    );
    process.exit(1);
  }

  // --- 1. install deps ---
  run('npm', ['install']);

  // --- 2. build the connector ---
  run('npx', ['nx', 'build', 'mcp-server']);

  const mcpMainPath = path.join(
    REPO_ROOT,
    'packages',
    'mcp-server',
    'dist',
    'main.js',
  );
  if (!existsSync(mcpMainPath)) {
    console.error(
      `\n✗ Build succeeded but ${mcpMainPath} is missing — can't continue.`,
    );
    process.exit(1);
  }

  const mcpServerEntry = {
    command: 'node',
    args: [mcpMainPath],
    env: {
      REST_API_BASE_URL,
      ADMIN_API_KEY: adminKey,
      APP_API_KEYS: '{}',
    },
  };

  // --- 3. write MCP config(s) ---
  if (wantsCode) {
    if (codeScope === 'p' || codeScope === 'project') {
      mergeMcpConfig(path.join(REPO_ROOT, '.mcp.json'), mcpServerEntry);
    } else {
      const scope =
        codeScope === 'l' || codeScope === 'local' ? 'local' : 'user';
      if (claudeCliAvailable()) {
        claudeCliRegister(scope, mcpServerEntry);
      } else {
        console.warn(
          `⚠ "claude" CLI not found on PATH — can't register ${scope} scope directly.\n` +
            '  Falling back to a project-level .mcp.json instead (run `claude mcp add-json` ' +
            'yourself later for global/local scope).',
        );
        mergeMcpConfig(path.join(REPO_ROOT, '.mcp.json'), mcpServerEntry);
      }
    }
  }
  if (
    client === 'd' ||
    client === 'desktop' ||
    client === 'b' ||
    client === 'both'
  ) {
    mergeMcpConfig(claudeDesktopConfigPath(), mcpServerEntry);
  }

  // --- 4. install the skill ---
  const skillSource = path.join(REPO_ROOT, 'packages', 'skill', 'SKILL.md');
  const skillBase =
    skillScope === 'u' || skillScope === 'user'
      ? path.join(os.homedir(), '.claude', 'skills')
      : path.join(REPO_ROOT, '.claude', 'skills');
  const skillDir = path.join(skillBase, 'article-authoring');
  mkdirSync(skillDir, { recursive: true });
  copyFileSync(skillSource, path.join(skillDir, 'SKILL.md'));
  console.log(`✓ installed skill to ${skillDir}`);

  console.log(`
Done. Next steps:
  - Fully restart Claude Code / Claude Desktop (MCP servers only connect on startup).
  - In Claude Code, run /mcp and confirm "ai-article-platform" is connected.
  - Try: "Using the article-authoring skill, create a new app called my-test-app
    for a [describe a site], then write and publish a short article for it."
  - Then check https://r7aeuo6wo4an5xetmodlexnzsi0wuvxy.lambda-url.eu-central-1.on.aws/en/
`);
}

main();
