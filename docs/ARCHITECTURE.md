# Architecture and development

How the plugin works, where things live, and how to extend it.

## Overview

```
┌────────────────────┐   stdio (MCP)   ┌──────────────────────────────┐   HTTPS   ┌──────────────────────┐
│ Claude (app/Code)  │ ◄─────────────► │ plugin/server/index.mjs      │ ────────► │ Google APIs          │
│  + skills (*.md)   │                 │  (bundled Node MCP server)   │           │  OAuth (user token)  │
└────────────────────┘                 │  reads ~/.google-workspace-  │           │  Maps (API key)      │
                                       │  mcp/{credentials,token,     │           │  Ads (dev token)     │
                                       │  ads,maps}.json              │           └──────────────────────┘
                                       └──────────────────────────────┘
```

- **The plugin** (`plugin/`) is what Claude installs. It has a manifest, an `.mcp.json` that starts the server, the **bundled server** (a single file with no dependencies to install), and **skills** (Markdown instructions).
- **The server** is a [Model Context Protocol](https://modelcontextprotocol.io) server over stdio. It registers 130 tools with JSON-schema inputs (built with zod) and MCP annotations: `readOnlyHint`, plus `destructiveHint` for tools that change or remove things.
- **Authentication:**
  - **OAuth 2.0** for user data, using an installed-app flow with a loopback redirect on `127.0.0.1`. The refresh token is stored locally in `token.json` and refreshed access tokens are saved automatically.
  - **API key** for Maps.
  - **Developer token** (plus an optional manager account ID) as headers for Google Ads.
- **Nothing is sent anywhere except Google's APIs.** There's no telemetry. The website scanner fetches the URL you ask for and Google's public `gtm.js`.

## Repository layout

| Path | Contents |
|---|---|
| `src/index.ts` | Creates the MCP server, its instructions, and registers every tool group |
| `src/auth.ts` | Scopes, credentials loading, token storage and refresh, interactive sign-in, status, project number |
| `src/auth-cli.ts` | `npm run auth`: command-line sign-in |
| `src/util.ts` | Google API clients, the `tool()` registration helper (error handling, JSON output), ID/URL parsing, `moveToFolder` |
| `src/tools/gmail.ts` | Gmail incl. MIME building (attachments, RFC 2047 headers) and message parsing |
| `src/tools/drive.ts` | Drive files, export/convert, sharing |
| `src/tools/docs.ts` | Docs incl. the Markdown-to-Docs converter |
| `src/tools/sheets.ts` | Sheets incl. `sheets_analyze` statistics and charts |
| `src/tools/slides.ts` | Slides incl. placeholder-aware slide building |
| `src/tools/calendar.ts` | Calendar incl. the free-slot finder |
| `src/tools/chat.ts` | Google Chat |
| `src/tools/contacts.ts` | People API (contacts, other contacts, directory) |
| `src/tools/maps.ts` | Places API (New), Geocoding, Routes (REST and API key) |
| `src/tools/appsscript.ts` | Apps Script API, with plain-language error fixes |
| `src/tools/gtm.ts` | Tag Manager API and the website and `gtm.js` scanner |
| `src/tools/analytics.ts` | GA4 Data and Admin APIs |
| `src/tools/ads.ts` | Google Ads REST (GAQL search, mutates) |
| `src/tools/dialogflow.ts` | Dialogflow ES (v2) and CX (v3), regional endpoints |
| `src/tools/setup.ts` | `google_setup` (status, import, sign-in/out, Ads and Maps config) |
| `plugin/.claude-plugin/plugin.json` | Plugin manifest (name, version, description) |
| `plugin/.mcp.json` | Starts `node ${CLAUDE_PLUGIN_ROOT}/server/index.mjs` |
| `plugin/skills/*/SKILL.md` | The skills |
| `.claude-plugin/marketplace.json` | Makes the repo installable with `claude plugin marketplace add` |
| `build-plugin.mjs` | esbuild bundle → `plugin/server/index.mjs` and `auth-cli.mjs` |
| `scripts/gen-tools-doc.mjs` | Generates `docs/TOOLS.md` from the live tool definitions |

Google API client libraries are the per-service `@googleapis/*` packages, which keep the bundle around 2 MB instead of about 15 MB for the full `googleapis`. Google Ads and Maps use `fetch` against their REST endpoints.

## Commands

```bash
npm install           # dev dependencies (only needed to build)
npm run build         # TypeScript → dist/ (type-checks everything)
npm run build:plugin  # bundle → plugin/server/
npm run docs          # regenerate docs/TOOLS.md (run after build:plugin)
npm run typecheck
npm run auth          # command-line Google sign-in
```

Quick smoke test of the bundled server:
```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node plugin/server/index.mjs
```

## Adding a tool
1. Pick or create `src/tools/<service>.ts` and register it with the helper:
   ```ts
   tool(server, "service_action", "What it does and when to use it (Claude reads this).",
     { someId: z.string(), limit: z.number().int().default(10) },
     async ({ someId, limit }) => { /* call the API */ return result; },
     READ /* or WRITE, DESTRUCTIVE */);
   ```
   The helper turns thrown errors into readable `isError` results and serializes the return value as JSON.
2. If the API needs a new permission, add the scope to `SCOPES` in `src/auth.ts`. `status` will then list it as missing for existing users until they sign in again.
3. For a new service, register the group in `src/index.ts` and mention it in the server `instructions`.
4. Update the relevant skill in `plugin/skills/`. Describe the workflow and the confirmations Claude must ask for, not just the tool names.
5. Run `npm run build && npm run build:plugin && npm run docs`, then `claude plugin validate ./plugin`.

## Releasing
1. Bump the version in `package.json`, `plugin/.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and `src/index.ts`, and add a `CHANGELOG.md` entry.
2. Run `npm run build && npm run build:plugin && npm run docs`.
3. Check with `claude plugin validate ./plugin && claude plugin validate .`.
4. Package: zip the **contents** of `plugin/` (`.claude-plugin`, `.mcp.json`, `README.md`, `server`, `skills`) as `google-workspace.plugin`.
5. Commit, push, and create a GitHub release with the `.plugin` file attached.

## Security notes
- `credentials.json`, `token.json`, `ads.json` and `maps.json` live outside the repo in `~/.google-workspace-mcp/` and are also git-ignored. `token.json`, `ads.json` and `maps.json` are written with owner-only permissions where the OS supports it (POSIX `0600`; on Windows, your user profile's permissions apply).
- The OAuth callback page escapes error text and closes its local server after one use or 5 minutes.
- Write tools never bypass Claude's confirmation. MCP annotations let clients prompt, and the skills tell Claude to confirm anything that reaches other people, spends money or goes live (`gmail_send`, `chat_send_message`, `drive_share`, calendar invites, `script_run`, `gtm_publish`, Ads changes).
- Revoke access at any time at <https://myaccount.google.com/permissions>.
