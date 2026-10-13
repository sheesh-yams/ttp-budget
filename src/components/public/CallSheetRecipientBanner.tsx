'use client'

// Top of the crew page when opened from someone's own email link:
// their call time and a "Confirm I'll be there" button.

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { confirmCallSheetAttendance } from '@/server/actions/call-sheet-public'

export function CallSheetRecipientBanner({ sheetToken, recipientToken, firstName, callLabel, callTime, role, confirmed, highlight }: {
  sheetToken: string
  recipientToken: string
  firstName: string
  callLabel: string
  callTime: string
  role: string | null
  confirmed: boolean
  /** Opened from the email's Confirm button — draw the eye to it. */
  highlight: boolean
}) {
  const [isConfirmed, setConfirmed] = useState(confirmed)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function confirm() {
    setError(null)
    start(async () => {
      const res = await confirmCallSheetAttendance(sheetToken, recipientToken)
      if (res.success) setConfirmed(true)
      else setError((res as { success: false; error: string }).error)
    })
  }

  return (
    <div className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-sm text-gray-600">Hi {firstName || 'there'} —</p>
          <p className="text-lg font-bold text-gray-900">
            {callLabel}: <span className="font-mono">{callTime}</span>
            {role && <span className="ml-2 text-sm font-normal text-gray-500">{role}</span>}
          </p>
        </div>
        {isConfirmed ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <Check className="h-4 w-4" /> Confirmed — thanks!
          </p>
        ) : (
          <div className="text-right">
            <button
              type="button" onClick={confirm} disabled={pending}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${highlight ? 'bg-violet-700 ring-4 ring-violet-200' : 'bg-violet-700 hover:bg-violet-800'}`}
            >
              {pending ? 'Confirming…' : 'Confirm I’ll be there'}
            </button>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
