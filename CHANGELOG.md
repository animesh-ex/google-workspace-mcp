# Changelog

All notable changes to the Google Workspace plugin for Claude.

## 1.8.0 — 2026-11-21
- **Google Search Console** (5 tools): list properties; performance by query, page, country, device, date or search appearance with filters and previous-period comparison; SEO opportunities (striking-distance queries, low CTR for position, pages losing clicks); URL inspection (indexing, canonical, crawl, mobile, rich results); sitemaps (list, submit, delete).
- **Google Merchant Center** (9 tools, Merchant API v1): accounts; one-time Cloud project registration; product status counts and top issues per destination and country; products with issues; single product details; Shopping performance (free listings and ads); price competitiveness vs benchmark; any MCQL report; data sources. Read-only on products.
- **Skills:** `search-console` and `merchant-center`.
- **New scopes:** `webmasters`, `content`.

## 1.7.0 — 2026-11-21
- **Settings page for API keys:** `google_setup` → `open_settings` (or "open settings", `/google-workspace:settings`) opens a private local page where you enter, change or remove the Google Maps API key, Google Ads developer token and manager account ID. Keys go straight to `~/.google-workspace-mcp/` and never pass through the chat.
  - **Security:** the page runs on 127.0.0.1 only, behind a random one-time link that expires after 10 minutes, and blocks wrong Host headers (DNS rebinding) and cross-site posts. It sends no-store, frame-deny and strict CSP headers.
  - **Behavior:** saved keys are shown masked, and a new Maps key is tested immediately.
- **New `settings` skill;** the setup skill now prefers the settings page. This works in the Claude app, whose plugin page shows only tool permissions.
- Docs updated: README, setup guide, skills guide, architecture.

## 1.6.0 — 2026-11-21
- **Plugin settings for API keys:** the plugin now declares settings that Claude asks for when it's enabled. These are the Google Maps API key and Google Ads developer token (both masked and kept in the system's secure credential store), the Google Ads manager account ID, and the OAuth client JSON path. They are passed to the server and take priority over `maps.json` / `ads.json`.
- Empty or unfilled settings are treated as not set, so the files in `~/.google-workspace-mcp/` still work.
- `google_setup` → `status` shows where each value comes from. Saving a key in chat warns if a plugin setting overrides it, and importing a client file is blocked when the settings point to one.
- The setup skill offers both ways to enter keys and never repeats keys back. The setup guide has a new "Plugin settings" section.

## 1.5.1 — 2026-11-21
- **Detailed documentation** in `docs/`:
  - [SETUP.md](docs/SETUP.md): every setup step, service-specific steps, switching accounts, updating and uninstalling.
  - [SKILLS.md](docs/SKILLS.md): each skill's workflow, confirmations and example prompts.
  - [TOOLS.md](docs/TOOLS.md): all 130 tools with every parameter, generated from the code by `npm run docs`.
  - [ARCHITECTURE.md](docs/ARCHITECTURE.md): how it works, repository layout, adding tools, releasing, security.
- README links to the guides and explains that all tools act as one signed-in account.

## 1.5.0 — 2026-11-21
- **Google Tag Manager** (13 tools): scan any website's tracking (GTM containers and their live contents, GA4/Ads/UA IDs, consent mode and platforms, other pixels, inline dataLayer); read containers; create workspaces; enable built-in variables; add Data Layer Variables, Custom Event triggers, and the Google tag plus GA4 event tags (with ecommerce); raw create/update/delete; create versions; publish; list versions for rollback.
- **`tag-manager` skill:** scan → read and record the live dataLayer in a browser → compare with GTM and GA4 against the GA4 ecommerce schema → configure in a separate workspace → version → preview → publish only on approval.
- New scopes: `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, `tagmanager.publish`.

## 1.4.1 — 2026-11-21
- Apps Script: the Cloud project number in setup hints is now read from your own OAuth client instead of being fixed, and `google_setup` → `status` reports it as `cloudProjectNumber`.
- Full documentation rewrite: example prompts, a setup guide per service, skills, the tool reference, permissions, configuration, safety and troubleshooting.

## 1.4.0 — 2026-11-21
- **Apps Script** (7 tools): create standalone scripts or scripts bound to a Sheet or Doc, read and edit files, deploy, run functions with results or errors, and view execution logs.
- **`apps-script` skill:** generate reliable scripts for Google Sheets (header-based, batched, never reprocessing rows), install them on the sheet, authorize, run and debug. Includes patterns for emails, custom formulas, menus, triggers, sidebars and web apps.
- New scopes: `script.projects`, `script.deployments`, `script.processes`, and the scopes scripts need when run through the API.

## 1.3.0 — 2026-11-21
- **Contacts / People API** (7 tools): search your contacts, people you've emailed and the company directory; create, update and delete contacts; manage labels.
- **Dialogflow** (9 tools): ES agent, intents (list, create, add phrases and responses, delete) and test messages; CX agents, intents and test messages; regional agents.
- **Maps:** search returns up to 60 results with optional AI review summaries. Place details return every field, including Google's AI overview, review summary, neighborhood summary, amenities, payment, parking, accessibility and price range. New `maps_place_photos`.
- **Google Ads:** new `ads_add_negative_keywords`.
- **Skills:** `calendar-scheduling`, `maps-business-research`, `google-contacts`, `dialogflow`, `google-ads`.

## 1.2.0 — 2026-11-21
- **Google Calendar** (9 tools): list and search events, create with guests, Meet links, repeats and reminders; update guests, cancel, RSVP, quick add, and find free time.
- **Google Chat** (5 tools): spaces, read and search messages, send to a space or DM, thread replies, members.
- **Google Maps** (6 tools, API key): place search, nearby places, details, geocoding, directions with traffic, distance matrix.
- `google_setup` gains `configure_maps`.

## 1.1.2 — 2026-11-21
- Docs: snake_case words such as `utm_source` keep their underscores when converting Markdown.

## 1.1.0 / 1.1.1 — 2026-11-19
- **Google Analytics 4** (5 tools): properties, overview, custom reports with comparisons, realtime, metadata.
- **Google Ads** (9 tools): accounts, campaign, ad group, keyword, ad and search-term performance with ROAS, GAQL queries, pause/enable, budgets.
- Packaged as a `.plugin` file for the Claude app; the setup command became a skill.

## 1.0.0 — 2026-11-17
- First release: Gmail, Drive, Docs, Sheets and Slides (57 tools), local OAuth sign-in, and in-chat setup via `google_setup`, packaged as a Claude Code plugin with a local marketplace.
