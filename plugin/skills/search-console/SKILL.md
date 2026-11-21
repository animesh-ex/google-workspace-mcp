---
name: search-console
description: Analyzes Google Search (organic SEO) performance with Google Search Console. Use when the user asks about SEO, Google search traffic, rankings, keywords/queries, impressions or CTR from Google, "why did organic traffic drop", which pages rank, indexing problems ("is this page indexed", "not indexed", "crawled but not indexed"), canonicals, sitemaps, rich results, or SEO quick wins.
---

# Search Console (SEO)

Use the google-workspace `gsc_*` tools. Data is Google organic search only (not ads), and it lags 2–3 days.

## Start
`gsc_list_sites` lists the properties and the access level for each. Prefer a **Domain property** (`sc-domain:example.com`) when there is one, since it covers all subdomains and protocols. If the site isn't listed, the signed-in account needs to be added in Search Console → Settings → Users and permissions.

## Performance review
1. **`gsc_performance`** with `compare: true` and `dimensions: ["date"]` shows the trend and total clicks and impressions against the previous period.
2. The same tool with **`["query"]`** and **`["page"]`** shows the top queries and pages, with changes. Add `["device"]` or `["country"]` when relevant.
3. **Filters** narrow it down, e.g. a page section (`page contains /rings/`), or brand vs non-brand (`query notContains <brand>`). Always split out **branded** queries, because they hide what non-brand SEO is doing.
4. Report: totals and change, then the winners and losers (queries and pages), then device and country notes, then the likely causes.

**Explaining a traffic drop:**
- Check whether impressions fell (lost rankings or demand) or only CTR fell (SERP features, titles).
- Check which pages lost clicks, and whether the drop is tied to a date (site change, Google update, tracking change).
- Then `gsc_inspect_url` the biggest losers.

## Quick wins
`gsc_opportunities` returns three lists:
- **Striking distance** (position 4–20 with real impressions): improve on-page content, internal links and title targeting for those queries.
- **Low CTR for position:** rewrite titles and meta descriptions; consider structured data.
- **Pages losing clicks:** check indexing, content freshness, cannibalization (several pages for one query), and competitors.

Give specific actions per item, e.g. a proposed new title tag.

## Indexing and technical checks
- **`gsc_inspect_url`** shows the verdict, coverage state, Google's chosen canonical vs the user-declared one, last crawl, robots and fetch state, mobile usability and rich results.
  - **"Crawled – currently not indexed"** usually means quality or duplication.
  - **"Discovered – not indexed"** usually means crawl budget or internal links.
  - **Canonical mismatches** often explain duplicate URLs, for example from filters or parameters.
- **`gsc_sitemaps`:** list sitemaps with errors, warnings and indexed counts. `submit` a new or updated sitemap, `delete` an obsolete one. Confirm before submitting or removing.
- URL Inspection has a daily quota (about 2,000 per property), so inspect a sample of representative URLs, not thousands.

## Combine with other tools
- **GA4** (`ga_overview` with breakdown `landing_page` or channel `Organic Search`): what organic visitors do after they land.
- **Tag Manager / website scan:** whether tracking or site changes coincide with ranking changes.
- **Reports:** `docs_create`, or `sheets_create` with charts, for a shareable SEO report.
