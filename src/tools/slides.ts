import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { slides_v1 } from "@googleapis/slides";
import { slides, tool, READ, WRITE, DESTRUCTIVE, extractId, moveToFolder } from "../util.js";

type Req = slides_v1.Schema$Request;
type Page = slides_v1.Schema$Page;

const LAYOUTS = ["TITLE", "TITLE_AND_BODY", "TITLE_AND_TWO_COLUMNS", "TITLE_ONLY", "SECTION_HEADER", "SECTION_TITLE_AND_DESCRIPTION", "ONE_COLUMN_TEXT", "MAIN_POINT", "BIG_NUMBER", "CAPTION_ONLY", "BLANK"] as const;

const slideSpec = z.object({
  layout: z.enum(LAYOUTS).default("TITLE_AND_BODY"),
  title: z.string().optional(),
  body: z.union([z.string(), z.array(z.string())]).optional().describe("String = paragraph text; array = bullet points (prefix with two spaces per nesting level)"),
  body2: z.union([z.string(), z.array(z.string())]).optional().describe("Second column for TITLE_AND_TWO_COLUMNS"),
  notes: z.string().optional().describe("Speaker notes"),
  imageUrl: z.string().optional().describe("Public image URL to place on the slide"),
});
type SlideSpec = z.infer<typeof slideSpec>;

const EMU = 12700; // per point
const uid = (p: string) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function shapeText(s?: slides_v1.Schema$Shape) {
  return (s?.text?.textElements || []).map((t) => t.textRun?.content || "").join("").trim();
}

function placeholders(page: Page) {
  const els = page.pageElements || [];
  const of = (...types: string[]) => els.filter((e) => types.includes(e.shape?.placeholder?.type || ""));
  return { title: of("TITLE", "CENTERED_TITLE")[0], bodies: of("BODY", "SUBTITLE") };
}

function textRequests(objectId: string, content: string | string[]): Req[] {
  if (typeof content === "string") return [{ insertText: { objectId, text: content } }];
  const lines = content.map((l) => {
    const m = l.match(/^(\s*)(.*)$/)!;
    return "\t".repeat(Math.floor(m[1].length / 2)) + m[2].replace(/^[-*•]\s+/, "");
  });
  return [
    { insertText: { objectId, text: lines.join("\n") } },
    { createParagraphBullets: { objectId, textRange: { type: "ALL" }, bulletPreset: "BULLET_DISC_CIRCLE_SQUARE" } },
  ];
}

/** Create slides from specs and fill title/body/notes/images. */
async function addSlides(presentationId: string, specs: SlideSpec[], insertionIndex?: number) {
  const s = slides();
  const ids = specs.map(() => uid("slide"));
  await s.presentations.batchUpdate({ presentationId, requestBody: { requests: specs.map((sp, i) => ({
    createSlide: { objectId: ids[i], slideLayoutReference: { predefinedLayout: sp.layout }, insertionIndex: insertionIndex !== undefined ? insertionIndex + i : undefined },
  })) } });

  const pres = (await s.presentations.get({ presentationId })).data;
  const W = (pres.pageSize?.width?.magnitude || 9144000) / EMU;
  const H = (pres.pageSize?.height?.magnitude || 5143500) / EMU;
  const reqs: Req[] = [];
  specs.forEach((sp, i) => {
    const page = pres.slides!.find((p) => p.objectId === ids[i])!;
    const ph = placeholders(page);
    if (sp.title) {
      if (ph.title) reqs.push({ insertText: { objectId: ph.title.objectId!, text: sp.title } });
      else {
        const tb = uid("title");
        reqs.push({ createShape: { objectId: tb, shapeType: "TEXT_BOX", elementProperties: box(ids[i], 30, 20, W - 60, 60) } },
          { insertText: { objectId: tb, text: sp.title } },
          { updateTextStyle: { objectId: tb, style: { fontSize: { magnitude: 28, unit: "PT" }, bold: true }, fields: "fontSize,bold" } });
      }
    }
    [sp.body, sp.body2].forEach((content, bi) => {
      if (!content || (Array.isArray(content) && !content.length)) return;
      const target = ph.bodies[bi];
      if (target) reqs.push(...textRequests(target.objectId!, content));
      else {
        const tb = uid("body");
        const x = bi === 0 ? 30 : W / 2 + 10;
        const w = sp.body2 ? W / 2 - 40 : W - 60;
        reqs.push({ createShape: { objectId: tb, shapeType: "TEXT_BOX", elementProperties: box(ids[i], x, 90, w, H - 120) } }, ...textRequests(tb, content));
      }
    });
    // Remove empty placeholders so they don't show "Click to add text" boxes.
    const used = new Set([sp.title && ph.title?.objectId, ...(sp.body ? [ph.bodies[0]?.objectId] : []), ...(sp.body2 ? [ph.bodies[1]?.objectId] : [])]);
    for (const el of [ph.title, ...ph.bodies]) if (el && !used.has(el.objectId)) reqs.push({ deleteObject: { objectId: el.objectId! } });
    const notesId = page.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
    if (sp.notes && notesId) reqs.push({ insertText: { objectId: notesId, text: sp.notes } });
    if (sp.imageUrl) {
      const hasText = !!(sp.body || sp.body2);
      reqs.push({ createImage: { url: sp.imageUrl, elementProperties: hasText ? box(ids[i], W * 0.55, 90, W * 0.4, H - 120) : box(ids[i], W * 0.15, 80, W * 0.7, H - 100) } });
    }
  });
  if (reqs.length) await s.presentations.batchUpdate({ presentationId, requestBody: { requests: reqs } });
  return ids;
}

function box(pageObjectId: string, xPt: number, yPt: number, wPt: number, hPt: number): slides_v1.Schema$PageElementProperties {
  return {
    pageObjectId,
    size: { width: { magnitude: wPt * EMU, unit: "EMU" }, height: { magnitude: hPt * EMU, unit: "EMU" } },
    transform: { scaleX: 1, scaleY: 1, translateX: xPt * EMU, translateY: yPt * EMU, unit: "EMU" },
  };
}

async function resolveSlideId(presentationId: string, slide: string | number) {
  if (typeof slide === "string") return slide;
  const p = (await slides().presentations.get({ presentationId, fields: "slides(objectId)" })).data;
  const id = p.slides?.[slide - 1]?.objectId;
  if (!id) throw new Error(`Slide #${slide} not found (deck has ${p.slides?.length || 0} slides)`);
  return id;
}

const slideRef = z.union([z.string(), z.number().int().min(1)]).describe("Slide objectId, or 1-based slide number");

export function registerSlides(server: McpServer) {
  tool(server, "slides_create",
    "Create a Google Slides presentation, optionally with slides (layout, title, bullets, two columns, speaker notes, images).",
    { title: z.string(), slides: z.array(slideSpec).optional(), folderId: z.string().optional() },
    async ({ title, slides: specs, folderId }) => {
      const s = slides();
      const p = (await s.presentations.create({ requestBody: { title } })).data;
      const id = p.presentationId!;
      if (specs?.length) {
        const defaultSlide = p.slides?.[0]?.objectId;
        await addSlides(id, specs);
        if (defaultSlide) await s.presentations.batchUpdate({ presentationId: id, requestBody: { requests: [{ deleteObject: { objectId: defaultSlide } }] } });
      }
      await moveToFolder(id, folderId);
      return { presentationId: id, url: `https://docs.google.com/presentation/d/${id}/edit`, slides: specs?.length || 1 };
    }, WRITE);

  tool(server, "slides_read", "Read a presentation: every slide's text (by placeholder), tables, image count, and speaker notes.",
    { presentationId: z.string() },
    async ({ presentationId }) => {
      const p = (await slides().presentations.get({ presentationId: extractId(presentationId) })).data;
      return {
        title: p.title, presentationId: p.presentationId, slideCount: p.slides?.length || 0,
        slides: (p.slides || []).map((sl, i) => {
          const texts: { objectId: string; role: string; text: string }[] = [];
          const tables: string[][][] = [];
          let images = 0;
          const visit = (els: slides_v1.Schema$PageElement[] = []) => els.forEach((el) => {
            if (el.shape) { const t = shapeText(el.shape); if (t) texts.push({ objectId: el.objectId!, role: el.shape.placeholder?.type || el.shape.shapeType || "SHAPE", text: t }); }
            if (el.table) tables.push((el.table.tableRows || []).map((r) => (r.tableCells || []).map((c) => (c.text?.textElements || []).map((t) => t.textRun?.content || "").join("").trim())));
            if (el.image) images++;
            if (el.elementGroup) visit(el.elementGroup.children || []);
          });
          visit(sl.pageElements || []);
          const notesId = sl.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
          const notesShape = sl.slideProperties?.notesPage?.pageElements?.find((e) => e.objectId === notesId)?.shape;
          return { number: i + 1, objectId: sl.objectId, texts, tables: tables.length ? tables : undefined, images, notes: shapeText(notesShape) || undefined };
        }),
      };
    }, READ);

  tool(server, "slides_add_slides", "Add one or more slides to an existing presentation (at the end or at a 0-based position).",
    { presentationId: z.string(), slides: z.array(slideSpec).min(1), insertionIndex: z.number().int().min(0).optional() },
    async ({ presentationId, slides: specs, insertionIndex }) => ({ slideIds: await addSlides(extractId(presentationId), specs, insertionIndex) }),
    WRITE);

  tool(server, "slides_replace_text", "Find and replace text across all slides (or only some), e.g. fill {{placeholders}} in a template deck.",
    {
      presentationId: z.string(),
      replacements: z.array(z.object({ find: z.string(), replace: z.string(), matchCase: z.boolean().default(true) })).min(1),
      onlySlideIds: z.array(z.string()).optional(),
    },
    async ({ presentationId, replacements, onlySlideIds }) => {
      const r = await slides().presentations.batchUpdate({ presentationId: extractId(presentationId), requestBody: {
        requests: replacements.map((x) => ({ replaceAllText: { containsText: { text: x.find, matchCase: x.matchCase }, replaceText: x.replace, pageObjectIds: onlySlideIds } })),
      } });
      return (r.data.replies || []).map((rep, i) => ({ find: replacements[i].find, occurrencesChanged: rep.replaceAllText?.occurrencesChanged || 0 }));
    }, WRITE);

  tool(server, "slides_set_text", "Replace all text inside one shape/text box (objectId from slides_read).",
    { presentationId: z.string(), objectId: z.string(), text: z.union([z.string(), z.array(z.string())]).describe("Array = bullets") },
    async ({ presentationId, objectId, text }) => {
      await slides().presentations.batchUpdate({ presentationId: extractId(presentationId), requestBody: { requests: [
        { deleteText: { objectId, textRange: { type: "ALL" } } }, ...textRequests(objectId, text),
      ] } }).catch(async (e) => {
        // deleteText fails on an empty shape; retry without it.
        if (!/empty|out of range|startIndex/i.test(String(e?.message))) throw e;
        await slides().presentations.batchUpdate({ presentationId: extractId(presentationId), requestBody: { requests: textRequests(objectId, text) } });
      });
      return { ok: true };
    }, WRITE);

  tool(server, "slides_set_notes", "Set the speaker notes of a slide.",
    { presentationId: z.string(), slide: slideRef, notes: z.string() },
    async ({ presentationId, slide, notes }) => {
      const id = extractId(presentationId);
      const slideId = await resolveSlideId(id, slide);
      const page = (await slides().presentations.pages.get({ presentationId: id, pageObjectId: slideId })).data;
      const notesId = page.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId!;
      const existing = shapeText(page.slideProperties?.notesPage?.pageElements?.find((e) => e.objectId === notesId)?.shape);
      const requests: Req[] = [];
      if (existing) requests.push({ deleteText: { objectId: notesId, textRange: { type: "ALL" } } });
      requests.push({ insertText: { objectId: notesId, text: notes } });
      await slides().presentations.batchUpdate({ presentationId: id, requestBody: { requests } });
      return { ok: true };
    }, WRITE);

  tool(server, "slides_add_image", "Place an image (public URL) on a slide. Position/size in points (deck is usually 720×405 pt).",
    { presentationId: z.string(), slide: slideRef, imageUrl: z.string(), x: z.number().default(160), y: z.number().default(80), width: z.number().default(400), height: z.number().default(260) },
    async (a) => {
      const id = extractId(a.presentationId);
      const slideId = await resolveSlideId(id, a.slide);
      const r = await slides().presentations.batchUpdate({ presentationId: id, requestBody: { requests: [
        { createImage: { url: a.imageUrl, elementProperties: box(slideId, a.x, a.y, a.width, a.height) } },
      ] } });
      return { objectId: r.data.replies?.[0]?.createImage?.objectId };
    }, WRITE);

  tool(server, "slides_add_text_box", "Add a text box to a slide. Position/size in points.",
    {
      presentationId: z.string(), slide: slideRef, text: z.string(),
      x: z.number().default(40), y: z.number().default(40), width: z.number().default(640), height: z.number().default(60),
      fontSize: z.number().optional(), bold: z.boolean().optional(),
    },
    async (a) => {
      const id = extractId(a.presentationId);
      const slideId = await resolveSlideId(id, a.slide);
      const objectId = uid("tb");
      const requests: Req[] = [
        { createShape: { objectId, shapeType: "TEXT_BOX", elementProperties: box(slideId, a.x, a.y, a.width, a.height) } },
        { insertText: { objectId, text: a.text } },
      ];
      if (a.fontSize || a.bold !== undefined) {
        requests.push({ updateTextStyle: { objectId, style: { fontSize: a.fontSize ? { magnitude: a.fontSize, unit: "PT" } : undefined, bold: a.bold },
          fields: [a.fontSize && "fontSize", a.bold !== undefined && "bold"].filter(Boolean).join(",") } });
      }
      await slides().presentations.batchUpdate({ presentationId: id, requestBody: { requests } });
      return { objectId };
    }, WRITE);

  tool(server, "slides_manage_slide", "Delete, duplicate, or move a slide.",
    { presentationId: z.string(), slide: slideRef, action: z.enum(["delete", "duplicate", "move"]), toIndex: z.number().int().min(0).optional().describe("0-based target for move") },
    async ({ presentationId, slide, action, toIndex }) => {
      const id = extractId(presentationId);
      const slideId = await resolveSlideId(id, slide);
      const request: Req = action === "delete" ? { deleteObject: { objectId: slideId } }
        : action === "duplicate" ? { duplicateObject: { objectId: slideId } }
        : { updateSlidesPosition: { slideObjectIds: [slideId], insertionIndex: toIndex ?? 0 } };
      const r = await slides().presentations.batchUpdate({ presentationId: id, requestBody: { requests: [request] } });
      return { ok: true, newSlideId: r.data.replies?.[0]?.duplicateObject?.objectId };
    }, DESTRUCTIVE);

  tool(server, "slides_get_thumbnail", "Get a PNG thumbnail URL of a slide (to visually check it).",
    { presentationId: z.string(), slide: slideRef, size: z.enum(["SMALL", "MEDIUM", "LARGE"]).default("MEDIUM") },
    async ({ presentationId, slide, size }) => {
      const id = extractId(presentationId);
      const slideId = await resolveSlideId(id, slide);
      return (await slides().presentations.pages.getThumbnail({ presentationId: id, pageObjectId: slideId, "thumbnailProperties.thumbnailSize": size })).data;
    }, READ);

  tool(server, "slides_batch_update", "Advanced: send raw Google Slides API batchUpdate requests (shapes, tables, styling, etc.).",
    { presentationId: z.string(), requests: z.array(z.record(z.string(), z.any())).min(1) },
    async ({ presentationId, requests }) => (await slides().presentations.batchUpdate({ presentationId: extractId(presentationId), requestBody: { requests } })).data.replies,
    WRITE);
}
