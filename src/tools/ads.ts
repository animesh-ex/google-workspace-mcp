import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getAuthClient, CONFIG_DIR } from "../auth.js";
import { tool, READ, DESTRUCTIVE } from "../util.js";

const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v26";
export const ADS_CONFIG_PATH = path.join(CONFIG_DIR, "ads.json");

interface AdsConfig { developerToken: string; loginCustomerId?: string }

export function loadAdsConfig(): AdsConfig | null {
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    return { developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN, loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID };
  }
  if (!fs.existsSync(ADS_CONFIG_PATH)) return null;
  const c = JSON.parse(fs.readFileSync(ADS_CONFIG_PATH, "utf8"));
  return c.developerToken ? c : null;
}

const cid = (id: string) => id.replace(/\D/g, "");

async function adsFetch(pathPart: string, body?: unknown, loginCustomerId?: string) {
  const cfg = loadAdsConfig();
  if (!cfg) {
    throw new Error(`Google Ads isn't configured. Save your developer token to ${ADS_CONFIG_PATH} as {"developerToken": "...", "loginCustomerId": "1234567890"} (loginCustomerId = your manager account ID, optional). See README.`);
  }
  const { token } = await getAuthClient().getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": cfg.developerToken,
    "Content-Type": "application/json",
  };
  const login = loginCustomerId || cfg.loginCustomerId;
  if (login) headers["login-customer-id"] = cid(login);
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/${pathPart}`, {
    method: body === undefined ? "GET" : "POST", headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const details = json.error?.details?.flatMap((d: any) => (d.errors || []).map((e: any) => `${Object.values(e.errorCode || {}).join("/")}: ${e.message}`)) || [];
    throw new Error(`Google Ads API ${res.status}: ${details.length ? details.join("; ") : json.error?.message || text}`);
  }
  return json;
}

// Metrics the API returns in micros without a "Micros" suffix.
const MICRO_METRICS = new Set(["averageCpc", "averageCpm", "averageCpv", "averageCpe", "averageCost", "costPerConversion", "costPerAllConversions", "costPerCurrentModelAttributedConversion"]);

/** Flatten nested GAQL rows to dotted keys; convert *Micros to currency units. */
function flattenRow(obj: any, prefix = "", out: Record<string, unknown> = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenRow(v, key, out);
    else if (/Micros$/.test(k) && v !== null && v !== undefined) out[key.replace(/Micros$/, "")] = +(Number(v) / 1e6).toFixed(2);
    else if (MICRO_METRICS.has(k) && v !== null && v !== undefined) out[key] = +(Number(v) / 1e6).toFixed(2);
    else out[key] = v;
  }
  return out;
}

async function gaql(customerId: string, query: string, limit = 1000, loginCustomerId?: string) {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const r = await adsFetch(`customers/${cid(customerId)}/googleAds:search`, { query, pageToken }, loginCustomerId);
    for (const row of r.results || []) {
      rows.push(flattenRow(row));
      if (rows.length >= limit) return { rows, truncated: true };
    }
    pageToken = r.nextPageToken;
  } while (pageToken);
  return { rows, truncated: false };
}

const DATE_PRESETS = ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_14_DAYS", "LAST_30_DAYS", "THIS_MONTH", "LAST_MONTH", "THIS_WEEK_MON_TODAY", "LAST_WEEK_MON_SUN"] as const;
const dateShape = {
  dateRange: z.enum(DATE_PRESETS).default("LAST_30_DAYS"),
  startDate: z.string().optional().describe("YYYY-MM-DD; overrides dateRange when used with endDate"),
  endDate: z.string().optional(),
};
const during = (a: { dateRange: string; startDate?: string; endDate?: string }) =>
  a.startDate && a.endDate ? `segments.date BETWEEN '${a.startDate.replace(/[^\d-]/g, "")}' AND '${a.endDate.replace(/[^\d-]/g, "")}'` : `segments.date DURING ${a.dateRange}`;

function addRatios(rows: Record<string, unknown>[]) {
  for (const r of rows) {
    const cost = Number(r["metrics.cost"] || 0);
    const conv = Number(r["metrics.conversions"] || 0);
    const value = Number(r["metrics.conversionsValue"] || 0);
    if (conv) r.costPerConversion = +(cost / conv).toFixed(2);
    if (cost && value) r.roas = +(value / cost).toFixed(2);
  }
  return rows;
}

const customerShape = {
  customerId: z.string().describe("Google Ads customer ID (with or without dashes)"),
  loginCustomerId: z.string().optional().describe("Manager (MCC) ID if accessing through a manager; defaults to ads.json"),
};

export function registerAds(server: McpServer) {
  tool(server, "ads_list_accounts", "List Google Ads accounts this Google login can access (IDs, names, currency, whether each is a manager), including client accounts under managers.",
    {},
    async () => {
      const r = await adsFetch("customers:listAccessibleCustomers");
      const ids: string[] = (r.resourceNames || []).map((n: string) => n.split("/")[1]);
      const out = [];
      for (const id of ids) {
        try {
          const { rows } = await gaql(id, "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.manager, customer_client.level, customer_client.status FROM customer_client WHERE customer_client.level <= 1", 500, id);
          out.push({ accessibleId: id, accounts: rows.map((x) => ({
            id: x["customerClient.id"], name: x["customerClient.descriptiveName"], currency: x["customerClient.currencyCode"],
            manager: x["customerClient.manager"], level: x["customerClient.level"], status: x["customerClient.status"],
          })) });
        } catch (e: any) {
          out.push({ accessibleId: id, error: e.message });
        }
      }
      return out;
    }, READ);

  tool(server, "ads_query", "Run any read-only GAQL query against a Google Ads account (e.g. SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING LAST_7_DAYS). Money fields ending in _micros are returned in currency units.",
    { ...customerShape, query: z.string(), limit: z.number().int().min(1).max(10000).default(500) },
    async ({ customerId, loginCustomerId, query, limit }) => {
      if (!/^\s*select\b/i.test(query)) throw new Error("Only SELECT queries are allowed here.");
      return gaql(customerId, query, limit, loginCustomerId);
    }, READ);

  tool(server, "ads_campaign_performance", "Campaign performance for a date range: status, type, daily budget, impressions, clicks, CTR, avg CPC, cost, conversions, conversion value, cost/conversion and ROAS.",
    { ...customerShape, ...dateShape, includePaused: z.boolean().default(true), limit: z.number().int().default(200) },
    async (a) => {
      const q = `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM campaign WHERE ${during(a)} AND campaign.status != 'REMOVED' ${a.includePaused ? "" : "AND campaign.status = 'ENABLED'"}
        ORDER BY metrics.cost_micros DESC`;
      const { rows, truncated } = await gaql(a.customerId, q, a.limit, a.loginCustomerId);
      return { rows: addRatios(rows), truncated };
    }, READ);

  tool(server, "ads_ad_group_performance", "Ad group performance for a date range, optionally within one campaign.",
    { ...customerShape, ...dateShape, campaignId: z.string().optional(), limit: z.number().int().default(200) },
    async (a) => {
      const q = `SELECT campaign.name, ad_group.id, ad_group.name, ad_group.status, metrics.impressions, metrics.clicks, metrics.ctr,
        metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM ad_group WHERE ${during(a)} AND ad_group.status != 'REMOVED' ${a.campaignId ? `AND campaign.id = ${cid(a.campaignId)}` : ""}
        ORDER BY metrics.cost_micros DESC`;
      const { rows, truncated } = await gaql(a.customerId, q, a.limit, a.loginCustomerId);
      return { rows: addRatios(rows), truncated };
    }, READ);

  tool(server, "ads_keyword_performance", "Search keyword performance with match type and quality score.",
    { ...customerShape, ...dateShape, campaignId: z.string().optional(), limit: z.number().int().default(200) },
    async (a) => {
      const q = `SELECT campaign.name, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
        ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, metrics.impressions, metrics.clicks, metrics.ctr,
        metrics.average_cpc, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM keyword_view WHERE ${during(a)} AND ad_group_criterion.status != 'REMOVED' ${a.campaignId ? `AND campaign.id = ${cid(a.campaignId)}` : ""}
        ORDER BY metrics.cost_micros DESC`;
      const { rows, truncated } = await gaql(a.customerId, q, a.limit, a.loginCustomerId);
      return { rows: addRatios(rows), truncated };
    }, READ);

  tool(server, "ads_search_terms", "Search terms report: the actual queries that triggered ads, with cost and conversions (find wasted spend and new keywords).",
    { ...customerShape, ...dateShape, campaignId: z.string().optional(), minCost: z.number().default(0), limit: z.number().int().default(300) },
    async (a) => {
      const q = `SELECT search_term_view.search_term, search_term_view.status, campaign.name, ad_group.name, metrics.impressions, metrics.clicks,
        metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM search_term_view WHERE ${during(a)} ${a.campaignId ? `AND campaign.id = ${cid(a.campaignId)}` : ""}
        ${a.minCost ? `AND metrics.cost_micros >= ${Math.round(a.minCost * 1e6)}` : ""}
        ORDER BY metrics.cost_micros DESC`;
      const { rows, truncated } = await gaql(a.customerId, q, a.limit, a.loginCustomerId);
      return { rows: addRatios(rows), truncated };
    }, READ);

  tool(server, "ads_ad_performance", "Ad-level performance including responsive search ad headlines/descriptions.",
    { ...customerShape, ...dateShape, campaignId: z.string().optional(), limit: z.number().int().default(100) },
    async (a) => {
      const q = `SELECT campaign.name, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions,
        metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions, metrics.conversions_value
        FROM ad_group_ad WHERE ${during(a)} AND ad_group_ad.status != 'REMOVED' ${a.campaignId ? `AND campaign.id = ${cid(a.campaignId)}` : ""}
        ORDER BY metrics.cost_micros DESC`;
      const { rows, truncated } = await gaql(a.customerId, q, a.limit, a.loginCustomerId);
      for (const r of rows) {
        for (const k of ["adGroupAd.ad.responsiveSearchAd.headlines", "adGroupAd.ad.responsiveSearchAd.descriptions"]) {
          if (Array.isArray(r[k])) r[k] = (r[k] as any[]).map((x) => x.text);
        }
      }
      return { rows: addRatios(rows), truncated };
    }, READ);

  tool(server, "ads_set_status",
    "Pause or enable campaigns, ad groups, ads or keywords. ENABLED resumes spending. Use validateOnly=true to dry-run. Always confirm with the user first.",
    {
      ...customerShape,
      entity: z.enum(["campaign", "ad_group", "ad", "keyword"]),
      ids: z.array(z.string()).min(1).describe("campaign/ad group IDs; for ad: 'adGroupId~adId'; for keyword: 'adGroupId~criterionId'"),
      status: z.enum(["ENABLED", "PAUSED"]),
      validateOnly: z.boolean().default(false),
    },
    async (a) => {
      const c = cid(a.customerId);
      const map = {
        campaign: ["campaigns", "campaigns"], ad_group: ["adGroups", "adGroups"], ad: ["adGroupAds", "adGroupAds"], keyword: ["adGroupCriteria", "adGroupCriteria"],
      } as const;
      const [service, collection] = map[a.entity];
      const operations = a.ids.map((id) => ({ update: { resourceName: `customers/${c}/${collection}/${id.replace(/[^\d~]/g, "")}`, status: a.status }, updateMask: "status" }));
      const r = await adsFetch(`customers/${c}/${service}:mutate`, { operations, validateOnly: a.validateOnly }, a.loginCustomerId);
      return { validateOnly: a.validateOnly, status: a.status, updated: (r.results || []).map((x: any) => x.resourceName) };
    }, DESTRUCTIVE);

  tool(server, "ads_set_campaign_budget",
    "Change a campaign's daily budget (in account currency). Shared budgets affect every campaign using them. Use validateOnly=true to dry-run. Always confirm the amount with the user first.",
    { ...customerShape, campaignId: z.string(), dailyBudget: z.number().positive(), validateOnly: z.boolean().default(false) },
    async (a) => {
      const c = cid(a.customerId);
      const { rows } = await gaql(c, `SELECT campaign.name, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared, campaign_budget.reference_count FROM campaign WHERE campaign.id = ${cid(a.campaignId)}`, 1, a.loginCustomerId);
      const row = rows[0];
      if (!row) throw new Error(`Campaign ${a.campaignId} not found`);
      await adsFetch(`customers/${c}/campaignBudgets:mutate`, {
        operations: [{ update: { resourceName: row["campaignBudget.resourceName"], amountMicros: String(Math.round(a.dailyBudget * 1e6)) }, updateMask: "amount_micros" }],
        validateOnly: a.validateOnly,
      }, a.loginCustomerId);
      return {
        validateOnly: a.validateOnly, campaign: row["campaign.name"], previousDailyBudget: row["campaignBudget.amount"], newDailyBudget: a.dailyBudget,
        sharedBudget: row["campaignBudget.explicitlyShared"] ? `yes, used by ${row["campaignBudget.referenceCount"]} campaigns` : "no",
      };
    }, DESTRUCTIVE);
}
