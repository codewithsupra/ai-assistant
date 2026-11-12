// Usage: npm run set-webhook -- https://your-public-host
const base = process.argv[2]
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET

if (!base || !token || !secret) {
  console.error('Usage: npm run set-webhook -- <https-base-url> (needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET)')
  process.exit(1)
}

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: `${base.replace(/\/$/, '')}/webhook`,
    secret_token: secret,
    allowed_updates: ['message']
  })
})
console.log(await res.json())
