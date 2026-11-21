import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import open from "open";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { authStatus, importCredentials, resetAuthCache, runInteractiveAuth, TOKEN_PATH } from "../auth.js";
import { drive, tool } from "../util.js";
import { loadAdsConfig, ADS_CONFIG_PATH } from "./ads.js";

function findDownloadedClientJson(): string | undefined {
  const dl = path.join(os.homedir(), "Downloads");
  try {
    return fs.readdirSync(dl)
      .filter((f) => /^client_secret_.*\.json$/i.test(f))
      .map((f) => path.join(dl, f))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  } catch {
    return undefined;
  }
}

export function registerSetup(server: McpServer) {
  tool(server, "google_setup",
    "Set up or check the Google connection. Actions: 'status' (what's configured), 'import_credentials' (copy a downloaded Desktop-app OAuth client JSON into place; omit path to use the newest client_secret_*.json in Downloads), 'sign_in' (opens the browser for Google consent and waits up to 5 minutes), 'sign_out' (deletes the saved token), 'configure_ads' (save a Google Ads developer token and optional manager account ID).",
    {
      action: z.enum(["status", "import_credentials", "sign_in", "sign_out", "configure_ads"]),
      credentialsPath: z.string().optional().describe("For import_credentials: path to the downloaded client_secret_*.json"),
      developerToken: z.string().optional().describe("For configure_ads: Google Ads API developer token"),
      loginCustomerId: z.string().optional().describe("For configure_ads: manager (MCC) account ID, if accounts are accessed through one"),
    },
    async ({ action, credentialsPath, developerToken, loginCustomerId }) => {
      if (action === "status") {
        const s = authStatus();
        let account: unknown;
        if (s.clientConfigured && s.signedIn) {
          try {
            account = (await drive().about.get({ fields: "user(displayName,emailAddress)" })).data.user;
          } catch (e: any) {
            account = `Saved token did not work (${e.message}). Run sign_in again.`;
          }
        }
        const ads = loadAdsConfig();
        return {
          ...s, account, downloadedClientJsonFound: s.clientConfigured ? undefined : findDownloadedClientJson(),
          googleAds: ads ? { configured: true, loginCustomerId: ads.loginCustomerId } : { configured: false, configPath: ADS_CONFIG_PATH },
        };
      }
      if (action === "configure_ads") {
        if (!developerToken) throw new Error("developerToken is required (Google Ads → Tools → API Center).");
        fs.mkdirSync(path.dirname(ADS_CONFIG_PATH), { recursive: true });
        fs.writeFileSync(ADS_CONFIG_PATH, JSON.stringify({ developerToken, loginCustomerId: loginCustomerId?.replace(/\D/g, "") || undefined }, null, 2), { mode: 0o600 });
        return { saved: ADS_CONFIG_PATH, next: "Try ads_list_accounts." };
      }
      if (action === "import_credentials") {
        const src = credentialsPath || findDownloadedClientJson();
        if (!src) throw new Error("No path given and no client_secret_*.json found in Downloads.");
        return { imported: importCredentials(src), next: "Call google_setup with action 'sign_in'." };
      }
      if (action === "sign_out") {
        if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
        resetAuthCache();
        return { signedOut: true };
      }
      let url = "";
      await runInteractiveAuth((u) => open(u), (u) => (url = u));
      resetAuthCache();
      const user = (await drive().about.get({ fields: "user(displayName,emailAddress)" })).data.user;
      return { signedIn: true, account: user, authUrlUsed: url ? "opened in browser" : undefined };
    },
    { readOnlyHint: false, openWorldHint: true });
}
