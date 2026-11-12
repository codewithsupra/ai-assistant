import { Hono } from 'hono'
import { generateText } from 'ai'
import { neon } from '@neon/ai-sdk-provider'

// Cheap, fast model served by the Neon AI Gateway. Override with AI_MODEL.
const DEFAULT_MODEL = 'gemini-3-5-flash-lite'

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

export default app
