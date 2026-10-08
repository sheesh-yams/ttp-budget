import { SaveQueue, type SaveResult } from '@/lib/save-queue'

type Patch = { a?: number; b?: string }

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

const flushMicro = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }

describe('SaveQueue', () => {
  it('merges a burst of edits into one save after the delay', async () => {
    const save = jest.fn(async (_p: Patch): Promise<SaveResult> => ({ success: true }))
    const q = new SaveQueue<Patch>({ save, delay: 2500 })
    q.queue({ a: 1 })
    jest.advanceTimersByTime(1000)
    q.queue({ b: 'x' })
    jest.advanceTimersByTime(1000)
    q.queue({ a: 2 })
    expect(save).not.toHaveBeenCalled()
    jest.advanceTimersByTime(2500)
    await flushMicro()
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ a: 2, b: 'x' })
    expect(q.status).toBe('saved')
    expect(q.busy).toBe(false)
  })

  it('keeps one save in flight; edits made meanwhile go out after it (last write wins)', async () => {
    const first = deferred<SaveResult>()
    const calls: Patch[] = []
    const save = jest.fn(async (p: Patch) => { calls.push(p); return calls.length === 1 ? first.promise : { success: true } })
    const q = new SaveQueue<Patch>({ save, delay: 100 })
    q.queue({ a: 1 })
    const f1 = q.flush()
    await flushMicro()
    q.queue({ a: 2 })            // arrives while the first save is in flight
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve({ success: true })
    await f1                     // flush waits until nothing is pending
    expect(calls).toEqual([{ a: 1 }, { a: 2 }])
    expect(q.busy).toBe(false)
  })

  it('flush saves immediately and resolves true', async () => {
    const save = jest.fn(async () => ({ success: true }))
    const q = new SaveQueue<Patch>({ save, delay: 99999 })
    q.queue({ a: 5 })
    await expect(q.flush()).resolves.toBe(true)
    expect(save).toHaveBeenCalledWith({ a: 5 })
  })

  it('a failed save keeps its patch (newer edits win) and retry resends it', async () => {
    let fail = true
    const save = jest.fn(async () => (fail ? { success: false, error: 'nope' } : { success: true }))
    const q = new SaveQueue<Patch>({ save, delay: 100 })
    q.queue({ a: 1, b: 'old' })
    await expect(q.flush()).resolves.toBe(false)
    expect(q.status).toBe('error')
    expect(q.error).toBe('nope')
    expect(q.busy).toBe(true)
    fail = false
    q.queue({ b: 'new' })        // edit after the failure — merged over the failed values
    await expect(q.retry()).resolves.toBe(true)
    expect(save).toHaveBeenLastCalledWith({ a: 1, b: 'new' })
    expect(q.status).toBe('saved')
  })

  it('a throwing save is treated as a failure, not lost', async () => {
    const save = jest.fn(async () => { throw new Error('network') })
    const q = new SaveQueue<Patch>({ save, delay: 100 })
    q.queue({ a: 1 })
    await expect(q.flush()).resolves.toBe(false)
    expect(q.error).toBe('network')
    expect(q.busy).toBe(true)
  })

  it('discard drops pending edits', async () => {
    const save = jest.fn(async () => ({ success: true }))
    const q = new SaveQueue<Patch>({ save, delay: 100 })
    q.queue({ a: 1 })
    q.discard()
    jest.advanceTimersByTime(500)
    await flushMicro()
    expect(save).not.toHaveBeenCalled()
    expect(q.busy).toBe(false)
  })

  it('calls onSaved after each successful save', async () => {
    const onSaved = jest.fn()
    const q = new SaveQueue<Patch>({ save: async () => ({ success: true }), delay: 100, onSaved })
    q.queue({ a: 1 })
    await q.flush()
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('queues sharing an exclusive runner never save at the same time', async () => {
    let chain: Promise<unknown> = Promise.resolve()
    const exclusive = <T,>(fn: () => Promise<T>): Promise<T> => { const n = chain.then(fn, fn); chain = n.catch(() => undefined); return n }
    let running = 0, maxRunning = 0
    const save = async () => {
      running++; maxRunning = Math.max(maxRunning, running)
      await new Promise(r => setTimeout(r, 10))
      running--
      return { success: true }
    }
    jest.useRealTimers()
    const a = new SaveQueue<Patch>({ save, delay: 50, exclusive })
    const b = new SaveQueue<Patch>({ save, delay: 50, exclusive })
    a.queue({ a: 1 }); b.queue({ a: 2 })
    await Promise.all([a.flush(), b.flush()])
    expect(maxRunning).toBe(1)
  })
})
