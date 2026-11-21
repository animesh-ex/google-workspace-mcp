# Skills guide

Skills are instruction sets that teach Claude *how* to do a job well with the tools: what to check first, which order to call tools in, what to confirm with you, and how to report back. Claude loads the right skill automatically from what you ask. You can also name one (in Claude Code, `/google-workspace:<skill>`).

The source of each skill is in [`plugin/skills/<name>/SKILL.md`](../plugin/skills).

| Skill | Use it for |
|---|---|
| [setup](#setup) | Connecting Google and configuring extras |
| [settings](#settings) | Entering or changing API keys on the settings page |
| [google-workspace](#google-workspace) | Email, Drive, Docs, Sheets, Slides, Chat, GA4 |
| [calendar-scheduling](#calendar-scheduling) | Meetings, invites, availability |
| [google-contacts](#google-contacts) | Finding people and managing contacts |
| [maps-business-research](#maps-business-research) | Business details, reviews, AI summaries, directions |
| [apps-script](#apps-script) | Scripts and automations for Google Sheets |
| [tag-manager](#tag-manager) | Website tracking audits and GTM configuration |
| [google-ads](#google-ads) | Ad performance reviews and safe changes |
| [dialogflow](#dialogflow) | Building and testing chatbots |

---

## setup
**Triggers:** "connect Google", "set up Gmail/Calendar/Maps/Ads…", "sign in to Google", or any tool reporting it isn't signed in, is missing permissions, or that Ads or Maps aren't configured.

**What it does:**
1. Checks status: client file, sign-in, missing permissions, and whether Ads and Maps are configured.
2. Imports the downloaded OAuth client, or explains how to create one.
3. Opens Google sign-in and confirms the account.
4. Walks through each extra the user needs: Ads developer token, Chat configuration, Maps key, Apps Script user setting, and Analytics access.
5. Suggests a first task to try.

---

## settings
**Triggers:** "open settings", "set/change/remove my API key", "configure Maps or Ads", `/google-workspace:settings`.

**What it does:** opens the plugin's settings page in your browser. It's served on `127.0.0.1` behind a one-time link that expires after 10 minutes. You enter the Maps API key, Ads developer token and manager account ID there. The keys go straight to `~/.google-workspace-mcp/` on your computer and never through the chat; saved keys are shown masked, and a new Maps key is tested on save. Claude never asks you to paste keys into the chat. When you're done, it checks the status and runs a quick Maps or Ads test.

---

## google-workspace
**Triggers:** everyday Gmail, Drive, Docs, Sheets, Slides, Chat and GA4 requests.

**Rules it follows:**
- Confirms recipients, content, attachments and sharing roles before sending or sharing; uses drafts when unsure.
- Resolves names to email addresses with `contacts_search`.
- Returns links to everything it creates.

**Built-in recipes:**
- reply with a Drive attachment
- save email attachments to Drive
- reports as Docs with tables
- sheet analysis with charts
- slide decks
- fill a template (`{{placeholders}}`)
- organize folders and share files

**Example:** *"Find the latest invoice email from our supplier, save the PDF to Drive → Finance, and reply that we'll pay by Friday."*

---

## calendar-scheduling
**Triggers:** "schedule a meeting", "find a time", "send an invite", "reschedule", "cancel", "what's on my calendar", "RSVP".

**Workflow:**
1. **Pin down the details:** turns names into emails (asking if ambiguous), the time or window, the duration, your calendar's time zone, the title, the agenda, and Meet or a location.
2. **Find a time:** `calendar_find_free_time` across all attendees within working hours. It offers 2–3 options, including the time for guests in other time zones.
3. **Confirm, then create:** shows a summary, and after your yes creates the event with invites and a Meet link.
4. **Changes:** reschedule, add or remove guests without losing the others, cancel (with confirmation), RSVP, quick-add.
5. **Follow-ups:** an agenda or recap by email or Chat, if you ask.

**Example:** *"Set up 45 minutes with Priya and Alex next Tuesday or Wednesday afternoon to review the Q4 campaign, with a Meet link."*

---

## google-contacts
**Triggers:** "what's X's email/phone", "who is…", "add/update/delete a contact", "label these contacts", "export contacts", and any task that names a person instead of an email.

**What it does:**
- **Searches three sources at once:** saved contacts, people you've emailed, and the Workspace directory. It shows options when several people match and never guesses.
- **Card management:** creates contacts after checking for duplicates, and updates them. Note that updating a list field such as phones replaces the whole list. Deletes only after confirmation.
- **Labels and bulk work:** export to Sheets, import from Sheets after a preview, and duplicate cleanup only with approval.

**Example:** *"Add everyone in the 'Trade show leads' sheet as contacts with the label Leads 2026."*

---

## maps-business-research
**Triggers:** find businesses, competitors, suppliers or leads; a business's phone, website, hours or reviews; "what do customers say about…"; Google's AI summary of a place; market scans; directions and travel times.

**Workflow:**
1. **Find:** `maps_search_places` (up to 60, filtered by rating, open now, type and area, optionally with AI review summaries), or `maps_nearby`.
2. **Pull everything:** `maps_place_details` for contact info, hours, price range, ratings and reviews, **AI overview, AI review summary and neighborhood summary**, amenities, payment, parking and accessibility. `maps_place_photos` gives image links.
3. **Summarize:** one profile per business (positioning, reputation with quoted themes, practical details, notable features). For several businesses it adds a ranking, price positioning, common complaints you could win on, and gaps.
4. **Export:** a Sheet with one row per business, or a Doc write-up.
5. **Travel:** traffic-aware directions with a Maps link, and many-to-many travel times.

**Example:** *"Find lab-grown diamond jewelers in New Jersey with 4+ stars, summarize what customers praise and complain about, and put them in a sheet."*

---

## apps-script
**Triggers:** "write a script/macro for this sheet", custom formulas, custom menus or sidebars, emailing from rows, scheduled syncs or cleanups, onEdit/onOpen triggers, web apps, debugging scripts.

**Workflow:**
1. **Read the sheet first:** tabs, headers, a sample of rows, the trigger, recipients and how to handle rows already processed.
2. **Write reliable code:**
   - modern V8 syntax, bound to the sheet
   - columns found by header name
   - batched `getValues`/`setValues`
   - a status column so rows are never reprocessed
   - error handling, `LockService` and quota checks
   - secrets kept in Script Properties
3. **Show the code and a plain summary,** then install it with `script_create_project` (bound to the spreadsheet).
4. **Authorize and run:** you run it once in the editor to approve. Then Claude can run it with `script_run` once the GCP project is linked and the script deployed.
5. **Verify and debug:** re-read the sheet and check `script_logs`, fix, re-run.

**Includes patterns for:** row emails and reminders, custom formulas, data cleanup with a dry run, copying rows on a status change, daily API or sheet refreshes, report tabs with charts, sidebars and web apps.

**Example:** *"For the Orders sheet, add a menu 'Send updates' that emails each customer their order status and records the time sent."*

---

## tag-manager
**Triggers:** check or fix tracking, "what's in my dataLayer", ecommerce events, consent mode, GA4 or Ads conversion setup in GTM, "why isn't GA4 recording X", publish a container.

**Phase 1: Scan.** `gtm_scan_website` reports the GTM containers and their **live** contents (tag types, GA4 event names, custom-event triggers, dataLayer variables), GA4, Ads and UA IDs, consent mode and the consent platform, other pixels, the platform, and inline dataLayer pushes. Then `gtm_get_container` gives the full workspace. It flags double-tagging, multiple containers, retired UA tags and missing consent defaults.

**Phase 2: Read the live dataLayer** in a browser:
- a **snapshot** of every entry on each page type
- a **recorder** that captures pushes caused by actions such as add to cart
- a **network check** of GA4 hits (`collect?v=2`, `en=` event name)

It never places orders or enters payment or personal data on live sites.

**Phase 3: Compare and plan.**
- Maps each dataLayer event to the GTM tag that handles it and to whether GA4 receives it (checked with `ga_run_report`).
- Checks the data against GA4's recommended ecommerce schema.
- Separates **GTM fixes** from **site-code fixes**, writing exact `dataLayer.push` code for the developer.
- Presents the plan for approval.

**Phase 4: Configure, verify, publish.**
1. A new workspace, with built-in variables, DLVs, Custom Event triggers and GA4 event tags with ecommerce, plus anything else via `gtm_upsert`.
2. A review of the workspace status, then a **version**.
3. You check it in **GTM Preview**, and Claude re-runs the browser checks.
4. **Publish only on your explicit yes.** Rollback via `gtm_list_versions` + `gtm_publish`.

**Example:** *"Audit example.com's tracking: read the dataLayer on product and cart pages, compare with GTM and GA4, and propose fixes. Don't publish anything yet."*

---

## google-ads
**Triggers:** "how are my Google Ads doing", campaign, keyword or ad performance, CPA or ROAS, wasted spend, search terms, negative keywords, pausing or scaling, budgets, an Ads audit.

**Workflow:**
1. **Pick the account and date range:** `ads_list_accounts` (manager or client), last 30 days by default plus the previous period for comparison.
2. **Review:** campaigns, then ad groups and keywords (zero-conversion spenders, quality score under 5), then **search terms** (waste and new keyword ideas), then ads (RSA headlines and descriptions). It flags broken conversion tracking and cross-checks with GA4.
3. **Report:** headline numbers, then what's working, then wasted spend as an amount, then recommended actions with their expected impact.
4. **Change safely:** shows exact changes, gets your yes, does a dry run (`validateOnly`) when unsure, then applies negative keywords, pause/enable or budget changes. It never raises budgets or re-enables items unless you ask.

**Example:** *"Review the last 30 days, list search terms that wasted more than ₹2,000 with no conversions, and propose negatives."*

---

## dialogflow
**Triggers:** Dialogflow, chatbot or virtual agent, intents, training phrases, "test my bot", "why didn't the bot understand", turning FAQs into intents.

**Workflow:**
1. **Locate the agent:** the project ID, ES or CX, and the region.
2. **Understand it:** the agent settings and intents, flagging weak ones (fewer than 10 phrases), missing responses and overlaps.
3. **Test:** batches of realistic questions in a table (question, matched intent, confidence, reply), with multi-turn conversations via `sessionId`. It flags fallbacks and low confidence.
4. **Improve (ES):** creates intents with 10–20 varied phrases and 1–3 responses, adds phrases or responses to existing intents, and deletes only on confirmation. It re-runs the tests to show before and after.
5. **Build from content:** reads FAQs, Docs or emails, proposes intents, and creates them after approval.

CX flow and page editing stays in the Dialogflow console; the tools cover CX listing and testing.

**Example:** *"Test our support bot with 20 typical customer questions about shipping and returns, then add intents for whatever it misses."*
