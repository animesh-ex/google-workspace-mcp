# Google Workspace for Claude

A Claude plugin and MCP server that connects Claude to your Google account: **Gmail, Drive, Docs, Sheets, Slides, Calendar, Chat, Contacts, Maps, Apps Script, Dialogflow, Google Tag Manager, Google Search Console, Google Merchant Center, Google Analytics 4 and Google Ads**. It's **144 tools and 12 skills** in one package.

It runs on your own computer and signs in with your own Google account. Your credentials and tokens never leave your machine.

- **Version:** 1.8.0 · [Changelog](CHANGELOG.md) · [Latest release](https://github.com/animesh-ex/google-workspace-mcp/releases/latest)
- **Requires:** Node.js 20 or newer
- **License:** MIT

## Documentation

| Guide | What's in it |
|---|---|
| **[Setup guide](docs/SETUP.md)** | Step by step: Cloud project, APIs, consent screen, OAuth client, install, sign-in, and the extra steps for Chat, Apps Script, Maps, Ads, Tag Manager, Analytics and Dialogflow. Switching accounts, updating, uninstalling. |
| **[Skills guide](docs/SKILLS.md)** | What each of the 12 skills does, its workflow, what it confirms with you, and example prompts. |
| **[Tool reference](docs/TOOLS.md)** | All 144 tools with every parameter, its type, default and description (generated from the code). |
| **[Architecture and development](docs/ARCHITECTURE.md)** | How it works, repository layout, adding tools, releasing, security notes. |

> **One account at a time:** every tool acts as the single Google account you signed in with. Emails, files, events and GTM changes are made as that account. See [Choosing or switching the Google account](docs/SETUP.md#choosing-or-switching-the-google-account).

---

## Contents
- [What you can ask Claude](#what-you-can-ask-claude)
- [Install](#install)
- [Setup](#setup)
- [Skills](#skills)
- [Tools](#tools)
- [Permissions](#permissions-oauth-scopes)
- [Configuration files and environment variables](#configuration-files-and-environment-variables)
- [Safety](#safety)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## What you can ask Claude

| Area | Example prompts |
|---|---|
| **Gmail** | "Summarize my unread email from today." "Reply to Priya's thread saying we'll ship Friday and attach the Q3 report from Drive." |
| **Calendar** | "Find 30 minutes next week with Alex and Priya and send an invite with a Meet link." "Move my 3pm to tomorrow." |
| **Contacts** | "What's Rahul's phone number?" "Add the people from this sheet as contacts under the label *Suppliers*." |
| **Chat** | "Post the release notes in the Marketing space." "What did the team say about the launch in the last 24 hours?" |
| **Drive / Docs / Slides** | "Turn these notes into a Google Doc in my *Reports* folder and share it with the team as commenters." "Build a 6-slide deck on our Q4 plan with speaker notes." |
| **Sheets** | "Analyze revenue by region in this sheet and add a chart." |
| **Apps Script** | "Write a script for this sheet that emails each customer their order status and marks the row as sent." "Add a custom formula that converts carats to grams." |
| **Maps** | "Find jewelry stores in Surat with 4.5+ ratings, summarize what customers say, and put them in a sheet." "How long is the drive from the office to the airport at 6pm?" |
| **Tag Manager** | "Audit the tracking on our website, read the dataLayer on the product and cart pages, and set up GA4 ecommerce events in GTM." "Why isn't GA4 recording page views?" |
| **Search Console** | "Which queries and pages lost Google clicks this month, and why?" "Find SEO quick wins and check whether our ring pages are indexed." |
| **Merchant Center** | "How many products are disapproved in Merchant Center and what are the top issues?" "Which products get Shopping clicks but no sales?" |
| **Analytics** | "How did traffic by channel change versus last month?" |
| **Ads** | "Review my Google Ads for the last 30 days and find wasted spend." "Add these search terms as negative keywords." |
| **Dialogflow** | "Test my support bot with 20 customer questions and show me where it fails." "Turn this FAQ doc into bot intents." |

---

## Install

### Claude app (Cowork)
Download **`google-workspace.plugin`** from the [latest release](https://github.com/animesh-ex/google-workspace-mcp/releases/latest), open it in the Claude app, and click **Install**.

### Claude Code
```bash
claude plugin marketplace add animesh-ex/google-workspace-mcp
```
```bash
claude plugin install google-workspace@google-workspace-local --scope user
```
Restart Claude Code. To update later, run `claude plugin marketplace update google-workspace-local` and then `claude plugin update google-workspace@google-workspace-local`.

### Other MCP clients (Claude Desktop chat, etc.)
Clone the repo and run the bundled server over stdio. No `npm install` is needed. For example, in Claude Desktop's `claude_desktop_config.json` (Settings → Developer → Edit Config):
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

---

## Setup

Once installed, just say **"connect Google"** (or run `/google-workspace:setup`). Claude walks you through each step and checks it. Here's the short version; the **[full setup guide](docs/SETUP.md)** has every click, the service-specific steps and how to switch accounts.

### 1. Google Cloud project and OAuth client (once, about 10 minutes)
1. Open <https://console.cloud.google.com/> and create or pick a project.
2. **APIs & Services → Library**: enable the APIs for the services you want:

   | Service | API to enable |
   |---|---|
   | Gmail, Drive, Docs, Sheets, Slides | Gmail API, Google Drive API, Google Docs API, Google Sheets API, Google Slides API |
   | Calendar | Google Calendar API |
   | Chat | Google Chat API (plus configuration, step 3) |
   | Contacts | People API |
   | Apps Script | Apps Script API (plus a per-user switch, step 4) |
   | Dialogflow | Dialogflow API |
   | Tag Manager | Tag Manager API |
   | Search Console | Google Search Console API |
   | Merchant Center | Merchant API (plus a one-time project registration) |
   | Analytics | Google Analytics Data API, Google Analytics Admin API |
   | Ads | Google Ads API (plus a developer token, step 6) |
   | Maps | Places API (New), Geocoding API, Routes API (plus an API key, step 5) |

3. **OAuth consent screen** (also called "Google Auth Platform"):
   - **Google Workspace organization:** choose **Internal**. Sign-ins don't expire and Google doesn't review the app.
   - **Personal Gmail:** choose **External** and add your account under **Test users**. While the app is in Testing, Google signs you out every 7 days.
4. **Credentials → Create credentials → OAuth client ID → Desktop app → Create → Download JSON.** Leave the `client_secret_*.json` in your Downloads folder; Claude imports it for you.

### 2. Sign in
Claude runs `google_setup` → `sign_in`, which opens Google's consent page. Pick the account Claude should use and click **Allow**. For your own app, Google may warn that it's "unverified"; choose **Continue**.

When new features add permissions, `google_setup` → `status` lists them as `missingScopes`. Sign in again to grant them.

### 3. Google Chat (Workspace accounts only)
Google requires the Chat API to be configured once per Cloud project, even if you only read and send as yourself. Go to **APIs & Services → Google Chat API → Configuration**, enter an app name, avatar URL and description, and **Save**.

### 4. Apps Script
- The signed-in account must switch on **Google Apps Script API** at <https://script.google.com/home/usersettings>. This is a per-user setting.
- Creating and editing scripts works right away. To **run** a script's functions from Claude (`script_run`), do this once per script:
  1. In the script editor, go to **Project Settings → Google Cloud Platform (GCP) Project → Change project** and enter your project number. `google_setup` → `status` shows it as `cloudProjectNumber`.
  2. Run any function once in the editor and approve Google's permission screen.
  3. Let Claude deploy it with `script_deploy`.

### 5. Google Maps API key (optional)
Maps Platform uses an **API key** instead of sign-in, and the project needs **billing enabled**. Google includes a monthly free allowance.
1. **APIs & Services → Credentials → Create credentials → API key.**
2. Restrict the key to **Places API (New)**, **Geocoding API** and **Routes API**.
3. Enter it in the **plugin settings** (see below), give it to Claude in chat (`google_setup` → `configure_maps`), or save `~/.google-workspace-mcp/maps.json` as `{ "apiKey": "YOUR_KEY" }`.

### 6. Google Ads developer token (optional)
1. Sign in to a Google Ads **manager (MCC)** account with access to your ad accounts. You can [create one for free](https://ads.google.com/home/tools/manager-accounts/).
2. Go to **Tools → Setup → API Center** and copy the developer token. New tokens only work on test accounts until you apply for **Basic access** on the same page.
3. Enter the token and manager account ID in the **plugin settings** (see below), give them to Claude in chat (`google_setup` → `configure_ads`), or save `~/.google-workspace-mcp/ads.json`:
   ```json
   { "developerToken": "YOUR_TOKEN", "loginCustomerId": "1234567890" }
   ```

### 7. Access to your data
The signed-in Google account must itself have access to what you want Claude to use: the GTM containers (Publish permission to publish), the Search Console properties, the Merchant Center account, the GA4 properties (GA4 Admin → Property access management), the Google Ads accounts, the Dialogflow project (role *Dialogflow API Client*, or *Admin* to edit intents), and any shared Drive files and calendars.

---

## Skills

Skills teach Claude the workflow, not just the API calls. Claude loads the right one automatically from what you ask. See the **[skills guide](docs/SKILLS.md)** for each workflow and example prompts.

| Skill | What it does |
|---|---|
| `settings` | Opens the plugin's settings page in your browser to enter, change or remove the Maps API key and Google Ads token. Keys never pass through the chat. |
| `setup` | Connects your Google account step by step: imports the client file, signs in, checks permissions, and configures Chat, Apps Script, Maps and Ads. |
| `google-workspace` | Everyday Gmail, Drive, Docs, Sheets, Slides, Chat and GA4 work. Resolves names to emails and confirms before sending or sharing. |
| `calendar-scheduling` | Resolves names to emails, finds free slots for everyone, proposes 2–3 times, confirms, then creates the event with a Meet link and invites. Also handles rescheduling, guests, cancelling and RSVPs. |
| `google-contacts` | Looks people up across your contacts, people you've emailed and the company directory. Adds, edits, groups, exports and cleans up contacts. |
| `maps-business-research` | Finds businesses and pulls every detail: contact info, hours, price range, ratings, reviews, Google's AI summaries, amenities and photos. Writes profiles or competitor comparisons and exports to Sheets. Directions and travel times. |
| `search-console` | Google organic search performance with period comparison and brand/non-brand splits, traffic-drop diagnosis, SEO quick wins (striking-distance queries, low-CTR titles, pages losing clicks), URL inspection and sitemaps. |
| `merchant-center` | Product health audit (counts per destination and the top issues with fixes), affected products, Shopping performance (free listings vs ads), price competitiveness vs other sellers, best sellers and custom reports. Read-only on products; fixes go in your feed. |
| `tag-manager` | Scans the website's tracking (GTM, GA4, Ads, pixels, consent), reads and records the live dataLayer in a browser, compares it with the GTM container and GA4, then configures tags, triggers and variables in a separate workspace, creates a version, and publishes only after you approve. Writes exact `dataLayer.push` code for any site changes. |
| `apps-script` | Reads your sheet, writes reliable Apps Script (header-based, batched, never processes the same row twice), installs it on the sheet, and runs and debugs it. Includes patterns for emails, custom formulas, menus, triggers, sidebars and web apps. |
| `dialogflow` | Inspects ES and CX bots, runs test conversations (question → intent → confidence → reply), and creates or improves intents, including from FAQ docs. |
| `google-ads` | Structured performance review (campaigns → keywords → search terms → ads), wasted-spend analysis and recommendations. Makes changes only after you confirm, with an optional dry run. |

---

## Tools

Every tool accepts either an ID or a full Google URL. Create tools take an optional `folderId` so new files land in the right Drive folder. The **[tool reference](docs/TOOLS.md)** lists every parameter.

<details>
<summary><b>Gmail (12)</b></summary>

`gmail_search`, `gmail_read_message`, `gmail_read_thread`, `gmail_send`, `gmail_reply` (reply or reply-all in the same thread, or save as a draft), `gmail_create_draft`, `gmail_list_drafts`, `gmail_send_draft`, `gmail_download_attachment` (to disk or straight into Drive), `gmail_modify` (read/unread, star, archive, trash, labels), `gmail_list_labels`, `gmail_create_label`.

**Attachments:** `gmail_send`, `gmail_reply` and `gmail_create_draft` accept `attachmentPaths` (local files) and `driveFileIds`. Docs and Slides are attached as PDF, Sheets as XLSX.
</details>

<details>
<summary><b>Drive and sharing (15)</b></summary>

`drive_search`, `drive_list_folder`, `drive_get_file`, `drive_read_file_text`, `drive_create_folder`, `drive_upload_file` (optionally converts to Google formats), `drive_download_file` (export to pdf, docx, xlsx, csv, pptx, md), `drive_move`, `drive_copy`, `drive_update_metadata`, `drive_trash` (recoverable), `drive_about`, `drive_share` (user, group, domain or anyone with the link; reader, commenter, writer or owner), `drive_list_permissions`, `drive_update_permission`.
</details>

<details>
<summary><b>Docs (8) · Sheets (11) · Slides (11)</b></summary>

**Docs:** `docs_create` (from Markdown), `docs_read` (Markdown, or a structure with positions), `docs_insert_markdown`, `docs_replace_text`, `docs_delete_range`, `docs_insert_table`, `docs_insert_image`, `docs_batch_update`.

**Sheets:** `sheets_create`, `sheets_get_info`, `sheets_read`, `sheets_write` (formulas work), `sheets_append_rows`, `sheets_clear`, `sheets_manage_tab`, `sheets_format`, `sheets_add_chart`, `sheets_analyze` (per-column statistics and group-by summaries), `sheets_batch_update`.

**Slides:** `slides_create` (a whole deck with layouts, bullets, two columns, speaker notes and images), `slides_read`, `slides_add_slides`, `slides_replace_text`, `slides_set_text`, `slides_set_notes`, `slides_add_image`, `slides_add_text_box`, `slides_manage_slide`, `slides_get_thumbnail`, `slides_batch_update`.
</details>

<details>
<summary><b>Calendar (9) · Chat (5) · Contacts (7)</b></summary>

**Calendar:** `calendar_list_calendars`, `calendar_list_events`, `calendar_get_event`, `calendar_create_event` (guests, Google Meet, recurrence, reminders), `calendar_update_event` (add or remove guests), `calendar_delete_event`, `calendar_respond`, `calendar_quick_add`, `calendar_find_free_time`.

**Chat** (Workspace accounts only): `chat_list_spaces`, `chat_list_messages`, `chat_search_messages`, `chat_send_message` (to a space, a DM by email, or a thread reply), `chat_list_members`.

**Contacts** (People API): `contacts_search` (your contacts, people you've emailed, and the company directory), `contacts_list`, `contacts_get`, `contacts_create`, `contacts_update`, `contacts_delete`, `contacts_groups`.
</details>

<details>
<summary><b>Apps Script (7)</b></summary>

`script_create_project` (standalone, or attached to a Sheet, Doc, Slides or Form), `script_get_content`, `script_update_files` (merge, replace or delete files), `script_list_projects`, `script_deploy` (version and deployment), `script_run` (returns the function's result, or the error with a stack trace), `script_logs` (recent executions).
</details>

<details>
<summary><b>Maps (7)</b></summary>

`maps_search_places` (up to 60 results, optional AI review summaries), `maps_nearby`, `maps_place_details` (every field Google has, including AI overview, review summary, neighborhood summary, reviews, amenities, payment, parking, accessibility and price range), `maps_place_photos`, `maps_geocode` (and reverse), `maps_directions` (traffic-aware, with steps and a Maps link), `maps_distance_matrix`.
</details>

<details>
<summary><b>Google Tag Manager (13)</b></summary>

`gtm_scan_website` (tracking IDs, pixels, consent, inline dataLayer and the live container's contents from any URL), `gtm_list_containers`, `gtm_get_container` (all tags, triggers, variables and the live version), `gtm_workspace` (list, create, status), `gtm_enable_builtin_variables`, `gtm_add_datalayer_variables`, `gtm_add_event_trigger`, `gtm_add_ga4_tags` (Google tag plus GA4 event tags with ecommerce), `gtm_upsert` (any tag, trigger or variable as raw JSON), `gtm_delete`, `gtm_create_version`, `gtm_publish`, `gtm_list_versions`.
</details>

<details>
<summary><b>Search Console (5) · Merchant Center (9)</b></summary>

**Search Console:** `gsc_list_sites`, `gsc_performance` (queries, pages, countries, devices, dates, search appearance; filters; period comparison), `gsc_opportunities`, `gsc_inspect_url`, `gsc_sitemaps` (list, submit, delete).

**Merchant Center** (Merchant API v1): `merchant_list_accounts`, `merchant_registration` (one-time project registration), `merchant_product_status` (counts and top issues per destination and country), `merchant_list_products`, `merchant_get_product`, `merchant_performance` (clicks, impressions, conversions by product, date, brand, category, ads vs organic, country), `merchant_price_competitiveness`, `merchant_report` (any MCQL), `merchant_data_sources`.
</details>

<details>
<summary><b>Google Analytics 4 (5) · Google Ads (10)</b></summary>

**GA4:** `ga_list_properties`, `ga_overview` (users, sessions, engagement, key events and revenue by channel, source, campaign, page, country, device or date), `ga_run_report` (any dimensions and metrics, filters, period comparison), `ga_realtime`, `ga_get_metadata`.

**Ads:** `ads_list_accounts`, `ads_campaign_performance`, `ads_ad_group_performance`, `ads_keyword_performance`, `ads_search_terms`, `ads_ad_performance` (all with cost per conversion and ROAS), `ads_query` (read-only GAQL), `ads_add_negative_keywords`, `ads_set_status`, `ads_set_campaign_budget`. Uses Google Ads API `v26` by default.
</details>

<details>
<summary><b>Dialogflow (9) · Setup (1)</b></summary>

**Dialogflow ES:** `dialogflow_get_agent`, `dialogflow_list_intents`, `dialogflow_detect_intent`, `dialogflow_create_intent`, `dialogflow_update_intent`, `dialogflow_delete_intent`.
**Dialogflow CX:** `dialogflow_cx_list_agents`, `dialogflow_cx_list_intents`, `dialogflow_cx_detect_intent`. Regional agents are supported.

**Setup:** `google_setup` with these actions: `status`, `import_credentials`, `sign_in`, `sign_out`, `configure_ads`, `configure_maps`.
</details>

---

## Permissions (OAuth scopes)

| Scope | Used for |
|---|---|
| `gmail.modify` | Read, send, reply and label mail. It **can't** permanently delete mail. |
| `drive`, `documents`, `spreadsheets`, `presentations` | Files, Docs, Sheets, Slides and sharing |
| `calendar` | Read and manage events, free/busy |
| `chat.spaces.readonly`, `chat.messages`, `chat.memberships.readonly`, `chat.spaces.create` | Read and send Chat messages, start DMs |
| `contacts`, `contacts.other.readonly`, `directory.readonly` | Contacts and the company directory |
| `script.projects`, `script.deployments`, `script.processes` | Create, deploy and monitor Apps Script projects |
| `script.send_mail`, `script.external_request`, `script.scriptapp`, `script.container.ui` | Needed by scripts that run through the API |
| `dialogflow` | Dialogflow ES and CX agents |
| `tagmanager.readonly`, `tagmanager.edit.containers`, `tagmanager.edit.containerversions`, `tagmanager.publish` | Read, edit, version and publish GTM containers |
| `webmasters` | Search Console performance, URL inspection and sitemaps |
| `content` | Merchant Center via the Merchant API |
| `analytics.readonly` | GA4 reports (read-only) |
| `adwords` | Google Ads reporting and changes |

Maps uses an API key, not a scope.

---

## Configuration files and environment variables

### Settings page
**Settings page (works everywhere, recommended):** say **"open settings"** (or run `/google-workspace:settings`). A private page opens in your browser at `http://127.0.0.1:…`, reachable only from this computer, with a link that expires after 10 minutes. Enter the Google Maps API key, Google Ads developer token and manager account ID, then click **Save**. Keys are saved on this computer only, never pass through the chat, and are shown masked afterwards. A new Maps key is tested immediately. Leave a field empty to keep its value, or tick "Remove saved value" to delete it.

### Plugin settings form
In Claude Code, the plugin also declares a settings form that's shown when you enable it. Every field is optional:

| Setting | Stored | Used for |
|---|---|---|
| **Google Maps API key** | Masked; kept in the system's secure credential store | `maps_*` tools |
| **Google Ads developer token** | Masked; kept in the system's secure credential store | `ads_*` tools |
| **Google Ads manager (MCC) account ID** | Claude settings; editable in `/config` | Accessing ad accounts through a manager |
| **OAuth client JSON path** | Claude settings; editable in `/config` | Using your `client_secret_….json` where it is, instead of importing it |

Plugin settings take priority over the files below and apply after a restart. Details, including how to change them later, are in the [setup guide](docs/SETUP.md#plugin-settings-api-keys).

### Files

Everything is stored in `~/.google-workspace-mcp/`, which on Windows is `C:\Users\<you>\.google-workspace-mcp\`:

| File | Contents |
|---|---|
| `credentials.json` | Your OAuth Desktop client |
| `token.json` | Your sign-in (refresh token). **Keep it private.** |
| `ads.json` | Google Ads developer token and manager ID (optional) |
| `maps.json` | Maps Platform API key (optional) |

| Variable | Purpose |
|---|---|
| `GOOGLE_WORKSPACE_MCP_DIR` | Use a different config folder |
| `GOOGLE_OAUTH_CREDENTIALS` | Path to the OAuth client JSON |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth client without a JSON file |
| `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Ads access without `ads.json` |
| `GOOGLE_ADS_API_VERSION` | Ads API version (default `v26`) |
| `GOOGLE_MAPS_API_KEY` | Maps key without `maps.json` |

---

## Safety

- **Claude asks first.** The skills tell Claude to confirm before anything that reaches other people or costs money: sending email or Chat messages, sharing files, inviting or cancelling meeting guests, running scripts that send mail or change data, and any Google Ads change.
- **Tool hints.** Tools that change or remove things are marked with MCP `destructiveHint`, so clients can ask before running them. Consider keeping `gmail_send`, `gmail_reply`, `chat_send_message`, `drive_share`, `calendar_create_event`, `calendar_delete_event`, `script_run`, `contacts_delete`, `dialogflow_delete_intent`, `gtm_publish`, `ads_set_status`, `ads_set_campaign_budget` and `ads_add_negative_keywords` on "ask" in Claude Code.
- **GTM changes are staged.** Claude makes GTM changes in a separate workspace and creates a version; nothing goes live until `gtm_publish`, which the skill only runs after you approve. Earlier versions can be republished to roll back.
- **Recoverable deletes.** Drive deletes go to the trash, and Gmail trash is recoverable for 30 days.
- **Ads dry runs.** Google Ads changes take effect immediately; every Ads change tool supports `validateOnly: true` for a dry run.
- **Nothing leaves your machine.** No telemetry; credentials stay in your config folder.

---

## Troubleshooting

| Message | Fix |
|---|---|
| "Not signed in" / "OAuth client file not found" | Say "connect Google", or run `google_setup` → `import_credentials` and then `sign_in`. |
| `missingScopes` in `status`, or "insufficient authentication scopes" | Sign in again (`google_setup` → `sign_in`). |
| "… API has not been used in project … or it is disabled" | Enable that API in the **same** Cloud project as your OAuth client, then wait a few minutes. |
| Chat: "Google Chat app not found" | Configure the Chat API (Setup step 3). |
| Apps Script: "User has not enabled the Apps Script API" | Switch it on at <https://script.google.com/home/usersettings>. |
| Apps Script: "Requested entity was not found" on `script_run` | Set the script's GCP project and deploy it (Setup step 4). |
| Maps: "isn't configured" or "API key not valid" | Add a key with billing enabled (Setup step 5). |
| Ads: "DEVELOPER_TOKEN_NOT_APPROVED" | The token has Test access only; apply for Basic access. |
| GTM: "The caller does not have permission" | Give the signed-in account access to the container in GTM → Admin → User Management (Publish to publish). |
| Merchant Center: "… not registered …" | Register this Cloud project with the Merchant Center account once (`merchant_registration` → `register`). |
| Search Console: site missing from `gsc_list_sites` | Add the signed-in account in Search Console → Settings → Users and permissions. |
| Dialogflow: "No DesignTimeAgent found" | Wrong project ID, or the agent is CX (use the `dialogflow_cx_*` tools). |
| Signed out every 7 days | The OAuth app is External and in Testing; use Internal (Workspace) or publish the app. |

---

## Development

See **[architecture and development](docs/ARCHITECTURE.md)** for how it works and how to add tools.

```bash
npm install
npm run build         # TypeScript → dist/
npm run build:plugin  # bundle → plugin/server/index.mjs (what the plugin runs)
npm run docs          # regenerate docs/TOOLS.md
npm run typecheck
npm run auth          # command-line sign-in (alternative to google_setup)
```

| Path | Contents |
|---|---|
| `src/auth.ts` | OAuth, scopes, token storage |
| `src/util.ts` | Shared helpers and tool registration |
| `src/tools/*.ts` | One file per service |
| `plugin/` | The installable plugin: manifest, `.mcp.json`, bundled server, skills |
| `.claude-plugin/marketplace.json` | Lets `claude plugin marketplace add` install from this repo |

To release: bump the version in `package.json`, `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`, then run `npm run build:plugin`. Zip the contents of `plugin/` as `google-workspace.plugin` and attach it to a GitHub release.
