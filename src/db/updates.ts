import { eq, lt, sql } from "drizzle-orm";
import { db, telegramUpdates } from "./index.js";

// Records an update id. Returns false when it was already recorded, which means Telegram redelivered it.
export const claimUpdate = async (updateId: number): Promise<boolean> => {
  const inserted = await db
    .insert(telegramUpdates)
    .values({ updateId })
    .onConflictDoNothing()
    .returning({ updateId: telegramUpdates.updateId });
  return inserted.length > 0;
};

// Gives an update id back, so that a retry of an update we failed to accept is processed.
export const releaseUpdate = async (updateId: number) => {
  await db.delete(telegramUpdates).where(eq(telegramUpdates.updateId, updateId));
};

// Telegram only redelivers recent updates, so old ids can go.
export const pruneUpdates = async (olderThanDays = 7) => {
  await db.delete(telegramUpdates).where(lt(telegramUpdates.receivedAt, sql`now() - make_interval(days => ${olderThanDays})`));
};
