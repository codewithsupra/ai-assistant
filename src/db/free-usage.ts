import { sql } from "drizzle-orm";
import { db, freeUsage } from "./index.js";

export const DEFAULT_FREE_MESSAGES_PER_MONTH = 10;

export const freeMessageLimit = () => {
  const n = Number(process.env.FREE_MESSAGES_PER_MONTH ?? DEFAULT_FREE_MESSAGES_PER_MONTH);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_FREE_MESSAGES_PER_MONTH;
};

const periodOf = (now: Date) => now.toISOString().slice(0, 7); // "YYYY-MM", UTC

// Uses up one of the user's free chats for this month. Returns false when none are left.
// One atomic statement, so concurrent messages can never go past the limit.
export const consumeFreeMessage = async (clerkUserId: string, limit: number = freeMessageLimit(), now: Date = new Date()): Promise<boolean> => {
  if (limit <= 0) return false;
  const rows = await db
    .insert(freeUsage)
    .values({ clerkUserId, period: periodOf(now), used: 1 })
    .onConflictDoUpdate({
      target: [freeUsage.clerkUserId, freeUsage.period],
      set: { used: sql`${freeUsage.used} + 1` },
      setWhere: sql`${freeUsage.used} < ${limit}`,
    })
    .returning({ used: freeUsage.used });
  return rows.length > 0;
};
