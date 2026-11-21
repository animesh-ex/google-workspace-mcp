import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { merchantapi } from "@googleapis/merchantapi";
import { getAuthClient, cloudProjectNumber } from "../auth.js";
import { tool, READ, WRITE } from "../util.js";

const auth = () => getAuthClient();
const accountsApi = () => merchantapi({ version: "accounts_v1", auth: auth() });
const productsApi = () => merchantapi({ version: "products_v1", auth: auth() });
const reportsApi = () => merchantapi({ version: "reports_v1", auth: auth() });
const issuesApi = () => merchantapi({ version: "issueresolution_v1", auth: auth() });
const sourcesApi = () => merchantapi({ version: "datasources_v1", auth: auth() });

const acct = (id: string) => `accounts/${id.replace(/^accounts\//, "").replace(/\D/g, "")}`;
const accountId = z.string().describe("Merchant Center account ID (from merchant_list_accounts)");
const money = (p?: { amountMicros?: string | null; currencyCode?: string | null } | null) =>
  p?.amountMicros ? `${(Number(p.amountMicros) / 1e6).toFixed(2)} ${p.currencyCode || ""}`.trim() : undefined;

/** Turn the Merchant API's "not registered" error into clear instructions. */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e: any) {
    const msg: string = e?.response?.data?.error?.message || e?.message || String(e);
    if (/not registered|developer registration|registerGcp|GCP project.*(?:not|isn't).*registered/i.test(msg)) {
      throw new Error(`${msg}\nFix: this Google Cloud project (number ${cloudProjectNumber() || "of your OAuth client"}) must be registered with the Merchant Center account once. Call merchant_registration with action "register" and your developer email (a Merchant Center admin must approve if asked).`);
    }
    if (/Merchant API has not been used|merchantapi\.googleapis\.com/i.test(msg)) {
      throw new Error(`${msg}\nFix: enable the "Merchant API" in the same Google Cloud project as your OAuth client, then wait a few minutes.`);
    }
    throw new Error(msg);
  }
}

/** Run an MCQL report and flatten each row's single *View object. */
async function report(accountIdValue: string, query: string, limit = 1000) {
  const rows: Record<string, unknown>[] = [];
  let pageToken: string | undefined;
  do {
    const r = await call(() => reportsApi().accounts.reports.search({ parent: acct(accountIdValue), requestBody: { query, pageSize: Math.min(1000, limit - rows.length), pageToken } }));
    for (const row of r.data.results || []) {
      const view = Object.values(row as Record<string, any>).find((v) => v && typeof v === "object") || {};
      rows.push(Object.fromEntries(Object.entries(view).map(([k, v]: [string, any]) => [k, v && typeof v === "object" && "amountMicros" in v ? money(v) : v])));
    }
    pageToken = r.data.nextPageToken || undefined;
  } while (pageToken && rows.length < limit);
  return rows;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

export function registerMerchant(server: McpServer) {
  tool(server, "merchant_list_accounts", "List the Google Merchant Center accounts this Google login can access (IDs, names, website, test account).", {},
    async () => {
      const r = await call(() => accountsApi().accounts.list({ pageSize: 250 }));
      return (r.data.accounts || []).map((a) => ({ accountId: a.accountId, name: a.accountName, homePage: a.homePageUri, language: a.languageCode, testAccount: a.testAccount || undefined }));
    }, READ);

  tool(server, "merchant_registration",
    "Check or create the one-time registration of this Google Cloud project with a Merchant Center account, which the Merchant API requires before other calls work.",
    { accountId, action: z.enum(["status", "register"]).default("status"), developerEmail: z.string().optional().describe("For register: the developer contact email (usually the signed-in account)") },
    async ({ accountId: id, action, developerEmail }) => {
      const api = accountsApi().accounts.developerRegistration;
      const name = `${acct(id)}/developerRegistration`;
      if (action === "status") {
        try {
          const r = await api.getDeveloperRegistration({ name });
          return { registered: true, gcpProjects: r.data.gcpIds, account: id };
        } catch (e: any) {
          return { registered: false, account: id, detail: e?.response?.data?.error?.message || e.message, next: "Call merchant_registration with action 'register' and developerEmail." };
        }
      }
      if (!developerEmail) throw new Error("developerEmail is required to register.");
      const r = await call(() => api.registerGcp({ name, requestBody: { developerEmail } }));
      return { registered: true, gcpProjects: r.data.gcpIds, account: id };
    }, WRITE);

  tool(server, "merchant_product_status",
    "Account-wide product health: how many products are active, pending, disapproved or expiring per destination/country, and the top issues with how many products each affects and how to fix them.",
    { accountId, issueLimit: z.number().int().min(1).max(100).default(20) },
    async ({ accountId: id, issueLimit }) => {
      const out: any[] = [];
      let pageToken: string | undefined;
      do {
        const r = await call(() => issuesApi().accounts.aggregateProductStatuses.list({ parent: acct(id), pageSize: 250, pageToken }));
        out.push(...(r.data.aggregateProductStatuses || []));
        pageToken = r.data.nextPageToken || undefined;
      } while (pageToken);
      return out.map((s) => ({
        destination: s.reportingContext, country: s.country,
        active: Number(s.stats?.activeCount || 0), pending: Number(s.stats?.pendingCount || 0), disapproved: Number(s.stats?.disapprovedCount || 0), expiring: Number(s.stats?.expiringCount || 0),
        topIssues: (s.itemLevelIssues || []).sort((a: any, b: any) => Number(b.productCount || 0) - Number(a.productCount || 0)).slice(0, issueLimit)
          .map((i: any) => ({ issue: i.description, severity: i.severity, products: Number(i.productCount || 0), attribute: i.attribute, fix: i.resolution, help: i.documentationUri })),
      }));
    }, READ);

  tool(server, "merchant_list_products",
    "List products as Google sees them (after feed processing): offer ID, title, price, availability, link, and approval status/issues per destination. onlyWithIssues filters to disapproved or problem products; search filters by title or offer ID.",
    { accountId, onlyWithIssues: z.boolean().default(false), search: z.string().optional(), limit: z.number().int().min(1).max(5000).default(100) },
    async ({ accountId: id, onlyWithIssues, search, limit }) => {
      const out: any[] = [];
      let pageToken: string | undefined;
      const q = search?.toLowerCase();
      do {
        const r = await call(() => productsApi().accounts.products.list({ parent: acct(id), pageSize: 1000, pageToken }));
        for (const p of r.data.products || []) {
          const a = p.productAttributes || {};
          const st = p.productStatus || {};
          const issues = (st.itemLevelIssues || []).map((i) => `${i.severity || ""}: ${i.description}${i.attribute ? ` [${i.attribute}]` : ""}`);
          const disapproved = (st.destinationStatuses || []).flatMap((d) => d.disapprovedCountries || []);
          if (onlyWithIssues && !issues.length && !disapproved.length) continue;
          if (q && !(`${a.title} ${p.offerId}`.toLowerCase().includes(q))) continue;
          out.push({
            offerId: p.offerId, name: p.name, title: a.title, price: money(a.price), salePrice: money((a as any).salePrice), availability: a.availability,
            brand: a.brand, link: a.link, image: a.imageLink, feedLabel: p.feedLabel, language: p.contentLanguage,
            approvedIn: (st.destinationStatuses || []).flatMap((d) => (d.approvedCountries || []).map((c) => `${d.reportingContext}:${c}`)),
            disapprovedIn: (st.destinationStatuses || []).flatMap((d) => (d.disapprovedCountries || []).map((c) => `${d.reportingContext}:${c}`)),
            issues: issues.length ? issues : undefined,
          });
          if (out.length >= limit) break;
        }
        pageToken = r.data.nextPageToken || undefined;
      } while (pageToken && out.length < limit);
      return { count: out.length, products: out };
    }, READ);

  tool(server, "merchant_get_product", "Full details of one product: every attribute Google holds, plus status and issues per destination. Accepts the offer ID or the product name from merchant_list_products.",
    { accountId, product: z.string().describe("Offer ID, or name like accounts/123/products/en~US~SKU123") },
    async ({ accountId: id, product }) => {
      let name = product;
      if (!product.startsWith("accounts/")) {
        let pageToken: string | undefined;
        let found: string | undefined;
        do {
          const r = await call(() => productsApi().accounts.products.list({ parent: acct(id), pageSize: 1000, pageToken }));
          found = r.data.products?.find((p) => p.offerId === product)?.name || undefined;
          pageToken = r.data.nextPageToken || undefined;
        } while (!found && pageToken);
        if (!found) throw new Error(`No product with offer ID ${product}.`);
        name = found;
      }
      const p = (await call(() => productsApi().accounts.products.get({ name }))).data;
      return {
        name: p.name, offerId: p.offerId, feedLabel: p.feedLabel, language: p.contentLanguage, dataSource: p.dataSource,
        attributes: p.productAttributes, status: p.productStatus,
      };
    }, READ);

  tool(server, "merchant_performance",
    "Shopping performance from Merchant Center (free listings and Shopping ads): clicks, impressions, CTR, conversions and conversion value, grouped by product, date, week, brand, category, marketing method (ADS / ORGANIC) or country.",
    {
      accountId,
      startDate: z.string().default(daysAgo(30)), endDate: z.string().default(daysAgo(1)),
      groupBy: z.enum(["offer_id", "date", "week", "brand", "category_l1", "marketing_method", "customer_country_code"]).default("offer_id"),
      limit: z.number().int().min(1).max(5000).default(100),
    },
    async ({ accountId: id, startDate, endDate, groupBy, limit }) => {
      const extra = groupBy === "offer_id" ? "offer_id, title" : groupBy;
      const order = ["date", "week"].includes(groupBy) ? `${groupBy} ASC` : "clicks DESC";
      const q = `SELECT ${extra}, clicks, impressions, click_through_rate, conversions, conversion_value FROM product_performance_view WHERE date BETWEEN '${startDate.replace(/[^\d-]/g, "")}' AND '${endDate.replace(/[^\d-]/g, "")}' ORDER BY ${order} LIMIT ${limit}`;
      return { period: `${startDate} → ${endDate}`, rows: await report(id, q, limit) };
    }, READ);

  tool(server, "merchant_price_competitiveness",
    "Compare your product prices with the benchmark price other merchants charge for the same products on Google (where available).",
    { accountId, country: z.string().optional().describe("Report country code, e.g. US"), limit: z.number().int().min(1).max(1000).default(100) },
    async ({ accountId: id, country, limit }) => {
      const where = country ? ` WHERE report_country_code = '${country.replace(/[^A-Za-z]/g, "").toUpperCase()}'` : "";
      const rows = await report(id, `SELECT offer_id, title, brand, report_country_code, price, benchmark_price FROM price_competitiveness_product_view${where} LIMIT ${limit}`, limit);
      return rows.map((r: any) => {
        const p = parseFloat(String(r.price)), b = parseFloat(String(r.benchmarkPrice));
        return { ...r, differencePercent: p && b ? Math.round(((p - b) / b) * 1000) / 10 : undefined };
      });
    }, READ);

  tool(server, "merchant_report",
    "Run any Merchant Reports query (MCQL), e.g. on product_performance_view, product_view (status, issues, click potential), price_competitiveness_product_view, price_insights_product_view, best_sellers_product_cluster_view, competitive_visibility_competitor_view.",
    { accountId, query: z.string().describe("e.g. SELECT offer_id, title, aggregated_reporting_context_status, item_issues FROM product_view WHERE aggregated_reporting_context_status = 'NOT_ELIGIBLE_OR_DISAPPROVED'"), limit: z.number().int().min(1).max(10000).default(500) },
    async ({ accountId: id, query, limit }) => {
      if (!/^\s*select\b/i.test(query)) throw new Error("Only SELECT queries are allowed.");
      return { rows: await report(id, query, limit) };
    }, READ);

  tool(server, "merchant_data_sources", "List the account's data sources (product feeds, API sources, supplemental feeds) with their type, label and input method.",
    { accountId },
    async ({ accountId: id }) => {
      const r = await call(() => sourcesApi().accounts.dataSources.list({ parent: acct(id), pageSize: 100 }));
      return (r.data.dataSources || []).map((d: any) => ({
        name: d.displayName, id: d.dataSourceId, input: d.input,
        type: Object.keys(d).find((k) => /DataSource$/.test(k)), details: d.primaryProductDataSource || d.supplementalProductDataSource || undefined,
        fetch: d.fileInput?.fetchSettings ? { url: d.fileInput.fetchSettings.fetchUri, frequency: d.fileInput.fetchSettings.frequency } : undefined,
      }));
    }, READ);
}
