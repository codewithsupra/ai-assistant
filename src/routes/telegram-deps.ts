import { startAccountLink } from '../agent/account-link.js'
import { runTurn } from '../agent/run-turn.js'
import { createTurnQueue } from '../agent/turn-queue.js'
import { findClerkUserId } from '../db/identities.js'
import { claimUpdate, releaseUpdate } from '../db/updates.js'
import type { TelegramGatewayDeps } from './telegram.js'

// Agent turns run in this process, in the background. One at a time per conversation, a few at a time overall.
export const turnQueue = createTurnQueue({ maxConcurrent: Number(process.env.AGENT_MAX_CONCURRENT_TURNS ?? 4) })

// The real dependencies: Neon through Drizzle, and the agent running in-process.
export const realTelegramDeps: TelegramGatewayDeps = {
  webhookSecret: () => process.env.TELEGRAM_WEBHOOK_SECRET,

  lookupClerkUserId: findClerkUserId,

  claimUpdate,
  releaseUpdate,

  handleKnownUser: ({ message, clerkUserId }) =>
    turnQueue.enqueue(`${clerkUserId}:${message.chat.id}`, () => runTurn({ clerkUserId, chatId: message.chat.id, message })),

  startAccountLink: async (input) => {
    await startAccountLink(input)
  }
}
