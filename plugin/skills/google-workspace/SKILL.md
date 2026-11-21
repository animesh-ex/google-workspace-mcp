---
name: google-workspace
description: Use for any task in the user's own Gmail, Google Drive, Docs, Sheets, Slides, Google Analytics 4 or Google Ads through the google-workspace plugin tools — GA4 traffic/conversion reports, Google Ads campaign, keyword and search-term performance, pausing or budgeting campaigns — reading, searching, sending or replying to email (with attachments), creating/editing/reading/analyzing Docs, Sheets and Slides, sharing files, and organizing Drive folders.
---

# Google Workspace plugin

The `google-workspace` MCP server exposes tools prefixed `gmail_`, `drive_`, `docs_`, `sheets_`, `slides_` and `google_setup`.

## If not connected
Any tool error saying "not signed in" or "OAuth client file not found" → run the `/google-workspace:setup` flow (call `google_setup` with `status`, then `import_credentials` / `sign_in`).

## Before acting
- **Sending, replying, sharing** reach other people. Confirm recipients, subject, body, attachments and share roles with the user before calling `gmail_send`, `gmail_reply`, `gmail_send_draft` or `drive_share`, unless they already gave them exactly. When unsure, use `gmail_create_draft` or `gmail_reply` with `sendNow: false`.
- Deleting is always recoverable here: `drive_trash` moves to trash; Gmail `trash` is recoverable for 30 days.

## Recipes
- **Reply with a Drive file attached:** `gmail_search` → `gmail_read_thread` → `drive_search` → `gmail_reply` with `driveFileIds`.
- **Save attachments to Drive:** `gmail_read_message` (lists attachmentIds) → `gmail_download_attachment` with `saveToDriveFolderId`.
- **Report doc:** `docs_create` with Markdown (headings, bullets, **bold**, links); add data with `docs_insert_table`.
- **Analyze a sheet:** `sheets_get_info` → `sheets_analyze` (per-column stats, optional `groupBy` + `aggregateColumns`) → optionally `sheets_create`/`sheets_write` a summary tab and `sheets_add_chart`.
- **Build a deck:** `slides_create` with an array of slides (`layout`, `title`, `body` as bullets, `notes`, `imageUrl`). Check results with `slides_read` or `slides_get_thumbnail`.
- **Fill a template:** `drive_copy` the template → `docs_replace_text` / `slides_replace_text` on `{{placeholders}}`.
- **Organize:** `drive_create_folder` → pass `folderId` to any create tool, or `drive_move` existing files.
- **Share:** `drive_share` (user/group/domain/anyone; reader/commenter/writer) → return the `link`.

## Google Analytics 4 (`ga_*`)
- Start with `ga_list_properties` to get the property ID.
- `ga_overview` for a quick summary by channel, source/medium, campaign, page, landing page, country, device, event, item, or by date/week/month.
- `ga_run_report` for anything custom; use `ga_get_metadata` (with `search`) to find dimension/metric API names. GA4 calls conversions `keyEvents`. Pass `compareStartDate`/`compareEndDate` for period-over-period.
- `ga_realtime` for the last 30 minutes.

## Google Ads (`ads_*`)
- Needs a developer token: if an ads tool says it isn't configured, ask the user for their token (Google Ads → Tools → API Center, on a manager account) and call `google_setup` with `configure_ads`.
- `ads_list_accounts` → customer IDs. If accounts sit under a manager, pass `loginCustomerId` or save it with `configure_ads`.
- Reports: `ads_campaign_performance`, `ads_ad_group_performance`, `ads_keyword_performance`, `ads_search_terms` (wasted spend, negative-keyword ideas), `ads_ad_performance`. All include cost per conversion and ROAS. Anything else: `ads_query` with GAQL.
- **Changes cost money.** `ads_set_status` (ENABLED restarts spend) and `ads_set_campaign_budget` need an explicit yes from the user with the exact campaigns and amounts. Run with `validateOnly: true` first when unsure.
- Combine with GA4: compare Ads cost with `ga_overview` breakdown `campaign` or `source_medium` to see on-site behaviour of paid traffic.

All tools accept IDs or full Google URLs. Return file links (`url`/`webViewLink`) to the user after creating anything.
