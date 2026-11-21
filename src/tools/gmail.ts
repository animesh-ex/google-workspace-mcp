import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { gmail_v1 } from "@googleapis/gmail";
import { gmail, drive, tool, READ, WRITE, extractId } from "../util.js";

// ---------- MIME helpers ----------

interface Attachment {
  filename: string;
  mimeType: string;
  data: Buffer;
}

const EXT_MIME: Record<string, string> = {
  ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".txt": "text/plain", ".csv": "text/csv", ".html": "text/html",
  ".json": "application/json", ".zip": "application/zip",
  ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const GOOGLE_EXPORT: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ".xlsx" },
  "application/vnd.google-apps.presentation": { mime: "application/pdf", ext: ".pdf" },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: ".png" },
};

async function loadAttachments(localPaths: string[] = [], driveFileIds: string[] = []): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const p of localPaths) {
    const ext = path.extname(p).toLowerCase();
    out.push({ filename: path.basename(p), mimeType: EXT_MIME[ext] || "application/octet-stream", data: fs.readFileSync(p) });
  }
  for (const raw of driveFileIds) {
    const fileId = extractId(raw);
    const d = drive();
    const meta = await d.files.get({ fileId, fields: "name,mimeType", supportsAllDrives: true });
    const exp = GOOGLE_EXPORT[meta.data.mimeType || ""];
    if (exp) {
      const r = await d.files.export({ fileId, mimeType: exp.mime }, { responseType: "arraybuffer" });
      out.push({ filename: (meta.data.name || "file") + exp.ext, mimeType: exp.mime, data: Buffer.from(r.data as ArrayBuffer) });
    } else {
      const r = await d.files.get({ fileId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      out.push({ filename: meta.data.name || "file", mimeType: meta.data.mimeType || "application/octet-stream", data: Buffer.from(r.data as ArrayBuffer) });
    }
  }
  return out;
}

function encodeHeader(v: string): string {
  // RFC 2047 encode non-ASCII header values (e.g. subjects with emoji / accents)
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function wrap76(b64: string) {
  return b64.replace(/.{1,76}/g, "$&\r\n");
}

function buildMime(opts: {
  to?: string; cc?: string; bcc?: string; subject: string; body: string; html?: boolean;
  inReplyTo?: string; references?: string; attachments: Attachment[];
}): string {
  const headers: string[] = [];
  if (opts.to) headers.push(`To: ${opts.to}`);
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);
  headers.push(`Subject: ${encodeHeader(opts.subject)}`);
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) headers.push(`References: ${opts.references}`);
  headers.push("MIME-Version: 1.0");

  const bodyPart =
    `Content-Type: ${opts.html ? "text/html" : "text/plain"}; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    wrap76(Buffer.from(opts.body, "utf8").toString("base64"));

  if (!opts.attachments.length) return headers.join("\r\n") + "\r\n" + bodyPart;

  const boundary = "mcp_" + Math.random().toString(36).slice(2);
  let msg = headers.join("\r\n") + `\r\nContent-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
  msg += `--${boundary}\r\n${bodyPart}\r\n`;
  for (const a of opts.attachments) {
    const name = encodeHeader(a.filename).replace(/"/g, "");
    msg +=
      `--${boundary}\r\nContent-Type: ${a.mimeType}; name="${name}"\r\n` +
      `Content-Disposition: attachment; filename="${name}"\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      wrap76(a.data.toString("base64")) + "\r\n";
  }
  msg += `--${boundary}--`;
  return msg;
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64url");

// ---------- message parsing ----------

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function decode(data?: string | null) {
  return data ? Buffer.from(data, "base64url").toString("utf8") : "";
}

function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function walk(part: gmail_v1.Schema$MessagePart | undefined, acc: { text: string; html: string; attachments: any[] }) {
  if (!part) return acc;
  if (part.filename && part.body?.attachmentId) {
    acc.attachments.push({ filename: part.filename, mimeType: part.mimeType, size: part.body.size, attachmentId: part.body.attachmentId });
  } else if (part.mimeType === "text/plain" && part.body?.data && !acc.text) {
    acc.text = decode(part.body.data);
  } else if (part.mimeType === "text/html" && part.body?.data && !acc.html) {
    acc.html = decode(part.body.data);
  }
  for (const p of part.parts || []) walk(p, acc);
  return acc;
}

function summarize(msg: gmail_v1.Schema$Message, full: boolean) {
  const base: Record<string, unknown> = {
    id: msg.id, threadId: msg.threadId,
    from: header(msg, "From"), to: header(msg, "To"), cc: header(msg, "Cc") || undefined,
    subject: header(msg, "Subject"), date: header(msg, "Date"),
    labels: msg.labelIds, snippet: msg.snippet,
  };
  if (full) {
    const parsed = walk(msg.payload, { text: "", html: "", attachments: [] });
    base.body = parsed.text || stripHtml(parsed.html);
    base.attachments = parsed.attachments;
    delete base.snippet;
  }
  return base;
}

// ---------- tools ----------

const attachShape = {
  attachmentPaths: z.array(z.string()).optional().describe("Absolute local file paths to attach"),
  driveFileIds: z.array(z.string()).optional().describe("Drive file IDs/URLs to attach. Google Docs/Slides are attached as PDF, Sheets as XLSX."),
};

export function registerGmail(server: McpServer) {
  tool(server, "gmail_search",
    "Search Gmail using Gmail query syntax (e.g. 'from:alice is:unread newer_than:7d', 'has:attachment subject:invoice'). Returns message headers and snippets.",
    {
      query: z.string().default("in:inbox").describe("Gmail search query"),
      maxResults: z.number().int().min(1).max(100).default(20),
      pageToken: z.string().optional(),
    },
    async ({ query, maxResults, pageToken }) => {
      const g = gmail();
      const list = await g.users.messages.list({ userId: "me", q: query, maxResults, pageToken });
      const msgs = await Promise.all((list.data.messages || []).map((m) =>
        g.users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["From", "To", "Cc", "Subject", "Date"] })));
      return { messages: msgs.map((m) => summarize(m.data, false)), nextPageToken: list.data.nextPageToken };
    }, READ);

  tool(server, "gmail_read_message", "Read a full email: headers, plain-text body, and attachment list (with attachmentIds).",
    { messageId: z.string() },
    async ({ messageId }) => {
      const r = await gmail().users.messages.get({ userId: "me", id: messageId, format: "full" });
      return summarize(r.data, true);
    }, READ);

  tool(server, "gmail_read_thread", "Read every message in an email thread/conversation in order.",
    { threadId: z.string() },
    async ({ threadId }) => {
      const r = await gmail().users.threads.get({ userId: "me", id: threadId, format: "full" });
      return { threadId, messages: (r.data.messages || []).map((m) => summarize(m, true)) };
    }, READ);

  tool(server, "gmail_send",
    "Send a new email. Supports cc/bcc, HTML bodies, and attachments from local files or Google Drive.",
    {
      to: z.string().describe("Comma-separated recipients"),
      cc: z.string().optional(), bcc: z.string().optional(),
      subject: z.string(), body: z.string(),
      html: z.boolean().default(false).describe("Treat body as HTML"),
      ...attachShape,
    },
    async (a) => {
      const raw = buildMime({ ...a, attachments: await loadAttachments(a.attachmentPaths, a.driveFileIds) });
      const r = await gmail().users.messages.send({ userId: "me", requestBody: { raw: b64url(raw) } });
      return { sent: true, id: r.data.id, threadId: r.data.threadId };
    }, WRITE);

  tool(server, "gmail_reply",
    "Reply (or reply-all) to an existing email, keeping it in the same thread. Supports attachments.",
    {
      messageId: z.string().describe("ID of the message being replied to"),
      body: z.string(), html: z.boolean().default(false),
      replyAll: z.boolean().default(false),
      cc: z.string().optional().describe("Extra cc recipients"),
      sendNow: z.boolean().default(true).describe("false = save as draft instead of sending"),
      ...attachShape,
    },
    async (a) => {
      const g = gmail();
      const orig = (await g.users.messages.get({ userId: "me", id: a.messageId, format: "metadata",
        metadataHeaders: ["From", "To", "Cc", "Reply-To", "Subject", "Message-ID", "References"] })).data;
      const me = (await g.users.getProfile({ userId: "me" })).data.emailAddress?.toLowerCase() || "";
      const replyTo = header(orig, "Reply-To") || header(orig, "From");
      let to = replyTo;
      let cc = a.cc || "";
      if (a.replyAll) {
        const others = [header(orig, "To"), header(orig, "Cc")].join(",").split(",").map((s) => s.trim())
          .filter((s) => s && !s.toLowerCase().includes(me) && s !== replyTo);
        cc = [cc, ...others].filter(Boolean).join(", ");
      }
      // If I sent the original, reply to its recipients instead of myself.
      if (to.toLowerCase().includes(me)) to = header(orig, "To");
      const subj = header(orig, "Subject");
      const msgId = header(orig, "Message-ID");
      const raw = buildMime({
        to, cc: cc || undefined, subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`, body: a.body, html: a.html,
        inReplyTo: msgId, references: [header(orig, "References"), msgId].filter(Boolean).join(" "),
        attachments: await loadAttachments(a.attachmentPaths, a.driveFileIds),
      });
      const requestBody = { raw: b64url(raw), threadId: orig.threadId };
      if (!a.sendNow) {
        const d = await g.users.drafts.create({ userId: "me", requestBody: { message: requestBody } });
        return { draft: true, draftId: d.data.id };
      }
      const r = await g.users.messages.send({ userId: "me", requestBody });
      return { sent: true, id: r.data.id, threadId: r.data.threadId, to, cc: cc || undefined };
    }, WRITE);

  tool(server, "gmail_create_draft", "Create an email draft (not sent). Supports attachments.",
    {
      to: z.string().optional(), cc: z.string().optional(), bcc: z.string().optional(),
      subject: z.string(), body: z.string(), html: z.boolean().default(false), ...attachShape,
    },
    async (a) => {
      const raw = buildMime({ ...a, attachments: await loadAttachments(a.attachmentPaths, a.driveFileIds) });
      const r = await gmail().users.drafts.create({ userId: "me", requestBody: { message: { raw: b64url(raw) } } });
      return { draftId: r.data.id, messageId: r.data.message?.id };
    }, WRITE);

  tool(server, "gmail_list_drafts", "List email drafts.",
    { maxResults: z.number().int().min(1).max(100).default(20) },
    async ({ maxResults }) => {
      const g = gmail();
      const r = await g.users.drafts.list({ userId: "me", maxResults });
      const out = await Promise.all((r.data.drafts || []).map(async (d) => {
        const m = await g.users.drafts.get({ userId: "me", id: d.id!, format: "metadata" });
        return { draftId: d.id, ...summarize(m.data.message!, false) };
      }));
      return out;
    }, READ);

  tool(server, "gmail_send_draft", "Send an existing draft.",
    { draftId: z.string() },
    async ({ draftId }) => {
      const r = await gmail().users.drafts.send({ userId: "me", requestBody: { id: draftId } });
      return { sent: true, id: r.data.id, threadId: r.data.threadId };
    }, WRITE);

  tool(server, "gmail_download_attachment",
    "Download an email attachment to a local path, or save it straight into Google Drive.",
    {
      messageId: z.string(), attachmentId: z.string(),
      filename: z.string().describe("File name to save as (use the attachment's filename)"),
      saveDir: z.string().optional().describe("Local directory to save into"),
      saveToDriveFolderId: z.string().optional().describe("Drive folder ID to upload into ('root' for My Drive)"),
    },
    async (a) => {
      const r = await gmail().users.messages.attachments.get({ userId: "me", messageId: a.messageId, id: a.attachmentId });
      const data = Buffer.from(r.data.data || "", "base64url");
      const result: Record<string, unknown> = { bytes: data.length };
      if (a.saveDir) {
        fs.mkdirSync(a.saveDir, { recursive: true });
        const p = path.join(a.saveDir, path.basename(a.filename));
        fs.writeFileSync(p, data);
        result.localPath = p;
      }
      if (a.saveToDriveFolderId) {
        const { Readable } = await import("node:stream");
        const f = await drive().files.create({
          requestBody: { name: a.filename, parents: [extractId(a.saveToDriveFolderId)] },
          media: { mimeType: EXT_MIME[path.extname(a.filename).toLowerCase()] || "application/octet-stream", body: Readable.from(data) },
          fields: "id,name,webViewLink", supportsAllDrives: true,
        });
        result.driveFile = f.data;
      }
      if (!a.saveDir && !a.saveToDriveFolderId) throw new Error("Provide saveDir and/or saveToDriveFolderId");
      return result;
    }, WRITE);

  tool(server, "gmail_modify",
    "Organize messages: mark read/unread, star, archive, move to trash, or add/remove labels. Label names or IDs accepted.",
    {
      messageIds: z.array(z.string()).min(1),
      action: z.enum(["markRead", "markUnread", "star", "unstar", "archive", "moveToInbox", "trash", "untrash", "labels"]),
      addLabels: z.array(z.string()).optional(), removeLabels: z.array(z.string()).optional(),
    },
    async ({ messageIds, action, addLabels = [], removeLabels = [] }) => {
      const g = gmail();
      if (action === "trash" || action === "untrash") {
        for (const id of messageIds) await g.users.messages[action]({ userId: "me", id });
        return { ok: true, action, count: messageIds.length };
      }
      const presets: Record<string, [string[], string[]]> = {
        markRead: [[], ["UNREAD"]], markUnread: [["UNREAD"], []], star: [["STARRED"], []], unstar: [[], ["STARRED"]],
        archive: [[], ["INBOX"]], moveToInbox: [["INBOX"], []], labels: [addLabels, removeLabels],
      };
      let [add, remove] = presets[action];
      if (action === "labels") {
        const labels = (await g.users.labels.list({ userId: "me" })).data.labels || [];
        const resolve = (n: string) => labels.find((l) => l.id === n || l.name?.toLowerCase() === n.toLowerCase())?.id || n;
        add = add.map(resolve); remove = remove.map(resolve);
      }
      await g.users.messages.batchModify({ userId: "me", requestBody: { ids: messageIds, addLabelIds: add, removeLabelIds: remove } });
      return { ok: true, action, count: messageIds.length };
    }, WRITE);

  tool(server, "gmail_list_labels", "List Gmail labels (system and user).", {},
    async () => (await gmail().users.labels.list({ userId: "me" })).data.labels?.map((l) => ({ id: l.id, name: l.name, type: l.type })),
    READ);

  tool(server, "gmail_create_label", "Create a new Gmail label.", { name: z.string() },
    async ({ name }) => (await gmail().users.labels.create({ userId: "me", requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" } })).data,
    WRITE);
}
