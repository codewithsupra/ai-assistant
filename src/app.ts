import { Hono } from 'hono'
import { generateText } from 'ai'
import { neon } from '@neon/ai-sdk-provider'
import { timingSafeEqual } from 'node:crypto'

type TelegramUpdate = {
  update_id: number
  message?: {
    message_id: number
    chat: { id: number }
    text?: string
  }
}

// Cheap, fast model served by the Neon AI Gateway. Override with AI_MODEL.
const DEFAULT_MODEL = 'gemini-3-5-flash-lite'
const TELEGRAM_MAX_LENGTH = 4096

const safeEqual = (a: string, b: string) => {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

const generateReply = async (prompt: string) => {
  const { text } = await generateText({
    model: neon(process.env.AI_MODEL ?? DEFAULT_MODEL),
    instructions:
      'You are a helpful assistant chatting in Telegram. Keep answers short and plain-text.',
    prompt,
    maxOutputTokens: 500,
    timeout: 25_000
  })
  return text.trim().slice(0, TELEGRAM_MAX_LENGTH) || "I couldn't come up with a reply."
}

const app = new Hono()

app.get('/', (c) => c.text('Hello Hono!'))

// TEMPORARY public test route: generates text with the AI SDK. Remove when done testing.
app.get('/test/ai', async (c) => {
  const prompt = c.req.query('prompt') ?? 'Say hello in one short sentence.'
  if (prompt.length > 500) return c.json({ error: 'prompt must be 500 characters or fewer' }, 400)

  const modelId = process.env.AI_MODEL ?? DEFAULT_MODEL
  try {
    const { text, usage } = await generateText({
      model: neon(modelId),
      instructions: 'You are a helpful assistant. Keep answers short.',
      prompt,
      maxOutputTokens: 300,
      timeout: 25_000
    })
    return c.json({ model: modelId, text: text.trim(), usage })
  } catch (err) {
    console.error('Test AI route failed:', err)
    return c.json({ error: 'Failed to generate text' }, 502)
  }
})

// Telegram webhook: replies to each message with an AI-generated answer.
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

  let text: string
  if (!message.text) {
    text = 'I can only reply to text messages for now.'
  } else {
    try {
      text = await generateReply(message.text)
    } catch (err) {
      console.error('AI generation failed:', err)
      text = 'Sorry, I could not generate a reply right now. Please try again later.'
    }
  }

  // Always answer 200 so Telegram does not retry; reply via the webhook response.
  return c.json({
    method: 'sendMessage',
    chat_id: message.chat.id,
    text,
    reply_parameters: { message_id: message.message_id }
  })
})

export default app
