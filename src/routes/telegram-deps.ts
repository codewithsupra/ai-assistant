import { idempotencyKeys, tasks } from '@trigger.dev/sdk'
import { findClerkUserId } from '../db/identities.js'
import type { connectTelegramAccount } from '../trigger/connect-telegram.js'
import type { TelegramGatewayDeps } from './telegram.js'

const requireEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

// The real dependencies: Neon through Drizzle, the Trigger.dev webhook over HTTP, and the Trigger.dev API.
export const realTelegramDeps: TelegramGatewayDeps = {
  webhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET,

  lookupClerkUserId: findClerkUserId,

  forwardToTrigger: async (update) => {
    const res = await fetch(requireEnv('TRIGGER_TELEGRAM_WEBHOOK_URL'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The Trigger.dev endpoint's own secret. It is deliberately not the secret Telegram knows.
        'X-Telegram-Bot-Api-Secret-Token': requireEnv('TELEGRAM_FORWARD_SECRET')
      },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) throw new Error(`Trigger.dev webhook responded ${res.status}`)
  },

  startAccountLink: async ({ telegramUserId, chatId }) => {
    // One flow per person at a time: repeated messages inside the 10-minute code window start nothing new.
    await tasks.trigger<typeof connectTelegramAccount>(
      'connect-telegram-account',
      { telegramUserId, chatId },
      {
        idempotencyKey: await idempotencyKeys.create(`connect-telegram-${telegramUserId}`, { scope: 'global' }),
        idempotencyKeyTTL: '10m'
      }
    )
  }
}
