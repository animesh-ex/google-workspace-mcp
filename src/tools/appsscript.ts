import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { script as scriptApi, type script_v1 } from "@googleapis/script";
import { getAuthClient, cloudProjectNumber } from "../auth.js";
import { tool, drive, READ, WRITE, extractId } from "../util.js";

const gas = () => scriptApi({ version: "v1", auth: getAuthClient() });

const fileSchema = z.object({
  name: z.string().describe("File name without extension, e.g. 'Code', 'Sidebar'"),
  type: z.enum(["SERVER_JS", "HTML"]).default("SERVER_JS"),
  source: z.string(),
});
type InFile = z.infer<typeof fileSchema>;

const editorUrl = (id: string) => `https://script.google.com/d/${id}/edit`;

function defaultManifest(timeZone: string, extra?: Record<string, unknown>) {
  return JSON.stringify({
    timeZone, dependencies: {}, exceptionLogging: "STACKDRIVER", runtimeVersion: "V8",
    executionApi: { access: "MYSELF" }, ...extra,
  }, null, 2);
}

function summarizeFiles(files?: script_v1.Schema$File[]) {
  return (files || []).map((f) => ({ name: f.name, type: f.type, lines: (f.source || "").split("\n").length, functions: f.functionSet?.values?.map((v) => v.name) }));
}

/** Explain the most common Apps Script API failures in plain terms. */
function explain(e: any): never {
  const msg: string = e?.response?.data?.error?.message || e?.message || String(e);
  if (/User has not enabled the Apps Script API/i.test(msg)) {
    throw new Error(`${msg}\nFix: the signed-in account must turn on "Google Apps Script API" at https://script.google.com/home/usersettings, wait a minute, then retry.`);
  }
  const project = cloudProjectNumber() ? `project number ${cloudProjectNumber()}` : "the project number of this connector's OAuth client";
  if (/Requested entity was not found/i.test(msg) && /run/i.test(e?.config?.url || "")) {
    throw new Error(`${msg}\nFix: the script must (1) use the same Cloud project as this connector — in the script editor: Project Settings → Google Cloud Platform (GCP) Project → Change project → enter ${project} — and (2) have an API executable deployment (call script_deploy).`);
  }
  if (/caller does not have permission/i.test(msg)) {
    throw new Error(`${msg}\nFix: switch the script's GCP project to the same project as this connector's OAuth client (Project Settings → GCP Project → ${project}), and make sure the signed-in account owns or edits the script.`);
  }
  throw new Error(msg);
}

export function registerAppsScript(server: McpServer) {
  tool(server, "script_create_project",
    "Create an Apps Script project with code. Pass parentId (a Google Sheet/Doc/Slides/Form ID or URL) to make it a container-bound script that can use SpreadsheetApp.getActiveSpreadsheet(), custom functions and custom menus. Returns the scriptId and editor link.",
    {
      title: z.string(),
      parentId: z.string().optional().describe("Bind to this Sheet/Doc/Slides/Form (ID or URL)"),
      files: z.array(fileSchema).min(1),
      timeZone: z.string().default("Asia/Kolkata"),
      oauthScopes: z.array(z.string()).optional().describe("Optional explicit scopes for the manifest; usually leave empty so Apps Script detects them"),
    },
    async ({ title, parentId, files, timeZone, oauthScopes }) => {
      const s = gas();
      try {
        const p = await s.projects.create({ requestBody: { title, parentId: parentId ? extractId(parentId) : undefined } });
        const id = p.data.scriptId!;
        const manifest = defaultManifest(timeZone, oauthScopes?.length ? { oauthScopes } : undefined);
        const c = await s.projects.updateContent({ scriptId: id, requestBody: {
          files: [{ name: "appsscript", type: "JSON", source: manifest }, ...files.map((f) => ({ name: f.name, type: f.type, source: f.source }))],
        } });
        return { scriptId: id, title, boundTo: parentId ? extractId(parentId) : undefined, editorUrl: editorUrl(id), files: summarizeFiles(c.data.files) };
      } catch (e) { explain(e); }
    }, WRITE);

  tool(server, "script_get_content", "Read an Apps Script project's files and source code.",
    { scriptId: z.string(), includeSource: z.boolean().default(true) },
    async ({ scriptId, includeSource }) => {
      try {
        const s = gas();
        const [meta, content] = await Promise.all([s.projects.get({ scriptId }), s.projects.getContent({ scriptId })]);
        return {
          title: meta.data.title, scriptId, boundTo: meta.data.parentId, updated: meta.data.updateTime, editorUrl: editorUrl(scriptId),
          files: includeSource ? content.data.files?.map((f) => ({ name: f.name, type: f.type, source: f.source })) : summarizeFiles(content.data.files),
        };
      } catch (e) { explain(e); }
    }, READ);

  tool(server, "script_update_files",
    "Add or replace files in an Apps Script project. Files with the same name are replaced; others are kept (mode 'merge'), or the project is reset to exactly these files plus the manifest (mode 'replace'). Use deleteFiles to remove files.",
    {
      scriptId: z.string(), files: z.array(fileSchema).default([]),
      mode: z.enum(["merge", "replace"]).default("merge"),
      deleteFiles: z.array(z.string()).default([]),
      manifest: z.string().optional().describe("Full appsscript.json to replace the manifest (e.g. to add oauthScopes or webapp settings)"),
    },
    async ({ scriptId, files, mode, deleteFiles, manifest }) => {
      try {
        const s = gas();
        const cur = (await s.projects.getContent({ scriptId })).data.files || [];
        const map = new Map<string, script_v1.Schema$File>();
        for (const f of cur) if (mode === "merge" || f.type === "JSON") map.set(f.name!, { name: f.name, type: f.type, source: f.source });
        for (const n of deleteFiles) if (n !== "appsscript") map.delete(n);
        for (const f of files as InFile[]) map.set(f.name, { name: f.name, type: f.type, source: f.source });
        if (manifest) { JSON.parse(manifest); map.set("appsscript", { name: "appsscript", type: "JSON", source: manifest }); }
        const c = await s.projects.updateContent({ scriptId, requestBody: { files: [...map.values()] } });
        return { scriptId, editorUrl: editorUrl(scriptId), files: summarizeFiles(c.data.files) };
      } catch (e) { explain(e); }
    }, WRITE);

  tool(server, "script_list_projects", "List standalone Apps Script projects in Drive (bound scripts live inside their Sheet/Doc and aren't listed).",
    { nameContains: z.string().optional(), pageSize: z.number().int().min(1).max(100).default(30) },
    async ({ nameContains, pageSize }) => {
      const q = ["mimeType = 'application/vnd.google-apps.script'", "trashed = false"];
      if (nameContains) q.push(`name contains '${nameContains.replace(/'/g, "\\'")}'`);
      const r = await drive().files.list({ q: q.join(" and "), pageSize, orderBy: "modifiedTime desc", fields: "files(id,name,modifiedTime)" });
      return (r.data.files || []).map((f) => ({ scriptId: f.id, name: f.name, modified: f.modifiedTime, editorUrl: editorUrl(f.id!) }));
    }, READ);

  tool(server, "script_deploy",
    "Create a new version and a deployment of an Apps Script project. Needed before script_run (as an API executable) or to publish a web app (set webApp in the manifest first).",
    { scriptId: z.string(), description: z.string().default("Deployed by Claude"), deploymentId: z.string().optional().describe("Update this existing deployment instead of creating a new one") },
    async ({ scriptId, description, deploymentId }) => {
      try {
        const s = gas();
        const v = await s.projects.versions.create({ scriptId, requestBody: { description } });
        const versionNumber = v.data.versionNumber!;
        const config = { scriptId, versionNumber, manifestFileName: "appsscript", description };
        const d = deploymentId
          ? await s.projects.deployments.update({ scriptId, deploymentId, requestBody: { deploymentConfig: config } })
          : await s.projects.deployments.create({ scriptId, requestBody: config });
        return {
          deploymentId: d.data.deploymentId, versionNumber,
          entryPoints: d.data.entryPoints?.map((e) => ({ type: e.entryPointType, url: e.webApp?.url, access: e.executionApi?.entryPointConfig?.access || e.webApp?.entryPointConfig?.access })),
          editorUrl: editorUrl(scriptId),
        };
      } catch (e) { explain(e); }
    }, WRITE);

  tool(server, "script_run",
    "Run a function in an Apps Script project and return its result (or error and stack trace). devMode=true runs the latest saved code. Requires: the script's GCP project set to this connector's project, an API executable deployment (script_deploy), and the script authorized once in the editor. Confirm with the user before running code that sends email, edits many rows or deletes data.",
    { scriptId: z.string(), function: z.string(), parameters: z.array(z.any()).default([]), devMode: z.boolean().default(true) },
    async ({ scriptId, function: fn, parameters, devMode }) => {
      try {
        const r = await gas().scripts.run({ scriptId, requestBody: { function: fn, parameters, devMode } });
        if (r.data.error) {
          const d: any = r.data.error.details?.[0] || {};
          return { ok: false, error: d.errorMessage || r.data.error.message, errorType: d.errorType, stack: d.scriptStackTraceElements };
        }
        return { ok: true, result: (r.data.response as any)?.result ?? null };
      } catch (e) { explain(e); }
    }, WRITE);

  tool(server, "script_logs", "Recent executions of an Apps Script project (function, status, duration, start time) — use to check triggers and failures.",
    { scriptId: z.string(), functionName: z.string().optional(), pageSize: z.number().int().min(1).max(200).default(20) },
    async ({ scriptId, functionName, pageSize }) => {
      try {
        const r = await gas().processes.listScriptProcesses({ scriptId, pageSize, "scriptProcessFilter.functionName": functionName });
        return (r.data.processes || []).map((p) => ({ function: p.functionName, type: p.processType, status: p.processStatus, started: p.startTime, duration: p.duration, user: p.userAccessLevel }));
      } catch (e) { explain(e); }
    }, READ);
}
