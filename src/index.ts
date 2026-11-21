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

const server = new McpServer(
  { name: "google-workspace", version: "1.1.2" },
  {
    instructions:
      "Google connector: Gmail (search/read/send/reply/drafts/attachments/labels), Drive (search/organize/upload/download/share), Docs, Sheets and Slides (create/read/edit/analyze), " +
      "Google Analytics 4 (ga_*: list properties, overview, custom reports, realtime, metadata) and Google Ads (ads_*: accounts, campaign/ad group/keyword/ad/search-term performance, GAQL queries, pause/enable, budgets). " +
      "If a tool says the user is not signed in or is missing permissions, use google_setup (status, import_credentials, sign_in, configure_ads). Tools accept file IDs or full Google URLs. " +
      "Confirm recipients and content with the user before sending email or sharing files, and confirm before any ads_set_status or ads_set_campaign_budget call because it changes ad spend.",
  },
);

registerGmail(server);
registerDrive(server);
registerDocs(server);
registerSheets(server);
registerSlides(server);
registerAnalytics(server);
registerAds(server);
registerSetup(server);

await server.connect(new StdioServerTransport());
