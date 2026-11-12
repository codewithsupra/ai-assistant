## Hono CLI

Run `npx hono --help` first, and use the CLI instead of a dev server.

## Syncing env vars to Render

- **Never sync `TRIGGER_SECRET_KEY` from the local `.env` to Render.** The local value is the Trigger.dev *development* key (`tr_dev_...`); Render holds the *production* key (`tr_prod_...`). Overwriting it would point production at the dev environment.
- When syncing env vars to Render (e.g. with the Render MCP `update_environment_variables` tool), always exclude `TRIGGER_SECRET_KEY`. Sync an explicit list of keys instead of copying the whole `.env`.
- Only change Render's `TRIGGER_SECRET_KEY` if the user explicitly provides a new production key and asks for it.
