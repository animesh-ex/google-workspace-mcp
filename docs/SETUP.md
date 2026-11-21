# Setup guide

This guide takes you from nothing to a working connection. The quickest route is to install the plugin and say **"connect Google"**: the `setup` skill runs these steps with you and checks each one. Use this page as the reference, or to set things up by hand.

- [Before you start](#before-you-start)
- [Step 1: Create a Google Cloud project](#step-1-create-a-google-cloud-project)
- [Step 2: Enable the APIs](#step-2-enable-the-apis)
- [Step 3: Configure the OAuth consent screen](#step-3-configure-the-oauth-consent-screen)
- [Step 4: Create the OAuth client](#step-4-create-the-oauth-client)
- [Step 5: Install the plugin](#step-5-install-the-plugin)
- [Step 6: Sign in](#step-6-sign-in)
- [Plugin settings (API keys)](#plugin-settings-api-keys)
- [Service-specific steps](#service-specific-steps): Chat, Apps Script, Maps, Google Ads, Tag Manager, Analytics, Dialogflow
- [Choosing or switching the Google account](#choosing-or-switching-the-google-account)
- [Updating](#updating)
- [Uninstalling](#uninstalling)

---

## Before you start

| You need | Notes |
|---|---|
| **Node.js 20 or newer** | Check with `node --version`. Install from <https://nodejs.org>. |
| A **Google account** | A Google Workspace account (for example `you@yourcompany.com`) gets the most: Chat, the company directory, and an "Internal" app that never signs you out. A personal Gmail account works for everything except Chat and the directory. |
| Access to **Google Cloud Console** | <https://console.cloud.google.com>. A Workspace admin may need to allow project creation. |
| **Claude** | The Claude app (Cowork) or Claude Code. Any MCP client works with manual configuration. |

Time needed: about 10 minutes for the core setup, plus a few minutes for each optional extra (Maps key, Ads token and so on).

---

## Step 1: Create a Google Cloud project
1. Open <https://console.cloud.google.com/projectcreate>.
2. Name it (e.g. *Claude Workspace*), choose your organization if asked, and click **Create**.
3. Make sure the new project is selected in the project picker at the top.

**Project number:** you'll need it later for Apps Script. It's on the project's dashboard, and after setup `google_setup` → `status` shows it as `cloudProjectNumber`.

---

## Step 2: Enable the APIs
Go to **APIs & Services → Library**, search for each API and click **Enable**. Enable only what you'll use; you can add more later.

| Service | API(s) | Needed for |
|---|---|---|
| Gmail | Gmail API | `gmail_*` |
| Drive | Google Drive API | `drive_*`, exports, attachments from Drive |
| Docs | Google Docs API | `docs_*` |
| Sheets | Google Sheets API | `sheets_*` |
| Slides | Google Slides API | `slides_*` |
| Calendar | Google Calendar API | `calendar_*` |
| Chat | Google Chat API | `chat_*` (plus configuration, below) |
| Contacts | People API | `contacts_*` |
| Apps Script | Apps Script API | `script_*` (plus a per-user switch, below) |
| Tag Manager | Tag Manager API | `gtm_*` (the website scan works without it) |
| Analytics | Google Analytics Data API, Google Analytics Admin API | `ga_*` |
| Google Ads | Google Ads API | `ads_*` (plus a developer token, below) |
| Dialogflow | Dialogflow API | `dialogflow_*` |
| Maps | Places API (New), Geocoding API, Routes API | `maps_*` (API key and billing, below) |

> **Tip:** if a tool later says "*X API has not been used in project … or it is disabled*", enable that API in the **same** project as your OAuth client and wait 2–5 minutes.

---

## Step 3: Configure the OAuth consent screen
Go to **APIs & Services → OAuth consent screen**, which newer consoles call **Google Auth Platform → Get started**.

1. **App name:** e.g. *Claude Google Workspace*. **User support email:** your address.
2. **Audience:**
   - **Internal** (Google Workspace only, recommended): only people in your organization can sign in, Google doesn't need to verify the app, and sign-ins don't expire.
   - **External** (personal Gmail): add your Google account under **Test users**. While the app is in **Testing**, Google expires sign-ins after **7 days**. Either sign in again weekly, or publish the app ("In production") and accept the "unverified app" warning for your own use.
3. **Contact information:** your email.
4. Accept the Google API Services User Data Policy and click **Create**.

You don't need to add scopes on the consent screen. The plugin requests them when you sign in.

---

## Step 4: Create the OAuth client
1. **Credentials → Create credentials → OAuth client ID** (or **Clients → Create client**).
2. **Application type: Desktop app.** Name it e.g. *Claude plugin*. Click **Create**.
3. Click **Download JSON** in the dialog. **The client secret is only shown once**, so keep this file.
4. Leave the `client_secret_….json` file in your **Downloads** folder. The setup skill finds and imports it. To place it by hand, save it as:
   - Windows: `C:\Users\<you>\.google-workspace-mcp\credentials.json`
   - macOS/Linux: `~/.google-workspace-mcp/credentials.json`

Treat this file like a password: anyone with it plus your sign-in token can act as the app.

---

## Step 5: Install the plugin

**Claude app (Cowork)**
1. Download `google-workspace.plugin` from the [latest release](https://github.com/animesh-ex/google-workspace-mcp/releases/latest).
2. Open it in the Claude app and click **Install**.

**Claude Code**
```bash
claude plugin marketplace add animesh-ex/google-workspace-mcp
```
```bash
claude plugin install google-workspace@google-workspace-local --scope user
```
Then restart Claude Code.

**Other MCP clients:** clone the repo and point your client at `node /path/to/google-workspace-mcp/plugin/server/index.mjs` (stdio). No `npm install` is needed.

---

## Step 6: Sign in
Say **"connect Google"**. Behind the scenes:
1. `google_setup` → `status` checks what's configured.
2. `google_setup` → `import_credentials` copies the newest `client_secret_*.json` from Downloads.
3. `google_setup` → `sign_in` opens Google's consent page in your browser. Pick the account, review the permissions and click **Allow**. You have 5 minutes.
4. The browser shows **"Google Workspace is connected."** The token is saved to `token.json`.

**From a terminal instead:** in the repo folder run `npm run auth`, or `node plugin/server/auth-cli.mjs`. On Windows PowerShell 5, run commands separately; `&&` doesn't work there.

**New permissions after an update:** `status` lists `missingScopes`. Run `sign_in` again; your other settings are kept.

---

## Plugin settings (API keys)
The plugin has a settings form. When you enable it, Claude asks for these. All are optional, so leave a field empty to skip it:

| Setting | Stored | Used for |
|---|---|---|
| **Google Maps API key** | Masked; kept in the system's secure credential store | `maps_*` tools |
| **Google Ads developer token** | Masked; kept in the system's secure credential store | `ads_*` tools |
| **Google Ads manager (MCC) account ID** | Claude settings; editable in `/config` | Accessing ad accounts through a manager |
| **OAuth client JSON path** | Claude settings; editable in `/config` | Using your `client_secret_….json` where it is, instead of importing it |

**Two ways to enter keys:**
1. **Plugin settings** (recommended for secrets). Secrets are masked and never written to a plain settings file. Changes apply after you restart Claude.
   - **Change later:** the manager ID and client path appear in **`/config`** in Claude Code. Secrets don't appear there; Claude asks for them when the plugin is enabled, so to replace a saved secret, uninstall and reinstall (or disable and re-enable) the plugin.
2. **In chat:** "save my Google Maps key" or "set my Ads developer token". This writes `maps.json` / `ads.json` in `~/.google-workspace-mcp/` and works immediately, but the file isn't encrypted.

**Priority:** a value in plugin settings wins over the file. `google_setup` → `status` shows where each value comes from (`source`). If you save a key in chat while a different one is in plugin settings, Claude tells you the plugin setting is still the one in use.

---

## Service-specific steps

### Google Chat (Workspace accounts only)
Google requires every Cloud project that calls the Chat API to have a Chat app configuration, even when you only read and send as yourself.
1. **APIs & Services → Google Chat API → Configuration.**
2. Fill in an **App name** (e.g. *Claude*), an **Avatar URL** (any public image URL), and a **Description**.
3. If shown, untick *Build this Chat app as a Google Workspace add-on*. Click **Save**.
4. Test: "list my Chat spaces".

### Apps Script
1. The **signed-in account** must switch on **Google Apps Script API** at <https://script.google.com/home/usersettings>. This is a per-user setting, separate from enabling the API in the project.
2. Creating, reading and editing scripts works immediately. Menus, custom formulas and triggers then run inside the Sheet itself.
3. To **run** a script's functions from Claude (`script_run`), do this once per script:
   1. Open the script (`editorUrl`) → **Project Settings** → **Google Cloud Platform (GCP) Project** → **Change project** → enter your project number.
   2. Run any function once in the editor and approve the permission screen.
   3. Ask Claude to deploy it (`script_deploy`).

### Google Maps (API key and billing)
1. The Cloud project must have **billing enabled** (Billing → Link a billing account). Google includes a monthly free allowance; check current pricing on Google's Maps Platform pricing page.
2. **APIs & Services → Credentials → Create credentials → API key.**
3. **Edit the key → API restrictions → Restrict key** to Places API (New), Geocoding API and Routes API.
4. Enter it in the plugin settings as **Google Maps API key** (see [Plugin settings](#plugin-settings-api-keys)), give it to Claude in chat (`google_setup` → `configure_maps`), or create `~/.google-workspace-mcp/maps.json`:
   ```json
   { "apiKey": "YOUR_KEY" }
   ```
5. Test: "geocode Times Square".

Some fields, such as Google's AI summaries of places, are only available for some places and regions.

### Google Ads (developer token)
1. Sign in to a Google Ads **manager (MCC)** account that has access to your ad accounts. You can [create one for free](https://ads.google.com/home/tools/manager-accounts/) and link your accounts to it.
2. **Tools → Setup → API Center**, accept the terms and copy the **developer token**.
3. New tokens have **Test** access, which only works on test accounts. Apply for **Basic access** on the same page to use real accounts.
4. Enter the token and the manager account's 10-digit ID in the plugin settings (**Google Ads developer token**, **Google Ads manager (MCC) account ID**), give them to Claude in chat (`google_setup` → `configure_ads`), or create `~/.google-workspace-mcp/ads.json`:
   ```json
   { "developerToken": "YOUR_TOKEN", "loginCustomerId": "1234567890" }
   ```
5. Test: "list my Google Ads accounts".

### Google Tag Manager
1. Enable the **Tag Manager API** (step 2).
2. The signed-in account needs access to the container in **GTM → Admin → User Management**:
   - **Read** to audit
   - **Edit** to make changes in workspaces
   - **Approve** to create versions
   - **Publish** to publish
3. Test: "list my GTM containers".
4. To read the **live dataLayer**, Claude also needs a browser it can drive: **Claude in Chrome** or the Claude app's built-in browser. `gtm_scan_website` works without one.

### Google Analytics 4
1. Enable the **Data** and **Admin** APIs (step 2).
2. The signed-in account needs at least **Viewer** on the property: **GA4 → Admin → Property access management**.
3. Test: "list my GA4 properties".

### Dialogflow
1. Enable the **Dialogflow API** in the project that owns your agent. This is often a different project from your OAuth client's.
2. Give the signed-in account the IAM role **Dialogflow API Client** in that project to test, or **Dialogflow API Admin** to edit intents.
3. Tell Claude the agent's **project ID** and whether it's **ES** or **CX** (and its region if it isn't global).

---

## Choosing or switching the Google account
All tools act as **one signed-in Google account**. Every email sent, file created, event booked and GTM change is made as that account.

- **See which account:** "which Google account are you connected to?" (`google_setup` → `status`).
- **Switch accounts:** "sign out of Google and sign in again", then choose the other account on Google's page. The sign-in page always shows the account picker.
- **A dedicated account for Claude** (e.g. `ai@yourcompany.com`) keeps its email and files separate. Share with it the Drive files, calendars, GA4 properties, Ads accounts and GTM containers it should work with.

---

## Updating
- **Claude Code:** run `claude plugin marketplace update google-workspace-local`, then `claude plugin update google-workspace@google-workspace-local`, then restart.
- **Claude app:** download the new `google-workspace.plugin` from the latest release and install it over the old one.
- After updates that add permissions, sign in again when `status` shows `missingScopes`.

## Uninstalling
1. Remove the plugin: `claude plugin uninstall google-workspace@google-workspace-local`, or remove it in the Claude app.
2. Delete the config folder `~/.google-workspace-mcp/` (credentials, token, keys).
3. Revoke access at <https://myaccount.google.com/permissions>: find your app name and click **Remove access**.
4. Optionally delete the OAuth client, the API key or the whole project in Google Cloud Console.
