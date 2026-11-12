import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createTelegramRoutes, type TelegramGatewayDeps } from '../src/routes/telegram.js'

const CLERK_USER = 'user_3M0JJZ0000000000000000000a'

const harness = (over: Partial<TelegramGatewayDeps> = {}) => {
  const calls: string[] = []
  const deps: TelegramGatewayDeps = {
    webhookSecret: () => 'secret',
    lookupClerkUserId: async (id) => (id === '7' ? CLERK_USER : null),
    claimUpdate: async () => true,
    releaseUpdate: async () => { calls.push('release') },
    hasRequiredPlan: async () => false,
    consumeFreeMessage: async () => false,
    sendUpgradePrompt: async () => { calls.push('upgrade') },
    handleKnownUser: () => { calls.push('agent') },
    startAccountLink: async () => { calls.push('link') },
    ...over
  }
  const app = createTelegramRoutes(deps)
  const post = (body: unknown, secret: string | null = 'secret') =>
    app.request('/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }) },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    })
  const dm = (userId: number, extra: Record<string, unknown> = {}) =>
    post({ update_id: 1, message: { message_id: 1, date: 1, text: 'hi', from: { id: userId, is_bot: false, first_name: 'x' }, chat: { id: userId, type: 'private' }, ...extra } })
  return { calls, post, dm }
}

describe('webhook security', () => {
  it('rejects a missing or wrong secret', async () => {
    const h = harness()
    assert.equal((await h.post({}, null)).status, 401)
    assert.equal((await h.post({}, 'nope')).status, 401)
    assert.deepEqual(h.calls, [])
  })
  it('fails closed when no secret is configured', async () => {
    assert.equal((await harness({ webhookSecret: () => undefined }).post({})).status, 500)
  })
  it('rejects invalid JSON', async () => {
    assert.equal((await harness().post('{not json')).status, 400)
  })
})

describe('what the gateway ignores', () => {
  const ignored = async (body: unknown) => {
    const h = harness()
    const res = await h.post(body)
    assert.equal(res.status, 200)
    assert.deepEqual(h.calls, [])
  }
  it('non-message updates', () => ignored({ update_id: 1, edited_message: {} }))
  it('group chats', () => ignored({ update_id: 1, message: { from: { id: 7, is_bot: false }, chat: { id: -100, type: 'group' } } }))
  it('channels', () => ignored({ update_id: 1, message: { from: { id: 7, is_bot: false }, chat: { id: -100, type: 'channel' } } }))
  it('other bots', () => ignored({ update_id: 1, message: { from: { id: 7, is_bot: true }, chat: { id: 7, type: 'private' } } }))
  it('a private chat whose id differs from the sender', () => ignored({ update_id: 1, message: { from: { id: 7, is_bot: false }, chat: { id: 8, type: 'private' } } }))
})

describe('account and plan gate', () => {
  it('sends a stranger through account linking, without any billing check', async () => {
    const h = harness({ hasRequiredPlan: async () => { throw new Error('billing must not run for strangers') } })
    await h.dm(9)
    assert.deepEqual(h.calls, ['link'])
  })
  it('lets a subscriber through and never spends a free chat', async () => {
    const h = harness({ hasRequiredPlan: async () => true, consumeFreeMessage: async () => { throw new Error('pro must not spend free chats') } })
    await h.dm(7)
    assert.deepEqual(h.calls, ['agent'])
  })
  it('lets a non-subscriber through while free chats remain', async () => {
    const h = harness({ consumeFreeMessage: async () => true })
    await h.dm(7)
    assert.deepEqual(h.calls, ['agent'])
  })
  it('sends the upgrade prompt, not the agent, once free chats run out', async () => {
    const h = harness()
    const body = await (await h.dm(7)).json()
    assert.deepEqual(h.calls, ['upgrade'])
    assert.equal(body.subscribed, false)
  })
  it('answers a redelivered update only once', async () => {
    const h = harness({ claimUpdate: async () => false })
    const body = await (await h.dm(7)).json()
    assert.deepEqual(h.calls, [])
    assert.equal(body.duplicate, true)
  })
})

describe('failures never let anyone through', () => {
  it('billing lookup failure: 502, update released for retry, agent not run', async () => {
    const h = harness({ hasRequiredPlan: async () => { throw new Error('clerk down') } })
    assert.equal((await h.dm(7)).status, 502)
    assert.deepEqual(h.calls, ['release'])
  })
  it('usage counter failure: 502, agent not run', async () => {
    const h = harness({ consumeFreeMessage: async () => { throw new Error('db down') } })
    assert.equal((await h.dm(7)).status, 502)
    assert.deepEqual(h.calls, ['release'])
  })
  it('upgrade message cannot be sent: 502 so Telegram retries', async () => {
    const h = harness({ sendUpgradePrompt: async () => { throw new Error('telegram down') } })
    assert.equal((await h.dm(7)).status, 502)
    assert.deepEqual(h.calls, ['release'])
  })
  it('identity lookup failure: 502, never treated as a stranger or a user', async () => {
    const h = harness({ lookupClerkUserId: async () => { throw new Error('db down') } })
    assert.equal((await h.dm(7)).status, 502)
    assert.deepEqual(h.calls, [])
  })
})
