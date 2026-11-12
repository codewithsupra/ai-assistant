import { Hono } from 'hono'
import { createTelegramRoutes } from './routes/telegram.js'
import { realTelegramDeps } from './routes/telegram-deps.js'

const app = new Hono()

app.get('/', (c) => c.text('Hello Hono!'))

// Telegram's webhook target: checks who is writing before anything reaches the agent.
app.route('/telegram', createTelegramRoutes(realTelegramDeps))

export default app
