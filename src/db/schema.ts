import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    index("channel_identifiers_platform_external_id_idx").on(table.platform, table.externalId),
  ]
);

export type ChannelIdentifier = typeof channelIdentifiers.$inferSelect;
export type NewChannelIdentifier = typeof channelIdentifiers.$inferInsert;
