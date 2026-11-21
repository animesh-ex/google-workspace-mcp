import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { dialogflow, type dialogflow_v2, type dialogflow_v3 } from "@googleapis/dialogflow";
import { getAuthClient } from "../auth.js";
import { tool, READ, WRITE, DESTRUCTIVE } from "../util.js";

const rootFor = (location?: string) => (location && location !== "global" ? `https://${location}-dialogflow.googleapis.com/` : undefined);
const es = (location?: string) => dialogflow({ version: "v2", auth: getAuthClient(), rootUrl: rootFor(location) });
const cx = (location?: string) => dialogflow({ version: "v3", auth: getAuthClient(), rootUrl: rootFor(location) });

const esAgent = (projectId: string, location?: string) =>
  location && location !== "global" ? `projects/${projectId}/locations/${location}/agent` : `projects/${projectId}/agent`;
const cxLocationOf = (agentName: string) => agentName.match(/locations\/([^/]+)/)?.[1];

const projectShape = {
  projectId: z.string().describe("Google Cloud project ID that owns the Dialogflow agent"),
  location: z.string().optional().describe("Agent region, e.g. 'global' (default), 'us-central1', 'europe-west1'"),
};

function esIntent(i: dialogflow_v2.Schema$GoogleCloudDialogflowV2Intent, full = false) {
  return {
    name: i.name, displayName: i.displayName, priority: i.priority, isFallback: i.isFallback || undefined,
    trainingPhrases: full ? i.trainingPhrases?.map((t) => t.parts?.map((p) => p.text).join("")) : i.trainingPhrases?.length,
    responses: full ? i.messages?.flatMap((m) => m.text?.text || []) : undefined,
    inputContexts: i.inputContextNames?.length ? i.inputContextNames : undefined,
    action: i.action || undefined,
  };
}

function cxReply(r: dialogflow_v3.Schema$GoogleCloudDialogflowCxV3DetectIntentResponse) {
  const q = r.queryResult || {};
  return {
    replies: q.responseMessages?.flatMap((m) => m.text?.text || []),
    intent: q.match?.intent?.displayName || q.intent?.displayName, confidence: q.match?.confidence ?? q.intentDetectionConfidence,
    matchType: q.match?.matchType, page: q.currentPage?.displayName, parameters: q.parameters,
  };
}

export function registerDialogflow(server: McpServer) {
  // ---------- Dialogflow ES ----------
  tool(server, "dialogflow_get_agent", "Show a Dialogflow ES agent's settings (name, language, time zone, ML threshold).",
    projectShape,
    async ({ projectId, location }) => {
      const parent = location && location !== "global" ? `projects/${projectId}/locations/${location}` : `projects/${projectId}`;
      const a = (await es(location).projects.getAgent({ parent })).data;
      return { displayName: a.displayName, defaultLanguage: a.defaultLanguageCode, languages: a.supportedLanguageCodes, timeZone: a.timeZone, matchMode: a.matchMode, classificationThreshold: a.classificationThreshold, tier: a.tier, description: a.description };
    }, READ);

  tool(server, "dialogflow_list_intents", "List a Dialogflow ES agent's intents. full=true includes training phrases and responses.",
    { ...projectShape, full: z.boolean().default(false), languageCode: z.string().optional() },
    async ({ projectId, location, full, languageCode }) => {
      const out: ReturnType<typeof esIntent>[] = [];
      let pageToken: string | undefined;
      do {
        const r = await es(location).projects.agent.intents.list({ parent: esAgent(projectId, location), intentView: full ? "INTENT_VIEW_FULL" : undefined, languageCode, pageSize: 1000, pageToken });
        out.push(...(r.data.intents || []).map((i) => esIntent(i, full)));
        pageToken = r.data.nextPageToken || undefined;
      } while (pageToken);
      return { count: out.length, intents: out };
    }, READ);

  tool(server, "dialogflow_detect_intent",
    "Send a test message to a Dialogflow ES agent and get its reply, matched intent and confidence. Reuse sessionId to continue a conversation.",
    { ...projectShape, text: z.string(), sessionId: z.string().optional(), languageCode: z.string().default("en") },
    async ({ projectId, location, text, sessionId, languageCode }) => {
      const sid = sessionId || randomUUID();
      const r = await es(location).projects.agent.sessions.detectIntent({
        session: `${esAgent(projectId, location)}/sessions/${sid}`,
        requestBody: { queryInput: { text: { text, languageCode } } },
      });
      const q = r.data.queryResult || {};
      return {
        sessionId: sid, reply: q.fulfillmentText, replies: q.fulfillmentMessages?.flatMap((m) => m.text?.text || []),
        intent: q.intent?.displayName, confidence: q.intentDetectionConfidence, action: q.action || undefined,
        parameters: q.parameters, allRequiredParamsPresent: q.allRequiredParamsPresent,
      };
    }, READ);

  tool(server, "dialogflow_create_intent", "Create a Dialogflow ES intent with training phrases and text responses.",
    { ...projectShape, displayName: z.string(), trainingPhrases: z.array(z.string()).min(1), responses: z.array(z.string()).default([]), languageCode: z.string().optional() },
    async ({ projectId, location, displayName, trainingPhrases, responses, languageCode }) => {
      const r = await es(location).projects.agent.intents.create({
        parent: esAgent(projectId, location), languageCode,
        requestBody: {
          displayName,
          trainingPhrases: trainingPhrases.map((t) => ({ type: "EXAMPLE", parts: [{ text: t }] })),
          messages: responses.length ? [{ text: { text: responses } }] : undefined,
        },
      });
      return esIntent(r.data, true);
    }, WRITE);

  tool(server, "dialogflow_update_intent", "Add training phrases and/or responses to an existing Dialogflow ES intent (keeps what's already there).",
    { intentName: z.string().describe("projects/.../agent/intents/ID from dialogflow_list_intents"), location: z.string().optional(), addTrainingPhrases: z.array(z.string()).default([]), addResponses: z.array(z.string()).default([]), languageCode: z.string().optional() },
    async ({ intentName, location, addTrainingPhrases, addResponses, languageCode }) => {
      const api = es(location || intentName.match(/locations\/([^/]+)/)?.[1]);
      const cur = (await api.projects.agent.intents.get({ name: intentName, intentView: "INTENT_VIEW_FULL", languageCode })).data;
      const masks: string[] = [];
      if (addTrainingPhrases.length) {
        cur.trainingPhrases = [...(cur.trainingPhrases || []), ...addTrainingPhrases.map((t) => ({ type: "EXAMPLE", parts: [{ text: t }] }))];
        masks.push("training_phrases");
      }
      if (addResponses.length) {
        const msgs = cur.messages || [];
        const textMsg = msgs.find((m) => m.text && !m.platform);
        if (textMsg?.text) textMsg.text.text = [...(textMsg.text.text || []), ...addResponses];
        else msgs.push({ text: { text: addResponses } });
        cur.messages = msgs;
        masks.push("messages");
      }
      if (!masks.length) throw new Error("Nothing to add.");
      const r = await api.projects.agent.intents.patch({ name: intentName, languageCode, updateMask: masks.join(","), intentView: "INTENT_VIEW_FULL", requestBody: cur });
      return esIntent(r.data, true);
    }, WRITE);

  tool(server, "dialogflow_delete_intent", "Delete a Dialogflow ES intent. Confirm with the user first.",
    { intentName: z.string(), location: z.string().optional() },
    async ({ intentName, location }) => {
      await es(location || intentName.match(/locations\/([^/]+)/)?.[1]).projects.agent.intents.delete({ name: intentName });
      return { deleted: intentName };
    }, DESTRUCTIVE);

  // ---------- Dialogflow CX ----------
  tool(server, "dialogflow_cx_list_agents", "List Dialogflow CX agents in a project and region.",
    { projectId: z.string(), location: z.string().default("global") },
    async ({ projectId, location }) => {
      const r = await cx(location).projects.locations.agents.list({ parent: `projects/${projectId}/locations/${location}`, pageSize: 100 });
      return (r.data.agents || []).map((a) => ({ name: a.name, displayName: a.displayName, defaultLanguage: a.defaultLanguageCode, timeZone: a.timeZone, description: a.description }));
    }, READ);

  tool(server, "dialogflow_cx_list_intents", "List a Dialogflow CX agent's intents with training phrase counts (or phrases with full=true).",
    { agentName: z.string().describe("projects/P/locations/L/agents/ID"), full: z.boolean().default(false) },
    async ({ agentName, full }) => {
      const r = await cx(cxLocationOf(agentName)).projects.locations.agents.intents.list({ parent: agentName, pageSize: 1000, intentView: full ? "INTENT_VIEW_FULL" : undefined });
      return (r.data.intents || []).map((i) => ({
        name: i.name, displayName: i.displayName,
        trainingPhrases: full ? i.trainingPhrases?.map((t) => t.parts?.map((p) => p.text).join("")) : i.trainingPhrases?.length,
      }));
    }, READ);

  tool(server, "dialogflow_cx_detect_intent", "Send a test message to a Dialogflow CX agent and get its replies, matched intent, page and parameters. Reuse sessionId to continue.",
    { agentName: z.string(), text: z.string(), sessionId: z.string().optional(), languageCode: z.string().default("en") },
    async ({ agentName, text, sessionId, languageCode }) => {
      const sid = sessionId || randomUUID();
      const r = await cx(cxLocationOf(agentName)).projects.locations.agents.sessions.detectIntent({
        session: `${agentName}/sessions/${sid}`, requestBody: { queryInput: { text: { text }, languageCode } },
      });
      return { sessionId: sid, ...cxReply(r.data) };
    }, READ);
}
