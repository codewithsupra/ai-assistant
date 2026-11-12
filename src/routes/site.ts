import { Hono } from 'hono'

// The public face of the project: a landing page people can open, plus a health check for the host.

const DEFAULT_BOT_USERNAME = 'cws_assist_bot'

export const botUsernameFromEnv = (env: Record<string, string | undefined> = process.env) => {
  const name = (env.TELEGRAM_BOT_USERNAME ?? DEFAULT_BOT_USERNAME).replace(/^@/, '')
  // Goes into HTML and a URL, so only accept what Telegram itself allows.
  return /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : DEFAULT_BOT_USERNAME
}

export const landingPage = (botUsername: string, freeChats: number) => {
  const botUrl = `https://t.me/${botUsername}`
  const title = 'Persona Assist: an AI assistant in your Telegram'
  const description =
    'Chat with an AI assistant that looks up live prices and listings, analyses your files, builds documents for you and remembers the conversation. All inside Telegram.'

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#0b1020">
<style>
:root{--bg:#f7f8fb;--card:#fff;--ink:#12172a;--muted:#5a6280;--line:#e3e6f0;--accent:#2a6df4;--accent-ink:#fff;--soft:#eaf0fe}
@media (prefers-color-scheme:dark){:root{--bg:#0b1020;--card:#131a30;--ink:#eef1fb;--muted:#9aa3c4;--line:#232c4a;--accent:#6b9bff;--accent-ink:#0b1020;--soft:#18213f}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:880px;margin:0 auto;padding:0 16px 64px}
header{padding:72px 0 40px;text-align:center}
h1{font-size:clamp(2rem,6vw,3.2rem);line-height:1.1;margin:0 0 16px;letter-spacing:-.02em}
h2{font-size:1.35rem;margin:56px 0 16px}
.lead{font-size:1.15rem;color:var(--muted);max-width:620px;margin:0 auto 28px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);padding:14px 26px;border-radius:12px;font-weight:600;text-decoration:none}
.btn:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.note{color:var(--muted);font-size:.9rem;margin-top:14px}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(340px,100%),1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px}
.card h3{margin:0 0 6px;font-size:1.05rem}
.card p{margin:0;color:var(--muted)}
ol{padding-left:0;list-style:none;counter-reset:s;display:grid;gap:12px}
ol li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px 18px 64px;position:relative}
ol li::before{content:counter(s);position:absolute;left:18px;top:16px;width:32px;height:32px;border-radius:50%;background:var(--soft);color:var(--accent);display:grid;place-items:center;font-weight:700}
.price{font-size:2rem;font-weight:700;margin:4px 0 8px}
.price small{font-size:1rem;color:var(--muted);font-weight:400}
ul{margin:8px 0 0;padding-left:20px;color:var(--muted)}
.stack{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.stack li{background:var(--soft);color:var(--ink);padding:6px 12px;border-radius:999px;font-size:.9rem}
footer{margin-top:56px;color:var(--muted);font-size:.9rem;text-align:center}
footer a{color:var(--accent)}
</style>
</head>
<body>
<main>
<header>
  <h1>An AI assistant that lives in your Telegram</h1>
  <p class="lead">Ask it anything. It looks up live prices and listings, reads and builds files for you, and remembers the conversation. No app to install.</p>
  <a class="btn" href="${botUrl}">Open @${botUsername} in Telegram</a>
  <p class="note">Free to try: ${freeChats} chats a month. Pro is $20/month.</p>
</header>

<section aria-labelledby="what">
  <h2 id="what">What it can do</h2>
  <div class="grid">
    <div class="card"><h3>Looks things up for you</h3><p>Ticket prices, listings, company filings, flights and more. It decides on its own when live data will give a better answer.</p></div>
    <div class="card"><h3>Works with your files</h3><p>Send a spreadsheet, PDF or photo and ask about it. Ask for a report, chart or document and get the file back in the chat.</p></div>
    <div class="card"><h3>Has its own computer</h3><p>A private cloud sandbox per user runs code, converts formats and operates a browser when a task needs one.</p></div>
    <div class="card"><h3>Remembers the chat</h3><p>Pick up where you left off. Your conversation is stored against your account, not shared with anyone else.</p></div>
  </div>
</section>

<section aria-labelledby="how">
  <h2 id="how">How it works</h2>
  <ol>
    <li><strong>Open the bot</strong> in Telegram and say hello.</li>
    <li><strong>Connect your account.</strong> The bot sends a short code and a sign-in link. Sign in with Google and approve. It takes under a minute.</li>
    <li><strong>Start chatting.</strong> Your first ${freeChats} chats each month are free. After that, upgrade to Pro from your account's billing page.</li>
  </ol>
  <p class="note">Private chats only: the bot ignores groups and channels.</p>
</section>

<section aria-labelledby="pricing">
  <h2 id="pricing">Pricing</h2>
  <div class="grid">
    <div class="card"><h3>Free</h3><div class="price">$0</div><ul><li>${freeChats} chats every month</li><li>Everything the bot can do</li></ul></div>
    <div class="card"><h3>Pro</h3><div class="price">$20<small> / month</small></div><ul><li>Chat without the monthly limit</li><li>Cancel any time from your account</li></ul></div>
  </div>
  <p class="note">This is a live demo, so payments run in test mode and no real card is ever charged.</p>
</section>

<section aria-labelledby="built">
  <h2 id="built">How it's built</h2>
  <ul class="stack">
    <li>Hono</li><li>TypeScript</li><li>Vercel AI SDK</li><li>Claude</li><li>Neon Postgres</li><li>Drizzle ORM</li><li>Clerk (sign-in and billing)</li><li>Firecrawl</li><li>Daytona sandboxes</li><li>Render</li>
  </ul>
  <p class="note">Every Telegram message first hits a Hono gateway that checks who is writing, whether they have an account and whether they have a plan or free chats left, before the agent runs.</p>
</section>

<footer>Built by Supratim Sarkar &middot; <a href="https://github.com/codewithsupra/ai-assistant">Source on GitHub</a></footer>
</main>
</body>
</html>`
}

export const createSiteRoutes = (options: { botUsername: () => string; freeChats: () => number }) => {
  const routes = new Hono()

  routes.get('/', (c) => c.html(landingPage(options.botUsername(), options.freeChats())))

  // Cheap on purpose: no database or third-party calls, so a host can poll it freely.
  routes.get('/health', (c) => c.json({ ok: true }))

  return routes
}
