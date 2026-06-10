'use client'

/**
 * useConfirm — in-app replacement for window.confirm()
 *
 * Browser's native confirm() can be silenced by the user clicking
 * "Don't show again", which makes it always return false and breaks
 * every delete/action guarded by it. This hook renders a proper
 * React dialog instead, portalled to document.body so it works
 * inside any DOM context (table rows, overflow:hidden containers, etc.)
 *
 * Usage:
 *   const { confirm, ConfirmDialog } = useConfirm()
 *
 *   async function handleDelete() {
 *     if (!await confirm('Delete this item?')) return
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

interface ConfirmState {
  message:     string
  title?:      string
  confirmLabel?: string
  resolve:     (value: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)
  const [mounted, setMounted] = useState(false)
  // Keep a ref so callbacks always have the latest state
  const stateRef = useRef(state)
  stateRef.current = state

  // Avoid SSR mismatch — only portal after hydration
  useEffect(() => { setMounted(true) }, [])

  const confirm = useCallback((
    message: string,
    options?: { title?: string; confirmLabel?: string }
  ): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setState({ message, title: options?.title, confirmLabel: options?.confirmLabel, resolve })
    })
  }, [])

  function handleConfirm() {
    stateRef.current?.resolve(true)
    setState(null)
  }

  function handleCancel() {
    stateRef.current?.resolve(false)
    setState(null)
  }

  const dialog = state ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
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

        <div className="mt-5 flex gap-2.5 justify-end">
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

  // Portal to body so it works inside table rows, overflow:hidden containers, etc.
  const ConfirmDialog = mounted && dialog ? createPortal(dialog, document.body) : null

  return { confirm, ConfirmDialog }
}
