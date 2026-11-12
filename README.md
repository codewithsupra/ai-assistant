# Persona Assist

An AI assistant that lives in Telegram. It looks up live data, reads and builds files in a private sandbox, and remembers the conversation. Access is gated by Clerk sign-in and a Clerk Billing plan, with a monthly allowance of free chats.

**Try it:** open the landing page on the deployed service and tap the Telegram button.

## How a message flows

```
Telegram ──▶ POST /telegram/webhook  (Hono, on Render)
              │  1. check the webhook secret (constant-time)
              │  2. private chats only, never bots
              │  3. who is this?  (Neon: channel_identifiers)
              │        stranger ─▶ "Connect your account" (Clerk device flow), stop
              │  4. drop redelivered updates (Neon: telegram_updates)
              │  5. Pro plan?  (Clerk Billing, Backend API)
              │        no ─▶ free chat left this month?  (Neon: free_usage)
              │               no ─▶ upgrade button (hosted Account Portal billing), stop
              ▼
         in-process agent turn, queued per conversation
              history (Neon) + Claude via the Vercel AI SDK
              tools: Firecrawl (live data), Daytona (per-user sandbox + files)
              ▼
         reply sent to Telegram, turn saved to Neon
```

Anything that fails before step 5 completes returns a 5xx so Telegram retries. A failure never lets a message through to the agent.

## Stack

Hono · TypeScript · Vercel AI SDK · Claude (via the Neon AI Gateway) · Neon Postgres + Drizzle ORM · Clerk (OAuth device flow, Billing) · Firecrawl · Daytona · Render

## Run it locally

```
npm install
cp .env.example .env   # then fill in the variables below
npm run dev            # http://localhost:3000
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests (no network): gateway, billing, landing page, helpers |
| `npm run test:db` | Tests against the real database in `DATABASE_URL` (cleans up after itself) |
| `npm run typecheck` | TypeScript check |
| `npm run build` / `npm start` | Compile to `dist/` and run it, as Render does |
| `npm run set-webhook -- <url>` | Point the Telegram bot at `<url>` |

## Configuration

Set these as environment variables (names only; never commit values).

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Bot token from BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret Telegram sends with every webhook call |
| `TELEGRAM_BOT_USERNAME` | Optional. Bot username for the landing page link |
| `DATABASE_URL` | Neon pooled connection string (the app) |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string (schema pushes only) |
| `NEON_AI_GATEWAY_TOKEN`, `NEON_AI_GATEWAY_BASE_URL` | Model access |
| `AI_MODEL` | Optional. Defaults to `claude-haiku-5-5` |
| `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk instance keys |
| `CLERK_OAUTH_CLIENT_ID` | Public OAuth app used for the account-link device flow |
| `FIRECRAWL_API_KEY` | Live data tools |
| `DAYTONA_API_KEY` | Per-user sandboxes |
| `FREE_MESSAGES_PER_MONTH` | Optional. Free chats per user per UTC month, default 10 (0 = none) |
| `AGENT_MAX_CONCURRENT_TURNS`, `DATABASE_POOL_MAX` | Optional tuning |

## Database

The schema is in `src/db/schema.ts` and is applied with `npx drizzle-kit push` (no migration files). `drizzle.config.ts` limits Drizzle to this app's own tables so `push` never touches anything else. Read the `--verbose` statements before applying.

## Deploying

Render runs `npm install --include=dev && npm run build`, then `npm start`. Run **one instance**: the per-conversation queue lives in memory. On a deploy Render sends SIGTERM and the server waits up to 20 seconds for running turns to finish.

## Notes

- Clerk is currently on a development instance and Billing uses Clerk's shared development payment gateway, so no real payments are taken. Going live needs a Clerk production instance on a domain you own and a Stripe account.
