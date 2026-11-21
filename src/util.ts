import { gmail as gmailApi } from "@googleapis/gmail";
import { drive as driveApi } from "@googleapis/drive";
import { docs as docsApi } from "@googleapis/docs";
import { sheets as sheetsApi } from "@googleapis/sheets";
import { slides as slidesApi } from "@googleapis/slides";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAuthClient } from "./auth.js";

export const gmail = () => gmailApi({ version: "v1", auth: getAuthClient() });
export const drive = () => driveApi({ version: "v3", auth: getAuthClient() });
export const docs = () => docsApi({ version: "v1", auth: getAuthClient() });
export const sheets = () => sheetsApi({ version: "v4", auth: getAuthClient() });
export const slides = () => slidesApi({ version: "v1", auth: getAuthClient() });

type Shape = Record<string, z.ZodType>;

/** Register a tool whose handler returns any JSON-able value (or a string). Errors become isError results. */
export function tool<S extends Shape>(
  server: McpServer,
  name: string,
  description: string,
  shape: S,
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  annotations?: ToolAnnotations,
) {
  server.registerTool(
    name,
    { description, inputSchema: shape, annotations },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (async (args: any) => {
      try {
        const out = await handler(args);
        const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
        return { content: [{ type: "text" as const, text }] };
      } catch (e: any) {
        const detail = e?.response?.data?.error?.message || e?.errors?.[0]?.message || e?.message || String(e);
        return { content: [{ type: "text" as const, text: `Error: ${detail}` }], isError: true };
      }
    }) as any,
  );
}

export const READ: ToolAnnotations = { readOnlyHint: true, openWorldHint: true };
export const WRITE: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, openWorldHint: true };
export const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, openWorldHint: true };

/** Accept either a raw ID or a full Google URL and return the file ID. */
export function extractId(idOrUrl: string): string {
  const m = idOrUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || idOrUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : idOrUrl.trim();
}

export const MIME = {
  folder: "application/vnd.google-apps.folder",
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slides: "application/vnd.google-apps.presentation",
};

/** Move a newly created Docs/Sheets/Slides file into a Drive folder. */
export async function moveToFolder(fileId: string, folderId?: string) {
  if (!folderId) return;
  const d = drive();
  const f = await d.files.get({ fileId, fields: "parents", supportsAllDrives: true });
  await d.files.update({
    fileId,
    addParents: extractId(folderId),
    removeParents: (f.data.parents || []).join(","),
    supportsAllDrives: true,
    fields: "id",
  });
}
