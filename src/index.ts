import { serve } from '@hono/node-server'
import app from './app.js'
import { startLinkPoller } from './agent/account-link.js'
import { pruneUpdates } from './db/updates.js'
import { turnQueue } from './routes/telegram-deps.js'

const server = serve({
  fetch: app.fetch,
  port: Number(process.env.PORT) || 3000
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})

// Background work that lives in this process: checking open "connect your account" flows,
// and forgetting old Telegram update ids.
const stopLinkPoller = startLinkPoller()
const prune = () => void pruneUpdates().catch((err) => console.error('Prune failed:', err instanceof Error ? err.message : 'unknown'))
prune()
const pruneTimer = setInterval(prune, 6 * 60 * 60 * 1000)

// On a deploy Render sends SIGTERM: stop taking new requests and let running agent turns finish.
const shutdown = async (signal: string) => {
  console.log(`${signal} received, waiting for ${turnQueue.pending()} running turn(s)`)
  stopLinkPoller()
  clearInterval(pruneTimer)
  server.close()
  await Promise.race([turnQueue.drain(), new Promise((resolve) => setTimeout(resolve, 20_000))])
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
