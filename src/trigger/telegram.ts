import { webhooks } from "@trigger.dev/sdk";
import { chat, defaultStorage } from "@trigger.dev/sdk/ai";
import { neon } from "@neon/ai-sdk-provider";
import { isStepCount, type UIMessage } from "ai";
import { createDaytonaTools } from "../agent/daytona-tools.js";
import { firecrawlTools } from "../agent/firecrawl-tools.js";
import { downloadTelegramFile, sendTelegramMessage } from "../agent/telegram-api.js";
import { telegramInstructions } from "../agent/telegram-instructions.js";
import {
  describeMessage,
  isModelReadable,
  type TelegramMessage,
  type TelegramUpdate,
} from "../agent/telegram-message.js";

// Hosted inbound webhook. Telegram sends the secret it was given in setWebhook
// (secret_token) in the X-Telegram-Bot-Api-Secret-Token header; Trigger.dev
// verifies it against this endpoint's stored secret before anything runs.
export const telegramEndpoint = webhooks.endpoint.define({
  id: "telegram",
  source: webhooks.custom<TelegramUpdate>(
    {
      scheme: "shared-secret",
      placement: "header",
      fieldName: "x-telegram-bot-api-secret-token",
      idempotencyField: { from: "body", name: "update_id" },
    },
    {
      setupPrompt:
        "Call Telegram's setWebhook with this URL and a secret_token equal to the endpoint's secret.",
      response: { acceptedBody: "empty" },
    }
  ),
});

const fileUrl = (fileId: string) => `telegram://file/${encodeURIComponent(fileId)}`;

const toUserMessage = (m: TelegramMessage): string | UIMessage => {
  const { text, attachments } = describeMessage(m);
  if (attachments.length === 0) return text;

  const parts: UIMessage["parts"] = [{ type: "text", text }];
  for (const a of attachments) {
    if (isModelReadable(a)) parts.push({ type: "file", mediaType: a.mediaType, filename: a.name, url: fileUrl(a.fileId) });
  }
  return { id: `telegram-${m.message_id}`, role: "user", parts };
};

const mediaTypeFromPath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    pdf: "application/pdf",
  };
  return ext ? types[ext] : undefined;
};

// Chat frontend: each Telegram message (text, or files with an optional caption) becomes
// a turn on the agent's session for that chat, and the reply is posted back with sendMessage.
const telegramChannel = chat.channels.custom({
  id: "telegram",
  endpoint: telegramEndpoint,
  // Only updates the Hono gateway has tied to a Clerk user, from a private chat, reach the agent.
  // Anything else is recorded as FILTERED and no agent run starts.
  filter: "event.clerk_user_id startsWith 'user_' && event.message.chat.type == 'private'",
  // One conversation per Clerk user per private chat. Must stay in sync with parseSessionId (session-id.ts).
  key: "clerk-{event.clerk_user_id}-telegram-{event.message.chat.id}",
  // Updates with nothing to answer (stickers, edits, ...) map to an empty message, which runs no turn.
  inbound: (e) => ({
    message: e.message ? toUserMessage(e.message) : "",
    externalUserId: e.message?.from ? String(e.message.from.id) : undefined,
    externalMessageId: e.message ? String(e.message.message_id) : undefined,
  }),
  // Telegram files need the bot token to read, so the runtime asks us to fetch them for the model.
  download: async (url) => {
    if (url.protocol !== "telegram:") return null;
    const { data, filePath } = await downloadTelegramFile(decodeURIComponent(url.pathname.slice(1)));
    return { data, mediaType: mediaTypeFromPath(filePath) };
  },
  bind: (e) => ({ chatId: e.message?.chat.id }),
  outbound: (reply) => (reply.text ? { text: reply.text } : null),
  send: async (message, ctx) => {
    const chatId = ctx.handle?.chatId ?? ctx.event?.message?.chat.id;
    if (chatId === undefined) return {};
    return sendTelegramMessage(chatId, message.text);
  },
});

export const telegramAgent = chat.agent({
  id: "telegram-agent",
  // Conversation memory: the platform keeps each chat's transcript as a snapshot
  // in object storage, so no database is needed. A new run reloads it per chat.
  storage: defaultStorage,
  channels: [telegramChannel],
  run: async ({ chatId, messages, signal, streamText }) =>
    streamText({
      model: neon(process.env.AI_MODEL ?? "claude-haiku-5-5"),
      instructions: telegramInstructions,
      messages,
      // Web/live data tools, plus a per-chat sandbox for files and computer use.
      tools: { ...firecrawlTools, ...createDaytonaTools(chatId) },
      stopWhen: isStepCount(20),
      maxOutputTokens: 2000, // headroom for reasoning models; answers are kept short by the instructions
      abortSignal: signal,
    }),
});
