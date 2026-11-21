import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchconsole, type searchconsole_v1 } from "@googleapis/searchconsole";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE } from "../util.js";

const gsc = () => searchconsole({ version: "v1", auth: getAuthClient() });

const DIMS = ["query", "page", "country", "device", "date", "searchAppearance"] as const;
const site = z.string().describe("Property as listed by gsc_list_sites, e.g. 'sc-domain:example.com' or 'https://www.example.com/'");
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const r2 = (n?: number | null) => (n === undefined || n === null ? undefined : Math.round(n * 100) / 100);

const filterSchema = z.object({
  dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
  operator: z.enum(["contains", "equals", "notContains", "notEquals", "includingRegex", "excludingRegex"]).default("contains"),
  expression: z.string(),
});

async function query(siteUrl: string, body: searchconsole_v1.Schema$SearchAnalyticsQueryRequest) {
  const rows: searchconsole_v1.Schema$ApiDataRow[] = [];
  const want = body.rowLimit || 1000;
  let startRow = 0;
  while (rows.length < want) {
    const r = await gsc().searchanalytics.query({ siteUrl, requestBody: { ...body, rowLimit: Math.min(25000, want - rows.length), startRow } });
    const got = r.data.rows || [];
    rows.push(...got);
    if (got.length < Math.min(25000, want)) break;
    startRow += got.length;
  }
  return rows;
}

const flat = (dims: string[], r: searchconsole_v1.Schema$ApiDataRow) => ({
  ...Object.fromEntries(dims.map((d, i) => [d, r.keys?.[i]])),
  clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, ctr: r2((r.ctr ?? 0) * 100) ?? 0, position: r2(r.position ?? 0) ?? 0,
});

export function registerSearchConsole(server: McpServer) {
  tool(server, "gsc_list_sites", "List the Search Console properties this account can access, with permission level.", {},
    async () => (await gsc().sites.list()).data.siteEntry?.map((s) => ({ siteUrl: s.siteUrl, permission: s.permissionLevel })) || [], READ);

  tool(server, "gsc_performance",
    "Google Search performance (clicks, impressions, CTR %, average position) from Search Console, grouped by query, page, country, device, date or search appearance, with filters. Set compare=true to add the previous period of equal length and the change for each row. Data lags 2–3 days.",
    {
      siteUrl: site,
      startDate: z.string().default(daysAgo(30)).describe("YYYY-MM-DD (default 30 days ago)"),
      endDate: z.string().default(daysAgo(3)).describe("YYYY-MM-DD (default 3 days ago; latest days are incomplete)"),
      dimensions: z.array(z.enum(DIMS)).default(["query"]),
      filters: z.array(filterSchema).optional(),
      searchType: z.enum(["web", "image", "video", "news", "discover", "googleNews"]).default("web"),
      rowLimit: z.number().int().min(1).max(25000).default(100),
      orderBy: z.enum(["clicks", "impressions", "ctr", "position"]).default("clicks"),
      compare: z.boolean().default(false),
    },
    async (a) => {
      const body = (startDate: string, endDate: string): searchconsole_v1.Schema$SearchAnalyticsQueryRequest => ({
        startDate, endDate, dimensions: a.dimensions, type: a.searchType, rowLimit: a.rowLimit, dataState: "final",
        dimensionFilterGroups: a.filters?.length ? [{ groupType: "and", filters: a.filters }] : undefined,
      });
      const [cur, totals] = await Promise.all([
        query(a.siteUrl, body(a.startDate, a.endDate)),
        query(a.siteUrl, { ...body(a.startDate, a.endDate), dimensions: [], rowLimit: 1 }),
      ]);
      let rows: Record<string, any>[] = cur.map((r) => flat(a.dimensions, r));
      const result: Record<string, unknown> = { siteUrl: a.siteUrl, period: `${a.startDate} → ${a.endDate}`, totals: totals[0] ? flat([], totals[0]) : undefined };
      if (a.compare) {
        const len = (new Date(a.endDate).getTime() - new Date(a.startDate).getTime()) / 86400000 + 1;
        const pEnd = new Date(new Date(a.startDate).getTime() - 86400000).toISOString().slice(0, 10);
        const pStart = new Date(new Date(pEnd).getTime() - (len - 1) * 86400000).toISOString().slice(0, 10);
        const [prev, prevTot] = await Promise.all([
          query(a.siteUrl, { ...body(pStart, pEnd), rowLimit: Math.min(25000, a.rowLimit * 5) }),
          query(a.siteUrl, { ...body(pStart, pEnd), dimensions: [], rowLimit: 1 }),
        ]);
        const key = (r: searchconsole_v1.Schema$ApiDataRow) => (r.keys || []).join("|");
        const pm = new Map(prev.map((r) => [key(r), r]));
        rows = cur.map((r) => {
          const p = pm.get(key(r));
          const f = flat(a.dimensions, r);
          return { ...f, clicksPrev: p?.clicks ?? 0, clicksChange: f.clicks - (p?.clicks ?? 0), impressionsPrev: p?.impressions ?? 0, positionPrev: r2(p?.position), positionChange: p?.position ? r2((r.position ?? 0) - p.position) : undefined };
        });
        result.previousPeriod = `${pStart} → ${pEnd}`;
        result.previousTotals = prevTot[0] ? flat([], prevTot[0]) : undefined;
      }
      rows.sort((x, y) => (a.orderBy === "position" ? x.position - y.position : y[a.orderBy] - x[a.orderBy]));
      return { ...result, rowCount: rows.length, rows };
    }, READ);

  tool(server, "gsc_opportunities",
    "Find SEO quick wins from Search Console: 'striking distance' queries (average position 4–20 with real impressions), high-impression low-CTR queries (titles/descriptions to improve), and pages losing clicks versus the previous period.",
    { siteUrl: site, days: z.number().int().min(7).max(480).default(28), minImpressions: z.number().int().default(100), limit: z.number().int().min(5).max(200).default(25) },
    async ({ siteUrl, days, minImpressions, limit }) => {
      const end = daysAgo(3), start = daysAgo(days + 2);
      const pEnd = daysAgo(days + 3), pStart = daysAgo(2 * days + 2);
      const [qp, pages, prevPages] = await Promise.all([
        query(siteUrl, { startDate: start, endDate: end, dimensions: ["query", "page"], rowLimit: 5000 }),
        query(siteUrl, { startDate: start, endDate: end, dimensions: ["page"], rowLimit: 5000 }),
        query(siteUrl, { startDate: pStart, endDate: pEnd, dimensions: ["page"], rowLimit: 5000 }),
      ]);
      const rows = qp.map((r) => flat(["query", "page"], r)).filter((r) => r.impressions >= minImpressions);
      const striking = rows.filter((r) => r.position >= 4 && r.position <= 20).sort((a, b) => b.impressions - a.impressions).slice(0, limit);
      // Expected CTR roughly by position bucket; flag rows well below it.
      const expected = (p: number) => (p <= 1.5 ? 25 : p <= 3 ? 12 : p <= 5 ? 6 : p <= 10 ? 2.5 : 1);
      const lowCtr = rows.filter((r) => r.position <= 10 && r.ctr < expected(r.position) / 2).sort((a, b) => b.impressions - a.impressions).slice(0, limit);
      const prev = new Map(prevPages.map((r) => [r.keys?.[0], r.clicks ?? 0]));
      const losing = pages.map((r) => ({ page: r.keys?.[0], clicks: r.clicks ?? 0, clicksPrev: prev.get(r.keys?.[0]) ?? 0 }))
        .map((r) => ({ ...r, change: r.clicks - r.clicksPrev })).filter((r) => r.change < 0).sort((a, b) => a.change - b.change).slice(0, limit);
      return { period: `${start} → ${end}`, previousPeriod: `${pStart} → ${pEnd}`, strikingDistance: striking, lowCtrForPosition: lowCtr, pagesLosingClicks: losing };
    }, READ);

  tool(server, "gsc_inspect_url",
    "URL Inspection: is a page indexed, Google's chosen canonical, last crawl, mobile usability, rich results, and why a page isn't indexed. (Quota ~2,000/day per property.)",
    { siteUrl: site, url: z.string().url() },
    async ({ siteUrl, url }) => {
      const r = (await gsc().urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl, languageCode: "en-US" } })).data.inspectionResult;
      const ix = r?.indexStatusResult;
      return {
        url, verdict: ix?.verdict, coverage: ix?.coverageState, indexing: ix?.indexingState, robotsTxt: ix?.robotsTxtState, pageFetch: ix?.pageFetchState,
        lastCrawl: ix?.lastCrawlTime, crawledAs: ix?.crawledAs, googleCanonical: ix?.googleCanonical, userCanonical: ix?.userCanonical,
        sitemaps: ix?.sitemap, referringUrls: ix?.referringUrls?.slice(0, 5),
        mobileUsability: r?.mobileUsabilityResult?.verdict, mobileIssues: r?.mobileUsabilityResult?.issues?.map((i) => i.message),
        richResults: r?.richResultsResult?.detectedItems?.map((d) => ({ type: d.richResultType, items: d.items?.length, issues: d.items?.flatMap((i) => i.issues?.map((x) => `${x.severity}: ${x.issueMessage}`) || []) })),
        reportLink: r?.inspectionResultLink,
      };
    }, READ);

  tool(server, "gsc_sitemaps", "List a property's sitemaps (with errors, warnings and indexed counts), submit a sitemap, or remove one.",
    { siteUrl: site, action: z.enum(["list", "submit", "delete"]).default("list"), sitemapUrl: z.string().optional() },
    async ({ siteUrl, action, sitemapUrl }) => {
      const api = gsc().sitemaps;
      if (action === "list") {
        return ((await api.list({ siteUrl })).data.sitemap || []).map((s) => ({
          path: s.path, lastSubmitted: s.lastSubmitted, lastDownloaded: s.lastDownloaded, pending: s.isPending, errors: s.errors, warnings: s.warnings,
          contents: s.contents?.map((c) => ({ type: c.type, submitted: c.submitted, indexed: c.indexed })),
        }));
      }
      if (!sitemapUrl) throw new Error("sitemapUrl is required");
      if (action === "submit") { await api.submit({ siteUrl, feedpath: sitemapUrl }); return { submitted: sitemapUrl }; }
      await api.delete({ siteUrl, feedpath: sitemapUrl });
      return { removed: sitemapUrl };
    }, WRITE);
}
