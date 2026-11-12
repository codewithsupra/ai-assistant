import { and, desc, eq } from "drizzle-orm";
import { conversationMessages, db } from "./index.js";

export type HistoryMessage = { role: "user" | "assistant"; content: string };

// The most recent messages of one conversation, oldest first.
export const loadHistory = async (clerkUserId: string, telegramChatId: string, limit = 40): Promise<HistoryMessage[]> => {
  const rows = await db
    .select({ role: conversationMessages.role, content: conversationMessages.content })
    .from(conversationMessages)
    .where(and(eq(conversationMessages.clerkUserId, clerkUserId), eq(conversationMessages.telegramChatId, telegramChatId)))
    .orderBy(desc(conversationMessages.seq))
    .limit(limit);
  return rows.reverse();
};

// Saves one finished turn (the question and its answer) in a single statement, so a turn is never half saved.
export const appendTurn = async (clerkUserId: string, telegramChatId: string, userText: string, assistantText: string) => {
  await db.insert(conversationMessages).values([
    { clerkUserId, telegramChatId, role: "user", content: userText },
    { clerkUserId, telegramChatId, role: "assistant", content: assistantText },
  ]);
};
