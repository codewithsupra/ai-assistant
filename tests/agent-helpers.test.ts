import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { trimHistory } from '../src/agent/history.js'
import { splitForTelegram } from '../src/agent/telegram-api.js'
import { createTurnQueue } from '../src/agent/turn-queue.js'

const msg = (role: 'user' | 'assistant', content: string) => ({ role, content })

describe('trimHistory', () => {
  it('keeps short conversations whole', () => {
    const h = [msg('user', 'a'), msg('assistant', 'b')]
    assert.deepEqual(trimHistory(h), h)
  })
  it('always starts on a user message', () => {
    const out = trimHistory([msg('assistant', 'x'), msg('user', 'a'), msg('assistant', 'b')], { maxMessages: 2, maxChars: 100, maxMessageChars: 100 })
    assert.equal(out[0].role, 'user')
  })
  it('keeps the newest messages when over budget', () => {
    const h = Array.from({ length: 10 }, (_, i) => msg(i % 2 === 0 ? 'user' : 'assistant', `m${i}`))
    const out = trimHistory(h, { maxMessages: 4, maxChars: 1000, maxMessageChars: 100 })
    assert.equal(out.at(-1)?.content, 'm9')
    assert.ok(out.length <= 4)
  })
  it('does not lose all memory to one very long answer', () => {
    const out = trimHistory([msg('user', 'q'), msg('assistant', 'x'.repeat(50_000))])
    assert.equal(out.length, 2)
    assert.ok(out[1].content.length < 7000)
  })
})

describe('splitForTelegram', () => {
  it('leaves short text alone', () => assert.deepEqual(splitForTelegram('hello'), ['hello']))
  it('splits long text into chunks within the limit, losing nothing', () => {
    const text = Array.from({ length: 800 }, (_, i) => `line ${i}`).join('\n')
    const parts = splitForTelegram(text)
    assert.ok(parts.length > 1)
    assert.ok(parts.every((p) => p.length <= 4096))
    assert.equal(parts.join('').replace(/\s/g, ''), text.replace(/\s/g, ''))
  })
})

describe('turn queue', () => {
  const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms))
  it('runs one conversation in order, one at a time', async () => {
    const q = createTurnQueue({ maxConcurrent: 4 })
    const log: string[] = []
    q.enqueue('c1', async () => { log.push('a-start'); await tick(20); log.push('a-end') })
    q.enqueue('c1', async () => { log.push('b-start'); log.push('b-end') })
    await q.drain()
    assert.deepEqual(log, ['a-start', 'a-end', 'b-start', 'b-end'])
  })
  it('runs different conversations in parallel but never above the cap', async () => {
    const q = createTurnQueue({ maxConcurrent: 2 })
    let live = 0, peak = 0
    for (let i = 0; i < 6; i++) q.enqueue(`c${i}`, async () => { live++; peak = Math.max(peak, live); await tick(15); live-- })
    await q.drain()
    assert.equal(peak, 2)
  })
  it('keeps going after a job throws', async () => {
    const q = createTurnQueue()
    let ran = false
    q.enqueue('c', async () => { throw new Error('boom') })
    q.enqueue('c', async () => { ran = true })
    await q.drain()
    assert.equal(ran, true)
  })
})
