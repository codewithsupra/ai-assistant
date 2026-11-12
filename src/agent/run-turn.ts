import { generateText, isStepCount, type ModelMessage } from "ai";
import { appendTurn, loadHistory, type HistoryMessage } from "../db/conversations.js";
import { createDaytonaTools } from "./daytona-tools.js";
import { firecrawlTools } from "./firecrawl-tools.js";
import { trimHistory } from "./history.js";
import { agentModel } from "./model.js";
import { sessionIdFor } from "./session-id.js";
import { describeMessage, isModelReadable, type TelegramMessage } from "./telegram-message.js";
import { realTelegram, type TelegramIO } from "./telegram-io.js";
import { telegramInstructions } from "./telegram-instructions.js";

export type TurnInput = { clerkUserId: string; chatId: number; message: TelegramMessage };

export type TurnDeps = {
  telegram: TelegramIO;
  loadHistory: (clerkUserId: string, telegramChatId: string) => Promise<HistoryMessage[]>;
  appendTurn: (clerkUserId: string, telegramChatId: string, userText: string, assistantText: string) => Promise<void>;
  /** Produces the agent's answer for a conversation. Replaced in tests. */
  generate: (input: { sessionId: string; messages: ModelMessage[]; signal: AbortSignal }) => Promise<string>;
};

const TURN_TIMEOUT_MS = 270_000;
const TYPING_REFRESH_MS = 4_000;

// The real agent: the model, with web/live-data tools and the user's own sandbox.
export const generateReply: TurnDeps["generate"] = async ({ sessionId, messages, signal }) => {
  const { text } = await generateText({
    model: agentModel(),
    instructions: telegramInstructions,
    messages,
    // The sandbox tools are built for this one conversation: they refuse any session that is not a linked Clerk user.
    tools: { ...firecrawlTools, ...createDaytonaTools(sessionId) },
    stopWhen: isStepCount(20),
    maxOutputTokens: 2000,
    abortSignal: signal,
  });
  return text;
};

export const realTurnDeps: TurnDeps = { telegram: realTelegram, loadHistory, appendTurn, generate: generateReply };

// Answers one message from a linked user: load their conversation, run the agent, send the reply, remember the turn.
export const runTurn = async ({ clerkUserId, chatId, message }: TurnInput, deps: TurnDeps = realTurnDeps) => {
  const { text, attachments } = describeMessage(message);
  if (!text) return; // a sticker or other update with nothing to answer

  const typing = setInterval(() => void deps.telegram.sendTyping(chatId).catch(() => {}), TYPING_REFRESH_MS);
  void deps.telegram.sendTyping(chatId).catch(() => {});
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TURN_TIMEOUT_MS);

  try {
    const history = trimHistory(await deps.loadHistory(clerkUserId, String(chatId)));

    // Images and PDFs go to the model directly; everything else is imported by the agent through its tools.
    const content: Exclude<ModelMessage["content"], string> = [{ type: "text", text }];
    for (const a of attachments.filter(isModelReadable)) {
      try {
        content.push({ type: "file", data: await deps.telegram.downloadFile(a.fileId), mediaType: a.mediaType, filename: a.name });
      } catch {
        content.push({ type: "text", text: `(I could not open ${a.name} directly.)` });
      }
    }
    const messages = [...history.map((m): ModelMessage => ({ role: m.role, content: m.content })), { role: "user", content } as ModelMessage];

    const answer = (await deps.generate({ sessionId: sessionIdFor(clerkUserId, chatId), messages, signal: abort.signal })).trim();
    const reply = answer || "I couldn't come up with a reply. Could you try asking another way?";

    await deps.telegram.sendText(chatId, reply);
    // Saved after sending, so the person always gets the answer even if saving fails.
    await deps.appendTurn(clerkUserId, String(chatId), text, reply).catch((err) => console.error("Could not save turn:", err instanceof Error ? err.message : "unknown"));
  } catch (err) {
    console.error("Turn failed:", err instanceof Error ? err.message : "unknown");
    await deps.telegram
      .sendText(chatId, abort.signal.aborted ? "That took too long, so I stopped. Could you try a smaller request?" : "Sorry, something went wrong. Please try again.")
      .catch(() => {});
  } finally {
    clearInterval(typing);
    clearTimeout(timer);
  }
};
