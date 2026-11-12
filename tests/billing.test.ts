import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accountPortalBillingUrl, hasPlan, upgradeMessage } from '../src/agent/billing.js'

const USER = 'user_3M0JJZ0000000000000000000a'
const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
const sub = (slug: string, status: string) => ({ subscription_items: [{ status, plan: { slug } }] })
const deps = (fetch: typeof globalThis.fetch) => ({ secretKey: 'sk_test_x', fetch })

describe('hasPlan', () => {
  it('is true for an active pro item', async () => assert.equal(await hasPlan(USER, 'pro', deps(reply(200, sub('pro', 'active')))), true))
  it('is false for the free plan only', async () => assert.equal(await hasPlan(USER, 'pro', deps(reply(200, sub('free_user', 'active')))), false))
  it('is false for a canceled or upcoming pro item', async () => {
    assert.equal(await hasPlan(USER, 'pro', deps(reply(200, sub('pro', 'canceled')))), false)
    assert.equal(await hasPlan(USER, 'pro', deps(reply(200, sub('pro', 'upcoming')))), false)
  })
  it('is false when the user has no subscription at all (404)', async () => assert.equal(await hasPlan(USER, 'pro', deps(reply(404))), false))
  it('throws on any other failure, so callers fail closed', async () => {
    await assert.rejects(hasPlan(USER, 'pro', deps(reply(500))))
    await assert.rejects(hasPlan(USER, 'pro', deps(reply(401))))
  })
  it('rejects a malformed user id before calling Clerk', async () => {
    await assert.rejects(hasPlan('user_1/../../x', 'pro', deps(reply(200, sub('pro', 'active')))))
  })
  it('sends the secret key as a bearer token to the right user', async () => {
    let seen: { url: string; auth: string } | undefined
    const spy = (async (url: string, init: RequestInit) => {
      seen = { url, auth: (init.headers as Record<string, string>).Authorization }
      return new Response(JSON.stringify(sub('pro', 'active')))
    }) as unknown as typeof fetch
    await hasPlan(USER, 'pro', deps(spy))
    assert.equal(seen?.url, `https://api.clerk.com/v1/users/${USER}/billing/subscription`)
    assert.equal(seen?.auth, 'Bearer sk_test_x')
  })
})

describe('accountPortalBillingUrl', () => {
  it('reads the portal address from the instance and points at the billing tab', async () => {
    process.env.CLERK_PUBLISHABLE_KEY = 'pk_test_' + Buffer.from('demo-app-1234.clerk.accounts.dev$').toString('base64')
    const url = await accountPortalBillingUrl({ fetch: reply(200, { display_config: { user_profile_url: 'https://demo-app-1234.accounts.dev/user' } }) })
    assert.equal(url, 'https://demo-app-1234.accounts.dev/user/billing')
  })
})

describe('upgradeMessage', () => {
  it('mentions the free allowance and price', () => {
    const text = upgradeMessage(10)
    assert.match(text, /10 free chats/)
    assert.match(text, /\$20/)
  })
  it('is clear when there are no free chats at all', () => assert.doesNotMatch(upgradeMessage(0), /free chats/))
})
