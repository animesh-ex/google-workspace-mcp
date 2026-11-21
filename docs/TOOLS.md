# Tool reference

Generated from the plugin's tool definitions (version 1.8.0, 144 tools). Regenerate with `npm run docs`.

Every tool that takes a file, document, spreadsheet or presentation ID also accepts the full Google URL.

**Annotations:** 🔒 read-only · ✏️ makes changes · ⚠️ destructive or high-impact (Claude confirms first)

## Contents

- [Gmail](#gmail) (12)
- [Drive and sharing](#drive-and-sharing) (15)
- [Google Docs](#google-docs) (8)
- [Google Sheets](#google-sheets) (11)
- [Google Slides](#google-slides) (11)
- [Google Calendar](#google-calendar) (9)
- [Google Chat](#google-chat) (5)
- [Google Contacts (People API)](#google-contacts-people-api) (7)
- [Google Maps](#google-maps) (7)
- [Apps Script](#apps-script) (7)
- [Google Tag Manager](#google-tag-manager) (13)
- [Google Analytics 4](#google-analytics-4) (5)
- [Google Ads](#google-ads) (10)
- [Dialogflow](#dialogflow) (9)
- [Setup](#setup) (1)

## Gmail

### `gmail_search` 🔒

Search Gmail using Gmail query syntax (e.g. 'from:alice is:unread newer_than:7d', 'has:attachment subject:invoice'). Returns message headers and snippets.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string |  | `"in:inbox"` | Gmail search query |
| `maxResults` | integer |  | `20` |  |
| `pageToken` | string |  |  |  |

### `gmail_read_message` 🔒

Read a full email: headers, plain-text body, and attachment list (with attachmentIds).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `messageId` | string | yes |  |  |

### `gmail_read_thread` 🔒

Read every message in an email thread/conversation in order.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `threadId` | string | yes |  |  |

### `gmail_send` ✏️

Send a new email. Supports cc/bcc, HTML bodies, and attachments from local files or Google Drive.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `to` | string | yes |  | Comma-separated recipients |
| `cc` | string |  |  |  |
| `bcc` | string |  |  |  |
| `subject` | string | yes |  |  |
| `body` | string | yes |  |  |
| `html` | boolean |  | `false` | Treat body as HTML |
| `attachmentPaths` | string[] |  |  | Absolute local file paths to attach |
| `driveFileIds` | string[] |  |  | Drive file IDs/URLs to attach. Google Docs/Slides are attached as PDF, Sheets as XLSX. |

### `gmail_reply` ✏️

Reply (or reply-all) to an existing email, keeping it in the same thread. Supports attachments.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `messageId` | string | yes |  | ID of the message being replied to |
| `body` | string | yes |  |  |
| `html` | boolean |  | `false` |  |
| `replyAll` | boolean |  | `false` |  |
| `cc` | string |  |  | Extra cc recipients |
| `sendNow` | boolean |  | `true` | false = save as draft instead of sending |
| `attachmentPaths` | string[] |  |  | Absolute local file paths to attach |
| `driveFileIds` | string[] |  |  | Drive file IDs/URLs to attach. Google Docs/Slides are attached as PDF, Sheets as XLSX. |

### `gmail_create_draft` ✏️

Create an email draft (not sent). Supports attachments.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `to` | string |  |  |  |
| `cc` | string |  |  |  |
| `bcc` | string |  |  |  |
| `subject` | string | yes |  |  |
| `body` | string | yes |  |  |
| `html` | boolean |  | `false` |  |
| `attachmentPaths` | string[] |  |  | Absolute local file paths to attach |
| `driveFileIds` | string[] |  |  | Drive file IDs/URLs to attach. Google Docs/Slides are attached as PDF, Sheets as XLSX. |

### `gmail_list_drafts` 🔒

List email drafts.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `maxResults` | integer |  | `20` |  |

### `gmail_send_draft` ✏️

Send an existing draft.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `draftId` | string | yes |  |  |

### `gmail_download_attachment` ✏️

Download an email attachment to a local path, or save it straight into Google Drive.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `messageId` | string | yes |  |  |
| `attachmentId` | string | yes |  |  |
| `filename` | string | yes |  | File name to save as (use the attachment's filename) |
| `saveDir` | string |  |  | Local directory to save into |
| `saveToDriveFolderId` | string |  |  | Drive folder ID to upload into ('root' for My Drive) |

### `gmail_modify` ✏️

Organize messages: mark read/unread, star, archive, move to trash, or add/remove labels. Label names or IDs accepted.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `messageIds` | string[] | yes |  |  |
| `action` | `markRead` \\| `markUnread` \\| `star` \\| `unstar` \\| `archive` \\| `moveToInbox` \\| `trash` \\| `untrash` \\| `labels` | yes |  |  |
| `addLabels` | string[] |  |  |  |
| `removeLabels` | string[] |  |  |  |

### `gmail_list_labels` 🔒

List Gmail labels (system and user).

_No parameters._

### `gmail_create_label` ✏️

Create a new Gmail label.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |

## Drive and sharing

### `drive_search` 🔒

Search Google Drive files by name/full text, type, or folder. Optionally pass a raw Drive 'q' query.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string |  |  | Substring of the file name |
| `fullText` | string |  |  | Search inside file contents |
| `type` | `folder` \\| `doc` \\| `sheet` \\| `slides` \\| `pdf` \\| `any` |  | `"any"` |  |
| `folderId` | string |  |  | Only files directly inside this folder |
| `rawQuery` | string |  |  | Raw Drive API query, overrides other filters |
| `includeTrashed` | boolean |  | `false` |  |
| `orderBy` | string |  | `"modifiedTime desc"` |  |
| `pageSize` | integer |  | `30` |  |
| `pageToken` | string |  |  |  |

### `drive_list_folder` 🔒

List the contents of a Drive folder ('root' = My Drive).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `folderId` | string |  | `"root"` |  |
| `pageSize` | integer |  | `100` |  |
| `pageToken` | string |  |  |  |

### `drive_get_file` 🔒

Get metadata for a Drive file (ID or URL).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |

### `drive_read_file_text` 🔒

Read a file's content as text: Google Docs (markdown), Sheets (CSV of first tab), Slides (text), or plain text/CSV/JSON files.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `maxChars` | integer |  | `100000` |  |

### `drive_create_folder` ✏️

Create a folder in Drive.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes |  |  |
| `parentId` | string |  | `"root"` |  |

### `drive_upload_file` ✏️

Upload a local file to Drive. Set convert=true to turn .docx/.xlsx/.csv/.pptx/.txt into native Google Docs/Sheets/Slides.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `localPath` | string | yes |  |  |
| `folderId` | string |  | `"root"` |  |
| `name` | string |  |  |  |
| `convert` | boolean |  | `false` |  |

### `drive_download_file` ✏️

Download a Drive file to a local folder. Google Docs/Sheets/Slides are exported (format: pdf, docx, xlsx, csv, pptx, txt, md, html).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `saveDir` | string | yes |  |  |
| `format` | string |  |  | Export format for Google-native files (default pdf) |

### `drive_move` ✏️

Move a file or folder into another folder.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `newParentId` | string | yes |  |  |

### `drive_update_metadata` ✏️

Rename a file, change its description, or star/unstar it.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `name` | string |  |  |  |
| `description` | string |  |  |  |
| `starred` | boolean |  |  |  |

### `drive_copy` ✏️

Make a copy of a file (e.g. duplicate a template doc/sheet/deck).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `name` | string |  |  |  |
| `folderId` | string |  |  |  |

### `drive_trash` ⚠️

Move a file/folder to the Drive trash (recoverable for 30 days), or restore it.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `restore` | boolean |  | `false` |  |

### `drive_share` ✏️

Share a file/folder (Doc, Sheet, Slides, anything) with a person, group, domain, or anyone with the link.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `role` | `reader` \\| `commenter` \\| `writer` \\| `owner` |  | `"reader"` |  |
| `type` | `user` \\| `group` \\| `domain` \\| `anyone` |  | `"user"` |  |
| `emails` | string[] |  |  | For type user/group |
| `domain` | string |  |  | For type domain |
| `notify` | boolean |  | `true` | Send Google's share notification email |
| `message` | string |  |  | Message included in the notification email |

### `drive_list_permissions` 🔒

List who a file is shared with.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |

### `drive_update_permission` ⚠️

Change a collaborator's role, or remove their access (role 'remove').

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `fileId` | string | yes |  |  |
| `permissionId` | string | yes |  |  |
| `role` | `reader` \\| `commenter` \\| `writer` \\| `remove` | yes |  |  |

### `drive_about` 🔒

Show the signed-in Google account and Drive storage usage.

_No parameters._

## Google Docs

### `docs_create` ✏️

Create a Google Doc, optionally with Markdown content (headings, bold/italic, links, bullet & numbered lists, code) and in a given Drive folder.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | string | yes |  |  |
| `markdown` | string |  |  |  |
| `folderId` | string |  |  |  |

### `docs_read` 🔒

Read a Google Doc. format 'markdown' returns readable text; 'structured' returns each paragraph/table with its start/end index (needed for precise edits).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `format` | `markdown` \\| `structured` |  | `"markdown"` |  |

### `docs_insert_markdown` ✏️

Append Markdown content to the end of a Doc, or insert it at a specific index (from docs_read structured).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `markdown` | string | yes |  |  |
| `index` | integer |  |  | Omit to append at the end |

### `docs_replace_text` ✏️

Find and replace text throughout a Doc (e.g. fill {{placeholders}} in a template).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `replacements` | { find, replace, matchCase }[] | yes |  |  |

### `docs_delete_range` ⚠️

Delete content between two indices (get indices from docs_read structured).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `startIndex` | integer | yes |  |  |
| `endIndex` | integer | yes |  |  |

### `docs_insert_table` ✏️

Insert a table filled with data (first row = header, bolded) at the end of a Doc or at an index.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `rows` | string[][] | yes |  |  |
| `index` | integer |  |  |  |

### `docs_insert_image` ✏️

Insert an image from a public URL into a Doc.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `imageUrl` | string | yes |  |  |
| `index` | integer |  |  |  |
| `widthPt` | number |  |  |  |

### `docs_batch_update` ✏️

Advanced: send raw Google Docs API batchUpdate requests (for styling, page breaks, headers, etc.).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `documentId` | string | yes |  |  |
| `requests` | object[] | yes |  |  |

## Google Sheets

### `sheets_create` ✏️

Create a Google Sheet with optional tab names and initial data for the first tab.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | string | yes |  |  |
| `tabs` | string[] |  |  |  |
| `data` | string \\| number \\| boolean \\| null[][] |  |  | Rows for the first tab; first row is typically headers |
| `folderId` | string |  |  |  |

### `sheets_get_info` 🔒

List a spreadsheet's tabs with their sizes, plus title and URL.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |

### `sheets_read` 🔒

Read values from a range in A1 notation, e.g. 'Sheet1!A1:D50' or just 'Sheet1' for the whole tab.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `range` | string | yes |  |  |
| `valueRender` | `FORMATTED_VALUE` \\| `UNFORMATTED_VALUE` \\| `FORMULA` |  | `"FORMATTED_VALUE"` |  |

### `sheets_write` ✏️

Write values to a range (starting cell like 'Sheet1!B2' is enough). Formulas like '=SUM(A1:A9)' are evaluated.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `range` | string | yes |  |  |
| `values` | string \\| number \\| boolean \\| null[][] | yes |  |  |
| `raw` | boolean |  | `false` | true = store literally, don't parse formulas/numbers |

### `sheets_append_rows` ✏️

Append rows after the last row of data in a tab.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `tab` | string |  | `"Sheet1"` |  |
| `rows` | string \\| number \\| boolean \\| null[][] | yes |  |  |

### `sheets_clear` ⚠️

Clear the values in a range (formatting is kept).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `range` | string | yes |  |  |

### `sheets_manage_tab` ⚠️

Add, rename, duplicate or delete a tab.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `action` | `add` \\| `rename` \\| `duplicate` \\| `delete` | yes |  |  |
| `tab` | string | yes |  |  |
| `newName` | string |  |  |  |

### `sheets_format` ✏️

Format a range on one tab: bold, colors, number format (e.g. '$#,##0.00', '0.0%', 'yyyy-mm-dd'), alignment, borders.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `tab` | string | yes |  |  |
| `startRow` | integer | yes |  | 0-based |
| `endRow` | integer | yes |  | exclusive |
| `startCol` | integer | yes |  |  |
| `endCol` | integer | yes |  |  |
| `bold` | boolean |  |  |  |
| `italic` | boolean |  |  |  |
| `fontSize` | number |  |  |  |
| `textColor` | string |  |  | #RRGGBB |
| `backgroundColor` | string |  |  | #RRGGBB |
| `numberFormat` | string |  |  |  |
| `horizontalAlignment` | `LEFT` \\| `CENTER` \\| `RIGHT` |  |  |  |
| `borders` | boolean |  |  |  |
| `wrap` | boolean |  |  |  |

### `sheets_add_chart` ✏️

Add a chart (column, bar, line, area, pie, scatter) built from a data range on a tab.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `tab` | string | yes |  |  |
| `chartType` | `COLUMN` \\| `BAR` \\| `LINE` \\| `AREA` \\| `PIE` \\| `SCATTER` |  | `"COLUMN"` |  |
| `title` | string |  |  |  |
| `startRow` | integer | yes |  | 0-based header row |
| `endRow` | integer | yes |  | exclusive |
| `domainCol` | integer | yes |  | 0-based column with labels/x values |
| `seriesCols` | integer[] | yes |  | 0-based columns with values |

### `sheets_analyze` 🔒

Analyze a table in a range (first row = headers): per-column type, count, blanks, distinct values, and for numeric columns sum/mean/median/min/max/stdev; top values for text columns. Optional group-by summary.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `range` | string | yes |  | e.g. 'Sales' or 'Sales!A1:H500' |
| `groupBy` | string |  |  | Header name to group by |
| `aggregateColumns` | string[] |  |  | Numeric headers to sum/average per group |

### `sheets_batch_update` ✏️

Advanced: send raw Sheets API batchUpdate requests (conditional formatting, filters, pivot tables, etc.).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `spreadsheetId` | string | yes |  |  |
| `requests` | object[] | yes |  |  |

## Google Slides

### `slides_create` ✏️

Create a Google Slides presentation, optionally with slides (layout, title, bullets, two columns, speaker notes, images).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | string | yes |  |  |
| `slides` | { layout, title, body, body2, notes, imageUrl }[] |  |  |  |
| `folderId` | string |  |  |  |

### `slides_read` 🔒

Read a presentation: every slide's text (by placeholder), tables, image count, and speaker notes.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |

### `slides_add_slides` ✏️

Add one or more slides to an existing presentation (at the end or at a 0-based position).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slides` | { layout, title, body, body2, notes, imageUrl }[] | yes |  |  |
| `insertionIndex` | integer |  |  |  |

### `slides_replace_text` ✏️

Find and replace text across all slides (or only some), e.g. fill {{placeholders}} in a template deck.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `replacements` | { find, replace, matchCase }[] | yes |  |  |
| `onlySlideIds` | string[] |  |  |  |

### `slides_set_text` ✏️

Replace all text inside one shape/text box (objectId from slides_read).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `objectId` | string | yes |  |  |
| `text` | string or string[] | yes |  | Array = bullets |

### `slides_set_notes` ✏️

Set the speaker notes of a slide.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slide` | string or integer | yes |  | Slide objectId, or 1-based slide number |
| `notes` | string | yes |  |  |

### `slides_add_image` ✏️

Place an image (public URL) on a slide. Position/size in points (deck is usually 720×405 pt).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slide` | string or integer | yes |  | Slide objectId, or 1-based slide number |
| `imageUrl` | string | yes |  |  |
| `x` | number |  | `160` |  |
| `y` | number |  | `80` |  |
| `width` | number |  | `400` |  |
| `height` | number |  | `260` |  |

### `slides_add_text_box` ✏️

Add a text box to a slide. Position/size in points.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slide` | string or integer | yes |  | Slide objectId, or 1-based slide number |
| `text` | string | yes |  |  |
| `x` | number |  | `40` |  |
| `y` | number |  | `40` |  |
| `width` | number |  | `640` |  |
| `height` | number |  | `60` |  |
| `fontSize` | number |  |  |  |
| `bold` | boolean |  |  |  |

### `slides_manage_slide` ⚠️

Delete, duplicate, or move a slide.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slide` | string or integer | yes |  | Slide objectId, or 1-based slide number |
| `action` | `delete` \\| `duplicate` \\| `move` | yes |  |  |
| `toIndex` | integer |  |  | 0-based target for move |

### `slides_get_thumbnail` 🔒

Get a PNG thumbnail URL of a slide (to visually check it).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `slide` | string or integer | yes |  | Slide objectId, or 1-based slide number |
| `size` | `SMALL` \\| `MEDIUM` \\| `LARGE` |  | `"MEDIUM"` |  |

### `slides_batch_update` ✏️

Advanced: send raw Google Slides API batchUpdate requests (shapes, tables, styling, etc.).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `presentationId` | string | yes |  |  |
| `requests` | object[] | yes |  |  |

## Google Calendar

### `calendar_list_calendars` 🔒

List the calendars this account can see (IDs, names, time zones, access role).

_No parameters._

### `calendar_list_events` 🔒

List or search events in a time window (defaults to the next 7 days). Recurring events are expanded into single occurrences.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `timeMin` | string |  |  | ISO date-time; default now |
| `timeMax` | string |  |  | ISO date-time; default 7 days after timeMin |
| `query` | string |  |  | Free-text search in title, description, location, attendees |
| `maxResults` | integer |  | `50` |  |

### `calendar_get_event` 🔒

Get full details of one event.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `eventId` | string | yes |  |  |

### `calendar_create_event` ✏️

Create an event, optionally with attendees (they get invitations), a Google Meet link, recurrence and reminders. Confirm attendees with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `summary` | string | yes |  |  |
| `start` | string | yes |  |  |
| `end` | string | yes |  |  |
| `timeZone` | string |  |  | IANA time zone, e.g. America/New_York, Asia/Kolkata |
| `description` | string |  |  |  |
| `location` | string |  |  |  |
| `attendees` | string[] |  |  | Email addresses |
| `addMeet` | boolean |  |  | Attach a Google Meet link |
| `recurrence` | string[] |  |  | RRULE lines, e.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10'] |
| `reminderMinutes` | integer[] |  |  | Popup reminders, minutes before start |
| `visibility` | `default` \\| `public` \\| `private` |  |  |  |
| `colorId` | string |  |  |  |
| `sendUpdates` | `all` \\| `externalOnly` \\| `none` |  | `"all"` | Who gets email updates about the change |

### `calendar_update_event` ✏️

Change an event (only the fields you pass). Use addAttendees/removeAttendees to adjust the guest list without replacing it.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `eventId` | string | yes |  |  |
| `summary` | string |  |  |  |
| `start` | string |  |  | ISO date-time like 2026-11-25T15:00:00 (with offset or timeZone), or YYYY-MM-DD for all-day |
| `end` | string |  |  | Same format as start. For all-day events, the day after the last day |
| `timeZone` | string |  |  | IANA time zone, e.g. America/New_York, Asia/Kolkata |
| `description` | string |  |  |  |
| `location` | string |  |  |  |
| `attendees` | string[] |  |  | Email addresses |
| `addMeet` | boolean |  |  | Attach a Google Meet link |
| `recurrence` | string[] |  |  | RRULE lines, e.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10'] |
| `reminderMinutes` | integer[] |  |  | Popup reminders, minutes before start |
| `visibility` | `default` \\| `public` \\| `private` |  |  |  |
| `colorId` | string |  |  |  |
| `addAttendees` | string[] |  |  |  |
| `removeAttendees` | string[] |  |  |  |
| `sendUpdates` | `all` \\| `externalOnly` \\| `none` |  | `"all"` | Who gets email updates about the change |

### `calendar_delete_event` ⚠️

Cancel/delete an event. Attendees are notified according to sendUpdates. Confirm with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `eventId` | string | yes |  |  |
| `sendUpdates` | `all` \\| `externalOnly` \\| `none` |  | `"all"` | Who gets email updates about the change |

### `calendar_respond` ✏️

RSVP to an event you were invited to: accepted, declined or tentative.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `eventId` | string | yes |  |  |
| `response` | `accepted` \\| `declined` \\| `tentative` | yes |  |  |
| `comment` | string |  |  |  |

### `calendar_quick_add` ✏️

Create an event from a sentence, e.g. 'Lunch with Priya tomorrow 1pm at Cafe Mocha'.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `calendarId` | string |  | `"primary"` | Calendar ID or 'primary' |
| `text` | string | yes |  |  |

### `calendar_find_free_time` 🔒

Check busy times for one or more people/calendars in a window and suggest free slots of a given length (within working hours).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `emails` | string[] |  | `["primary"]` | Calendar IDs or emails (you need visibility of their free/busy) |
| `timeMin` | string | yes |  |  |
| `timeMax` | string | yes |  |  |
| `durationMinutes` | integer |  | `30` |  |
| `timeZone` | string |  | `"UTC"` |  |
| `workdayStartHour` | integer |  | `9` |  |
| `workdayEndHour` | integer |  | `18` |  |

## Google Chat

### `chat_list_spaces` 🔒

List Google Chat spaces (rooms, group chats and direct messages) you belong to.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `type` | `any` \\| `SPACE` \\| `GROUP_CHAT` \\| `DIRECT_MESSAGE` |  | `"any"` |  |
| `pageSize` | integer |  | `100` |  |

### `chat_list_messages` 🔒

Read recent messages in a space (newest first). Use a space name like 'spaces/AAAA…', or an email to read your direct messages with that person.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `space` | string |  |  |  |
| `dmWithEmail` | string |  |  |  |
| `sinceHours` | number |  |  | Only messages from the last N hours |
| `pageSize` | integer |  | `50` |  |

### `chat_send_message` ✏️

Send a Google Chat message to a space, or as a direct message to a person by email. Can reply in a thread. Confirm the recipient and text with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `space` | string |  |  |  |
| `toEmail` | string |  |  | Send as a direct message to this person |
| `text` | string | yes |  | Supports Chat formatting: *bold*, _italic_, ~strike~, `code`, <https://link\|label>, <users/{email}> to @mention |
| `threadName` | string |  |  | Reply in this thread (thread name from chat_list_messages) |
| `createDm` | boolean |  | `true` | Start a new DM if none exists with toEmail |

### `chat_list_members` 🔒

List the members of a Chat space.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `space` | string | yes |  |  |
| `pageSize` | integer |  | `100` |  |

### `chat_search_messages` 🔒

Find messages in a space that contain some text (searches the most recent messages, up to 1000).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `space` | string | yes |  |  |
| `text` | string | yes |  |  |
| `sinceHours` | number |  |  |  |

## Google Contacts (People API)

### `contacts_search` 🔒

Find people by name, email, phone or company across your Google Contacts, 'other contacts' (people you've emailed) and, for Workspace accounts, the company directory. Use this to turn a name into an email address before sending invites or messages.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes |  |  |
| `sources` | `contacts` \\| `other` \\| `directory`[] |  | `["contacts","other","directory"]` |  |
| `maxResults` | integer |  | `10` |  |

### `contacts_list` 🔒

List your Google Contacts (sorted by last modified or name).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `pageSize` | integer |  | `100` |  |
| `sortOrder` | `LAST_MODIFIED_DESCENDING` \\| `FIRST_NAME_ASCENDING` \\| `LAST_NAME_ASCENDING` |  | `"LAST_MODIFIED_DESCENDING"` |  |
| `pageToken` | string |  |  |  |

### `contacts_get` 🔒

Get one contact's full details by resourceName (people/c123...).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `resourceName` | string | yes |  |  |

### `contacts_create` ✏️

Create a new Google Contact.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `givenName` | string |  |  |  |
| `familyName` | string |  |  |  |
| `emails` | string[] |  |  |  |
| `phones` | string[] |  |  |  |
| `company` | string |  |  |  |
| `title` | string |  |  |  |
| `address` | string |  |  |  |
| `notes` | string |  |  |  |
| `website` | string |  |  |  |
| `birthday` | string |  |  | YYYY-MM-DD or --MM-DD |
| `groupResourceNames` | string[] |  |  | contactGroups/... to add the contact to |

### `contacts_update` ✏️

Update fields on an existing contact (only the fields you pass are replaced).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `resourceName` | string | yes |  |  |
| `givenName` | string |  |  |  |
| `familyName` | string |  |  |  |
| `emails` | string[] |  |  |  |
| `phones` | string[] |  |  |  |
| `company` | string |  |  |  |
| `title` | string |  |  |  |
| `address` | string |  |  |  |
| `notes` | string |  |  |  |
| `website` | string |  |  |  |
| `birthday` | string |  |  | YYYY-MM-DD or --MM-DD |

### `contacts_delete` ⚠️

Delete a contact. Confirm with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `resourceName` | string | yes |  |  |

### `contacts_groups` ✏️

List contact groups (labels), create one, or add/remove contacts in a group.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | `list` \\| `create` \\| `add` \\| `remove` | yes |  |  |
| `groupResourceName` | string |  |  |  |
| `name` | string |  |  | For create |
| `contactResourceNames` | string[] |  |  |  |

## Google Maps

### `maps_search_places` 🔒

Search Google Maps for businesses/places by text (e.g. 'jewelry stores in Surat', 'diamond wholesalers Mumbai'). Returns address, rating, review count, hours, phone, website and Maps link; up to 60 results with paging. includeSummaries adds Google's AI review summary when available.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes |  |  |
| `maxResults` | integer |  | `20` |  |
| `near` | { lat, lng } |  |  | Bias results around this point |
| `radiusMeters` | number |  | `5000` |  |
| `openNow` | boolean |  |  |  |
| `minRating` | number |  |  |  |
| `includedType` | string |  |  | Restrict to one place type, e.g. 'jewelry_store' |
| `includeSummaries` | boolean |  | `false` |  |

### `maps_nearby` 🔒

Find places of given types around a point (e.g. types ['restaurant'] or ['jewelry_store']).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `center` | { lat, lng } | yes |  |  |
| `radiusMeters` | number |  | `1500` |  |
| `types` | string[] | yes |  |  |
| `maxResults` | integer |  | `10` |  |
| `rankBy` | `POPULARITY` \\| `DISTANCE` |  | `"POPULARITY"` |  |

### `maps_place_details` 🔒

All business details for one place: contact info, hours, price range, ratings, up to 5 recent reviews, Google's AI summaries (overview, review summary, neighborhood), amenities, payment/parking/accessibility options, service options, address parts and photo references.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `placeId` | string | yes |  |  |
| `language` | string |  |  | e.g. 'en' |

### `maps_place_photos` 🔒

Get viewable image URLs for a place's photos (from maps_place_details photoNames, or by placeId).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `placeId` | string |  |  |  |
| `photoNames` | string[] |  |  |  |
| `max` | integer |  | `5` |  |
| `maxWidthPx` | integer |  | `1200` |  |

### `maps_geocode` 🔒

Convert an address to coordinates, or coordinates to an address (reverse geocode).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `address` | string |  |  |  |
| `lat` | number |  |  |  |
| `lng` | number |  |  |  |

### `maps_directions` 🔒

Route between two places: distance, travel time (traffic-aware for driving), turn-by-turn steps and a Google Maps link. Optional stops and alternatives.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `origin` | string or { lat, lng } | yes |  | Address/place name, or {lat, lng} |
| `destination` | string or { lat, lng } | yes |  | Address/place name, or {lat, lng} |
| `stops` | string or { lat, lng }[] |  |  |  |
| `mode` | `DRIVE` \\| `WALK` \\| `BICYCLE` \\| `TRANSIT` \\| `TWO_WHEELER` |  | `"DRIVE"` |  |
| `departureTime` | string |  |  | ISO date-time; default now |
| `avoidTolls` | boolean |  |  |  |
| `avoidHighways` | boolean |  |  |  |
| `alternatives` | boolean |  | `false` |  |
| `includeSteps` | boolean |  | `true` |  |
| `units` | `METRIC` \\| `IMPERIAL` |  | `"METRIC"` |  |

### `maps_distance_matrix` 🔒

Travel time and distance from several origins to several destinations (e.g. which store is closest to each customer).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `origins` | string or { lat, lng }[] | yes |  |  |
| `destinations` | string or { lat, lng }[] | yes |  |  |
| `mode` | `DRIVE` \\| `WALK` \\| `BICYCLE` \\| `TRANSIT` \\| `TWO_WHEELER` |  | `"DRIVE"` |  |

## Apps Script

### `script_create_project` ✏️

Create an Apps Script project with code. Pass parentId (a Google Sheet/Doc/Slides/Form ID or URL) to make it a container-bound script that can use SpreadsheetApp.getActiveSpreadsheet(), custom functions and custom menus. Returns the scriptId and editor link.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `title` | string | yes |  |  |
| `parentId` | string |  |  | Bind to this Sheet/Doc/Slides/Form (ID or URL) |
| `files` | { name, type, source }[] | yes |  |  |
| `timeZone` | string |  | `"Asia/Kolkata"` |  |
| `oauthScopes` | string[] |  |  | Optional explicit scopes for the manifest; usually leave empty so Apps Script detects them |

### `script_get_content` 🔒

Read an Apps Script project's files and source code.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scriptId` | string | yes |  |  |
| `includeSource` | boolean |  | `true` |  |

### `script_update_files` ✏️

Add or replace files in an Apps Script project. Files with the same name are replaced; others are kept (mode 'merge'), or the project is reset to exactly these files plus the manifest (mode 'replace'). Use deleteFiles to remove files.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scriptId` | string | yes |  |  |
| `files` | { name, type, source }[] |  | `[]` |  |
| `mode` | `merge` \\| `replace` |  | `"merge"` |  |
| `deleteFiles` | string[] |  | `[]` |  |
| `manifest` | string |  |  | Full appsscript.json to replace the manifest (e.g. to add oauthScopes or webapp settings) |

### `script_list_projects` 🔒

List standalone Apps Script projects in Drive (bound scripts live inside their Sheet/Doc and aren't listed).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `nameContains` | string |  |  |  |
| `pageSize` | integer |  | `30` |  |

### `script_deploy` ✏️

Create a new version and a deployment of an Apps Script project. Needed before script_run (as an API executable) or to publish a web app (set webApp in the manifest first).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scriptId` | string | yes |  |  |
| `description` | string |  | `"Deployed by Claude"` |  |
| `deploymentId` | string |  |  | Update this existing deployment instead of creating a new one |

### `script_run` ✏️

Run a function in an Apps Script project and return its result (or error and stack trace). devMode=true runs the latest saved code. Requires: the script's GCP project set to this connector's project, an API executable deployment (script_deploy), and the script authorized once in the editor. Confirm with the user before running code that sends email, edits many rows or deletes data.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scriptId` | string | yes |  |  |
| `function` | string | yes |  |  |
| `parameters` | any[] |  | `[]` |  |
| `devMode` | boolean |  | `true` |  |

### `script_logs` 🔒

Recent executions of an Apps Script project (function, status, duration, start time) — use to check triggers and failures.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `scriptId` | string | yes |  |  |
| `functionName` | string |  |  |  |
| `pageSize` | integer |  | `20` |  |

## Google Tag Manager

### `gtm_list_containers` 🔒

List Google Tag Manager accounts and their containers (public IDs like GTM-XXXX, names, paths, target domains).

_No parameters._

### `gtm_get_container` 🔒

Everything configured in a GTM workspace: tags (type, key settings, firing triggers), triggers (type, conditions), variables, enabled built-in variables, plus the live published version number. Use before changing anything.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |

### `gtm_workspace` ✏️

List, create or check workspaces. Create a dedicated workspace for each change set (e.g. 'Claude – GA4 ecommerce') so it can be reviewed and published separately. 'status' lists pending changes.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `container` | string | yes |  | GTM-XXXX or container path (for list/create) or workspace path (for status) |
| `action` | `list` \\| `create` \\| `status` | yes |  |  |
| `name` | string |  |  |  |
| `description` | string |  |  |  |

### `gtm_enable_builtin_variables` ✏️

Turn on built-in variables in a workspace, e.g. PAGE_URL, PAGE_PATH, PAGE_HOSTNAME, REFERRER, EVENT, CLICK_URL, CLICK_TEXT, CLICK_CLASSES, CLICK_ID, FORM_ID, SCROLL_DEPTH_THRESHOLD, VIDEO_TITLE.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `types` | string[] | yes |  |  |

### `gtm_add_datalayer_variables` ✏️

Create Data Layer Variables (DLV) for dataLayer keys, e.g. ['ecommerce.value', 'ecommerce.currency', 'user_id']. Skips ones that already exist. Names default to 'DLV - <key>'.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `keys` | string[] | yes |  |  |
| `defaultValue` | string |  |  | Value when the key is missing (e.g. 'undefined' or '0') |

### `gtm_add_event_trigger` ✏️

Create a Custom Event trigger that fires when the site pushes { event: '<eventName>' } to the dataLayer (optionally a regex of several events). Returns the trigger ID. Reuses an identical existing trigger.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `eventName` | string | yes |  | e.g. add_to_cart, or a regex like ^(add_to_cart\|purchase)$ with regex=true |
| `regex` | boolean |  | `false` |  |
| `name` | string |  |  |  |

### `gtm_add_ga4_tags` ✏️

Set up GA4 in a workspace: a Google tag (G-XXXX) on All Pages if missing, and/or GA4 event tags that fire on dataLayer events. For ecommerce events (view_item, add_to_cart, begin_checkout, purchase…) sendEcommerce=true reads the standard 'ecommerce' object automatically. Extra parameters can map to DLV variables, e.g. {"transaction_id": "{{DLV - ecommerce.transaction_id}}"}.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `measurementId` | string | yes |  | GA4 measurement ID, G-XXXXXXX |
| `ensureGoogleTag` | boolean |  | `true` |  |
| `events` | { eventName, triggerEvent, sendEcommerce, parameters }[] |  | `[]` |  |

### `gtm_upsert` ✏️

Advanced: create or update any tag, trigger or variable using the raw GTM API resource JSON (e.g. Custom HTML tags, Meta/Google Ads tags, click or form triggers, lookup tables). With id → update; without → create.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `entity` | `tag` \\| `trigger` \\| `variable` | yes |  |  |
| `id` | string |  |  |  |
| `resource` | object | yes |  | Tag/Trigger/Variable body: name, type, parameter[], firingTriggerId[], filter[], customEventFilter[] … |

### `gtm_delete` ⚠️

Delete a tag, trigger or variable from a workspace (not live until published). Confirm with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `entity` | `tag` \\| `trigger` \\| `variable` | yes |  |  |
| `id` | string | yes |  |  |

### `gtm_create_version` ✏️

Save the workspace as a new container version (not live yet). Returns compiler errors if the configuration is invalid. Ask the user to check GTM Preview before publishing.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `workspace` | string | yes |  | Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace) |
| `name` | string | yes |  |  |
| `notes` | string |  |  |  |

### `gtm_publish` ⚠️

Publish a container version so it goes LIVE on the website. Only call after the user has reviewed the changes (ideally in GTM Preview) and explicitly approved publishing.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `versionPath` | string | yes |  | accounts/…/containers/…/versions/N from gtm_create_version |

### `gtm_scan_website` 🔒

Scan a web page's HTML (no browser needed) for tracking setup: GTM containers, GA4/Google Ads/UA IDs, gtag config, consent mode and CMPs, Meta/TikTok/Clarity/Hotjar/Pinterest pixels, server-side GTM, and inline dataLayer pushes. Also downloads each GTM container's public script to list the IDs and event names it uses. For the LIVE dataLayer (events pushed by JavaScript), use a browser and read window.dataLayer.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | yes |  |  |
| `includeContainerScript` | boolean |  | `true` |  |

### `gtm_list_versions` 🔒

List a container's versions (newest first) to see history or find the version to roll back to.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `container` | string | yes |  | GTM-XXXX or container path |

## Google Analytics 4

### `ga_list_properties` 🔒

List the Google Analytics 4 accounts and properties this Google account can access (with property IDs).

_No parameters._

### `ga_overview` 🔒

Quick GA4 performance summary: users, new users, sessions, engagement rate, avg session duration, views, key events (conversions) and revenue, broken down by a chosen dimension.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `propertyId` | string | yes |  |  |
| `startDate` | string |  | `"28daysAgo"` | YYYY-MM-DD, or 'today', 'yesterday', 'NdaysAgo' |
| `endDate` | string |  | `"yesterday"` |  |
| `breakdown` | `date` \\| `week` \\| `month` \\| `channel` \\| `source_medium` \\| `campaign` \\| `page` \\| `landing_page` \\| `country` \\| `city` \\| `device` \\| `browser` \\| `event` \\| `new_vs_returning` \\| `item` |  | `"channel"` |  |
| `limit` | integer |  | `25` |  |

### `ga_run_report` 🔒

Run a custom GA4 report with any dimensions/metrics (see ga_get_metadata for names). Supports filters, ordering, comparison of two date ranges.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `propertyId` | string | yes |  |  |
| `startDate` | string |  | `"28daysAgo"` | YYYY-MM-DD, or 'today', 'yesterday', 'NdaysAgo' |
| `endDate` | string |  | `"yesterday"` |  |
| `compareStartDate` | string |  |  |  |
| `compareEndDate` | string |  |  |  |
| `dimensions` | string[] |  | `[]` |  |
| `metrics` | string[] | yes |  |  |
| `dimensionFilters` | { field, op, value, not }[] |  |  |  |
| `metricFilters` | { field, op, value, not }[] |  |  |  |
| `orderBy` | string |  |  | Dimension or metric name to sort by |
| `desc` | boolean |  | `true` |  |
| `limit` | integer |  | `100` |  |
| `offset` | integer |  | `0` |  |

### `ga_realtime` 🔒

GA4 realtime report (last 30 minutes): active users by a dimension such as country, unifiedScreenName, deviceCategory.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `propertyId` | string | yes |  |  |
| `dimensions` | string[] |  | `["country"]` |  |
| `metrics` | string[] |  | `["activeUsers"]` |  |
| `limit` | integer |  | `25` |  |

### `ga_get_metadata` 🔒

List the dimensions and metrics available for a GA4 property (including custom ones). Optional search text filters the list.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `propertyId` | string | yes |  |  |
| `search` | string |  |  |  |

## Google Ads

### `ads_list_accounts` 🔒

List Google Ads accounts this Google login can access (IDs, names, currency, whether each is a manager), including client accounts under managers.

_No parameters._

### `ads_query` 🔒

Run any read-only GAQL query against a Google Ads account (e.g. SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS). Money fields ending in _micros are returned in currency units.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `query` | string | yes |  |  |
| `limit` | integer |  | `500` |  |

### `ads_campaign_performance` 🔒

Campaign performance for a date range: status, type, daily budget, impressions, clicks, CTR, avg CPC, cost, conversions, conversion value, cost/conversion and ROAS.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `dateRange` | `TODAY` \\| `YESTERDAY` \\| `LAST_7_DAYS` \\| `LAST_14_DAYS` \\| `LAST_30_DAYS` \\| `THIS_MONTH` \\| `LAST_MONTH` \\| `THIS_WEEK_MON_TODAY` \\| `LAST_WEEK_MON_SUN` |  | `"LAST_30_DAYS"` |  |
| `startDate` | string |  |  | YYYY-MM-DD; overrides dateRange when used with endDate |
| `endDate` | string |  |  |  |
| `includePaused` | boolean |  | `true` |  |
| `limit` | integer |  | `200` |  |

### `ads_ad_group_performance` 🔒

Ad group performance for a date range, optionally within one campaign.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `dateRange` | `TODAY` \\| `YESTERDAY` \\| `LAST_7_DAYS` \\| `LAST_14_DAYS` \\| `LAST_30_DAYS` \\| `THIS_MONTH` \\| `LAST_MONTH` \\| `THIS_WEEK_MON_TODAY` \\| `LAST_WEEK_MON_SUN` |  | `"LAST_30_DAYS"` |  |
| `startDate` | string |  |  | YYYY-MM-DD; overrides dateRange when used with endDate |
| `endDate` | string |  |  |  |
| `campaignId` | string |  |  |  |
| `limit` | integer |  | `200` |  |

### `ads_keyword_performance` 🔒

Search keyword performance with match type and quality score.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `dateRange` | `TODAY` \\| `YESTERDAY` \\| `LAST_7_DAYS` \\| `LAST_14_DAYS` \\| `LAST_30_DAYS` \\| `THIS_MONTH` \\| `LAST_MONTH` \\| `THIS_WEEK_MON_TODAY` \\| `LAST_WEEK_MON_SUN` |  | `"LAST_30_DAYS"` |  |
| `startDate` | string |  |  | YYYY-MM-DD; overrides dateRange when used with endDate |
| `endDate` | string |  |  |  |
| `campaignId` | string |  |  |  |
| `limit` | integer |  | `200` |  |

### `ads_search_terms` 🔒

Search terms report: the actual queries that triggered ads, with cost and conversions (find wasted spend and new keywords).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `dateRange` | `TODAY` \\| `YESTERDAY` \\| `LAST_7_DAYS` \\| `LAST_14_DAYS` \\| `LAST_30_DAYS` \\| `THIS_MONTH` \\| `LAST_MONTH` \\| `THIS_WEEK_MON_TODAY` \\| `LAST_WEEK_MON_SUN` |  | `"LAST_30_DAYS"` |  |
| `startDate` | string |  |  | YYYY-MM-DD; overrides dateRange when used with endDate |
| `endDate` | string |  |  |  |
| `campaignId` | string |  |  |  |
| `minCost` | number |  | `0` |  |
| `limit` | integer |  | `300` |  |

### `ads_ad_performance` 🔒

Ad-level performance including responsive search ad headlines/descriptions.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `dateRange` | `TODAY` \\| `YESTERDAY` \\| `LAST_7_DAYS` \\| `LAST_14_DAYS` \\| `LAST_30_DAYS` \\| `THIS_MONTH` \\| `LAST_MONTH` \\| `THIS_WEEK_MON_TODAY` \\| `LAST_WEEK_MON_SUN` |  | `"LAST_30_DAYS"` |  |
| `startDate` | string |  |  | YYYY-MM-DD; overrides dateRange when used with endDate |
| `endDate` | string |  |  |  |
| `campaignId` | string |  |  |  |
| `limit` | integer |  | `100` |  |

### `ads_set_status` ⚠️

Pause or enable campaigns, ad groups, ads or keywords. ENABLED resumes spending. Use validateOnly=true to dry-run. Always confirm with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `entity` | `campaign` \\| `ad_group` \\| `ad` \\| `keyword` | yes |  |  |
| `ids` | string[] | yes |  | campaign/ad group IDs; for ad: 'adGroupId~adId'; for keyword: 'adGroupId~criterionId' |
| `status` | `ENABLED` \\| `PAUSED` | yes |  |  |
| `validateOnly` | boolean |  | `false` |  |

### `ads_add_negative_keywords` ✏️

Add negative keywords to a campaign so ads stop showing for those searches (e.g. from ads_search_terms waste). Use validateOnly=true to dry-run. Confirm the list with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `campaignId` | string | yes |  |  |
| `keywords` | string[] | yes |  |  |
| `matchType` | `EXACT` \\| `PHRASE` \\| `BROAD` |  | `"PHRASE"` |  |
| `validateOnly` | boolean |  | `false` |  |

### `ads_set_campaign_budget` ⚠️

Change a campaign's daily budget (in account currency). Shared budgets affect every campaign using them. Use validateOnly=true to dry-run. Always confirm the amount with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `customerId` | string | yes |  | Google Ads customer ID (with or without dashes) |
| `loginCustomerId` | string |  |  | Manager (MCC) ID if accessing through a manager; defaults to ads.json |
| `campaignId` | string | yes |  |  |
| `dailyBudget` | number | yes |  |  |
| `validateOnly` | boolean |  | `false` |  |

## Dialogflow

### `dialogflow_get_agent` 🔒

Show a Dialogflow ES agent's settings (name, language, time zone, ML threshold).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | string | yes |  | Google Cloud project ID that owns the Dialogflow agent |
| `location` | string |  |  | Agent region, e.g. 'global' (default), 'us-central1', 'europe-west1' |

### `dialogflow_list_intents` 🔒

List a Dialogflow ES agent's intents. full=true includes training phrases and responses.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | string | yes |  | Google Cloud project ID that owns the Dialogflow agent |
| `location` | string |  |  | Agent region, e.g. 'global' (default), 'us-central1', 'europe-west1' |
| `full` | boolean |  | `false` |  |
| `languageCode` | string |  |  |  |

### `dialogflow_detect_intent` 🔒

Send a test message to a Dialogflow ES agent and get its reply, matched intent and confidence. Reuse sessionId to continue a conversation.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | string | yes |  | Google Cloud project ID that owns the Dialogflow agent |
| `location` | string |  |  | Agent region, e.g. 'global' (default), 'us-central1', 'europe-west1' |
| `text` | string | yes |  |  |
| `sessionId` | string |  |  |  |
| `languageCode` | string |  | `"en"` |  |

### `dialogflow_create_intent` ✏️

Create a Dialogflow ES intent with training phrases and text responses.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | string | yes |  | Google Cloud project ID that owns the Dialogflow agent |
| `location` | string |  |  | Agent region, e.g. 'global' (default), 'us-central1', 'europe-west1' |
| `displayName` | string | yes |  |  |
| `trainingPhrases` | string[] | yes |  |  |
| `responses` | string[] |  | `[]` |  |
| `languageCode` | string |  |  |  |

### `dialogflow_update_intent` ✏️

Add training phrases and/or responses to an existing Dialogflow ES intent (keeps what's already there).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `intentName` | string | yes |  | projects/.../agent/intents/ID from dialogflow_list_intents |
| `location` | string |  |  |  |
| `addTrainingPhrases` | string[] |  | `[]` |  |
| `addResponses` | string[] |  | `[]` |  |
| `languageCode` | string |  |  |  |

### `dialogflow_delete_intent` ⚠️

Delete a Dialogflow ES intent. Confirm with the user first.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `intentName` | string | yes |  |  |
| `location` | string |  |  |  |

### `dialogflow_cx_list_agents` 🔒

List Dialogflow CX agents in a project and region.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `projectId` | string | yes |  |  |
| `location` | string |  | `"global"` |  |

### `dialogflow_cx_list_intents` 🔒

List a Dialogflow CX agent's intents with training phrase counts (or phrases with full=true).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `agentName` | string | yes |  | projects/P/locations/L/agents/ID |
| `full` | boolean |  | `false` |  |

### `dialogflow_cx_detect_intent` 🔒

Send a test message to a Dialogflow CX agent and get its replies, matched intent, page and parameters. Reuse sessionId to continue.

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `agentName` | string | yes |  |  |
| `text` | string | yes |  |  |
| `sessionId` | string |  |  |  |
| `languageCode` | string |  | `"en"` |  |

## Setup

### `google_setup` ✏️

Set up or check the Google connection. Actions: 'open_settings' (opens the plugin's settings page in the browser where the user types the Google Maps API key, Google Ads developer token and manager account ID — preferred way to set keys, they never pass through the chat), 'status' (what's configured), 'import_credentials' (copy a downloaded Desktop-app OAuth client JSON into place; omit path to use the newest client_secret_*.json in Downloads), 'sign_in' (opens the browser for Google consent and waits up to 5 minutes), 'sign_out' (deletes the saved token), 'configure_ads' (save a Google Ads developer token and optional manager account ID), 'configure_maps' (save a Google Maps Platform API key).

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `action` | `open_settings` \\| `status` \\| `import_credentials` \\| `sign_in` \\| `sign_out` \\| `configure_ads` \\| `configure_maps` | yes |  |  |
| `credentialsPath` | string |  |  | For import_credentials: path to the downloaded client_secret_*.json |
| `developerToken` | string |  |  | For configure_ads: Google Ads API developer token |
| `loginCustomerId` | string |  |  | For configure_ads: manager (MCC) account ID, if accounts are accessed through one |
| `mapsApiKey` | string |  |  | For configure_maps: Google Maps Platform API key |
