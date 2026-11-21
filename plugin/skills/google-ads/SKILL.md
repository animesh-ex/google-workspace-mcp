---
name: google-ads
description: Analyzes and manages Google Ads through the Google Ads API. Use when the user asks how their Google Ads are doing, about campaign/keyword/ad performance, cost, conversions, CPA or ROAS, wasted spend, search terms, negative keywords, which campaigns to pause or scale, budget changes, or a Google Ads report or audit.
---

# Google Ads

Use the google-workspace `ads_*` tools. They need a developer token: if a tool says Ads isn't configured, follow the setup skill (`google_setup` → `configure_ads`).

## Start
1. `ads_list_accounts` lists the accounts this login can reach. If there's a manager (MCC) account, client accounts appear under it; pass `loginCustomerId` (the manager ID) when needed. Ask which account if there are several.
2. Confirm the date range. The default is the last 30 days; compare with the previous period when judging trends.

## Performance review
Run these and summarize in plain language:
1. **`ads_campaign_performance`:** spend, clicks, CTR, CPC, conversions, cost/conversion and ROAS per campaign. Call out the top spenders, the best and worst ROAS, and campaigns limited by budget.
2. **`ads_ad_group_performance`** and **`ads_keyword_performance`** for the biggest campaigns. Look for keywords with high spend and zero conversions, quality scores under 5, and match types that are too broad.
3. **`ads_search_terms`** (use `minCost`): the actual searches people typed. Mark irrelevant or never-converting terms as waste, and converting terms that aren't keywords yet as opportunities.
4. **`ads_ad_performance`:** compare RSA headlines and descriptions by CTR and conversion rate.

Report as: **Headline numbers → What's working → Wasted spend (amount) → Recommended actions**, each action with its expected impact. Numbers are in the account currency.

If conversions show 0 everywhere, conversion tracking is probably broken. Say so before judging campaigns, and check GA4 (`ga_overview` with breakdown `campaign` or `source_medium`) for on-site behavior.

Use `ads_query` (GAQL) for anything the presets don't cover: device or geo breakdowns, hour of day, asset performance or change history.

## Making changes
Every change affects live spend. For each one:
1. Show exactly what will change (campaign names, IDs, old → new values, and the search terms for negatives).
2. Get an explicit yes from the user in chat.
3. Run with `validateOnly: true` first if anything is uncertain, then for real.
4. Report what changed.

Available actions:
- **`ads_add_negative_keywords`:** block wasteful search terms on a campaign. Use PHRASE match by default and EXACT for single risky terms.
- **`ads_set_status`:** pause or enable campaigns, ad groups, ads (`adGroupId~adId`) or keywords (`adGroupId~criterionId`). Enabling restarts spending.
- **`ads_set_campaign_budget`:** change the daily budget. Warn if the budget is shared with other campaigns.

Never raise budgets or enable paused items unless the user asks. When recommending a budget increase, give the reasoning and let them decide.

## Reporting
For a shareable report, write it with `docs_create`, with tables via `docs_insert_table`. For data, use `sheets_create` plus `sheets_add_chart`. Offer `drive_share` or `gmail_send` to the team.
