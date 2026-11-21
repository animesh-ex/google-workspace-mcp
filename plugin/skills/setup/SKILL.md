---
name: setup
description: Connects the google-workspace plugin to a Google account. Use when the user says "connect Google", "set up Gmail/Drive/Calendar/Chat/Maps/Analytics/Ads", "sign in to Google", runs /google-workspace:setup, or when a google-workspace tool reports not signed in, missing scopes, or Google Ads or Maps not configured.
---

# Connect Google

Walk the user through connecting the plugin, one step at a time, in plain language.

1. Call `google_setup` with `action: "status"`.
2. **Already connected:** if `signedIn` is true, `account` is shown and there are no `missingScopes`, tell the user which account is connected and skip to step 6.
3. **No OAuth client** (`clientConfigured` is false):
   - If `downloadedClientJsonFound` has a path, say so and call `google_setup` with `action: "import_credentials"`.
   - Otherwise explain how to create one, then wait for the user:
     1. Open https://console.cloud.google.com/ and create or pick a project.
     2. APIs & Services → Library: enable Gmail API, Google Drive API, Google Docs API, Google Sheets API, Google Slides API, Google Calendar API, Google Chat API, Google Analytics Data API, Google Analytics Admin API and Google Ads API (skip any they don't need). For Maps also enable Places API (New), Geocoding API and Routes API.
     3. OAuth consent screen: for a Google Workspace organization choose **Internal**; otherwise choose External and add their account under Test users.
     4. Credentials → Create credentials → OAuth client ID → type **Desktop app** → Create → Download JSON. Leave the `client_secret_*.json` in Downloads or give its path.
4. **Sign in** (not signed in, or `missingScopes` listed): call `google_setup` with `action: "sign_in"`. Tell the user a browser tab opens, to pick the Google account Claude should use, that an "unverified app" warning is expected for their own app (choose Continue), and that they have 5 minutes.
5. Confirm with `status` that `missingScopes` is gone and report the connected account.
6. **Google Ads (only if they want ads_* tools)**: if `googleAds.configured` is false, explain they need a developer token from a Google Ads manager (MCC) account → Tools → API Center (new tokens work only on test accounts until Basic access is approved). When they give it, call `google_setup` with `action: "configure_ads"`, `developerToken`, and `loginCustomerId` (their manager account ID) if they have one. Then call `ads_list_accounts` to confirm.
7. **Google Chat (Workspace accounts only)**: Google requires the Chat API to be configured once per project: Google Cloud → APIs & Services → Google Chat API → Configuration → fill in App name, Avatar URL and Description, untick "Build this Chat app as a Workspace add-on" if shown, and Save. Then call `chat_list_spaces` to confirm.
8. **Google Maps (only if they want maps_* tools)**: Maps uses an API key, not sign-in, and the project needs billing enabled. Explain: Google Cloud → APIs & Services → Credentials → Create credentials → API key, then restrict it to Places API (New), Geocoding API and Routes API. When they give the key, call `google_setup` with `action: "configure_maps"` and `mapsApiKey`, then test with `maps_geocode`.
9. **Google Analytics**: call `ga_list_properties` to confirm the signed-in account can see their GA4 properties. If the list is empty, the account needs access in GA4 Admin → Property access management.
10. Suggest a first thing to try, like "summarize my unread email from today" or "how did traffic by channel change vs last month?".
