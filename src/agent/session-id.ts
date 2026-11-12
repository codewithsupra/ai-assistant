import { createHash } from "node:crypto";

// A chat agent session belongs to one Clerk user in one private Telegram chat.
// The id is built from the channel key (see telegram.ts) and parsed back by the tools, so a tool can only
// ever act for the Clerk user the session was created for.
export const CLERK_USER_ID_PATTERN = /^user_[A-Za-z0-9]+$/;
const SESSION_ID_PATTERN = /^clerk-(user_[A-Za-z0-9]+)-telegram-(\d+)$/;

export const parseSessionId = (sessionId: string) => {
  const match = SESSION_ID_PATTERN.exec(sessionId);
  if (!match) throw new Error("This conversation is not linked to an account");
  // Private chat ids are positive; groups and channels are negative and never match.
  return { clerkUserId: match[1], telegramChatId: Number(match[2]) };
};

// Deterministic, collision-free sandbox name per Clerk user (a hash, so any id spelling is safe in a name).
export const sandboxNameFor = (clerkUserId: string) =>
  `cu-${createHash("sha256").update(clerkUserId).digest("hex").slice(0, 24)}`;

// The id the agent tools use to identify a conversation: one Clerk user in one private Telegram chat.
export const sessionIdFor = (clerkUserId: string, telegramChatId: number) => {
  if (!CLERK_USER_ID_PATTERN.test(clerkUserId) || !Number.isInteger(telegramChatId) || telegramChatId <= 0) {
    throw new Error("A conversation needs a Clerk user and a private chat");
  }
  return `clerk-${clerkUserId}-telegram-${telegramChatId}`;
};
