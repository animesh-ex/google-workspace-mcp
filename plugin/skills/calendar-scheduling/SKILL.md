---
name: calendar-scheduling
description: Schedules meetings and sends Google Calendar invites. Use when the user says "schedule a meeting", "set up a call with", "book time with", "send an invite", "find a time that works", "move/reschedule my meeting", "cancel the meeting", "what's on my calendar", "am I free", "RSVP", or asks to add a Google Meet link.
---

# Schedule meetings with Google Calendar

Use the google-workspace tools: `calendar_*`, `contacts_search`, and `gmail_*` / `chat_send_message` for follow-ups.

## 1. Pin down the details
Collect, asking only for what's missing:
- **Who:** turn names into emails with `contacts_search` (searches Contacts, people they've emailed and the company directory). If several people match, ask which one. Never guess an email.
- **When:** a specific time, or a window to search ("next week, afternoons"). Ask for the length if it isn't obvious (default 30 minutes).
- **Time zone:** use the user's calendar time zone (`calendar_list_calendars` → primary `timeZone`). If guests are in other zones, say what time it will be for them.
- **What:** title, agenda/description, location, or `addMeet: true` for a video call (default to Meet for remote meetings).

## 2. Find a time (when no exact time was given)
1. Call `calendar_find_free_time` with every attendee's email plus `"primary"`, the window, `durationMinutes`, the user's `timeZone`, and working hours.
2. If a colleague's calendar returns an error, you can't see their availability: say so and schedule from the user's calendar only.
3. Offer the user 2–3 slots in plain words ("Tue 25 Nov, 3:00–3:30 pm IST / 4:30 am EST"). Don't book until they pick one.

## 3. Confirm, then create
Before creating, show a summary and get a clear yes:
> **Quarterly review** · Tue 25 Nov, 3:00–3:30 pm (Asia/Kolkata) · Google Meet · Invites: priya@…, alex@…

Then call `calendar_create_event` with `summary`, `start`, `end`, `timeZone`, `attendees`, `addMeet`, `description`, `location`, and optionally `reminderMinutes` or `recurrence` (e.g. `RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8`). `sendUpdates: "all"` emails the invites. Use `"none"` only if the user asks not to notify.

Report back with the event link and the Meet link.

## Changes
- **Reschedule:** `calendar_update_event` with the new `start`/`end`. Guests are notified. Confirm the new time first.
- **Add or remove guests:** `calendar_update_event` with `addAttendees` or `removeAttendees`. This keeps the rest of the guest list.
- **Cancel:** confirm, then `calendar_delete_event` (guests get a cancellation).
- **RSVP:** `calendar_respond` with accepted, declined or tentative, plus an optional note.
- **Quick add:** for a casual one-liner with no guests, `calendar_quick_add` ("Dentist Friday 10am").

## Looking things up
- "What's on today / this week": `calendar_list_events` with `timeMin`/`timeMax`; summarize by day in the user's time zone.
- "When did I last meet X": `calendar_list_events` with `query` set to their name or email and a past window.
- Shared or team calendars: get the ID from `calendar_list_calendars` and pass it as `calendarId`.

## Follow-ups
If asked, send an agenda or recap with `gmail_send` or `chat_send_message` to the attendees. Confirm recipients and text first.
