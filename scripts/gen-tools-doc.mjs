// Generates docs/TOOLS.md from the live tool definitions of the bundled server.
// Usage: npm run docs   (after npm run build:plugin)
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const SECTIONS = [
  ["gmail_", "Gmail"], ["drive_", "Drive and sharing"], ["docs_", "Google Docs"], ["sheets_", "Google Sheets"],
  ["slides_", "Google Slides"], ["calendar_", "Google Calendar"], ["chat_", "Google Chat"], ["contacts_", "Google Contacts (People API)"],
  ["maps_", "Google Maps"], ["script_", "Apps Script"], ["gtm_", "Google Tag Manager"], ["ga_", "Google Analytics 4"],
  ["ads_", "Google Ads"], ["dialogflow_", "Dialogflow"], ["google_", "Setup"],
];

function listTools() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.join(root, "plugin/server/index.mjs")], {
      stdio: ["pipe", "pipe", "ignore"],
      env: { ...process.env, GOOGLE_WORKSPACE_MCP_DIR: path.join(root, ".docs-tmp") },
    });
    let buf = "";
    p.stdout.on("data", (d) => {
      buf += d;
      for (const line of buf.split("\n")) {
        if (!line.includes('"id":2')) continue;
        p.kill();
        resolve(JSON.parse(line).result.tools);
        return;
      }
    });
    p.on("error", reject);
    const send = (o) => p.stdin.write(JSON.stringify(o) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "docs", version: "1" } } });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    setTimeout(() => reject(new Error("timeout")), 20000);
  });
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function typeOf(s) {
  if (!s) return "any";
  if (s.enum) return s.enum.map((v) => `\`${v}\``).join(" \\| ");
  if (s.anyOf || s.oneOf) return (s.anyOf || s.oneOf).map(typeOf).join(" or ");
  if (s.type === "array") return `${typeOf(s.items)}[]`;
  if (s.type === "object") {
    if (s.properties) return `{ ${Object.keys(s.properties).join(", ")} }`;
    return "object";
  }
  return Array.isArray(s.type) ? s.type.join(" \\| ") : s.type || "any";
}

function render(tools) {
  const lines = [];
  lines.push("# Tool reference", "");
  lines.push(`Generated from the plugin's tool definitions (version ${pkg.version}, ${tools.length} tools). Regenerate with \`npm run docs\`.`, "");
  lines.push("Every tool that takes a file, document, spreadsheet or presentation ID also accepts the full Google URL.", "");
  lines.push("**Annotations:** 🔒 read-only · ✏️ makes changes · ⚠️ destructive or high-impact (Claude confirms first)", "");
  lines.push("## Contents", "");
  const grouped = SECTIONS.map(([prefix, title]) => [title, tools.filter((t) => t.name.startsWith(prefix))]).filter(([, ts]) => ts.length);
  for (const [title, ts] of grouped) lines.push(`- [${title}](#${title.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")}) (${ts.length})`);
  lines.push("");
  for (const [title, ts] of grouped) {
    lines.push(`## ${title}`, "");
    for (const t of ts) {
      const a = t.annotations || {};
      const icon = a.readOnlyHint ? "🔒" : a.destructiveHint ? "⚠️" : "✏️";
      lines.push(`### \`${t.name}\` ${icon}`, "", t.description || "", "");
      const props = t.inputSchema?.properties || {};
      const req = new Set(t.inputSchema?.required || []);
      const names = Object.keys(props);
      if (!names.length) { lines.push("_No parameters._", ""); continue; }
      lines.push("| Parameter | Type | Required | Default | Description |", "|---|---|---|---|---|");
      for (const n of names) {
        const p = props[n];
        const def = p.default !== undefined ? `\`${JSON.stringify(p.default)}\`` : "";
        lines.push(`| \`${n}\` | ${esc(typeOf(p))} | ${req.has(n) && p.default === undefined ? "yes" : ""} | ${esc(def)} | ${esc(p.description)} |`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}

const tools = await listTools();
fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/TOOLS.md"), render(tools));
fs.rmSync(path.join(root, ".docs-tmp"), { recursive: true, force: true });
console.log(`docs/TOOLS.md written (${tools.length} tools)`);
