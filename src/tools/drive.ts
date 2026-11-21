import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { drive, tool, READ, WRITE, DESTRUCTIVE, extractId, MIME } from "../util.js";

const FILE_FIELDS = "id,name,mimeType,size,modifiedTime,createdTime,parents,webViewLink,owners(emailAddress),shared,starred,trashed";

const UPLOAD_CONVERT: Record<string, string> = {
  ".docx": MIME.doc, ".doc": MIME.doc, ".txt": MIME.doc, ".rtf": MIME.doc, ".odt": MIME.doc, ".md": MIME.doc, ".html": MIME.doc,
  ".xlsx": MIME.sheet, ".xls": MIME.sheet, ".csv": MIME.sheet, ".ods": MIME.sheet,
  ".pptx": MIME.slides, ".ppt": MIME.slides, ".odp": MIME.slides,
};

const EXPORT_FORMATS: Record<string, Record<string, string>> = {
  [MIME.doc]: { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", md: "text/markdown", html: "text/html" },
  [MIME.sheet]: { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv" },
  [MIME.slides]: { pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", txt: "text/plain" },
};

const TYPE_FILTER: Record<string, string> = {
  folder: MIME.folder, doc: MIME.doc, sheet: MIME.sheet, slides: MIME.slides, pdf: "application/pdf",
};

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

export function registerDrive(server: McpServer) {
  tool(server, "drive_search",
    "Search Google Drive files by name/full text, type, or folder. Optionally pass a raw Drive 'q' query.",
    {
      name: z.string().optional().describe("Substring of the file name"),
      fullText: z.string().optional().describe("Search inside file contents"),
      type: z.enum(["folder", "doc", "sheet", "slides", "pdf", "any"]).default("any"),
      folderId: z.string().optional().describe("Only files directly inside this folder"),
      rawQuery: z.string().optional().describe("Raw Drive API query, overrides other filters"),
      includeTrashed: z.boolean().default(false),
      orderBy: z.string().default("modifiedTime desc"),
      pageSize: z.number().int().min(1).max(200).default(30),
      pageToken: z.string().optional(),
    },
    async (a) => {
      let q = a.rawQuery;
      if (!q) {
        const parts: string[] = [];
        if (a.name) parts.push(`name contains '${esc(a.name)}'`);
        if (a.fullText) parts.push(`fullText contains '${esc(a.fullText)}'`);
        if (a.type !== "any") parts.push(`mimeType = '${TYPE_FILTER[a.type]}'`);
        if (a.folderId) parts.push(`'${extractId(a.folderId)}' in parents`);
        if (!a.includeTrashed) parts.push("trashed = false");
        q = parts.join(" and ");
      }
      const r = await drive().files.list({
        q, pageSize: a.pageSize, pageToken: a.pageToken, orderBy: a.fullText ? undefined : a.orderBy,
        fields: `nextPageToken,files(${FILE_FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      return r.data;
    }, READ);

  tool(server, "drive_list_folder", "List the contents of a Drive folder ('root' = My Drive).",
    { folderId: z.string().default("root"), pageSize: z.number().int().min(1).max(200).default(100), pageToken: z.string().optional() },
    async ({ folderId, pageSize, pageToken }) => {
      const r = await drive().files.list({
        q: `'${extractId(folderId)}' in parents and trashed = false`, pageSize, pageToken,
        orderBy: "folder,name", fields: `nextPageToken,files(${FILE_FIELDS})`, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      return r.data;
    }, READ);

  tool(server, "drive_get_file", "Get metadata for a Drive file (ID or URL).",
    { fileId: z.string() },
    async ({ fileId }) => (await drive().files.get({ fileId: extractId(fileId), fields: FILE_FIELDS + ",description,permissions(id,type,role,emailAddress,domain)", supportsAllDrives: true })).data,
    READ);

  tool(server, "drive_read_file_text",
    "Read a file's content as text: Google Docs (markdown), Sheets (CSV of first tab), Slides (text), or plain text/CSV/JSON files.",
    { fileId: z.string(), maxChars: z.number().int().default(100000) },
    async ({ fileId, maxChars }) => {
      const d = drive();
      const id = extractId(fileId);
      const meta = (await d.files.get({ fileId: id, fields: "name,mimeType", supportsAllDrives: true })).data;
      let text: string;
      const exportAs: Record<string, string> = { [MIME.doc]: "text/markdown", [MIME.sheet]: "text/csv", [MIME.slides]: "text/plain" };
      if (exportAs[meta.mimeType!]) {
        text = (await d.files.export({ fileId: id, mimeType: exportAs[meta.mimeType!] }, { responseType: "text" })).data as string;
      } else if (/^text\/|json|xml|csv|javascript/.test(meta.mimeType || "")) {
        text = (await d.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "text" })).data as string;
      } else {
        throw new Error(`Can't read ${meta.mimeType} as text. Use drive_download_file instead.`);
      }
      return `# ${meta.name} (${meta.mimeType})\n\n` + (text.length > maxChars ? text.slice(0, maxChars) + "\n…[truncated]" : text);
    }, READ);

  tool(server, "drive_create_folder", "Create a folder in Drive.",
    { name: z.string(), parentId: z.string().default("root") },
    async ({ name, parentId }) => (await drive().files.create({
      requestBody: { name, mimeType: MIME.folder, parents: [extractId(parentId)] }, fields: "id,name,webViewLink", supportsAllDrives: true,
    })).data, WRITE);

  tool(server, "drive_upload_file",
    "Upload a local file to Drive. Set convert=true to turn .docx/.xlsx/.csv/.pptx/.txt into native Google Docs/Sheets/Slides.",
    { localPath: z.string(), folderId: z.string().default("root"), name: z.string().optional(), convert: z.boolean().default(false) },
    async ({ localPath, folderId, name, convert }) => {
      const ext = path.extname(localPath).toLowerCase();
      const target = convert ? UPLOAD_CONVERT[ext] : undefined;
      if (convert && !target) throw new Error(`Don't know how to convert ${ext} to a Google format`);
      const r = await drive().files.create({
        requestBody: { name: name || (target ? path.basename(localPath, ext) : path.basename(localPath)), parents: [extractId(folderId)], mimeType: target },
        media: { body: fs.createReadStream(localPath) },
        fields: "id,name,mimeType,webViewLink", supportsAllDrives: true,
      });
      return r.data;
    }, WRITE);

  tool(server, "drive_download_file",
    "Download a Drive file to a local folder. Google Docs/Sheets/Slides are exported (format: pdf, docx, xlsx, csv, pptx, txt, md, html).",
    { fileId: z.string(), saveDir: z.string(), format: z.string().optional().describe("Export format for Google-native files (default pdf)") },
    async ({ fileId, saveDir, format }) => {
      const d = drive();
      const id = extractId(fileId);
      const meta = (await d.files.get({ fileId: id, fields: "name,mimeType", supportsAllDrives: true })).data;
      fs.mkdirSync(saveDir, { recursive: true });
      let data: ArrayBuffer;
      let filename = meta.name!.replace(/[<>:"/\\|?*]/g, "_");
      const formats = EXPORT_FORMATS[meta.mimeType!];
      if (formats) {
        const f = format || "pdf";
        if (!formats[f]) throw new Error(`Format '${f}' not available. Options: ${Object.keys(formats).join(", ")}`);
        data = (await d.files.export({ fileId: id, mimeType: formats[f] }, { responseType: "arraybuffer" })).data as ArrayBuffer;
        filename += "." + f;
      } else {
        data = (await d.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" })).data as ArrayBuffer;
      }
      const p = path.join(saveDir, filename);
      fs.writeFileSync(p, Buffer.from(data));
      return { localPath: p, bytes: data.byteLength };
    }, WRITE);

  tool(server, "drive_move", "Move a file or folder into another folder.",
    { fileId: z.string(), newParentId: z.string() },
    async ({ fileId, newParentId }) => {
      const d = drive();
      const id = extractId(fileId);
      const f = await d.files.get({ fileId: id, fields: "parents", supportsAllDrives: true });
      return (await d.files.update({
        fileId: id, addParents: extractId(newParentId), removeParents: (f.data.parents || []).join(","),
        fields: "id,name,parents,webViewLink", supportsAllDrives: true,
      })).data;
    }, WRITE);

  tool(server, "drive_update_metadata", "Rename a file, change its description, or star/unstar it.",
    { fileId: z.string(), name: z.string().optional(), description: z.string().optional(), starred: z.boolean().optional() },
    async ({ fileId, ...body }) => (await drive().files.update({
      fileId: extractId(fileId), requestBody: body, fields: "id,name,description,starred,webViewLink", supportsAllDrives: true,
    })).data, WRITE);

  tool(server, "drive_copy", "Make a copy of a file (e.g. duplicate a template doc/sheet/deck).",
    { fileId: z.string(), name: z.string().optional(), folderId: z.string().optional() },
    async ({ fileId, name, folderId }) => (await drive().files.copy({
      fileId: extractId(fileId), requestBody: { name, parents: folderId ? [extractId(folderId)] : undefined },
      fields: "id,name,mimeType,webViewLink", supportsAllDrives: true,
    })).data, WRITE);

  tool(server, "drive_trash", "Move a file/folder to the Drive trash (recoverable for 30 days), or restore it.",
    { fileId: z.string(), restore: z.boolean().default(false) },
    async ({ fileId, restore }) => (await drive().files.update({
      fileId: extractId(fileId), requestBody: { trashed: !restore }, fields: "id,name,trashed", supportsAllDrives: true,
    })).data, DESTRUCTIVE);

  tool(server, "drive_share",
    "Share a file/folder (Doc, Sheet, Slides, anything) with a person, group, domain, or anyone with the link.",
    {
      fileId: z.string(),
      role: z.enum(["reader", "commenter", "writer", "owner"]).default("reader"),
      type: z.enum(["user", "group", "domain", "anyone"]).default("user"),
      emails: z.array(z.string()).optional().describe("For type user/group"),
      domain: z.string().optional().describe("For type domain"),
      notify: z.boolean().default(true).describe("Send Google's share notification email"),
      message: z.string().optional().describe("Message included in the notification email"),
    },
    async (a) => {
      const d = drive();
      const id = extractId(a.fileId);
      const targets = a.type === "user" || a.type === "group" ? a.emails || [] : [undefined];
      if (!targets.length) throw new Error("Provide emails for user/group sharing");
      const results = [];
      for (const email of targets) {
        const r = await d.permissions.create({
          fileId: id, supportsAllDrives: true,
          sendNotificationEmail: a.type === "user" || a.type === "group" ? a.notify : undefined,
          emailMessage: a.notify ? a.message : undefined,
          transferOwnership: a.role === "owner" ? true : undefined,
          requestBody: { role: a.role, type: a.type, emailAddress: email, domain: a.domain },
          fields: "id,type,role,emailAddress,domain",
        });
        results.push(r.data);
      }
      const link = (await d.files.get({ fileId: id, fields: "webViewLink", supportsAllDrives: true })).data.webViewLink;
      return { link, permissions: results };
    }, WRITE);

  tool(server, "drive_list_permissions", "List who a file is shared with.",
    { fileId: z.string() },
    async ({ fileId }) => (await drive().permissions.list({
      fileId: extractId(fileId), fields: "permissions(id,type,role,emailAddress,domain,displayName)", supportsAllDrives: true,
    })).data.permissions, READ);

  tool(server, "drive_update_permission", "Change a collaborator's role, or remove their access (role 'remove').",
    { fileId: z.string(), permissionId: z.string(), role: z.enum(["reader", "commenter", "writer", "remove"]) },
    async ({ fileId, permissionId, role }) => {
      const d = drive();
      if (role === "remove") {
        await d.permissions.delete({ fileId: extractId(fileId), permissionId, supportsAllDrives: true });
        return { removed: permissionId };
      }
      return (await d.permissions.update({ fileId: extractId(fileId), permissionId, requestBody: { role }, supportsAllDrives: true, fields: "id,role" })).data;
    }, DESTRUCTIVE);

  tool(server, "drive_about", "Show the signed-in Google account and Drive storage usage.", {},
    async () => (await drive().about.get({ fields: "user(displayName,emailAddress),storageQuota" })).data, READ);
}
