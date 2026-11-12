import { defineConfig } from "drizzle-kit";

// Drizzle Kit does not read .env on its own.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file: rely on the real environment
}

if (!process.env.DATABASE_URL_UNPOOLED) {
  throw new Error("DATABASE_URL_UNPOOLED is not set");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Only manage the tables this app owns, so `drizzle-kit push` never drops anything else.
  tablesFilter: ["channel_identifiers", "conversation_messages", "telegram_updates", "pending_links", "free_usage"],
  // Migrations need the direct (non-pooled) connection.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED },
});
