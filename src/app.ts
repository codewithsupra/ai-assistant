import { Hono } from 'hono'
import { timingSafeEqual } from 'node:crypto'

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number }
  }
}

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

const app = new Hono()

app.get('/', (c) => c.text('Hello Hono!'))

// Telegram webhook: echoes back whatever the user sent.
app.post('/webhook', async (c) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!secret) return c.json({ error: 'Webhook secret not configured' }, 500)

  const header = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? ''
  if (!safeEqual(header, secret)) return c.json({ error: 'Unauthorized' }, 401)

  let update: TelegramUpdate
  try {
    update = await c.req.json<TelegramUpdate>()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const message = update.message
  if (!message) return c.json({ ok: true }) // ignore non-message updates

  // Reply directly in the webhook response; copyMessage echoes any message type
  // (text, photo, sticker, ...) without needing an outbound request.
  return c.json({
    method: 'copyMessage',
    chat_id: message.chat.id,
    from_chat_id: message.chat.id,
    message_id: message.message_id
  })
})

export default app
