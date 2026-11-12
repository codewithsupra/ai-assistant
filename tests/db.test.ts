// Runs against the real database in DATABASE_URL. Skipped when it is not set. Cleans up after itself.
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { inArray } from 'drizzle-orm'

const enabled = Boolean(process.env.DATABASE_URL)
const A = 'user_TESTFREEAAAAAAAAAAAAAAAAAA'
const B = 'user_TESTFREEBBBBBBBBBBBBBBBBBB'

describe('free chat allowance (real database)', { skip: !enabled && 'DATABASE_URL not set' }, async () => {
  const { consumeFreeMessage } = await import('../src/db/free-usage.js')
  const { db, freeUsage } = await import('../src/db/index.js')
  after(async () => {
    await db.delete(freeUsage).where(inArray(freeUsage.clerkUserId, [A, B]))
    process.exit(process.exitCode ?? 0)
  })

  it('allows exactly the limit, then blocks and stays blocked', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 5; i++) results.push(await consumeFreeMessage(A, 3))
    assert.deepEqual(results, [true, true, true, false, false])
  })
  it('gives every user their own allowance', async () => assert.equal(await consumeFreeMessage(B, 3), true))
  it('resets when the month changes', async () => assert.equal(await consumeFreeMessage(A, 3, new Date(Date.now() + 40 * 864e5)), true))
  it('never exceeds the limit under concurrent messages', async () => {
    const burst = await Promise.all(Array.from({ length: 12 }, () => consumeFreeMessage(B, 5)))
    assert.equal(burst.filter(Boolean).length, 4) // one already used above
  })
  it('a limit of 0 means no free chats', async () => assert.equal(await consumeFreeMessage(A, 0), false))
})
