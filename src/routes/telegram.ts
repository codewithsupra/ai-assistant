import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'
import type { TelegramMessage, TelegramUpdate } from '../agent/telegram-message.js'

export type TelegramGatewayDeps = {
  /** The secret Telegram sends in X-Telegram-Bot-Api-Secret-Token (set with setWebhook). */
  webhookSecret: () => string | undefined
  /** The Clerk user a Telegram user is linked to, or null for a stranger. */
  lookupClerkUserId: (telegramUserId: string) => Promise<string | null>
  /** Records an update id. False means it was already accepted, so Telegram is redelivering it. */
  claimUpdate: (updateId: number) => Promise<boolean>
  /** Gives an update id back when we failed to accept it, so Telegram's retry is processed. */
  releaseUpdate: (updateId: number) => Promise<void>
  /** Whether this Clerk user is on the paid plan. Throwing means "unknown": the update is retried, never let through. */
  hasRequiredPlan: (clerkUserId: string) => Promise<boolean>
  /** Uses up one of an unsubscribed user's free chats this month. False means none are left. */
  consumeFreeMessage: (clerkUserId: string) => Promise<boolean>
  /** Tells a linked user who is out of free chats where to upgrade. */
  sendUpgradePrompt: (input: { chatId: number }) => Promise<void>
  /** Queues the agent's turn and returns at once; the answer is sent from the background. */
  handleKnownUser: (input: { message: TelegramMessage; clerkUserId: string }) => void
  /** Starts the "connect your account" flow for a stranger. Must be safe to call repeatedly. */
  startAccountLink: (input: { telegramUserId: string; chatId: number }) => Promise<void>
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// Telegram's webhook points here. Only people linked to a Clerk user with the paid plan reach the agent.
export const createTelegramRoutes = (deps: TelegramGatewayDeps) => {
  const routes = new Hono()

  routes.post('/webhook', async (c) => {
    const secret = deps.webhookSecret()
    if (!secret) return c.json({ error: 'Webhook secret not configured' }, 500)
    if (!safeEqual(c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '', secret)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    let update: TelegramUpdate
    try {
      update = await c.req.json()
    } catch {
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // Always answer 200 for updates we deliberately ignore, so Telegram does not retry them.
    const { message } = update
    const from = message?.from
    const chat = message?.chat
    if (!message || !from || !chat) return c.json({ ok: true })
    // Private chats only: no groups, supergroups or channels, and never other bots.
    if (chat.type !== 'private' || from.is_bot || chat.id !== from.id) return c.json({ ok: true })

    const telegramUserId = String(from.id)

    // A failure here must never fall through to the agent: Telegram gets a 5xx and retries later.
    const clerkUserId = await deps.lookupClerkUserId(telegramUserId)

    if (clerkUserId) {
      // Telegram redelivers an update it did not get a fast 200 for. Answer each one once.
      const updateId = update.update_id
      if (typeof updateId === 'number' && !(await deps.claimUpdate(updateId))) {
        return c.json({ ok: true, duplicate: true })
      }
      try {
        // Subscription gate: subscribers always get the agent. Everyone else gets a monthly allowance of free
        // chats, and once it is used up, an upgrade link instead of the agent.
        const subscribed = await deps.hasRequiredPlan(clerkUserId)
        if (!subscribed && !(await deps.consumeFreeMessage(clerkUserId))) {
          await deps.sendUpgradePrompt({ chatId: chat.id })
          return c.json({ ok: true, subscribed: false })
        }
        deps.handleKnownUser({ message, clerkUserId })
      } catch (err) {
        if (typeof updateId === 'number') await deps.releaseUpdate(updateId).catch(() => {})
        throw err
      }
      return c.json({ ok: true })
    }

    await deps.startAccountLink({ telegramUserId, chatId: chat.id })
    return c.json({ ok: true, linked: false })
  })

  routes.onError((err, c) => {
    // Log the failure without the message content; a 5xx makes Telegram retry the update.
    console.error('Telegram gateway error:', err instanceof Error ? err.message : 'unknown')
    return c.json({ error: 'Gateway error' }, 502)
  })

  return routes
}
