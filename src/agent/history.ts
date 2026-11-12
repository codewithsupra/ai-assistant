import type { HistoryMessage } from "../db/conversations.js";

type Limits = { maxMessages: number; maxChars: number; maxMessageChars: number };
const DEFAULT_LIMITS: Limits = { maxMessages: 30, maxChars: 24_000, maxMessageChars: 6_000 };

// Keeps the newest part of a conversation that fits the budget, and always starts on a user message
// (the model API rejects a conversation that opens with an assistant message).
// Each message is capped first, so the latest exchange always fits and memory is never lost to one long answer.
export const trimHistory = (messages: HistoryMessage[], limits: Limits = DEFAULT_LIMITS): HistoryMessage[] => {
  const capped = messages.map((m) =>
    m.content.length > limits.maxMessageChars ? { ...m, content: `${m.content.slice(0, limits.maxMessageChars)}... [shortened]` } : m
  );

  const kept: HistoryMessage[] = [];
  let chars = 0;
  for (let i = capped.length - 1; i >= 0 && kept.length < limits.maxMessages; i--) {
    chars += capped[i].content.length;
    if (chars > limits.maxChars && kept.length > 0) break;
    kept.unshift(capped[i]);
  }
  while (kept.length > 0 && kept[0].role !== "user") kept.shift();
  return kept;
};
