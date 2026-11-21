import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chat as chatApi, type chat_v1 } from "@googleapis/chat";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE } from "../util.js";

const chat = () => chatApi({ version: "v1", auth: getAuthClient() });

const spaceName = (s: string) => (s.startsWith("spaces/") ? s : `spaces/${s.replace(/^.*\/room\//, "").replace(/\?.*$/, "")}`);

function msg(m: chat_v1.Schema$Message) {
  return {
    name: m.name, sender: m.sender?.displayName || m.sender?.name, senderType: m.sender?.type,
    time: m.createTime, text: m.text || m.formattedText, thread: m.thread?.name,
    attachments: m.attachment?.map((a) => a.contentName) || undefined,
  };
}

async function dmSpace(email: string, create: boolean): Promise<string> {
  const c = chat();
  try {
    const r = await c.spaces.findDirectMessage({ name: `users/${email}` });
    if (r.data.name) return r.data.name;
  } catch (e: any) {
    if (e?.code !== 404 && e?.response?.status !== 404) throw e;
  }
  if (!create) throw new Error(`No direct message with ${email} yet. Pass createDm: true to start one.`);
  const r = await c.spaces.setup({ requestBody: { space: { spaceType: "DIRECT_MESSAGE" }, memberships: [{ member: { name: `users/${email}`, type: "HUMAN" } }] } });
  return r.data.name!;
}

export function registerChat(server: McpServer) {
  tool(server, "chat_list_spaces", "List Google Chat spaces (rooms, group chats and direct messages) you belong to.",
    { type: z.enum(["any", "SPACE", "GROUP_CHAT", "DIRECT_MESSAGE"]).default("any"), pageSize: z.number().int().min(1).max(1000).default(100) },
    async ({ type, pageSize }) => {
      const r = await chat().spaces.list({ pageSize, filter: type === "any" ? undefined : `spaceType = "${type}"` });
      return (r.data.spaces || []).map((s) => ({
        name: s.name, displayName: s.displayName || undefined, type: s.spaceType, lastActive: s.lastActiveTime, members: s.membershipCount?.joinedDirectHumanUserCount,
      }));
    }, READ);

  tool(server, "chat_list_messages",
    "Read recent messages in a space (newest first). Use a space name like 'spaces/AAAA…', or an email to read your direct messages with that person.",
    {
      space: z.string().optional(), dmWithEmail: z.string().optional(),
      sinceHours: z.number().optional().describe("Only messages from the last N hours"),
      pageSize: z.number().int().min(1).max(1000).default(50),
    },
    async ({ space, dmWithEmail, sinceHours, pageSize }) => {
      const parent = space ? spaceName(space) : dmWithEmail ? await dmSpace(dmWithEmail, false) : undefined;
      if (!parent) throw new Error("Provide space or dmWithEmail.");
      const filter = sinceHours ? `createTime > "${new Date(Date.now() - sinceHours * 3600000).toISOString()}"` : undefined;
      const r = await chat().spaces.messages.list({ parent, pageSize, orderBy: "createTime desc", filter });
      return { space: parent, messages: (r.data.messages || []).map(msg) };
    }, READ);

  tool(server, "chat_send_message",
    "Send a Google Chat message to a space, or as a direct message to a person by email. Can reply in a thread. Confirm the recipient and text with the user first.",
    {
      space: z.string().optional(), toEmail: z.string().optional().describe("Send as a direct message to this person"),
      text: z.string().describe("Supports Chat formatting: *bold*, _italic_, ~strike~, `code`, <https://link|label>, <users/{email}> to @mention"),
      threadName: z.string().optional().describe("Reply in this thread (thread name from chat_list_messages)"),
      createDm: z.boolean().default(true).describe("Start a new DM if none exists with toEmail"),
    },
    async ({ space, toEmail, text, threadName, createDm }) => {
      const parent = space ? spaceName(space) : toEmail ? await dmSpace(toEmail, createDm) : undefined;
      if (!parent) throw new Error("Provide space or toEmail.");
      const r = await chat().spaces.messages.create({
        parent, requestBody: { text, thread: threadName ? { name: threadName } : undefined },
        messageReplyOption: threadName ? "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD" : undefined,
      });
      return { sent: true, space: parent, message: r.data.name, thread: r.data.thread?.name };
    }, WRITE);

  tool(server, "chat_list_members", "List the members of a Chat space.",
    { space: z.string(), pageSize: z.number().int().min(1).max(1000).default(100) },
    async ({ space, pageSize }) => {
      const r = await chat().spaces.members.list({ parent: spaceName(space), pageSize });
      return (r.data.memberships || []).map((m) => ({ member: m.member?.displayName || m.member?.name, type: m.member?.type, role: m.role, state: m.state }));
    }, READ);

  tool(server, "chat_search_messages", "Find messages in a space that contain some text (searches the most recent messages, up to 1000).",
    { space: z.string(), text: z.string(), sinceHours: z.number().optional() },
    async ({ space, text, sinceHours }) => {
      const parent = spaceName(space);
      const filter = sinceHours ? `createTime > "${new Date(Date.now() - sinceHours * 3600000).toISOString()}"` : undefined;
      const q = text.toLowerCase();
      const hits: ReturnType<typeof msg>[] = [];
      let pageToken: string | undefined;
      let seen = 0;
      do {
        const r = await chat().spaces.messages.list({ parent, pageSize: 500, orderBy: "createTime desc", filter, pageToken });
        for (const m of r.data.messages || []) if ((m.text || "").toLowerCase().includes(q)) hits.push(msg(m));
        seen += r.data.messages?.length || 0;
        pageToken = r.data.nextPageToken || undefined;
      } while (pageToken && seen < 1000);
      return { space: parent, searched: seen, matches: hits };
    }, READ);
}
