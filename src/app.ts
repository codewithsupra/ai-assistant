import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { freeMessageLimit } from './db/free-usage.js'
import { createSiteRoutes, botUsernameFromEnv } from './routes/site.js'
import { createTelegramRoutes } from './routes/telegram.js'
import { realTelegramDeps } from './routes/telegram-deps.js'

const app = new Hono()

// The only page is static HTML with inline styles: no scripts, no frames. The one outside load is the web font.
app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      styleSrc: ["'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ['https://fonts.gstatic.com'],
      imgSrc: ["'self'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"]
    }
  })
)

// Landing page and health check.
app.route('/', createSiteRoutes({ botUsername: () => botUsernameFromEnv(), freeChats: freeMessageLimit }))

// Telegram's webhook target: checks who is writing before anything reaches the agent.
app.route('/telegram', createTelegramRoutes(realTelegramDeps))

export default app
