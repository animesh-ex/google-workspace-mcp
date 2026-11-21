# Google Workspace for Claude

Connects Claude to your Google account: **Gmail, Drive, Docs, Sheets, Slides, Google Calendar, Google Chat, Google Contacts, Google Maps, Dialogflow, Apps Script, Google Analytics 4 and Google Ads** (117 tools, 8 skills).

- **Gmail:** search, read, send, reply, drafts, labels, attachments (from your computer or Drive).
- **Drive:** search, organize folders, upload/download, copy/move/rename, trash, and share any file.
- **Docs / Sheets / Slides:** create, read, edit and analyze. Docs from Markdown, sheet statistics and charts, full slide decks with speaker notes.
- **Google Calendar:** see and search events, schedule meetings with Meet links, update guests, RSVP, find free time.
- **Google Chat:** list spaces, read and search messages, send to a space or DM someone (Workspace accounts).
- **Google Contacts:** find anyone's email or phone (contacts, people you've emailed, company directory), add, update and group contacts.
- **Google Maps:** search businesses, pull every business detail incl. Google's AI summaries and reviews, photos, nearby places, geocoding, directions with traffic, distance matrix.
- **Dialogflow:** inspect and test ES/CX chatbots, create and improve intents.
- **Apps Script:** generate scripts for Google Sheets (automations, custom functions, menus, triggers), install them bound to a sheet, deploy, run and debug.
- **Google Analytics 4:** properties, traffic and conversion overviews, custom reports, realtime.
- **Google Ads:** campaign, keyword, ad and search-term performance with ROAS, GAQL queries, negative keywords, pause/enable and budget changes (Claude asks first).

Skills: connect Google, general Workspace, meeting scheduling, Maps business research, contacts, Dialogflow, Google Ads and Apps Script.

## Requirements

- **Node.js 20+** installed (the connector runs locally with `node`).
- A Google Cloud **Desktop app** OAuth client (`client_secret_*.json`) with the APIs above enabled.
- For Google Chat: the Chat API configured in your Cloud project (Workspace accounts only).
- For Google Maps: a Maps Platform API key (billing enabled).
- For Apps Script: "Google Apps Script API" switched on at script.google.com/home/usersettings.
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
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform API key without `maps.json` |
