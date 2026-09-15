# AI Article Platform — Test Environment Guide

This is a live test environment for trying out AI-authored articles: you connect
your own Claude (Desktop or Code) to it, and Claude can create a site ("app"), write
articles for it, and publish them — all conversationally. Whatever gets published
shows up immediately at:

**https://r7aeuo6wo4an5xetmodlexnzsi0wuvxy.lambda-url.eu-central-1.on.aws/en/**

That page lists every registered app; click into one to see its articles, each
rendered in that app's own visual style (colors, fonts, layout) — not a generic
template. Two demo apps (`tech-blog`, `lifestyle`) are already there so you can see
what "done" looks like before creating your own.

> **This is a shared test environment**, not production — everything here can be
> reset, and other people trying this guide will see (though not edit) the same demo
> apps. Don't put anything sensitive in it.

## What you're actually setting up

The website is already running — you don't host anything. What you're installing
locally is a small connector program (an "MCP server") that lets your Claude talk to
it. Node.js and this repository need to be on your machine to run that connector;
everything it manages (the articles, the site itself) lives on AWS, not on your
computer.

## Prerequisites

- [Node.js](https://nodejs.org) 24 or later
- Git
- Claude Code or Claude Desktop
- The shared **test-environment admin key** (`ADMIN_API_KEY`) — ask whoever gave
  you this guide. You need it once, to let your Claude register a new app; you
  won't need it again after that for authoring.

## Quick setup (recommended)

```sh
git clone <this-repository-url>
cd ai-article
npm run setup
```

This one command installs dependencies, builds the connector, registers it with
Claude, and installs the authoring skill — it asks a few short questions (admin
key, which Claude client(s), and for Claude Code, **global** — available in
every project on this machine, not just this repo folder — vs. project/local
scope) and merges into any existing config instead of overwriting it. It's safe
to re-run.

Non-interactive use:
`npm run setup -- --admin-key=... --client=both --code-scope=g --skill-scope=t`.

Once it finishes, **fully restart** Claude Code / Claude Desktop and skip to
[step 5](#5-try-it).

<details>
<summary>Manual setup (if you'd rather do it by hand, or the script doesn't fit
your setup)</summary>

## 1. Get the code and build the connector

```sh
git clone <this-repository-url>
cd ai-article
npm install    # if this hits an arborist "Cannot read properties of null" error, retry with --legacy-peer-deps
npx nx build mcp-server
```

## 2. Get an admin key

Ask whoever gave you this guide for the shared **test-environment admin key**
(`ADMIN_API_KEY`). You'll need it once, to let your Claude register a new app; you
won't need it again after that for authoring.

## 3. Connect Claude to the test environment

<details>
<summary><b>Claude Code</b></summary>

Create `.mcp.json` in the `ai-article` folder you just cloned (or wherever you'll be
chatting from):

```json
{
  "mcpServers": {
    "ai-article-platform": {
      "command": "node",
      "args": ["packages/mcp-server/dist/main.js"],
      "env": {
        "REST_API_BASE_URL": "https://lczeiiixbf2mrtyizmyvgurkta0qoczq.lambda-url.eu-central-1.on.aws/api",
        "ADMIN_API_KEY": "<the admin key from step 2>",
        "APP_API_KEYS": "{}"
      }
    }
  }
}
```

Restart Claude Code and run `/mcp` — you should see `ai-article-platform` connected.

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on macOS,
`%APPDATA%\Claude\` on Windows), using the **absolute path** to where you cloned the
repo:

```json
{
  "mcpServers": {
    "ai-article-platform": {
      "command": "node",
      "args": ["/absolute/path/to/ai-article/packages/mcp-server/dist/main.js"],
      "env": {
        "REST_API_BASE_URL": "https://lczeiiixbf2mrtyizmyvgurkta0qoczq.lambda-url.eu-central-1.on.aws/api",
        "ADMIN_API_KEY": "<the admin key from step 2>",
        "APP_API_KEYS": "{}"
      }
    }
  }
}
```

Fully restart Claude Desktop afterward.

</details>

## 4. Install the authoring skill

This teaches Claude _how_ to use the connector — without it, Claude can see the tools
but won't know the workflow (check the app's voice/style before writing, validate
before publishing, etc.).

```sh
mkdir -p .claude/skills/article-authoring
cp packages/skill/SKILL.md .claude/skills/article-authoring/SKILL.md
```

(Use `~/.claude/skills/article-authoring/` instead of `.claude/skills/` if you want
this available from any project, not just this folder.) Restart Claude Code to pick
it up.

</details>

## 5. Try it

Ask Claude something like:

> Using the article-authoring skill, create a new app called `my-test-app` for a
> \[describe the kind of site — e.g. "cheerful cooking blog"], then write and
> publish a short article for it.

Claude should call `create_app`, then `get_app_profile`, `validate_article`,
`create_article`, and `publish_article`, in that order. Once it confirms the
article is published, refresh
**https://r7aeuo6wo4an5xetmodlexnzsi0wuvxy.lambda-url.eu-central-1.on.aws/en/** —
your new app and article should be there.

## Troubleshooting

- **Claude can't see the tools at all**: check `/mcp` (Claude Code) or fully restart
  Claude Desktop — MCP servers only connect on startup.
- **`create_app` fails mentioning a missing admin key**: double-check
  `ADMIN_API_KEY` is set in your MCP config exactly as given in step 2.
- **`create_article`/`publish_article` fail for an app you just created**: only
  happens if you reconfigured or restarted the connector between creating the app
  and authoring for it — the connector only remembers a new app's key for its
  current run. Ask Claude to `create_app` again (pick a different `appId` — the
  original one is already taken), or ask for that app's key directly.
