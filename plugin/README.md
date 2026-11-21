# Google Workspace for Claude

Connects Claude to your Google account: **Gmail, Drive, Docs, Sheets, Slides, Google Analytics 4 and Google Ads** (72 tools).

- **Gmail:** search, read, send, reply, drafts, labels, attachments (from your computer or Drive).
- **Drive:** search, organize folders, upload/download, copy/move/rename, trash, and share any file.
- **Docs / Sheets / Slides:** create, read, edit and analyze. Docs from Markdown, sheet statistics and charts, full slide decks with speaker notes.
- **Google Analytics 4:** properties, traffic and conversion overviews, custom reports, realtime.
- **Google Ads:** campaign, keyword, ad and search-term performance with ROAS, GAQL queries, pause/enable and budget changes (Claude asks first).

## Requirements

- **Node.js 20+** installed (the connector runs locally with `node`).
- A Google Cloud **Desktop app** OAuth client (`client_secret_*.json`) with the APIs above enabled.
- For Google Ads: a developer token from a Google Ads manager account (Tools → API Center).

## Get started

Ask Claude to **"connect Google"** (or run `/google-workspace:setup`). Claude imports your downloaded client file, opens Google sign-in in your browser, and checks the connection.

Credentials and the sign-in token are stored only on your computer in `~/.google-workspace-mcp/`.

## Environment variables (optional)

| Variable | Purpose |
|---|---|
| `GOOGLE_WORKSPACE_MCP_DIR` | Folder for credentials and token (default `~/.google-workspace-mcp`) |
| `GOOGLE_OAUTH_CREDENTIALS` | Path to the OAuth client JSON |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client without a JSON file |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads access without `ads.json` |
| `GOOGLE_ADS_API_VERSION` | Google Ads API version (default `v26`) |
