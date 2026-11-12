## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

## Database schema changes (Drizzle on Neon)

- **Do not use migrations.** Never run `drizzle-kit generate` or `drizzle-kit migrate`, and never commit a `drizzle/` migration folder. Apply schema changes with `npx drizzle-kit push` instead.
- `push` reads `DATABASE_URL_UNPOOLED` (the direct connection) through `drizzle.config.ts`. Keep `tablesFilter` in that config limited to the tables this app owns, so `push` never drops tables created by other tools.
- Read the statements `push` is about to run (`--verbose`). If it would drop or rewrite a column or table that may hold data, stop and ask the user first.

## Syncing env vars to Render

- **Never sync `TRIGGER_SECRET_KEY` from the local `.env` to Render.** The local value is the Trigger.dev *development* key (`tr_dev_...`); Render holds the *production* key (`tr_prod_...`). Overwriting it would point production at the dev environment.
- When syncing env vars to Render (e.g. with the Render MCP `update_environment_variables` tool), always exclude `TRIGGER_SECRET_KEY`. Sync an explicit list of keys instead of copying the whole `.env`.
- Only change Render's `TRIGGER_SECRET_KEY` if the user explicitly provides a new production key and asks for it.
