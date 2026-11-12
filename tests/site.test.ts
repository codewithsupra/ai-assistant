import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { botUsernameFromEnv, createSiteRoutes } from '../src/routes/site.js'

const app = createSiteRoutes({ botUsername: () => 'cws_assist_bot', freeChats: () => 10 })

describe('landing page', () => {
  it('serves HTML with a link to the bot and the real free allowance', async () => {
    const res = await app.request('/')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /text\/html/)
    const html = await res.text()
    assert.match(html, /href="https:\/\/t\.me\/cws_assist_bot"/)
    assert.match(html, /10 chats/)
    assert.match(html, /<title>[^<]+<\/title>/)
    assert.match(html, /test mode/)
  })
  it('loads nothing from other sites and runs no scripts', async () => {
    const html = await (await app.request('/')).text()
    assert.doesNotMatch(html, /<script/i)
    assert.doesNotMatch(html, /(src|href)="https?:\/\/(?!t\.me\/|github\.com\/codewithsupra\/)/i)
  })
})

describe('health', () => {
  it('answers ok without touching anything else', async () => {
    const res = await app.request('/health')
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true })
  })
})

describe('botUsernameFromEnv', () => {
  it('uses the configured name and strips a leading @', () => assert.equal(botUsernameFromEnv({ TELEGRAM_BOT_USERNAME: '@my_bot_1' }), 'my_bot_1'))
  it('falls back to the default and never lets markup through', () => {
    assert.equal(botUsernameFromEnv({}), 'cws_assist_bot')
    assert.equal(botUsernameFromEnv({ TELEGRAM_BOT_USERNAME: '"><script>x</script>' }), 'cws_assist_bot')
  })
})
