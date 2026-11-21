/**
 * A local settings page for API keys. It runs on 127.0.0.1 only, behind a random one-time token, so keys
 * typed into it go straight to the config folder and never pass through the chat.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { CONFIG_DIR, env } from "./auth.js";

export const MAPS_FILE = path.join(CONFIG_DIR, "maps.json");
export const ADS_FILE = path.join(CONFIG_DIR, "ads.json");

const readJson = (f: string): Record<string, string> => {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
};
const writeJson = (f: string, data: Record<string, string | undefined>) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v));
  if (!Object.keys(clean).length) { if (fs.existsSync(f)) fs.unlinkSync(f); return; }
  fs.writeFileSync(f, JSON.stringify(clean, null, 2), { mode: 0o600 });
};
const mask = (v?: string) => (v ? `••••${v.slice(-4)}` : "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function testMaps(key: string): Promise<string> {
  try {
    const r = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent("Googleplex")}&key=${encodeURIComponent(key)}`);
    const j: any = await r.json();
    if (j.status === "OK") return "✅ Key works (Geocoding API answered).";
    return `⚠️ Saved, but Google answered "${j.status}"${j.error_message ? `: ${j.error_message}` : ""}. Check that billing is on and the Geocoding, Places (New) and Routes APIs are enabled for this key.`;
  } catch (e: any) { return `⚠️ Saved, but the test call failed: ${e.message}`; }
}

function page(token: string, message = ""): string {
  const maps = readJson(MAPS_FILE), ads = readJson(ADS_FILE);
  const envMaps = env("GOOGLE_MAPS_API_KEY"), envAds = env("GOOGLE_ADS_DEVELOPER_TOKEN"), envMgr = env("GOOGLE_ADS_LOGIN_CUSTOMER_ID");
  const row = (label: string, name: string, current: string | undefined, override: string | undefined, help: string, secret: boolean) => `
    <div class="field">
      <label for="${name}">${label}</label>
      <div class="cur">${override ? `In use from the plugin's settings form: <b>${esc(secret ? mask(override) : override)}</b> (overrides this page)` : current ? `Saved: <b>${esc(secret ? mask(current) : current)}</b>` : "Not set"}</div>
      <input id="${name}" name="${name}" type="${secret ? "password" : "text"}" autocomplete="off" spellcheck="false" placeholder="${current ? "Leave empty to keep the saved value" : ""}">
      <label class="clear"><input type="checkbox" name="clear_${name}"> Remove saved value</label>
      <p class="help">${help}</p>
    </div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Google Workspace plugin settings</title>
<style>
  :root{color-scheme:light dark;--bg:#fff;--fg:#1f1f1f;--muted:#5f6368;--line:#dadce0;--accent:#1a73e8;--ok:#e6f4ea;--okfg:#137333}
  @media (prefers-color-scheme:dark){:root{--bg:#1f1f1f;--fg:#e8eaed;--muted:#9aa0a6;--line:#3c4043;--accent:#8ab4f8;--ok:#1e3a29;--okfg:#81c995}}
  body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
  main{max-width:640px;margin:0 auto;padding:32px 16px}
  h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
  p.sub{color:var(--muted);margin:0 0 20px}
  .field{border:1px solid var(--line);border-radius:12px;padding:16px;margin:12px 0}
  label{font-weight:600;display:block}.cur{color:var(--muted);font-size:13px;margin:2px 0 8px}
  input[type=password],input[type=text]{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
  input:focus{outline:2px solid var(--accent);outline-offset:1px}
  .clear{font-weight:400;font-size:13px;margin-top:8px;color:var(--muted)}.help{font-size:13px;color:var(--muted);margin:8px 0 0}
  button{background:var(--accent);color:#fff;border:0;border-radius:999px;padding:10px 22px;font:inherit;font-weight:600;cursor:pointer;margin-top:12px}
  @media (prefers-color-scheme:dark){button{color:#202124}}
  .msg{background:var(--ok);color:var(--okfg);border-radius:10px;padding:12px 14px;white-space:pre-line}
  a{color:var(--accent)}
</style></head><body><main>
<h1>Google Workspace plugin settings</h1>
<p class="sub">Keys are saved only on this computer in <code>${esc(CONFIG_DIR)}</code> and are never shown in the chat.</p>
${message ? `<div class="msg" role="status">${esc(message)}</div>` : ""}
<form method="post" action="/${token}">
  <h2>Google Maps</h2>
  ${row("Maps API key", "maps_api_key", maps.apiKey, envMaps, 'Google Cloud → APIs &amp; Services → Credentials → Create credentials → API key. Restrict it to Places API (New), Geocoding API and Routes API; billing must be enabled. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Open Credentials</a>', true)}
  <h2>Google Ads</h2>
  ${row("Developer token", "ads_token", ads.developerToken, envAds, 'Google Ads manager account → Tools → Setup → API Center. New tokens work on test accounts until Basic access is approved. <a href="https://ads.google.com/aw/apicenter" target="_blank" rel="noopener">Open API Center</a>', true)}
  ${row("Manager (MCC) account ID", "ads_manager", ads.loginCustomerId, envMgr, "10-digit ID like 123-456-7890. Leave empty if you access ad accounts directly.", false)}
  <button type="submit">Save settings</button>
</form>
<p class="help">After saving you can close this tab. The page stops working after 10 minutes; ask Claude to open settings again if you need it.</p>
</main></body></html>`;
}

export interface SettingsSession { url: string; done: Promise<string[]> }

/** Start the settings page. Resolves `done` with the list of changes once the user saves (or [] on timeout). */
export async function openSettingsPage(timeoutMs = 10 * 60 * 1000): Promise<SettingsSession> {
  const token = randomBytes(18).toString("base64url");
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;
  let resolveDone!: (c: string[]) => void;
  const done = new Promise<string[]>((r) => (resolveDone = r));
  const timer = setTimeout(() => { server.close(); resolveDone([]); }, timeoutMs);

  server.on("request", (req, res) => {
    // Only this exact page on loopback: block other paths, other Host headers (DNS rebinding) and cross-site posts.
    const okHost = req.headers.host === `127.0.0.1:${port}`;
    const okPath = req.url === `/${token}`;
    const okOrigin = req.method !== "POST" || !req.headers.origin || req.headers.origin === origin;
    if (!okHost || !okPath || !okOrigin) { res.writeHead(404).end(); return; }
    const headers = { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" };
    if (req.method === "GET") { res.writeHead(200, headers).end(page(token)); return; }
    if (req.method !== "POST") { res.writeHead(405).end(); return; }
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => {
      const f = new URLSearchParams(body);
      const changes: string[] = [];
      const maps = readJson(MAPS_FILE), ads = readJson(ADS_FILE);
      let mapsKeyToTest: string | undefined;
      if (f.get("clear_maps_api_key")) { if (maps.apiKey) changes.push("Maps API key removed"); delete maps.apiKey; }
      else if (f.get("maps_api_key")?.trim()) { maps.apiKey = f.get("maps_api_key")!.trim(); mapsKeyToTest = maps.apiKey; changes.push("Maps API key saved"); }
      if (f.get("clear_ads_token")) { if (ads.developerToken) changes.push("Ads developer token removed"); delete ads.developerToken; }
      else if (f.get("ads_token")?.trim()) { ads.developerToken = f.get("ads_token")!.trim(); changes.push("Ads developer token saved"); }
      if (f.get("clear_ads_manager")) { if (ads.loginCustomerId) changes.push("Ads manager ID removed"); delete ads.loginCustomerId; }
      else if (f.get("ads_manager")?.trim()) { ads.loginCustomerId = f.get("ads_manager")!.replace(/\D/g, ""); changes.push("Ads manager ID saved"); }
      writeJson(MAPS_FILE, maps);
      writeJson(ADS_FILE, ads);
      let msg = changes.length ? changes.join("\n") : "Nothing changed.";
      if (mapsKeyToTest) msg += "\n" + (await testMaps(mapsKeyToTest));
      if (changes.length && (env("GOOGLE_MAPS_API_KEY") || env("GOOGLE_ADS_DEVELOPER_TOKEN"))) msg += "\nNote: a value set in the plugin's settings form takes priority over this page.";
      res.writeHead(200, headers).end(page(token, msg + "\nYou can close this tab."));
      if (changes.length) { clearTimeout(timer); setTimeout(() => server.close(), 60_000); resolveDone(changes); }
    });
  });
  return { url: `${origin}/${token}`, done };
}
