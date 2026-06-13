'use client'

/**
 * ClientInfoPanel — right-slide drawer showing client contact info
 * plus an editable project-level notes field.
 *
 * Notes are stored on Project.notes (not Client.notes) so they are
 * specific to this engagement.
 */

import { useState, useEffect, useTransition } from 'react'
import { X, User, Mail, Phone, MapPin, Globe, StickyNote, Loader2, CheckCircle2 } from 'lucide-react'
import { updateProjectNotes } from '@/server/actions/projects'

interface Client {
  name:           string
  contactName:    string | null
  contactEmail:   string | null
  contactPhone:   string | null
  billingAddress: string | null
  notes:          string | null  // client-level notes (read-only here)
}

interface ClientInfoPanelProps {
  projectId:    string
  projectName:  string
  projectNotes: string | null
  client:       Client
  trigger:      React.ReactNode
}

// ── Info row ────────────────────────────────────────────────────────────────

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: React.ElementType
  label: string
  value: string | null | undefined
  href?: string
}) {
  if (!value) return null
  return (
    <div className="flex gap-3 py-2.5 border-b last:border-0">
      <div className="mt-0.5 flex-shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-0.5">{label}</p>
        {href ? (
          <a
            href={href}
            className="text-sm text-primary hover:underline break-all"
            target={href.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm text-foreground break-words">{value}</p>
        )}
      </div>
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────────────

export function ClientInfoPanel({
  projectId,
  projectName,
  projectNotes,
  client,
  trigger,
}: ClientInfoPanelProps) {
  const [open, setOpen]           = useState(false)
  const [notes, setNotes]         = useState(projectNotes ?? '')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [isPending, startTransition] = useTransition()

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Re-sync notes when panel opens
  useEffect(() => {
    if (open) setNotes(projectNotes ?? '')
  }, [open, projectNotes])

  function handleSaveNotes() {
    setSaveState('saving')
    startTransition(async () => {
      await updateProjectNotes(projectId, notes)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    })
  }

  const hasClientInfo = client.contactName || client.contactEmail || client.contactPhone || client.billingAddress

  return (
    <>
      {/* Trigger */}
      <span onClick={() => setOpen(true)} style={{ display: 'contents', cursor: 'pointer' }}>
        {trigger}
      </span>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.35)',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'min(400px, 92vw)',
          background: 'hsl(var(--background))',
          zIndex: 1001,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.15)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.26s cubic-bezier(0.4,0,0.2,1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid hsl(var(--border))',
          flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))', marginBottom: 2 }}>
              Client
            </p>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'hsl(var(--foreground))' }}>
              {client.name}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 30, height: 30, borderRadius: 6,
              background: 'hsl(var(--muted))', border: 'none', cursor: 'pointer',
              color: 'hsl(var(--muted-foreground))',
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* ── Contact info ──────────────────────────────────────── */}
          <section style={{ marginBottom: 28 }}>
            <p style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))',
              marginBottom: 8,
            }}>
              Contact Info
            </p>

            {hasClientInfo ? (
              <div style={{ borderRadius: 10, border: '1px solid hsl(var(--border))', padding: '0 16px', background: 'hsl(var(--card))' }}>
                <InfoRow icon={User}    label="Contact name" value={client.contactName} />
                <InfoRow icon={Mail}    label="Email"         value={client.contactEmail}
                  href={client.contactEmail ? `mailto:${client.contactEmail}` : undefined}
                />
                <InfoRow icon={Phone}   label="Phone"         value={client.contactPhone}
                  href={client.contactPhone ? `tel:${client.contactPhone}` : undefined}
                />
                <InfoRow icon={MapPin}  label="Billing address" value={client.billingAddress} />
              </div>
            ) : (
              <div style={{
                borderRadius: 10, border: '1px dashed hsl(var(--border))',
                padding: '20px 16px', textAlign: 'center',
              }}>
                <User style={{ width: 20, height: 20, color: 'hsl(var(--muted-foreground))', opacity: 0.4, margin: '0 auto 8px' }} />
                <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  No contact info on file for this client.
                </p>
              </div>
            )}
          </section>

          {/* ── Project notes ──────────────────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))',
              }}>
                Project Notes
              </p>
              <span style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', opacity: 0.6 }}>
                Saved to {projectName}
              </span>
            </div>

            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setSaveState('idle') }}
              placeholder="Notes about this client relationship, deal terms, preferences…"
              rows={10}
              style={{
                width: '100%',
                borderRadius: 8,
                border: '1px solid hsl(var(--border))',
                background: 'hsl(var(--background))',
                padding: '10px 12px',
                fontSize: 13,
                color: 'hsl(var(--foreground))',
                resize: 'vertical',
                minHeight: 120,
                fontFamily: 'inherit',
                lineHeight: 1.6,
                outline: 'none',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'hsl(var(--ring))' }}
              onBlur={e => { e.target.style.borderColor = 'hsl(var(--border))' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              {saveState === 'saved' && (
                <span style={{ fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 style={{ width: 13, height: 13 }} />
                  Saved
                </span>
              )}
              <button
                onClick={handleSaveNotes}
                disabled={isPending || saveState === 'saving' || notes === (projectNotes ?? '')}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px',
                  borderRadius: 6,
                  border: 'none',
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isPending || notes === (projectNotes ?? '') ? 'not-allowed' : 'pointer',
                  opacity: isPending || notes === (projectNotes ?? '') ? 0.5 : 1,
                }}
              >
                {isPending ? <><Loader2 style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> Saving…</> : 'Save Notes'}
              </button>
            </div>
          </section>

          {/* ── Client notes (read-only) ───────────────────────── */}
          {client.notes && (
            <section style={{ marginTop: 28 }}>
              <p style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.1em', color: 'hsl(var(--muted-foreground))',
                marginBottom: 8,
              }}>
                Client Notes
              </p>
              <div style={{
                borderRadius: 8, background: 'hsl(var(--muted)/0.4)',
                border: '1px solid hsl(var(--border))',
                padding: '10px 12px',
                fontSize: 13, color: 'hsl(var(--muted-foreground))',
                lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {client.notes}
              </div>
              <p style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', opacity: 0.5, marginTop: 4 }}>
                These notes are shared across all projects for {client.name}.
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
