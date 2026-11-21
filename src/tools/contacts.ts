import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { people as peopleApi, type people_v1 } from "@googleapis/people";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE, DESTRUCTIVE } from "../util.js";

const ppl = () => peopleApi({ version: "v1", auth: getAuthClient() });

const FIELDS = "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,birthdays,urls,memberships,photos,metadata";

function person(p: people_v1.Schema$Person, source?: string) {
  return {
    resourceName: p.resourceName, source,
    name: p.names?.[0]?.displayName,
    emails: p.emailAddresses?.map((e) => e.value).filter(Boolean),
    phones: p.phoneNumbers?.map((x) => x.value).filter(Boolean),
    company: p.organizations?.[0]?.name || undefined, title: p.organizations?.[0]?.title || undefined,
    department: p.organizations?.[0]?.department || undefined,
    addresses: p.addresses?.map((a) => a.formattedValue).filter(Boolean),
    notes: p.biographies?.[0]?.value || undefined,
    birthday: p.birthdays?.[0]?.date ? [p.birthdays[0].date.year, p.birthdays[0].date.month, p.birthdays[0].date.day].filter(Boolean).join("-") : undefined,
    urls: p.urls?.map((u) => u.value).filter(Boolean),
    groups: p.memberships?.map((m) => m.contactGroupMembership?.contactGroupResourceName).filter(Boolean),
  };
}

const personInput = {
  givenName: z.string().optional(), familyName: z.string().optional(),
  emails: z.array(z.string()).optional(), phones: z.array(z.string()).optional(),
  company: z.string().optional(), title: z.string().optional(),
  address: z.string().optional(), notes: z.string().optional(), website: z.string().optional(),
  birthday: z.string().optional().describe("YYYY-MM-DD or --MM-DD"),
};

function toPerson(a: Partial<Record<keyof typeof personInput, any>>): { body: people_v1.Schema$Person; fields: string[] } {
  const body: people_v1.Schema$Person = {};
  const fields: string[] = [];
  if (a.givenName !== undefined || a.familyName !== undefined) { body.names = [{ givenName: a.givenName, familyName: a.familyName }]; fields.push("names"); }
  if (a.emails) { body.emailAddresses = a.emails.map((value: string) => ({ value })); fields.push("emailAddresses"); }
  if (a.phones) { body.phoneNumbers = a.phones.map((value: string) => ({ value })); fields.push("phoneNumbers"); }
  if (a.company !== undefined || a.title !== undefined) { body.organizations = [{ name: a.company, title: a.title }]; fields.push("organizations"); }
  if (a.address !== undefined) { body.addresses = [{ formattedValue: a.address }]; fields.push("addresses"); }
  if (a.notes !== undefined) { body.biographies = [{ value: a.notes, contentType: "TEXT_PLAIN" }]; fields.push("biographies"); }
  if (a.website !== undefined) { body.urls = [{ value: a.website }]; fields.push("urls"); }
  if (a.birthday) {
    const m = String(a.birthday).match(/^(\d{4}|-)-?(\d{2})-(\d{2})$/);
    if (m) { body.birthdays = [{ date: { year: m[1] === "-" ? undefined : Number(m[1]), month: Number(m[2]), day: Number(m[3]) } }]; fields.push("birthdays"); }
  }
  return { body, fields };
}

export function registerContacts(server: McpServer) {
  tool(server, "contacts_search",
    "Find people by name, email, phone or company across your Google Contacts, 'other contacts' (people you've emailed) and, for Workspace accounts, the company directory. Use this to turn a name into an email address before sending invites or messages.",
    { query: z.string(), sources: z.array(z.enum(["contacts", "other", "directory"])).default(["contacts", "other", "directory"]), maxResults: z.number().int().min(1).max(30).default(10) },
    async ({ query, sources, maxResults }) => {
      const p = ppl();
      const out: ReturnType<typeof person>[] = [];
      const errors: Record<string, string> = {};
      const run = async (name: string, fn: () => Promise<people_v1.Schema$Person[]>) => {
        try { out.push(...(await fn()).map((x) => person(x, name))); } catch (e: any) { errors[name] = e?.response?.data?.error?.message || e.message; }
      };
      if (sources.includes("contacts")) {
        // The search cache needs a warm-up request before the first real query.
        await p.people.searchContacts({ query: "", readMask: "names" }).catch(() => {});
        await run("contacts", async () => ((await p.people.searchContacts({ query, readMask: FIELDS, pageSize: maxResults })).data.results || []).map((r) => r.person!));
      }
      if (sources.includes("other")) {
        await run("other", async () => ((await p.otherContacts.search({ query, readMask: "names,emailAddresses,phoneNumbers", pageSize: maxResults })).data.results || []).map((r) => r.person!));
      }
      if (sources.includes("directory")) {
        await run("directory", async () => (await p.people.searchDirectoryPeople({
          query, readMask: "names,emailAddresses,phoneNumbers,organizations,photos", sources: ["DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE", "DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT"], pageSize: maxResults,
        })).data.people || []);
      }
      return { results: out, errors: Object.keys(errors).length ? errors : undefined };
    }, READ);

  tool(server, "contacts_list", "List your Google Contacts (sorted by last modified or name).",
    { pageSize: z.number().int().min(1).max(1000).default(100), sortOrder: z.enum(["LAST_MODIFIED_DESCENDING", "FIRST_NAME_ASCENDING", "LAST_NAME_ASCENDING"]).default("LAST_MODIFIED_DESCENDING"), pageToken: z.string().optional() },
    async ({ pageSize, sortOrder, pageToken }) => {
      const r = await ppl().people.connections.list({ resourceName: "people/me", personFields: FIELDS, pageSize, sortOrder, pageToken });
      return { total: r.data.totalPeople, contacts: (r.data.connections || []).map((x) => person(x)), nextPageToken: r.data.nextPageToken };
    }, READ);

  tool(server, "contacts_get", "Get one contact's full details by resourceName (people/c123...).",
    { resourceName: z.string() },
    async ({ resourceName }) => person((await ppl().people.get({ resourceName, personFields: FIELDS })).data), READ);

  tool(server, "contacts_create", "Create a new Google Contact.",
    { ...personInput, groupResourceNames: z.array(z.string()).optional().describe("contactGroups/... to add the contact to") },
    async (a) => {
      const { body } = toPerson(a);
      if (a.groupResourceNames) body.memberships = a.groupResourceNames.map((g) => ({ contactGroupMembership: { contactGroupResourceName: g } }));
      return person((await ppl().people.createContact({ personFields: FIELDS, requestBody: body })).data);
    }, WRITE);

  tool(server, "contacts_update", "Update fields on an existing contact (only the fields you pass are replaced).",
    { resourceName: z.string(), ...personInput },
    async ({ resourceName, ...a }) => {
      const p = ppl();
      const { body, fields } = toPerson(a);
      if (!fields.length) throw new Error("No fields to update.");
      const cur = await p.people.get({ resourceName, personFields: "metadata" });
      body.etag = cur.data.etag;
      return person((await p.people.updateContact({ resourceName, updatePersonFields: fields.join(","), personFields: FIELDS, requestBody: body })).data);
    }, WRITE);

  tool(server, "contacts_delete", "Delete a contact. Confirm with the user first.",
    { resourceName: z.string() },
    async ({ resourceName }) => { await ppl().people.deleteContact({ resourceName }); return { deleted: resourceName }; }, DESTRUCTIVE);

  tool(server, "contacts_groups", "List contact groups (labels), create one, or add/remove contacts in a group.",
    {
      action: z.enum(["list", "create", "add", "remove"]),
      groupResourceName: z.string().optional(), name: z.string().optional().describe("For create"),
      contactResourceNames: z.array(z.string()).optional(),
    },
    async ({ action, groupResourceName, name, contactResourceNames }) => {
      const p = ppl();
      if (action === "list") {
        const r = await p.contactGroups.list({ pageSize: 200 });
        return (r.data.contactGroups || []).map((g) => ({ resourceName: g.resourceName, name: g.formattedName || g.name, type: g.groupType, members: g.memberCount }));
      }
      if (action === "create") {
        if (!name) throw new Error("name is required");
        return (await p.contactGroups.create({ requestBody: { contactGroup: { name } } })).data;
      }
      if (!groupResourceName || !contactResourceNames?.length) throw new Error("groupResourceName and contactResourceNames are required");
      await p.contactGroups.members.modify({ resourceName: groupResourceName, requestBody: action === "add" ? { resourceNamesToAdd: contactResourceNames } : { resourceNamesToRemove: contactResourceNames } });
      return { ok: true, action, group: groupResourceName, count: contactResourceNames.length };
    }, WRITE);
}
