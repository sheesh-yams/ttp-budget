'use client'

import { useActionState, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SendHorizonal, Loader2 } from 'lucide-react'
import { addProjectComment, type ActivityComment } from '@/server/actions/comments'

interface Props {
  projectId: string
  /** Called with the freshly-created comment so the parent can append it optimistically. */
  onAdded:   (comment: ActivityComment) => void
}

type FormState = { error: string | null }

const MAX_HEIGHT = 160 // px — auto-grow cap before the textarea scrolls internally

export function CommentInput({ projectId, onAdded }: Props) {
  const [value, setValue]   = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const formRef     = useRef<HTMLFormElement>(null)

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const content = String(formData.get('content') ?? '').trim()
      if (!content) return { error: null }

      const res = await addProjectComment(projectId, content)
      if (!res.success) return { error: (res as { success: false; error: string }).error }

      onAdded(res.data)
      setValue('') // clear on success
      return { error: null }
    },
    { error: null },
  )

  // Auto-grow: reset to auto then snap to content height (capped).
  useLayoutEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  // Keep focus after a successful post so the user can keep typing.
  useEffect(() => {
    if (!isPending && value === '') textareaRef.current?.focus()
  }, [isPending, value])

  const canSubmit = value.trim().length > 0 && !isPending

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-1.5 border-t border-border bg-background px-3 py-3"
    >
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-2.5 py-2 shadow-sm transition-colors focus-within:border-violet-400 focus-within:ring-1 focus-within:ring-violet-200">
        <textarea
          ref={textareaRef}
          name="content"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            // Enter submits; Shift+Enter inserts a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (value.trim()) formRef.current?.requestSubmit()
            }
          }}
          rows={1}
          placeholder="Write a comment…"
          className="flex-1 resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/60 outline-none"
          style={{ maxHeight: MAX_HEIGHT }}
        />
        <button
          type="submit"
          disabled={!canSubmit}
          title="Send comment (Enter)"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white transition-all hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {isPending
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <SendHorizonal className="h-3.5 w-3.5" />}
        </button>
      </div>

      {state.error && (
        <p className="px-1 text-[11px] text-red-600">{state.error}</p>
      )}
      <p className="px-1 text-[10px] text-muted-foreground/50">
        <kbd className="font-sans">Enter</kbd> to send · <kbd className="font-sans">Shift+Enter</kbd> for a new line
      </p>
    </form>
  )
}
