import { webhooks } from "@trigger.dev/sdk";
import { chat, defaultStorage } from "@trigger.dev/sdk/ai";
import { neon } from "@neon/ai-sdk-provider";
import { isStepCount } from "ai";
import { firecrawlTools } from "./firecrawl-tools.js";
import { telegramInstructions } from "./telegram-instructions.js";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number };
    from?: { id: number };
  };
};

const TELEGRAM_MAX_LENGTH = 4096;

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

const sendTelegramMessage = async (chatId: number, text: string) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_MAX_LENGTH) }),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { result?: { message_id: number } };
  return { ref: String(body.result?.message_id ?? "") };
};

// Chat frontend: each Telegram message becomes a turn on the agent's session
// for that chat, and the reply is posted back with sendMessage.
const telegramChannel = chat.channels.custom({
  id: "telegram",
  endpoint: telegramEndpoint,
  key: "telegram-{event.message.chat.id}",
  // Non-text updates (stickers, edits, ...) map to an empty message, which runs no turn.
  inbound: (e) => ({
    message: e.message?.text ?? "",
    externalUserId: e.message?.from ? String(e.message.from.id) : undefined,
    externalMessageId: e.message ? String(e.message.message_id) : undefined,
  }),
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
  run: async ({ messages, signal, streamText }) =>
    streamText({
      model: neon(process.env.AI_MODEL ?? "gpt-5-mini"),
      instructions: telegramInstructions,
      messages,
      tools: firecrawlTools,
      stopWhen: isStepCount(8),
      maxOutputTokens: 2000, // headroom for reasoning models; answers are kept short by the instructions
      abortSignal: signal,
    }),
});
