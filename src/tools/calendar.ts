import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { calendar as calendarApi, type calendar_v3 } from "@googleapis/calendar";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE, DESTRUCTIVE } from "../util.js";

const cal = () => calendarApi({ version: "v3", auth: getAuthClient() });

const calendarId = z.string().default("primary").describe("Calendar ID or 'primary'");
const sendUpdates = z.enum(["all", "externalOnly", "none"]).default("all").describe("Who gets email updates about the change");

function summarize(e: calendar_v3.Schema$Event) {
  return {
    id: e.id, summary: e.summary, status: e.status,
    start: e.start?.dateTime || e.start?.date, end: e.end?.dateTime || e.end?.date, timeZone: e.start?.timeZone,
    location: e.location || undefined, description: e.description || undefined,
    organizer: e.organizer?.email,
    attendees: e.attendees?.map((a) => ({ email: a.email, response: a.responseStatus, optional: a.optional || undefined })),
    meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri,
    recurrence: e.recurrence || undefined, recurringEventId: e.recurringEventId || undefined,
    link: e.htmlLink,
  };
}

/** Accept "2026-11-25" (all-day) or an ISO date-time. */
function when(v: string, timeZone?: string): calendar_v3.Schema$EventDateTime {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? { date: v } : { dateTime: v, timeZone };
}

const eventShape = {
  summary: z.string().optional(),
  start: z.string().optional().describe("ISO date-time like 2026-11-25T15:00:00 (with offset or timeZone), or YYYY-MM-DD for all-day"),
  end: z.string().optional().describe("Same format as start. For all-day events, the day after the last day"),
  timeZone: z.string().optional().describe("IANA time zone, e.g. America/New_York, Asia/Kolkata"),
  description: z.string().optional(),
  location: z.string().optional(),
  attendees: z.array(z.string()).optional().describe("Email addresses"),
  addMeet: z.boolean().optional().describe("Attach a Google Meet link"),
  recurrence: z.array(z.string()).optional().describe("RRULE lines, e.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=10']"),
  reminderMinutes: z.array(z.number().int()).optional().describe("Popup reminders, minutes before start"),
  visibility: z.enum(["default", "public", "private"]).optional(),
  colorId: z.string().optional(),
};

function buildEvent(a: Partial<Record<keyof typeof eventShape, any>>): calendar_v3.Schema$Event {
  const ev: calendar_v3.Schema$Event = {};
  if (a.summary !== undefined) ev.summary = a.summary;
  if (a.description !== undefined) ev.description = a.description;
  if (a.location !== undefined) ev.location = a.location;
  if (a.start) ev.start = when(a.start, a.timeZone);
  if (a.end) ev.end = when(a.end, a.timeZone);
  if (a.attendees) ev.attendees = a.attendees.map((email: string) => ({ email }));
  if (a.recurrence) ev.recurrence = a.recurrence;
  if (a.visibility) ev.visibility = a.visibility;
  if (a.colorId) ev.colorId = a.colorId;
  if (a.reminderMinutes) ev.reminders = { useDefault: false, overrides: a.reminderMinutes.map((m: number) => ({ method: "popup", minutes: m })) };
  if (a.addMeet) ev.conferenceData = { createRequest: { requestId: `mcp-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } };
  return ev;
}

export function registerCalendar(server: McpServer) {
  tool(server, "calendar_list_calendars", "List the calendars this account can see (IDs, names, time zones, access role).", {},
    async () => (await cal().calendarList.list({ maxResults: 250 })).data.items?.map((c) => ({
      id: c.id, name: c.summaryOverride || c.summary, primary: c.primary || undefined, timeZone: c.timeZone, accessRole: c.accessRole,
    })), READ);

  tool(server, "calendar_list_events",
    "List or search events in a time window (defaults to the next 7 days). Recurring events are expanded into single occurrences.",
    {
      calendarId,
      timeMin: z.string().optional().describe("ISO date-time; default now"),
      timeMax: z.string().optional().describe("ISO date-time; default 7 days after timeMin"),
      query: z.string().optional().describe("Free-text search in title, description, location, attendees"),
      maxResults: z.number().int().min(1).max(250).default(50),
    },
    async ({ calendarId, timeMin, timeMax, query, maxResults }) => {
      const min = timeMin ? new Date(timeMin) : new Date();
      const max = timeMax ? new Date(timeMax) : new Date(min.getTime() + 7 * 86400000);
      const r = await cal().events.list({
        calendarId, timeMin: min.toISOString(), timeMax: max.toISOString(), q: query,
        singleEvents: true, orderBy: "startTime", maxResults,
      });
      return { timeZone: r.data.timeZone, events: (r.data.items || []).map(summarize) };
    }, READ);

  tool(server, "calendar_get_event", "Get full details of one event.",
    { calendarId, eventId: z.string() },
    async ({ calendarId, eventId }) => summarize((await cal().events.get({ calendarId, eventId })).data), READ);

  tool(server, "calendar_create_event",
    "Create an event, optionally with attendees (they get invitations), a Google Meet link, recurrence and reminders. Confirm attendees with the user first.",
    { calendarId, ...eventShape, summary: z.string(), start: z.string(), end: z.string(), sendUpdates },
    async (a) => {
      const r = await cal().events.insert({
        calendarId: a.calendarId, requestBody: buildEvent(a), sendUpdates: a.sendUpdates, conferenceDataVersion: a.addMeet ? 1 : undefined,
      });
      return summarize(r.data);
    }, WRITE);

  tool(server, "calendar_update_event",
    "Change an event (only the fields you pass). Use addAttendees/removeAttendees to adjust the guest list without replacing it.",
    {
      calendarId, eventId: z.string(), ...eventShape,
      addAttendees: z.array(z.string()).optional(), removeAttendees: z.array(z.string()).optional(), sendUpdates,
    },
    async (a) => {
      const patch = buildEvent(a);
      if (a.addAttendees || a.removeAttendees) {
        const cur = (await cal().events.get({ calendarId: a.calendarId, eventId: a.eventId })).data.attendees || [];
        const remove = new Set((a.removeAttendees || []).map((e) => e.toLowerCase()));
        const kept = cur.filter((x) => !remove.has((x.email || "").toLowerCase()));
        const have = new Set(kept.map((x) => (x.email || "").toLowerCase()));
        patch.attendees = [...kept, ...(a.addAttendees || []).filter((e) => !have.has(e.toLowerCase())).map((email) => ({ email }))];
      }
      const r = await cal().events.patch({
        calendarId: a.calendarId, eventId: a.eventId, requestBody: patch, sendUpdates: a.sendUpdates, conferenceDataVersion: a.addMeet ? 1 : undefined,
      });
      return summarize(r.data);
    }, WRITE);

  tool(server, "calendar_delete_event", "Cancel/delete an event. Attendees are notified according to sendUpdates. Confirm with the user first.",
    { calendarId, eventId: z.string(), sendUpdates },
    async ({ calendarId, eventId, sendUpdates }) => {
      await cal().events.delete({ calendarId, eventId, sendUpdates });
      return { deleted: eventId };
    }, DESTRUCTIVE);

  tool(server, "calendar_respond", "RSVP to an event you were invited to: accepted, declined or tentative.",
    { calendarId, eventId: z.string(), response: z.enum(["accepted", "declined", "tentative"]), comment: z.string().optional() },
    async ({ calendarId, eventId, response, comment }) => {
      const c = cal();
      const ev = (await c.events.get({ calendarId, eventId })).data;
      const attendees = ev.attendees || [];
      const me = attendees.find((x) => x.self);
      if (!me) throw new Error("You are not on this event's guest list.");
      me.responseStatus = response;
      if (comment !== undefined) me.comment = comment;
      const r = await c.events.patch({ calendarId, eventId, requestBody: { attendees }, sendUpdates: "all" });
      return { eventId, response, summary: r.data.summary };
    }, WRITE);

  tool(server, "calendar_quick_add", "Create an event from a sentence, e.g. 'Lunch with Priya tomorrow 1pm at Cafe Mocha'.",
    { calendarId, text: z.string() },
    async ({ calendarId, text }) => summarize((await cal().events.quickAdd({ calendarId, text })).data), WRITE);

  tool(server, "calendar_find_free_time",
    "Check busy times for one or more people/calendars in a window and suggest free slots of a given length (within working hours).",
    {
      emails: z.array(z.string()).default(["primary"]).describe("Calendar IDs or emails (you need visibility of their free/busy)"),
      timeMin: z.string(), timeMax: z.string(),
      durationMinutes: z.number().int().min(5).default(30),
      timeZone: z.string().default("UTC"),
      workdayStartHour: z.number().int().min(0).max(23).default(9),
      workdayEndHour: z.number().int().min(1).max(24).default(18),
    },
    async (a) => {
      const r = await cal().freebusy.query({ requestBody: {
        timeMin: new Date(a.timeMin).toISOString(), timeMax: new Date(a.timeMax).toISOString(), timeZone: a.timeZone,
        items: a.emails.map((id) => ({ id })),
      } });
      const cals = r.data.calendars || {};
      const busy = Object.values(cals).flatMap((c) => c.busy || []).map((b) => [new Date(b.start!).getTime(), new Date(b.end!).getTime()] as const)
        .sort((x, y) => x[0] - y[0]);
      const step = 15 * 60000, dur = a.durationMinutes * 60000;
      const slots: string[] = [];
      const hourIn = (t: number) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: a.timeZone }).format(t));
      for (let t = Math.ceil(new Date(a.timeMin).getTime() / step) * step; t + dur <= new Date(a.timeMax).getTime() && slots.length < 20; t += step) {
        const h0 = hourIn(t), h1 = hourIn(t + dur - 1);
        if (h0 < a.workdayStartHour || h1 >= a.workdayEndHour) continue;
        if (busy.some(([s, e]) => s < t + dur && e > t)) continue;
        if (slots.length && new Date(slots[slots.length - 1]).getTime() + dur > t) continue; // non-overlapping suggestions
        slots.push(new Date(t).toISOString());
      }
      return {
        busy: Object.fromEntries(Object.entries(cals).map(([id, c]) => [id, c.errors?.length ? { error: c.errors[0].reason } : c.busy])),
        freeSlotStarts: slots, durationMinutes: a.durationMinutes, timeZone: a.timeZone,
      };
    }, READ);
}
