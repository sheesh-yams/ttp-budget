'use client'

import { useState, useTransition } from 'react'
import { completeOnboarding } from '@/server/actions/workspace'

const PRESET_PRIMARIES = ['#5D00A4', '#0F172A', '#1D4ED8', '#059669', '#DC2626', '#000000']
const PRESET_ACCENTS   = ['#04FFCC', '#FFD400', '#F97316', '#A855F7', '#EC4899', '#FFFFFF']

export default function OnboardingPage() {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName]                 = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [primaryColor, setPrimary]      = useState('#5D00A4')
  const [accentColor, setAccent]        = useState('#04FFCC')
  const [error, setError]               = useState<string | null>(null)
  const [isPending, startTransition]    = useTransition()

  function handleFinish() {
    if (!name.trim()) { setError('Company name is required'); return }
    setError(null)
    startTransition(async () => {
      const result = await completeOnboarding({ name: name.trim(), contactEmail, primaryColor, accentColor })
      if (result && !result.success) setError(result.error)
    })
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-6"
      style={{ background: '#0A0612' }}
    >
      <div className="w-full max-w-md">
        {/* Logo mark */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-lg font-black"
            style={{ background: '#04FFCC', color: '#003D31' }}
          >
            {name.trim() ? name.trim()[0].toUpperCase() : 'T'}
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-white/30">
            {step === 1 ? 'Set up your workspace' : 'Brand colours'}
          </p>
        </div>

        {/* Step indicators */}
        <div className="mb-8 flex gap-2">
          {([1, 2] as const).map(s => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ background: step >= s ? '#04FFCC' : 'rgba(255,255,255,0.1)' }}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">
                Company name <span className="text-[#04FFCC]">*</span>
              </label>
              <input
                autoFocus
                type="text"
                placeholder="The Third Place Creative"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) setStep(2) }}
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">
                Contact email <span className="text-white/25">(optional)</span>
              </label>
              <input
                type="email"
                placeholder="hello@yourcompany.com"
                value={contactEmail}
                onChange={e => setContactEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && name.trim()) setStep(2) }}
                className="w-full rounded-lg border px-3.5 py-2.5 text-sm text-white placeholder-white/20 outline-none transition"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderColor: 'rgba(255,255,255,0.1)',
                }}
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={() => {
                if (!name.trim()) { setError('Company name is required'); return }
                setError(null)
                setStep(2)
              }}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
              style={{ background: '#04FFCC', color: '#003D31' }}
            >
              Continue →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            {/* Primary colour */}
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">
                Primary colour
              </label>
              <div className="mb-2 flex gap-2">
                {PRESET_PRIMARIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setPrimary(c)}
                    className="h-7 w-7 flex-shrink-0 rounded-md border-2 transition"
                    style={{
                      background: c,
                      borderColor: primaryColor === c ? '#04FFCC' : 'transparent',
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={e => setPrimary(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setPrimary(e.target.value) }}
                  className="w-28 rounded-md border px-2.5 py-1.5 text-xs font-mono text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <label className="mb-2 block text-xs font-medium text-white/50">
                Accent colour
              </label>
              <div className="mb-2 flex gap-2">
                {PRESET_ACCENTS.map(c => (
                  <button
                    key={c}
                    onClick={() => setAccent(c)}
                    className="h-7 w-7 flex-shrink-0 rounded-md border-2 transition"
                    style={{
                      background: c,
                      borderColor: accentColor === c ? '#04FFCC' : 'transparent',
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={accentColor}
                  onChange={e => setAccent(e.target.value)}
                  className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={e => { if (/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)) setAccent(e.target.value) }}
                  className="w-28 rounded-md border px-2.5 py-1.5 text-xs font-mono text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            {/* Live preview */}
            <div
              className="flex items-center gap-2.5 rounded-lg px-3.5 py-2.5"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div
                className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-[11px] font-black"
                style={{ background: accentColor, color: primaryColor }}
              >
                {name.trim()[0]?.toUpperCase() ?? 'T'}
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/90 leading-none">
                  {name.trim() || 'Your Company'}
                </p>
                <p className="mt-[3px] text-[9px] font-medium tracking-[0.08em] text-white/35 leading-none">
                  Workspace
                </p>
              </div>
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 rounded-lg border py-2.5 text-sm font-medium text-white/60 transition hover:text-white/90"
                style={{ borderColor: 'rgba(255,255,255,0.12)' }}
              >
                ← Back
              </button>
              <button
                onClick={handleFinish}
                disabled={isPending}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-50"
                style={{ background: '#04FFCC', color: '#003D31' }}
              >
                {isPending ? 'Setting up…' : 'Finish setup →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
