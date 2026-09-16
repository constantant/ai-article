---
name: article-authoring
description: Draft, validate, and publish structured web articles to a registered app (destination site) through the ai-article-platform MCP server — tools register_app, create_app, delete_app, list_apps, get_app_profile, list_articles, get_article, validate_article, create_article, update_article, publish_article, delete_article. Matches each app's own voice, allowed content structure, and visual style automatically, so the same skill works across many differently-styled apps, and can register brand-new apps on request — no admin key needed, registration is self-serve. Use whenever asked to write, draft, edit, or publish an article/blog post/web page for a named app or site ("write a post for tech-blog", "draft a lifestyle article about X", "publish this article"), to set up a new app/site ("create a new app called ..."), or to remove an app or article ("delete the app called ...", "remove that article"). Not for generic writing unrelated to a registered app.
---

# Article Authoring

You are drafting **content**, not markup or design. Every article is a tree of typed
blocks (heading, paragraph, code, image, ...) — never raw HTML or CSS. The receiving
app alone decides how each block type is rendered (colors, fonts, layout); your job is
to pick the right block types and write copy that fits the app's voice. This
separation is what lets the exact same skill produce correct output for a
dark/technical blog and a warm/lifestyle magazine without you knowing anything about
either one's stylesheet.

## Creating a new app

If the user wants to set up a new destination site rather than write for an existing
one, call `register_app` — this is the normal, self-serve path and needs no admin
key. Give it `appId` (lowercase, hyphenated, unique), `name`, `voice` (`tone`,
`audience`, optional `doNots`), `allowedBlockTypes` (pick a deliberate subset — see
the block table below — not all of them by default), and `designTokens` (at minimum
`color-surface`, `color-on-surface`, `color-primary`; see an existing app's profile
via `get_app_profile` for the full set a webapp expects). Ask the user for
voice/style direction rather than inventing it. Once registered, the new app's
articles can be authored immediately in the same session — no reconnection needed —
and the key is remembered locally so this keeps working after a restart.

`register_app` has a global cap to bound abuse; if it fails saying registration is
full, tell the user to ask the maintainer to register the app instead. `create_app`
is the admin-gated equivalent (requires `ADMIN_API_KEY`) — only reach for it if the
user is an operator who explicitly wants that path, or `register_app` is unavailable.

## Deleting an app

`delete_app(appId)` permanently removes an app and every one of its articles —
there is no undo. It works with either that app's own key (which this server
already holds after `register_app`/`create_app`) or an admin key. Always confirm
with the user before calling it, especially if the app has published articles.

## Workflow

1. **Resolve the target app.** If the user didn't name one, call `list_apps` and ask
   which one they mean (or whether they want to create a new one) — do not guess.
2. **Call `get_app_profile(appId)`.** Read `voice` (tone, audience, things to avoid),
   `allowedBlockTypes`, and `contentConventions` before writing a single word. These
   vary per app and are the actual style contract — follow them over your own
   instincts about "good" web copy.
3. **Ground yourself in an example (recommended).** Call `list_articles(appId)` and
   read one existing article with `get_article` (or the `example://{appId}/{id}`
   resource) to see the app's structure and tone in practice, especially the first
   time you write for a given app.
4. **Draft the article** as a block array using only types in `allowedBlockTypes`.
   Check the `schema://article-draft` resource if you're unsure of a block's exact
   shape (see also the block reference below).
5. **Call `validate_article`** with the draft before creating it. It runs the exact
   same check the REST API enforces, so a clean validation means `create_article`
   will not be rejected. Fix and re-validate rather than guessing at what's wrong.
6. **Call `create_article`** once validation passes. This creates a draft — it is not
   visible on the site yet.
7. **Call `publish_article(appId, id)`** only when the user has confirmed the content
   is ready to go live. Don't publish speculatively.
8. To revise something already created, use `update_article` with just the changed
   fields (e.g. `{ appId, id, blocks: [...] }`) — you don't need to resend the whole
   article.
9. `delete_article(appId, id)` permanently removes one article — there is no undo.
   Confirm with the user first, especially if it's published (deleting it takes it
   off the live site immediately).

## Block types

The full set (an app's `allowedBlockTypes` is a subset of these — never use a type
the profile doesn't list):

| type        | shape                                                            | notes                                                                     |
| ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `heading`   | `{ level: 1-4, text }`                                           | plain text, no rich text                                                  |
| `paragraph` | `{ content: RichText }`                                          | RichText = array of `{ text, bold?, italic?, code?, href? }` runs         |
| `image`     | `{ src, alt, caption? }`                                         | `alt` is required — never omit it                                         |
| `code`      | `{ lang?, code }`                                                | for tech-focused apps; check `allowedBlockTypes` before using             |
| `quote`     | `{ content: RichText, attribution? }`                            |                                                                           |
| `list`      | `{ ordered, items: RichText[] }`                                 |                                                                           |
| `callout`   | `{ variant: info\|warning\|success\|danger, content: RichText }` |                                                                           |
| `table`     | `{ headers: string[], rows: string[][] }`                        |                                                                           |
| `embed`     | `{ provider: youtube\|twitter\|codepen\|generic, url }`          |                                                                           |
| `divider`   | `{}`                                                             |                                                                           |
| `raw`       | `{ html }`                                                       | escape hatch — only if the app explicitly allows it; prefer a typed block |

The full JSON Schema is always available live at the `schema://article-draft`
resource — treat that as authoritative over this table if they ever disagree.

## Common mistakes to avoid

- **Using a block type the app doesn't allow.** `validate_article` will catch this
  with a message like `block type "embed" is not allowed for app "tech-blog"` — this
  means pick a different block, not that something is broken.
- **Writing in a generic "web content" voice instead of the app's own.** A tech blog
  and a lifestyle magazine should read as if written by different publications, not
  by the same assistant with a costume on.
- **Skipping validation before create/publish.** It's a free check — always call it
  first.
- **Publishing without being asked to.** `create_article` produces a draft;
  publishing is a separate, deliberate step.
- **appId mismatches.** The `appId` in the article body must match the app you're
  authenticated against — if `create_article` rejects with an appId mismatch, you
  likely mixed up which app the user meant.
