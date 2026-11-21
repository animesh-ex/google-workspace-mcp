import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { URL } from "node:url";
import { OAuth2Client } from "google-auth-library";

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // read, send, reply, label (no permanent delete)
  "https://www.googleapis.com/auth/drive", // full Drive: files, folders, sharing
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/analytics.readonly", // GA4 reports and property list
  "https://www.googleapis.com/auth/adwords", // Google Ads reporting and changes
  "https://www.googleapis.com/auth/calendar", // Calendar: read, create, update, RSVP, free/busy
  "https://www.googleapis.com/auth/chat.spaces.readonly", // Chat: list spaces
  "https://www.googleapis.com/auth/chat.messages", // Chat: read and send messages
  "https://www.googleapis.com/auth/chat.memberships.readonly", // Chat: list members
  "https://www.googleapis.com/auth/chat.spaces.create", // Chat: start a direct message
  "https://www.googleapis.com/auth/contacts", // People API: read and manage contacts
  "https://www.googleapis.com/auth/contacts.other.readonly", // People API: "other contacts" (people you've emailed)
  "https://www.googleapis.com/auth/directory.readonly", // People API: Workspace company directory
  "https://www.googleapis.com/auth/dialogflow", // Dialogflow ES and CX agents
  "https://www.googleapis.com/auth/script.projects", // Apps Script: create and edit projects
  "https://www.googleapis.com/auth/script.deployments", // Apps Script: versions and deployments
  "https://www.googleapis.com/auth/script.processes", // Apps Script: execution logs
  // Scopes that scripts commonly need when run through the Apps Script API (scripts.run):
  "https://www.googleapis.com/auth/script.send_mail",
  "https://www.googleapis.com/auth/script.external_request",
  "https://www.googleapis.com/auth/script.scriptapp",
  "https://www.googleapis.com/auth/script.container.ui",
];

export const CONFIG_DIR =
  process.env.GOOGLE_WORKSPACE_MCP_DIR || path.join(os.homedir(), ".google-workspace-mcp");
export const CREDENTIALS_PATH =
  process.env.GOOGLE_OAUTH_CREDENTIALS || path.join(CONFIG_DIR, "credentials.json");
export const TOKEN_PATH = path.join(CONFIG_DIR, "token.json");

interface ClientSecrets {
  client_id: string;
  client_secret: string;
}

function loadClientSecrets(): ClientSecrets {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `OAuth client file not found at ${CREDENTIALS_PATH}. Create a "Desktop app" OAuth client in Google Cloud Console, download the JSON, and save it there (see README).`,
    );
  }
  const raw = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
  const c = raw.installed || raw.web;
  if (!c?.client_id || !c?.client_secret) {
    throw new Error(`${CREDENTIALS_PATH} does not look like a Google OAuth client JSON.`);
  }
  return { client_id: c.client_id, client_secret: c.client_secret };
}

function saveToken(tokens: object) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
}

let cached: OAuth2Client | null = null;

/** Returns an authorized client, or throws with instructions if not yet authorized. */
export function getAuthClient(): OAuth2Client {
  if (cached) return cached;
  const { client_id, client_secret } = loadClientSecrets();
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(
      `Not signed in to Google yet. Call the google_setup tool with action "sign_in" (or run /google-workspace:setup).`,
    );
  }
  const client = new OAuth2Client({ clientId: client_id, clientSecret: client_secret });
  const stored = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  client.setCredentials(stored);
  // Persist refreshed access tokens (keep the refresh token, which Google only sends once).
  client.on("tokens", (t) => saveToken({ ...stored, ...t, refresh_token: t.refresh_token || stored.refresh_token }));
  cached = client;
  return client;
}

export function resetAuthCache() {
  cached = null;
}

/** Google Cloud project number of the OAuth client (the numeric prefix of a Google client ID), if known. */
export function cloudProjectNumber(): string | undefined {
  try {
    return loadClientSecrets().client_id.match(/^(\d+)-/)?.[1];
  } catch {
    return undefined;
  }
}

export function authStatus() {
  let clientConfigured = false;
  let clientError: string | undefined;
  try {
    loadClientSecrets();
    clientConfigured = true;
  } catch (e: any) {
    clientError = e.message;
  }
  const signedIn = fs.existsSync(TOKEN_PATH);
  let missingScopes: string[] | undefined;
  if (signedIn) {
    const granted: string = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")).scope || "";
    missingScopes = SCOPES.filter((s) => !granted.includes(s)).map((s) => s.replace("https://www.googleapis.com/auth/", ""));
  }
  return {
    configDir: CONFIG_DIR,
    credentialsPath: CREDENTIALS_PATH,
    clientConfigured,
    clientError,
    cloudProjectNumber: cloudProjectNumber(),
    signedIn,
    missingScopes: missingScopes?.length ? missingScopes : undefined,
    scopeNote: missingScopes?.length ? "Some permissions were added since you signed in. Run sign_in again to grant them." : undefined,
  };
}

/** Copy a downloaded OAuth client JSON into place after validating it. */
export function importCredentials(sourcePath: string) {
  const raw = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
  const c = raw.installed || raw.web;
  if (!c?.client_id || !c?.client_secret) throw new Error(`${sourcePath} is not a Google OAuth client JSON file.`);
  if (!raw.installed) throw new Error(`This OAuth client is type "Web". Create one of type "Desktop app" instead.`);
  fs.mkdirSync(path.dirname(CREDENTIALS_PATH), { recursive: true });
  fs.copyFileSync(sourcePath, CREDENTIALS_PATH);
  resetAuthCache();
  return CREDENTIALS_PATH;
}

/** Interactive loopback OAuth flow; used by the auth CLI and the google_setup tool. */
export async function runInteractiveAuth(
  openBrowser: (url: string) => Promise<unknown>,
  onUrl?: (url: string) => void,
  timeoutMs = 5 * 60 * 1000,
): Promise<void> {
  const { client_id, client_secret } = loadClientSecrets();

  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

  const client = new OAuth2Client({ clientId: client_id, clientSecret: client_secret, redirectUri });
  const authUrl = client.generateAuthUrl({ access_type: "offline", prompt: "consent select_account", scope: SCOPES });

  const code = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for Google sign-in (5 minutes).")), timeoutMs);
    server.on("request", (req, res) => {
      const url = new URL(req.url || "/", redirectUri);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error");
      const c = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        err
          ? `<h2>Authorization failed: ${err.replace(/[<>&"']/g, "")}</h2>`
          : "<h2>Google Workspace is connected. You can close this tab and return to Claude.</h2>",
      );
      clearTimeout(timer);
      if (err) reject(new Error(err));
      else if (c) resolve(c);
    });
    console.error(`\nOpening your browser to sign in with Google...\nIf it doesn't open, visit:\n\n${authUrl}\n`);
    onUrl?.(authUrl);
    openBrowser(authUrl).catch(() => {});
  }).finally(() => server.close());

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    console.error("Warning: no refresh token returned; you may need to re-run auth when the access token expires.");
  }
  saveToken(tokens);
  console.error(`Saved token to ${TOKEN_PATH}`);
}
