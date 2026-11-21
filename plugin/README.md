# Google Workspace for Claude

Version 1.7.0 · 130 tools · 10 skills

Guides: [Setup](https://github.com/animesh-ex/google-workspace-mcp/blob/main/docs/SETUP.md) · [Skills](https://github.com/animesh-ex/google-workspace-mcp/blob/main/docs/SKILLS.md) · [Tool reference](https://github.com/animesh-ex/google-workspace-mcp/blob/main/docs/TOOLS.md) · [Architecture](https://github.com/animesh-ex/google-workspace-mcp/blob/main/docs/ARCHITECTURE.md)

Connects Claude to your Google account: **Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, Contacts, Maps, Apps Script, Dialogflow, Google Tag Manager, Google Analytics 4 and Google Ads**. It runs on your computer, and your credentials never leave it.

## What it does
- **Gmail:** search, read, send and reply (with attachments from your computer or Drive), drafts, labels.
- **Drive:** search, organize folders, upload and download, copy, move, rename, trash, and share any file.
- **Docs, Sheets, Slides:** create, read, edit and analyze. Docs from Markdown, sheet statistics and charts, full slide decks with speaker notes.
- **Calendar:** see and search events, schedule meetings with Meet links and invites, change guests, RSVP, find free time.
- **Chat:** list spaces, read and search messages, post to a space or DM someone (Workspace accounts).
- **Contacts:** find anyone's email or phone across your contacts, people you've emailed and the company directory; add, update and label contacts.
- **Maps:** search businesses and pull every detail, including Google's AI summaries, reviews and photos; nearby places, geocoding, directions with traffic, travel-time matrix.
- **Apps Script:** generate scripts for Google Sheets (automations, custom formulas, menus, triggers), install them on the sheet, deploy, run and debug.
- **Dialogflow:** inspect and test ES and CX chatbots; create and improve intents.
- **Google Tag Manager:** scan a website's tracking, read the live dataLayer, audit the container, set up GA4 and ecommerce tags, triggers and variables, version and publish (after you approve).
- **Google Analytics 4:** traffic and conversion overviews, custom reports with period comparison, realtime.
- **Google Ads:** campaign, keyword, ad and search-term performance with ROAS, GAQL queries, negative keywords, pause/enable, budgets.

## Skills
`setup` · `settings` · `google-workspace` · `calendar-scheduling` · `google-contacts` · `maps-business-research` · `apps-script` · `tag-manager` · `dialogflow` · `google-ads`

Claude picks the right skill from what you ask. It confirms before sending email or Chat messages, sharing files, inviting or cancelling meeting guests, running scripts that change data, publishing a GTM container, or making any Google Ads change.

## Requirements
- **Node.js 20+.**
- A Google Cloud **Desktop app** OAuth client (`client_secret_*.json`) with the APIs you need enabled.
- **Optional extras:**
  - Chat: the Chat API configured in your Cloud project (Workspace accounts only).
  - Apps Script: "Google Apps Script API" switched on at script.google.com/home/usersettings.
  - Maps: a Maps Platform API key, with billing enabled.
  - Google Ads: a developer token from a manager account (Tools → API Center).

## Get started
Say **"connect Google"** (or run `/google-workspace:setup`). Claude imports your downloaded client file, opens Google sign-in in your browser, checks permissions, and helps configure the extras.

Credentials, the sign-in token and any API keys are stored only in `~/.google-workspace-mcp/`.

## Settings
Say **"open settings"** (or run `/google-workspace:settings`). A private settings page opens in your browser where you enter the Google Maps API key, Google Ads developer token and manager account ID. Keys are saved on this computer only and never pass through the chat.

In Claude Code, the plugin also has a settings form shown when you enable it. All fields are optional:
- **Google Maps API key**, masked and stored securely
- **Google Ads developer token**, masked and stored securely
- **Google Ads manager (MCC) account ID**
- **OAuth client JSON path**

You can also set keys in chat ("save my Google Maps key"). Plugin settings take priority, and `google_setup` → `status` shows where each value comes from.

## Environment variables (optional)

| Variable | Purpose |
|---|---|
| `GOOGLE_WORKSPACE_MCP_DIR` | Folder for credentials and token (default `~/.google-workspace-mcp`) |
| `GOOGLE_OAUTH_CREDENTIALS` | Path to the OAuth client JSON |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client without a JSON file |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Google Ads access without `ads.json` |
| `GOOGLE_ADS_API_VERSION` | Google Ads API version (default `v26`) |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform API key without `maps.json` |
