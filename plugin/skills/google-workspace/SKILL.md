---
name: google-workspace
description: Use for tasks in the user's own Gmail, Google Drive, Docs, Sheets, Slides, Google Chat or Google Analytics 4 through the google-workspace plugin tools — reading, searching, sending or replying to email (with attachments), creating/editing/reading/analyzing Docs, Sheets and Slides, sharing files, organizing Drive folders, reading or sending Chat messages, and GA4 traffic/conversion reports. For meetings use calendar-scheduling, for places use maps-business-research, for people use google-contacts, for chatbots use dialogflow, for ads use google-ads, for scripts and sheet automations use apps-script, for tracking and GTM use tag-manager.
---

# Google Workspace plugin

The `google-workspace` MCP server exposes `gmail_`, `drive_`, `docs_`, `sheets_`, `slides_`, `calendar_`, `chat_`, `contacts_`, `maps_`, `ga_`, `ads_`, `dialogflow_`, `script_`, `gtm_` tools and `google_setup`.

Dedicated skills cover these areas in depth; load the matching one:
- **calendar-scheduling:** meetings, invites, availability.
- **maps-business-research:** businesses, reviews, AI summaries, directions.
- **google-contacts:** finding people's emails and phones, and managing contacts.
- **dialogflow:** chatbot intents and testing.
- **google-ads:** ad performance and changes.
- **tag-manager:** website tracking audits, the live dataLayer, and Google Tag Manager configuration and publishing.
- **apps-script:** generating and running Apps Script for Google Sheets (automations, custom functions, menus, triggers).

## If not connected
Any tool error saying "not signed in", "missing scopes", "OAuth client file not found", or that Ads/Maps aren't configured → run the setup skill (`google_setup` with `status`, then `import_credentials` / `sign_in` / `configure_ads` / `configure_maps`).

## Before acting
- **Sending, replying, sharing, messaging** reach other people. Confirm recipients, subject, body, attachments and share roles with the user before calling `gmail_send`, `gmail_reply`, `gmail_send_draft`, `chat_send_message` or `drive_share`, unless they already gave them exactly. When unsure, use `gmail_create_draft` or `gmail_reply` with `sendNow: false`.
- If the user names a person instead of an email, resolve it with `contacts_search` first.
- Deleting is recoverable here: `drive_trash` moves to trash; Gmail `trash` is recoverable for 30 days.

## Recipes
- **Reply with a Drive file attached:** `gmail_search` → `gmail_read_thread` → `drive_search` → `gmail_reply` with `driveFileIds`.
- **Save attachments to Drive:** `gmail_read_message` (lists attachmentIds) → `gmail_download_attachment` with `saveToDriveFolderId`.
- **Report doc:** `docs_create` with Markdown (headings, bullets, **bold**, links); add data with `docs_insert_table`.
- **Analyze a sheet:** `sheets_get_info` → `sheets_analyze` (per-column stats, optional `groupBy` + `aggregateColumns`) → optionally `sheets_create`/`sheets_write` a summary tab and `sheets_add_chart`.
- **Build a deck:** `slides_create` with an array of slides (`layout`, `title`, `body` as bullets, `notes`, `imageUrl`). Check results with `slides_read` or `slides_get_thumbnail`.
- **Fill a template:** `drive_copy` the template → `docs_replace_text` / `slides_replace_text` on `{{placeholders}}`.
- **Organize:** `drive_create_folder` → pass `folderId` to any create tool, or `drive_move` existing files.
- **Share:** `drive_share` (user/group/domain/anyone; reader/commenter/writer) → return the `link`.

## Google Chat (`chat_*`)
- `chat_list_spaces` → space names (`spaces/...`). `chat_list_messages` reads a space or a DM (`dmWithEmail`); `chat_search_messages` finds text.
- `chat_send_message` posts to a space or DMs a person by `toEmail`; pass `threadName` to reply in a thread. Confirm recipient and text first.
- Chat only works for Google Workspace accounts, and the Cloud project needs the Chat API configured (see setup).

## Google Analytics 4 (`ga_*`)
- Start with `ga_list_properties` to get the property ID.
- `ga_overview` for a quick summary by channel, source/medium, campaign, page, landing page, country, device, event, item, or by date/week/month.
- `ga_run_report` for anything custom; use `ga_get_metadata` (with `search`) to find dimension/metric API names. GA4 calls conversions `keyEvents`. Pass `compareStartDate`/`compareEndDate` for period-over-period.
- `ga_realtime` for the last 30 minutes.

All tools accept IDs or full Google URLs. Return file links (`url`/`webViewLink`) to the user after creating anything.
