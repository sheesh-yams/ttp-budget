'use client'

/**
 * useConfirm — in-app replacement for window.confirm()
 *
 * Supports a "Don't show again" checkbox. Pass a stable `key` string
 * to enable it — the preference is stored in localStorage per key,
 * so suppressing one dialog type never affects another.
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm()
 *
 *   async function handleDelete() {
 *     if (!await confirm('Delete this item?', { key: 'delete-line-item' })) return
 *     // proceed…
 *   }
 *
 *   return (
 *     <>
 *       {ConfirmDialog}
 *       …rest of component…
 *     </>
 *   )
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

const STORAGE_PREFIX = 'ttp_confirm_skip:'

function isSkipped(key: string) {
  try { return localStorage.getItem(STORAGE_PREFIX + key) === '1' } catch { return false }
}
function setSkipped(key: string) {
  try { localStorage.setItem(STORAGE_PREFIX + key, '1') } catch { /* noop */ }
}

interface ConfirmOptions {
  title?:        string
  confirmLabel?: string
  /**
   * Stable key for "Don't show again" persistence.
   * When provided, a checkbox appears and the preference is saved
   * to localStorage so the dialog is skipped on future calls.
   */
  key?:          string
}

interface ConfirmState {
  message:       string
  title?:        string
  confirmLabel?: string
  key?:          string
  resolve:       (value: boolean) => void
}

export function useConfirm() {
  const [state, setState]   = useState<ConfirmState | null>(null)
  const [mounted, setMounted] = useState(false)
  const [skipNext, setSkipNext] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => { setMounted(true) }, [])

  const confirm = useCallback((
    message: string,
    options?: ConfirmOptions
  ): Promise<boolean> => {
    // If user previously said "don't show again" for this key, auto-confirm
    if (options?.key && isSkipped(options.key)) {
      return Promise.resolve(true)
    }
    return new Promise<boolean>(resolve => {
      setSkipNext(false)
      setState({ message, title: options?.title, confirmLabel: options?.confirmLabel, key: options?.key, resolve })
    })
  }, [])

  function handleConfirm() {
    if (stateRef.current?.key && skipNext) {
      setSkipped(stateRef.current.key)
    }
    stateRef.current?.resolve(true)
    setState(null)
  }

  function handleCancel() {
    stateRef.current?.resolve(false)
    setState(null)
  }

  const dialog = state ? (
    <div
      // z-[1300] — see the matching comment in select.tsx: this is portaled to
      // document.body (below), so it must outrank DialogContent's z-[1200] to
      // stay visible when confirm() is called from inside an open modal.
      className="fixed inset-0 z-[1300] flex items-center justify-center"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={handleCancel}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl mx-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-[18px] w-[18px] text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-foreground leading-snug">
              {state.title ?? 'Are you sure?'}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              {state.message}
            </p>
          </div>
        </div>

        {/* Don't show again — only when a key is provided */}
        {state.key && (
          <label className="mt-4 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground select-none">
            <input
              type="checkbox"
              checked={skipNext}
              onChange={e => setSkipNext(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
            />
            Don&apos;t show again
          </label>
        )}

        <div className="mt-4 flex gap-2.5 justify-end">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-border px-4 py-1.5 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            {state.confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const ConfirmDialog = mounted && dialog ? createPortal(dialog, document.body) : null

  return { confirm, ConfirmDialog }
}
