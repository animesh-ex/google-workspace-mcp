import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { docs_v1 } from "@googleapis/docs";
import { docs, drive, tool, READ, WRITE, DESTRUCTIVE, extractId, moveToFolder } from "../util.js";

type Req = docs_v1.Schema$Request;

// ---------- Markdown → Docs batchUpdate requests ----------

interface Span { start: number; end: number; bold?: boolean; italic?: boolean; code?: boolean; link?: string; strike?: boolean }

/** Parse inline markdown (**bold**, *italic*, `code`, ~~strike~~, [text](url)); returns plain text and spans relative to it. */
function parseInline(src: string): { text: string; spans: Span[] } {
  const spans: Span[] = [];
  let text = "";
  const re = /(\*\*|__)(.+?)\1|(\*|_)(.+?)\3|`([^`]+)`|~~(.+?)~~|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    text += src.slice(last, m.index);
    const start = text.length;
    if (m[2] !== undefined) { text += m[2]; spans.push({ start, end: text.length, bold: true }); }
    else if (m[4] !== undefined) { text += m[4]; spans.push({ start, end: text.length, italic: true }); }
    else if (m[5] !== undefined) { text += m[5]; spans.push({ start, end: text.length, code: true }); }
    else if (m[6] !== undefined) { text += m[6]; spans.push({ start, end: text.length, strike: true }); }
    else if (m[7] !== undefined) { text += m[7]; spans.push({ start, end: text.length, link: m[8] }); }
    last = re.lastIndex;
  }
  text += src.slice(last);
  return { text, spans };
}

export function markdownToRequests(md: string, at: number): Req[] {
  const lines = md.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  let full = "";
  const paraStyles: { start: number; end: number; style: string }[] = [];
  const spans: Span[] = [];
  const bulletLines: { start: number; end: number; kind: "bullet" | "number" }[] = [];
  let inCode = false;

  for (const raw of lines) {
    if (/^```/.test(raw.trim())) { inCode = !inCode; continue; }
    const lineStart = at + full.length;
    let style = "NORMAL_TEXT";
    let body = raw;
    let kind: "bullet" | "number" | undefined;
    let indent = 0;
    if (inCode) {
      full += raw + "\n";
      spans.push({ start: lineStart, end: lineStart + raw.length, code: true });
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = raw.match(/^(#{1,6})\s+(.*)$/))) { style = `HEADING_${m[1].length}`; body = m[2]; }
    else if ((m = raw.match(/^(\s*)[-*+]\s+(.*)$/))) { kind = "bullet"; indent = Math.floor(m[1].length / 2); body = m[2]; }
    else if ((m = raw.match(/^(\s*)\d+[.)]\s+(.*)$/))) { kind = "number"; indent = Math.floor(m[1].length / 2); body = m[2]; }
    else if (/^(-{3,}|\*{3,})$/.test(raw.trim())) { body = ""; }
    const parsed = parseInline(body);
    const prefix = "\t".repeat(indent);
    full += prefix + parsed.text + "\n";
    const lineEnd = at + full.length;
    if (style !== "NORMAL_TEXT") paraStyles.push({ start: lineStart, end: lineEnd, style });
    for (const s of parsed.spans) spans.push({ ...s, start: lineStart + prefix.length + s.start, end: lineStart + prefix.length + s.end });
    if (kind) bulletLines.push({ start: lineStart, end: lineEnd, kind });
  }

  const reqs: Req[] = [{ insertText: { location: { index: at }, text: full } }];
  const endAll = at + full.length;
  reqs.push({ updateParagraphStyle: { range: { startIndex: at, endIndex: endAll }, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType" } });
  reqs.push({ updateTextStyle: { range: { startIndex: at, endIndex: endAll }, textStyle: {}, fields: "bold,italic,strikethrough,link,weightedFontFamily" } });
  for (const p of paraStyles) reqs.push({ updateParagraphStyle: { range: { startIndex: p.start, endIndex: p.end }, paragraphStyle: { namedStyleType: p.style }, fields: "namedStyleType" } });
  for (const s of spans) {
    if (s.end <= s.start) continue;
    const textStyle: docs_v1.Schema$TextStyle = {};
    const fields: string[] = [];
    if (s.bold) { textStyle.bold = true; fields.push("bold"); }
    if (s.italic) { textStyle.italic = true; fields.push("italic"); }
    if (s.strike) { textStyle.strikethrough = true; fields.push("strikethrough"); }
    if (s.code) { textStyle.weightedFontFamily = { fontFamily: "Roboto Mono" }; fields.push("weightedFontFamily"); }
    if (s.link) { textStyle.link = { url: s.link }; fields.push("link"); }
    reqs.push({ updateTextStyle: { range: { startIndex: s.start, endIndex: s.end }, textStyle, fields: fields.join(",") } });
  }
  // Group consecutive bullet lines; apply last→first because bullet creation strips leading tabs (shifting later indices).
  const groups: { start: number; end: number; kind: "bullet" | "number" }[] = [];
  for (const b of bulletLines) {
    const g = groups[groups.length - 1];
    if (g && g.end === b.start && g.kind === b.kind) g.end = b.end;
    else groups.push({ ...b });
  }
  for (const g of groups.reverse()) {
    reqs.push({ createParagraphBullets: {
      range: { startIndex: g.start, endIndex: g.end },
      bulletPreset: g.kind === "number" ? "NUMBERED_DECIMAL_ALPHA_ROMAN" : "BULLET_DISC_CIRCLE_SQUARE",
    } });
  }
  return reqs;
}

async function endIndex(documentId: string): Promise<number> {
  const d = await docs().documents.get({ documentId, fields: "body(content(endIndex))" });
  const content = d.data.body?.content || [];
  return (content[content.length - 1]?.endIndex || 2) - 1;
}

function paragraphText(p?: docs_v1.Schema$Paragraph) {
  return (p?.elements || []).map((e) => e.textRun?.content || "").join("");
}

export function registerDocs(server: McpServer) {
  tool(server, "docs_create",
    "Create a Google Doc, optionally with Markdown content (headings, bold/italic, links, bullet & numbered lists, code) and in a given Drive folder.",
    { title: z.string(), markdown: z.string().optional(), folderId: z.string().optional() },
    async ({ title, markdown, folderId }) => {
      const r = await docs().documents.create({ requestBody: { title } });
      const id = r.data.documentId!;
      if (markdown?.trim()) await docs().documents.batchUpdate({ documentId: id, requestBody: { requests: markdownToRequests(markdown, 1) } });
      await moveToFolder(id, folderId);
      return { documentId: id, title, url: `https://docs.google.com/document/d/${id}/edit` };
    }, WRITE);

  tool(server, "docs_read",
    "Read a Google Doc. format 'markdown' returns readable text; 'structured' returns each paragraph/table with its start/end index (needed for precise edits).",
    { documentId: z.string(), format: z.enum(["markdown", "structured"]).default("markdown") },
    async ({ documentId, format }) => {
      const id = extractId(documentId);
      if (format === "markdown") {
        const r = await drive().files.export({ fileId: id, mimeType: "text/markdown" }, { responseType: "text" });
        return r.data as string;
      }
      const d = (await docs().documents.get({ documentId: id })).data;
      const blocks = (d.body?.content || []).flatMap((el): Record<string, unknown>[] => {
        if (el.paragraph) {
          const t = paragraphText(el.paragraph);
          return [{ start: el.startIndex, end: el.endIndex, style: el.paragraph.paragraphStyle?.namedStyleType, bullet: !!el.paragraph.bullet, text: t.replace(/\n$/, "") }];
        }
        if (el.table) {
          const rows = (el.table.tableRows || []).map((row) => (row.tableCells || []).map((c) => (c.content || []).map((x) => paragraphText(x.paragraph)).join("").trim()));
          return [{ start: el.startIndex, end: el.endIndex, table: rows }];
        }
        return [];
      });
      return { title: d.title, documentId: d.documentId, revisionId: d.revisionId, blocks };
    }, READ);

  tool(server, "docs_insert_markdown",
    "Append Markdown content to the end of a Doc, or insert it at a specific index (from docs_read structured).",
    { documentId: z.string(), markdown: z.string(), index: z.number().int().optional().describe("Omit to append at the end") },
    async ({ documentId, markdown, index }) => {
      const id = extractId(documentId);
      let at = index ?? (await endIndex(id));
      let md = markdown;
      if (index === undefined && at > 1) md = "\n" + md; // start a fresh paragraph when appending
      const reqs = markdownToRequests(md, at);
      await docs().documents.batchUpdate({ documentId: id, requestBody: { requests: reqs } });
      return { ok: true, insertedAt: at };
    }, WRITE);

  tool(server, "docs_replace_text", "Find and replace text throughout a Doc (e.g. fill {{placeholders}} in a template).",
    { documentId: z.string(), replacements: z.array(z.object({ find: z.string(), replace: z.string(), matchCase: z.boolean().default(true) })).min(1) },
    async ({ documentId, replacements }) => {
      const r = await docs().documents.batchUpdate({ documentId: extractId(documentId), requestBody: {
        requests: replacements.map((x) => ({ replaceAllText: { containsText: { text: x.find, matchCase: x.matchCase }, replaceText: x.replace } })),
      } });
      return (r.data.replies || []).map((rep, i) => ({ find: replacements[i].find, occurrencesChanged: rep.replaceAllText?.occurrencesChanged || 0 }));
    }, WRITE);

  tool(server, "docs_delete_range", "Delete content between two indices (get indices from docs_read structured).",
    { documentId: z.string(), startIndex: z.number().int(), endIndex: z.number().int() },
    async ({ documentId, startIndex, endIndex }) => {
      await docs().documents.batchUpdate({ documentId: extractId(documentId), requestBody: { requests: [{ deleteContentRange: { range: { startIndex, endIndex } } }] } });
      return { ok: true };
    }, DESTRUCTIVE);

  tool(server, "docs_insert_table", "Insert a table filled with data (first row = header, bolded) at the end of a Doc or at an index.",
    { documentId: z.string(), rows: z.array(z.array(z.string())).min(1), index: z.number().int().optional() },
    async ({ documentId, rows, index }) => {
      const id = extractId(documentId);
      const cols = Math.max(...rows.map((r) => r.length));
      const at = index ?? (await endIndex(id));
      await docs().documents.batchUpdate({ documentId: id, requestBody: { requests: [
        { insertTable: { rows: rows.length, columns: cols, location: { index: at } } },
      ] } });
      // Find the table we just inserted (first table starting at/after `at`) and fill cells back-to-front.
      const d = (await docs().documents.get({ documentId: id })).data;
      const table = (d.body?.content || []).find((el) => el.table && (el.startIndex || 0) >= at);
      if (!table?.table) throw new Error("Inserted table not found");
      const reqs: Req[] = [];
      const cells: { idx: number; text: string; header: boolean }[] = [];
      table.table.tableRows!.forEach((row, ri) => row.tableCells!.forEach((cell, ci) => {
        const text = rows[ri]?.[ci] ?? "";
        if (text) cells.push({ idx: cell.content![0].startIndex!, text, header: ri === 0 });
      }));
      for (const c of cells.sort((a, b) => b.idx - a.idx)) {
        reqs.push({ insertText: { location: { index: c.idx }, text: c.text } });
        if (c.header) reqs.push({ updateTextStyle: { range: { startIndex: c.idx, endIndex: c.idx + c.text.length }, textStyle: { bold: true }, fields: "bold" } });
      }
      if (reqs.length) await docs().documents.batchUpdate({ documentId: id, requestBody: { requests: reqs } });
      return { ok: true, rows: rows.length, columns: cols };
    }, WRITE);

  tool(server, "docs_insert_image", "Insert an image from a public URL into a Doc.",
    { documentId: z.string(), imageUrl: z.string(), index: z.number().int().optional(), widthPt: z.number().optional() },
    async ({ documentId, imageUrl, index, widthPt }) => {
      const id = extractId(documentId);
      const at = index ?? (await endIndex(id));
      await docs().documents.batchUpdate({ documentId: id, requestBody: { requests: [{ insertInlineImage: {
        uri: imageUrl, location: { index: at }, objectSize: widthPt ? { width: { magnitude: widthPt, unit: "PT" } } : undefined,
      } }] } });
      return { ok: true };
    }, WRITE);

  tool(server, "docs_batch_update", "Advanced: send raw Google Docs API batchUpdate requests (for styling, page breaks, headers, etc.).",
    { documentId: z.string(), requests: z.array(z.record(z.string(), z.any())).min(1) },
    async ({ documentId, requests }) => (await docs().documents.batchUpdate({ documentId: extractId(documentId), requestBody: { requests } })).data.replies,
    WRITE);
}
