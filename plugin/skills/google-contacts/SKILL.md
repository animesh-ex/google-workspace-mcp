---
name: google-contacts
description: Manages Google Contacts and looks people up through the Google People API. Use when the user asks for someone's email or phone, "who is X", to add/save/update/delete a contact, to tag or group contacts, to clean up or export contacts, or whenever another task (email, calendar invite, Chat message, sharing a file) names a person instead of an email address.
---

# Google Contacts (People API)

Use the google-workspace `contacts_*` tools.

## Look someone up
`contacts_search` with a name, email, phone or company searches three places at once:
- **contacts:** the user's saved Google Contacts.
- **other:** people they've emailed but never saved.
- **directory:** colleagues in their Google Workspace organization (Workspace accounts only).

Each result says which `source` it came from. If more than one person matches, show the options (name, email, company) and ask. Never pick one silently before sending anything. If nothing matches, say so and ask for the email.

Use this before `gmail_send`, `calendar_create_event`, `chat_send_message` or `drive_share` whenever the user gives a name.

## Read
- `contacts_get` for one contact's full card: emails, phones, company, title, addresses, notes, birthday, website, groups.
- `contacts_list` to browse, sorted by recently changed or by first or last name. Page with `nextPageToken`.

## Add and edit
- `contacts_create` with givenName, familyName, emails, phones, company, title, address, notes, website and birthday. Check `contacts_search` first so you don't create a duplicate.
- `contacts_update` replaces only the fields you pass. For example, passing `phones` replaces the whole phone list, so include any existing numbers to keep.
- `contacts_delete`: confirm with the user first; this can't be undone from here.

## Groups (labels)
`contacts_groups`:
- `list` shows labels and member counts.
- `create` makes a new label.
- `add` or `remove` contacts in a label using their resourceNames.

## Bulk work
- **Export:** list contacts, then `sheets_create` with columns Name, Email, Phone, Company, Title, Notes.
- **Import from a sheet:** `sheets_read`, then show the user what will be created, then `contacts_create` per row after a yes.
- **Clean up:** find duplicates (same email or phone), propose merges or deletes, and act only after approval.

Treat contact details as private: don't paste full address books into chat unless the user asks.
