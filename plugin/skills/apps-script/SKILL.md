---
name: apps-script
description: Generates, installs, runs and fixes Google Apps Script code, especially for Google Sheets. Use when the user asks for an Apps Script, a macro or automation for a Google Sheet, a custom formula/function (=MYFUNC()), a custom menu or sidebar, to send emails from sheet rows, to sync or clean sheet data on a schedule, to pull an API or other sheets into a sheet, an onEdit/onOpen trigger, a web app from a sheet, or to debug an existing script.
---

# Apps Script for Google Sheets

Use the google-workspace `script_*` tools plus `sheets_*` and `drive_*`.

## 1. Understand the sheet first
Before writing any code:
- `sheets_get_info` gets the tabs and sizes. `sheets_read` on the first ~20 rows shows the headers and data shape.
- Find the exact tab names, header row, key columns (by header name), data types and the last row.
- Ask only what's unclear: what should trigger it (a menu, a formula, an edit, a schedule), who receives any emails, and what should happen to rows already processed.

## 2. Write the script
Write modern Apps Script (V8: `const`/`let`, arrow functions, template strings). Follow these rules:
- **Bound vs standalone:** for anything about one spreadsheet, create a **bound** script (`parentId` = spreadsheet ID) and use `SpreadsheetApp.getActiveSpreadsheet()`. Use `SpreadsheetApp.openById(id)` only in standalone scripts.
- **Find columns by header name, not by letter,** so the script survives column moves:
  `const h = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; const col = name => h.indexOf(name);`
- **Batch reads and writes:** read once with `getValues()`, process arrays in memory, write once with `setValues()`. Never call `getValue()`/`setValue()` inside a loop over rows.
- **Idempotent:** mark processed rows (e.g. a "Sent at" or "Status" column) so re-runs don't duplicate emails or entries.
- **Safe:** wrap risky work in `try/catch`, log with `console.log`, and use `LockService` for triggers that could overlap. Respect quotas (`MailApp.getRemainingDailyQuota()` before bulk email).
- **Readable:** add a short comment block at the top saying what it does, how to run it and which columns it expects.
- **Custom functions** (`=MYFUNC(A2:A)`): add a JSDoc with `@customfunction`, keep them pure (no `MailApp`, no edits), and accept ranges (2D arrays).
- **Menus:** an `onOpen()` that adds `SpreadsheetApp.getUi().createMenu('…').addItem(...)`.
- **Schedules and installable triggers:** add an `installTriggers()` function that deletes existing triggers for the handler and creates `ScriptApp.newTrigger('handler').timeBased().everyDays(1).atHour(9).create()` (or `.forSpreadsheet(ss).onEdit()` / `.onFormSubmit()`). Simple `onEdit(e)` can't send email; use an installable trigger for that.
- **Sidebars and dialogs:** an `HTML` file plus `HtmlService.createHtmlOutputFromFile('Sidebar')`, calling server functions with `google.script.run`.
- **External APIs:** `UrlFetchApp.fetch` with `muteHttpExceptions: true`, with keys kept in `PropertiesService.getScriptProperties()`, never hard-coded.

Show the user the code and a plain-language summary of what it will do before installing, especially anything that sends email, deletes data or runs on a schedule.

## 3. Install it
- **New script:** `script_create_project` with `title`, `parentId` (the spreadsheet), `files` (e.g. `Code` as SERVER_JS, plus any HTML) and the user's `timeZone`. The manifest (V8, API executable access) is added automatically.
- **Change an existing script:** `script_get_content`, then `script_update_files` (merge mode replaces only the files you pass).
- Give the user the `editorUrl`.

## 4. Authorize and run
Apps Script needs the user's one-time permission for what the script does (Sheets, Gmail, and so on):
1. Ask the user to open the `editorUrl`, pick the main function and click **Run** once, then approve the Google permission screen. For a bound script with a menu, they can instead reload the sheet and use the menu.
2. That first run is often all that's needed: menus, custom functions and triggers now work in the sheet.

To run functions **from Claude** (`script_run`), the script also needs, once per script:
- **The same Cloud project as this connector:** in the editor, **Project Settings → Google Cloud Platform (GCP) Project → Change project**, then enter the project number. `google_setup` → `status` shows it as `cloudProjectNumber`.
- **A deployment:** `script_deploy`.

After that, `script_run` with `devMode: true` runs the latest code and returns the function's return value, or an error with the line number. Return useful values (e.g. `{processed: 12, skipped: 3}`) so results are visible.

If `script_run` reports the Apps Script API is disabled, the account must turn it on at https://script.google.com/home/usersettings.

## 5. Verify and debug
- After a run, check the effect with `sheets_read`.
- For triggers and failures: `script_logs` (status and duration per execution). Fix the code with `script_update_files` and run again.
- When debugging an existing script: `script_get_content`, find the bug, show the fix, update, and re-run.

## Common requests and the shape to use
| Request | Shape |
|---|---|
| "Email each row / send reminders" | `sendEmails()` reads rows, skips ones with a Sent date, `MailApp.sendEmail`, writes the Sent date; menu item + optional daily trigger |
| "Custom formula for X" | `@customfunction` that accepts a range and returns a 2D array |
| "Clean up / dedupe / format data" | One function: read all, transform arrays, write back, with a dry-run variant that only reports counts |
| "Copy rows to another tab when status = Done" | Installable onEdit trigger checking the Status column |
| "Pull data from an API/other sheet every morning" | `refresh()` + `installTriggers()` daily time trigger |
| "Build a report/summary tab" | Function that aggregates into a new tab, with a chart via `sheet.newChart()` |
| "Form for the sheet / simple app" | HTML sidebar, or a `doGet()` web app (set `webapp` in the manifest, then `script_deploy`) |
