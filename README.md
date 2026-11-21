# Google Workspace MCP connector

An MCP server and Claude plugin that connects Claude to **Gmail, Google Drive, Docs, Sheets, Slides, Google Analytics 4 and Google Ads**. It runs locally and signs in with your own Google account. Your tokens stay on your machine.

Requires **Node.js 20+**.

## Install

### Claude Code (plugin)

This repo is a plugin marketplace. The plugin in `plugin/` contains the bundled server (no `npm install` needed) and two skills.

```bash
claude plugin marketplace add animesh-ex/google-workspace-mcp
```
```bash
claude plugin install google-workspace@google-workspace-local --scope user
```

Then start a new session and run `/google-workspace:setup` (or say "connect Google"). Claude imports the `client_secret_*.json` you downloaded (see Setup below) and opens Google sign-in in your browser.

### Claude app (Cowork)

Download `google-workspace.plugin` from the [latest release](https://github.com/animesh-ex/google-workspace-mcp/releases/latest) and open it in the Claude app to install.

### Other MCP clients

Run `node plugin/server/index.mjs` as a stdio MCP server (see "Add it to Claude" below).

After changing code in `src/`, run `npm run build:plugin` to refresh `plugin/server/`.

## What it can do (72 tools)

| Service | Tools |
|---|---|
| **Gmail** | `gmail_search`, `gmail_read_message`, `gmail_read_thread`, `gmail_send`, `gmail_reply` (reply / reply-all, same thread, or save as draft), `gmail_create_draft`, `gmail_list_drafts`, `gmail_send_draft`, `gmail_download_attachment` (save to disk or straight into Drive), `gmail_modify` (read/unread, star, archive, trash, labels), `gmail_list_labels`, `gmail_create_label` |
| **Attachments** | `gmail_send`, `gmail_reply` and `gmail_create_draft` take `attachmentPaths` (local files) and `driveFileIds`. Docs and Slides are attached as PDF, Sheets as XLSX. |
| **Drive** | `drive_search`, `drive_list_folder`, `drive_get_file`, `drive_read_file_text`, `drive_create_folder`, `drive_upload_file` (can convert to Google formats), `drive_download_file` (export to pdf/docx/xlsx/csv/pptx/md), `drive_move`, `drive_copy`, `drive_update_metadata` (rename/star/description), `drive_trash` (recoverable), `drive_about` |
| **Sharing** | `drive_share` (user, group, domain or anyone with the link; reader/commenter/writer/owner; optional notification message), `drive_list_permissions`, `drive_update_permission` (change role or remove access) |
| **Docs** | `docs_create` (from Markdown), `docs_read` (Markdown or indexed structure), `docs_insert_markdown`, `docs_replace_text`, `docs_delete_range`, `docs_insert_table`, `docs_insert_image`, `docs_batch_update` |
| **Sheets** | `sheets_create`, `sheets_get_info`, `sheets_read`, `sheets_write` (formulas work), `sheets_append_rows`, `sheets_clear`, `sheets_manage_tab`, `sheets_format`, `sheets_add_chart`, **`sheets_analyze`** (per-column stats and group-by summaries), `sheets_batch_update` |
| **Slides** | `slides_create` (whole deck with layouts, bullets, two columns, speaker notes and images), `slides_read`, `slides_add_slides`, `slides_replace_text`, `slides_set_text`, `slides_set_notes`, `slides_add_image`, `slides_add_text_box`, `slides_manage_slide` (delete/duplicate/move), `slides_get_thumbnail`, `slides_batch_update` |
| **Google Analytics 4** | `ga_list_properties`, `ga_overview` (users, sessions, engagement, key events, revenue by channel/source/campaign/page/country/device/date…), `ga_run_report` (any dimensions/metrics, filters, period comparison), `ga_realtime`, `ga_get_metadata` |
| **Google Ads** | `ads_list_accounts`, `ads_campaign_performance`, `ads_ad_group_performance`, `ads_keyword_performance`, `ads_search_terms`, `ads_ad_performance` (all with cost/conversion and ROAS), `ads_query` (any read-only GAQL), `ads_set_status` (pause/enable campaigns, ad groups, ads, keywords), `ads_set_campaign_budget` |

Every tool takes either a file ID or a full Google URL. Create tools take an optional `folderId` so new files land in the right Drive folder.

## Setup (one time, about 10 minutes)

### 1. Create a Google Cloud OAuth client

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library**: enable **Gmail API**, **Google Drive API**, **Google Docs API**, **Google Sheets API**, **Google Slides API**, **Google Analytics Data API**, **Google Analytics Admin API** and **Google Ads API**.
3. **APIs & Services → OAuth consent screen** (or "Google Auth Platform"): choose **External**, fill in the app name and your email, and under **Test users** add the Google account(s) you'll sign in with.
4. **Credentials → Create credentials → OAuth client ID**. Pick the application type **Desktop app**. Download the JSON.
5. Save the file as:
   ```
   C:\Users\<you>\.google-workspace-mcp\credentials.json
   ```
   You can choose a different folder by setting `GOOGLE_WORKSPACE_MCP_DIR`, point at a file with `GOOGLE_OAUTH_CREDENTIALS`, or set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` instead.

> While the app is in "Testing" mode, Google expires refresh tokens after 7 days. When that happens, run `npm run auth` again. To avoid it, publish the app ("In production"); for personal use you can skip Google's verification and accept the "unverified app" warning.

### 2. Build and sign in

```bash
cd ~/projects/google-workspace-mcp
npm install
npm run build
npm run auth
```

`npm run auth` opens your browser and asks for consent. When you approve, it saves `token.json` next to `credentials.json`.

### 2b. Google Ads developer token (only for `ads_*` tools)

The Google Ads API needs a **developer token** in addition to sign-in:
1. Sign in to a Google Ads **manager (MCC)** account that has access to your ad accounts (create one free at <https://ads.google.com/home/tools/manager-accounts/> if needed).
2. **Tools → Setup → API Center**, fill in the form and copy the developer token. New tokens start at "Test" access (test accounts only); apply for **Basic access** in the same page to use real accounts.
3. Ask Claude to run `google_setup` with `configure_ads` and your token (plus the manager account ID), or create `C:\Users\<you>\.google-workspace-mcp\ads.json` yourself:
   ```json
   { "developerToken": "YOUR_TOKEN", "loginCustomerId": "1234567890" }
   ```
   Environment variables `GOOGLE_ADS_DEVELOPER_TOKEN` / `GOOGLE_ADS_LOGIN_CUSTOMER_ID` also work. `GOOGLE_ADS_API_VERSION` overrides the API version (default `v26`).

The Google account you sign in with must have access to the Analytics properties and Ads accounts you want to use.

### 3. Add it to Claude

**Claude Code** (all projects):
```bash
claude mcp add --scope user google-workspace -- node /path/to/google-workspace-mcp/plugin/server/index.mjs
```

**Claude Desktop** (`%APPDATA%\Claude\claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp/plugin/server/index.mjs"]
    }
  }
}
```

Restart Claude, then try prompts like:
- "Find unread emails from my accountant this week and summarize them."
- "Reply to that thread saying I'll send it Friday, and attach the Q3 report from Drive."
- "Create a sheet from this CSV, analyze revenue by region, and add a column chart."
- "Build a 6-slide deck on our launch plan with speaker notes in my 'Marketing' folder, then share it with alex@example.com as a commenter."

## Scopes requested

`gmail.modify` (read, send, label; it **can't** permanently delete mail), `drive`, `documents`, `spreadsheets`, `presentations`, `analytics.readonly` (GA4 is read-only), `adwords` (Google Ads reporting and changes).

If you signed in before Analytics/Ads were added, `google_setup` → `status` lists `missingScopes`; run `sign_in` again to grant them.

## Safety notes

- Destructive tools (`drive_trash`, `drive_update_permission`, `sheets_clear`, `docs_delete_range`, `slides_manage_slide`, and `sheets_manage_tab`) are marked `destructiveHint` so clients can ask before running them. Drive deletes go to the trash, never permanent deletion.
- Claude Code asks before each tool call unless you allow it. Consider leaving `gmail_send`, `gmail_reply`, `drive_share`, `ads_set_status` and `ads_set_campaign_budget` on "ask".
- Google Ads changes take effect immediately and affect spend. Both Ads change tools support `validateOnly: true` for a dry run.
- `token.json` gives access to your account. Keep it private.

## Development

```bash
npm run build      # compile to dist/
npm run typecheck  # type-check only
```

Source: `src/auth.ts` (OAuth), `src/util.ts` (shared helpers), `src/tools/{gmail,drive,docs,sheets,slides}.ts`.
