import { and, eq } from "drizzle-orm";
import { channelIdentifiers, db } from "./index.js";

const TELEGRAM = "telegram" as const;

// The Clerk user a Telegram user is linked to, or null when they are a stranger.
export const findClerkUserId = async (telegramUserId: string): Promise<string | null> => {
  const rows = await db
    .select({ clerkUserId: channelIdentifiers.clerkUserId })
    .from(channelIdentifiers)
    .where(and(eq(channelIdentifiers.platform, TELEGRAM), eq(channelIdentifiers.externalId, telegramUserId)))
    .limit(1);
  return rows[0]?.clerkUserId ?? null;
};

export type LinkResult = "linked" | "already_linked" | "conflict";

// Saves "Telegram user X belongs to Clerk user Y". A Telegram user is never re-pointed at a different
// Clerk user: if a row already exists for someone else, nothing changes and "conflict" is returned.
export const linkTelegramUser = async (telegramUserId: string, clerkUserId: string): Promise<LinkResult> => {
  const inserted = await db
    .insert(channelIdentifiers)
    .values({ platform: TELEGRAM, externalId: telegramUserId, clerkUserId })
    .onConflictDoNothing()
    .returning({ id: channelIdentifiers.id });
  if (inserted.length > 0) return "linked";

  const existing = await findClerkUserId(telegramUserId);
  return existing === clerkUserId ? "already_linked" : "conflict";
};
