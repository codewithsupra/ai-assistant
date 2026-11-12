import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'

type TelegramUpdate = {
  update_id?: number
  message?: {
    message_id: number
    chat?: { id: number; type?: string }
    from?: { id: number; is_bot?: boolean }
  }
}

export type TelegramGatewayDeps = {
  /** The secret Telegram sends in X-Telegram-Bot-Api-Secret-Token (set with setWebhook). */
  webhookSecret: () => string | undefined
  /** The Clerk user a Telegram user is linked to, or null for a stranger. */
  lookupClerkUserId: (telegramUserId: string) => Promise<string | null>
  /** Delivers an update, with the Clerk user id attached, to the Trigger.dev webhook. Throws on failure. */
  forwardToTrigger: (update: Record<string, unknown>) => Promise<void>
  /** Starts the "connect your account" flow for a stranger. Must be safe to call repeatedly. */
  startAccountLink: (input: { telegramUserId: string; chatId: number }) => Promise<void>
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

// Telegram's webhook points here, not at Trigger.dev. Only people linked to a Clerk user reach the agent.
export const createTelegramRoutes = (deps: TelegramGatewayDeps) => {
  const routes = new Hono()

  routes.post('/webhook', async (c) => {
    const secret = deps.webhookSecret()
    if (!secret) return c.json({ error: 'Webhook secret not configured' }, 500)
    if (!safeEqual(c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '', secret)) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    let update: TelegramUpdate & Record<string, unknown>
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
      // The Clerk id is set last so it can never be overridden by anything in the incoming update.
      await deps.forwardToTrigger({ ...update, clerk_user_id: clerkUserId })
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
