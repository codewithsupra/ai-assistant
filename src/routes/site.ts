import { Hono } from 'hono'
import qrcode from 'qrcode-generator'

// The public face of the project: a landing page people can open, plus a health check for the host.

const DEFAULT_BOT_USERNAME = 'cws_assist_bot'

export const botUsernameFromEnv = (env: Record<string, string | undefined> = process.env) => {
  const name = (env.TELEGRAM_BOT_USERNAME ?? DEFAULT_BOT_USERNAME).replace(/^@/, '')
  // Goes into HTML and a URL, so only accept what Telegram itself allows.
  return /^[A-Za-z0-9_]{5,32}$/.test(name) ? name : DEFAULT_BOT_USERNAME
}

const qrCache = new Map<string, string>()

// An inline SVG, so a desktop visitor can scan it with their phone. Cached per URL.
const qrSvg = (url: string) => {
  let svg = qrCache.get(url)
  if (!svg) {
    const qr = qrcode(0, 'M')
    qr.addData(url)
    qr.make()
    svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true })
    qrCache.set(url, svg)
  }
  return svg
}

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#f4c430"/><path d="M14 18a6 6 0 0 1 6-6h24a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H30l-10 9v-9a6 6 0 0 1-6-6z" fill="#101b16"/></svg>`

export const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap'

export const landingPage = (botUsername: string, freeChats: number) => {
  const botUrl = `https://t.me/${botUsername}`
  const appUrl = `tg://resolve?domain=${botUsername}`
  const title = 'Persona Assist: an AI assistant in Telegram'
  const description =
    'An assistant that lives in a Telegram chat. It looks things up, reads the files you send and builds documents for you.'

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
<meta name="theme-color" content="#e9ede6">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONT_STYLESHEET}">
<style>
:root{color-scheme:light;--ground:#e9ede6;--panel:#dbe3d6;--ink:#101b16;--muted:#4d5b53;--rule:#c5cfc0;--forest:#1e5a46;--signal:#f4c430;--white:#fff}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--ground);color:var(--ink);font:400 1.0625rem/1.55 "Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",sans-serif}
a{color:inherit}
a:focus-visible{outline:3px solid var(--forest);outline-offset:3px;border-radius:4px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}

.bar{display:flex;justify-content:space-between;align-items:baseline;padding:22px 0}
.bar strong{font-weight:700;letter-spacing:-.01em;font-size:1.1rem}
.bar a{color:var(--muted);text-underline-offset:3px}

.hero{display:grid;gap:48px;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:center;padding:40px 0 88px}
h1{font-weight:750;font-size:clamp(2.5rem,6.4vw,4.9rem);line-height:.98;letter-spacing:-.035em;margin:0 0 22px;max-width:11ch}
.lead{font-size:1.2rem;color:var(--muted);max-width:30em;margin:0 0 30px}
.cta-row{display:flex;flex-wrap:wrap;gap:16px 22px;align-items:center}
.btn{display:inline-block;background:var(--signal);color:var(--ink);font-weight:700;font-size:1.1rem;padding:16px 28px;border-radius:10px;text-decoration:none;box-shadow:0 3px 0 var(--ink);transition:transform .12s,box-shadow .12s}
.btn:hover{transform:translateY(2px);box-shadow:0 1px 0 var(--ink)}
.alt{color:var(--muted);font-size:.98rem}
.alt a{text-underline-offset:3px}
.scan{display:flex;gap:16px;align-items:center;margin-top:34px;color:var(--muted);font-size:.95rem;max-width:26em}
.scan svg{width:92px;height:92px;flex:none;background:var(--white);padding:8px;border-radius:8px}
.scan b{color:var(--ink);font-weight:600}

.chat{display:grid;gap:8px}
.thread{background:var(--panel);border-radius:28px;padding:18px 18px 22px}
.thread-head{display:flex;gap:10px;align-items:center;padding:2px 4px 16px;margin-bottom:6px;border-bottom:1px solid var(--rule)}
.avatar{width:34px;height:34px;border-radius:50%;background:var(--forest);color:var(--white);display:grid;place-items:center;font-weight:700;font-size:.95rem}
.thread-head b{display:block;line-height:1.2;font-size:.98rem}
.thread-head span{font-size:.8rem;color:var(--muted)}
.msg{max-width:min(31ch,86%);padding:10px 14px;border-radius:20px;line-height:1.4;font-size:1rem}
.me{justify-self:end;background:var(--forest);color:var(--white);border-bottom-right-radius:6px}
.bot{justify-self:start;background:var(--white);border-bottom-left-radius:6px}
.file{display:flex;gap:10px;align-items:center;margin-top:8px;padding:8px 10px;background:var(--panel);border-radius:10px;font-size:.9rem;font-weight:600}
.file i{width:26px;height:30px;border-radius:4px;background:var(--forest);flex:none;position:relative}
.file i::after{content:"";position:absolute;right:0;top:0;width:9px;height:9px;background:var(--panel);border-bottom-left-radius:4px}
.me .file{background:rgba(255,255,255,.16)}
.me .file i{background:var(--white)}
.me .file i::after{background:var(--forest)}

.hero .msg{opacity:0;animation:in .45s ease forwards}
.hero .msg:nth-child(2){animation-delay:.3s}
.hero .msg:nth-child(3){animation-delay:1.3s}
.hero .msg:nth-child(4){animation-delay:2.4s}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

section{padding:64px 0;border-top:1px solid var(--rule)}
h2{font-weight:700;font-size:clamp(1.7rem,3.4vw,2.4rem);line-height:1.05;letter-spacing:-.025em;margin:0 0 12px}
.sub{color:var(--muted);margin:0 0 40px;max-width:36em}
.row{display:grid;gap:28px 56px;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);align-items:center;padding:28px 0}
.row+.row{border-top:1px dashed var(--rule)}
.row h3{font-size:1.3rem;letter-spacing:-.015em;margin:0 0 6px;font-weight:700}
.row p{margin:0;color:var(--muted);max-width:26em}
.row .thread{padding:16px}

ol{margin:0;padding:0;list-style:none;display:grid;gap:0}
ol li{display:grid;grid-template-columns:56px minmax(0,1fr);gap:8px;padding:20px 0}
ol li+li{border-top:1px dashed var(--rule)}
ol .n{font-weight:750;font-size:2rem;line-height:1;letter-spacing:-.03em;color:var(--forest)}
ol b{font-weight:700}
ol span{display:block;color:var(--muted);max-width:34em}

.plans{display:grid;margin:0}
.plan{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:8px 56px;padding:24px 0;align-items:baseline}
.plan+.plan{border-top:1px dashed var(--rule)}
.plan dt{font-weight:750;font-size:clamp(1.5rem,3vw,2rem);letter-spacing:-.025em;line-height:1.1}
.plan dt small{display:block;font-size:1rem;font-weight:500;color:var(--muted);letter-spacing:0;margin-top:2px}
.plan dd{margin:0;color:var(--muted);max-width:30em}
.fine{color:var(--muted);font-size:.95rem;margin:18px 0 0}

.built{max-width:44em;margin:0}
.built+.built{margin-top:14px;color:var(--muted)}

footer{border-top:1px solid var(--rule);padding:28px 0 48px;display:flex;flex-wrap:wrap;gap:8px 28px;justify-content:space-between;color:var(--muted);font-size:.95rem}
footer a{text-underline-offset:3px}

@media (max-width:820px){
  .hero{grid-template-columns:minmax(0,1fr);gap:36px;padding:16px 0 56px}
  .row,.plan{grid-template-columns:minmax(0,1fr)}
  .scan{display:none}
  section{padding:48px 0}
}
@media (prefers-reduced-motion:reduce){.hero .msg{animation:none;opacity:1}.btn{transition:none}}
</style>
</head>
<body>
<div class="wrap">
<div class="bar"><strong>persona-assist</strong><a href="https://github.com/codewithsupra/ai-assistant">Source</a></div>

<main>
<div class="hero">
  <div>
    <h1>Your assistant lives in Telegram</h1>
    <p class="lead">Ask it to look something up, read a file you send, or build a document. It answers in the same chat, and remembers what you said earlier.</p>
    <div class="cta-row">
      <a class="btn" href="${botUrl}" target="_blank" rel="noopener">Open in Telegram</a>
      <span class="alt">or <a href="${appUrl}">open it in the app</a>, or search for <b>@${botUsername}</b></span>
    </div>
    <div class="scan">${qrSvg(botUrl)}<div><b>On a computer?</b> Point your phone camera at this code to open the chat.</div></div>
  </div>
  <div class="thread" aria-label="Example conversation">
    <div class="thread-head"><div class="avatar" aria-hidden="true">P</div><div><b>persona-assist</b><span>bot</span></div></div>
    <div class="chat">
      <div class="msg me">What is the cheapest way to get from Kolkata to Darjeeling this Saturday?</div>
      <div class="msg bot">I checked current fares and timetables. The overnight train is cheapest. I've listed all three options by price, with booking links.</div>
      <div class="msg me">Make that a one-page plan I can save.<div class="file"><i></i>darjeeling-trip.pdf</div></div>
    </div>
  </div>
</div>

<section aria-labelledby="does">
  <h2 id="does">What you can ask it</h2>
  <p class="sub">These are example conversations to show the idea. Yours will be about whatever you need.</p>

  <div class="row">
    <div><h3>Look things up</h3><p>Prices, listings, filings, timetables. It searches the live web when a fresh answer matters, instead of guessing.</p></div>
    <div class="thread"><div class="chat">
      <div class="msg me">Is the new iPhone cheaper on any site than Apple's own price?</div>
      <div class="msg bot">I compared five retailers today. Two undercut Apple, and I've linked both with the price difference.</div>
    </div></div>
  </div>

  <div class="row">
    <div><h3>Work with your files</h3><p>Send a spreadsheet, PDF or photo and ask about it. Ask for a chart or report and get the file back in the chat.</p></div>
    <div class="thread"><div class="chat">
      <div class="msg me">Which category grew most since March?<div class="file"><i></i>expenses.xlsx</div></div>
      <div class="msg bot">Travel, by a wide margin. Here is the chart.<div class="file"><i></i>growth-by-category.png</div></div>
    </div></div>
  </div>

  <div class="row">
    <div><h3>Build things</h3><p>Each user gets a private cloud computer that runs code, converts formats and drives a browser when the job needs one.</p></div>
    <div class="thread"><div class="chat">
      <div class="msg me">Turn these notes into a clean one-page PDF.</div>
      <div class="msg bot">Done. I kept your headings and turned the action items into a checklist.<div class="file"><i></i>notes.pdf</div></div>
    </div></div>
  </div>
</section>

<section aria-labelledby="start">
  <h2 id="start">Getting started</h2>
  <p class="sub">It takes about a minute, and you only do it once.</p>
  <ol>
    <li><span class="n">1</span><div><b>Open the bot and say hi.</b><span>Use the button at the top of this page.</span></div></li>
    <li><span class="n">2</span><div><b>Link your account.</b><span>The bot sends a short code and a sign-in link. Sign in with Google and approve.</span></div></li>
    <li><span class="n">3</span><div><b>Start asking.</b><span>Your first ${freeChats} chats each month are free.</span></div></li>
  </ol>
  <p class="fine">It only works in private chats. It ignores groups and channels.</p>
</section>

<section aria-labelledby="pricing">
  <h2 id="pricing">Pricing</h2>
  <dl class="plans">
    <div class="plan"><dt>Free<small>$0</small></dt><dd>${freeChats} chats every month, with everything the bot can do. The count resets on the first of the month.</dd></div>
    <div class="plan"><dt>Pro<small>$20 a month</small></dt><dd>No monthly limit. Upgrade from your account's billing page and cancel any time.</dd></div>
  </dl>
  <p class="fine">This is a live demo, so payments run in test mode and no real card is ever charged.</p>
</section>

<section aria-labelledby="built">
  <h2 id="built">How it's built</h2>
  <p class="built">Every Telegram message reaches a Hono gateway first. It checks who is writing, whether they have linked an account, and whether they have a plan or a free chat left. Only then does the assistant run.</p>
  <p class="built">TypeScript on Render. Claude through the Vercel AI SDK. Neon Postgres with Drizzle for conversations and usage. Clerk for sign-in and billing. Firecrawl for live lookups and Daytona for the per-user sandboxes.</p>
</section>
</main>

<footer><span>Built by Supratim Sarkar</span><a href="https://github.com/codewithsupra/ai-assistant">Source on GitHub</a></footer>
</div>
</body>
</html>`
}

export const createSiteRoutes = (options: { botUsername: () => string; freeChats: () => number }) => {
  const routes = new Hono()

  routes.get('/', (c) => c.html(landingPage(options.botUsername(), options.freeChats())))

  // Cheap on purpose: no database or third-party calls, so a host can poll it freely.
  // A chat bubble on the signal yellow, drawn inline so there is no image file to host.
  routes.get('/favicon.svg', (c) => {
    c.header('Cache-Control', 'public, max-age=86400')
    return c.body(FAVICON, 200, { 'Content-Type': 'image/svg+xml' })
  })

  routes.get('/health', (c) => c.json({ ok: true }))

  return routes
}
