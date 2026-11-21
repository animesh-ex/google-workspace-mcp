import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { analyticsdata, type analyticsdata_v1beta } from "@googleapis/analyticsdata";
import { analyticsadmin } from "@googleapis/analyticsadmin";
import { getAuthClient } from "../auth.js";
import { tool, READ } from "../util.js";

const data = () => analyticsdata({ version: "v1beta", auth: getAuthClient() });
const admin = () => analyticsadmin({ version: "v1beta", auth: getAuthClient() });

const prop = (p: string) => (p.startsWith("properties/") ? p : `properties/${p.trim()}`);

const dateRange = {
  startDate: z.string().default("28daysAgo").describe("YYYY-MM-DD, or 'today', 'yesterday', 'NdaysAgo'"),
  endDate: z.string().default("yesterday"),
};

const filterSchema = z.object({
  field: z.string().describe("Dimension or metric name"),
  op: z.enum(["equals", "contains", "beginsWith", "endsWith", "regex", "inList", "gt", "gte", "lt", "lte", "between"]),
  value: z.union([z.string(), z.number(), z.array(z.string())]).describe("For inList: array of strings. For between: '10,100'"),
  not: z.boolean().default(false),
});
type Filter = z.infer<typeof filterSchema>;

function buildFilter(filters: Filter[] | undefined): analyticsdata_v1beta.Schema$FilterExpression | undefined {
  if (!filters?.length) return undefined;
  const exprs = filters.map((f): analyticsdata_v1beta.Schema$FilterExpression => {
    let filter: analyticsdata_v1beta.Schema$Filter;
    const numOps: Record<string, string> = { gt: "GREATER_THAN", gte: "GREATER_THAN_OR_EQUAL", lt: "LESS_THAN", lte: "LESS_THAN_OR_EQUAL", equals: "EQUAL" };
    if (f.op === "inList") {
      filter = { fieldName: f.field, inListFilter: { values: Array.isArray(f.value) ? f.value : String(f.value).split(",") } };
    } else if (f.op === "between") {
      const [a, b] = String(f.value).split(",").map(Number);
      filter = { fieldName: f.field, betweenFilter: { fromValue: { doubleValue: a }, toValue: { doubleValue: b } } };
    } else if (typeof f.value === "number" || ["gt", "gte", "lt", "lte"].includes(f.op)) {
      filter = { fieldName: f.field, numericFilter: { operation: numOps[f.op] || "EQUAL", value: { doubleValue: Number(f.value) } } };
    } else {
      const map: Record<string, string> = { equals: "EXACT", contains: "CONTAINS", beginsWith: "BEGINS_WITH", endsWith: "ENDS_WITH", regex: "FULL_REGEXP" };
      filter = { fieldName: f.field, stringFilter: { matchType: map[f.op], value: String(f.value), caseSensitive: false } };
    }
    return f.not ? { notExpression: { filter } } : { filter };
  });
  return exprs.length === 1 ? exprs[0] : { andGroup: { expressions: exprs } };
}

function flatten(r: analyticsdata_v1beta.Schema$RunReportResponse) {
  const dims = (r.dimensionHeaders || []).map((h) => h.name!);
  const mets = (r.metricHeaders || []).map((h) => h.name!);
  const toRow = (row: analyticsdata_v1beta.Schema$Row) => Object.fromEntries([
    ...dims.map((d, i) => [d, row.dimensionValues?.[i]?.value]),
    ...mets.map((m, i) => {
      const v = row.metricValues?.[i]?.value;
      const n = Number(v);
      return [m, v !== undefined && v !== null && !Number.isNaN(n) ? +n.toFixed(4) : v];
    }),
  ]);
  return {
    rowCount: r.rowCount || 0,
    rows: (r.rows || []).map(toRow),
    totals: r.totals?.[0] ? toRow(r.totals[0]) : undefined,
    currency: r.metadata?.currencyCode, timeZone: r.metadata?.timeZone,
  };
}

const BREAKDOWNS: Record<string, string[]> = {
  date: ["date"], week: ["yearWeek"], month: ["yearMonth"],
  channel: ["sessionDefaultChannelGroup"], source_medium: ["sessionSourceMedium"], campaign: ["sessionCampaignName"],
  page: ["pagePath"], landing_page: ["landingPagePlusQueryString"], country: ["country"], city: ["city"],
  device: ["deviceCategory"], browser: ["browser"], event: ["eventName"], new_vs_returning: ["newVsReturning"],
  item: ["itemName"],
};

export function registerAnalytics(server: McpServer) {
  tool(server, "ga_list_properties", "List the Google Analytics 4 accounts and properties this Google account can access (with property IDs).", {},
    async () => {
      const out: unknown[] = [];
      let pageToken: string | undefined;
      do {
        const r = await admin().accountSummaries.list({ pageSize: 200, pageToken });
        for (const a of r.data.accountSummaries || []) {
          out.push({ account: a.displayName, accountId: a.account, properties: (a.propertySummaries || []).map((p) => ({ name: p.displayName, propertyId: p.property?.replace("properties/", ""), type: p.propertyType })) });
        }
        pageToken = r.data.nextPageToken || undefined;
      } while (pageToken);
      return out;
    }, READ);

  tool(server, "ga_overview",
    "Quick GA4 performance summary: users, new users, sessions, engagement rate, avg session duration, views, key events (conversions) and revenue, broken down by a chosen dimension.",
    {
      propertyId: z.string(), ...dateRange,
      breakdown: z.enum(Object.keys(BREAKDOWNS) as [string, ...string[]]).default("channel"),
      limit: z.number().int().min(1).max(1000).default(25),
    },
    async ({ propertyId, startDate, endDate, breakdown, limit }) => {
      const dims = BREAKDOWNS[breakdown];
      const metrics = breakdown === "item"
        ? ["itemsViewed", "itemsAddedToCart", "itemsPurchased", "itemRevenue"]
        : breakdown === "event" ? ["eventCount", "totalUsers", "keyEvents", "totalRevenue"]
        : ["activeUsers", "newUsers", "sessions", "engagementRate", "averageSessionDuration", "screenPageViews", "keyEvents", "totalRevenue"];
      const r = await data().properties.runReport({ property: prop(propertyId), requestBody: {
        dateRanges: [{ startDate, endDate }],
        dimensions: dims.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })),
        orderBys: ["date", "week", "month"].includes(breakdown) ? [{ dimension: { dimensionName: dims[0] } }] : [{ metric: { metricName: metrics[0] }, desc: true }],
        limit: String(limit), metricAggregations: ["TOTAL"],
      } });
      return { breakdown, startDate, endDate, ...flatten(r.data) };
    }, READ);

  tool(server, "ga_run_report",
    "Run a custom GA4 report with any dimensions/metrics (see ga_get_metadata for names). Supports filters, ordering, comparison of two date ranges.",
    {
      propertyId: z.string(), ...dateRange,
      compareStartDate: z.string().optional(), compareEndDate: z.string().optional(),
      dimensions: z.array(z.string()).max(9).default([]),
      metrics: z.array(z.string()).min(1).max(10),
      dimensionFilters: z.array(filterSchema).optional(),
      metricFilters: z.array(filterSchema).optional(),
      orderBy: z.string().optional().describe("Dimension or metric name to sort by"),
      desc: z.boolean().default(true),
      limit: z.number().int().min(1).max(100000).default(100),
      offset: z.number().int().min(0).default(0),
    },
    async (a) => {
      const dateRanges = [{ startDate: a.startDate, endDate: a.endDate, name: "current" }];
      if (a.compareStartDate && a.compareEndDate) dateRanges.push({ startDate: a.compareStartDate, endDate: a.compareEndDate, name: "previous" });
      const orderBys = a.orderBy
        ? [a.metrics.includes(a.orderBy) ? { metric: { metricName: a.orderBy }, desc: a.desc } : { dimension: { dimensionName: a.orderBy }, desc: a.desc }]
        : undefined;
      const r = await data().properties.runReport({ property: prop(a.propertyId), requestBody: {
        dateRanges, dimensions: a.dimensions.map((name) => ({ name })), metrics: a.metrics.map((name) => ({ name })),
        dimensionFilter: buildFilter(a.dimensionFilters), metricFilter: buildFilter(a.metricFilters),
        orderBys, limit: String(a.limit), offset: String(a.offset), metricAggregations: ["TOTAL"],
      } });
      return flatten(r.data);
    }, READ);

  tool(server, "ga_realtime", "GA4 realtime report (last 30 minutes): active users by a dimension such as country, unifiedScreenName, deviceCategory.",
    { propertyId: z.string(), dimensions: z.array(z.string()).default(["country"]), metrics: z.array(z.string()).default(["activeUsers"]), limit: z.number().int().default(25) },
    async ({ propertyId, dimensions, metrics, limit }) => {
      const r = await data().properties.runRealtimeReport({ property: prop(propertyId), requestBody: {
        dimensions: dimensions.map((name) => ({ name })), metrics: metrics.map((name) => ({ name })), limit: String(limit), metricAggregations: ["TOTAL"],
      } });
      return flatten(r.data);
    }, READ);

  tool(server, "ga_get_metadata", "List the dimensions and metrics available for a GA4 property (including custom ones). Optional search text filters the list.",
    { propertyId: z.string(), search: z.string().optional() },
    async ({ propertyId, search }) => {
      const r = await data().properties.getMetadata({ name: `${prop(propertyId)}/metadata` });
      const q = search?.toLowerCase();
      const keep = (x: { apiName?: string | null; uiName?: string | null }) => !q || x.apiName?.toLowerCase().includes(q) || x.uiName?.toLowerCase().includes(q);
      return {
        dimensions: (r.data.dimensions || []).filter(keep).map((d) => ({ apiName: d.apiName, uiName: d.uiName, custom: d.customDefinition || undefined })),
        metrics: (r.data.metrics || []).filter(keep).map((m) => ({ apiName: m.apiName, uiName: m.uiName, type: m.type, custom: m.customDefinition || undefined })),
      };
    }, READ);
}
