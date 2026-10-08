// Batched saving for editors that autosave. Plain TS (no React) so the rules
// are unit-testable; src/lib/use-autosave.tsx wraps it for components.
//
// Rules (each guards against a real failure mode):
//   • queue(patch) merges into the pending patch and restarts the timer, so a
//     burst of edits becomes one save after `delay` ms of quiet.
//   • One save in flight at a time. Edits made while it runs wait and go out
//     after it — the last edit always wins, saves never land out of order.
//   • A failed save keeps its patch (under any newer edits) and stops; it is
//     never dropped. retry() / flush() send it again.
//   • flush() saves everything now and resolves when nothing is left — callers
//     await it before actions that read saved data (send, award, preview…).

export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

export type SaveResult = { success: boolean; error?: string }

export interface SaveQueueOptions<P extends object> {
  save:      (patch: P) => Promise<SaveResult>
  delay?:    number
  onChange?: (status: SaveStatus, error: string | null) => void
  /** After each successful save (e.g. to request a page refresh). */
  onSaved?:  () => void
  /**
   * Runs each save through a shared lock, so saves from different queues on
   * one page never overlap (server side effects — e.g. a memo save that
   * recomputes a fee — must not interleave with that fee's own save).
   */
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T>
}

export class SaveQueue<P extends object> {
  private pending: Partial<P> | null = null
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private failed = false
  status: SaveStatus = 'idle'
  error: string | null = null

  constructor(private opts: SaveQueueOptions<P>) {}

  setSave(save: SaveQueueOptions<P>['save']) { this.opts.save = save }

  /** Unsaved or saving — the page shouldn't refresh over it. */
  get busy(): boolean {
    return this.pending !== null || this.inFlight !== null
  }

  queue(patch: Partial<P>): void {
    this.pending = { ...(this.pending ?? {}), ...patch }
    this.failed = false
    if (!this.inFlight) this.set('dirty', null)
    this.schedule()
  }

  /** Save now; resolves once nothing is pending. True if everything saved. */
  async flush(): Promise<boolean> {
    this.clearTimer()
    this.failed = false
    // Loop: edits can arrive while a save is in flight.
    for (;;) {
      if (this.inFlight) { await this.inFlight; continue }
      if (this.failed) return false
      if (!this.pending) return this.status !== 'error'
      await this.run()
    }
  }

  retry(): Promise<boolean> { return this.flush() }

  /** Drop the pending patch (e.g. the row was deleted). */
  discard(): void {
    this.clearTimer()
    this.pending = null
    this.failed = false
    if (!this.inFlight) this.set('idle', null)
  }

  private schedule() {
    this.clearTimer()
    this.timer = setTimeout(() => { this.timer = null; void this.flush() }, this.opts.delay ?? 2500)
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  private run(): Promise<void> {
    const patch = this.pending as P
    this.pending = null
    this.set('saving', null)
    const p = (async () => {
      let res: SaveResult
      try {
        res = this.opts.exclusive
          ? await this.opts.exclusive(() => this.opts.save(patch))
          : await this.opts.save(patch)
      } catch (err) {
        res = { success: false, error: err instanceof Error ? err.message : 'Couldn’t save' }
      }
      if (res.success) {
        this.set(this.pending ? 'dirty' : 'saved', null)
        this.opts.onSaved?.()
      } else {
        // Keep it — newer edits win over the failed values field by field.
        this.pending = { ...patch, ...(this.pending ?? {}) }
        this.failed = true
        this.clearTimer()
        this.set('error', res.error ?? 'Couldn’t save')
      }
    })()
    this.inFlight = p.finally(() => { this.inFlight = null })
    return this.inFlight
  }

  private set(status: SaveStatus, error: string | null) {
    this.status = status
    this.error = error
    this.opts.onChange?.(status, error)
  }
}
