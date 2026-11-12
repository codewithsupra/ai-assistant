import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Links a chat-platform identity to the Clerk user who owns it, so inbound
// messages can be tied to an authenticated account.
export const channelIdentifiers = pgTable(
  "channel_identifiers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Only Telegram for now; the CHECK below enforces it in the database.
    platform: text("platform", { enum: ["telegram"] }).notNull(),
    // The platform's own user id (Telegram user id). Text, since ids can exceed JS safe integers.
    externalId: text("external_id").notNull(),
    // Clerk user id from third-party auth.
    clerkUserId: text("clerk_user_id").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("channel_identifiers_platform_check", sql`${table.platform} = 'telegram'`),
    // Unique: one chat-platform identity maps to exactly one Clerk user, so the lookup is never ambiguous.
    uniqueIndex("channel_identifiers_platform_external_id_idx").on(table.platform, table.externalId),
  ]
);

export type ChannelIdentifier = typeof channelIdentifiers.$inferSelect;
export type NewChannelIdentifier = typeof channelIdentifiers.$inferInsert;

// The conversation the agent remembers: the user's words and the agent's final answers, per Clerk user
// per private chat. Tool steps and file bytes are not kept; attachments are kept as one-line notes.
export const conversationMessages = pgTable(
  "conversation_messages",
  {
    // Insert order is the conversation order.
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    telegramChatId: text("telegram_chat_id").notNull(),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("conversation_messages_role_check", sql`${table.role} in ('user', 'assistant')`),
    index("conversation_messages_thread_idx").on(table.clerkUserId, table.telegramChatId, table.seq),
  ]
);

// Telegram redelivers an update when it does not get a quick 200. Recording each accepted update id lets
// the gateway drop the repeats so a message is never answered twice.
export const telegramUpdates = pgTable("telegram_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});

// How many free chats a user without the paid plan has used in a calendar month (UTC, "YYYY-MM").
// One row per user per month, so the allowance resets by itself when the month changes.
export const freeUsage = pgTable(
  "free_usage",
  {
    clerkUserId: text("clerk_user_id").notNull(),
    period: text("period").notNull(),
    used: integer("used").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.clerkUserId, table.period] }), check("free_usage_used_check", sql`${table.used} >= 0`)]
);

// A "connect your account" flow that is waiting for the person to approve it in Clerk. Kept in the database
// so it survives restarts, and so only one flow per Telegram user is ever open.
export const pendingLinks = pgTable(
  "pending_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    telegramUserId: text("telegram_user_id").notNull().unique(),
    chatId: bigint("chat_id", { mode: "number" }).notNull(),
    deviceCode: text("device_code").notNull(),
    userCode: text("user_code").notNull(),
    intervalSeconds: integer("interval_seconds").notNull().default(5),
    nextPollAt: timestamp("next_poll_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pending_links_next_poll_idx").on(table.nextPollAt)]
);
