'use client'

// Pill filter with a checkbox (or radio) popover — /projects and /proposals.

import { useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SL } from '@/components/shot-list/styles'

export function FilterChip({ label, options, selected, onChange, single = false, searchable = false }: {
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (v: string[]) => void
  single?: boolean
  searchable?: boolean
}) {
  const [q, setQ] = useState('')
  const on = selected.length > 0
  const first = options.find(o => o.value === selected[0])?.label
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={`${SL.chip} ${on ? SL.chipOn : SL.chipOff}`}>
          {on ? <>{label}: <b className="font-medium">{selected.length === 1 ? first : `${selected.length}`}</b></> : label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 rounded-[4px] p-1.5">
        {searchable && options.length > 8 && (
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} className={`${SL.input} mb-1.5`} />
        )}
        <div className="max-h-72 overflow-y-auto">
          {shown.map(o => {
            const checked = selected.includes(o.value)
            return (
              <label key={o.value} className="flex cursor-pointer items-center gap-2.5 rounded-[3px] px-2 py-1.5 text-sm hover:bg-[#FAF9F7]">
                <input
                  type={single ? 'radio' : 'checkbox'} name={single ? `f-${label}` : undefined} checked={checked}
                  onChange={() => onChange(single ? (checked ? [] : [o.value]) : checked ? selected.filter(v => v !== o.value) : [...selected, o.value])}
                  className="accent-[var(--brand-primary,#5D00A4)]"
                />
                <span className="truncate">{o.label}</span>
              </label>
            )
          })}
          {shown.length === 0 && <p className={`px-2 py-2 text-sm ${SL.mut}`}>No matches</p>}
        </div>
        {on && (
          <button type="button" onClick={() => onChange([])} className={`mt-1 w-full rounded-[3px] px-2 py-1.5 text-left text-[13px] ${SL.t2} hover:bg-[#FAF9F7]`}>Clear {label.toLowerCase()}</button>
        )}
      </PopoverContent>
    </Popover>
  )
}
