import { and, eq, lte, sql } from "drizzle-orm";
import { db, pendingLinks } from "./index.js";

export type PendingLink = typeof pendingLinks.$inferSelect;

export const hasActivePendingLink = async (telegramUserId: string): Promise<boolean> => {
  const rows = await db
    .select({ id: pendingLinks.id })
    .from(pendingLinks)
    .where(and(eq(pendingLinks.telegramUserId, telegramUserId), sql`${pendingLinks.expiresAt} > now()`))
    .limit(1);
  return rows.length > 0;
};

// Opens a flow and returns its id, or null when this person already has one open, so no second code is ever sent.
export const createPendingLink = async (link: {
  telegramUserId: string;
  chatId: number;
  deviceCode: string;
  userCode: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}): Promise<string | null> => {
  // A flow that has expired is replaced; a live one is kept.
  await db.delete(pendingLinks).where(and(eq(pendingLinks.telegramUserId, link.telegramUserId), lte(pendingLinks.expiresAt, sql`now()`)));
  const inserted = await db
    .insert(pendingLinks)
    .values({
      telegramUserId: link.telegramUserId,
      chatId: link.chatId,
      deviceCode: link.deviceCode,
      userCode: link.userCode,
      intervalSeconds: link.intervalSeconds,
      nextPollAt: sql`now() + make_interval(secs => ${link.intervalSeconds})`,
      expiresAt: sql`now() + make_interval(secs => ${link.expiresInSeconds})`,
    })
    .onConflictDoNothing()
    .returning({ id: pendingLinks.id });
  return inserted[0]?.id ?? null;
};

// Takes the flows that are due for a poll and moves their next poll forward in the same statement.
// SKIP LOCKED means a restart or a second instance can never poll the same flow at the same time.
export const claimDueLinks = async (limit = 5): Promise<PendingLink[]> => {
  const result = await db.execute(sql`
    update pending_links
    set next_poll_at = now() + make_interval(secs => interval_seconds)
    where id in (
      select id from pending_links
      where next_poll_at <= now()
      order by next_poll_at
      limit ${limit}
      for update skip locked
    )
    returning id, telegram_user_id, chat_id, device_code, user_code, interval_seconds, next_poll_at, expires_at, created_at
  `);
  return result.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    telegramUserId: r.telegram_user_id as string,
    chatId: Number(r.chat_id),
    deviceCode: r.device_code as string,
    userCode: r.user_code as string,
    intervalSeconds: Number(r.interval_seconds),
    nextPollAt: new Date(r.next_poll_at as string),
    expiresAt: new Date(r.expires_at as string),
    createdAt: new Date(r.created_at as string),
  }));
};

// Clerk asked us to slow down: poll less often from now on.
export const slowDownLink = async (id: string, intervalSeconds: number) => {
  await db
    .update(pendingLinks)
    .set({ intervalSeconds, nextPollAt: sql`now() + make_interval(secs => ${intervalSeconds})` })
    .where(eq(pendingLinks.id, id));
};

export const deletePendingLink = async (id: string) => {
  await db.delete(pendingLinks).where(eq(pendingLinks.id, id));
};
