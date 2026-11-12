import { webhooks } from "@trigger.dev/sdk";
import { chat, defaultStorage } from "@trigger.dev/sdk/ai";
import { neon } from "@neon/ai-sdk-provider";
import { isStepCount, type UIMessage } from "ai";
import { createDaytonaTools } from "./daytona-tools.js";
import { firecrawlTools } from "./firecrawl-tools.js";
import { downloadTelegramFile, sendTelegramMessage } from "./telegram-api.js";
import { telegramInstructions } from "./telegram-instructions.js";

type TelegramFile = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };

type TelegramMessage = {
  message_id: number;
  text?: string;
  caption?: string;
  chat: { id: number };
  from?: { id: number };
  document?: TelegramFile;
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
  voice?: TelegramFile;
  audio?: TelegramFile;
  video?: TelegramFile;
  video_note?: TelegramFile;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type Attachment = { fileId: string; name: string; mediaType: string; size?: number };

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

// Every kind of file a user can upload, normalised.
const attachmentsOf = (m: TelegramMessage): Attachment[] => {
  const list: Attachment[] = [];
  if (m.photo?.length) {
    const largest = m.photo[m.photo.length - 1]; // Telegram sends sizes ascending
    list.push({ fileId: largest.file_id, name: `photo-${m.message_id}.jpg`, mediaType: "image/jpeg", size: largest.file_size });
  }
  const add = (f: TelegramFile | undefined, fallbackName: string, fallbackType: string) => {
    if (f) list.push({ fileId: f.file_id, name: f.file_name ?? fallbackName, mediaType: f.mime_type ?? fallbackType, size: f.file_size });
  };
  add(m.document, `document-${m.message_id}`, "application/octet-stream");
  add(m.voice, `voice-${m.message_id}.ogg`, "audio/ogg");
  add(m.audio, `audio-${m.message_id}`, "audio/mpeg");
  add(m.video, `video-${m.message_id}.mp4`, "video/mp4");
  add(m.video_note, `video-note-${m.message_id}.mp4`, "video/mp4");
  return list;
};

// Images and PDFs can be read by the model directly; everything else goes through the sandbox.
const MODEL_READABLE = /^(image\/(jpeg|png|webp|gif)|application\/pdf)$/;
const MAX_MODEL_READABLE_BYTES = 8 * 1024 * 1024;

const fileUrl = (fileId: string) => `telegram://file/${encodeURIComponent(fileId)}`;

const toUserMessage = (m: TelegramMessage): string | UIMessage => {
  const attachments = attachmentsOf(m);
  const text = m.text ?? m.caption ?? "";
  if (attachments.length === 0) return text;

  // The attachment lines carry the file_id the agent needs to import a file into its sandbox.
  const lines = attachments.map(
    (a) => `[Attached file: ${a.name} | ${a.mediaType}${a.size ? ` | ${a.size} bytes` : ""} | file_id: ${a.fileId}]`
  );
  const parts: UIMessage["parts"] = [{ type: "text", text: [text, ...lines].filter(Boolean).join("\n") }];
  for (const a of attachments) {
    if (MODEL_READABLE.test(a.mediaType) && (a.size ?? 0) <= MAX_MODEL_READABLE_BYTES) {
      parts.push({ type: "file", mediaType: a.mediaType, filename: a.name, url: fileUrl(a.fileId) });
    }
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
  key: "telegram-{event.message.chat.id}",
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
