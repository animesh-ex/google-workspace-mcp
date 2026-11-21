---
name: settings
description: Opens the google-workspace plugin's settings page to enter or change API keys (Google Maps API key, Google Ads developer token, Google Ads manager account ID). Use when the user says "settings", "open settings", "set/add/change/remove my API key", "configure Maps or Ads", "where do I put my key", or runs /google-workspace:settings.
---

# Plugin settings

1. Call `google_setup` with `action: "open_settings"`. A settings page opens in the user's browser at a private local address (`http://127.0.0.1:…`). It's only reachable from this computer, and the link expires after 10 minutes.
2. Tell the user, in one or two lines:
   - Enter the keys on that page and click **Save**. Leave a field empty to keep its current value, or tick "Remove saved value" to delete it.
   - The keys are stored only on this computer and are **not** sent through the chat.
   - Saving a Maps key tests it straight away and shows whether Google accepted it.
   - If the browser didn't open, give them the `url` from the result.
3. **Never ask the user to paste a key into the chat.** If they paste one anyway, you may save it with `configure_maps` / `configure_ads`, but suggest the settings page next time and don't repeat the key back.
4. When the user says they're done, call `google_setup` with `action: "status"`. Report what's configured (`googleMaps`, `googleAds`) without showing key values, then run a quick test:
   - **Maps:** `maps_geocode` on any address.
   - **Ads:** `ads_list_accounts`.

   If a test fails, explain the fix (billing, enabled APIs, Ads Basic access, manager ID).

Where to get the keys:
- **Maps API key:** Google Cloud → APIs & Services → Credentials → Create credentials → API key. Restrict it to Places API (New), Geocoding API and Routes API, and make sure billing is enabled.
- **Ads developer token:** Google Ads **manager** account → Tools → Setup → API Center. New tokens only work with test accounts until Basic access is approved.
