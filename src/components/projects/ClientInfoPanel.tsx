'use client'

/**
 * ClientInfoPanel — right-slide drawer showing client contact info
 * plus an editable project-level notes field.
 *
 * Notes are stored on Project.notes (not Client.notes) so they are
 * specific to this engagement.
 */

import { useState, useEffect } from 'react'
import { X, User, Mail, Phone, MapPin } from 'lucide-react'
import { ActivitySidebar } from './ActivitySidebar'

interface Client {
  name:           string
  contactName:    string | null
  contactEmail:   string | null
  contactPhone:   string | null
  billingAddress: string | null
  specialNotes:   string | null  // high-level client rules (read-only callout)
}

interface ClientInfoPanelProps {
  projectId: string
  client:    Client
  trigger:   React.ReactNode
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
  client,
  trigger,
}: ClientInfoPanelProps) {
  const [open, setOpen] = useState(false)

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

        {/* Body — activity feed fills the height; only the thread scrolls. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ActivitySidebar
            projectId={projectId}
            clientName={client.name}
            clientNotes={client.specialNotes}
            active={open}
          >
            {/* Contact info slot — rendered under the client-notes callout. */}
            <section style={{ padding: '16px 20px', borderBottom: '1px solid hsl(var(--border))' }}>
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
                <p style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))' }}>
                  No contact info on file for this client.
                </p>
              )}
            </section>
          </ActivitySidebar>
        </div>
      </div>
    </>
  )
}
