# AI Article Platform

A system for authoring web articles with an AI (Claude or another model), publishing
them through an MCP server backed by a REST API, and rendering them correctly in the
house style of whichever destination app they're written for.

The core idea: **content and presentation are strictly separated.** An article is a
versioned tree of typed blocks (heading, paragraph, code, image, ...) — never raw
HTML or CSS. Each destination app owns its own voice, allowed block types, and design
tokens. The Skill reads an app's profile before drafting so the writing fits; the
webapp reads the same profile to theme the render. Neither side needs to know
anything about the other's internals, which is what lets the exact same content
schema produce a dark, terse technical blog and a warm, editorial lifestyle magazine
from one system.

## Packages

| Package                                      | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/schema`](packages/schema)         | Zod models (`Article`, `Block` union, `AppProfile`) and `validateArticle` — the single source of truth every other package imports directly, plus a native JSON Schema export for MCP.                                                                                                                                                                                                                                                                                                                              |
| [`packages/rest-api`](packages/rest-api)     | NestJS + Prisma/SQLite. Multi-tenant article storage behind a repository interface (so a future app can use Postgres/Mongo without touching the service layer), per-app API-key auth, Swagger docs.                                                                                                                                                                                                                                                                                                                 |
| [`packages/mcp-server`](packages/mcp-server) | An MCP server (`@modelcontextprotocol/sdk`) exposing the REST API as tools (`list_apps`, `get_app_profile`, `create_article`, `validate_article`, `publish_article`, ...) and resources (live JSON Schemas, app profiles, example articles). Two entrypoints: `main.ts` speaks stdio for Claude Code/Desktop; `http-main.ts` speaks Streamable HTTP behind its own OAuth 2.1 authorization server, for use as a **Claude mobile connector**, where each signed-in user gets their own isolated set of app API keys. |
| [`packages/skill`](packages/skill)           | `SKILL.md` — the authoring workflow a model follows: resolve the app, read its profile, draft within its allowed block types, validate, then publish.                                                                                                                                                                                                                                                                                                                                                               |
| [`packages/webapp`](packages/webapp)         | Angular 22, SSR, Material 3, real `@angular/localize` i18n. Renders any app's articles by mapping each `AppProfile`'s design tokens to CSS custom properties per request — no per-app code, just per-app data.                                                                                                                                                                                                                                                                                                      |
| [`packages/infra`](packages/infra)           | CDK (TypeScript). Deploys `rest-api`, `webapp`, and `mcp-server` (HTTP/OAuth mode) to AWS Lambda (container image, Function URLs) backed by DynamoDB, plus the GitHub OIDC deploy role for CI.                                                                                                                                                                                                                                                                                                                      |

## How it fits together

```
Claude Code/Desktop (Skill) --stdio-MCP-->
                                            mcp-server --HTTP--> rest-api --Prisma--> SQLite
Claude mobile (connector) --HTTP-MCP+OAuth-->                        |
                                                                 GET (public)
                                                                       v
                                                                   webapp (SSR)
```

1. The Skill asks `get_app_profile` for the target app's voice, allowed block types,
   and conventions before writing anything.
2. It drafts an article as a block array, calls `validate_article` to catch schema or
   policy violations early, then `create_article` and `publish_article`.
3. The webapp fetches published articles straight from the REST API on each request
   and renders them through one generic `BlockRendererComponent`, themed entirely by
   that app's design tokens (set as CSS custom properties server-side, so there's no
   flash of the wrong app's colors).
4. mcp-server's two entrypoints share every tool/resource but differ in identity: the
   stdio process _is_ your identity (its local key file is yours alone), while the HTTP
   entrypoint authenticates each caller via OAuth and resolves that signed-in user's own
   app keys from rest-api on every request — so one deployed connector safely serves many
   people.

## Quick install (no cloning, no admin key)

Want Claude to just draft and publish articles through this platform, without
setting up a dev environment? The REST API is already deployed and shared, so all
you need is the Skill and the MCP server — both install in one step, and app
registration is self-serve (no key to ask anyone for).

<details>
<summary><b>Claude Code</b></summary>

```
/plugin marketplace add constantant/ai-article
/plugin install article-authoring@ai-article
```

Restart Claude Code, then just ask, e.g.:

> Using the article-authoring skill, register a new app called my-blog for a
> [describe the site], then write and publish a short article for it.

That's it — no `.mcp.json`, no server to run, no key to paste in. `register_app`
mints a key and remembers it locally.

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Download the latest `.mcpb` file from
[Releases](https://github.com/constantant/ai-article/releases) and double-click it
(or drag it into Claude Desktop, or use Settings → Extensions → Advanced settings →
Install Extension…). No settings to fill in — leave "Admin key" blank unless
you're an operator.

Claude Desktop has no Skill mechanism, so you won't get the guided authoring
workflow the Skill provides — just ask directly, e.g. "register a new app called
my-blog for [description], then write a short article for it," and the MCP tools'
own descriptions carry enough guidance to get it right.

</details>

<details>
<summary><b>Claude mobile (or any remote MCP connector client)</b></summary>

Mobile can't spawn a local process, so it needs the deployed **remote** connector
instead of `packages/mcp-server`'s stdio build. In the Claude app: Settings →
Connectors → Add custom connector, and paste the deployed connector URL (ask a
maintainer, or see `McpServerUrl` in `packages/infra`'s stack outputs).

The first connection opens an OAuth login page in-app — self-serve, same as
`register_app`: enter an email/password to create an account on the spot, no
separate signup step, no email verification or password reset (this platform's
usual trust tradeoff for zero-setup access — see `packages/rest-api/src/app/users`).
Each signed-in identity gets its own isolated set of app keys, resolved fresh on
every request, so this one deployed connector safely serves multiple people at
once.

Note this is a _separate_ identity from the local stdio server's key file —
`register_app` here mints a brand-new app tied to your mobile account; there's no
tool yet to attach an already-existing app's key to a different identity.

</details>

Maintainers: the Claude Code plugin and Desktop Extension artifacts are built from
`packages/mcp-server` and `packages/skill` via `node scripts/build-distribution.mjs`
— run it and commit the result (`plugin/`, `desktop-extension/`) before tagging a
release. The mobile connector is a separate deployable (`packages/mcp-server`'s
`http-main.ts`, shipped via `packages/mcp-server/Dockerfile`) — see
`packages/infra`'s `McpServerFunction` — and isn't part of that script.

## Getting started (for contributors)

```sh
npm install
cp packages/rest-api/.env.example packages/rest-api/.env
```

**1. Start the REST API** (SQLite, seeds two demo apps with deliberately different
voice/design tokens — a dark/technical "tech-blog" and a warm/editorial "lifestyle"
magazine):

```sh
cd packages/rest-api
npx prisma generate       # generated client is gitignored
npx prisma migrate deploy # applies the committed migrations
npx prisma db seed
cd ../..
npx nx serve rest-api
```

The seed script prints an `x-api-key` for each demo app — save these, the MCP server
needs them to write. (If you ever need another one: `POST /api/apps` with an
`x-admin-key` header set to `ADMIN_API_KEY` from your `.env` returns a fresh key —
each key is shown exactly once, at registration.)

**2. Build the MCP server**, then connect it to a Claude client:

```sh
npx nx build mcp-server
```

<details>
<summary><b>Claude Code</b> — project-scoped <code>.mcp.json</code></summary>

Create `.mcp.json` at the repo root (safe to commit — it references env vars, not
the keys themselves):

```json
{
  "mcpServers": {
    "ai-article-platform": {
      "command": "node",
      "args": ["packages/mcp-server/dist/main.js"],
      "env": {
        "REST_API_BASE_URL": "${REST_API_BASE_URL}",
        "APP_API_KEYS": "${APP_API_KEYS}"
      }
    }
  }
}
```

Then export both in your own shell profile (e.g. `~/.zshrc`/`~/.bashrc`), never in
the committed file:

```sh
export REST_API_BASE_URL='http://localhost:3000/api'
export APP_API_KEYS='{"tech-blog":"<key>","lifestyle":"<key>"}'
```

Restart Claude Code in this repo and run `/mcp` to confirm `ai-article-platform`
connected.

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Edit `claude_desktop_config.json` (`~/Library/Application Support/Claude/` on macOS,
`%APPDATA%\Claude\` on Windows — this file lives outside the repo, so real key values
here are fine):

```json
{
  "mcpServers": {
    "ai-article-platform": {
      "command": "node",
      "args": [
        "E:\\Konstantin\\Work\\ai-article\\packages\\mcp-server\\dist\\main.js"
      ],
      "env": {
        "REST_API_BASE_URL": "http://localhost:3000/api",
        "APP_API_KEYS": "{\"tech-blog\":\"<key>\",\"lifestyle\":\"<key>\"}"
      }
    }
  }
}
```

Use an absolute path to `dist/main.js` — Desktop doesn't run from the repo's working
directory. Fully restart Claude Desktop afterward.

</details>

To point either client at the **deployed** instance instead of local, set
`REST_API_BASE_URL` to the deployed rest-api's Function URL + `/api` (see
`packages/infra`'s stack outputs), and use API keys registered against that
deployment (its `ADMIN_API_KEY` is in AWS Secrets Manager under
`ai-article/admin-api-key`, not your local `.env`).

<details>
<summary><b>Testing the mobile connector (HTTP + OAuth) locally</b></summary>

This is the remote entrypoint `packages/infra` deploys as `McpServerFunction` — you
generally don't need to run it yourself, but to exercise it locally (e.g. against
the [MCP Inspector](https://github.com/modelcontextprotocol/inspector)):

```sh
# rest-api also needs MCP_SERVICE_KEY set (add it to packages/rest-api/.env —
# see .env.example) and must be running first.
export MCP_SERVICE_KEY='dev-service-key'        # must match rest-api's
export MCP_JWT_SIGNING_KEY='any-local-dev-secret'
npx nx serve-http mcp-server
```

Defaults to `http://localhost:3000/api` for `REST_API_BASE_URL` and port `8080`.
The OAuth issuer is derived per-request from the request's `Host` header (not an
env var — see the comment in `packages/mcp-server/src/http-main.ts` for why), so
`http://localhost:8080` works out of the box with no extra config.

</details>

**3. Install the Skill** so Claude actually follows the authoring workflow (the MCP
tools alone don't tell it _how_ to use them):

```sh
mkdir -p .claude/skills/article-authoring
cp packages/skill/SKILL.md .claude/skills/article-authoring/SKILL.md
```

Use `.claude/skills/` for this repo only, or `~/.claude/skills/article-authoring/` to
make it available from any project. Restart Claude Code to pick it up.

**Verify the connection**: ask Claude something like _"using the article-authoring
skill, list the registered apps and draft a short article for tech-blog"_ — you
should see it call `list_apps`, then `get_app_profile`, before writing anything.

**4. Start the webapp** and browse the demo apps:

```sh
npx nx build webapp   # localizes the en/es bundles
node dist/packages/webapp/server/server.mjs
```

Then visit `/en/app/tech-blog` and `/es/app/lifestyle` to see the same block schema
rendered in two different house styles and languages.

## Running checks

```sh
npx nx run-many -t typecheck,build,lint,test -p schema,rest-api,mcp-server,webapp
```

`packages/infra` has no `build`/`test` targets (it's a CDK stack, not a deployable
app) — check it separately with `npx nx run-many -t typecheck,lint -p infra`, and
validate the stack itself with `npx cdk synth` from `packages/infra`.
