import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { sheets, tool, READ, WRITE, DESTRUCTIVE, extractId, moveToFolder } from "../util.js";

const cell = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const grid = z.array(z.array(cell));

function colLetter(n: number) {
  let s = "";
  for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

async function sheetIdByName(spreadsheetId: string, title: string): Promise<number> {
  const r = await sheets().spreadsheets.get({ spreadsheetId, fields: "sheets(properties(sheetId,title))" });
  const s = r.data.sheets?.find((x) => x.properties?.title === title);
  if (!s) throw new Error(`Tab '${title}' not found`);
  return s.properties!.sheetId!;
}

function hexToColor(hex: string) {
  const h = hex.replace("#", "");
  return { red: parseInt(h.slice(0, 2), 16) / 255, green: parseInt(h.slice(2, 4), 16) / 255, blue: parseInt(h.slice(4, 6), 16) / 255 };
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return null;
  const s = v.replace(/[,$€£₹%\s]/g, "");
  if (!s || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) return null;
  return Number(s);
}

export function registerSheets(server: McpServer) {
  tool(server, "sheets_create", "Create a Google Sheet with optional tab names and initial data for the first tab.",
    { title: z.string(), tabs: z.array(z.string()).optional(), data: grid.optional().describe("Rows for the first tab; first row is typically headers"), folderId: z.string().optional() },
    async ({ title, tabs, data, folderId }) => {
      const s = sheets();
      const r = await s.spreadsheets.create({ requestBody: {
        properties: { title },
        sheets: (tabs?.length ? tabs : ["Sheet1"]).map((t) => ({ properties: { title: t } })),
      } });
      const id = r.data.spreadsheetId!;
      const firstTab = r.data.sheets![0].properties!;
      if (data?.length) {
        await s.spreadsheets.values.update({ spreadsheetId: id, range: `'${firstTab.title}'!A1`, valueInputOption: "USER_ENTERED", requestBody: { values: data } });
        await s.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [
          { repeatCell: { range: { sheetId: firstTab.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
          { updateSheetProperties: { properties: { sheetId: firstTab.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } },
          { autoResizeDimensions: { dimensions: { sheetId: firstTab.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: Math.max(...data.map((r) => r.length)) } } },
        ] } });
      }
      await moveToFolder(id, folderId);
      return { spreadsheetId: id, url: r.data.spreadsheetUrl };
    }, WRITE);

  tool(server, "sheets_get_info", "List a spreadsheet's tabs with their sizes, plus title and URL.",
    { spreadsheetId: z.string() },
    async ({ spreadsheetId }) => {
      const r = await sheets().spreadsheets.get({ spreadsheetId: extractId(spreadsheetId), fields: "properties(title,locale,timeZone),spreadsheetUrl,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount,frozenRowCount)),charts(chartId))" });
      return {
        title: r.data.properties?.title, url: r.data.spreadsheetUrl,
        tabs: r.data.sheets?.map((s) => ({ ...s.properties, charts: s.charts?.length || 0 })),
      };
    }, READ);

  tool(server, "sheets_read", "Read values from a range in A1 notation, e.g. 'Sheet1!A1:D50' or just 'Sheet1' for the whole tab.",
    { spreadsheetId: z.string(), range: z.string(), valueRender: z.enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"]).default("FORMATTED_VALUE") },
    async ({ spreadsheetId, range, valueRender }) => {
      const r = await sheets().spreadsheets.values.get({ spreadsheetId: extractId(spreadsheetId), range, valueRenderOption: valueRender });
      return { range: r.data.range, rows: r.data.values?.length || 0, values: r.data.values || [] };
    }, READ);

  tool(server, "sheets_write", "Write values to a range (starting cell like 'Sheet1!B2' is enough). Formulas like '=SUM(A1:A9)' are evaluated.",
    { spreadsheetId: z.string(), range: z.string(), values: grid, raw: z.boolean().default(false).describe("true = store literally, don't parse formulas/numbers") },
    async ({ spreadsheetId, range, values, raw }) => (await sheets().spreadsheets.values.update({
      spreadsheetId: extractId(spreadsheetId), range, valueInputOption: raw ? "RAW" : "USER_ENTERED", requestBody: { values },
    })).data, WRITE);

  tool(server, "sheets_append_rows", "Append rows after the last row of data in a tab.",
    { spreadsheetId: z.string(), tab: z.string().default("Sheet1"), rows: grid },
    async ({ spreadsheetId, tab, rows }) => (await sheets().spreadsheets.values.append({
      spreadsheetId: extractId(spreadsheetId), range: `'${tab}'!A1`, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: rows },
    })).data.updates, WRITE);

  tool(server, "sheets_clear", "Clear the values in a range (formatting is kept).",
    { spreadsheetId: z.string(), range: z.string() },
    async ({ spreadsheetId, range }) => (await sheets().spreadsheets.values.clear({ spreadsheetId: extractId(spreadsheetId), range })).data,
    DESTRUCTIVE);

  tool(server, "sheets_manage_tab", "Add, rename, duplicate or delete a tab.",
    { spreadsheetId: z.string(), action: z.enum(["add", "rename", "duplicate", "delete"]), tab: z.string(), newName: z.string().optional() },
    async ({ spreadsheetId, action, tab, newName }) => {
      const id = extractId(spreadsheetId);
      let request: object;
      if (action === "add") request = { addSheet: { properties: { title: tab } } };
      else {
        const sheetId = await sheetIdByName(id, tab);
        request = action === "rename" ? { updateSheetProperties: { properties: { sheetId, title: newName }, fields: "title" } }
          : action === "duplicate" ? { duplicateSheet: { sourceSheetId: sheetId, newSheetName: newName } }
          : { deleteSheet: { sheetId } };
      }
      const r = await sheets().spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [request] } });
      return { ok: true, reply: r.data.replies?.[0] };
    }, DESTRUCTIVE);

  tool(server, "sheets_format",
    "Format a range on one tab: bold, colors, number format (e.g. '$#,##0.00', '0.0%', 'yyyy-mm-dd'), alignment, borders.",
    {
      spreadsheetId: z.string(), tab: z.string(),
      startRow: z.number().int().min(0).describe("0-based"), endRow: z.number().int().describe("exclusive"),
      startCol: z.number().int().min(0), endCol: z.number().int(),
      bold: z.boolean().optional(), italic: z.boolean().optional(), fontSize: z.number().optional(),
      textColor: z.string().optional().describe("#RRGGBB"), backgroundColor: z.string().optional().describe("#RRGGBB"),
      numberFormat: z.string().optional(), horizontalAlignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
      borders: z.boolean().optional(), wrap: z.boolean().optional(),
    },
    async (a) => {
      const id = extractId(a.spreadsheetId);
      const sheetId = await sheetIdByName(id, a.tab);
      const range = { sheetId, startRowIndex: a.startRow, endRowIndex: a.endRow, startColumnIndex: a.startCol, endColumnIndex: a.endCol };
      const fmt: any = {};
      const fields: string[] = [];
      const tf: any = {};
      if (a.bold !== undefined) { tf.bold = a.bold; fields.push("userEnteredFormat.textFormat.bold"); }
      if (a.italic !== undefined) { tf.italic = a.italic; fields.push("userEnteredFormat.textFormat.italic"); }
      if (a.fontSize) { tf.fontSize = a.fontSize; fields.push("userEnteredFormat.textFormat.fontSize"); }
      if (a.textColor) { tf.foregroundColor = hexToColor(a.textColor); fields.push("userEnteredFormat.textFormat.foregroundColor"); }
      if (Object.keys(tf).length) fmt.textFormat = tf;
      if (a.backgroundColor) { fmt.backgroundColor = hexToColor(a.backgroundColor); fields.push("userEnteredFormat.backgroundColor"); }
      if (a.numberFormat) { fmt.numberFormat = { type: "NUMBER", pattern: a.numberFormat }; fields.push("userEnteredFormat.numberFormat"); }
      if (a.horizontalAlignment) { fmt.horizontalAlignment = a.horizontalAlignment; fields.push("userEnteredFormat.horizontalAlignment"); }
      if (a.wrap !== undefined) { fmt.wrapStrategy = a.wrap ? "WRAP" : "OVERFLOW_CELL"; fields.push("userEnteredFormat.wrapStrategy"); }
      const requests: object[] = [];
      if (fields.length) requests.push({ repeatCell: { range, cell: { userEnteredFormat: fmt }, fields: fields.join(",") } });
      if (a.borders) {
        const b = { style: "SOLID", color: { red: 0.7, green: 0.7, blue: 0.7 } };
        requests.push({ updateBorders: { range, top: b, bottom: b, left: b, right: b, innerHorizontal: b, innerVertical: b } });
      }
      if (!requests.length) throw new Error("No formatting options given");
      await sheets().spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests } });
      return { ok: true };
    }, WRITE);

  tool(server, "sheets_add_chart", "Add a chart (column, bar, line, area, pie, scatter) built from a data range on a tab.",
    {
      spreadsheetId: z.string(), tab: z.string(),
      chartType: z.enum(["COLUMN", "BAR", "LINE", "AREA", "PIE", "SCATTER"]).default("COLUMN"),
      title: z.string().optional(),
      startRow: z.number().int().min(0).describe("0-based header row"), endRow: z.number().int().describe("exclusive"),
      domainCol: z.number().int().min(0).describe("0-based column with labels/x values"),
      seriesCols: z.array(z.number().int().min(0)).min(1).describe("0-based columns with values"),
    },
    async (a) => {
      const id = extractId(a.spreadsheetId);
      const sheetId = await sheetIdByName(id, a.tab);
      const src = (c: number) => ({ sourceRange: { sources: [{ sheetId, startRowIndex: a.startRow, endRowIndex: a.endRow, startColumnIndex: c, endColumnIndex: c + 1 }] } });
      const spec: any = { title: a.title };
      if (a.chartType === "PIE") {
        spec.pieChart = { legendPosition: "RIGHT_LEGEND", domain: src(a.domainCol), series: src(a.seriesCols[0]) };
      } else {
        spec.basicChart = {
          chartType: a.chartType, legendPosition: "BOTTOM_LEGEND", headerCount: 1,
          domains: [{ domain: src(a.domainCol) }],
          series: a.seriesCols.map((c) => ({ series: src(c), targetAxis: "LEFT_AXIS" })),
        };
      }
      const lastCol = Math.max(a.domainCol, ...a.seriesCols) + 2;
      const r = await sheets().spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: [{ addChart: { chart: {
        spec, position: { overlayPosition: { anchorCell: { sheetId, rowIndex: a.startRow, columnIndex: lastCol } } },
      } } }] } });
      return { chartId: r.data.replies?.[0]?.addChart?.chart?.chartId };
    }, WRITE);

  tool(server, "sheets_analyze",
    "Analyze a table in a range (first row = headers): per-column type, count, blanks, distinct values, and for numeric columns sum/mean/median/min/max/stdev; top values for text columns. Optional group-by summary.",
    {
      spreadsheetId: z.string(), range: z.string().describe("e.g. 'Sales' or 'Sales!A1:H500'"),
      groupBy: z.string().optional().describe("Header name to group by"),
      aggregateColumns: z.array(z.string()).optional().describe("Numeric headers to sum/average per group"),
    },
    async ({ spreadsheetId, range, groupBy, aggregateColumns }) => {
      const r = await sheets().spreadsheets.values.get({ spreadsheetId: extractId(spreadsheetId), range, valueRenderOption: "UNFORMATTED_VALUE" });
      const [headers = [], ...rows] = (r.data.values || []) as unknown[][];
      const columns = headers.map((h, ci) => {
        const vals = rows.map((row) => row[ci]);
        const nonBlank = vals.filter((v) => v !== undefined && v !== null && v !== "");
        const nums = nonBlank.map(toNumber).filter((n): n is number => n !== null);
        const stat: Record<string, unknown> = {
          column: `${colLetter(ci)} (${String(h)})`, count: nonBlank.length, blanks: vals.length - nonBlank.length,
          distinct: new Set(nonBlank.map(String)).size,
        };
        if (nums.length && nums.length >= nonBlank.length * 0.8) {
          const sorted = [...nums].sort((a, b) => a - b);
          const sum = nums.reduce((a, b) => a + b, 0);
          const mean = sum / nums.length;
          const mid = Math.floor(sorted.length / 2);
          Object.assign(stat, {
            type: "numeric", sum: +sum.toFixed(4), mean: +mean.toFixed(4),
            median: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
            min: sorted[0], max: sorted[sorted.length - 1],
            stdev: +Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, nums.length - 1)).toFixed(4),
          });
        } else {
          const freq = new Map<string, number>();
          for (const v of nonBlank) freq.set(String(v), (freq.get(String(v)) || 0) + 1);
          stat.type = "text";
          stat.topValues = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([value, count]) => ({ value, count }));
        }
        return stat;
      });
      let groups: unknown;
      if (groupBy) {
        const gi = headers.findIndex((h) => String(h).toLowerCase() === groupBy.toLowerCase());
        if (gi < 0) throw new Error(`groupBy column '${groupBy}' not found`);
        const aggIdx = (aggregateColumns || []).map((n) => {
          const i = headers.findIndex((h) => String(h).toLowerCase() === n.toLowerCase());
          if (i < 0) throw new Error(`Column '${n}' not found`);
          return i;
        });
        const m = new Map<string, { count: number; sums: number[] }>();
        for (const row of rows) {
          const k = String(row[gi] ?? "(blank)");
          const g = m.get(k) || { count: 0, sums: aggIdx.map(() => 0) };
          g.count++;
          aggIdx.forEach((ai, j) => (g.sums[j] += toNumber(row[ai]) ?? 0));
          m.set(k, g);
        }
        groups = [...m.entries()].sort((a, b) => b[1].count - a[1].count).map(([key, g]) => ({
          [String(headers[gi])]: key, count: g.count,
          ...Object.fromEntries(aggIdx.flatMap((ai, j) => [[`sum_${headers[ai]}`, +g.sums[j].toFixed(4)], [`avg_${headers[ai]}`, +(g.sums[j] / g.count).toFixed(4)]])),
        }));
      }
      return { range: r.data.range, rowCount: rows.length, columnCount: headers.length, columns, groups };
    }, READ);

  tool(server, "sheets_batch_update", "Advanced: send raw Sheets API batchUpdate requests (conditional formatting, filters, pivot tables, etc.).",
    { spreadsheetId: z.string(), requests: z.array(z.record(z.string(), z.any())).min(1) },
    async ({ spreadsheetId, requests }) => (await sheets().spreadsheets.batchUpdate({ spreadsheetId: extractId(spreadsheetId), requestBody: { requests } })).data.replies,
    WRITE);
}
