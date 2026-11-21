import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { tagmanager, type tagmanager_v2 } from "@googleapis/tagmanager";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE, DESTRUCTIVE } from "../util.js";

const gtm = () => tagmanager({ version: "v2", auth: getAuthClient() });
type P = tagmanager_v2.Schema$Parameter;

const ALL_PAGES = "2147479553"; // built-in "All Pages" trigger
const tpl = (key: string, value: string): P => ({ type: "template", key, value });
const bool = (key: string, value: boolean): P => ({ type: "boolean", key, value: String(value) });

/** Accept a GTM public ID (GTM-XXXX), a container path, or a workspace path; return paths. */
async function resolveContainer(ref: string): Promise<{ containerPath: string; publicId?: string; name?: string }> {
  if (/^accounts\/\d+\/containers\/\d+/.test(ref)) {
    const containerPath = ref.match(/^accounts\/\d+\/containers\/\d+/)![0];
    return { containerPath };
  }
  const id = ref.trim().toUpperCase();
  const api = gtm();
  const accounts = (await api.accounts.list()).data.account || [];
  for (const a of accounts) {
    const cs = (await api.accounts.containers.list({ parent: a.path! })).data.container || [];
    const c = cs.find((x) => x.publicId?.toUpperCase() === id);
    if (c) return { containerPath: c.path!, publicId: c.publicId!, name: c.name! };
  }
  throw new Error(`Container ${ref} not found among the containers this account can access. Use gtm_list_containers.`);
}

/** Use the given workspace path, or the container's "Default Workspace" (or first workspace). */
async function resolveWorkspace(ref: string): Promise<string> {
  if (/\/workspaces\/\d+$/.test(ref)) return ref;
  const { containerPath } = await resolveContainer(ref);
  const ws = (await gtm().accounts.containers.workspaces.list({ parent: containerPath })).data.workspace || [];
  if (!ws.length) throw new Error("This container has no workspace.");
  return (ws.find((w) => w.name === "Default Workspace") || ws[0]).path!;
}

const params = (ps?: P[]) => Object.fromEntries((ps || []).map((p) => [p.key, p.value ?? p.list?.map((l) => l.map?.map((m) => `${m.key}=${m.value}`).join(" ") ?? l.value) ?? p.map]));

const wsRef = z.string().describe("Workspace path (accounts/…/containers/…/workspaces/…), or a container public ID like GTM-XXXX (uses its Default Workspace)");

export function registerGtm(server: McpServer) {
  tool(server, "gtm_list_containers", "List Google Tag Manager accounts and their containers (public IDs like GTM-XXXX, names, paths, target domains).", {},
    async () => {
      const api = gtm();
      const accounts = (await api.accounts.list()).data.account || [];
      return Promise.all(accounts.map(async (a) => ({
        account: a.name, accountPath: a.path,
        containers: ((await api.accounts.containers.list({ parent: a.path! })).data.container || []).map((c) => ({
          name: c.name, publicId: c.publicId, path: c.path, usageContext: c.usageContext, domains: c.domainName,
        })),
      })));
    }, READ);

  tool(server, "gtm_get_container",
    "Everything configured in a GTM workspace: tags (type, key settings, firing triggers), triggers (type, conditions), variables, enabled built-in variables, plus the live published version number. Use before changing anything.",
    { workspace: wsRef },
    async ({ workspace }) => {
      const ws = await resolveWorkspace(workspace);
      const containerPath = ws.replace(/\/workspaces\/\d+$/, "");
      const api = gtm().accounts.containers;
      const [tags, triggers, vars, builtins, status, live] = await Promise.all([
        api.workspaces.tags.list({ parent: ws }), api.workspaces.triggers.list({ parent: ws }),
        api.workspaces.variables.list({ parent: ws }), api.workspaces.built_in_variables.list({ parent: ws }),
        api.workspaces.getStatus({ path: ws }), api.versions.live({ parent: containerPath }).catch(() => null),
      ]);
      const trigName = new Map((triggers.data.trigger || []).map((t) => [t.triggerId, t.name]));
      trigName.set(ALL_PAGES, "All Pages (built-in)");
      return {
        workspacePath: ws, liveVersion: live?.data ? { id: live.data.containerVersionId, name: live.data.name } : "none published",
        pendingChanges: status.data.workspaceChange?.length || 0, mergeConflicts: status.data.mergeConflict?.length || 0,
        tags: (tags.data.tag || []).map((t) => ({
          id: t.tagId, name: t.name, type: t.type, paused: t.paused || undefined, settings: params(t.parameter),
          firesOn: t.firingTriggerId?.map((id) => trigName.get(id) || id), blockedBy: t.blockingTriggerId?.map((id) => trigName.get(id) || id),
        })),
        triggers: (triggers.data.trigger || []).map((t) => ({
          id: t.triggerId, name: t.name, type: t.type,
          customEvent: t.customEventFilter?.map((f) => params(f.parameter).arg1).filter(Boolean),
          conditions: t.filter?.map((f) => `${params(f.parameter).arg0} ${f.type} ${params(f.parameter).arg1}`),
        })),
        variables: (vars.data.variable || []).map((v) => ({ id: v.variableId, name: v.name, type: v.type, settings: params(v.parameter) })),
        builtInVariables: (builtins.data.builtInVariable || []).map((b) => b.type),
      };
    }, READ);

  tool(server, "gtm_workspace",
    "List, create or check workspaces. Create a dedicated workspace for each change set (e.g. 'Claude – GA4 ecommerce') so it can be reviewed and published separately. 'status' lists pending changes.",
    { container: z.string().describe("GTM-XXXX or container path (for list/create) or workspace path (for status)"), action: z.enum(["list", "create", "status"]), name: z.string().optional(), description: z.string().optional() },
    async ({ container, action, name, description }) => {
      const api = gtm().accounts.containers.workspaces;
      if (action === "status") {
        const ws = await resolveWorkspace(container);
        const s = (await api.getStatus({ path: ws })).data;
        return {
          workspacePath: ws,
          changes: s.workspaceChange?.map((c) => ({ change: c.changeStatus, tag: c.tag?.name, trigger: c.trigger?.name, variable: c.variable?.name, builtIn: c.builtInVariable?.type })),
          mergeConflicts: s.mergeConflict?.length || 0,
        };
      }
      const { containerPath } = await resolveContainer(container);
      if (action === "list") return ((await api.list({ parent: containerPath })).data.workspace || []).map((w) => ({ name: w.name, path: w.path, description: w.description }));
      if (!name) throw new Error("name is required to create a workspace");
      const w = (await api.create({ parent: containerPath, requestBody: { name, description } })).data;
      return { created: w.path, name: w.name };
    }, WRITE);

  tool(server, "gtm_enable_builtin_variables",
    "Turn on built-in variables in a workspace, e.g. PAGE_URL, PAGE_PATH, PAGE_HOSTNAME, REFERRER, EVENT, CLICK_URL, CLICK_TEXT, CLICK_CLASSES, CLICK_ID, FORM_ID, SCROLL_DEPTH_THRESHOLD, VIDEO_TITLE.",
    { workspace: wsRef, types: z.array(z.string()).min(1) },
    async ({ workspace, types }) => {
      const ws = await resolveWorkspace(workspace);
      const r = await gtm().accounts.containers.workspaces.built_in_variables.create({ parent: ws, type: types.map((t) => t.toUpperCase()) });
      return { enabled: r.data.builtInVariable?.map((b) => b.type) };
    }, WRITE);

  tool(server, "gtm_add_datalayer_variables",
    "Create Data Layer Variables (DLV) for dataLayer keys, e.g. ['ecommerce.value', 'ecommerce.currency', 'user_id']. Skips ones that already exist. Names default to 'DLV - <key>'.",
    { workspace: wsRef, keys: z.array(z.string()).min(1), defaultValue: z.string().optional().describe("Value when the key is missing (e.g. 'undefined' or '0')") },
    async ({ workspace, keys, defaultValue }) => {
      const ws = await resolveWorkspace(workspace);
      const api = gtm().accounts.containers.workspaces.variables;
      const existing = new Set(((await api.list({ parent: ws })).data.variable || []).map((v) => v.name));
      const created: string[] = [], skipped: string[] = [];
      for (const key of keys) {
        const name = `DLV - ${key}`;
        if (existing.has(name)) { skipped.push(name); continue; }
        const parameter: P[] = [{ type: "integer", key: "dataLayerVersion", value: "2" }, bool("setDefaultValue", defaultValue !== undefined), tpl("name", key)];
        if (defaultValue !== undefined) parameter.push(tpl("defaultValue", defaultValue));
        await api.create({ parent: ws, requestBody: { name, type: "v", parameter } });
        created.push(name);
      }
      return { created, skipped, usage: "Reference as {{DLV - key}} in tags." };
    }, WRITE);

  tool(server, "gtm_add_event_trigger",
    "Create a Custom Event trigger that fires when the site pushes { event: '<eventName>' } to the dataLayer (optionally a regex of several events). Returns the trigger ID. Reuses an identical existing trigger.",
    { workspace: wsRef, eventName: z.string().describe("e.g. add_to_cart, or a regex like ^(add_to_cart|purchase)$ with regex=true"), regex: z.boolean().default(false), name: z.string().optional() },
    async ({ workspace, eventName, regex, name }) => {
      const ws = await resolveWorkspace(workspace);
      const api = gtm().accounts.containers.workspaces.triggers;
      const triggerName = name || `CE - ${eventName}`;
      const found = ((await api.list({ parent: ws })).data.trigger || []).find((t) => t.name === triggerName);
      if (found) return { triggerId: found.triggerId, name: found.name, reused: true };
      const t = (await api.create({ parent: ws, requestBody: {
        name: triggerName, type: "customEvent",
        customEventFilter: [{ type: regex ? "matchRegex" : "equals", parameter: [tpl("arg0", "{{_event}}"), tpl("arg1", eventName)] }],
      } })).data;
      return { triggerId: t.triggerId, name: t.name };
    }, WRITE);

  tool(server, "gtm_add_ga4_tags",
    "Set up GA4 in a workspace: a Google tag (G-XXXX) on All Pages if missing, and/or GA4 event tags that fire on dataLayer events. For ecommerce events (view_item, add_to_cart, begin_checkout, purchase…) sendEcommerce=true reads the standard 'ecommerce' object automatically. Extra parameters can map to DLV variables, e.g. {\"transaction_id\": \"{{DLV - ecommerce.transaction_id}}\"}.",
    {
      workspace: wsRef, measurementId: z.string().describe("GA4 measurement ID, G-XXXXXXX"),
      ensureGoogleTag: z.boolean().default(true),
      events: z.array(z.object({
        eventName: z.string(), triggerEvent: z.string().optional().describe("dataLayer event that fires it (default: same as eventName)"),
        sendEcommerce: z.boolean().default(false), parameters: z.record(z.string(), z.string()).optional(),
      })).default([]),
    },
    async ({ workspace, measurementId, ensureGoogleTag, events }) => {
      const ws = await resolveWorkspace(workspace);
      const w = gtm().accounts.containers.workspaces;
      const tags = (await w.tags.list({ parent: ws })).data.tag || [];
      const result: Record<string, unknown> = {};
      if (ensureGoogleTag) {
        const has = tags.find((t) => {
          const p = params(t.parameter);
          return (t.type === "googtag" || t.type === "gaawc") && (p.tagId === measurementId || p.measurementId === measurementId);
        });
        if (has) result.googleTag = `exists: ${has.name}`;
        else {
          const t = (await w.tags.create({ parent: ws, requestBody: { name: `Google Tag - ${measurementId}`, type: "googtag", parameter: [tpl("tagId", measurementId)], firingTriggerId: [ALL_PAGES] } })).data;
          result.googleTag = `created: ${t.name}`;
        }
      }
      const triggers = (await w.triggers.list({ parent: ws })).data.trigger || [];
      const created: string[] = [];
      for (const e of events) {
        const ev = e.triggerEvent || e.eventName;
        let trig = triggers.find((t) => t.type === "customEvent" && t.customEventFilter?.some((f) => params(f.parameter).arg1 === ev));
        if (!trig) {
          trig = (await w.triggers.create({ parent: ws, requestBody: { name: `CE - ${ev}`, type: "customEvent", customEventFilter: [{ type: "equals", parameter: [tpl("arg0", "{{_event}}"), tpl("arg1", ev)] }] } })).data;
          triggers.push(trig);
        }
        const parameter: P[] = [tpl("eventName", e.eventName), tpl("measurementIdOverride", measurementId)];
        if (e.sendEcommerce) parameter.push(bool("sendEcommerceData", true), tpl("getEcommerceDataFrom", "dataLayer"));
        if (e.parameters && Object.keys(e.parameters).length) {
          parameter.push({ type: "list", key: "eventSettingsTable", list: Object.entries(e.parameters).map(([k, v]) => ({ type: "map", map: [tpl("parameter", k), tpl("parameterValue", v)] })) });
        }
        const name = `GA4 Event - ${e.eventName}`;
        const existing = tags.find((t) => t.name === name);
        if (existing) {
          await w.tags.update({ path: existing.path!, requestBody: { ...existing, parameter, firingTriggerId: [trig.triggerId!] } });
          created.push(`${name} (updated)`);
        } else {
          await w.tags.create({ parent: ws, requestBody: { name, type: "gaawe", parameter, firingTriggerId: [trig.triggerId!] } });
          created.push(name);
        }
      }
      return { workspacePath: ws, ...result, eventTags: created };
    }, WRITE);

  tool(server, "gtm_upsert",
    "Advanced: create or update any tag, trigger or variable using the raw GTM API resource JSON (e.g. Custom HTML tags, Meta/Google Ads tags, click or form triggers, lookup tables). With id → update; without → create.",
    { workspace: wsRef, entity: z.enum(["tag", "trigger", "variable"]), id: z.string().optional(), resource: z.record(z.string(), z.any()).describe("Tag/Trigger/Variable body: name, type, parameter[], firingTriggerId[], filter[], customEventFilter[] …") },
    async ({ workspace, entity, id, resource }) => {
      const ws = await resolveWorkspace(workspace);
      const w = gtm().accounts.containers.workspaces;
      const api: any = entity === "tag" ? w.tags : entity === "trigger" ? w.triggers : w.variables;
      if (id) {
        const path = `${ws}/${entity}s/${id}`;
        const cur = (await api.get({ path })).data;
        return (await api.update({ path, requestBody: { ...cur, ...resource } })).data;
      }
      return (await api.create({ parent: ws, requestBody: resource })).data;
    }, WRITE);

  tool(server, "gtm_delete", "Delete a tag, trigger or variable from a workspace (not live until published). Confirm with the user first.",
    { workspace: wsRef, entity: z.enum(["tag", "trigger", "variable"]), id: z.string() },
    async ({ workspace, entity, id }) => {
      const ws = await resolveWorkspace(workspace);
      const w = gtm().accounts.containers.workspaces;
      const api: any = entity === "tag" ? w.tags : entity === "trigger" ? w.triggers : w.variables;
      await api.delete({ path: `${ws}/${entity}s/${id}` });
      return { deleted: `${entity} ${id}` };
    }, DESTRUCTIVE);

  tool(server, "gtm_create_version",
    "Save the workspace as a new container version (not live yet). Returns compiler errors if the configuration is invalid. Ask the user to check GTM Preview before publishing.",
    { workspace: wsRef, name: z.string(), notes: z.string().optional() },
    async ({ workspace, name, notes }) => {
      const ws = await resolveWorkspace(workspace);
      const r = (await gtm().accounts.containers.workspaces.create_version({ path: ws, requestBody: { name, notes } })).data;
      if (r.compilerError) return { ok: false, compilerError: true, message: "GTM reported a compiler error. Check tag/trigger settings in the workspace." };
      const v = r.containerVersion!;
      return { ok: true, versionPath: v.path, versionId: v.containerVersionId, name: v.name, tags: v.tag?.length, triggers: v.trigger?.length, variables: v.variable?.length, newWorkspace: r.newWorkspacePath };
    }, WRITE);

  tool(server, "gtm_publish",
    "Publish a container version so it goes LIVE on the website. Only call after the user has reviewed the changes (ideally in GTM Preview) and explicitly approved publishing.",
    { versionPath: z.string().describe("accounts/…/containers/…/versions/N from gtm_create_version") },
    async ({ versionPath }) => {
      const r = (await gtm().accounts.containers.versions.publish({ path: versionPath })).data;
      if (r.compilerError) return { ok: false, compilerError: true };
      return { ok: true, live: r.containerVersion?.containerVersionId, name: r.containerVersion?.name };
    }, DESTRUCTIVE);

  tool(server, "gtm_scan_website",
    "Scan a web page's HTML (no browser needed) for tracking setup: GTM containers, GA4/Google Ads/UA IDs, gtag config, consent mode and CMPs, Meta/TikTok/Clarity/Hotjar/Pinterest pixels, server-side GTM, and inline dataLayer pushes. Also downloads each GTM container's public script to list the IDs and event names it uses. For the LIVE dataLayer (events pushed by JavaScript), use a browser and read window.dataLayer.",
    { url: z.string().url(), includeContainerScript: z.boolean().default(true) },
    async ({ url, includeContainerScript }) => {
      const res = await fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36", Accept: "text/html" } });
      const html = await res.text();
      const uniq = (re: RegExp, s = html) => [...new Set([...s.matchAll(re)].map((m) => m[1]))];
      const has = (re: RegExp) => re.test(html);
      const gtmIds = uniq(/\b(GTM-[A-Z0-9]{4,10})\b/g);
      const gtmLoaders = uniq(/src=["']([^"']*\/gtm\.js\?[^"']*)["']/g).concat(uniq(/['"](https?:\/\/[^'"]+\/gtm\.js)['"]/g));
      const serverSide = gtmLoaders.filter((u) => !/googletagmanager\.com/.test(u));
      const pushes = [...html.matchAll(/dataLayer\.push\(\s*(\{[\s\S]{0,600}?\})\s*\)/g)].slice(0, 15).map((m) => m[1].replace(/\s+/g, " ").slice(0, 400));
      const out: Record<string, unknown> = {
        finalUrl: res.url, status: res.status, title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
        gtmContainers: gtmIds, serverSideGtmHosts: serverSide.length ? serverSide : undefined,
        ga4MeasurementIds: uniq(/\b(G-[A-Z0-9]{6,12})\b/g), googleTagIds: uniq(/\b(GT-[A-Z0-9]{6,12})\b/g),
        googleAdsIds: uniq(/\b(AW-\d{6,12})\b/g), universalAnalyticsIds: uniq(/\b(UA-\d{4,10}-\d{1,4})\b/g),
        gtagConfig: uniq(/gtag\(\s*['"]config['"]\s*,\s*['"]([^'"]+)['"]/g),
        dataLayerInitialized: has(/window\.dataLayer\s*=\s*window\.dataLayer\s*\|\|\s*\[\]/) || has(/dataLayer\s*=\s*\[/),
        inlineDataLayerPushes: pushes,
        consent: {
          consentModeDefault: has(/gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/), consentModeUpdate: has(/gtag\(\s*['"]consent['"]\s*,\s*['"]update['"]/),
          cmp: ["Cookiebot", "OneTrust", "CookieYes", "Usercentrics", "Termly", "iubenda", "Didomi", "Osano", "Complianz", "Klaro"].filter((n) => new RegExp(n, "i").test(html)),
        },
        otherTrackers: Object.fromEntries(Object.entries({
          metaPixel: uniq(/fbq\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/g), tiktokPixel: uniq(/ttq\.load\(\s*['"]([A-Z0-9]+)['"]/g),
          microsoftClarity: uniq(/clarity\.ms\/tag\/([a-z0-9]+)/gi), hotjar: uniq(/hjid\s*:\s*(\d+)/g), pinterest: uniq(/pintrk\(\s*['"]load['"]\s*,\s*['"](\d+)['"]/g),
          linkedin: uniq(/_linkedin_partner_id\s*=\s*["']?(\d+)/g), klaviyo: uniq(/klaviyo\.js\?company_id=([A-Za-z0-9]+)/g),
        }).filter(([, v]) => (v as string[]).length)),
        platformHints: ["Magento", "Shopify", "WooCommerce", "WordPress", "BigCommerce", "Wix", "Squarespace", "Next.js", "Nuxt"].filter((p) => new RegExp(p.replace(".", "\\."), "i").test(html)),
      };
      if (includeContainerScript && gtmIds.length) {
        out.containerScripts = await Promise.all(gtmIds.slice(0, 3).map(async (id) => {
          try {
            const js = await (await fetch(`https://www.googletagmanager.com/gtm.js?id=${id}`)).text();
            const ids = (re: RegExp) => [...new Set([...js.matchAll(re)].map((m) => m[1]))];
            // gtm.js embeds the container as JSON-like objects: "function":"__gaawe","vtp_eventName":"add_to_cart",…
            const TAG_NAMES: Record<string, string> = {
              __googtag: "Google tag (GA4 config)", __gaawe: "GA4 event", __gaawc: "GA4 config (legacy)", __awct: "Google Ads conversion", __sp: "Google Ads remarketing",
              __gclidw: "Conversion linker", __ua: "Universal Analytics (retired)", __html: "Custom HTML", __img: "Custom image", __flc: "Floodlight counter", __fls: "Floodlight sales",
              __lcl: "Link click listener", __cl: "Click listener", __fsl: "Form submit listener", __sdl: "Scroll depth listener", __ytl: "YouTube listener", __evl: "Element visibility listener", __tl: "Timer listener", __hl: "History change listener",
              __bzi: "LinkedIn Insight", __baut: "Microsoft UET", __hjtc: "Hotjar", __pntr: "Pinterest", __twitter_website_tag: "X (Twitter) pixel",
            };
            const fnCounts: Record<string, number> = {};
            for (const m of js.matchAll(/"function":"(__[a-z0-9_]+)"/gi)) fnCounts[m[1]] = (fnCounts[m[1]] || 0) + 1;
            const tagTypes = Object.entries(fnCounts)
              .filter(([f]) => TAG_NAMES[f] || /^__cvt_/.test(f))
              .map(([f, n]) => ({ type: TAG_NAMES[f] || `Community template (${f})`, count: n }))
              .sort((a, b) => b.count - a.count);
            return {
              container: id, bytes: js.length, version: js.match(/"version"\s*:\s*"(\d+)"/)?.[1],
              ga4Ids: ids(/\b(G-[A-Z0-9]{6,12})\b/g), googleAdsIds: ids(/\b(AW-\d{6,12})\b/g), uaIds: ids(/\b(UA-\d{4,10}-\d{1,4})\b/g),
              tagTypes,
              ga4EventNames: ids(/"vtp_eventName":"([^"]{1,60})"/g),
              customEventTriggers: ids(/"arg1":"([A-Za-z_][\w.|-]{1,60})"/g).filter((e) => !/^gtm\./.test(e)),
              dataLayerVariables: ids(/"vtp_name":"([A-Za-z_][\w.]{0,60})"/g).filter((n) => !/^gtm\./.test(n)),
              consentModeTags: fnCounts.__analytics_storage || fnCounts.__ads_storage ? "present" : undefined,
            };
          } catch (e: any) { return { container: id, error: e.message }; }
        }));
      }
      return out;
    }, READ);

  tool(server, "gtm_list_versions", "List a container's versions (newest first) to see history or find the version to roll back to.",
    { container: z.string().describe("GTM-XXXX or container path") },
    async ({ container }) => {
      const { containerPath } = await resolveContainer(container);
      const r = await gtm().accounts.containers.version_headers.list({ parent: containerPath });
      return (r.data.containerVersionHeader || []).filter((h) => !h.deleted).reverse().map((h) => ({
        versionId: h.containerVersionId, name: h.name, path: h.path, tags: h.numTags, triggers: h.numTriggers, variables: h.numVariables,
      }));
    }, READ);
}
