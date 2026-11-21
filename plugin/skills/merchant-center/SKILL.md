---
name: merchant-center
description: Audits and reports on Google Merchant Center (Google Shopping) through the Merchant API. Use when the user asks about Merchant Center, Google Shopping, product feeds, disapproved or pending products, feed errors/issues, free listings, Shopping ads product performance, which products get clicks, price competitiveness vs other sellers, best sellers, or feed data sources.
---

# Google Merchant Center

Use the google-workspace `merchant_*` tools, built on Google's Merchant API v1. The old Content API for Shopping was retired in 2026.

## Start
1. `merchant_list_accounts` lists the accounts. Ask which one if there are several (for example, a multi-client account with sub-accounts).
2. **One-time registration:** the Merchant API only works after this Google Cloud project is registered with the Merchant Center account.
   - Check with `merchant_registration` → `status`.
   - If it isn't registered, explain that, and after the user agrees, call `register` with their `developerEmail` (normally the signed-in account).
   - If it fails with permission errors, a Merchant Center **admin** must do it, or add the signed-in account as an admin.
3. Also make sure the **Merchant API** is enabled in the same Cloud project as the OAuth client.

## Product health audit
1. **`merchant_product_status`** gives active, pending, disapproved and expiring counts per destination (Shopping ads, free listings and so on) and country, plus the **top issues ranked by how many products they affect**, with Google's fix and help link.
2. **`merchant_list_products`** with `onlyWithIssues: true` gives the affected products, with their issues and disapproved destinations. `merchant_get_product` shows every attribute of one product.
3. Group the problems by root cause and say where each fix belongs:
   - **Feed or source data:** missing GTIN/brand, wrong price, image too small, missing shipping or tax. Fix it in the store or feed (for example a Magento or Shopify feed extension).
   - **Website:** price or availability mismatch with the landing page, broken links, missing structured data.
   - **Account level:** policies, misrepresentation, shipping settings, business info. Fix it in Merchant Center settings.
4. Prioritize by products affected multiplied by their importance (best sellers first, cross-checked with `merchant_performance`).

`merchant_data_sources` shows which feeds supply the products (primary or supplemental), their input method and fetch schedule, so you can say where to fix things.

## Performance
- **`merchant_performance`:** clicks, impressions, CTR, conversions and conversion value from free listings and Shopping ads. Group by `offer_id` (products), `date`/`week` (trend), `brand`, `category_l1`, `marketing_method` (ADS vs ORGANIC) or `customer_country_code`.
- Flag products with many impressions and few clicks (price, image or title problems), and products with clicks but no conversions (landing page, price or stock).
- Conversions depend on tracking. If they're zero everywhere, check conversion tracking: GA4 linking or the Google Ads conversion tag. The `tag-manager` skill can help.

## Pricing and market insight
- **`merchant_price_competitiveness`:** your price vs the benchmark price other sellers charge for the same product, as a % difference. Prices well above benchmark often explain low CTR.
- **`merchant_report`** with MCQL covers anything else, for example:
  - Disapproved products: `SELECT offer_id, title, aggregated_reporting_context_status, item_issues FROM product_view WHERE aggregated_reporting_context_status = 'NOT_ELIGIBLE_OR_DISAPPROVED'`
  - Products with traffic potential: `SELECT offer_id, title, click_potential, click_potential_rank FROM product_view ORDER BY click_potential_rank LIMIT 50`
  - Best sellers in a category: query `best_sellers_product_cluster_view` (report date, granularity WEEKLY/MONTHLY, country, category), with rank and relative demand.
- Data needs the account to be eligible (enough traffic, the right country). If a view returns nothing, say so.

## Changes
These tools read and report. They don't edit products, because products normally come from the store's feed and API edits would be overwritten or conflict with it. Recommend the fix in the feed or store. Only register the project after the user agrees.

## Report
Present: product health summary, then top issues with fixes, then performance highlights, then pricing insight, then a prioritized action list. For a shareable version, use `docs_create` or `sheets_create` (one row per product issue).
