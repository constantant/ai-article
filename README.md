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

| Package | What it is |
|---|---|
| [`packages/schema`](packages/schema) | Zod models (`Article`, `Block` union, `AppProfile`) and `validateArticle` — the single source of truth every other package imports directly, plus a native JSON Schema export for MCP. |
| [`packages/rest-api`](packages/rest-api) | NestJS + Prisma/SQLite. Multi-tenant article storage behind a repository interface (so a future app can use Postgres/Mongo without touching the service layer), per-app API-key auth, Swagger docs. |
| [`packages/mcp-server`](packages/mcp-server) | An MCP server (`@modelcontextprotocol/sdk`) exposing the REST API as tools (`list_apps`, `get_app_profile`, `create_article`, `validate_article`, `publish_article`, ...) and resources (live JSON Schemas, app profiles, example articles). |
| [`packages/skill`](packages/skill) | `SKILL.md` — the authoring workflow a model follows: resolve the app, read its profile, draft within its allowed block types, validate, then publish. |
| [`packages/webapp`](packages/webapp) | Angular 22, SSR, Material 3, real `@angular/localize` i18n. Renders any app's articles by mapping each `AppProfile`'s design tokens to CSS custom properties per request — no per-app code, just per-app data. |

## How it fits together

```
Claude (Skill) --MCP--> mcp-server --HTTP--> rest-api --Prisma--> SQLite
                                                  |
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

## Getting started

```sh
npm install # if this hits an arborist "Cannot read properties of null" error, retry with --legacy-peer-deps
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
needs them to write.

**2. Configure the MCP server** with those keys and point your MCP client (Claude
Code, Claude Desktop, ...) at it:

```json
{
  "mcpServers": {
    "ai-article-platform": {
      "command": "node",
      "args": ["packages/mcp-server/dist/main.js"],
      "env": {
        "REST_API_BASE_URL": "http://localhost:3000/api",
        "APP_API_KEYS": "{\"tech-blog\":\"<key>\",\"lifestyle\":\"<key>\"}"
      }
    }
  }
}
```

**3. Start the webapp** and browse the demo apps:

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
