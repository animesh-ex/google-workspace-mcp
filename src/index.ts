#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerGmail } from "./tools/gmail.js";
import { registerDrive } from "./tools/drive.js";
import { registerDocs } from "./tools/docs.js";
import { registerSheets } from "./tools/sheets.js";
import { registerSlides } from "./tools/slides.js";
import { registerSetup } from "./tools/setup.js";
import { registerAnalytics } from "./tools/analytics.js";
import { registerAds } from "./tools/ads.js";
import { registerCalendar } from "./tools/calendar.js";
import { registerChat } from "./tools/chat.js";
import { registerMaps } from "./tools/maps.js";
import { registerContacts } from "./tools/contacts.js";
import { registerDialogflow } from "./tools/dialogflow.js";
import { registerAppsScript } from "./tools/appsscript.js";
import { registerGtm } from "./tools/gtm.js";
import { registerSearchConsole } from "./tools/searchconsole.js";
import { registerMerchant } from "./tools/merchant.js";

const server = new McpServer(
  { name: "google-workspace", version: "1.8.0" },
  {
    instructions:
      "Google connector: Gmail (search/read/send/reply/drafts/attachments/labels), Drive (search/organize/upload/download/share), Docs, Sheets and Slides (create/read/edit/analyze), " +
      "Google Calendar (calendar_*: list/search events, create/update/cancel, Meet links, RSVP, free time), Google Chat (chat_*: spaces, read/search/send messages, DMs), Google Contacts via People API (contacts_*: search contacts/other contacts/directory, create, update, groups), Dialogflow ES and CX (dialogflow_*: intents, test messages), Apps Script (script_*: create scripts bound to Sheets/Docs, edit files, deploy, run functions, execution logs), Google Tag Manager (gtm_*: scan a website's tracking, read containers, create workspaces/tags/triggers/variables incl. GA4 ecommerce events, versions, publish), " +
      "Google Maps (maps_*: business search, full place details with Google AI summaries and reviews, photos, nearby, geocoding, directions, distance matrix), " +
      "Google Search Console (gsc_*: organic search performance with period comparison, SEO opportunities, URL inspection, sitemaps), Google Merchant Center via the Merchant API (merchant_*: product status and issues, products, Shopping performance, price competitiveness, MCQL reports, data sources, one-time project registration), Google Analytics 4 (ga_*: list properties, overview, custom reports, realtime, metadata) and Google Ads (ads_*: accounts, campaign/ad group/keyword/ad/search-term performance, GAQL queries, negative keywords, pause/enable, budgets). " +
      "If a tool says the user is not signed in, is missing permissions, or Ads/Maps aren't configured, use google_setup (open_settings to enter API keys on a local settings page, status, import_credentials, sign_in). Never ask the user to paste API keys into the chat. Tools accept file IDs or full Google URLs. When the user names a person instead of an email, resolve it with contacts_search first. " +
      "Confirm with the user before sending email or Chat messages, sharing files, inviting people to or cancelling calendar events, and before any ads_set_status, ads_set_campaign_budget or ads_add_negative_keywords call, and never call gtm_publish without explicit approval because it changes ad spend.",
  },
);

registerGmail(server);
registerDrive(server);
registerDocs(server);
registerSheets(server);
registerSlides(server);
registerCalendar(server);
registerChat(server);
registerMaps(server);
registerContacts(server);
registerDialogflow(server);
registerAppsScript(server);
registerGtm(server);
registerSearchConsole(server);
registerMerchant(server);
registerAnalytics(server);
registerAds(server);
registerSetup(server);

await server.connect(new StdioServerTransport());
