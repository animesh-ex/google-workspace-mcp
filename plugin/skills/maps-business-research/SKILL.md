---
name: maps-business-research
description: Pulls business details from Google Maps (Places API) and summarizes them. Use when the user asks to find businesses, competitors, stores, suppliers or leads in an area, wants a business's phone, website, hours, ratings or reviews, asks "what do customers say about X", wants Google's AI summary of a place, a list of places exported to a sheet, a competitor/market scan, directions, or travel time between locations.
---

# Business research with Google Maps

Use the google-workspace `maps_*` tools. They need a Maps Platform API key: if a tool says Maps isn't configured, follow the setup skill (`google_setup` → `configure_maps`).

## Find businesses
- `maps_search_places` with a natural query ("jewelry stores in Surat", "lab-grown diamond retailers New Jersey"). Use `maxResults` up to 60, `minRating`, `openNow`, `includedType` (e.g. `jewelry_store`) and `near` + `radiusMeters` to focus an area.
- Set `includeSummaries: true` to get Google's AI review summary and overview for each result in one call.
- `maps_nearby` when you have coordinates and place types (get coordinates from `maps_geocode`).

## Pull all details for a business
`maps_place_details` with the `placeId` returns everything Google has:
- **Contact:** phone, website, address and parts, plus code, Maps links (directions, reviews, photos).
- **Status:** opening hours (regular and secondary, e.g. delivery), open now, business status (operational or closed).
- **Reputation:** rating, review count, up to 5 recent reviews.
- **Google's AI summaries:** `aiOverview`, `aiDescription`, `aiReviewSummary`, `neighborhoodSummary`, plus `editorialSummary`.
- **Offering:** price range, types, service options and amenities (delivery, in-store pickup, wheelchair access, parking, payment methods and more).

Some fields, especially the AI summaries, only exist for some places and regions. Say "not available" rather than guessing.

`maps_place_photos` turns photo references into viewable image links.

## Summarize
For each business, write a short profile:
1. **One-line positioning:** what they are and who they serve, from the AI overview or editorial summary and types.
2. **Reputation:** rating and review count, then the main praise and complaints from `aiReviewSummary` and the recent reviews. Quote at most a few words from any review.
3. **Practical:** hours, phone, website, address, and price range if present.
4. **Notable:** amenities, service options or anything distinctive.

For several businesses (competitor or market scans), add a comparison: a ranking by rating × review volume, a price positioning, common complaints you could win on, and gaps (e.g. no website, closed Sundays).

## Export
When the user wants a list they can work with, create a Google Sheet with `sheets_create`. Use one row per business with columns: Name, Category, Rating, Reviews, Phone, Website, Address, Hours, Price, AI summary, Maps link. Then offer `sheets_analyze`, a chart, or `drive_share`. For a write-up, use `docs_create`.

## Directions and travel time
- `maps_directions` for one trip: traffic-aware time, distance, steps and a `mapsUrl`. Use `departureTime` for a future trip and `stops` for multi-stop routes.
- `maps_distance_matrix` for many-to-many ("which of our 3 stores is closest to each of these 10 customers").

Always include the Google Maps links in your answer. Data comes from Google Maps, so present it as such and don't invent details.
