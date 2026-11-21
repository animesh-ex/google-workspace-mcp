---
name: dialogflow
description: Builds, inspects and tests Dialogflow chatbots (ES and CX) through the Dialogflow API. Use when the user mentions Dialogflow, their chatbot or virtual agent, intents, training phrases, bot responses, "test my bot", "why didn't the bot understand", "add an FAQ to the bot", or wants to turn FAQs, emails or docs into bot intents.
---

# Dialogflow agents

Use the google-workspace `dialogflow_*` tools. Every call needs the **Google Cloud project ID** that owns the agent (it's in the Dialogflow console URL or agent settings). Ask for it once and reuse it. Also ask whether the agent is **ES** (classic, one agent per project) or **CX** (flows and pages). If unsure, try `dialogflow_get_agent` (ES) and `dialogflow_cx_list_agents` (CX).

If calls fail with permission errors, the signed-in Google account needs the Dialogflow API Admin or Client role in that project. A "missing scope" error means signing in again via the setup skill.

## Understand the bot
- **ES:** `dialogflow_get_agent` for language, time zone and match threshold, then `dialogflow_list_intents` (with `full: true` for phrases and responses).
- **CX:** `dialogflow_cx_list_agents`, then `dialogflow_cx_list_intents` with the agent name.
- Summarize: how many intents, which have few training phrases (under 10 is weak), missing responses, and overlapping intents that could confuse matching.

## Test it
- **ES:** `dialogflow_detect_intent`. **CX:** `dialogflow_cx_detect_intent`.
- Run a batch of realistic customer questions, reusing `sessionId` for multi-turn conversations. Report as a table: Question | Matched intent | Confidence | Reply.
- Flag fallback matches, confidence below about 0.6, and wrong intents. These are the gaps to fix.

## Improve it (ES)
- **New topic:** `dialogflow_create_intent` with 10–20 varied training phrases (different wording, short and long, typos customers really make) and 1–3 response variants.
- **Strengthen an intent:** `dialogflow_update_intent` with `addTrainingPhrases` and `addResponses`. It keeps the existing ones.
- **Remove:** `dialogflow_delete_intent`, only after the user confirms.
- After changes, re-run the same test questions and show before and after. Dialogflow retrains automatically; if results don't change yet, wait a minute and test again.

Show the user the planned intents and phrases before creating them. Changes affect the live bot.

## Build from content
To turn an FAQ doc, help-center page or common emails into intents:
1. Read the source with `docs_read`, `drive_read_file_text` or `gmail_search`.
2. Group the questions into intents, write training phrases and answers, and show the plan.
3. Create the intents after approval, then test.

CX editing (flows, pages, routes) isn't covered by these tools. For CX, test and report, and point the user to the Dialogflow CX console for structural changes.
